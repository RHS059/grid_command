extends Node3D
class_name VehicleGreebles

# The GLB contains five reusable, metre-scale equipment roots. Mount coordinates
# are local to the tank's imported Y-up assemblies, before preview/theater scaling.
const LIBRARY: PackedScene = preload("res://assets/models/vehicle_greebles.glb")
const MOUNTS_PATH := "res://data/vehicles/tank_stowage.json"

var _pieces: Array[Node3D] = []
var _turret: Node3D
var _previous_turret_rotation := Quaternion.IDENTITY
var _time := 0.0
var _motion := 0.0
var _turret_motion := 0.0

func build_tank_stowage(model: Node3D) -> void:
	name = "TankStowageController"
	process_priority = 1 # Sample the pose after the imported AnimationPlayer.
	_turret = model.find_child("Assembly_turret", true, false) as Node3D
	if not is_instance_valid(_turret):
		return
	_previous_turret_rotation = _turret.quaternion
	var library := LIBRARY.instantiate()
	var manifest: Dictionary = JSON.parse_string(FileAccess.get_file_as_string(MOUNTS_PATH))
	for mount: Dictionary in manifest["mounts"]:
		var parent := model.find_child(str(mount["parent"]), true, false) as Node3D
		var source := library.find_child(str(mount["asset"]), true, false) as Node3D
		if parent == null or source == null:
			push_warning("Missing vehicle stowage mount or asset: " + str(mount["name"]))
			continue
		var piece := source.duplicate() as Node3D
		piece.name = str(mount["name"])
		# Discard the library's display-row offset, retaining its child geometry.
		piece.transform = Transform3D.IDENTITY
		var position_values: Array = mount["position"]
		piece.position = Vector3(position_values[0], position_values[1], position_values[2])
		piece.rotation.y = deg_to_rad(float(mount["yaw_degrees"]))
		parent.add_child(piece)
		piece.set_meta("rest_position", piece.position)
		piece.set_meta("rest_rotation", piece.rotation)
		piece.set_meta("soft", bool(mount["soft"]))
		piece.set_meta("on_turret", parent == _turret)
		_pieces.append(piece)
	library.free()

func set_activity(moving: bool, delta: float) -> void:
	_motion = move_toward(_motion, 1.0 if moving else 0.0, delta * (4.5 if moving else 2.4))

func _process(delta: float) -> void:
	_time += delta
	if is_instance_valid(_turret):
		var rotation_now := _turret.quaternion
		var angular_speed := 0.0
		if not _previous_turret_rotation.is_equal_approx(rotation_now):
			angular_speed = _previous_turret_rotation.angle_to(rotation_now) / maxf(delta, 0.001)
		_previous_turret_rotation = rotation_now
		_turret_motion = move_toward(_turret_motion, clampf(angular_speed / 0.8, 0.0, 1.0), delta * 5.0)
	for index in _pieces.size():
		var piece := _pieces[index]
		if not is_instance_valid(piece):
			continue
		var phase_value := float(index) * 0.73 + 0.2
		var soft: bool = piece.get_meta("soft")
		var activity := minf(1.0, _motion + (_turret_motion * 0.45 if piece.get_meta("on_turret") else 0.0))
		var amplitude := (0.014 if soft else 0.004) * activity
		var wave := sin(_time * (7.0 + phase_value) + phase_value * 4.1)
		var rest_position: Vector3 = piece.get_meta("rest_position")
		var rest_rotation: Vector3 = piece.get_meta("rest_rotation")
		# At most 3 mm lift and 0.8 degrees sway; retain contact with rack/straps.
		piece.position = rest_position + Vector3(0.0, absf(wave) * (0.003 if soft else 0.001) * activity, 0.0)
		piece.rotation = rest_rotation + Vector3(wave * amplitude, sin(_time * 5.3 + phase_value) * amplitude * 0.35, -wave * amplitude * 0.3)
