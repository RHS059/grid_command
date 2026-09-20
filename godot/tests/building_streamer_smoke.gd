extends SceneTree

const Streamer = preload("res://scripts/building_streamer.gd")
var _failures := 0
var _temporary_files: Array[String] = []
var _temporary_dir := ""

func _initialize() -> void:
	call_deferred("_run")

func _check(condition: bool, message: String) -> void:
	if not condition:
		_failures += 1
		push_error(message)

func _write(name: String, data: Dictionary) -> void:
	var path := _temporary_dir.path_join(name)
	var file := FileAccess.open(path, FileAccess.WRITE)
	if file == null:
		_failures += 1
		return
	file.store_string(JSON.stringify(data))
	file.close()
	_temporary_files.append(path)

func _row(key: String, x: float, z: float) -> Array:
	return [key, x, z, 0, 0, 4, 4, 2, 6.4, 0, 0, "0", 0, [-2,-2,2,-2,2,2,-2,2], [x-8,z-8,x+8,z+8], 2]

func _drain(streamer: Node3D) -> void:
	var calls := 0
	while not streamer.is_idle() and calls < 20000:
		streamer.process_streaming(500)
		calls += 1
	_check(streamer.is_idle(), "Streaming work did not finish.")

func _check_staging(streamer: Node3D) -> void:
	# Force enough pending instances to span an upload budget. A camera refresh
	# used to reveal this cached sector before both batches were ready.
	_check(streamer._start_job("0_0"), "Cannot start staging regression sector.")
	for index in range(2048):
		streamer._add_building(_row("staging-%d" % index, 1000 + index, 1000))
	streamer._begin_upload()
	streamer._upload_instances(Time.get_ticks_usec() + 100)
	var cache: Dictionary = streamer.get("_cache")
	var entry: Dictionary = cache["0_0"]
	var staging_root: Node3D = entry["node"]
	_check(not entry["ready"], "Regression fixture must still be uploading.")
	_check(not staging_root.is_inside_tree(), "Incomplete sector entered the SceneTree.")
	streamer._select_sectors(Vector2(1000,1000), 0)
	_check(not staging_root.visible, "Camera refresh exposed an incomplete sector.")
	_check(streamer.get_stats()["visible_buildings"] == 0, "Incomplete buildings were counted as visible.")
	for batch in staging_root.get_children():
		_check(not batch.visible, "An incomplete batch can render default instances.")
		_check(batch.multimesh.visible_instance_count == 0, "Partially uploaded MultiMesh has visible default instances.")
	_drain(streamer)
	_check(entry["ready"] and staging_root.is_inside_tree() and staging_root.visible, "Completed sector was not published.")
	for batch in staging_root.get_children():
		_check(batch.visible and batch.multimesh.visible_instance_count == -1, "Completed batch was not enabled.")
	streamer.clear_catalog()

func _run() -> void:
	_temporary_dir = OS.get_environment("TEMP").path_join("grid-command-building-smoke-%d" % OS.get_process_id())
	_check(DirAccess.make_dir_recursive_absolute(_temporary_dir) == OK, "Cannot create test data.")
	var manifest := {"schema":1,"building_count":4,"module_m":4,"sector_size_m":2000,"styles":[["test","#526772","#263e48"]],"sectors":[
		{"key":[0,0],"file":"0_0.json","overlap_owners":[[1,0]]},
		{"key":[1,0],"file":"1_0.json","overlap_owners":[[2,0]]},
		{"key":[2,0],"file":"2_0.json","overlap_owners":[]}]}
	_write("manifest.json", manifest)
	_write("0_0.json", {"schema":1,"records":[_row("shared",1000,1000),_row("excluded",1100,1100)]})
	_write("1_0.json", {"schema":1,"records":[_row("shared",1000,1000),_row("owner",2100,1000)]})
	_write("2_0.json", {"schema":1,"records":[_row("far",4100,1000)]})
	var streamer := Streamer.new()
	root.add_child(streamer)
	streamer.set_process(false)
	_check(streamer.setup({"manifest_path":_temporary_dir.path_join("manifest.json"),"max_cached_sectors":2,"max_visible_sectors":1,"view_radius_m":0}) == OK, "Manifest setup failed.")
	_check(streamer.get_stats()["parsed"] == 0, "Setup must load the manifest only.")
	_check_staging(streamer)
	_check(streamer.setup({"manifest_path":_temporary_dir.path_join("manifest.json"),"max_cached_sectors":2,"max_visible_sectors":1,"view_radius_m":0}) == OK, "Manifest reload after regression test failed.")
	streamer.set_exclusion_rects([Rect2(10.9,10.9,0.2,0.2)])
	streamer.update_focus(Vector3(10,0,10), 0)
	_check(streamer.get_selected_sector_keys().size() == 2, "Direct overlap owner must be loaded.")
	_check(not streamer.get_selected_sector_keys().has("2_0"), "Overlap owners must not be expanded recursively.")
	_drain(streamer)
	var stats: Dictionary = streamer.get_stats()
	_check(stats["resident_buildings"] == 2, "Duplicate building key must have one resident instance.")
	_check(stats["duplicates"] == 1, "Duplicate row was not detected.")
	_check(stats["excluded"] == 1, "Installation exclusion did not remove the intersecting building.")
	_check(stats["resident_sectors"] == 2, "Unexpected resident cache count.")
	for sector in streamer.get_children():
		_check(sector.get_child_count() == 2, "Each complete sector must use two MultiMesh batches.")
	streamer.update_focus(Vector3(41,0,10), 0)
	_drain(streamer)
	stats = streamer.get_stats()
	_check(stats["resident_sectors"] <= 2, "Sector cache exceeded its configured limit.")
	_check(stats["evicted"] >= 1, "Cache failed to evict an unused sector.")
	_check(stats["visible_buildings"] == 1, "Camera move selected the wrong visible buildings.")
	streamer.set_enabled(false)
	_check(not streamer.visible, "Disabling the catalog must hide resident geometry.")
	streamer.set_enabled(true)
	_check(streamer.visible, "Enabling the catalog must restore visibility.")
	streamer.update_focus(Vector3(10,0,10), 0)
	streamer.process_streaming(100)
	streamer.update_focus(Vector3(41,0,10), 0)
	_drain(streamer)
	_check(streamer.get_stats()["resident_sectors"] <= 2, "Canceling an in-flight sector exceeded the cache limit.")
	streamer.clear_catalog()
	streamer.free()
	var catalog := Streamer.new()
	root.add_child(catalog)
	_check(catalog.setup({"max_cached_sectors":8,"max_visible_sectors":1,"view_radius_m":0}) == OK, "Real catalog manifest failed.")
	catalog.set_process(false)
	catalog.update_focus(Vector3(10,0,10), 0)
	_drain(catalog)
	stats = catalog.get_stats()
	_check(stats["catalog_buildings"] == 34483, "Unexpected catalog building count.")
	_check(stats["visible_buildings"] > 0 and stats["failed_sectors"] == 0, "Real sector stream failed.")
	_check(stats["invalid"] == 0, "Real sector has invalid footprint geometry.")
	print("BUILDING_STREAMER_STATS: ", JSON.stringify(stats))
	catalog.free()
	for path in _temporary_files:
		DirAccess.remove_absolute(path)
	DirAccess.remove_absolute(_temporary_dir)
	if _failures == 0:
		print("GRID_COMMAND_BUILDING_STREAMER_SMOKE_OK: manifest-only setup, nonrecursive owners, deduplication, exact footprints, installation exclusion, bounded cache, real catalog")
	quit(0 if _failures == 0 else 1)
