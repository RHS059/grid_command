extends RefCounted
## Restrained highlights for authored air/naval diffuse atlases.
## Mixed atlases include glass, markings and hardware: never tint the entire atlas.

const KINDS := ["fighter", "cas", "recon_uav", "aircraft_carrier", "missile_cruiser", "patrol_boat", "landing_craft", "transport_heli", "cargo_plane"]

static func apply(model: Node, kind: String, _team: int = 0) -> void:
	if kind not in KINDS:
		return
	_apply_node(model)

static func _apply_node(node: Node) -> void:
	if node is MeshInstance3D and node.mesh != null:
		# Procedural airframes use material_override; imported models use surfaces.
		if node.material_override is StandardMaterial3D:
			node.material_override = _normalize(node.material_override)
		else:
			for surface in range(node.mesh.get_surface_count()):
				var source: Material = node.get_active_material(surface)
				if source is StandardMaterial3D:
					node.set_surface_override_material(surface, _normalize(source))
	for child in node.get_children():
		_apply_node(child)

static func _normalize(source: StandardMaterial3D) -> StandardMaterial3D:
	var material: StandardMaterial3D = source.duplicate()
	material.metallic = 0.0
	material.metallic_specular = 0.2
	material.roughness = maxf(material.roughness, 0.82)
	# Texture channels, alpha, UV transforms and importer data remain intact.
	return material

