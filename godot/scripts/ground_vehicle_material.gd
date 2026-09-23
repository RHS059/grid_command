extends RefCounted
## Palette adapter for the existing imported ground atlases. Source files and
## UVs remain authoritative; this does not manufacture wear or replace a repaint.
const SUPPORTED_KINDS := ["tank", "apc", "cannon_apc"]
const BODY := [Color("78725a"), Color("5f6c50")]
const LIGHT := [Color("958b6b"), Color("798368")]
const SHADE := [Color("5b5846"), Color("46513f")]

static func supports(kind: String) -> bool:
	return kind.to_lower() in SUPPORTED_KINDS

static func apply(root: Node, team: int, kind: String) -> void:
	if not supports(kind):
		return
	_apply_surfaces(root, clampi(team, 0, 1), kind.to_lower())
	if kind.to_lower() in ["apc", "cannon_apc"]:
		preload("res://scripts/shared_vehicle_wheel.gd").replace_imported(root, BODY[clampi(team, 0, 1)])

static func _apply_surfaces(root: Node, team: int, kind: String) -> void:
	if root is MeshInstance3D and root.mesh != null:
		for surface in range(root.mesh.get_surface_count()):
			var source: Material = root.get_active_material(surface)
			if not source is BaseMaterial3D or source.albedo_texture == null:
				continue
			var material := ShaderMaterial.new()
			material.shader = preload("res://shaders/ground_vehicle_palette.gdshader")
			material.set_shader_parameter("albedo_map", source.albedo_texture if kind == "tank" else preload("res://assets/models/stryker_albedo.png"))
			material.set_shader_parameter("source_tint", source.albedo_color)
			material.set_shader_parameter("paint_mid", BODY[team])
			# The existing tank atlas is tan; the Stryker atlas is dark olive.
			material.set_shader_parameter("source_mid", Color("ae9061") if kind == "tank" else Color("50573a"))
			material.set_shader_parameter("uv_scale", Vector2(source.uv1_scale.x, source.uv1_scale.y))
			material.set_shader_parameter("uv_offset", Vector2(source.uv1_offset.x, source.uv1_offset.y))
			root.set_surface_override_material(surface, material)
	for child in root.get_children():
		_apply_surfaces(child, team, kind)
