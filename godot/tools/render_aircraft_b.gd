extends SceneTree
## Review renders for the B-series aircraft (A29B, GALAXY_B, SUPPORT_HELI_B):
## both factions, 1280 x 800, neutral light, framed from each model's bounds.
## godot --path godot --rendering-driver opengl3 --script tools/render_aircraft_b.gd -- [ROLES]

func _initialize() -> void:
	call_deferred("_render")

func bounds(node: Node3D, parent: Transform3D = Transform3D.IDENTITY) -> AABB:
	var xf := parent * node.transform
	var result := AABB()
	if node is MeshInstance3D: result = xf * node.get_aabb()
	for child in node.get_children():
		if child is Node3D:
			var box := bounds(child, xf)
			if box.size.length() > 0.0: result = box if result.size.length() == 0.0 else result.merge(box)
	return result

func _render() -> void:
	root.size = Vector2i(1280, 800)
	var scene := Node3D.new(); root.add_child(scene)
	var world := WorldEnvironment.new(); var env := Environment.new()
	env.background_mode = Environment.BG_COLOR; env.background_color = Color("8e9396")
	env.ambient_light_source = Environment.AMBIENT_SOURCE_COLOR; env.ambient_light_color = Color.WHITE; env.ambient_light_energy = 0.55
	world.environment = env; scene.add_child(world)
	var light := DirectionalLight3D.new(); light.rotation_degrees = Vector3(-50, -35, 0); light.light_energy = 0.9; light.shadow_enabled = true; light.directional_shadow_max_distance = 300.0; scene.add_child(light)
	var ground := MeshInstance3D.new(); var plane := PlaneMesh.new(); plane.size = Vector2(400, 400); ground.mesh = plane
	var ground_mat := StandardMaterial3D.new(); ground_mat.albedo_color = Color("6f7470"); ground.material_override = ground_mat; scene.add_child(ground)
	var camera := Camera3D.new(); scene.add_child(camera); camera.current = true; camera.far = 2000.0
	DirAccess.make_dir_recursive_absolute("res://build/aircraft-b-review")
	var roles := OS.get_cmdline_user_args()
	if roles.is_empty(): roles = PackedStringArray(["A29B", "GALAXY_B", "SUPPORT_HELI_B"])
	for role in roles:
		for team in 2:
			var model: Node3D = preload("res://scripts/browser_model_factory.gd").create(role, team)
			scene.add_child(model)
			var box := bounds(model); var r := box.size.length() * .5; var c := box.get_center()
			for view in [["front_left", Vector3(-.75, .45, -.8), 1.9], ["rear_right", Vector3(.8, .5, .85), 1.9], ["side", Vector3(-1, .12, 0), 1.9], ["top", Vector3(0, 1, .01), 1.8], ["close", Vector3(-.55, .35, -.75), .9], ["far", Vector3(-1, .8, -.9), 5.0]]:
				var dir: Vector3 = view[1].normalized()
				camera.fov = 38.0
				camera.position = c + dir * r * view[2]
				camera.look_at(c + (Vector3(0, 0, -r * .35) if view[0] == "close" else Vector3.ZERO))
				for frame in 4: await process_frame
				await RenderingServer.frame_post_draw
				root.get_texture().get_image().save_png("res://build/aircraft-b-review/%s_%s_%s.png" % [role.to_lower(), "blue" if team == 0 else "red", view[0]])
			model.queue_free(); await process_frame
	print("AIRCRAFT_B_RENDER_OK"); quit()
