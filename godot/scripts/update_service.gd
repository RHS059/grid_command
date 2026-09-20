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
const DOWNLOAD_IDLE_TIMEOUT_MS := 30000
const DOWNLOAD_ATTEMPTS := 3
const DOWNLOAD_CHUNK_BYTES := 1048576
const PUBLIC_CA_BUNDLE := "res://data/certificates/mozilla-ca.pem"

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
var progress := 0.0
var staged_executable := ""
var staged_native_version := ""
var _download_base := 0.0
var _download_span := 1.0
var _last_download_percent := -1

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
	progress = 0.0
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
		await _stage_native_update()
		return
	pending_patches = patch_chain(manifest, current_version)
	if pending_patches.is_empty():
		await _stage_native_update()
		return
	# Autoloads and native settings cannot safely replace a running coordinator.
	for patch in pending_patches:
		for file_path in _patch_files(patch):
			if str(file_path) in ["res://scripts/update_service.gd", "res://scripts/update_service.gdc", "res://project.godot", "res://project.binary"] or str(file_path).ends_with(".gdextension"):
				await _stage_native_update()
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
	progress = 0.0
	var total_bytes := 0
	var completed_bytes := 0
	for patch in pending_patches:
		for payload in _patch_payloads(patch):
			total_bytes += int(payload.get("size_bytes",1))
	for pending in pending_patches:
		var patch := pending.duplicate(true)
		for payload in _patch_payloads(patch):
			var size := int(payload.get("size_bytes",1))
			_download_base = float(completed_bytes)/total_bytes
			_download_span = float(size)/total_bytes
			var final_path := _patch_path(payload)
			var part_path := final_path+".part"
			_status("downloading","Downloading %s files for version %s..." % [payload.get("category","changed"),patch["to_version"]])
			# Reuse already verified packages when a later package or apply failed.
			if not FileAccess.file_exists(final_path) or FileAccess.get_sha256(final_path).to_lower() != str(payload["sha256"]).to_lower():
				var result: Dictionary = await _download_file(str(payload["url"]),part_path,str(payload["sha256"]),int(payload.get("size_bytes",0)))
				if not result.get("ok",false):
					_status("error",str(result.get("error","The download was interrupted."))+" Saved progress will resume when you try again.")
					return
				# The manifest's SHA-256 is the integrity authority. A second checksum
				# request provides no extra trust and must not discard a good download.
				if DirAccess.rename_absolute(ProjectSettings.globalize_path(part_path),ProjectSettings.globalize_path(final_path)) != OK:
					_status("error","Cannot save the verified patch. Downloaded files are kept for retry.")
					return
				_remove_partial(part_path)
			payload["local_path"] = final_path
			completed_bytes += size
			progress = float(completed_bytes)/total_bytes
			status_changed.emit()
		staged.append(patch)
	# Verify the full chain before mounting any part of it.
	progress = 0.0
	_status("applying", "Applying verified files. The mission will resume shortly.")
	await get_tree().process_frame
	var scene := get_tree().current_scene
	if scene == null or not scene.has_method("export_session_state"):
		_status("error", "This scene cannot keep the mission state. No patch was applied.")
		return
	var update_menu_open: bool = bool(get_meta("update_menu_open",false))
	session_snapshot = scene.export_session_state()
	scene.set_process(false)
	scene.set_process_unhandled_input(false)
	for patch in staged:
		for payload in _patch_payloads(patch):
			if not ProjectSettings.load_resource_pack(str(payload["local_path"]), true):
				scene.set_process(true)
				scene.set_process_unhandled_input(true)
				session_snapshot.clear()
				_status("error", "The patch could not load. The mission is still active. Download the new app from the release page.")
				return
	progress = 0.5
	status_changed.emit()
	await get_tree().process_frame
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
		_status("error", "The patch did not start. The current mission is still active. Download the new app from the release page.")
		return
	current_version = str(manifest["version"])
	set_meta("update_menu_open",update_menu_open)
	progress = 0.85
	status_changed.emit()
	get_tree().root.add_child(next_scene)
	get_tree().current_scene = next_scene
	await get_tree().process_frame
	scene.queue_free()
	installed_patches.append_array(staged)
	var persisted := _save_receipt()
	progress = 1.0
	_status("applied", "Version %s is active. The mission was kept.%s" % [current_version, "" if persisted else " The patch could not be saved for the next launch."])

func take_session_snapshot() -> Dictionary:
	var snapshot := session_snapshot
	session_snapshot = {}
	return snapshot

func open_native_download() -> void:
	if phase == "restart_required":
		OS.shell_open(native_download_url)

func _stage_native_update() -> void:
	staged_executable = ""
	staged_native_version = ""
	if OS.get_name() != "Windows":
		_status("error","This update contains a Windows app. Download the release for your operating system.")
		return
	var url := str(manifest.get("download_url",""))
	if not url.begins_with(RELEASE_PREFIX) or not url.ends_with(".zip"):
		_status("error","This release has no Windows ZIP download. The current game remains active.")
		return
	var version := str(manifest.get("version",""))
	if not valid_semver(version) or compare_versions(version,current_version) <= 0:
		_status("error","The native update version is not newer than this game.")
		return
	var directory := CACHE_DIR.path_join("native").path_join(version)
	if DirAccess.make_dir_recursive_absolute(ProjectSettings.globalize_path(directory)) != OK:
		_status("error","Cannot create the update folder. The current game remains active.")
		return
	var archive := directory.path_join("download.zip.part")
	progress = 0.0
	_download_base = 0.0
	_download_span = 1.0
	_status("downloading","Downloading version %s..." % version)
	var result: Dictionary = await _download_file(url,archive,str(manifest.get("download_sha256","")),int(manifest.get("download_size_bytes",0)))
	if not result.get("ok",false):
		_status("error",str(result.get("error","The app download did not finish."))+" Saved progress will resume when you try again.")
		return
	progress = 0.0
	_status("applying","Preparing the new app. The current mission is still active.")
	await get_tree().process_frame
	var unpacked: Dictionary = await _unpack_native_archive(archive,directory)
	if not unpacked.get("ok",false):
		_status("error",str(unpacked.get("error","Cannot prepare this native app update.")))
		return
	staged_executable = str(unpacked["executable"])
	staged_native_version = version
	progress = 1.0
	_status("restart_required","Version %s is downloaded and ready. Restart the game to use it." % version)

func restart_game() -> void:
	if phase != "restart_required" or staged_executable.is_empty() or not FileAccess.file_exists(staged_executable):
		_status("error","No downloaded native update is ready. Check for updates first.")
		return
	if not valid_semver(staged_native_version) or compare_versions(staged_native_version,current_version) <= 0:
		_status("error","The downloaded app is not newer. The current game remains active.")
		return
	# Never launch another editor or terminate the test host.
	if OS.has_feature("editor") or Engine.is_editor_hint() or "--smoke-test" in OS.get_cmdline_user_args():
		_status("restart_required","The new app is ready. Automatic restart is available in the installed game.")
		return
	var executable := ProjectSettings.globalize_path(staged_executable)
	if executable == OS.get_executable_path():
		_status("error","The new app path matches the current app. Restart was cancelled.")
		return
	var process := OS.create_process(executable,PackedStringArray())
	if process <= 0:
		_status("error","The new game could not start. The current game remains active.")
		return
	get_tree().quit()

static func _safe_archive_path(path: String) -> bool:
	if path.is_empty() or path.begins_with("/") or "\\" in path or ":" in path or path.length() > 240:
		return false
	for component in path.trim_suffix("/").split("/"):
		if component.is_empty() or component in [".",".."] or component.ends_with(".") or component.ends_with(" "):
			return false
		var stem := component.get_slice(".",0).to_upper()
		if stem in ["CON","PRN","AUX","NUL","COM1","COM2","COM3","COM4","COM5","COM6","COM7","COM8","COM9","LPT1","LPT2","LPT3","LPT4","LPT5","LPT6","LPT7","LPT8","LPT9"]: return false
		for character in component:
			if character.unicode_at(0) < 32 or character in ["<",">","\"","|","?","*"]: return false
	return true

static func _native_archive_index(path: String) -> Dictionary:
	# Read central directory metadata before any decompression. This bounds both
	# expanded memory/disk usage and entry count, and rejects ZIP64 and symlinks.
	var file := FileAccess.open(path,FileAccess.READ)
	if file == null: return {"ok":false,"error":"Cannot read the downloaded archive."}
	var length := file.get_length()
	if length < 22 or length > MAX_PATCH_BYTES: return {"ok":false,"error":"The update archive size is not valid."}
	var tail_start := maxi(0,length-65557)
	file.seek(tail_start)
	var tail := file.get_buffer(length-tail_start)
	var end_offset := -1
	for index in range(tail.size()-22,-1,-1):
		if tail.decode_u32(index) == 0x06054b50 and index+22+tail.decode_u16(index+20) == tail.size():
			end_offset = index
			break
	if end_offset < 0: return {"ok":false,"error":"The downloaded file is not a supported ZIP archive."}
	var count := tail.decode_u16(end_offset+10)
	var directory_size := tail.decode_u32(end_offset+12)
	var directory_offset := tail.decode_u32(end_offset+16)
	if tail.decode_u16(end_offset+4) != 0 or tail.decode_u16(end_offset+6) != 0 or tail.decode_u16(end_offset+8) != count or count < 1 or count > 4096 or directory_size > 8388608 or directory_offset+directory_size > tail_start+end_offset:
		return {"ok":false,"error":"The update archive directory is not supported."}
	file.seek(directory_offset)
	var entries: Array[Dictionary] = []
	var expanded := 0
	var names := {}
	var executable := ""
	for index in range(count):
		var header := file.get_buffer(46)
		if header.size() != 46 or header.decode_u32(0) != 0x02014b50: return {"ok":false,"error":"The archive directory is damaged."}
		var flags := header.decode_u16(8)
		var method := header.decode_u16(10)
		var size_bytes := header.decode_u32(24)
		var name_length := header.decode_u16(28)
		var extra_length := header.decode_u16(30)
		var comment_length := header.decode_u16(32)
		var mode := (header.decode_u32(38)>>16)&0xf000
		var local_offset := header.decode_u32(42)
		if (flags&1) != 0 or method not in [0,8] or size_bytes > MAX_PATCH_BYTES or name_length < 1 or name_length > 1024 or mode == 0xa000 or local_offset >= directory_offset:
			return {"ok":false,"error":"The archive contains unsupported entries."}
		var name := file.get_buffer(name_length).get_string_from_utf8()
		if not _safe_archive_path(name) or names.has(name.to_lower()): return {"ok":false,"error":"The archive contains an unsafe or duplicate file path."}
		names[name.to_lower()] = true
		expanded += size_bytes
		if expanded > MAX_PATCH_BYTES: return {"ok":false,"error":"The expanded update exceeds 512 MB."}
		if name.get_file().to_lower() == "gridcommand.exe":
			if not executable.is_empty(): return {"ok":false,"error":"The archive contains more than one game executable."}
			executable = name
		entries.append({"name":name,"size":size_bytes})
		file.seek(file.get_position()+extra_length+comment_length)
		if file.get_position() > directory_offset+directory_size: return {"ok":false,"error":"The archive directory is truncated."}
	if executable.is_empty() or not names.has(executable.get_basename().to_lower()+".pck"):
		return {"ok":false,"error":"The update must include GridCommand.exe and its matching PCK file."}
	return {"ok":true,"entries":entries,"executable":executable,"expanded":expanded}

func _unpack_native_archive(archive: String, directory: String) -> Dictionary:
	if not directory.begins_with(CACHE_DIR+"/native/") or not valid_semver(directory.get_file()):
		return {"ok":false,"error":"The update destination is not valid."}
	var index := _native_archive_index(archive)
	if not index.get("ok",false): return index
	var reader := ZIPReader.new()
	if reader.open(archive) != OK: return {"ok":false,"error":"Cannot open the downloaded ZIP archive."}
	var bytes_written := 0
	for entry in index["entries"]:
		var name: String = entry["name"]
		var destination := directory.path_join(name)
		if name.ends_with("/"):
			if DirAccess.make_dir_recursive_absolute(ProjectSettings.globalize_path(destination)) != OK:
				reader.close()
				return {"ok":false,"error":"Cannot create the native update folder."}
			continue
		if DirAccess.make_dir_recursive_absolute(ProjectSettings.globalize_path(destination.get_base_dir())) != OK:
			reader.close()
			return {"ok":false,"error":"Cannot create an update subfolder."}
		var bytes := reader.read_file(name)
		if bytes.size() != int(entry["size"]):
			reader.close()
			return {"ok":false,"error":"An update file is damaged. The current game remains active."}
		var file := FileAccess.open(destination,FileAccess.WRITE)
		if file == null:
			reader.close()
			return {"ok":false,"error":"Cannot write the new app files."}
		file.store_buffer(bytes)
		var write_error := file.get_error()
		file.close()
		if write_error != OK:
			reader.close()
			return {"ok":false,"error":"The new app files could not be saved completely."}
		bytes_written += bytes.size()
		progress = float(bytes_written)/maxf(1,float(index["expanded"]))
		status_changed.emit()
		await get_tree().process_frame
	reader.close()
	var executable := directory.path_join(str(index["executable"]))
	return {"ok":true,"executable":executable}

func _download_progress(received: int, total: int) -> void:
	if total <= 0: return
	progress = clampf(_download_base+_download_span*float(received)/float(total),0.0,1.0)
	var percent := int(progress*100)
	if percent != _last_download_percent:
		_last_download_percent = percent
		status_changed.emit()

func _fetch(url: String, destination: String, limit: int) -> Dictionary:
	# Small manifests/checksums only. Payloads use _download_file below.
	_http = HTTPRequest.new()
	_http.timeout = 60.0
	_http.use_threads = true
	_http.set_tls_options(_download_tls_options())
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

func _download_file(url: String, destination: String, expected_sha256: String, expected_size: int = 0) -> Dictionary:
	if not destination.begins_with(CACHE_DIR+"/") or not destination.ends_with(".part") or ".." in destination:
		return {"ok":false,"error":"The download destination is not valid."}
	if expected_sha256.length() != 64 or not expected_sha256.is_valid_hex_number(false) or expected_size < 0 or expected_size > MAX_PATCH_BYTES:
		return {"ok":false,"error":"The download checksum or size is not valid."}
	var identity := {"url":url,"sha256":expected_sha256.to_lower(),"size":expected_size}
	var metadata := identity.duplicate()
	if FileAccess.file_exists(destination+".json"):
		var saved: Variant = JSON.parse_string(FileAccess.get_file_as_string(destination+".json"))
		if saved is Dictionary and saved.get("url") == url and saved.get("sha256") == identity["sha256"] and saved.get("size") == expected_size:
			metadata = saved
		else:
			_remove_partial(destination)
	elif FileAccess.file_exists(destination):
		# A legacy completed download is reusable after a full integrity check.
		if FileAccess.get_sha256(destination).to_lower() != identity["sha256"]:
			_remove_partial(destination)
	if DirAccess.make_dir_recursive_absolute(ProjectSettings.globalize_path(destination.get_base_dir())) != OK:
		return {"ok":false,"error":"Cannot create the download folder."}
	_last_download_percent = -1
	var result := {"ok":false,"error":"The download was interrupted."}
	for attempt in range(DOWNLOAD_ATTEMPTS):
		var saved_size := _file_size(destination)
		var total := expected_size if expected_size > 0 else int(metadata.get("total",0))
		if saved_size > MAX_PATCH_BYTES or (total > 0 and saved_size > total):
			_remove_partial(destination)
			saved_size = 0
		# Completed files survive checksum-fetch, staging, and application failures.
		if saved_size > 0 and (total <= 0 or saved_size == total) and FileAccess.get_sha256(destination).to_lower() == identity["sha256"]:
			_download_progress(saved_size,saved_size)
			return {"ok":true,"cached":true}
		_download_progress(saved_size,total)
		if not _save_download_metadata(destination,metadata):
			return {"ok":false,"error":"Cannot save download progress."}
		result = await _download_attempt(url,destination,metadata)
		if result.get("ok",false):
			if FileAccess.get_sha256(destination).to_lower() == identity["sha256"]:
				_download_progress(_file_size(destination),_file_size(destination))
				return {"ok":true}
			# Corrupt bytes cannot be resumed. Only this payload must be downloaded again.
			_remove_partial(destination)
			metadata = identity.duplicate()
			result = {"ok":false,"retryable":true,"error":"The downloaded file failed its checksum."}
		elif result.get("reset",false):
			_remove_partial(destination)
			metadata = identity.duplicate()
		if not result.get("retryable",false): break
		if attempt+1 < DOWNLOAD_ATTEMPTS:
			status_text = "Connection interrupted. Resuming saved download (attempt %d of %d)..." % [attempt+2,DOWNLOAD_ATTEMPTS]
			status_changed.emit()
			await get_tree().create_timer(float(attempt+1)).timeout
	return result

static func _file_size(path: String) -> int:
	var file := FileAccess.open(path,FileAccess.READ)
	return file.get_length() if file != null else 0

static func _save_download_metadata(destination: String, metadata: Dictionary) -> bool:
	var file := FileAccess.open(destination+".json.tmp",FileAccess.WRITE)
	if file == null: return false
	file.store_string(JSON.stringify(metadata))
	file.close()
	return DirAccess.rename_absolute(ProjectSettings.globalize_path(destination+".json.tmp"),ProjectSettings.globalize_path(destination+".json")) == OK

static func _download_url_parts(url: String) -> Dictionary:
	var expression := RegEx.new()
	expression.compile("^(https?)://([^/:?#]+)(?::([0-9]+))?(/[^#]*)?$")
	var found := expression.search(url)
	if found == null: return {}
	var secure := found.get_string(1) == "https"
	var host := found.get_string(2)
	if "@" in host or "\r" in url or "\n" in url: return {}
	# Loopback HTTP is used by the offline regression harness only. Public
	# manifest URLs are validated independently and must use GitHub HTTPS.
	if not secure and host != "127.0.0.1": return {}
	var port := int(found.get_string(3)) if not found.get_string(3).is_empty() else (443 if secure else 80)
	if port < 1 or port > 65535: return {}
	return {"host":host,"port":port,"tls":secure,"path":found.get_string(4) if not found.get_string(4).is_empty() else "/"}

static func _download_tls_options() -> TLSOptions:
	# The bundled public roots also work when Windows' system certificate store
	# cannot be decoded by mbedTLS. Certificate and hostname checks stay enabled.
	if FileAccess.file_exists(PUBLIC_CA_BUNDLE):
		var certificates := X509Certificate.new()
		if certificates.load_from_string(FileAccess.get_file_as_string(PUBLIC_CA_BUNDLE)) == OK:
			return TLSOptions.client(certificates)
	return TLSOptions.client()

static func _range_response(code: int, headers: Dictionary, offset: int, expected: int) -> Dictionary:
	if code == 416:
		return {"ok":false,"retryable":true,"reset":true,"error":"The server rejected the saved download range."}
	if code not in [200,206]:
		return {"ok":false,"retryable":code in [408,429,500,502,503,504],"error":"The download server returned HTTP %d." % code}
	if str(headers.get("content-encoding","identity")).to_lower() != "identity":
		return {"ok":false,"error":"The download server returned an unsupported encoding."}
	var length := int(headers.get("content-length","0"))
	var total := length
	var start := 0
	var end := length-1
	if code == 206:
		var expression := RegEx.new()
		expression.compile("^bytes ([0-9]+)-([0-9]+)/([0-9]+)$")
		var found := expression.search(str(headers.get("content-range","")))
		if found == null: return {"ok":false,"error":"The server returned an invalid download range."}
		start = int(found.get_string(1))
		end = int(found.get_string(2))
		total = int(found.get_string(3))
		if start != offset or end < start or end >= total or (length > 0 and length != end-start+1):
			return {"ok":false,"error":"The server returned a mismatched download range."}
		length = end-start+1
	if total < 0 or total > MAX_PATCH_BYTES or (expected > 0 and total > 0 and total != expected):
		return {"ok":false,"error":"The download size does not match the manifest."}
	return {"ok":true,"offset":start,"total":total if total > 0 else expected,"length":length}

func _download_attempt(url: String, destination: String, metadata: Dictionary) -> Dictionary:
	var offset := _file_size(destination)
	var client := HTTPClient.new()
	client.read_chunk_size = DOWNLOAD_CHUNK_BYTES
	var request_url := url
	var headers := {}
	var response := {}
	for redirect in range(7):
		var parts := _download_url_parts(request_url)
		if parts.is_empty(): return {"ok":false,"error":"The download redirect is not valid."}
		var connect_error := client.connect_to_host(str(parts["host"]),int(parts["port"]),_download_tls_options() if parts["tls"] else null)
		if connect_error != OK: return {"ok":false,"retryable":true,"error":"Cannot connect to the download server."}
		var last_activity := Time.get_ticks_msec()
		while client.get_status() in [HTTPClient.STATUS_RESOLVING,HTTPClient.STATUS_CONNECTING]:
			client.poll()
			if Time.get_ticks_msec()-last_activity > DOWNLOAD_IDLE_TIMEOUT_MS:
				client.close()
				return {"ok":false,"retryable":true,"error":"The download connection timed out."}
			await get_tree().process_frame
		if client.get_status() != HTTPClient.STATUS_CONNECTED:
			client.close()
			return {"ok":false,"retryable":true,"error":"Cannot connect to the download server."}
		var request_headers := PackedStringArray(["Accept: application/octet-stream","Accept-Encoding: identity","User-Agent: GridCommand/"+current_version])
		if offset > 0:
			request_headers.append("Range: bytes=%d-" % offset)
			var validator := str(metadata.get("validator",""))
			if not validator.is_empty() and not "\r" in validator and not "\n" in validator:
				request_headers.append("If-Range: "+validator)
		if client.request(HTTPClient.METHOD_GET,str(parts["path"]),request_headers) != OK:
			client.close()
			return {"ok":false,"retryable":true,"error":"Cannot request the update file."}
		last_activity = Time.get_ticks_msec()
		while client.get_status() == HTTPClient.STATUS_REQUESTING:
			client.poll()
			if Time.get_ticks_msec()-last_activity > DOWNLOAD_IDLE_TIMEOUT_MS:
				client.close()
				return {"ok":false,"retryable":true,"error":"The download server did not respond."}
			await get_tree().process_frame
		if not client.has_response():
			client.close()
			return {"ok":false,"retryable":true,"error":"The download server disconnected."}
		headers.clear()
		var response_headers := client.get_response_headers_as_dictionary()
		for name in response_headers:
			headers[str(name).to_lower()] = response_headers[name]
		var code := client.get_response_code()
		if code in [301,302,303,307,308]:
			var location := str(headers.get("location",""))
			if location.begins_with("/") and not location.begins_with("//"):
				location = request_url.get_slice("://",0)+"://"+request_url.get_slice("://",1).get_slice("/",0)+location
			# Never downgrade an HTTPS download, even through a redirect.
			if redirect == 6 or (request_url.begins_with("https://") and not location.begins_with("https://")):
				client.close()
				return {"ok":false,"error":"The download redirect is not valid."}
			request_url = location
			client.close()
			continue
		response = _range_response(code,headers,offset,int(metadata.get("size",0)))
		break
	if not response.get("ok",false):
		client.close()
		return response
	var validator := str(headers.get("etag",""))
	if validator.begins_with("W/"): validator = ""
	if validator.is_empty(): validator = str(headers.get("last-modified",""))
	if int(response["offset"]) > 0 and not str(metadata.get("validator","")).is_empty() and not validator.is_empty() and metadata["validator"] != validator:
		client.close()
		return {"ok":false,"retryable":true,"reset":true,"error":"The update file changed on the server."}
	if not validator.is_empty() or int(response["offset"]) == 0:
		metadata["validator"] = validator
	metadata["total"] = response["total"]
	if not _save_download_metadata(destination,metadata):
		client.close()
		return {"ok":false,"error":"Cannot save download progress."}
	# Only a validated 206 may append. A 200 means Range was unsupported or
	# If-Range failed, so replace safely instead of concatenating two files.
	var file := FileAccess.open(destination,FileAccess.READ_WRITE if int(response["offset"]) > 0 else FileAccess.WRITE)
	if file == null:
		client.close()
		return {"ok":false,"error":"Cannot write the update file."}
	file.seek_end()
	var received := int(response["offset"])
	var body_received := 0
	var last_activity := Time.get_ticks_msec()
	var flushed := received
	var result := {"ok":false,"retryable":true,"error":"The download was interrupted. Saved progress will resume next time."}
	while client.get_status() == HTTPClient.STATUS_BODY:
		var frame_deadline := Time.get_ticks_usec()+4000
		while client.get_status() == HTTPClient.STATUS_BODY and Time.get_ticks_usec() < frame_deadline:
			client.poll()
			var chunk := client.read_response_body_chunk()
			if chunk.is_empty(): break
			if received+chunk.size() > MAX_PATCH_BYTES or (int(response["total"]) > 0 and received+chunk.size() > int(response["total"])):
				file.close()
				client.close()
				return {"ok":false,"error":"The download exceeded its expected size."}
			file.store_buffer(chunk)
			if file.get_error() != OK:
				file.close()
				client.close()
				return {"ok":false,"error":"Cannot save the update file. Check free disk space."}
			received += chunk.size()
			body_received += chunk.size()
			last_activity = Time.get_ticks_msec()
			if received-flushed >= 4194304:
				file.flush()
				flushed = received
		_download_progress(received,int(response["total"]))
		if Time.get_ticks_msec()-last_activity > DOWNLOAD_IDLE_TIMEOUT_MS: break
		if client.get_status() == HTTPClient.STATUS_BODY: await get_tree().process_frame
	file.close()
	var total := int(response["total"])
	var length := int(response["length"])
	if (total > 0 and received == total and (length <= 0 or body_received == length)) or (total <= 0 and client.get_status() == HTTPClient.STATUS_CONNECTED):
		result = {"ok":true}
	client.close()
	return result

func _patch_path(patch: Dictionary) -> String:
	return CACHE_DIR.path_join(str(patch["sha256"]).to_lower() + ".pck")

func _remove_partial(path: String) -> void:
	if path.begins_with(CACHE_DIR + "/") and path.ends_with(".part"):
		for suffix in ["",".json",".json.tmp"]:
			if FileAccess.file_exists(path+suffix): DirAccess.remove_absolute(ProjectSettings.globalize_path(path+suffix))

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
		for payload in _patch_payloads(patch):
			var path := _patch_path(payload)
			if not FileAccess.file_exists(path) or FileAccess.get_sha256(path).to_lower() != str(payload["sha256"]).to_lower():
				status_text = "A saved update failed its file check. The base version is active."
				return
			payload["local_path"] = path
		verified.append(patch)
		version = str(patch["to_version"])
	for patch in verified:
		for payload in _patch_payloads(patch):
			if not ProjectSettings.load_resource_pack(str(payload["local_path"]), true):
				status_text = "A saved patch could not load. Download a new app before the next launch."
				return
		installed_patches.append(patch)
		current_version = str(patch["to_version"])

static func _changed_resources(patches: Array[Dictionary]) -> Array[String]:
	var paths: Array[String] = []
	for patch in patches:
		for entry in _patch_files(patch):
			var path := str(entry)
			if not paths.has(path) and path.get_extension() in ["gd", "gdc", "tres", "res", "gdshader", "tscn", "scn", "glb", "gltf", "mesh", "material", "png", "jpg", "jpeg", "webp", "svg", "ctex"]:
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
	var native_hash := str(value.get("download_sha256",""))
	if not native_hash.is_empty() and (native_hash.length() != 64 or not native_hash.is_valid_hex_number(false)):
		return {"ok":false}
	if value.has("download_size_bytes") and (not _valid_size(value["download_size_bytes"])):
		return {"ok":false}
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
	if not _valid_payload(patch,false): return false
	if patch.has("packages"):
		if not patch["packages"] is Array or patch["packages"].size() != 3: return false
		var categories := {}
		var files := {}
		for payload in patch["packages"]:
			if not payload is Dictionary or not _valid_payload(payload,true): return false
			var category := str(payload.get("category",""))
			if category not in ["models","textures","gameplay"] or categories.has(category): return false
			categories[category] = true
			for file_path in payload["files"]:
				if files.has(file_path): return false
				files[file_path] = true
	return true

static func _valid_size(value: Variant) -> bool:
	return (value is int or value is float) and float(value) == floorf(float(value)) and int(value) >= 1 and int(value) <= MAX_PATCH_BYTES

static func _valid_payload(payload: Dictionary, allow_empty_files: bool) -> bool:
	var url := str(payload.get("url", ""))
	if not url.begins_with(RELEASE_PREFIX) or not url.ends_with(".pck"):
		return false
	var hash := str(payload.get("sha256", "")).to_lower()
	if hash.length() != 64 or not hash.is_valid_hex_number(false):
		return false
	var checksum_url := str(payload.get("sha256_url", ""))
	if not checksum_url.is_empty() and (not checksum_url.begins_with(RELEASE_PREFIX) or not checksum_url.ends_with(".sha256")):
		return false
	if (allow_empty_files and not payload.has("size_bytes")) or not _valid_size(payload.get("size_bytes",1)):
		return false
	if not payload.get("files", null) is Array or (payload["files"].is_empty() and not allow_empty_files):
		return false
	for entry in payload["files"]:
		var path := str(entry)
		if not path.begins_with("res://") or ".." in path or "\\" in path or path.get_extension().to_lower() in ["exe", "dll", "so", "dylib"]:
			return false
	return true

static func _patch_payloads(patch: Dictionary) -> Array[Dictionary]:
	var payloads: Array[Dictionary] = []
	if patch.has("packages"):
		# Models/textures are mounted before gameplay resources are reloaded.
		for category in ["models","textures","gameplay"]:
			for payload in patch["packages"]:
				if payload["category"] == category: payloads.append(payload)
	else:
		payloads.append(patch)
	return payloads

static func _patch_files(patch: Dictionary) -> Array[String]:
	var files: Array[String] = []
	for path in patch["files"]: files.append(str(path))
	if patch.has("packages"):
		for payload in patch["packages"]:
			for path in payload["files"]:
				if not files.has(str(path)): files.append(str(path))
	return files

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
	for path in ["../escape.exe","C:/escape.exe","/escape.exe","folder/../escape.exe","CON.txt"]:
		if _safe_archive_path(path): return false
	if not _safe_archive_path("game/GridCommand.exe"): return false
	print("GRID_COMMAND_UPDATE_SMOKE_OK: semver, manifest, patch chain, SHA-256, rejected invalid origin; no network")
	smoke_finished = true
	return true
