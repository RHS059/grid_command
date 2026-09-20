extends Node3D
class_name BuildingStreamer

## Stream the generated San Diego catalog at the game's 1:100 world scale.
## Add this node, call setup(), then update_camera(camera) or update_focus(position).
## Only the manifest is loaded by setup. _process does bounded sector work.
## Exclusion rectangles use native world X/Z coordinates (not source metres).
signal sector_ready(sector_key: String, building_count: int)
signal sector_failed(sector_key: String, reason: String)

const DEFAULT_MANIFEST := "res://data/generated/san_diego/manifest.json"
const WORLD_SCALE := 0.01
const READ_CHUNK := 4096
const MAX_ROW_BYTES := 1048576
const MAX_HEADER_BYTES := 65536

var frame_budget_usec := 2000
var view_radius_m := 3200.0
var max_cached_sectors := 48
var max_visible_sectors := 24
var shadows_enabled := false
var enabled := true
var exclusion_rects: Array[Rect2] = []

var _manifest: Dictionary = {}
var _sector_index: Dictionary = {}
var _styles: Array = []
var _catalog_dir := ""
var _manifest_path := DEFAULT_MANIFEST
var _sector_size_m := 2000.0
var _module_m := 4.0
var _cache: Dictionary = {}
var _wanted: Dictionary = {}
var _queue: Array[String] = []
var _claims: Dictionary = {}
var _failed: Dictionary = {}
var _job: Dictionary = {}
var _camera: Camera3D
var _last_focus := Vector2(INF, INF)
var _last_radius := -1.0
var _last_selection_usec := 0
var _wall_mesh: ArrayMesh
var _roof_mesh: ArrayMesh
var _material: StandardMaterial3D
var _serial := 0
var _stats := {"parsed": 0, "duplicates": 0, "excluded": 0, "invalid": 0, "evicted": 0, "completed": 0, "last_work_usec": 0, "max_work_usec": 0}

func setup(options: Dictionary = {}) -> Error:
	clear_catalog()
	frame_budget_usec = maxi(100, int(options.get("frame_budget_usec", 2000)))
	view_radius_m = maxf(0.0, float(options.get("view_radius_m", 3200.0)))
	max_cached_sectors = maxi(1, int(options.get("max_cached_sectors", 48)))
	max_visible_sectors = clampi(int(options.get("max_visible_sectors", 24)), 1, max_cached_sectors)
	shadows_enabled = bool(options.get("shadows_enabled", false))
	enabled = bool(options.get("enabled", true))
	var path := str(options.get("manifest_path", DEFAULT_MANIFEST))
	var file := FileAccess.open(path, FileAccess.READ)
	if file == null:
		return FileAccess.get_open_error()
	var parsed: Variant = JSON.parse_string(file.get_as_text())
	file.close()
	if not parsed is Dictionary or int(parsed.get("schema", 0)) != 1 or not parsed.get("sectors") is Array:
		return ERR_FILE_CORRUPT
	_manifest = parsed
	_manifest_path = path
	_catalog_dir = path.get_base_dir()
	_sector_size_m = float(_manifest.get("sector_size_m", 2000.0))
	_module_m = float(_manifest.get("module_m", 4.0))
	if _sector_size_m <= 0.0 or _module_m <= 0.0:
		clear_catalog()
		return ERR_FILE_CORRUPT
	_styles = _manifest.get("styles", [])
	for entry in _manifest["sectors"]:
		if entry is Dictionary and entry.get("key") is Array and entry["key"].size() == 2:
			_sector_index[_key(entry["key"])] = entry
	_create_shared_resources()
	set_enabled(enabled)
	return OK

func clear_catalog() -> void:
	_cancel_job()
	for entry in _cache.values():
		var node: Node3D = entry["node"]
		node.visible = false
		node.queue_free()
	_cache.clear()
	_wanted.clear()
	_queue.clear()
	_claims.clear()
	_failed.clear()
	_sector_index.clear()
	_manifest.clear()
	_last_focus = Vector2(INF, INF)
	_last_radius = -1.0
	_serial = 0
	for name in _stats:
		_stats[name] = 0

func set_enabled(value: bool) -> void:
	enabled = value
	visible = value
	set_process(value)

func set_exclusion_rects(rectangles: Array[Rect2]) -> void:
	# Installation footprints must be set before the first update. Changing them
	# invalidates resident geometry so that existing buildings are removed too.
	exclusion_rects = rectangles.duplicate()
	var options := {"manifest_path": _manifest_path, "frame_budget_usec": frame_budget_usec, "view_radius_m": view_radius_m, "max_cached_sectors": max_cached_sectors, "max_visible_sectors": max_visible_sectors, "shadows_enabled": shadows_enabled, "enabled": enabled}
	if not _manifest.is_empty():
		setup(options)

func update_camera(camera: Camera3D, radius_m: float = -1.0) -> void:
	_camera = camera
	if radius_m >= 0.0:
		view_radius_m = radius_m
	if not is_instance_valid(camera):
		return
	var focus := camera.global_position
	var viewport := camera.get_viewport()
	if viewport != null:
		var center := viewport.get_visible_rect().size * 0.5
		var origin := camera.project_ray_origin(center)
		var direction := camera.project_ray_normal(center)
		if direction.y < -0.0001:
			var distance := -origin.y / direction.y
			if distance >= 0.0:
				focus = origin + direction * distance
	update_focus(focus, radius_m)

func update_focus(world_position: Vector3, radius_m: float = -1.0) -> void:
	if _manifest.is_empty():
		return
	var center := Vector2(world_position.x, world_position.z) / WORLD_SCALE
	var radius := view_radius_m if radius_m < 0.0 else maxf(0.0, radius_m)
	# Updating the camera every rendered frame is safe. Selection is throttled,
	# except when the focus moves into another sector or the radius changes.
	var now := Time.get_ticks_usec()
	var old_cell := Vector2i(floori(_last_focus.x / _sector_size_m), floori(_last_focus.y / _sector_size_m)) if _last_focus.is_finite() else Vector2i(2147483647, 2147483647)
	var cell := Vector2i(floori(center.x / _sector_size_m), floori(center.y / _sector_size_m))
	if old_cell == cell and is_equal_approx(radius, _last_radius) and (center.distance_squared_to(_last_focus) < 62500.0 or now - _last_selection_usec < 200000):
		return
	_last_focus = center
	_last_radius = radius
	_last_selection_usec = now
	_select_sectors(center, radius)

func _process(_delta: float) -> void:
	if enabled:
		if is_instance_valid(_camera):
			update_camera(_camera)
		process_streaming()

func _exit_tree() -> void:
	# A staging root has no parent until upload completes. Release it explicitly
	# when the map closes; normal SceneTree cleanup owns complete sector roots.
	_cancel_job()

func process_streaming(budget_usec: int = -1) -> void:
	if not enabled or _manifest.is_empty():
		return
	var start := Time.get_ticks_usec()
	var deadline := start + (frame_budget_usec if budget_usec < 0 else maxi(100, budget_usec))
	while Time.get_ticks_usec() < deadline:
		if _job.is_empty():
			if _queue.is_empty():
				break
			var key: String = _queue.pop_front()
			if not _wanted.has(key) or _cache.has(key) or _failed.has(key):
				continue
			if not _start_job(key):
				continue
		if _job.get("phase", "") == "read":
			_read_records(deadline)
		else:
			_upload_instances(deadline)
	_stats["last_work_usec"] = Time.get_ticks_usec() - start
	_stats["max_work_usec"] = maxi(int(_stats["max_work_usec"]), int(_stats["last_work_usec"]))

func is_idle() -> bool:
	return _queue.is_empty() and _job.is_empty()

func get_stats() -> Dictionary:
	var result := _stats.duplicate()
	result["catalog_buildings"] = int(_manifest.get("building_count", 0))
	result["catalog_sectors"] = _sector_index.size()
	result["resident_sectors"] = _cache.size()
	result["wanted_sectors"] = _wanted.size()
	result["queued_sectors"] = _queue.size()
	result["resident_buildings"] = _claims.size()
	result["failed_sectors"] = _failed.size()
	result["working_sector"] = str(_job.get("key", ""))
	var visible_buildings := 0
	for key in _wanted:
		if _cache.has(key) and bool(_cache[key].get("ready", false)):
			visible_buildings += int(_cache[key]["count"])
	result["visible_buildings"] = visible_buildings
	return result

func get_selected_sector_keys() -> Array:
	return _wanted.keys()

func _select_sectors(center: Vector2, radius: float) -> void:
	var candidates: Array = []
	for key in _sector_index:
		var coordinate: Array = _sector_index[key]["key"]
		var minimum := Vector2(float(coordinate[0]), float(coordinate[1])) * _sector_size_m
		var nearest := center.clamp(minimum, minimum + Vector2.ONE * _sector_size_m)
		if nearest.distance_squared_to(center) <= radius * radius:
			candidates.append({"key": key, "distance": center.distance_squared_to(minimum + Vector2.ONE * _sector_size_m * 0.5)})
	candidates.sort_custom(func(a: Dictionary, b: Dictionary) -> bool: return float(a["distance"]) < float(b["distance"]))
	var selected: Dictionary = {}
	var primary_count := 0
	for candidate in candidates:
		if primary_count >= max_visible_sectors:
			break
		var key: String = candidate["key"]
		var additions: Dictionary = {key: true}
		# Read owners from this primary sector only. Never recurse through owners.
		for owner in _sector_index[key].get("overlap_owners", []):
			var owner_key := _key(owner)
			if _sector_index.has(owner_key):
				additions[owner_key] = true
		var new_count := selected.size()
		for addition in additions:
			if not selected.has(addition):
				new_count += 1
		if new_count > max_cached_sectors:
			continue
		selected.merge(additions)
		primary_count += 1
	_wanted = selected
	_serial += 1
	if not _job.is_empty() and not _wanted.has(_job["key"]):
		_cancel_job()
	for key in _cache:
		var entry: Dictionary = _cache[key]
		# Camera movement can select an in-flight sector again. It must not expose
		# its partially populated MultiMeshes before both batches are complete.
		entry["node"].visible = bool(entry.get("ready", false)) and _wanted.has(key)
		if _wanted.has(key):
			entry["used"] = _serial
	_queue.clear()
	for key in _wanted:
		if not _cache.has(key) and not _failed.has(key) and key != _job.get("key", ""):
			_queue.append(key)

func _start_job(key: String) -> bool:
	while _cache.size() >= max_cached_sectors:
		if not _evict_one():
			return false
	var descriptor: Dictionary = _sector_index[key]
	var relative := str(descriptor.get("file", ""))
	if relative.contains("..") or relative.is_absolute_path():
		_fail_sector(key, "Invalid sector path.")
		return false
	var file := FileAccess.open(_catalog_dir.path_join(relative), FileAccess.READ)
	if file == null:
		_fail_sector(key, "Cannot read sector file.")
		return false
	# Find the records array without parsing the sector into a second full copy.
	var header := ""
	var records_start := -1
	while file.get_position() < file.get_length() and header.length() < MAX_HEADER_BYTES:
		header += file.get_buffer(READ_CHUNK).get_string_from_utf8()
		var token := header.find('"records":')
		if token >= 0:
			records_start = header.find("[", token + 10)
			if records_start >= 0:
				break
	if records_start < 0:
		file.close()
		_fail_sector(key, "Sector has no records array.")
		return false
	file.seek(header.substr(0, records_start + 1).to_utf8_buffer().size())
	var root := Node3D.new()
	root.name = "Buildings_" + key
	root.visible = false
	# Keep staging geometry outside the SceneTree. Even a visibility refresh or
	# renderer allocation cannot submit a default instance while it is filled.
	_cache[key] = {"node": root, "keys": [], "count": 0, "used": _serial, "ready": false}
	_job = {"key": key, "file": file, "phase": "read", "buffer": "", "offset": 0, "row": "", "part_start": -1, "depth": 0, "quoted": false, "escaped": false, "walls": [], "roofs": [], "wall_colors": [], "roof_colors": [], "upload_kind": 0, "upload_index": 0}
	return true

func _read_records(deadline: int) -> void:
	var scans := 0
	var buffer: String = _job["buffer"]
	var offset: int = _job["offset"]
	var depth: int = _job["depth"]
	var quoted: bool = _job["quoted"]
	var escaped: bool = _job["escaped"]
	var row_text: String = _job["row"]
	var part_start: int = _job["part_start"]
	while not _job.is_empty():
		if offset >= buffer.length():
			if part_start >= 0:
				row_text += buffer.substr(part_start)
			if row_text.length() > MAX_ROW_BYTES:
				_abort_job("Sector record exceeds the size limit.")
				return
			var file: FileAccess = _job["file"]
			if file.eof_reached() or file.get_position() >= file.get_length():
				_abort_job("Unexpected end of sector file.")
				return
			buffer = file.get_buffer(READ_CHUNK).get_string_from_utf8()
			offset = 0
			part_start = 0 if depth > 0 else -1
			continue
		var code := buffer.unicode_at(offset)
		offset += 1
		if depth == 0:
			if code == 93:
				_begin_upload()
				return
			if code == 91:
				depth = 1
				part_start = offset - 1
		elif quoted:
			if escaped:
				escaped = false
			elif code == 92:
				escaped = true
			elif code == 34:
				quoted = false
		else:
			if code == 34:
				quoted = true
			elif code == 91:
				depth += 1
			elif code == 93:
				depth -= 1
				if depth == 0:
					var row: Variant = JSON.parse_string(row_text + buffer.substr(part_start, offset - part_start))
					row_text = ""
					part_start = -1
					if row is Array:
						_add_building(row)
					else:
						_stats["invalid"] += 1
		scans += 1
		if scans % 64 == 0 and Time.get_ticks_usec() >= deadline:
			break
	_job["buffer"] = buffer
	_job["offset"] = offset
	_job["row"] = row_text
	_job["part_start"] = part_start
	_job["depth"] = depth
	_job["quoted"] = quoted
	_job["escaped"] = escaped

func _add_building(row: Array) -> void:
	_stats["parsed"] += 1
	if row.size() < 16 or not row[13] is Array or row[13].size() < 6 or row[13].size() % 2 != 0:
		_stats["invalid"] += 1
		return
	var key := str(row[0])
	if _claims.has(key):
		_stats["duplicates"] += 1
		return
	if row[14] is Array and row[14].size() == 4:
		var bounds: Array = row[14]
		var rectangle := Rect2(Vector2(float(bounds[0]), float(bounds[1])) * WORLD_SCALE, Vector2(float(bounds[2]) - float(bounds[0]), float(bounds[3]) - float(bounds[1])) * WORLD_SCALE)
		for exclusion in exclusion_rects:
			if rectangle.intersects(exclusion, true):
				_stats["excluded"] += 1
				return
	var polygon := PackedVector2Array()
	var raw: Array = row[13]
	for i in range(0, raw.size(), 2):
		var point := Vector2(float(raw[i]), float(raw[i + 1])) * _module_m * WORLD_SCALE
		if polygon.is_empty() or not point.is_equal_approx(polygon[polygon.size() - 1]):
			polygon.append(point)
	if polygon.size() > 2 and polygon[0].is_equal_approx(polygon[polygon.size() - 1]):
		polygon.remove_at(polygon.size() - 1)
	var triangles := Geometry2D.triangulate_polygon(polygon)
	if triangles.is_empty():
		_stats["invalid"] += 1
		return
	var origin := Vector3(float(row[1]), float(row[3]), float(row[2])) * WORLD_SCALE
	var rotation := Basis(Vector3.UP, -float(row[4]))
	var height := maxf(0.001, float(row[8]) * WORLD_SCALE)
	var style_index := int(row[10])
	var wall_color := Color("526772")
	var roof_color := Color("263e48")
	if style_index >= 0 and style_index < _styles.size():
		var style: Array = _styles[style_index]
		if style.size() >= 3:
			wall_color = Color(str(style[1]))
			roof_color = Color(str(style[2]))
	for i in range(polygon.size()):
		var a := Vector3(polygon[i].x, 0.0, polygon[i].y)
		var b2 := polygon[(i + 1) % polygon.size()]
		var b := Vector3(b2.x, 0.0, b2.y)
		var edge := b - a
		if edge.length_squared() < 0.00000001:
			continue
		var basis := Basis(edge, Vector3.UP * height, Vector3.UP.cross(edge).normalized())
		_job["walls"].append(Transform3D(rotation * basis, origin + rotation * a))
		_job["wall_colors"].append(wall_color)
	for i in range(0, triangles.size(), 3):
		var p: Vector2 = polygon[triangles[i]]
		var q: Vector2 = polygon[triangles[i + 1]]
		var r: Vector2 = polygon[triangles[i + 2]]
		var a := Vector3(p.x, height, p.y)
		var b := Vector3(q.x, height, q.y)
		var c := Vector3(r.x, height, r.y)
		_job["roofs"].append(Transform3D(rotation * Basis(b - a, Vector3.UP, c - a), origin + rotation * a))
		_job["roof_colors"].append(roof_color)
	_claims[key] = _job["key"]
	_cache[_job["key"]]["keys"].append(key)
	_cache[_job["key"]]["count"] += 1

func _begin_upload() -> void:
	var file: FileAccess = _job["file"]
	file.close()
	_job.erase("file")
	_job["buffer"] = ""
	_job["phase"] = "upload"

func _upload_instances(deadline: int) -> void:
	while not _job.is_empty() and Time.get_ticks_usec() < deadline:
		var kind: int = _job["upload_kind"]
		if kind > 1:
			var key: String = _job["key"]
			var root: Node3D = _cache[key]["node"]
			_cache[key]["ready"] = true
			for child in root.get_children():
				child.visible = true
			add_child(root)
			root.visible = _wanted.has(key)
			var count: int = _cache[key]["count"]
			_job.clear()
			_stats["completed"] += 1
			sector_ready.emit(key, count)
			return
		var transforms: Array = _job["walls" if kind == 0 else "roofs"]
		var colors: Array = _job["wall_colors" if kind == 0 else "roof_colors"]
		if not _job.has("multi"):
			var multi := MultiMesh.new()
			multi.transform_format = MultiMesh.TRANSFORM_3D
			multi.use_colors = true
			multi.mesh = _wall_mesh if kind == 0 else _roof_mesh
			multi.instance_count = transforms.size()
			multi.visible_instance_count = 0
			var instance := MultiMeshInstance3D.new()
			instance.name = "Walls" if kind == 0 else "Roofs"
			instance.visible = false
			instance.multimesh = multi
			instance.material_override = _material
			instance.cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_ON if shadows_enabled else GeometryInstance3D.SHADOW_CASTING_SETTING_OFF
			_cache[_job["key"]]["node"].add_child(instance)
			_job["multi"] = multi
		var multi: MultiMesh = _job["multi"]
		var index: int = _job["upload_index"]
		while index < transforms.size():
			multi.set_instance_transform(index, transforms[index])
			multi.set_instance_color(index, colors[index])
			index += 1
			if index % 32 == 0 and Time.get_ticks_usec() >= deadline:
				_job["upload_index"] = index
				return
		multi.visible_instance_count = -1
		_job.erase("multi")
		_job["upload_index"] = 0
		_job["upload_kind"] = kind + 1
		# Free CPU arrays as soon as their batch has been uploaded.
		_job["walls" if kind == 0 else "roofs"] = []
		_job["wall_colors" if kind == 0 else "roof_colors"] = []

func _evict_one() -> bool:
	var oldest := ""
	var age := 2147483647
	for key in _cache:
		if not _wanted.has(key) and key != _job.get("key", "") and int(_cache[key]["used"]) < age:
			oldest = key
			age = int(_cache[key]["used"])
	if oldest.is_empty():
		return false
	_drop_sector(oldest)
	_stats["evicted"] += 1
	return true

func _drop_sector(key: String) -> void:
	if not _cache.has(key):
		return
	for building_key in _cache[key]["keys"]:
		if _claims.get(building_key) == key:
			_claims.erase(building_key)
	var node: Node3D = _cache[key]["node"]
	node.visible = false
	node.queue_free()
	_cache.erase(key)

func _cancel_job() -> void:
	if _job.is_empty():
		return
	if _job.has("file"):
		_job["file"].close()
	var key: String = _job["key"]
	_job.clear()
	_drop_sector(key)

func _abort_job(reason: String) -> void:
	var key: String = _job["key"]
	_cancel_job()
	_fail_sector(key, reason)

func _fail_sector(key: String, reason: String) -> void:
	_failed[key] = reason
	sector_failed.emit(key, reason)
	push_warning("Building sector %s: %s" % [key, reason])

func _create_shared_resources() -> void:
	_material = StandardMaterial3D.new()
	_material.vertex_color_use_as_albedo = true
	_material.vertex_color_is_srgb = true
	_material.roughness = 0.88
	_material.cull_mode = BaseMaterial3D.CULL_DISABLED
	_wall_mesh = _primitive_mesh(PackedVector3Array([Vector3.ZERO, Vector3.RIGHT, Vector3.RIGHT + Vector3.UP, Vector3.ZERO, Vector3.RIGHT + Vector3.UP, Vector3.UP]), Vector3.BACK)
	_roof_mesh = _primitive_mesh(PackedVector3Array([Vector3.ZERO, Vector3.BACK, Vector3.RIGHT]), Vector3.UP)

static func _primitive_mesh(vertices: PackedVector3Array, normal: Vector3) -> ArrayMesh:
	var normals := PackedVector3Array()
	var colors := PackedColorArray()
	for _i in range(vertices.size()):
		normals.append(normal)
		colors.append(Color.WHITE)
	var arrays: Array = []
	arrays.resize(Mesh.ARRAY_MAX)
	arrays[Mesh.ARRAY_VERTEX] = vertices
	arrays[Mesh.ARRAY_NORMAL] = normals
	arrays[Mesh.ARRAY_COLOR] = colors
	var mesh := ArrayMesh.new()
	mesh.add_surface_from_arrays(Mesh.PRIMITIVE_TRIANGLES, arrays)
	return mesh

static func _key(coordinates: Array) -> String:
	return "%d_%d" % [int(coordinates[0]), int(coordinates[1])]
