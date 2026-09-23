extends RefCounted
## Keep authored UV atlases. Tint only neutral paint on named structural groups.
const KINDS := ["aircraft_carrier", "missile_cruiser", "patrol_boat", "landing_craft"]
const PAINT_GROUPS := ["hull", "island", "superstructure", "hangar", "bow_ramp"]

static func apply(model: Node, kind: String, team: int = 0) -> void:
	if kind in KINDS:
		_apply_node(model, team, kind)

static func _apply_node(node: Node, team: int, kind: String) -> void:
	if node is MeshInstance3D and node.mesh != null:
		for surface in range(node.mesh.get_surface_count()):
			var source: Material = node.get_active_material(surface)
			if source is StandardMaterial3D and source.albedo_texture != null:
				var material := ShaderMaterial.new()
				material.shader = preload("res://shaders/naval_surface.gdshader")
				material.set_shader_parameter("albedo_map", source.albedo_texture)
				material.set_shader_parameter("source_mid", Color("566367") if kind in ["aircraft_carrier", "missile_cruiser"] else Color("35403f"))
				material.set_shader_parameter("paint_group", str(node.name).to_lower() in PAINT_GROUPS)
				# Warships retain neutral haze-grey paint. Faction identity comes from
				# authored flags, deck markings and tactical UI, never a hull-wide tint.
				material.set_shader_parameter("paint_color", Color("68747a"))
				node.set_surface_override_material(surface, material)
	for child in node.get_children():
		_apply_node(child, team, kind)

