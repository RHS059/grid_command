extends RefCounted
## Canonical HEMTT carcass, chevron tread, hub and CTIS cap. Axis is local X.
## Geometry is cached and merged into three surfaces, including the original UVs.
static var geometry: ArrayMesh
static var materials: Dictionary = {}

static func create(radius: float, width: float, hub_color: Color = Color("73765a")) -> Node3D:
	if geometry == null:
		geometry = _build_geometry()
	var root := Node3D.new()
	root.name = "SharedVehicleWheel"
	root.set_meta("shared_vehicle_wheel", true)
	var mesh := MeshInstance3D.new()
	mesh.mesh = geometry
	mesh.scale = Vector3(width / 0.34, radius / 0.69, radius / 0.69)
	var key := hub_color.to_html()
	if not materials.has(key):
		var tire := ShaderMaterial.new()
		tire.shader = preload("res://shaders/ps2_tire.gdshader")
		tire.set_shader_parameter("sheet", preload("res://assets/textures/vehicles/hemtt_tire.png"))
		tire.set_shader_parameter("ramp_dark", hub_color.darkened(0.35))
		tire.set_shader_parameter("ramp_mid", hub_color)
		tire.set_shader_parameter("ramp_light", hub_color.lightened(0.25))
		var rubber := StandardMaterial3D.new()
		rubber.albedo_color = Color("272e30")
		rubber.roughness = 0.95
		var hub := StandardMaterial3D.new()
		hub.albedo_color = hub_color
		hub.roughness = 0.85
		materials[key] = [tire, rubber, hub]
	for i in range(3):
		mesh.set_surface_override_material(i, materials[key][i])
	root.add_child(mesh)
	return root

static func _build_geometry() -> ArrayMesh:
	var mesh := ArrayMesh.new()
	var surfaces: Array[SurfaceTool] = []
	for i in range(3):
		var surface := SurfaceTool.new()
		surface.begin(Mesh.PRIMITIVE_TRIANGLES)
		surfaces.append(surface)
	for dimensions in [Vector2(0.69 * 0.93, 0.34), Vector2(0.69 * 0.97, 0.34 * 0.76)]:
		_cylinder(surfaces[0], dimensions.x, dimensions.y, 0.0, 24)
	for i in range(22):
		for lane in [-1.0, 1.0]:
			var angle := TAU * (float(i) + (0.5 if lane > 0.0 else 0.0)) / 22.0
			var block := BoxMesh.new()
			block.size = Vector3(0.34 * 0.44, 0.07, 0.15)
			var basis := Basis(Vector3.RIGHT, -angle) * Basis(Vector3.UP, lane * 0.35)
			var position := Vector3(lane * 0.34 * 0.24, cos(angle) * 0.69 * 0.97, -sin(angle) * 0.69 * 0.97)
			surfaces[1].append_from(block, 0, Transform3D(basis, position))
	# Both faces work on mirrored assemblies and paired aircraft landing gear.
	for side in [-1.0, 1.0]:
		_cylinder(surfaces[2], 0.69 * 0.22, 0.06, side * 0.20, 12)
		_cylinder(surfaces[1], 0.69 * 0.09, 0.04, side * 0.25, 8)
	for surface in surfaces:
		surface.commit(mesh)
	return mesh

static func _cylinder(surface: SurfaceTool, radius: float, width: float, x: float, sides: int) -> void:
	var cylinder := CylinderMesh.new()
	cylinder.top_radius = radius
	cylinder.bottom_radius = radius
	cylinder.height = width
	cylinder.radial_segments = sides
	cylinder.rings = 1
	surface.append_from(cylinder, 0, Transform3D(Basis(Vector3.FORWARD, PI / 2.0), Vector3(x, 0, 0)))

static func replace_imported(root: Node, hub_color: Color) -> void:
	if root.has_meta("shared_vehicle_wheel"):
		return
	if root is MeshInstance3D and root.mesh != null and String(root.name).to_lower().begins_with("wheel_"):
		if root.has_meta("wheel_replaced"):
			return
		var bounds: AABB = root.mesh.get_aabb()
		# Canonical total width includes the projecting CTIS caps (0.54 m).
		var wheel := create(maxf(bounds.size.y, bounds.size.z) * 0.5, bounds.size.x * 0.34 / 0.54, hub_color)
		# Preserve the authored wheel assembly pivot and any steering animation.
		wheel.position = bounds.get_center()
		root.add_child(wheel)
		root.mesh = null
		root.set_meta("wheel_replaced", true)
		return
	for child in root.get_children():
		replace_imported(child, hub_color)
