extends Node3D
class_name TankFireEffects

# Source assets use metres and fire along -Z. This pivot lives below the unit's
# display interpolation and above the complete imported model (including tracks).
const KICK_TIME := 0.10
const SETTLE_TIME := 1.20
const FLASH_TIME := 0.18

var muzzle: Node3D
var flash: Node3D
var recoil_degrees := 0.0
var center_of_mass := Vector3.ZERO
var _cannon: MeshInstance3D
var _rock_axis := Vector3.RIGHT
var _time := SETTLE_TIME
var _peak := 4.0

func setup(content: Node3D, source_model: Node3D) -> bool:
	name = "TankRecoilPivot"
	set_process(false)
	_cannon = source_model.find_child("cannon", true, false) as MeshInstance3D
	var hull := source_model.find_child("hull", true, false) as MeshInstance3D
	if _cannon == null or hull == null:
		return false
	# The heavy hull's geometric center is the presentation center of mass;
	# exclude the long barrel, aerials and stowage from this suspension pivot.
	center_of_mass = get_parent().to_local(hull.to_global(hull.get_aabb().get_center()))
	position = center_of_mass
	var rest_transform := content.transform
	content.get_parent().remove_child(content)
	add_child(content)
	content.transform = rest_transform
	content.position -= center_of_mass
	muzzle = Node3D.new()
	muzzle.name = "CannonMuzzle"
	# The authored cannon's bore is centered on local X/Y=0; AABB min-Z is
	# the muzzle lip. Parenting here follows turret yaw and barrel elevation.
	muzzle.position = Vector3(0.0, 0.0, _cannon.get_aabb().position.z - 0.012)
	_cannon.add_child(muzzle)
	flash = Node3D.new()
	flash.name = "LowPolyMuzzleFlash"
	muzzle.add_child(flash)
	_add_flame("OrangeBlast", Color("ff2503"), 4.2, 1.05, 7, 0.0)
	_add_flame("YellowCore", Color("ffda29"), 2.3, 0.47, 5, 0.32)
	flash.hide()
	return true

func _add_flame(part_name: String, color: Color, length: float, radius: float, sides: int, twist: float) -> void:
	# Flat triangles and an irregular seven-sided silhouette stay readable in
	# the compatibility renderer. Both meshes/materials are allocated once.
	var surface := SurfaceTool.new()
	surface.begin(Mesh.PRIMITIVE_TRIANGLES)
	var rings := [Vector2(0.0, 0.11), Vector2(length * 0.20, radius), Vector2(length * 0.49, radius * 0.58), Vector2(length, 0.0)]
	for ring in range(rings.size() - 1):
		for side in sides:
			var next := (side + 1) % sides
			var a := _flame_vertex(rings[ring], side, sides, twist)
			var b := _flame_vertex(rings[ring], next, sides, twist)
			var c := _flame_vertex(rings[ring + 1], side, sides, twist)
			var d := _flame_vertex(rings[ring + 1], next, sides, twist)
			for point: Vector3 in [a, b, c, b, d, c]:
				surface.add_vertex(point)
	surface.generate_normals()
	var mesh := MeshInstance3D.new()
	mesh.name = part_name
	mesh.mesh = surface.commit()
	mesh.set_meta("tank_muzzle_flash", true)
	var material := StandardMaterial3D.new()
	material.shading_mode = BaseMaterial3D.SHADING_MODE_UNSHADED
	material.cull_mode = BaseMaterial3D.CULL_DISABLED
	material.blend_mode = BaseMaterial3D.BLEND_MODE_ADD
	material.transparency = BaseMaterial3D.TRANSPARENCY_ALPHA
	material.albedo_color = Color(color, 0.80)
	material.emission_enabled = true
	material.emission = color
	material.emission_energy_multiplier = 1.4
	mesh.material_override = material
	mesh.cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_OFF
	flash.add_child(mesh)

func _flame_vertex(ring: Vector2, side: int, sides: int, twist: float) -> Vector3:
	var angle := TAU * float(side) / float(sides) + twist
	var radius := ring.y * (1.0 if side % 2 == 0 else 0.76)
	return Vector3(cos(angle) * radius, sin(angle) * radius, -ring.x)

func fire(peak_degrees := 4.0) -> void:
	if muzzle == null:
		return
	_peak = clampf(peak_degrees, 2.0, 5.0)
	# Resolve firing direction without the current recoil so a slewed turret
	# rocks the hull away from the shot, including broadside engagements.
	var direction := global_basis.inverse() * -_cannon.global_basis.z
	direction.y = 0.0
	_rock_axis = direction.normalized().cross(Vector3.UP)
	if _rock_axis.length_squared() < 0.001:
		_rock_axis = Vector3.RIGHT
	_time = 0.0
	flash.show()
	_update_pose()
	set_process(true)

func _process(delta: float) -> void:
	_time += delta
	if _time >= SETTLE_TIME:
		reset()
		return
	_update_pose()

func _update_pose() -> void:
	if _time <= KICK_TIME:
		var kick := clampf(_time / KICK_TIME, 0.0, 1.0)
		recoil_degrees = _peak * kick * kick * (3.0 - 2.0 * kick)
	else:
		var settling := _time - KICK_TIME
		recoil_degrees = _peak * cos(settling * 11.0) * exp(-settling * 5.4)
	basis = Basis(_rock_axis, deg_to_rad(recoil_degrees))
	flash.visible = _time < FLASH_TIME
	if flash.visible:
		var fraction := _time / FLASH_TIME
		var swell := (0.65 + 0.35 * minf(fraction / 0.16, 1.0)) * (1.0 - pow(fraction, 2.0))
		flash.scale = Vector3(swell, swell, maxf(0.01, swell))

func reset() -> void:
	_time = SETTLE_TIME
	recoil_degrees = 0.0
	basis = Basis.IDENTITY
	if flash != null:
		flash.hide()
	set_process(false)
