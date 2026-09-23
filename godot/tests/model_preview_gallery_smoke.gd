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
	var old_target: Vector3 = gallery.focus_target
	press.button_index = MOUSE_BUTTON_RIGHT
	gallery._input_view(press)
	gallery._input_view(motion)
	check(gallery.focus_target.distance_to(old_target) > 0,"Right drag did not pan the camera.")
	var key := InputEventKey.new()
	key.physical_keycode = KEY_W; key.pressed = true
	gallery._input(key)
	old_target = gallery.focus_target
	gallery._process(0.05)
	check(gallery.focus_target.distance_to(old_target) > 0,"WASD did not translate the focused camera.")
	key.pressed = false; gallery._input(key)
	check(gallery.move_keys.is_empty(),"Released movement key stayed active.")
	check(gallery.entries[0].pivot.scale.is_equal_approx(Vector3.ONE),"Focused model retained its thumbnail scale.")
	check(gallery.focus_grid.visible,"Focused view omitted its metre grid.")
	gallery.close_focus.pressed.emit()
	check(gallery.selected == -1 and gallery.cards.visible,"X did not return to grid.")
	check(is_equal_approx(gallery.scrollbar.value,old_scroll),"Return to grid lost browsing position.")
	gallery._change_team(1)
	check(gallery.team == 1,"Faction selector did not update production models.")
	var dimensions = load("res://scripts/model_dimensions.gd")
	check(is_equal_approx(dimensions.scale_factor("RIFLE",Vector3(0.5,1.7,0.5)),1.8/1.7),"Infantry stature did not normalize to metres.")
	check(is_equal_approx(dimensions.scale_factor("CARGO_PLANE",Vector3(20,10,30)),53.0/30.0),"Aircraft dimensions did not normalize to metres.")
	gallery.hide_gallery()
	check(gallery.viewport.render_target_update_mode == SubViewport.UPDATE_DISABLED,"Hidden gallery still rendered frames.")
	gallery.queue_free()
	await process_frame
	print("MODEL GALLERY SMOKE: ", "PASS" if failures == 0 else "FAIL")
	quit(0 if failures == 0 else 1)

