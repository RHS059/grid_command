extends RefCounted
## Restrained highlights for authored air/naval diffuse atlases.
## Mixed atlases include glass, markings and hardware: never tint the entire atlas.

const KINDS := ["fighter", "cas", "recon_uav", "aircraft_carrier", "missile_cruiser", "patrol_boat", "landing_craft", "transport_heli", "cargo_plane"]

static func apply(model: Node, kind: String, team: int = 0) -> void:
	# Procedural airframes (A-29B, Galaxy-B, Black Hawk) carry their own palette paint.
	if kind not in KINDS or model.has_meta("procedural_paint"):
		return
	var aircraft_texture: Texture2D
	if kind in ["fighter", "cas", "recon_uav"]:
		aircraft_texture = load("res://assets/textures/vehicles/aircraft/%s_%s.png" % [kind, "blue" if team == 0 else "red"])
	_apply_node(model, aircraft_texture)

static func _apply_node(node: Node, aircraft_texture: Texture2D) -> void:
	if node is MeshInstance3D and node.mesh != null:
		var paint_texture := aircraft_texture
		# FQ-44 shares its atlas across named submeshes. Keep optical/exhaust and
		# landing-gear submeshes on the original pixels, independent of palette.
		for protected_name in ["sensor", "exhaust", "nozzle", "tire", "wheel", "strut", "oleo", "brace", "fork", "axle", "trunnion", "navigation"]:
			if protected_name in str(node.name).to_lower(): paint_texture = null
		# Procedural airframes use material_override; imported models use surfaces.
		if node.material_override is StandardMaterial3D:
			node.material_override = _normalize(node.material_override, paint_texture)
		else:
			for surface in range(node.mesh.get_surface_count()):
				var source: Material = node.get_active_material(surface)
				if source is StandardMaterial3D:
					node.set_surface_override_material(surface, _normalize(source, paint_texture))
	for child in node.get_children():
		_apply_node(child, aircraft_texture)

static func _normalize(source: StandardMaterial3D, aircraft_texture: Texture2D) -> Material:
	var material: StandardMaterial3D = source.duplicate()
	material.metallic = 0.0
	material.metallic_specular = 0.2
	material.roughness = maxf(material.roughness, 0.82)
	if aircraft_texture != null:
		var neutral := ShaderMaterial.new()
		neutral.shader = preload("res://shaders/aircraft_neutral_surface.gdshader")
		neutral.set_shader_parameter("albedo_map", aircraft_texture)
		return neutral
	# Texture channels, alpha, UV transforms and importer data remain intact.
	return material
