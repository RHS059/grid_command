extends SceneTree

func _initialize() -> void:
	call_deferred("_run")

func click(control: Control) -> void:
	var point := control.get_global_rect().get_center()
	var motion := InputEventMouseMotion.new()
	motion.position = point
	root.push_input(motion)
	for down in [true, false]:
		var event := InputEventMouseButton.new()
		event.position = point
		event.button_index = MOUSE_BUTTON_LEFT
		event.pressed = down
		root.push_input(event)
		await process_frame

func _run() -> void:
	create_timer(25.0).timeout.connect(func(): push_error("HUD pointer test timed out."); quit(1))
	ProjectSettings.set_setting("geography/network_enabled",false)
	root.size = Vector2i(1440,900)
	# This test owns the updater state below. Suppress the normal deferred startup
	# request so it cannot race the manual-button scenario on CI.
	var updater = root.get_node("UpdateService")
	updater._check_started = true
	var world = load("res://scenes/main.tscn").instantiate()
	root.add_child(world)
	await process_frame
	await process_frame
	var hud = world.hud
	for title in ["Graphics & settings", "Controls & help"]:
		hud.close_panels()
		await click(hud.workspace_button)
		assert(hud.menu.visible,"Workspace menu must open from a real pointer event.")
		if DisplayServer.get_name() != "headless" and title == "Graphics & settings":
			await RenderingServer.frame_post_draw
			root.get_texture().get_image().save_png("res://hud-menu-preview.png")
		var target: Button
		for candidate in hud.menu.find_children("*","Button",true,false):
			if candidate.text.contains(title): target = candidate
		assert(target != null,"Missing menu entry: "+title)
		await click(target)
		assert(hud.drawer.visible and not hud.menu.visible,"Menu entry did not receive pointer input: "+title)
	hud.close_panels()
	await click(hud.workspace_button)
	updater._check_started = false
	updater.phase = "idle"
	var original_channel: String = ProjectSettings.get_setting("updates/channel_url")
	ProjectSettings.set_setting("updates/channel_url","https://invalid.example/test-channel")
	await click(hud.update_button)
	assert(updater.phase == "error" and hud.menu.visible and not hud.drawer.visible,"Update click must start checking inline and report failures without a modal.")
	ProjectSettings.set_setting("updates/channel_url",original_channel)
	updater.phase = "checking"
	updater.status_changed.emit()
	await process_frame
	await click(hud.update_button)
	assert(hud.menu.visible and not hud.drawer.visible,"Update check must remain inline in the menu.")
	updater.phase = "downloading"
	updater.progress = 0.42
	updater.status_changed.emit()
	await process_frame
	await process_frame
	hud._refresh_inline_update(0.2)
	assert(hud.update_caption.text == "Downloading Update 42%","Inline update must show measured download percentage.")
	assert(is_equal_approx(hud.update_fill.size.x,hud.update_button.size.x*0.42),"Inline fill must match download progress.")
	if DisplayServer.get_name() != "headless":
		await RenderingServer.frame_post_draw
		root.get_texture().get_image().save_png("res://hud-updates-preview.png")
	updater.phase = "applied"
	updater.progress = 1.0
	hud._refresh_inline_update(0.2)
	assert(hud.update_caption.text == "Update Applied")
	await click(hud.workspace_button)
	await click(hud.workspace_button)
	hud._refresh_inline_update(0.2)
	assert(hud.update_caption.text == "Check for updates","Applied acknowledgment must reset after reopening the menu.")
	updater.phase = "restart_required"
	hud._refresh_inline_update(0.2)
	assert(hud.update_caption.text == "Restart Required")
	updater.phase = "idle"
	updater.progress = 0.0
	updater.status_changed.emit()
	hud.close_panels()
	await process_frame
	for workspace_title in ["Model Preview", "SFX Designer"]:
		await click(hud.workspace_button)
		var workspace_button: Button
		for candidate in hud.menu.find_children("*","Button",true,false):
			if candidate.text.contains(workspace_title): workspace_button = candidate
		assert(workspace_button != null)
		await click(workspace_button)
		var active_workspace: Control = world.model_preview_gallery if workspace_title == "Model Preview" else world.native_workspaces
		assert(active_workspace != null and active_workspace.visible,"Workspace did not open: "+workspace_title)
		assert(not hud.visible,"Battlefield HUD overlaps workspace.")
		if DisplayServer.get_name() != "headless":
			await RenderingServer.frame_post_draw
			root.get_texture().get_image().save_png("res://"+workspace_title.to_lower().replace(" ","-")+"-preview.png")
		var return_button: Button
		for candidate in active_workspace.find_children("*","Button",true,false):
			if candidate.is_visible_in_tree() and (candidate.text.contains("Return") or candidate.text.contains("GRID COMMAND") or candidate.text.contains("Battlefield")):
				return_button = candidate
				break
		assert(return_button != null,"Missing return-to-battlefield button.")
		await click(return_button)
		assert(hud.visible and not active_workspace.visible)
	if DisplayServer.get_name() != "headless":
		await RenderingServer.frame_post_draw
		root.get_texture().get_image().save_png("res://hud-preview.png")
	print("GRID_COMMAND_HUD_INPUT_SMOKE_OK")
	quit(0)
