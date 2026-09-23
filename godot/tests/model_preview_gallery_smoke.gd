extends SceneTree

var failures := 0

func _initialize() -> void:
	call_deferred("_run")

func check(condition: bool, message: String) -> void:
	if not condition:
		failures += 1
		push_error(message)

func _run() -> void:
	root.size = Vector2i(1280,800)
	var gallery = load("res://scripts/model_preview_gallery.gd").new()
	root.add_child(gallery)
	gallery.setup(root)
	gallery.show_gallery()
	await process_frame
	check(gallery.entries.size() >= 39,"Gallery omitted production model catalog entries or support variants.")
	check(gallery.viewport.render_target_update_mode == SubViewport.UPDATE_ALWAYS,"Gallery renderer did not start.")
	gallery.scrollbar.value = 220
	gallery._layout()
	var old_scroll: float = gallery.scrollbar.value
	gallery._focus(0)
	check(gallery.selected == 0 and gallery.close_focus.visible and not gallery.cards.visible,"Click did not switch grid to focused model.")
	var old_distance: float = gallery.distance
	var wheel := InputEventMouseButton.new()
	wheel.pressed = true; wheel.button_index = MOUSE_BUTTON_WHEEL_UP
	gallery._input_view(wheel)
	check(gallery.distance < old_distance,"Focused wheel input did not zoom in.")
	var press := InputEventMouseButton.new()
	press.pressed = true; press.button_index = MOUSE_BUTTON_LEFT
	gallery._input_view(press)
	var motion := InputEventMouseMotion.new(); motion.relative = Vector2(30,10)
	var old_yaw: float = gallery.yaw
	gallery._input_view(motion)
	check(not is_equal_approx(gallery.yaw,old_yaw),"Focused drag did not rotate camera.")
	gallery.close_focus.pressed.emit()
	check(gallery.selected == -1 and gallery.cards.visible,"X did not return to grid.")
	check(is_equal_approx(gallery.scrollbar.value,old_scroll),"Return to grid lost browsing position.")
	gallery._change_team(1)
	check(gallery.team == 1,"Faction selector did not update production models.")
	gallery.hide_gallery()
	check(gallery.viewport.render_target_update_mode == SubViewport.UPDATE_DISABLED,"Hidden gallery still rendered frames.")
	gallery.queue_free()
	await process_frame
	print("MODEL GALLERY SMOKE: ", "PASS" if failures == 0 else "FAIL")
	quit(0 if failures == 0 else 1)
