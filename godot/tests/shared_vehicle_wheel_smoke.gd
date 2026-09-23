extends SceneTree

func _initialize() -> void:
	call_deferred("_run")

func _run() -> void:
	for kind in ["apc", "cannon_apc"]:
		for suffix in ["", "_lod1"]:
			var model: Node3D = load("res://assets/models/" + kind + suffix + ".glb").instantiate()
			var wheels := model.find_children("wheel_*", "MeshInstance3D", true, false)
			assert(wheels.size() == 8)
			var transforms: Array[Transform3D] = []
			for wheel in wheels: transforms.append(wheel.transform)
			preload("res://scripts/ground_vehicle_material.gd").apply(model, 0, kind)
			preload("res://scripts/ground_vehicle_material.gd").apply(model, 0, kind)
			for i in range(wheels.size()):
				assert(wheels[i].transform == transforms[i])
				assert(wheels[i].mesh == null)
				assert(wheels[i].get_child_count() == 1)
				var mesh: MeshInstance3D = wheels[i].get_child(0).get_child(0)
				assert(mesh.mesh.get_surface_count() == 3)
				assert(mesh.mesh.surface_get_arrays(0)[Mesh.ARRAY_TEX_UV].size() > 0)
			model.free()
	for role in ["TRUCK", "FUEL_TRUCK", "TROOP_HEMTT", "MEDICAL_HEMTT", "REPAIR_HEMTT", "FOB_HEMTT", "FORKLIFT"]:
		var model := preload("res://scripts/browser_support_models.gd").create(role)
		var count := 0
		for child in model.get_children():
			if child.has_meta("shared_vehicle_wheel"): count += 1
		assert(count >= 4, role)
		model.free()
	print("SHARED_VEHICLE_WHEEL_SMOKE_OK APC_LOD=32 support_families=7 pivots=preserved UV=preserved duplicate_apply=safe")
	quit()
