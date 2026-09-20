extends RefCounted
class_name GeographicMVT

## Bounds-checked Mapbox Vector Tile / protobuf decoder. Runs only on a worker.
const MAX_BYTES := 16777216
const MAX_FEATURES := 100000
const MAX_POINTS := 500000
const LAYERS := ["water","waterway","transportation","building","place"]

class Reader:
	extends RefCounted
	var bytes: PackedByteArray
	var cursor := 0
	var error := ""
	func _init(input: PackedByteArray) -> void:
		bytes = input
	func integer() -> int:
		var result := 0
		for shift in range(0,70,7):
			if cursor >= bytes.size():
				error = "Truncated protobuf varint."
				return 0
			var byte := int(bytes[cursor])
			cursor += 1
			if shift == 63 and byte > 1:
				error = "Protobuf varint overflow."
				return 0
			result |= (byte & 127) << shift
			if byte < 128:
				return result
		error = "Protobuf varint overflow."
		return 0
	func field() -> Array:
		var tag := integer()
		var wire := tag & 7
		var number := tag >> 3
		if number <= 0:
			error = "Invalid protobuf field number."
			return []
		if wire == 0:
			return [number,wire,integer()]
		var count := 8 if wire == 1 else 4 if wire == 5 else integer() if wire == 2 else -1
		if count < 0 or count > bytes.size()-cursor:
			error = "Invalid protobuf field length or wire type."
			return []
		var value := bytes.slice(cursor,cursor+count)
		cursor += count
		return [number,wire,value]

static func decode(bytes: PackedByteArray, cancelled: Callable = Callable()) -> Dictionary:
	if bytes.is_empty() or bytes.size() > MAX_BYTES:
		return {"error":"Invalid vector tile size."}
	var reader := Reader.new(bytes)
	var layers: Dictionary = {}
	var feature_total := 0
	while reader.cursor < bytes.size() and reader.error.is_empty():
		if cancelled.is_valid() and cancelled.call():
			return {"cancelled":true}
		var field := reader.field()
		if field.size() != 3:
			break
		if field[0] == 3 and field[1] == 2:
			var layer := _layer(field[2],cancelled)
			if layer.has("error") or layer.has("cancelled"):
				return layer
			if not layer.is_empty():
				feature_total += layer["features"].size()
				if feature_total > MAX_FEATURES:
					return {"error":"Vector tile feature limit exceeded."}
				layers[layer["name"]] = layer
	if not reader.error.is_empty():
		return {"error":reader.error}
	return {"layers":layers}

static func _layer(bytes: PackedByteArray, cancelled: Callable) -> Dictionary:
	var reader := Reader.new(bytes)
	var name := ""
	var extent := 4096
	var keys: Array[String] = []
	var values: Array = []
	var encoded: Array = []
	while reader.cursor < bytes.size() and reader.error.is_empty():
		var field := reader.field()
		if field.size() != 3:
			break
		if field[0] == 1 and field[1] == 2:
			name = field[2].get_string_from_utf8()
		elif field[0] == 2 and field[1] == 2:
			encoded.append(field[2])
		elif field[0] == 3 and field[1] == 2:
			keys.append(field[2].get_string_from_utf8())
		elif field[0] == 4 and field[1] == 2:
			var value := _value(field[2])
			if value.has("error"):
				return value
			values.append(value.get("value"))
		elif field[0] == 5 and field[1] == 0:
			extent = int(field[2])
	if not reader.error.is_empty():
		return {"error":reader.error}
	if not name in LAYERS:
		return {}
	if extent < 1 or extent > 1048576 or encoded.size() > MAX_FEATURES:
		return {"error":"Invalid vector tile layer limits."}
	var features: Array = []
	for raw in encoded:
		if cancelled.is_valid() and cancelled.call():
			return {"cancelled":true}
		var feature := _feature(raw,keys,values)
		if feature.has("error"):
			return feature
		features.append(feature)
	return {"name":name,"extent":extent,"features":features}

static func _value(bytes: PackedByteArray) -> Dictionary:
	var reader := Reader.new(bytes)
	var value: Variant = null
	while reader.cursor < bytes.size() and reader.error.is_empty():
		var field := reader.field()
		if field.size() != 3:
			break
		if field[0] == 1 and field[1] == 2:
			value = field[2].get_string_from_utf8()
		elif field[0] == 2 and field[1] == 5:
			value = field[2].decode_float(0)
		elif field[0] == 3 and field[1] == 1:
			value = field[2].decode_double(0)
		elif field[0] in [4,5] and field[1] == 0:
			value = field[2]
		elif field[0] == 6 and field[1] == 0:
			value = _zigzag(field[2])
		elif field[0] == 7 and field[1] == 0:
			value = bool(field[2])
	return {"value":value} if reader.error.is_empty() else {"error":reader.error}

static func _feature(bytes: PackedByteArray, keys: Array[String], values: Array) -> Dictionary:
	var reader := Reader.new(bytes)
	var properties: Dictionary = {}
	var kind := 0
	var geometry := PackedByteArray()
	while reader.cursor < bytes.size() and reader.error.is_empty():
		var field := reader.field()
		if field.size() != 3:
			break
		if field[0] == 2 and field[1] == 2:
			var tags := Reader.new(field[2])
			while tags.cursor < tags.bytes.size() and tags.error.is_empty():
				var key := tags.integer()
				if tags.cursor >= tags.bytes.size():
					return {"error":"Vector feature has an unpaired property tag."}
				var value := tags.integer()
				if key < 0 or key >= keys.size() or value < 0 or value >= values.size():
					return {"error":"Vector feature property index is invalid."}
				properties[keys[key]] = values[value]
			if not tags.error.is_empty():
				return {"error":tags.error}
		elif field[0] == 3 and field[1] == 0:
			kind = int(field[2])
		elif field[0] == 4 and field[1] == 2:
			geometry = field[2]
	if not reader.error.is_empty():
		return {"error":reader.error}
	var decoded := _geometry(geometry,kind)
	if decoded.has("error"):
		return decoded
	return {"type":kind,"properties":properties,"paths":decoded["paths"]}

static func _geometry(bytes: PackedByteArray, kind: int) -> Dictionary:
	var reader := Reader.new(bytes)
	var paths: Array = []
	var path := PackedVector2Array()
	var cursor := Vector2i.ZERO
	var points := 0
	while reader.cursor < bytes.size() and reader.error.is_empty():
		var command := reader.integer()
		var id := command & 7
		var count := command >> 3
		if count < 1 or count > MAX_POINTS or not id in [1,2,7]:
			return {"error":"Invalid vector geometry command."}
		if id == 7:
			if kind != 3 or path.size() < 3 or count != 1:
				return {"error":"Invalid polygon close command."}
			paths.append(path)
			path = PackedVector2Array()
			continue
		for _i in range(count):
			var dx := reader.integer()
			var dy := reader.integer()
			cursor += Vector2i(_zigzag(dx),_zigzag(dy))
			if absi(cursor.x) > 33554432 or absi(cursor.y) > 33554432:
				return {"error":"Vector coordinate limit exceeded."}
			if id == 1 and not path.is_empty():
				paths.append(path)
				path = PackedVector2Array()
			if id == 2 and path.is_empty():
				return {"error":"Line command has no starting point."}
			path.append(Vector2(cursor))
			points += 1
			if points > MAX_POINTS:
				return {"error":"Vector feature point limit exceeded."}
	if not reader.error.is_empty():
		return {"error":reader.error}
	if not path.is_empty():
		paths.append(path)
	return {"paths":paths}

static func _zigzag(value: int) -> int:
	return (value >> 1) ^ -(value & 1)
