extends SceneTree

func _initialize() -> void:
	call_deferred("_render")

func _render() -> void:
	root.size = Vector2i(1400, 1000)
	var scene := Node3D.new()
	root.add_child(scene)
	var tank: Node3D = load("res://assets/models/tank.glb").instantiate()
	scene.add_child(tank)
	preload("res://scripts/tank_material.gd").apply(tank)
	var stowage := VehicleGreebles.new()
	tank.add_child(stowage)
	stowage.build_tank_stowage(tank)
	stowage.set_process(false)
	var fire := TankFireEffects.new()
	scene.add_child(fire)
	fire.setup(tank, tank)
	var world := WorldEnvironment.new()
	var environment := Environment.new()
	environment.background_mode = Environment.BG_COLOR
	environment.background_color = Color("263642")
	environment.ambient_light_source = Environment.AMBIENT_SOURCE_COLOR
	environment.ambient_light_color = Color.WHITE
	environment.ambient_light_energy = 0.45
	world.environment = environment
	scene.add_child(world)
	var light := DirectionalLight3D.new()
	light.rotation_degrees = Vector3(-55, -40, 0)
	light.light_energy = 0.8
	light.shadow_enabled = true
	scene.add_child(light)
	var camera := Camera3D.new()
	scene.add_child(camera)
	camera.projection = Camera3D.PROJECTION_ORTHOGONAL
	camera.size = 15.0
	camera.position = Vector3(-10, 6, -13)
	camera.look_at(Vector3(0, 1.5, -2))
	camera.current = true
	DirAccess.make_dir_recursive_absolute("res://build/tank-fire-review")
	for sample in [["rest", -1.0], ["flash", 0.035], ["recoil", 0.10], ["settling", 0.30], ["settled", 1.25]]:
		fire.reset()
		if sample[1] >= 0.0:
			fire.fire()
			fire.set_process(false)
			fire._process(sample[1])
		for frame in 3: await process_frame
		await RenderingServer.frame_post_draw
		root.get_texture().get_image().save_png("res://build/tank-fire-review/" + sample[0] + ".png")
		print(sample[0], " recoil_degrees=", fire.recoil_degrees)
	print("GRID_COMMAND_TANK_FIRE_RENDER_OK")
	quit()
