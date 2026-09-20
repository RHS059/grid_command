extends SceneTree

const Streamer = preload("res://scripts/geographic_streamer.gd")
const Geometry = preload("res://scripts/geographic_geometry.gd")
var failures := 0

func _initialize() -> void:
	_run.call_deferred()

func check(value: bool,message: String) -> void:
	if not value:
		failures += 1
		push_error(message)

func dense_tile(address: Vector3i) -> Dictionary:
	var pieces: Array = []
	for batch in range(2):
		var positions := PackedVector3Array()
		var indices := PackedInt32Array()
		positions.resize(24576)
		indices.resize(24576)
		for i in range(24576):
			positions[i] = Vector3(float(i%3),0,float((i+1)%3))
			indices[i] = i
		pieces.append({"role":0,"positions":positions,"indices":indices,"colors":PackedColorArray()})
	return {"address":address,"pieces":pieces,"local_origin":[0.0,0.0]}

func _run() -> void:
	var streamer := Streamer.new()
	root.add_child(streamer)
	streamer.set_process(false)
	streamer.max_cache_bytes = 4*1024*1024
	streamer.max_cached_tiles = 12
	streamer.frame_budget_usec = 3000
	streamer._manifest = {"palette":Geometry.PALETTE}
	streamer._shader = Shader.new()
	streamer._shader.code = Streamer.SHADER_SOURCE
	streamer._display_zoom = 12
	streamer._target_zoom = 12
	# All nine tiles fit the network estimates. Their decoded meshes do not.
	for i in range(9):
		var key := "12/%d/1409" % (2074+i)
		streamer._index[key] = {"key":key,"z":12,"x":2074+i,"y":1409,"bytes":65536,"remote":true}
		streamer._wanted[key] = i*i
	for key in streamer._wanted.keys():
		if not streamer._wanted.has(key):
			continue
		var descriptor: Dictionary = streamer._index[key]
		var result := dense_tile(Vector3i(12,int(descriptor["x"]),1409))
		streamer._request = {"key":key,"generation":streamer._generation,"descriptor":descriptor}
		streamer._thread = Thread.new()
		streamer._thread.start(func() -> Dictionary: return result)
		while streamer._thread.is_alive():
			await process_frame
		streamer._poll_worker()
		while not streamer._upload.is_empty():
			streamer._upload_piece()
			check(streamer.get_stats()["cache_bytes"] <= streamer.max_cache_bytes,"Actual decoded cache exceeded its byte cap during upload.")
		await process_frame
	var stats: Dictionary = streamer.get_stats()
	check(stats["loaded"] == 2,"Dense candidates did not retain the two nearest affordable tiles.")
	check(streamer._wanted.has("12/2074/1409") and streamer._wanted.has("12/2075/1409"),"Budget admission evicted a near tile before a far tile.")
	check(stats["wanted_tiles"] == 2 and stats["resident_tiles"] == 2,"Estimated far candidates remained wanted or resident.")
	check(stats["cache_bytes"] == 1572864,"Memory accounting did not use actual packed mesh arrays.")
	check(stats["cache_bytes"] <= streamer.max_cache_bytes/2,"Active LOD consumed the previous LOD reserve.")
	print("GEOGRAPHIC_DENSE_BUDGET: ",JSON.stringify(stats))
	streamer.free()
	if failures == 0:
		print("GRID_COMMAND_GEOGRAPHIC_BUDGET_SMOKE_OK: actual decoded bytes, nearest-first admission, bounded dense tile cache")
	quit(0 if failures == 0 else 1)
