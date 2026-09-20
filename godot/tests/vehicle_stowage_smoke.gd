extends SceneTree

func _initialize() -> void:
	call_deferred("_run")

func _run() -> void:
	create_timer(15.0).timeout.connect(func(): push_error("Stowage test timed out."); quit(1))
	var model: Node3D = load("res://assets/models/tank.glb").instantiate()
	root.add_child(model)
	var controller := preload("res://scripts/vehicle_greebles.gd").new()
	model.add_child(controller)
	controller.build_tank_stowage(model)
	controller.set_process(false)
	var turret := model.find_child("Assembly_turret", true, false) as Node3D
	var hull := model.find_child("Assembly_hull", true, false) as Node3D
	var pieces := model.find_children("Stowage_*", "Node3D", true, false)
	assert(pieces.size() == 5, "Expected all five reusable equipment assets.")
	var meshes := 0
	for piece: Node3D in pieces:
		assert(piece.scale.is_equal_approx(Vector3.ONE), "Equipment must retain metre scale.")
		assert(piece.get_parent() == (hull if piece.name == "Stowage_RearJerryCan" else turret))
		for mesh: MeshInstance3D in piece.find_children("*", "MeshInstance3D", true, false):
			assert(mesh.mesh is ArrayMesh, "Stowage must use imported geometry.")
			meshes += 1
	assert(meshes == 13, "Expected consolidated material meshes.")
	var case_node := turret.get_node("Stowage_BustleCase") as Node3D
	var case_bounds := _bounds(case_node, Transform3D.IDENTITY)
	assert(is_equal_approx(case_bounds.size.x, 0.64), "Case must stay 64 cm wide.")
	var can := hull.get_node("Stowage_RearJerryCan") as Node3D
	var case_start := case_node.global_position
	var can_start := can.global_position
	turret.rotate_y(PI * 0.5)
	assert(case_node.global_position.distance_to(case_start) > 2.0, "Case must follow turret slew.")
	assert(can.global_position.is_equal_approx(can_start), "Hull can must stay on the hull.")
	controller._process(0.05)
	assert(controller._turret_motion > 0.0, "Actual turret rotation must excite secondary motion.")
	assert(can.position.is_equal_approx(can.get_meta("rest_position")), "Turret slew must not jostle hull gear.")
	controller.set_activity(true, 1.0)
	for frame in 90:
		controller._process(1.0 / 60.0)
		for piece: Node3D in pieces:
			assert(piece.position.distance_to(piece.get_meta("rest_position")) <= 0.0031)
			assert(piece.rotation.distance_to(piece.get_meta("rest_rotation")) <= 0.016)
	for frame in 120:
		controller.set_activity(false, 1.0 / 60.0)
		controller._process(1.0 / 60.0)
	for piece: Node3D in pieces:
		assert(piece.position.is_equal_approx(piece.get_meta("rest_position")), "Idle equipment must settle.")
		assert(piece.rotation.is_equal_approx(piece.get_meta("rest_rotation")))
	print("GRID_COMMAND_STOWAGE_SMOKE_OK pieces=5 meshes=13 turret_parenting=pass hull_parenting=pass motion_limits=pass idle_settle=pass")
	model.free()
	quit(0)

func _bounds(node: Node3D, parent_transform: Transform3D) -> AABB:
	var combined := parent_transform * node.transform
	var bounds := AABB()
	if node is MeshInstance3D:
		bounds = combined * node.get_aabb()
	for child in node.get_children():
		if child is Node3D:
			var child_bounds := _bounds(child, combined)
			if child_bounds.size.length_squared() > 0.0:
				bounds = child_bounds if bounds.size.length_squared() == 0.0 else bounds.merge(child_bounds)
	return bounds
