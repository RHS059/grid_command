extends SceneTree

func _initialize() -> void:
	call_deferred("_render")

func _render() -> void:
	root.size = Vector2i(1600, 1100)
	var scene := Node3D.new()
	root.add_child(scene)
	var tank: Node3D = load("res://assets/models/tank.glb").instantiate()
	scene.add_child(tank)
	preload("res://scripts/tank_material.gd").apply(tank)
	var stowage := preload("res://scripts/vehicle_greebles.gd").new()
	tank.add_child(stowage)
	stowage.build_tank_stowage(tank)
	stowage.set_process(false)
	var world := WorldEnvironment.new()
	var environment := Environment.new()
	environment.background_mode = Environment.BG_COLOR
	environment.background_color = Color("394957")
	environment.ambient_light_source = Environment.AMBIENT_SOURCE_COLOR
	environment.ambient_light_color = Color.WHITE
	environment.ambient_light_energy = 0.35
	world.environment = environment
	scene.add_child(world)
	var light := DirectionalLight3D.new()
	light.rotation_degrees = Vector3(-55, -40, 0)
	light.light_energy = 0.65
	light.shadow_enabled = true
	scene.add_child(light)
	var camera := Camera3D.new()
	scene.add_child(camera)
	camera.projection = Camera3D.PROJECTION_ORTHOGONAL
	camera.size = 7.8
	camera.position = Vector3(-7, 6, 10)
	camera.look_at(Vector3(0, 1.5, 0.5))
	camera.current = true
	DirAccess.make_dir_recursive_absolute("res://build/stowage-review")
	for view in ["rear", "slewed"]:
		if view == "slewed":
			var turret := tank.find_child("Assembly_turret", true, false) as Node3D
			turret.rotate_y(deg_to_rad(65.0))
		for frame in 3:
			await process_frame
		await RenderingServer.frame_post_draw
		root.get_texture().get_image().save_png("res://build/stowage-review/godot-tank-" + view + ".png")
	print("GRID_COMMAND_STOWAGE_RENDER_OK")
	quit()
