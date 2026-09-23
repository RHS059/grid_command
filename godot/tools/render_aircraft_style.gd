extends SceneTree

func _initialize() -> void:
	call_deferred("run")

func bounds(node: Node3D, parent: Transform3D = Transform3D.IDENTITY) -> AABB:
	var transform := parent * node.transform
	var result := AABB()
	if node is MeshInstance3D: result = transform * node.get_aabb()
	for child in node.get_children():
		if child is Node3D:
			var box := bounds(child, transform)
			if box.size.length() > 0.0: result = box if result.size.length() == 0.0 else result.merge(box)
	return result

func run() -> void:
	root.size = Vector2i(1280, 800)
	var scene := Node3D.new(); root.add_child(scene)
	var world := WorldEnvironment.new(); var env := Environment.new()
	env.background_mode = Environment.BG_COLOR; env.background_color = Color("263642")
	env.ambient_light_source = Environment.AMBIENT_SOURCE_COLOR; env.ambient_light_color = Color.WHITE; env.ambient_light_energy = 0.65
	world.environment = env; scene.add_child(world)
	var light := DirectionalLight3D.new(); light.rotation_degrees = Vector3(-50,-35,0); light.light_energy = 0.85; scene.add_child(light)
	var camera := Camera3D.new(); camera.projection = Camera3D.PROJECTION_ORTHOGONAL; scene.add_child(camera); camera.current = true
	DirAccess.make_dir_recursive_absolute("res://build/aircraft-style-review")
	for kind in ["fighter", "cas", "recon_uav", "transport_heli", "cargo_plane"]:
		for team in 2:
			var role: String = "CAS_FIGHTER" if kind == "cas" else kind.to_upper()
			var model: Node3D = preload("res://scripts/browser_aircraft_models.gd").create(role, team) if role in ["CAS_FIGHTER", "TRANSPORT_HELI", "CARGO_PLANE"] else null
			if model == null: model = load("res://assets/models/%s.glb" % kind).instantiate()
			preload("res://scripts/air_naval_material.gd").apply(model, kind, team)
			var orient := Node3D.new(); scene.add_child(orient); orient.add_child(model)
			if kind == "fighter": model.rotation_degrees.x = -90.0
			var box := bounds(orient); var span := box.size.length(); var center := box.get_center()
			for view in ["close", "rear", "rts"]:
				camera.size = span * (2.6 if view == "rts" else 0.80)
				camera.position = center + Vector3(0.8,0.65,0.9 if view == "rear" else -0.9) * span
				camera.look_at(center)
				for frame in 4: await process_frame
				await RenderingServer.frame_post_draw
				root.get_texture().get_image().save_png("res://build/aircraft-style-review/%s_%s_%s.png" % [kind, "blue" if team == 0 else "red", view])
			orient.queue_free(); await process_frame
	print("AIRCRAFT_STYLE_RENDER_OK"); quit()
