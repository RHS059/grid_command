extends RefCounted
class_name GeographicGeometry

const Codec = preload("res://scripts/geographic_tile_codec.gd")
const MAX_TRIANGLES := 1000000
const PALETTE := {"ground":"#030717","water":"#3e8dcf","roads":"#293847","highways":"#536d7b","buildings":"#ffffff","edges":"#269dff"}

class Bucket:
	extends RefCounted
	var positions := PackedVector3Array()
	var indices := PackedInt32Array()
	var colors := PackedColorArray()

var _buckets: Array = []
var _pieces: Array = []
var _extent := 4096.0
var _left := 0.0
var _top := 0.0
var _width := 1.0
var _cancelled: Callable
var _triangles := 0
var _error := ""

## Flat terrain matches the current browser default. Polygon fill uses an exact
## even/odd sweep: holes and multiple exteriors do not need fragile ring bridges.
func build(layers: Dictionary, address: Vector3i, origin: Array, exclusions: Array[Rect2] = [], cancelled: Callable = Callable()) -> Dictionary:
	_cancelled = cancelled
	_buckets.clear()
	_pieces.clear()
	_triangles = 0
	_error = ""
	for _i in range(6):
		_buckets.append(Bucket.new())
	var earth := 40075016.68557849*cos(deg_to_rad(float(origin[1])))/100.0
	var origin_x := (float(origin[0])+180.0)/360.0
	var origin_y := (1.0-log(tan(PI/4.0+deg_to_rad(float(origin[1]))/2.0))/PI)/2.0
	var tiles := float(1 << address.x)
	# Keep globe subtraction in scalar doubles. Only local tile vertices enter
	# float32 mesh arrays; the small shape details never contain a global offset.
	var tile_east := (float(address.y)/tiles-origin_x)*earth
	var tile_south := (float(address.z)/tiles-origin_y)*earth
	_left = 0.0
	_top = 0.0
	var local_exclusions: Array[Rect2] = []
	for rectangle in exclusions:
		local_exclusions.append(Rect2(Vector2(float(rectangle.position.x)-tile_east,float(rectangle.position.y)-tile_south),rectangle.size))
	_width = earth/tiles
	var nw := Vector3(_left,0,_top)
	var ne := nw+Vector3(_width,0,0)
	var sw := nw+Vector3(0,0,_width)
	var se := nw+Vector3(_width,0,_width)
	_triangle(0,nw,sw,ne)
	_triangle(0,ne,sw,se)
	for name in ["water","waterway","transportation","building"]:
		if not layers.has(name):
			continue
		var layer: Dictionary = layers[name]
		_extent = float(layer["extent"])
		for feature in layer["features"]:
			if _stop():
				return {"cancelled":true} if _error.is_empty() else {"error":_error}
			var paths: Array = feature["paths"]
			var properties: Dictionary = feature["properties"]
			var kind: int = feature["type"]
			if name == "water" and kind == 3:
				_surface(paths,1,0.0008)
			elif name == "waterway" and kind == 2:
				for path in paths:
					_ribbon(path,1,maxf(0.03,_width/512.0*0.65),0.001)
			elif name == "transportation" and kind == 2:
				if properties.get("brunnel","") == "tunnel":
					continue
				var road_class := str(properties.get("class",""))
				var major := road_class in ["motorway","trunk","primary"]
				var minor := road_class in ["path","track","service"]
				var line_width := maxf(0.11 if major else 0.02 if minor else 0.05,_width/512.0*(1.35 if major else 0.28 if minor else 0.65))
				for path in paths:
					_ribbon(path,3 if major else 2,line_width,0.002 if major else 0.0016)
			elif name == "building" and kind == 3:
				var bottom := maxf(0.0,_number(properties,"render_min_height",0.0))*0.01
				var height := maxf(bottom+0.01,_number(properties,"render_height",6.0)*0.01)
				_surface(paths,4,height,Color("1b2c7a").srgb_to_linear())
				for path in paths:
					for i in range(path.size()):
						var a: Vector2 = path[i]
						var b: Vector2 = path[(i+1)%path.size()]
						var clipped := _clip_line(a,b)
						if clipped.is_empty():
							continue
						var p := _point(clipped[0],bottom)
						var q := _point(clipped[1],bottom)
						var r := Vector3(q.x,height,q.z)
						var s := Vector3(p.x,height,p.z)
						var light := 0.8+0.2*absf(b.x-a.x)/maxf(0.001,a.distance_to(b))
						var base := Color("0f1530").srgb_to_linear()*light
						var top := Color("162053").srgb_to_linear()*light
						base.a = 1.0
						top.a = 1.0
						_triangle(4,p,q,r,base,base,top)
						_triangle(4,p,r,s,base,top,top)
					var edge_width := maxf(0.0035,minf(0.009,_width/512.0*0.14))
					_ribbon(path,5,edge_width*1.25,0.0024,true)
					_ribbon(path,5,edge_width,height+0.00035,true)
	for role in range(6):
		_flush(role)
	if not _error.is_empty():
		return {"error":_error}
	var result: Array = []
	for piece in _pieces:
		if _stop():
			return {"cancelled":true}
		if piece["role"] != 0 and not local_exclusions.is_empty():
			piece = Codec._exclude(piece,local_exclusions,cancelled)
			if piece.has("cancelled"):
				return piece
		if not piece["indices"].is_empty():
			result.append(piece)
	return {"address":address,"pieces":result,"resolution":1,"local_origin":[tile_east,tile_south]}

func _point(point: Vector2, height: float) -> Vector3:
	return Vector3(_left+float(point.x)/_extent*_width,height,_top+float(point.y)/_extent*_width)

func _stop() -> bool:
	return not _error.is_empty() or _cancelled.is_valid() and _cancelled.call()

func _triangle(role: int,a: Vector3,b: Vector3,c: Vector3,ca: Color = Color.WHITE,cb: Color = Color.WHITE,cc: Color = Color.WHITE) -> void:
	if _triangles >= MAX_TRIANGLES:
		_error = "Geographic triangle limit exceeded."
		return
	if (b-a).cross(c-a).length_squared() < 0.00000000000001:
		return
	_triangles += 1
	var bucket: Bucket = _buckets[role]
	for point in [a,b,c]:
		bucket.indices.append(bucket.positions.size())
		bucket.positions.append(point)
	if role == 4:
		bucket.colors.append(ca)
		bucket.colors.append(cb)
		bucket.colors.append(cc)
	if bucket.indices.size() >= 24576:
		_flush(role)

func _flush(role: int) -> void:
	var bucket: Bucket = _buckets[role]
	if bucket.indices.is_empty():
		return
	_pieces.append({"role":role,"positions":bucket.positions,"indices":bucket.indices,"colors":bucket.colors})
	_buckets[role] = Bucket.new()

func _surface(paths: Array, role: int, height: float, color: Color = Color.WHITE) -> void:
	var groups: Array = []
	var exterior_sign := 0.0
	for path in paths:
		var area := 0.0
		for i in range(path.size()):
			var a: Vector2 = path[i]
			var b: Vector2 = path[(i+1)%path.size()]
			area += a.x*b.y-b.x*a.y
		if is_zero_approx(area):
			continue
		if exterior_sign == 0.0:
			exterior_sign = signf(area)
		if signf(area) == exterior_sign:
			groups.append([path])
		elif not groups.is_empty():
			groups[groups.size()-1].append(path)
	for group in groups:
		_surface_group(group,role,height,color)

func _surface_group(paths: Array, role: int, height: float, color: Color) -> void:
	# Most roads/buildings/water polygons have no holes. Native C++ ear clipping
	# keeps their triangle count minimal; use the sweep only for actual holes.
	if paths.size() == 1:
		var path: PackedVector2Array = paths[0]
		var indices := Geometry2D.triangulate_polygon(path)
		if not indices.is_empty():
			for i in range(0,indices.size(),3):
				var polygon := _clip_polygon(PackedVector2Array([path[indices[i]],path[indices[i+1]],path[indices[i+2]]]))
				for j in range(1,polygon.size()-1):
					_triangle(role,_point(polygon[0],height),_point(polygon[j],height),_point(polygon[j+1],height),color,color,color)
			return
	var starts: Dictionary = {}
	var ends: Dictionary = {}
	var edges: Array = []
	var xs: Dictionary = {0.0:true,_extent:true}
	for path in paths:
		for i in range(path.size()):
			var a: Vector2 = path[i]
			var b: Vector2 = path[(i+1)%path.size()]
			if is_equal_approx(a.x,b.x):
				continue
			if a.x > b.x:
				var swap := a
				a = b
				b = swap
			if b.x <= 0.0 or a.x >= _extent:
				continue
			var left := maxf(0.0,a.x)
			var right := minf(_extent,b.x)
			var index := edges.size()
			edges.append([a,b])
			if not starts.has(left):
				starts[left] = []
			if not ends.has(right):
				ends[right] = []
			starts[left].append(index)
			ends[right].append(index)
			xs[left] = true
			xs[right] = true
	var sorted: Array = xs.keys()
	sorted.sort()
	var active: Dictionary = {}
	for i in range(sorted.size()-1):
		if _stop():
			return
		var left := float(sorted[i])
		var right := float(sorted[i+1])
		for index in ends.get(left,[]):
			active.erase(index)
		for index in starts.get(left,[]):
			active[index] = true
		var intersections: Array = []
		for index in active:
			intersections.append({"edge":index,"y":_edge_y(edges[index],(left+right)*0.5)})
		intersections.sort_custom(func(a: Dictionary,b: Dictionary) -> bool: return float(a["y"]) < float(b["y"]))
		for j in range(0,intersections.size()-1,2):
			var lower: Array = edges[intersections[j]["edge"]]
			var upper: Array = edges[intersections[j+1]["edge"]]
			var polygon := PackedVector2Array([Vector2(left,_edge_y(lower,left)),Vector2(right,_edge_y(lower,right)),Vector2(right,_edge_y(upper,right)),Vector2(left,_edge_y(upper,left))])
			polygon = _clip_polygon(polygon)
			for k in range(1,polygon.size()-1):
				_triangle(role,_point(polygon[0],height),_point(polygon[k],height),_point(polygon[k+1],height),color,color,color)

static func _edge_y(edge: Array,x: float) -> float:
	var a: Vector2 = edge[0]
	var b: Vector2 = edge[1]
	return a.y+(b.y-a.y)*(x-a.x)/(b.x-a.x)

func _ribbon(path: PackedVector2Array,role: int,width: float,height: float,closed: bool = false) -> void:
	if path.size() < 2:
		return
	var pairs: Array = []
	var tile_width := width/_width*_extent
	for i in range(path.size()):
		var point := path[i]
		var before := path[posmod(i-1,path.size()) if closed else maxi(0,i-1)]
		var after := path[(i+1)%path.size() if closed else mini(path.size()-1,i+1)]
		var a := (point-before).normalized()
		var b := (after-point).normalized()
		if a.is_zero_approx():
			a = b
		if b.is_zero_approx():
			b = a
		var normal := Vector2(-a.y-b.y,a.x+b.x).normalized()
		if normal.is_zero_approx():
			normal = Vector2(-b.y,b.x)
		var half := minf(tile_width*1.25,tile_width*0.5/maxf(0.2,absf(normal.dot(Vector2(-b.y,b.x)))))
		pairs.append([point+normal*half,point-normal*half])
	for i in range(path.size() if closed else path.size()-1):
		var a: Array = pairs[i]
		var b: Array = pairs[(i+1)%path.size()]
		for triangle in [[a[0],a[1],b[0]],[b[0],a[1],b[1]]]:
			var polygon := _clip_polygon(PackedVector2Array(triangle))
			for k in range(1,polygon.size()-1):
				_triangle(role,_point(polygon[0],height),_point(polygon[k],height),_point(polygon[k+1],height))

func _clip_polygon(input: PackedVector2Array) -> PackedVector2Array:
	var polygon := input
	for side in range(4):
		var output := PackedVector2Array()
		for i in range(polygon.size()):
			var a := polygon[i]
			var b := polygon[(i+1)%polygon.size()]
			var da := _distance(a,side)
			var db := _distance(b,side)
			if da >= 0.0:
				output.append(a)
			if (da >= 0.0) != (db >= 0.0):
				output.append(a.lerp(b,da/(da-db)))
		polygon = output
	return polygon

func _distance(point: Vector2,side: int) -> float:
	match side:
		0: return point.x
		1: return _extent-point.x
		2: return point.y
		_: return _extent-point.y

func _clip_line(a: Vector2,b: Vector2) -> PackedVector2Array:
	var start := 0.0
	var end := 1.0
	for side in range(4):
		var da := _distance(a,side)
		var db := _distance(b,side)
		if da < 0 and db < 0:
			return PackedVector2Array()
		if (da >= 0) != (db >= 0):
			var t := da/(da-db)
			if da < 0:
				start = maxf(start,t)
			else:
				end = minf(end,t)
	return PackedVector2Array([a.lerp(b,start),a.lerp(b,end)]) if start < end else PackedVector2Array()

static func _number(properties: Dictionary,key: String,fallback: float) -> float:
	var value: Variant = properties.get(key,fallback)
	if value is String and not value.is_valid_float():
		return fallback
	var number := float(value) if value != null else fallback
	return number if is_finite(number) else fallback
