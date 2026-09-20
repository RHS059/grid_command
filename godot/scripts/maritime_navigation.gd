extends RefCounted
class_name MaritimeNavigation

const STEP := 0.25
const SAMPLE := 0.05
const MAX_NODES := 12000

static func water_at(water: Array, point: Vector3) -> bool:
	for ring in water:
		if Geometry2D.is_point_in_polygon(Vector2(point.x,point.z),ring): return true
	return false

static func clear(water: Array, a: Vector3, b: Vector3) -> bool:
	var count := maxi(1,ceili(a.distance_to(b)/SAMPLE))
	for i in range(count+1):
		if not water_at(water,a.lerp(b,float(i)/count)): return false
	# Check each polygon interval. Small dry gaps must also block travel.
	var cuts: Array[float] = [0.0,1.0]
	var start := Vector2(a.x,a.z)
	var finish := Vector2(b.x,b.z)
	var length := start.distance_to(finish)
	if length <= 0.000001: return true
	for ring in water:
		for i in range(ring.size()):
			var hit: Variant = Geometry2D.segment_intersects_segment(start,finish,ring[i],ring[(i+1)%ring.size()])
			if hit != null: cuts.append(start.distance_to(hit)/length)
	cuts.sort()
	for i in range(cuts.size()-1):
		if not water_at(water,a.lerp(b,(cuts[i]+cuts[i+1])*0.5)): return false
	return true

static func route(water: Array, start: Vector3, finish: Vector3) -> PackedVector3Array:
	if not water_at(water,start) or not water_at(water,finish): return PackedVector3Array()
	if clear(water,start,finish): return PackedVector3Array([finish])
	var origin := Vector3(roundf(start.x/STEP)*STEP,0,roundf(start.z/STEP)*STEP)
	if not clear(water,start,origin): return PackedVector3Array()
	var open: Array = []
	_push(open,{"point":origin,"score":origin.distance_to(finish)})
	var costs: Dictionary = {origin:0.0}
	var came: Dictionary = {}
	var closed: Dictionary = {}
	for _count in range(MAX_NODES):
		if open.is_empty(): break
		var point: Vector3 = _pop(open)["point"]
		if closed.has(point): continue
		closed[point] = true
		if point.distance_to(finish) < 0.4 and clear(water,point,finish):
			var result := PackedVector3Array([finish,point])
			while came.has(point):
				point = came[point]
				result.append(point)
			result.reverse()
			return result
		for offset in [Vector3(0,0,STEP),Vector3(STEP,0,0),Vector3(0,0,-STEP),Vector3(-STEP,0,0)]:
			var next: Vector3 = point+offset
			var cost := float(costs[point])+STEP
			if cost > 200.0 or cost >= float(costs.get(next,INF)) or not clear(water,point,next): continue
			costs[next] = cost
			came[next] = point
			_push(open,{"point":next,"score":cost+next.distance_to(finish)})
	return PackedVector3Array()

static func _less(a: Dictionary,b: Dictionary) -> bool:
	if a.score != b.score: return a.score < b.score
	if a.point.x != b.point.x: return a.point.x < b.point.x
	return a.point.z < b.point.z

static func _push(heap: Array,entry: Dictionary) -> void:
	heap.append(entry)
	var index := heap.size()-1
	while index > 0:
		var parent := (index-1)/2
		if not _less(heap[index],heap[parent]): break
		var temp: Dictionary = heap[parent]
		heap[parent] = heap[index]
		heap[index] = temp
		index = parent

static func _pop(heap: Array) -> Dictionary:
	var result: Dictionary = heap[0]
	var last: Dictionary = heap.pop_back()
	if heap.is_empty(): return result
	heap[0] = last
	var index := 0
	while index*2+1 < heap.size():
		var child := index*2+1
		if child+1 < heap.size() and _less(heap[child+1],heap[child]): child += 1
		if not _less(heap[child],heap[index]): break
		var temp: Dictionary = heap[index]
		heap[index] = heap[child]
		heap[child] = temp
		index = child
	return result

static func length(start: Vector3,points: PackedVector3Array) -> float:
	var total := 0.0
	for point in points:
		total += start.distance_to(point)
		start = point
	return total
