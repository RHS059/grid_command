extends RefCounted

const ALBEDO := preload("res://assets/models/tank_albedo.png")

static func apply(root: Node) -> void:
	if root is MeshInstance3D and root.mesh != null:
		for surface in range(root.mesh.get_surface_count()):
			var source: Material = root.get_active_material(surface)
			if source is StandardMaterial3D:
				var material: StandardMaterial3D = source.duplicate()
				material.albedo_texture = ALBEDO
				material.albedo_color = Color.WHITE
				root.set_surface_override_material(surface, material)
	for child in root.get_children():
		apply(child)
