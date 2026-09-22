extends SceneTree
## Renders code-built support models from several angles for review.
## godot --path godot --script tools/render_support_model.gd -- TRUCK FUEL_TRUCK

func _initialize() -> void:
	call_deferred("_render")

func _render() -> void:
	var roles: Array = OS.get_cmdline_user_args()
	if roles.is_empty(): roles = ["TRUCK"]
	root.size = Vector2i(1280, 800)
	var scene := Node3D.new()
	root.add_child(scene)
	var world := WorldEnvironment.new()
	var environment := Environment.new()
	environment.background_mode = Environment.BG_COLOR
	environment.background_color = Color("263642")
	environment.ambient_light_source = Environment.AMBIENT_SOURCE_COLOR
	environment.ambient_light_color = Color.WHITE
	environment.ambient_light_energy = 0.55
	world.environment = environment
	scene.add_child(world)
	var light := DirectionalLight3D.new()
	light.rotation_degrees = Vector3(-50, -35, 0)
	light.light_energy = 0.9
	light.shadow_enabled = true
	scene.add_child(light)
	var ground := MeshInstance3D.new()
	var plane := PlaneMesh.new()
	plane.size = Vector2(60, 60)
	ground.mesh = plane
	var ground_mat := StandardMaterial3D.new()
	ground_mat.albedo_color = Color("1c2830")
	ground.material_override = ground_mat
	scene.add_child(ground)
	var camera := Camera3D.new()
	camera.projection = Camera3D.PROJECTION_ORTHOGONAL
	camera.size = 13.0
	scene.add_child(camera)
	camera.current = true
	DirAccess.make_dir_recursive_absolute("res://build/support-model-review")
	for role in roles:
		# ROLE:deployed renders a deployable body in its deployed state.
		var parts: PackedStringArray = str(role).split(":")
		var model: Node3D = preload("res://scripts/browser_model_factory.gd").create(parts[0], 0)
		if parts.size() > 1: BrowserSupportModels.set_deployed(model, parts[1] == "deployed")
		scene.add_child(model)
		for view in [["front_left", Vector3(-10, 6, -9), Vector3(0, 1.6, 0.5), 13.0], ["rear_right", Vector3(9, 6, 10), Vector3(0, 1.6, 0.5), 13.0], ["side", Vector3(-14, 2.2, 0), Vector3(0, 1.6, 0.5), 13.0], ["top", Vector3(-0.01, 16, 0), Vector3(0, 1.6, 0.5), 13.0], ["wheel", Vector3(-6, 2.2, -1.2), Vector3(-1.35, 0.7, -2.3), 4.2], ["cab", Vector3(-3.2, 3.4, -9), Vector3(0, 2.3, -3.2), 4.6], ["cab_side", Vector3(-7, 3.0, -1.5), Vector3(0, 2.4, -3.0), 4.6], ["far", Vector3(-30, 24, -26), Vector3(0, 1.6, 0), 40.0]]:
			camera.position = view[1]
			camera.size = view[3]
			camera.look_at(view[2], Vector3.UP if view[0] != "top" else Vector3.FORWARD)
			for frame in 3: await process_frame
			await RenderingServer.frame_post_draw
			root.get_texture().get_image().save_png("res://build/support-model-review/%s_%s.png" % [str(role).to_lower().replace(":", "_"), view[0]])
		model.queue_free()
		await process_frame
	print("GRID_COMMAND_SUPPORT_MODEL_RENDER_OK")
	quit()
