extends SceneTree
## Review renders for the A-29B: both factions, 1280 x 800, neutral light.
## godot --path godot --rendering-driver opengl3 --script tools/render_a29b.gd

func _initialize() -> void:
	call_deferred("_render")

func _render() -> void:
	root.size = Vector2i(1280, 800)
	var scene := Node3D.new(); root.add_child(scene)
	var world := WorldEnvironment.new(); var env := Environment.new()
	env.background_mode = Environment.BG_COLOR; env.background_color = Color("8e9396")
	env.ambient_light_source = Environment.AMBIENT_SOURCE_COLOR; env.ambient_light_color = Color.WHITE; env.ambient_light_energy = 0.55
	world.environment = env; scene.add_child(world)
	var light := DirectionalLight3D.new(); light.rotation_degrees = Vector3(-50, -35, 0); light.light_energy = 0.9; light.shadow_enabled = true; scene.add_child(light)
	var ground := MeshInstance3D.new(); var plane := PlaneMesh.new(); plane.size = Vector2(80, 80); ground.mesh = plane
	var ground_mat := StandardMaterial3D.new(); ground_mat.albedo_color = Color("6f7470"); ground.material_override = ground_mat; scene.add_child(ground)
	var camera := Camera3D.new(); scene.add_child(camera); camera.current = true
	DirAccess.make_dir_recursive_absolute("res://build/a29b-review")
	for team in 2:
		var model: Node3D = preload("res://scripts/browser_model_factory.gd").create("CAS_FIGHTER", team)
		scene.add_child(model)
		for view in [["front_left", Vector3(-9, 4, -9), Vector3(0, 1.4, -.5), 38.0], ["rear_right", Vector3(9, 5, 10), Vector3(0, 1.5, 0), 38.0], ["side", Vector3(-15, 1.8, 0), Vector3(0, 1.8, 0), 38.0], ["top", Vector3(0, 20, 0.01), Vector3(0, 1, 0), 40.0], ["cockpit", Vector3(-4, 3.6, -4.2), Vector3(0, 2.1, -1.8), 35.0], ["far", Vector3(-30, 24, -26), Vector3(0, 1.5, 0), 30.0]]:
			camera.position = view[1]; camera.fov = view[3]; camera.look_at(view[2])
			for frame in 4: await process_frame
			await RenderingServer.frame_post_draw
			root.get_texture().get_image().save_png("res://build/a29b-review/a29b_%s_%s.png" % ["blue" if team == 0 else "red", view[0]])
		model.queue_free(); await process_frame
	print("A29B_RENDER_OK"); quit()
