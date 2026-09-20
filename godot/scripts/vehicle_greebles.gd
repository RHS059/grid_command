extends Node3D
class_name VehicleGreebles

# Reusable, low-cost crew stowage. Geometry stays separate from imported models
# so another vehicle can mount the same library without changing its GLB or UVs.

var _pieces: Array[Node3D] = []
var _time := 0.0
var _motion := 0.0
var _turret_motion := 0.0

func build_tank_stowage() -> void:
	name = "TankStowage"
	var canvas := _material(Color("756847"), 0.92)
	var olive := _material(Color("50553a"), 0.90)
	var dark := _material(Color("292c27"), 0.96)
	var metal := _material(Color("4b4535"), 0.82)

	# Rear-deck ammunition and utility boxes.
	_add_box(Vector3(0.014,0.007,0.011), Vector3(-0.014,0.036,0.014), olive, 0.15)
	_add_box(Vector3(0.012,0.006,0.010), Vector3(0.001,0.037,0.016), metal, -0.08)
	_add_box(Vector3(0.010,0.008,0.008), Vector3(0.014,0.038,0.014), olive, 0.11)
	# A rolled tarp and duffel give the silhouette chunky, readable variation.
	_add_roll(Vector3(-0.018,0.043,-0.003), 0.005, 0.020, canvas, dark, 0.25)
	_add_duffel(Vector3(0.017,0.043,-0.004), canvas, -0.18)
	# Side-mounted jerry can and compact utility case.
	_add_jerry_can(Vector3(-0.024,0.031,-0.002), olive, dark, 0.10)
	_add_box(Vector3(0.008,0.009,0.012), Vector3(0.024,0.032,0.003), metal, -0.12)

func set_activity(moving: bool, turret_active: bool, delta: float) -> void:
	_motion = move_toward(_motion, 1.0 if moving else 0.0, delta * (4.5 if moving else 2.4))
	_turret_motion = move_toward(_turret_motion, 1.0 if turret_active else 0.0, delta * 3.0)

func _process(delta: float) -> void:
	_time += delta
	for piece in _pieces:
		var phase_value: float = float(piece.get_meta("jostle_phase",0.0))
		var amplitude: float = float(piece.get_meta("jostle_amplitude",0.02))
		var rest_position: Vector3 = piece.get_meta("rest_position",piece.position)
		var rest_rotation: Vector3 = piece.get_meta("rest_rotation",piece.rotation)
		var activity := _motion + _turret_motion * 0.45
		var wave := sin(_time * (7.0 + phase_value) + phase_value * 4.1)
		piece.position = rest_position + Vector3(0.0, absf(wave) * 0.00045 * activity, 0.0)
		piece.rotation = rest_rotation + Vector3(wave * amplitude * activity, sin(_time*5.3+phase_value)*amplitude*0.55*activity, -wave*amplitude*0.35*activity)

func _material(color: Color, roughness: float) -> StandardMaterial3D:
	var result := StandardMaterial3D.new()
	result.albedo_color = color
	result.roughness = roughness
	result.metallic = 0.0
	return result

func _register(node: Node3D, amplitude: float) -> void:
	node.set_meta("rest_position",node.position)
	node.set_meta("rest_rotation",node.rotation)
	node.set_meta("jostle_phase",float(_pieces.size())*0.73+0.2)
	node.set_meta("jostle_amplitude",amplitude)
	_pieces.append(node)

func _add_box(size: Vector3, position_value: Vector3, material: Material, yaw: float) -> MeshInstance3D:
	var mesh := BoxMesh.new()
	mesh.size = size
	var node := MeshInstance3D.new()
	node.mesh = mesh
	node.material_override = material
	node.position = position_value
	node.rotation.y = yaw
	add_child(node)
	_register(node,0.022)
	return node

func _add_roll(position_value: Vector3, radius: float, length: float, material: Material, strap: Material, yaw: float) -> void:
	var root := Node3D.new()
	root.position = position_value
	root.rotation.y = yaw
	add_child(root)
	var roll_mesh := CylinderMesh.new()
	roll_mesh.top_radius = radius
	roll_mesh.bottom_radius = radius
	roll_mesh.height = length
	roll_mesh.radial_segments = 8
	var roll := MeshInstance3D.new()
	roll.mesh = roll_mesh
	roll.material_override = material
	roll.rotation.z = PI*0.5
	root.add_child(roll)
	for offset in [-0.005,0.005]:
		var band_mesh := CylinderMesh.new()
		band_mesh.top_radius = radius*1.06
		band_mesh.bottom_radius = radius*1.06
		band_mesh.height = 0.0013
		band_mesh.radial_segments = 8
		var band := MeshInstance3D.new()
		band.mesh = band_mesh
		band.material_override = strap
		band.position.y = offset
		roll.add_child(band)
	_register(root,0.030)

func _add_duffel(position_value: Vector3, material: Material, yaw: float) -> void:
	var root := Node3D.new()
	root.position = position_value
	root.rotation.y = yaw
	add_child(root)
	var bag_mesh := CapsuleMesh.new()
	bag_mesh.radius = 0.0055
	bag_mesh.height = 0.018
	bag_mesh.radial_segments = 8
	bag_mesh.rings = 3
	var bag := MeshInstance3D.new()
	bag.mesh = bag_mesh
	bag.material_override = material
	bag.rotation.z = PI*0.5
	bag.scale = Vector3(1.0,1.0,0.76)
	root.add_child(bag)
	_register(root,0.034)

func _add_jerry_can(position_value: Vector3, material: Material, detail: Material, yaw: float) -> void:
	var root := Node3D.new()
	root.position = position_value
	root.rotation.y = yaw
	add_child(root)
	var body := BoxMesh.new()
	body.size = Vector3(0.006,0.012,0.009)
	var can := MeshInstance3D.new()
	can.mesh = body
	can.material_override = material
	root.add_child(can)
	var handle := BoxMesh.new()
	handle.size = Vector3(0.004,0.002,0.005)
	var grip := MeshInstance3D.new()
	grip.mesh = handle
	grip.material_override = detail
	grip.position.y = 0.006
	root.add_child(grip)
	_register(root,0.025)
