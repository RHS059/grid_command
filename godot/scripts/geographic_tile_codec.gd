extends RefCounted
class_name GeographicTileCodec

const MAGIC := "GCGEO001"
const MAX_TILE_BYTES := 67108864
const MAX_PIECES := 4096
const MAX_VERTICES := 24576
const MAX_INDICES := 24576
const KINDS := ["ground", "water", "roads", "highways", "buildings", "edges"]

## Pure worker-thread decoder. No scene or RenderingServer access is needed.
static func decode(bytes: PackedByteArray, exclusions: Array[Rect2] = [], cancelled: Callable = Callable()) -> Dictionary:
	if bytes.size() < 28 or bytes.size() > MAX_TILE_BYTES or bytes.slice(0,8).get_string_from_ascii() != MAGIC:
		return {"error":"Invalid geographic tile header."}
	var address := Vector3i(bytes.decode_u32(8), bytes.decode_u32(12), bytes.decode_u32(16))
	var count := bytes.decode_u32(20)
	if address.x < 0 or address.x > 22 or address.y < 0 or address.z < 0 or address.y >= (1 << address.x) or address.z >= (1 << address.x) or count > MAX_PIECES:
		return {"error":"Invalid geographic tile address or piece count."}
	var offset := 28
	var pieces: Array = []
	for _piece in range(count):
		if cancelled.is_valid() and cancelled.call():
			return {"cancelled":true}
		if offset + 16 > bytes.size():
			return {"error":"Truncated geographic batch header."}
		var role := bytes.decode_u32(offset)
		var vertex_count := bytes.decode_u32(offset+4)
		var index_count := bytes.decode_u32(offset+8)
		var has_colors := bytes.decode_u32(offset+12)
		offset += 16
		if role >= KINDS.size() or vertex_count > MAX_VERTICES or index_count > MAX_INDICES or index_count % 3 != 0 or has_colors > 1:
			return {"error":"Invalid geographic batch counts."}
		var byte_count := vertex_count*12 + index_count*4 + (vertex_count*16 if has_colors else 0)
		if offset + byte_count > bytes.size():
			return {"error":"Truncated geographic batch data."}
		var positions := PackedVector3Array()
		positions.resize(vertex_count)
		for i in range(vertex_count):
			var point := Vector3(bytes.decode_float(offset),bytes.decode_float(offset+4),bytes.decode_float(offset+8))
			if not point.is_finite():
				return {"error":"Nonfinite geographic position."}
			positions[i] = point
			offset += 12
			if i % 1024 == 0 and cancelled.is_valid() and cancelled.call():
				return {"cancelled":true}
		var indices := PackedInt32Array()
		indices.resize(index_count)
		for i in range(index_count):
			var index := bytes.decode_u32(offset)
			if index >= vertex_count:
				return {"error":"Geographic index exceeds the vertex array."}
			indices[i] = index
			offset += 4
		var colors := PackedColorArray()
		if has_colors:
			colors.resize(vertex_count)
			for i in range(vertex_count):
				var color := Color(bytes.decode_float(offset),bytes.decode_float(offset+4),bytes.decode_float(offset+8),bytes.decode_float(offset+12))
				if not is_finite(color.r) or not is_finite(color.g) or not is_finite(color.b) or not is_finite(color.a):
					return {"error":"Nonfinite geographic color."}
				colors[i] = color
				offset += 16
		var batch := {"role":role,"positions":positions,"indices":indices,"colors":colors}
		if role != 0 and not exclusions.is_empty():
			batch = _exclude(batch, exclusions, cancelled)
			if batch.get("cancelled",false):
				return batch
		if not batch["indices"].is_empty():
			pieces.append(batch)
	if offset != bytes.size():
		return {"error":"Geographic tile has unexpected trailing data."}
	return {"address":address,"pieces":pieces,"resolution":bytes.decode_u32(24)}

static func _exclude(batch: Dictionary, exclusions: Array[Rect2], cancelled: Callable) -> Dictionary:
	var positions: PackedVector3Array = batch["positions"]
	var indices: PackedInt32Array = batch["indices"]
	var colors: PackedColorArray = batch["colors"]
	var minimum := Vector2(INF,INF)
	var maximum := Vector2(-INF,-INF)
	for point in positions:
		minimum = minimum.min(Vector2(point.x,point.z))
		maximum = maximum.max(Vector2(point.x,point.z))
	var relevant: Array[Rect2] = []
	for rect in exclusions:
		if minimum.x < rect.end.x and maximum.x > rect.position.x and minimum.y < rect.end.y and maximum.y > rect.position.y:
			relevant.append(rect)
	if relevant.is_empty():
		return batch
	var output_positions := PackedVector3Array()
	var output_indices := PackedInt32Array()
	var output_colors := PackedColorArray()
	for start in range(0,indices.size(),3):
		if start % 768 == 0 and cancelled.is_valid() and cancelled.call():
			return {"cancelled":true}
		var polygon: Array = []
		for i in range(3):
			var index := indices[start+i]
			polygon.append([positions[index], colors[index] if not colors.is_empty() else Color.WHITE])
		var parts: Array = [polygon]
		for rectangle in relevant:
			var next_parts: Array = []
			for part in parts:
				if not _overlaps(part,rectangle):
					next_parts.append(part)
					continue
				var inside: Array = part
				for side in range(4):
					var outside := _clip(inside,rectangle,side,false)
					if outside.size() >= 3:
						next_parts.append(outside)
					inside = _clip(inside,rectangle,side,true)
					if inside.size() < 3:
						break
			parts = next_parts
		for part in parts:
			for i in range(1,part.size()-1):
				for vertex in [part[0],part[i],part[i+1]]:
					output_indices.append(output_positions.size())
					output_positions.append(vertex[0])
					if not colors.is_empty():
						output_colors.append(vertex[1])
	return {"role":batch["role"],"positions":output_positions,"indices":output_indices,"colors":output_colors}

static func _overlaps(polygon: Array, rect: Rect2) -> bool:
	var minimum := Vector2(INF,INF)
	var maximum := Vector2(-INF,-INF)
	for vertex in polygon:
		var p: Vector3 = vertex[0]
		minimum = minimum.min(Vector2(p.x,p.z))
		maximum = maximum.max(Vector2(p.x,p.z))
	return minimum.x < rect.end.x and maximum.x > rect.position.x and minimum.y < rect.end.y and maximum.y > rect.position.y

static func _distance(point: Vector3, rect: Rect2, side: int) -> float:
	match side:
		0: return point.x-rect.position.x
		1: return rect.end.x-point.x
		2: return point.z-rect.position.y
		_: return rect.end.y-point.z

static func _clip(input: Array, rect: Rect2, side: int, keep_inside: bool) -> Array:
	var output: Array = []
	var sign_value := 1.0 if keep_inside else -1.0
	for i in range(input.size()):
		var a: Array = input[i]
		var b: Array = input[(i+1)%input.size()]
		var da := _distance(a[0],rect,side)*sign_value
		var db := _distance(b[0],rect,side)*sign_value
		if da >= 0.0:
			output.append(a)
		if (da >= 0.0) != (db >= 0.0):
			var t := da/(da-db)
			var pa: Vector3 = a[0]
			var ca: Color = a[1]
			output.append([pa.lerp(b[0],t),ca.lerp(b[1],t)])
	return output
