extends SceneTree

func _initialize() -> void:
	call_deferred("_render")

func _bounds(node: Node, bounds: AABB) -> AABB:
	if node is MeshInstance3D:
		bounds = bounds.merge(node.global_transform * node.get_aabb())
	for child in node.get_children(): bounds = _bounds(child, bounds)
	return bounds

func _focus(node: Node) -> MeshInstance3D:
	if node is MeshInstance3D and str(node.name) in ["superstructure", "island"]: return node
	for child in node.get_children():
		var found := _focus(child)
		if found != null: return found
	return null

func _render() -> void:
	root.size = Vector2i(1280, 800)
	var scene := Node3D.new()
	root.add_child(scene)
	var world := WorldEnvironment.new()
	var env := Environment.new()
	env.background_mode = Environment.BG_COLOR
	env.background_color = Color("263642")
	env.ambient_light_source = Environment.AMBIENT_SOURCE_COLOR
	env.ambient_light_color = Color.WHITE
	env.ambient_light_energy = 0.55
	world.environment = env
	scene.add_child(world)
	var light := DirectionalLight3D.new()
	light.rotation_degrees = Vector3(-50, -35, 0)
	light.light_energy = 0.9
	light.shadow_enabled = true
	scene.add_child(light)
	var camera := Camera3D.new()
	camera.projection = Camera3D.PROJECTION_ORTHOGONAL
	scene.add_child(camera)
	camera.current = true
	DirAccess.make_dir_recursive_absolute("res://build/naval-style-review")
	var suffix := "" if OS.get_cmdline_user_args().is_empty() else "_" + OS.get_cmdline_user_args()[0]
	for kind in preload("res://scripts/naval_material.gd").KINDS:
		if not ResourceLoader.exists("res://assets/models/%s%s.glb" % [kind, suffix]): continue
		for team in 2:
			var model: Node3D = load("res://assets/models/%s%s.glb" % [kind, suffix]).instantiate()
			preload("res://scripts/naval_material.gd").apply(model, kind, team)
			scene.add_child(model)
			var bounds := _bounds(model, AABB())
			var center := bounds.get_center()
			var length := maxf(bounds.size.x, maxf(bounds.size.y, bounds.size.z))
			for view in [["front", Vector3(-0.8, 0.65, -0.85), 0.82], ["rear", Vector3(0.8, 0.65, 0.85), 0.82], ["top", Vector3(0, 1, 0.001), 1.12], ["rts", Vector3(-0.8, 0.9, -0.85), 2.8], ["detail", Vector3(-0.8, 0.65, -0.85), 0.3]]:
				var target := center
				if view[0] == "detail":
					var focus := _focus(model)
					if focus != null: target = (focus.global_transform * focus.get_aabb()).get_center()
				camera.position = target + view[1] * length
				camera.size = length * view[2]
				camera.far = length * 10.0
				camera.look_at(target)
				for frame in 3: await process_frame
				await RenderingServer.frame_post_draw
				root.get_texture().get_image().save_png("res://build/naval-style-review/%s_%s_%s.png" % [kind + suffix, "blue" if team == 0 else "red", view[0]])
			model.queue_free()
			await process_frame
	print("NAVAL_STYLE_RENDER_OK")
	quit()

