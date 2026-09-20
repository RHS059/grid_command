extends SceneTree

const CameraScript = preload("res://scripts/rts_camera.gd")
const UnitScript = preload("res://scripts/combat_unit.gd")
var failures := 0

func _initialize() -> void:
	call_deferred("_run")

func check(condition: bool,message: String) -> void:
	if not condition:
		failures += 1
		push_error(message)

func _run() -> void:
	var camera := CameraScript.new()
	root.add_child(camera)
	var unit := UnitScript.new()
	unit.role = "JET"
	unit.kind = "fighter"
	unit.team = 0
	unit.call_sign = "FOLLOW TEST"
	unit.core_record = {"id":"BLU-follow","hp":100.0,"fuel":100.0,"ammo":100.0,"service":"READY","transport":{}}
	unit.position = Vector3(3,0,4)
	root.add_child(unit)
	unit.set_selected(true)
	camera._process(0.05)
	check(camera.follow_subject == unit,"Selecting one live unit did not start camera follow.")
	check(is_equal_approx(camera.target_distance,0.65),"Jet chase distance differs from the browser scale.")
	var before := camera.focus
	unit.position += Vector3(1,0,2)
	camera._process(0.05)
	check(camera.focus.distance_to(before) > 1.0,"Camera follow did not track the moving unit.")
	camera.follow_scale = 99.0
	camera._update_follow(0.05)
	check(is_equal_approx(camera.target_distance,3.9),"Camera follow zoom did not clamp to the browser's 6x limit.")
	unit.presentation_offset = Vector3(-0.2,0,-0.4)
	unit.presentation_yaw_offset = 0.4
	unit._process(0.025)
	check(unit.presentation_offset.is_equal_approx(Vector3(-0.1,0,-0.2)),"Unit position did not interpolate across the fixed simulation interval.")
	check(is_equal_approx(unit.presentation_yaw_offset,0.2),"Unit heading did not interpolate across the fixed simulation interval.")
	var right_down := InputEventMouseButton.new()
	right_down.button_index = MOUSE_BUTTON_RIGHT
	right_down.pressed = true
	camera._unhandled_input(right_down)
	var orbit := InputEventMouseMotion.new()
	orbit.relative = Vector2(40,20)
	var old_yaw := camera.yaw
	camera._unhandled_input(orbit)
	check(camera.yaw < old_yaw and camera.pitch > 0.40,"Secondary drag did not orbit in the browser directions.")
	var carrier := UnitScript.new()
	carrier.role = "TROOP_TRUCK"
	carrier.kind = "troop_transport"
	carrier.core_record = {"id":"BLU-carrier","hp":100.0,"fuel":100.0,"ammo":100.0,"service":"READY","transport":{"passengers":["BLU-follow"]}}
	root.add_child(carrier)
	unit.core_record["transport"] = {"carrier":"BLU-carrier","phase":"seated"}
	camera.release_follow()
	unit.set_selected(false)
	camera._process(0.05)
	unit.set_selected(true)
	camera._process(0.05)
	check(camera.follow_subject == carrier,"Embarked selection did not follow its living carrier.")
	camera.release_follow()
	camera._process(0.05)
	check(camera.follow_subject == null,"Manual camera movement did not suppress embarked follow.")
	unit.set_selected(false)
	camera._process(0.05)
	check(camera.follow_subject == null,"Clearing selection did not release camera follow.")
	unit.free()
	carrier.free()
	camera.free()
	if failures == 0:
		print("GRID_COMMAND_CAMERA_FOLLOW_SMOKE_OK: selected-unit chase, tracking, zoom and release")
	quit(0 if failures == 0 else 1)
