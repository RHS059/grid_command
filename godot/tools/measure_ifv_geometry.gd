extends SceneTree

func _initialize() -> void:
	if FileAccess.file_exists("res://build/ifv_before_metric.gd"):
		var previous: Node3D = load("res://build/ifv_before_metric.gd").create("IFV",0)
		print("IFV_BEFORE ", measure(previous))
		previous.free()
	var current: Node3D = preload("res://scripts/browser_armored_models.gd").create("IFV",0)
	print("IFV_AFTER ", measure(current))
	current.free()
	quit()

func measure(node: Node) -> Dictionary:
	var result := {"triangles":0,"meshes":0,"surfaces":0,"stored_vertices":0}
	if node is MeshInstance3D:
		result.meshes += 1
		result.surfaces += node.mesh.get_surface_count()
		for i in node.mesh.get_surface_count():
			var arrays: Array = node.mesh.surface_get_arrays(i)
			result.stored_vertices += arrays[Mesh.ARRAY_VERTEX].size()
			var indices = arrays[Mesh.ARRAY_INDEX]
			result.triangles += int((indices.size() if indices != null and not indices.is_empty() else arrays[Mesh.ARRAY_VERTEX].size()) / 3)
	for child in node.get_children():
		var child_result := measure(child)
		for key in result: result[key] += child_result[key]
	return result
