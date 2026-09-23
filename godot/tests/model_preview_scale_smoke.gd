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
	var viewer = load("res://scripts/native_workspaces.gd").new()
	root.add_child(viewer)
	viewer.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	viewer._build_models()
	await process_frame
	viewer._load_model("CARGO_PLANE")
	check(is_equal_approx(viewer.model_span,53.0),"Cargo aircraft did not retain its canonical 53 m span.")
	check(viewer.distance > viewer.model_radius,"Camera did not frame full-scale aircraft.")
	var target: Vector3 = viewer.camera_target
	var press := InputEventMouseButton.new()
	press.button_index = MOUSE_BUTTON_RIGHT; press.pressed = true
	viewer._orbit_input(press)
	var motion := InputEventMouseMotion.new(); motion.relative = Vector2(30,10)
	viewer._orbit_input(motion)
	check(viewer.camera_target.distance_to(target) > 0,"Native model viewer did not pan.")
	var key := InputEventKey.new(); key.physical_keycode = KEY_D; key.pressed = true
	viewer._input(key)
	target = viewer.camera_target
	viewer._process(0.05)
	check(viewer.camera_target.distance_to(target) > 0,"Native model viewer did not move with WASD.")
	viewer._reset_view()
	check(viewer.move_keys.is_empty(),"Reset view did not clear camera movement.")
	check(viewer.camera_target.is_equal_approx(Vector3(0,viewer.model_height*0.5,0)),"Reset view did not restore target.")
	viewer.queue_free()
	await process_frame
	print("MODEL PREVIEW SCALE SMOKE: ", "PASS" if failures == 0 else "FAIL")
	quit(0 if failures == 0 else 1)

