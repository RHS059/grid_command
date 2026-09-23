extends SceneTree
## Run with --headless --path godot --script res://tests/update_startup_smoke.gd -- --smoke-test
## Network and native downloads are mocked; normal updater state transitions run.

class MockUpdater extends "res://scripts/update_service.gd":
	signal reply_ready
	var fetch_count := 0
	var native_count := 0
	var response := {}
	func _fetch(_url: String, _destination: String, _limit: int) -> Dictionary:
		fetch_count += 1
		await reply_ready
		return response
	func _stage_native_update() -> void:
		native_count += 1
		_status("restart_required", "Ready to restart.")

var failures := 0

func check(condition: bool, message: String) -> void:
	if not condition:
		failures += 1
		push_error(message)

func _initialize() -> void:
	_run.call_deferred()

func make_service() -> MockUpdater:
	var service := MockUpdater.new()
	root.add_child(service)
	service.current_version = "1.0.0"
	return service

func complete(service: MockUpdater, value: Dictionary) -> void:
	service.response = {"ok": true, "body": JSON.stringify(value).to_utf8_buffer()}
	service.reply_ready.emit()

func _run() -> void:
	var current := {"schema": 1, "app_id": MockUpdater.APP_ID, "version": "1.0.0", "patches": []}
	var service := make_service()
	service.check_on_startup()
	check(service.phase == "checking" and service.fetch_count == 1, "Startup starts asynchronously")
	await service.check_for_updates()
	await service.check_on_startup()
	check(service.fetch_count == 1, "Clicks and repeated startup calls cannot overlap requests")
	complete(service, current)
	check(service.phase == "idle", "Current release returns to idle")
	await service.check_on_startup()
	check(service.fetch_count == 1, "Scene recreation does not repeat startup check")
	service.free()

	service = make_service()
	service.check_for_updates()
	complete(service, current)
	await service.check_on_startup()
	check(service.fetch_count == 1, "Manual check before deferred startup counts as launch check")
	service.free()

	service = make_service()
	service.check_on_startup()
	service.response = {"ok": false}
	service.reply_ready.emit()
	check(service.phase == "error" and not service.is_busy(), "Offline failure leaves retry available")
	service.check_for_updates()
	complete(service, current)
	check(service.fetch_count == 2 and service.phase == "idle", "Manual retry succeeds after startup failure")
	service.free()

	var patch := {"from_version": "1.0.0", "to_version": "1.0.1", "content_mode": "changed-files-only", "url": MockUpdater.RELEASE_PREFIX + "test/update.pck", "sha256": "a".repeat(64), "files": ["res://scripts/main.gd"]}
	var newer := current.duplicate(true)
	newer["version"] = "1.0.1"
	newer["patches"] = [patch]
	service = make_service()
	service.check_on_startup()
	complete(service, newer)
	check(service.phase == "available" and service.pending_patches.size() == 1, "Startup exposes patches without applying them")
	check(service.native_count == 0 and service.progress == 0.0, "Startup does not download payloads")
	service.free()

	for reason in ["restart", "no_chain", "autoload"]:
		var native := newer.duplicate(true)
		if reason == "restart": native["requires_restart"] = true
		if reason == "no_chain": native["patches"] = []
		if reason == "autoload": native["patches"][0]["files"] = ["res://scripts/update_service.gd"]
		service = make_service()
		service.check_on_startup()
		complete(service, native)
		check(service.phase == "available" and service.native_count == 0 and service.pending_patches.is_empty(), reason + " offers native update without downloading")
		await service.apply_update()
		check(service.native_count == 1 and service.phase == "restart_required", reason + " downloads only after user action")
		await service.check_on_startup()
		check(service.phase == "restart_required" and service.fetch_count == 1, "Startup preserves restart-required state")
		service.free()

	service = make_service()
	service.phase = "restart_required"
	await service.check_on_startup()
	check(service.fetch_count == 0 and service.phase == "restart_required", "Already staged update survives startup scheduling")
	service.free()

	service = make_service()
	var manual_native := current.duplicate(true)
	manual_native["version"] = "1.0.1"
	service.check_for_updates()
	complete(service, manual_native)
	check(service.native_count == 1 and service.phase == "restart_required", "Manual check retains existing native staging behavior")
	service.free()
	print("GRID_UPDATE_STARTUP_SMOKE: %d failures" % failures)
	quit(1 if failures else 0)
