extends SceneTree

const Updater = preload("res://scripts/update_service.gd")
var failures := 0
var resumed_progress := false
var test_paths: Array[String] = []

func check(condition: bool, message: String) -> void:
	if not condition:
		failures += 1
		push_error(message)

func _initialize() -> void:
	call_deferred("_run")

func _run() -> void:
	var args := OS.get_cmdline_user_args()
	var base := args[1]
	var digest := args[2]
	var size := int(args[3])
	_test_packages(digest)
	var service := Updater.new()
	root.add_child(service)
	DirAccess.make_dir_recursive_absolute(ProjectSettings.globalize_path("user://updates"))
	var prefix := "user://updates/test-%d-" % OS.get_process_id()
	for scenario in ["interrupted", "ignore", "range416", "bad_range", "changed", "redirect", "identity", "retry", "cached", "corrupt", "persist"]:
		var path: String = prefix + scenario + ".part"
		test_paths.append(path)
		if scenario == "identity":
			var stale := FileAccess.open(path, FileAccess.WRITE)
			stale.store_buffer("stale unrelated payload".to_utf8_buffer())
			stale.close()
			var metadata := FileAccess.open(path + ".json", FileAccess.WRITE)
			metadata.store_string(JSON.stringify({"url":base + "/different", "sha256":digest, "size":size, "validator":"\"fixture-v1\""}))
			metadata.close()
		service.phase = "downloading"
		var result: Dictionary = await service._download_file(base + "/" + scenario, path, digest, size)
		if scenario == "bad_range":
			check(not result.get("ok", false), "Invalid Content-Range must fail")
			check(FileAccess.get_file_as_bytes(path).size() == 131072, "Invalid Content-Range must not append or destroy retained bytes")
		elif scenario == "corrupt":
			check(not result.get("ok", false), "Checksum mismatch must fail")
			check(not FileAccess.file_exists(path) or FileAccess.get_file_as_bytes(path).is_empty(), "Corrupt completed bytes must be discarded")
		elif scenario == "persist":
			check(not result.get("ok", false), "Three interrupted attempts must exhaust retries")
			check(FileAccess.file_exists(path), "Interrupted bytes must survive exhausted retries")
			if FileAccess.file_exists(path):
				check(FileAccess.get_file_as_bytes(path).size() > 0, "Retained file must contain received bytes")
			service.queue_free()
			await process_frame
			service = Updater.new()
			root.add_child(service)
			service.phase = "downloading"
			service.status_changed.connect(func():
				if service.progress > 0.0 and service.progress < 1.0:
					resumed_progress = true
			)
			result = await service._download_file(base + "/" + scenario, path, digest, size)
			check(result.get("ok", false), "New coordinator must resume retained file")
			check(resumed_progress, "Resume must report progress above zero before completion")
		else:
			check(result.get("ok", false), scenario + " download failed: " + str(result))
		if scenario not in ["corrupt", "bad_range"]:
			check(FileAccess.get_sha256(path) == digest, scenario + " produced wrong content")
		if scenario == "cached":
			result = await service._download_file(base + "/" + scenario, path, digest, size)
			check(result.get("ok", false), "Verified complete file must be reused")
	for path in test_paths:
		for suffix in ["", ".json"]:
			if FileAccess.file_exists(path + suffix):
				DirAccess.remove_absolute(ProjectSettings.globalize_path(path + suffix))
	service.queue_free()
	print("GRID_UPDATE_DOWNLOAD_SMOKE: %d failures" % failures)
	quit(1 if failures else 0)

func _test_packages(digest: String) -> void:
	var edge := {"from_version":"1.0.0", "to_version":"1.0.1", "content_mode":"changed-files-only", "url":Updater.RELEASE_PREFIX + "test/legacy.pck", "sha256":digest, "size_bytes":1, "files":["res://scripts/main.gd"]}
	var manifest := {"schema":1, "app_id":Updater.APP_ID, "version":"1.0.1", "patches":[edge]}
	check(Updater.validate_manifest(manifest).get("ok", false), "Legacy single-pack manifests remain supported")
	check(Updater._patch_payloads(edge).size() == 1, "Legacy edge selects one payload")
	edge["packages"] = []
	for category in ["models", "textures", "gameplay"]:
		edge["packages"].append({"category":category, "url":Updater.RELEASE_PREFIX + "test/" + category + ".pck", "sha256":digest, "size_bytes":1, "files":[]})
	check(Updater.validate_manifest(manifest).get("ok", false), "Three categorized packages permit empty changed-file sets")
	check(Updater._patch_payloads(edge).size() == 3, "Categorized edge selects packages without legacy duplicate")
	var broken: Dictionary = manifest.duplicate(true)
	broken["patches"][0]["packages"].pop_back()
	check(not Updater.validate_manifest(broken).get("ok", false), "Missing package class rejected")
	broken = manifest.duplicate(true)
	broken["patches"][0]["packages"][1]["category"] = "models"
	check(not Updater.validate_manifest(broken).get("ok", false), "Duplicate package class rejected")
	broken = manifest.duplicate(true)
	broken["patches"][0]["packages"][0]["files"] = ["res://../escape.gd"]
	check(not Updater.validate_manifest(broken).get("ok", false), "Unsafe categorized package path rejected")
	broken = manifest.duplicate(true)
	broken["patches"][0]["packages"][0]["url"] = "https://example.com/model.pck"
	check(not Updater.validate_manifest(broken).get("ok", false), "Untrusted categorized package origin rejected")
