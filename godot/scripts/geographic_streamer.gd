extends Node3D
class_name GeographicStreamer

## Exact browser vector geometry. Native coordinates are +X east and -Z north.
## setup() loads metadata only. Files, checksums and triangle clipping run on
## one worker thread; bounded GPU pieces are uploaded over successive frames.
signal tile_ready(key: String)
signal tile_failed(key: String, reason: String)

const Codec = preload("res://scripts/geographic_tile_codec.gd")
const MVT = preload("res://scripts/geographic_mvt.gd")
const Geometry = preload("res://scripts/geographic_geometry.gd")
const HTTP = preload("res://scripts/geographic_http.gd")
const DEFAULT_MANIFEST := "res://data/generated/geographic/manifest.json"
const VECTOR_TILEJSON := "https://tiles.openfreemap.org/planet"
const SHADER_SOURCE := """
shader_type spatial;
render_mode unshaded, cull_disabled, shadows_disabled, depth_draw_opaque;
uniform vec4 tint : source_color = vec4(1.0);
uniform float layer_depth_bias = 0.0;
uniform float coverage_min = 0.0;
uniform float coverage_max = 1.0;
float bayer(vec2 pixel) {
    ivec2 p = ivec2(mod(floor(pixel), 4.0));
    int values[16] = int[16](0,8,2,10,12,4,14,6,3,11,1,9,15,7,13,5);
    return (float(values[p.y*4+p.x])+0.5)/16.0;
}
void vertex() {
    // Reverse Z: pull only the flat map layers away from the camera. Separate
    // their depth values without lifting roads/water above units in world space.
    // Centimetre offsets alone vanish at theater overview distances in GL.
    POSITION = PROJECTION_MATRIX * MODELVIEW_MATRIX * vec4(VERTEX, 1.0);
    POSITION.z -= layer_depth_bias * POSITION.w;
}
void fragment() {
    float mask = bayer(FRAGCOORD.xy);
    if(mask < coverage_min || mask >= coverage_max) discard;
    ALBEDO = tint.rgb * COLOR.rgb;
}
"""

var frame_budget_usec := 2000
var max_cached_tiles := 112
var max_cache_bytes := 201326592
var tile_radius := 3
var include_buildings := true
var labels_enabled := false
var enabled := true
var network_enabled := true
var origin: Array = [0.0,0.0]
var disk_cache_path := "user://geography-v1"
var max_disk_bytes := 134217728
var max_disk_tiles := 256
var tls_ca_bundle := ""
var exclusions: Array[Rect2] = []
var _manifest: Dictionary = {}
var _index: Dictionary = {}
var _zooms: Array = []
var _directory := ""
var _cache: Dictionary = {}
var _wanted: Dictionary = {}
var _queue: Array[String] = []
var _materials: Dictionary = {}
var _failures: Dictionary = {}
var _camera: Camera3D
var _signature := ""
var _generation := 0
var _serial := 0
var _display_zoom := -1
var _target_zoom := -1
var _transition_started := -1
var _thread: Thread
var _request: Dictionary = {}
var _upload: Dictionary = {}
var _cancel_mutex := Mutex.new()
var _request_cancelled := false
var _shader: Shader
var _template := ""
var _setup_options: Dictionary = {}
var _earth_native := 400750.1668557849
var _stats := {"loaded":0,"cancelled":0,"failed":0,"evicted":0,"cache_bytes":0,"last_upload_usec":0}

func setup(options: Dictionary = {}) -> Error:
	clear_catalog()
	_setup_options = options.duplicate(true)
	frame_budget_usec = maxi(100,int(options.get("frame_budget_usec",2000)))
	max_cached_tiles = maxi(4,int(options.get("max_cached_tiles",112)))
	max_cache_bytes = maxi(1048576,int(options.get("max_cache_bytes",201326592)))
	tile_radius = clampi(int(options.get("tile_radius",3)),0,6)
	include_buildings = bool(options.get("include_buildings",true))
	network_enabled = bool(options.get("network_enabled",true))
	disk_cache_path = str(options.get("disk_cache_path","user://geography-v1"))
	max_disk_bytes = maxi(1048576,int(options.get("max_disk_bytes",134217728)))
	max_disk_tiles = maxi(1,int(options.get("max_disk_tiles",256)))
	tls_ca_bundle = str(options.get("tls_ca_bundle",""))
	var path := str(options.get("manifest_path",DEFAULT_MANIFEST))
	var file := FileAccess.open(path,FileAccess.READ)
	var data: Variant = {"schema":1,"complete":true,"format":Codec.MAGIC,"tiles":[],"zooms":[],"palette":Geometry.PALETTE}
	if file != null:
		data = JSON.parse_string(file.get_as_text())
		file.close()
	elif not network_enabled:
		return ERR_FILE_NOT_FOUND
	if not data is Dictionary or int(data.get("schema",0)) != 1 or not data.get("complete",false) or data.get("format","") != Codec.MAGIC or not data.get("tiles") is Array:
		return ERR_FILE_CORRUPT
	_manifest = data
	_directory = path.get_base_dir()
	var theater: Variant = JSON.parse_string(FileAccess.get_file_as_string(str(options.get("theater_path","res://data/theater.json"))))
	origin = options.get("origin",theater.get("origin",data.get("origin",[0.0,0.0])) if theater is Dictionary else data.get("origin",[0.0,0.0]))
	if origin.size() != 2 or not is_finite(float(origin[0])) or not is_finite(float(origin[1])) or absf(float(origin[1])) > 85.05112878:
		return ERR_INVALID_PARAMETER
	_earth_native = 40075016.68557849*cos(deg_to_rad(float(origin[1])))/100.0
	_template = str(data.get("tile_template",""))
	_zooms = range(7,15) if network_enabled else data.get("zooms",[])
	_zooms.sort()
	if _zooms.is_empty():
		return ERR_FILE_CORRUPT
	# Warm meshes use the origin at conversion time. Raw global MVTs are origin
	# independent and are projected afresh when the theater configuration changes.
	var warm_origin: Array = data.get("origin",origin)
	var same_origin := warm_origin == origin
	for tile in data["tiles"] if same_origin else []:
		var relative := str(tile.get("file",""))
		if relative.is_empty() or relative.is_absolute_path() or relative.contains(".."):
			return ERR_FILE_CORRUPT
		_index[str(tile["key"])] = tile
	_shader = Shader.new()
	_shader.code = SHADER_SOURCE
	set_enabled(bool(options.get("enabled",true)))
	return OK

## Rebase when the observer moves to a distant city. The caller must also move
## its camera/scene origin and clear or restore theater-specific exclusions.
## Raw disk tiles remain valid because their coordinates are origin independent.
func set_origin(new_origin: Array) -> Error:
	if new_origin.size() != 2 or not is_finite(float(new_origin[0])) or not is_finite(float(new_origin[1])) or absf(float(new_origin[1])) > 85.05112878:
		return ERR_INVALID_PARAMETER
	var options := _setup_options.duplicate(true)
	options["origin"] = new_origin.duplicate()
	for setting in ["frame_budget_usec","max_cached_tiles","max_cache_bytes","tile_radius","include_buildings","network_enabled","disk_cache_path","max_disk_bytes","max_disk_tiles","tls_ca_bundle","enabled"]:
		options[setting] = get(setting)
	return setup(options)

func clear_catalog() -> void:
	_generation += 1
	_cancel_request()
	_clear_upload()
	for key in _cache.keys():
		_drop_tile(key)
	_manifest.clear()
	_index.clear()
	_wanted.clear()
	_queue.clear()
	_materials.clear()
	_failures.clear()
	_signature = ""
	_display_zoom = -1
	_target_zoom = -1
	_transition_started = -1

func set_enabled(value: bool) -> void:
	enabled = value
	visible = value
	set_process(value)

func set_exclusion_rects(rectangles: Array[Rect2]) -> void:
	exclusions = rectangles.duplicate()
	_generation += 1
	_cancel_request()
	_clear_upload()
	for key in _cache.keys():
		_drop_tile(key)
	_wanted.clear()
	_queue.clear()
	_failures.clear()
	_signature = ""
	_display_zoom = -1
	_transition_started = -1

func update_camera(camera: Camera3D) -> void:
	_camera = camera
	if not is_instance_valid(camera) or _manifest.is_empty():
		return
	var focus := camera.global_position
	var viewport_size := camera.get_viewport().get_visible_rect().size
	var center := viewport_size*0.5
	var hit: Variant = Plane(Vector3.UP,0).intersects_ray(camera.project_ray_origin(center),camera.project_ray_normal(center))
	if hit is Vector3:
		focus = hit
	var height := camera.size if camera.projection == Camera3D.PROJECTION_ORTHOGONAL else 2.0*camera.global_position.distance_to(focus)*tan(deg_to_rad(camera.fov)*0.5)
	var zoom := log(_earth_native*maxf(1.0,viewport_size.y)/(512.0*maxf(0.01,height)))/log(2.0)
	update_focus(focus,zoom)

func update_focus(world_position: Vector3, zoom: float = 11.0) -> void:
	if _manifest.is_empty() or _transition_started >= 0:
		return
	var target := int(_zooms[0])
	for candidate in _zooms:
		if absf(float(candidate)-zoom) < absf(float(target)-zoom):
			target = int(candidate)
	# Apply hysteresis near the midpoint of each pair of bundled zoom levels.
	if _target_zoom >= 0 and target != _target_zoom and absf(zoom-float(_target_zoom)) < absf(float(target-_target_zoom))*0.5+0.12:
		target = _target_zoom
	var mercator := _world_to_mercator(world_position,origin)
	var extent := 1 << target
	var tile_x := floori(float(mercator[0])*extent)
	var tile_y := floori(float(mercator[1])*extent)
	var signature := "%d/%d/%d/%d" % [target,tile_x,tile_y,_generation]
	if signature == _signature:
		return
	_signature = signature
	_target_zoom = target
	if _display_zoom < 0:
		_display_zoom = target
	_serial += 1
	var candidates: Array = []
	for dy in range(-tile_radius,tile_radius+1):
		for dx in range(-tile_radius,tile_radius+1):
			var x := posmod(tile_x+dx,extent)
			var y := tile_y+dy
			if y < 0 or y >= extent:
				continue
			var key := "%d/%d/%d" % [target,x,y]
			if network_enabled and not _index.has(key):
				_index[key] = {"key":key,"z":target,"x":x,"y":y,"bytes":1048576,"remote":true}
			if _index.has(key):
				candidates.append({"key":key,"distance":dx*dx+dy*dy})
	candidates.sort_custom(func(a: Dictionary,b: Dictionary) -> bool: return int(a["distance"]) < int(b["distance"]))
	_wanted.clear()
	_queue.clear()
	var wanted_bytes := 0
	for entry in candidates:
		if _wanted.size() >= maxi(1,max_cached_tiles/2):
			break
		var key: String = entry["key"]
		var tile_bytes := int(_index[key].get("memory_bytes",_index[key]["bytes"]))
		if wanted_bytes + tile_bytes > max_cache_bytes/2:
			continue
		wanted_bytes += tile_bytes
		_wanted[key] = int(entry["distance"])
		if _cache.has(key):
			_cache[key]["used"] = _serial
		elif key != _request.get("key","") and key != _upload.get("key","") and not _failures.has(key):
			_queue.append(key)
	if not _request.is_empty() and not _wanted.has(_request["key"]):
		_cancel_request()
	if not _upload.is_empty() and not _wanted.has(_upload["key"]):
		_clear_upload()
	for key in _failures.keys():
		if not _wanted.has(key):
			_failures.erase(key)
	for key in _cache.keys():
		var entry: Dictionary = _cache[key]
		entry["node"].visible = (_wanted.has(key) and target == _display_zoom) or int(entry["z"]) == _display_zoom and target != _display_zoom
		if int(entry["z"]) != _display_zoom and int(entry["z"]) != target:
			_drop_tile(key)
	_trim_cache()
	_start_transition_if_ready()
	# Bound metadata too when the camera travels across the globe.
	if _index.size() > 2048:
		for key in _index.keys():
			if _index[key].get("remote",false) and not _wanted.has(key) and not _cache.has(key) and key != _request.get("key",""):
				_index.erase(key)

func _process(_delta: float) -> void:
	if not enabled:
		return
	if is_instance_valid(_camera):
		update_camera(_camera)
	process_streaming()

func process_streaming() -> void:
	_advance_transition()
	_poll_worker()
	for key in _failures.keys():
		if _wanted.has(key) and Time.get_ticks_msec() >= int(_failures[key]["retry_at"]) and not _queue.has(key) and key != _request.get("key","") and key != _upload.get("key",""):
			_queue.append(key)
			_failures[key]["retry_at"] = Time.get_ticks_msec()+30000
	var started := Time.get_ticks_usec()
	while not _upload.is_empty() and Time.get_ticks_usec()-started < frame_budget_usec:
		_upload_piece()
	_stats["last_upload_usec"] = Time.get_ticks_usec()-started
	if _thread == null and _upload.is_empty():
		_start_next_request()

func _start_next_request() -> void:
	while not _queue.is_empty():
		var key: String = _queue.pop_front()
		if not _wanted.has(key) or _cache.has(key):
			continue
		var descriptor: Dictionary = _index[key]
		_request = {"key":key,"generation":_generation,"descriptor":descriptor}
		_cancel_mutex.lock()
		_request_cancelled = false
		_cancel_mutex.unlock()
		_thread = Thread.new()
		var task := {"path":_directory.path_join(str(descriptor.get("file",""))),"sha256":str(descriptor.get("sha256","")),"bytes":int(descriptor["bytes"]),"exclusions":exclusions.duplicate(),"remote":descriptor.get("remote",false),"address":Vector3i(int(descriptor["z"]),int(descriptor["x"]),int(descriptor["y"])),"origin":origin.duplicate(),"template":_template,"disk_path":disk_cache_path,"max_disk_bytes":max_disk_bytes,"max_disk_tiles":max_disk_tiles,"ca_path":tls_ca_bundle}
		var error := _thread.start(_load_tile.bind(task))
		if error != OK:
			_thread = null
			_fail_tile(key,"Cannot start geographic worker.")
			_request.clear()
		return

func _load_tile(task: Dictionary) -> Dictionary:
	if _is_cancelled():
		return {"cancelled":true}
	if task["remote"]:
		return _load_global_tile(task)
	var file := FileAccess.open(task["path"],FileAccess.READ)
	if file == null:
		return {"error":"Cannot read geographic tile."}
	if file.get_length() != int(task["bytes"]) or file.get_length() > Codec.MAX_TILE_BYTES:
		file.close()
		return {"error":"Geographic file size does not match the manifest."}
	var bytes := file.get_buffer(file.get_length())
	file.close()
	var hash := HashingContext.new()
	hash.start(HashingContext.HASH_SHA256)
	hash.update(bytes)
	if hash.finish().hex_encode() != task["sha256"]:
		return {"error":"Geographic file checksum does not match the manifest."}
	return Codec.decode(bytes,task["exclusions"],_is_cancelled)

func _load_global_tile(task: Dictionary) -> Dictionary:
	var address: Vector3i = task["address"]
	var filename := "%d_%d_%d.pbf" % [address.x,address.y,address.z]
	var cache_file: String = str(task["disk_path"]).path_join(filename)
	var bytes := PackedByteArray()
	if FileAccess.file_exists(cache_file):
		var cached := FileAccess.open(cache_file,FileAccess.READ)
		if cached != null and cached.get_length() <= MVT.MAX_BYTES:
			bytes = cached.get_buffer(cached.get_length())
			cached.close()
	var template: String = task["template"]
	if bytes.is_empty():
		if template.is_empty():
			var response := HTTP.fetch(VECTOR_TILEJSON,_is_cancelled,1048576,task["ca_path"])
			if response.has("error") or response.has("cancelled"):
				return response
			var metadata: Variant = JSON.parse_string(response["bytes"].get_string_from_utf8())
			if not metadata is Dictionary or not metadata.get("tiles") is Array or metadata["tiles"].is_empty():
				return {"error":"Invalid OpenFreeMap TileJSON."}
			template = str(metadata["tiles"][0])
		var url := template.replace("{z}",str(address.x)).replace("{x}",str(address.y)).replace("{y}",str(address.z))
		var response := HTTP.fetch(url,_is_cancelled,MVT.MAX_BYTES,task["ca_path"])
		if response.has("error") or response.has("cancelled"):
			return response
		bytes = response["bytes"]
	var decoded := MVT.decode(bytes,_is_cancelled)
	if decoded.has("error") or decoded.has("cancelled"):
		if decoded.has("error") and FileAccess.file_exists(cache_file):
			DirAccess.remove_absolute(cache_file)
		return decoded
	var geometry := Geometry.new().build(decoded["layers"],address,task["origin"],task["exclusions"],_is_cancelled)
	if geometry.has("error") or geometry.has("cancelled"):
		return geometry
	if not _is_cancelled() and DirAccess.make_dir_recursive_absolute(task["disk_path"]) == OK:
		var file := FileAccess.open(cache_file,FileAccess.WRITE)
		if file != null:
			file.store_buffer(bytes)
			file.close()
			_prune_disk(task,cache_file)
	geometry["template"] = template
	return geometry

func _prune_disk(task: Dictionary, keep: String) -> void:
	var directory := DirAccess.open(task["disk_path"])
	if directory == null:
		return
	var files: Array = []
	var total := 0
	for name in directory.get_files():
		if not name.ends_with(".pbf"):
			continue
		var path := str(task["disk_path"]).path_join(name)
		var file := FileAccess.open(path,FileAccess.READ)
		if file == null:
			continue
		var size := file.get_length()
		file.close()
		total += size
		files.append({"path":path,"size":size,"time":FileAccess.get_modified_time(path)})
	files.sort_custom(func(a: Dictionary,b: Dictionary) -> bool: return int(a["time"]) < int(b["time"]))
	var count := files.size()
	for entry in files:
		if total <= int(task["max_disk_bytes"]) and count <= int(task["max_disk_tiles"]):
			break
		if entry["path"] == keep:
			continue
		if DirAccess.remove_absolute(entry["path"]) == OK:
			total -= int(entry["size"])
			count -= 1

func _is_cancelled() -> bool:
	_cancel_mutex.lock()
	var value := _request_cancelled
	_cancel_mutex.unlock()
	return value

func _cancel_request() -> void:
	_cancel_mutex.lock()
	_request_cancelled = true
	_cancel_mutex.unlock()

func _poll_worker() -> void:
	if _thread == null or _thread.is_alive():
		return
	var result: Dictionary = _thread.wait_to_finish()
	_thread = null
	var request := _request
	_request = {}
	var key := str(request.get("key",""))
	if result.get("cancelled",false) or int(request.get("generation",-1)) != _generation or not _wanted.has(key):
		_stats["cancelled"] += 1
		# An exclusion update can retain this key while canceling its old work.
		if _wanted.has(key) and not _queue.has(key) and not _cache.has(key):
			_queue.append(key)
		return
	if result.has("error"):
		_fail_tile(key,result["error"])
		return
	var descriptor: Dictionary = request["descriptor"]
	if result.has("template") and not str(result["template"]).is_empty():
		_template = result["template"]
	_failures.erase(key)
	var expected := Vector3i(int(descriptor["z"]),int(descriptor["x"]),int(descriptor["y"]))
	if result.get("address") != expected:
		_fail_tile(key,"Geographic address does not match the manifest.")
		return
	var memory_bytes := 0
	for piece in result["pieces"]:
		memory_bytes += piece["positions"].size()*12+piece["indices"].size()*4+piece["colors"].size()*16
	descriptor["memory_bytes"] = memory_bytes
	if not _admit_tile(key,memory_bytes):
		_start_transition_if_ready()
		return
	var root := Node3D.new()
	var local_origin: Array = result.get("local_origin",[0.0,0.0])
	root.position = Vector3(float(local_origin[0]),0,float(local_origin[1]))
	root.name = "Geography_"+key.replace("/","_")
	root.visible = false
	_upload = {"key":key,"descriptor":descriptor,"pieces":result["pieces"],"index":0,"node":root}

func _upload_piece() -> void:
	var index: int = _upload["index"]
	var pieces: Array = _upload["pieces"]
	if index >= pieces.size():
		var key: String = _upload["key"]
		var descriptor: Dictionary = _upload["descriptor"]
		var root: Node3D = _upload["node"]
		add_child(root)
		root.visible = _wanted.has(key) and int(descriptor["z"]) == _display_zoom
		_cache[key] = {"node":root,"z":int(descriptor["z"]),"used":_serial,"bytes":int(descriptor["memory_bytes"])}
		_stats["cache_bytes"] += int(descriptor["memory_bytes"])
		_stats["loaded"] += 1
		_upload = {}
		_trim_cache()
		_start_transition_if_ready()
		tile_ready.emit(key)
		return
	var piece: Dictionary = pieces[index]
	_upload["index"] = index+1
	var role: int = piece["role"]
	if not include_buildings and role in [4,5]:
		return
	var arrays: Array = []
	arrays.resize(Mesh.ARRAY_MAX)
	arrays[Mesh.ARRAY_VERTEX] = piece["positions"]
	arrays[Mesh.ARRAY_INDEX] = piece["indices"]
	if not piece["colors"].is_empty():
		arrays[Mesh.ARRAY_COLOR] = piece["colors"]
	var mesh := ArrayMesh.new()
	mesh.add_surface_from_arrays(Mesh.PRIMITIVE_TRIANGLES,arrays)
	var instance := MeshInstance3D.new()
	instance.name = Codec.KINDS[role]+"_"+str(index)
	instance.mesh = mesh
	instance.material_override = _material(int(_upload["descriptor"]["z"]),role)
	instance.cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_OFF
	_upload["node"].add_child(instance)
	pieces[index] = {}

func _material(zoom: int, role: int) -> ShaderMaterial:
	var key := "%d/%d" % [zoom,role]
	if not _materials.has(key):
		var material := ShaderMaterial.new()
		material.shader = _shader
		material.set_shader_parameter("tint",Color(str(_manifest["palette"][Codec.KINDS[role]])))
		material.set_shader_parameter("layer_depth_bias",float(4-role)*0.000002 if role < 4 else 0.0)
		_materials[key] = material
	return _materials[key]

func _coverage(zoom: int, minimum: float, maximum: float) -> void:
	for role in range(Codec.KINDS.size()):
		var key := "%d/%d" % [zoom,role]
		if _materials.has(key):
			_materials[key].set_shader_parameter("coverage_min",minimum)
			_materials[key].set_shader_parameter("coverage_max",maximum)

func _start_transition_if_ready() -> void:
	if _target_zoom == _display_zoom or _transition_started >= 0 or _wanted.is_empty():
		return
	for key in _wanted:
		if not _cache.has(key):
			return
	_transition_started = Time.get_ticks_msec()
	for key in _wanted:
		_cache[key]["node"].visible = true
	_coverage(_target_zoom,0.0,0.0)

func _advance_transition() -> void:
	if _transition_started < 0:
		return
	var fraction := clampf(float(Time.get_ticks_msec()-_transition_started)/240.0,0.0,1.0)
	var coverage := fraction*fraction*(3.0-2.0*fraction)
	_coverage(_target_zoom,0.0,coverage)
	_coverage(_display_zoom,coverage,1.0)
	if fraction < 1.0:
		return
	for key in _cache.keys():
		if int(_cache[key]["z"]) != _target_zoom:
			_drop_tile(key)
	_display_zoom = _target_zoom
	_transition_started = -1
	_coverage(_display_zoom,0.0,1.0)

func _trim_cache() -> void:
	while _cache.size() > max_cached_tiles or int(_stats["cache_bytes"]) > max_cache_bytes:
		var oldest := ""
		var age := 2147483647
		for key in _cache:
			if not _wanted.has(key) and int(_cache[key]["used"]) < age:
				oldest = key
				age = int(_cache[key]["used"])
		if oldest.is_empty():
			oldest = _farthest_wanted()
			if oldest.is_empty():
				break
			_wanted.erase(oldest)
			_queue.erase(oldest)
		_drop_tile(oldest)
		_stats["evicted"] += 1

func _farthest_wanted() -> String:
	var farthest := ""
	var distance := -1
	for key in _wanted:
		if int(_wanted[key]) > distance:
			farthest = key
			distance = int(_wanted[key])
	return farthest

func _admit_tile(key: String, memory_bytes: int) -> bool:
	_index[key]["memory_bytes"] = memory_bytes
	# Reserve half of RAM for the previous LOD during a complementary transition.
	# Re-evaluate all candidates after decoding: a 1 MiB network estimate is not
	# an admission guarantee. Remove farthest candidates, including visible ones.
	var wanted_bytes := 0
	for candidate in _wanted:
		wanted_bytes += int(_index[candidate].get("memory_bytes",_index[candidate]["bytes"]))
	while wanted_bytes > max_cache_bytes/2 and not _wanted.is_empty():
		var farthest := _farthest_wanted()
		wanted_bytes -= int(_index[farthest].get("memory_bytes",_index[farthest]["bytes"]))
		_wanted.erase(farthest)
		_queue.erase(farthest)
		_drop_tile(farthest)
		_stats["evicted"] += 1
	if not _wanted.has(key):
		return false
	# Evict older off-screen cache before reserving bytes for the incoming mesh.
	while int(_stats["cache_bytes"])+memory_bytes > max_cache_bytes:
		var oldest := ""
		var age := 2147483647
		for candidate in _cache:
			if not _wanted.has(candidate) and int(_cache[candidate]["used"]) < age:
				oldest = candidate
				age = int(_cache[candidate]["used"])
		if oldest.is_empty():
			return false
		_drop_tile(oldest)
		_stats["evicted"] += 1
	return true

func _drop_tile(key: String) -> void:
	if not _cache.has(key):
		return
	var entry: Dictionary = _cache[key]
	entry["node"].visible = false
	entry["node"].queue_free()
	_stats["cache_bytes"] -= int(entry["bytes"])
	_cache.erase(key)

func _clear_upload() -> void:
	if not _upload.is_empty():
		_upload["node"].queue_free()
		_upload = {}

func _fail_tile(key: String, reason: String) -> void:
	var attempts := mini(5,int(_failures.get(key,{}).get("attempts",0))+1)
	_failures[key] = {"reason":reason,"attempts":attempts,"retry_at":Time.get_ticks_msec()+mini(8000,500*(1 << (attempts-1)))}
	_stats["failed"] += 1
	tile_failed.emit(key,reason)
	push_warning("Geographic tile %s: %s" % [key,reason])

func is_idle() -> bool:
	return _queue.is_empty() and _thread == null and _upload.is_empty() and _transition_started < 0

func get_stats() -> Dictionary:
	var result := _stats.duplicate()
	result["resident_tiles"] = _cache.size()
	result["wanted_tiles"] = _wanted.size()
	result["queued_tiles"] = _queue.size()
	result["display_zoom"] = _display_zoom
	result["target_zoom"] = _target_zoom
	return result

func get_attribution() -> String:
	return str(_manifest.get("attribution","© OpenStreetMap contributors · OpenFreeMap"))

func _exit_tree() -> void:
	_cancel_request()
	if _thread != null:
		_thread.wait_to_finish()
		_thread = null
	_clear_upload()

func project_point(longitude: float,latitude: float) -> Vector3:
	return project(longitude,latitude,origin)

static func project(longitude: float, latitude: float, projection_origin: Array = [0.0,0.0]) -> Vector3:
	# Keep Mercator subtraction in scalar doubles. Vector2 stores float32 and
	# loses metre-level detail if normalized globe coordinates are stored first.
	var earth := 40075016.68557849*cos(deg_to_rad(float(projection_origin[1])))/100.0
	var east := (longitude-float(projection_origin[0]))/360.0*earth
	var north := (log(tan(PI/4.0+deg_to_rad(clampf(latitude,-85.05112878,85.05112878))/2.0))-log(tan(PI/4.0+deg_to_rad(float(projection_origin[1]))/2.0)))/TAU*earth
	return Vector3(east,0,-north)

static func _world_to_mercator(point: Vector3,projection_origin: Array) -> Array:
	var earth := 40075016.68557849*cos(deg_to_rad(float(projection_origin[1])))/100.0
	return [(float(projection_origin[0])+180.0)/360.0+point.x/earth,(1.0-log(tan(PI/4.0+deg_to_rad(float(projection_origin[1]))/2.0))/PI)/2.0+point.z/earth]
