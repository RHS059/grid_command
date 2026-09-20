extends Node
## Persistent update coordinator. Only public release assets from this repository
## are accepted. SHA-256 checks integrity; trust comes from GitHub HTTPS.

signal status_changed

const APP_ID := "grid-command-godot"
const DEFAULT_CHANNEL := "https://github.com/RHS059/grid_command/releases/latest/download/godot-update.json"
const RELEASE_PREFIX := "https://github.com/RHS059/grid_command/releases/download/"
const RELEASE_PAGE := "https://github.com/RHS059/grid_command/releases/latest"
const CACHE_DIR := "user://updates"
const RECEIPT_PATH := CACHE_DIR + "/installed.json"
const MAX_MANIFEST_BYTES := 524288
const MAX_PATCH_BYTES := 536870912

var current_version := "0.1.0"
var base_version := "0.1.0"
var phase := "idle"
var status_text := "Updates are checked only when you select the button."
var manifest: Dictionary = {}
var pending_patches: Array[Dictionary] = []
var installed_patches: Array[Dictionary] = []
var session_snapshot: Dictionary = {}
var smoke_finished := false
var native_download_url := RELEASE_PAGE
var _http: HTTPRequest

func _init() -> void:
	base_version = str(ProjectSettings.get_setting("application/config/version", "0.1.0"))
	current_version = base_version
	# Packs must be mounted before the main scene preloads its dependencies.
	if not "--smoke-test" in OS.get_cmdline_user_args():
		_restore_installed_patches()

func is_busy() -> bool:
	return phase in ["checking", "downloading", "applying"]

func _status(next_phase: String, text: String) -> void:
	phase = next_phase
	status_text = text
	status_changed.emit()

func check_for_updates() -> void:
	if is_busy():
		return
	_status("checking", "Checking the public update channel...")
	var channel := str(ProjectSettings.get_setting("updates/channel_url", DEFAULT_CHANNEL))
	if channel != DEFAULT_CHANNEL and not channel.begins_with("https://raw.githubusercontent.com/RHS059/grid_command/"):
		_status("error", "The update channel address is not valid.")
		return
	var response: Dictionary = await _fetch(channel, "", MAX_MANIFEST_BYTES)
	if not response.get("ok", false):
		_status("error", "Cannot check for updates. Try again later.")
		return
	var body: PackedByteArray = response["body"]
	var parsed: Variant = JSON.parse_string(body.get_string_from_utf8())
	var validation := validate_manifest(parsed)
	if not validation.get("ok", false):
		_status("error", "The update manifest is not valid. No files were changed.")
		return
	manifest = parsed
	pending_patches.clear()
	if compare_versions(str(manifest["version"]), current_version) <= 0:
		_status("idle", "Version %s is current." % current_version)
		return
	native_download_url = str(manifest.get("download_url", RELEASE_PAGE))
	var engine := Engine.get_version_info()
	var engine_version := "%d.%d.%d" % [engine["major"], engine["minor"], engine["patch"]]
	if manifest.get("requires_restart", false) or compare_versions(engine_version, str(manifest.get("min_runtime_version", "4.3.0"))) < 0:
		_status("restart_required", "This update changes the native app. Install the new app. It takes effect on the next launch.")
		return
	pending_patches = patch_chain(manifest, current_version)
	if pending_patches.is_empty():
		_status("restart_required", "This version needs a new app download. Install it and use it on the next launch.")
		return
	# Autoloads and native settings cannot safely replace a running coordinator.
	for patch in pending_patches:
		for file_path in patch["files"]:
			if str(file_path) in ["res://scripts/update_service.gd", "res://scripts/update_service.gdc", "res://project.godot", "res://project.binary"] or str(file_path).ends_with(".gdextension"):
				_status("restart_required", "This update changes app startup files. Install the new app. It takes effect on the next launch.")
				return
	_status("available", "Version %s is ready. Download %d changed-file patch%s and keep this mission." % [manifest["version"], pending_patches.size(), "" if pending_patches.size() == 1 else "es"])

func apply_update() -> void:
	if phase != "available" or pending_patches.is_empty():
		return
	if DirAccess.make_dir_recursive_absolute(ProjectSettings.globalize_path(CACHE_DIR)) != OK:
		_status("error", "Cannot write the update folder. No files were changed.")
		return
	_status("downloading", "Downloading changed files...")
	var staged: Array[Dictionary] = []
	for index in range(pending_patches.size()):
		var patch := pending_patches[index].duplicate(true)
		var final_path := _patch_path(patch)
		var part_path := final_path + ".part"
		_status("downloading", "Downloading patch %d of %d..." % [index + 1, pending_patches.size()])
		var result: Dictionary = await _fetch(str(patch["url"]), part_path, int(patch.get("size_bytes", MAX_PATCH_BYTES)))
		if not result.get("ok", false):
			_remove_partial(part_path)
			_status("error", "The download did not finish. The current mission is unchanged.")
			return
		if not str(patch.get("sha256_url", "")).is_empty():
			var checksum_response: Dictionary = await _fetch(str(patch["sha256_url"]), "", 4096)
			if not checksum_response.get("ok", false):
				_remove_partial(part_path)
				_status("error", "Cannot get the checksum. No patch was applied.")
				return
			var checksum_bytes: PackedByteArray = checksum_response["body"]
			var checksum_fields := checksum_bytes.get_string_from_utf8().strip_edges().replace("\t", " ").split(" ", false)
			var checksum_text := checksum_fields[0].to_lower() if not checksum_fields.is_empty() else ""
			if checksum_text != str(patch["sha256"]).to_lower():
				_remove_partial(part_path)
				_status("error", "The update checksums do not match. No patch was applied.")
				return
		if FileAccess.get_sha256(part_path).to_lower() != str(patch["sha256"]).to_lower():
			_remove_partial(part_path)
			_status("error", "The file check failed. No patch was applied.")
			return
		if DirAccess.rename_absolute(ProjectSettings.globalize_path(part_path), ProjectSettings.globalize_path(final_path)) != OK:
			_remove_partial(part_path)
			_status("error", "Cannot save the verified patch. No patch was applied.")
			return
		patch["local_path"] = final_path
		staged.append(patch)
	# Verify the full chain before mounting any part of it.
	_status("applying", "Applying verified files. The mission will resume shortly.")
	var scene := get_tree().current_scene
	if scene == null or not scene.has_method("export_session_state"):
		_status("error", "This scene cannot keep the mission state. No patch was applied.")
		return
	session_snapshot = scene.export_session_state()
	scene.set_process(false)
	scene.set_process_unhandled_input(false)
	for patch in staged:
		if not ProjectSettings.load_resource_pack(str(patch["local_path"]), true):
			scene.set_process(true)
			scene.set_process_unhandled_input(true)
			session_snapshot.clear()
			_status("restart_required", "The patch could not load. Keep this mission, then install the new app for the next launch.")
			return
	# Keep the old scene alive until the replacement can be loaded and instanced.
	# A bad pack therefore cannot persist itself or leave only a blank viewport.
	for path in _changed_resources(staged):
		if ResourceLoader.exists(path):
			ResourceLoader.load(path, "", ResourceLoader.CACHE_MODE_REPLACE_DEEP)
	var main_scene := ResourceLoader.load("res://scenes/main.tscn", "PackedScene", ResourceLoader.CACHE_MODE_REPLACE_DEEP) as PackedScene
	var next_scene := main_scene.instantiate() if main_scene != null else null
	if next_scene == null:
		scene.set_process(true)
		scene.set_process_unhandled_input(true)
		session_snapshot.clear()
		_status("restart_required", "The patch did not start. The current mission is still active; install the new app on the next launch.")
		return
	current_version = str(manifest["version"])
	get_tree().root.add_child(next_scene)
	get_tree().current_scene = next_scene
	await get_tree().process_frame
	scene.queue_free()
	installed_patches.append_array(staged)
	var persisted := _save_receipt()
	_status("idle", "Version %s is active. The mission was kept.%s" % [current_version, "" if persisted else " The patch could not be saved for the next launch."])

func take_session_snapshot() -> Dictionary:
	var snapshot := session_snapshot
	session_snapshot = {}
	return snapshot

func open_native_download() -> void:
	if phase == "restart_required":
		OS.shell_open(native_download_url)

func _fetch(url: String, destination: String, limit: int) -> Dictionary:
	_http = HTTPRequest.new()
	_http.timeout = 60.0
	_http.max_redirects = 6
	_http.body_size_limit = mini(limit, MAX_PATCH_BYTES)
	_http.download_file = destination
	add_child(_http)
	var error := _http.request(url, PackedStringArray(["Accept: application/octet-stream", "User-Agent: GridCommand/" + current_version]))
	if error != OK:
		_http.queue_free()
		return {"ok": false}
	var reply: Array = await _http.request_completed
	_http.queue_free()
	return {"ok": reply[0] == HTTPRequest.RESULT_SUCCESS and reply[1] == 200, "body": reply[3]}

func _patch_path(patch: Dictionary) -> String:
	return CACHE_DIR.path_join(str(patch["sha256"]).to_lower() + ".pck")

func _remove_partial(path: String) -> void:
	if path.begins_with(CACHE_DIR + "/") and path.ends_with(".part") and FileAccess.file_exists(path):
		DirAccess.remove_absolute(ProjectSettings.globalize_path(path))

func _save_receipt() -> bool:
	var next_path := RECEIPT_PATH + ".tmp"
	var file := FileAccess.open(next_path, FileAccess.WRITE)
	if file == null:
		return false
	file.store_string(JSON.stringify({"base_version": base_version, "patches": installed_patches}))
	file.close()
	return DirAccess.rename_absolute(ProjectSettings.globalize_path(next_path), ProjectSettings.globalize_path(RECEIPT_PATH)) == OK

func _restore_installed_patches() -> void:
	if not FileAccess.file_exists(RECEIPT_PATH):
		return
	var receipt: Variant = JSON.parse_string(FileAccess.get_file_as_string(RECEIPT_PATH))
	if not receipt is Dictionary or receipt.get("base_version", "") != base_version or not receipt.get("patches", null) is Array:
		return
	var version := base_version
	var verified: Array[Dictionary] = []
	for patch in receipt["patches"]:
		if not patch is Dictionary or not _valid_patch(patch) or patch["from_version"] != version:
			status_text = "Saved updates are not valid. The base version is active."
			return
		var path := _patch_path(patch)
		if not FileAccess.file_exists(path) or FileAccess.get_sha256(path).to_lower() != str(patch["sha256"]).to_lower():
			status_text = "A saved update failed its file check. The base version is active."
			return
		patch["local_path"] = path
		verified.append(patch)
		version = str(patch["to_version"])
	for patch in verified:
		if not ProjectSettings.load_resource_pack(str(patch["local_path"]), true):
			status_text = "A saved patch could not load. Download a new app before the next launch."
			return
		installed_patches.append(patch)
		current_version = str(patch["to_version"])

static func _changed_resources(patches: Array[Dictionary]) -> Array[String]:
	var paths: Array[String] = []
	for patch in patches:
		for entry in patch["files"]:
			var path := str(entry)
			if not paths.has(path) and path.get_extension() in ["gd", "gdc", "tres", "res", "gdshader", "tscn", "scn"]:
				paths.append(path)
	# Dependencies first. Main's preload constants must see the new scripts.
	var priority := ["res://scripts/tactical_map.gd", "res://scripts/rts_camera.gd", "res://scripts/combat_unit.gd", "res://scripts/tactical_hud.gd", "res://scripts/main.gd", "res://scenes/main.tscn"]
	paths.sort_custom(func(a: String, b: String) -> bool:
		var ai := priority.find(a)
		var bi := priority.find(b)
		return (ai if ai >= 0 else -1) < (bi if bi >= 0 else -1))
	return paths

static func validate_manifest(value: Variant) -> Dictionary:
	if not value is Dictionary:
		return {"ok": false}
	if value.get("schema", 0) != 1 or value.get("app_id", "") != APP_ID or not valid_semver(str(value.get("version", ""))):
		return {"ok": false}
	if not value.get("patches", null) is Array or value["patches"].size() > 128:
		return {"ok": false}
	if not valid_semver(str(value.get("min_runtime_version", "4.3.0"))):
		return {"ok": false}
	if not value.get("requires_restart", false) is bool:
		return {"ok": false}
	var download := str(value.get("download_url", RELEASE_PAGE))
	if download != RELEASE_PAGE and not download.begins_with(RELEASE_PREFIX):
		return {"ok": false}
	for patch in value["patches"]:
		if not patch is Dictionary or not _valid_patch(patch):
			return {"ok": false}
	return {"ok": true}

static func _valid_patch(patch: Dictionary) -> bool:
	var from := str(patch.get("from_version", ""))
	var to := str(patch.get("to_version", ""))
	if not valid_semver(from) or not valid_semver(to) or compare_versions(to, from) <= 0:
		return false
	if patch.get("content_mode", "") != "changed-files-only":
		return false
	var url := str(patch.get("url", ""))
	if not url.begins_with(RELEASE_PREFIX) or not url.ends_with(".pck"):
		return false
	var hash := str(patch.get("sha256", "")).to_lower()
	if hash.length() != 64 or not hash.is_valid_hex_number(false):
		return false
	var checksum_url := str(patch.get("sha256_url", ""))
	if not checksum_url.is_empty() and (not checksum_url.begins_with(RELEASE_PREFIX) or not checksum_url.ends_with(".sha256")):
		return false
	if int(patch.get("size_bytes", 1)) < 1 or int(patch.get("size_bytes", MAX_PATCH_BYTES)) > MAX_PATCH_BYTES:
		return false
	if not patch.get("files", null) is Array or patch["files"].is_empty():
		return false
	for entry in patch["files"]:
		var path := str(entry)
		if not path.begins_with("res://") or ".." in path or "\\" in path or path.get_extension().to_lower() in ["exe", "dll", "so", "dylib"]:
			return false
	return true

static func patch_chain(value: Dictionary, installed_version: String) -> Array[Dictionary]:
	var result: Array[Dictionary] = []
	var cursor := installed_version
	# Breadth-first search selects the shortest complete sequence of deltas.
	var queue: Array[Dictionary] = [{"version": cursor, "path": []}]
	var seen := {cursor: true}
	while not queue.is_empty():
		var item: Dictionary = queue.pop_front()
		if compare_versions(str(item["version"]), str(value["version"])) == 0:
			for patch in item["path"]:
				result.append(patch)
			return result
		for patch in value["patches"]:
			if str(patch["from_version"]) != str(item["version"]) or seen.has(str(patch["to_version"])):
				continue
			var path: Array = item["path"].duplicate()
			path.append(patch)
			seen[str(patch["to_version"])] = true
			queue.append({"version": str(patch["to_version"]), "path": path})
	return result

static func valid_semver(version: String) -> bool:
	var expression := RegEx.new()
	expression.compile("^(0|[1-9][0-9]*)\\.(0|[1-9][0-9]*)\\.(0|[1-9][0-9]*)(?:-([0-9A-Za-z-]+(?:\\.[0-9A-Za-z-]+)*))?(?:\\+([0-9A-Za-z-]+(?:\\.[0-9A-Za-z-]+)*))?$")
	var found := expression.search(version)
	if found == null:
		return false
	for part in found.get_string(4).split("."):
		if part.is_valid_int() and part.length() > 1 and part.begins_with("0"):
			return false
	return true

static func compare_versions(a: String, b: String) -> int:
	var left := a.get_slice("+", 0).split("-", true, 1)
	var right := b.get_slice("+", 0).split("-", true, 1)
	var left_core := left[0].split(".")
	var right_core := right[0].split(".")
	for i in range(3):
		var l := int(left_core[i])
		var r := int(right_core[i])
		if l != r:
			return 1 if l > r else -1
	if left.size() == 1 and right.size() == 1:
		return 0
	if left.size() == 1 or right.size() == 1:
		return 1 if left.size() == 1 else -1
	var lp := left[1].split(".")
	var rp := right[1].split(".")
	for i in range(mini(lp.size(), rp.size())):
		if lp[i] == rp[i]:
			continue
		if lp[i].is_valid_int() and rp[i].is_valid_int():
			return 1 if int(lp[i]) > int(rp[i]) else -1
		if lp[i].is_valid_int() != rp[i].is_valid_int():
			return -1 if lp[i].is_valid_int() else 1
		return 1 if lp[i] > rp[i] else -1
	return 0 if lp.size() == rp.size() else 1 if lp.size() > rp.size() else -1

static func verify_bytes(bytes: PackedByteArray, expected_sha256: String) -> bool:
	var hash := HashingContext.new()
	hash.start(HashingContext.HASH_SHA256)
	hash.update(bytes)
	return hash.finish().hex_encode() == expected_sha256.to_lower()

func run_smoke_tests() -> bool:
	var known_hash := "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad"
	if not verify_bytes("abc".to_utf8_buffer(), known_hash) or verify_bytes("bad".to_utf8_buffer(), known_hash):
		return false
	if not valid_semver("1.2.3-rc.1+build.7") or valid_semver("1.02.3") or valid_semver("1.0.0-01"):
		return false
	if compare_versions("0.1.10", "0.1.9") <= 0 or compare_versions("1.0.0-rc.1", "1.0.0") >= 0 or compare_versions("1.0.0+build.1", "1.0.0+build.2") != 0:
		return false
	var patch := {"from_version": "0.1.0", "to_version": "0.1.1", "content_mode": "changed-files-only", "url": RELEASE_PREFIX + "godot-v0.1.1/update.pck", "sha256": known_hash, "files": ["res://scripts/main.gd"]}
	var second := patch.duplicate(true)
	second["from_version"] = "0.1.1"
	second["to_version"] = "0.1.2"
	var mock := {"schema": 1, "app_id": APP_ID, "version": "0.1.2", "patches": [patch, second]}
	if not validate_manifest(mock)["ok"] or patch_chain(mock, "0.1.0").size() != 2 or not patch_chain(mock, "0.0.9").is_empty():
		return false
	var bad := mock.duplicate(true)
	bad["patches"][0]["url"] = "https://example.com/untrusted.pck"
	if validate_manifest(bad)["ok"]:
		return false
	print("GRID_COMMAND_UPDATE_SMOKE_OK: semver, manifest, patch chain, SHA-256, rejected invalid origin; no network")
	smoke_finished = true
	return true
