extends SceneTree

const Codec = preload("res://scripts/geographic_tile_codec.gd")
const Streamer = preload("res://scripts/geographic_streamer.gd")
var failures := 0

func _initialize() -> void:
	call_deferred("_run")

func check(condition: bool, message: String) -> void:
	if not condition:
		failures += 1
		push_error(message)

func fixture() -> PackedByteArray:
	var bytes := PackedByteArray()
	bytes.resize(28+16+9*4+3*4)
	for i in range(8):
		bytes[i] = Codec.MAGIC.unicode_at(i)
	bytes.encode_u32(8,1)
	bytes.encode_u32(12,0)
	bytes.encode_u32(16,0)
	bytes.encode_u32(20,1)
	bytes.encode_u32(24,1)
	bytes.encode_u32(28,1)
	bytes.encode_u32(32,3)
	bytes.encode_u32(36,3)
	bytes.encode_u32(40,0)
	var values := [0.0,0.1,0.0,10.0,0.1,0.0,0.0,0.1,10.0]
	for i in range(values.size()):
		bytes.encode_float(44+i*4,values[i])
	for i in range(3):
		bytes.encode_u32(80+i*4,i)
	return bytes

func drain(streamer: Node3D) -> void:
	var started := Time.get_ticks_msec()
	while not streamer.is_idle() and Time.get_ticks_msec()-started < 30000:
		streamer.process_streaming()
		await process_frame
	check(streamer.is_idle(),"Geographic streaming did not complete.")

func _run() -> void:
	var bytes := fixture()
	var decoded: Dictionary = Codec.decode(bytes)
	check(not decoded.has("error") and decoded["pieces"].size() == 1,"Valid binary fixture failed.")
	check(decoded["pieces"][0]["positions"][1] == Vector3(10,0.1,0),"Coordinates changed during decoding.")
	var bad := bytes.duplicate()
	bad.encode_u32(80,100)
	check(Codec.decode(bad).has("error"),"Out-of-range index was accepted.")
	check(Codec.decode(bytes.slice(0,bytes.size()-1)).has("error"),"Truncated tile was accepted.")
	check(Codec.decode(bytes,[],func() -> bool: return true).get("cancelled",false),"Worker cancellation was ignored.")
	var clipped: Dictionary = Codec.decode(bytes,[Rect2(2,2,4,4)])
	check(not clipped.has("error"),"Installation clipping failed.")
	var batch: Dictionary = clipped["pieces"][0]
	var positions: PackedVector3Array = batch["positions"]
	var indices: PackedInt32Array = batch["indices"]
	for i in range(0,indices.size(),3):
		var center := (positions[indices[i]]+positions[indices[i+1]]+positions[indices[i+2]])/3.0
		check(not Rect2(2.0001,2.0001,3.9998,3.9998).has_point(Vector2(center.x,center.z)),"Clipped triangle overlaps an installation.")
	var projection_origin := [-117.08,32.82]
	check(Streamer.project(-117.08,32.82,projection_origin).length() < 0.00001,"Origin does not match the browser.")
	check(Streamer.project(-117.0,32.82,projection_origin).x > 0,"East axis is reversed.")
	check(Streamer.project(-117.08,33.0,projection_origin).z < 0,"North axis is reversed.")
	check(absf(Streamer.project(-117.083,32.978,projection_origin).z+176.0416) < 0.001,"Objective C differs from browser Mercator projection.")
	var streamer := Streamer.new()
	root.add_child(streamer)
	var error := streamer.setup({"tile_radius":0,"max_cached_tiles":4,"frame_budget_usec":500,"network_enabled":false})
	check(error == OK,"Generate the geographic catalog before running its runtime smoke test.")
	if error == OK:
		streamer.set_process(false)
		check(streamer.get_stats()["loaded"] == 0,"setup() must load only metadata.")
		streamer.set_exclusion_rects([Rect2(-0.5,-0.5,1,1)])
		streamer.update_focus(Vector3.ZERO,12)
		await drain(streamer)
		var stats: Dictionary = streamer.get_stats()
		check(stats["loaded"] >= 1 and stats["failed"] == 0,"Real geographic tile failed to load.")
		check(streamer.get_child_count() >= 1,"Completed geographic tile was not published.")
		for tile in streamer.get_children():
			check(tile.get_child_count() > 0,"Published tile has no vector geometry.")
		streamer.update_focus(streamer.project_point(-117.2,32.7),12)
		streamer.process_streaming()
		streamer.update_focus(streamer.project_point(-117.05,33.0),12)
		await drain(streamer)
		check(streamer.get_stats()["resident_tiles"] <= 4,"Geographic cache exceeded its tile limit.")
		check(streamer.get_stats()["cache_bytes"] <= streamer.max_cache_bytes,"Geographic cache exceeded its byte limit.")
		print("GEOGRAPHIC_STATS: ",JSON.stringify(streamer.get_stats()))
		streamer.tile_radius = 1
		check(streamer.set_origin([139.6917,35.6895]) == OK,"Distant theater rebase failed.")
		check(streamer.project_point(139.6917,35.6895).length() < 0.00001,"Distant observer did not remain near zero.")
		check(streamer.tile_radius == 1 and not streamer.network_enabled,"Rebase changed runtime settings.")
		check(streamer.get_stats()["resident_tiles"] == 0 and streamer.get_stats()["cache_bytes"] == 0,"Rebase retained old-frame meshes.")
		check(streamer.set_origin(projection_origin) == OK and not streamer._index.is_empty(),"Return to theater lost the matching warm catalog.")
	streamer.free()
	if failures == 0:
		print("GRID_COMMAND_GEOGRAPHIC_SMOKE_OK: validated binary decoding, coordinates, exclusions, cancellation, threaded real tiles, bounded cache")
	quit(0 if failures == 0 else 1)
