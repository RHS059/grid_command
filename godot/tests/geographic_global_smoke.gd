extends SceneTree

const MVT = preload("res://scripts/geographic_mvt.gd")
const Geometry = preload("res://scripts/geographic_geometry.gd")
const Streamer = preload("res://scripts/geographic_streamer.gd")
const HTTP = preload("res://scripts/geographic_http.gd")
var failures := 0

func _initialize() -> void:
	call_deferred("_run")

func check(condition: bool,message: String) -> void:
	if not condition:
		failures += 1
		push_error(message)

func varint(number: int) -> PackedByteArray:
	var bytes := PackedByteArray()
	while number >= 128:
		bytes.append((number & 127)|128)
		number >>= 7
	bytes.append(number)
	return bytes

func field(number: int,value: PackedByteArray) -> PackedByteArray:
	return varint((number<<3)|2)+varint(value.size())+value

func geometry(paths: Array) -> PackedByteArray:
	var bytes := PackedByteArray()
	var cursor := Vector2i.ZERO
	for path in paths:
		for i in range(path.size()):
			if i == 0:
				bytes.append_array(varint(9))
			elif i == 1:
				bytes.append_array(varint(((path.size()-1)<<3)|2))
			var delta: Vector2i = path[i]-cursor
			cursor = path[i]
			bytes.append_array(varint((delta.x<<1)^(delta.x>>63)))
			bytes.append_array(varint((delta.y<<1)^(delta.y>>63)))
		bytes.append_array(varint(15))
	return bytes

func fixture() -> PackedByteArray:
	var paths := [[Vector2i(0,0),Vector2i(4096,0),Vector2i(4096,4096),Vector2i(0,4096)],[Vector2i(1024,1024),Vector2i(1024,3072),Vector2i(3072,3072),Vector2i(3072,1024)]]
	var feature := varint(24)+varint(3)+field(4,geometry(paths))
	var layer := field(1,"water".to_utf8_buffer())+field(2,feature)+varint(40)+varint(4096)+varint(120)+varint(2)
	return field(3,layer)

func _run() -> void:
	var bytes := fixture()
	var parsed: Dictionary = MVT.decode(bytes)
	check(not parsed.has("error"),"Synthetic PBF/MVT parser failed.")
	if parsed.has("error"):
		print(parsed)
		quit(1)
		return
	check(parsed["layers"]["water"]["features"][0]["paths"].size() == 2,"MVT polygon hole was lost.")
	check(MVT.decode(bytes.slice(0,bytes.size()-1)).has("error"),"Truncated PBF was accepted.")
	check(MVT.decode(PackedByteArray([26,255,255,255,255,127])).has("error"),"Oversized protobuf length was accepted.")
	check(MVT.decode(bytes,func() -> bool: return true).get("cancelled",false),"MVT cancellation failed.")
	var built: Dictionary = Geometry.new().build(parsed["layers"],Vector3i(12,2048,2048),[0.0,0.0])
	check(not built.has("error"),"Global geometry builder failed.")
	var water_area := 0.0
	for batch in built["pieces"]:
		if batch["role"] != 1:
			continue
		var vertices: PackedVector3Array = batch["positions"]
		var indices: PackedInt32Array = batch["indices"]
		for i in range(0,indices.size(),3):
			var a := vertices[indices[i]]
			var b := vertices[indices[i+1]]
			var c := vertices[indices[i+2]]
			water_area += (b-a).cross(c-a).length()*0.5
	var width := 40075016.68557849/100.0/4096.0
	check(absf(water_area-width*width*0.75) < 0.02,"Exact polygon tessellation filled the courtyard/hole or lost area.")
	var origin := [2.3522,48.8566]
	check(Streamer.project(2.3522,48.8566,origin).length() < 0.00001,"Arbitrary theater origin failed.")
	check(Streamer.project(2.36,48.86,origin).x > 0 and Streamer.project(2.36,48.86,origin).z < 0,"Global east/north convention failed.")
	# A distant origin must change only tile placement, never quantize its local
	# road widths or building outlines into large global float32 coordinates.
	var far_built := Geometry.new().build(parsed["layers"],Vector3i(12,3637,1612),[-117.08,32.82])
	var near_built := Geometry.new().build(parsed["layers"],Vector3i(12,3637,1612),[139.6917,32.82])
	check(far_built["pieces"].size() == near_built["pieces"].size(),"Distant tile geometry changed shape.")
	for i in range(far_built["pieces"].size()):
		check(far_built["pieces"][i]["positions"] == near_built["pieces"][i]["positions"],"Global offsets changed local mesh precision.")
	check(absf(float(far_built["local_origin"][0])) > 100000.0,"Distant-city precision fixture is not across the globe.")
	check(HTTP.fetch("http://example.invalid",Callable()).has("error"),"Plain HTTP must be rejected.")
	check(HTTP.fetch("https://example.invalid",func() -> bool: return true).get("cancelled",false),"HTTP cancellation must precede network work.")
	var reference_path := "res://data/generated/geographic-fixtures/reference.json"
	if FileAccess.file_exists(reference_path):
		var references: Array = JSON.parse_string(FileAccess.get_file_as_string(reference_path))
		for reference in references:
			var real_path := "res://data/generated/geographic-fixtures/"+str(reference["name"])+".pbf"
			var real := MVT.decode(FileAccess.get_file_as_bytes(real_path))
			check(not real.has("error"),"Real global MVT did not decode: "+str(reference["name"]))
			if not real.has("error"):
				for name in reference["layers"]:
					check(real["layers"].has(name) and real["layers"][name]["features"].size() == int(reference["layers"][name]),"MVT feature count differs from Mapbox reference: "+name)
				var address: Array = reference["address"]
				var result := Geometry.new().build(real["layers"],Vector3i(address[0],address[1],address[2]),reference["origin"])
				check(not result.has("error") and result["pieces"].size() >= 3,"Real global vector geometry was not built.")
				print("GLOBAL_GEOGRAPHY_",str(reference["name"]).to_upper(),": ",real["layers"].keys()," pieces=",result.get("pieces",[]).size())
	if "--network" in OS.get_cmdline_user_args():
		var trust := HTTP._trusted_certificates("")
		var certificates: X509Certificate = trust.get("certificates")
		check(certificates != null,"Geographic certificate roots did not load.")
		var streamer := Streamer.new()
		root.add_child(streamer)
		var network_cache := "res://data/generated/geographic-network-test-"+Crypto.new().generate_random_bytes(12).hex_encode()
		var setup_options := {"origin":origin,"tile_radius":0,"disk_cache_path":network_cache,"manifest_path":"res://data/generated/no-warm-cache.json"}
		for argument in OS.get_cmdline_user_args():
			if argument.begins_with("--ca="):
				setup_options["tls_ca_bundle"] = argument.trim_prefix("--ca=")
		check(streamer.setup(setup_options) == OK,"Global streamer setup failed without a warm catalog.")
		streamer.set_process(false)
		streamer.update_focus(Vector3.ZERO,12)
		var start := Time.get_ticks_msec()
		while streamer.get_stats()["loaded"] == 0 and Time.get_ticks_msec()-start < 45000:
			streamer.process_streaming()
			await process_frame
		check(streamer.get_stats()["loaded"] == 1 and streamer.get_stats()["failed"] == 0,"Live global HTTPS tile did not load without errors.")
		print("GLOBAL_GEOGRAPHY_NETWORK: ",JSON.stringify(streamer.get_stats()))
		if streamer.get_stats()["loaded"] == 1 and streamer.get_stats()["failed"] == 0:
			print("GRID_COMMAND_GLOBAL_GEOGRAPHIC_LIVE_OK: uncached Paris HTTPS tile, verified TLS, zero failures")
		root.remove_child(streamer)
		streamer.free()
	if failures == 0:
		print("GRID_COMMAND_GLOBAL_GEOGRAPHIC_SMOKE_OK: PBF validation, polygon holes, global projection, cancellation")
	quit(0 if failures == 0 else 1)
