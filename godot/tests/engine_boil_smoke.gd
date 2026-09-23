extends SceneTree

const Boil = preload("res://scripts/engine_boil.gd")
var failures := 0

func check(condition: bool, message: String) -> void:
	if not condition:
		failures += 1
		push_error(message)

func _initialize() -> void:
	call_deferred("_run")

func _run() -> void:
	var motor := Boil.new("unit:1")
	var duplicate := Boil.new("unit:1")
	var moving := Boil.new("unit:1")
	var other := Boil.new("unit:2")
	var difference := 0.0
	for index in 600:
		var pose := motor.sample("TANK",1.0/60.0,true)
		check(pose == duplicate.sample("TANK",1.0/60.0,true),"Motor sampling lost determinism")
		check(pose.origin.length() < 0.0031 and pose.basis.get_euler().length() < 0.0005,"Motor boil exceeded its subtle amplitude bound")
		var drive := moving.sample("TANK",1.0/60.0,true,true)
		check(absf(drive.origin.length()-pose.origin.length()*0.35) < 0.0000001,"Moving blend lost the idle amplitude ratio")
		difference += pose.origin.distance_to(other.sample("TANK",1.0/60.0,true).origin)
	check(difference > 0.1,"Units vibrate in lockstep")
	var paused := motor.sample("TANK",0.0,true)
	check(paused == motor.sample("TANK",0.0,true),"Pause moved the motor pose")
	check(motor.sample("TANK",0.016,false).origin.length() > 0,"Power-off failed to fade")
	for index in 180: motor.sample("TANK",1.0/60.0,false)
	check(motor.sample("TANK",0.0,false) == Transform3D.IDENTITY,"Power-off left residual drift")
	for role in ["RIFLE","MOB","AIRFIELD","JET","PATROL_BOAT","AMPHIBIOUS_APC","UAV_JAMMER"]:
		check(motor.sample(role,0.1,true) == Transform3D.IDENTITY,"Excluded role vibrated: "+role)
	check(motor.sample("TANK",0.1,true,false,false) == Transform3D.IDENTITY,"Destroyed vehicle vibrated")
	var ready := {"fuel":70.0,"service":"READY","hp":100.0}
	check(Boil.powered(ready),"Ready powered vehicle was excluded")
	for key in ["engine","fuel","hp","service","crew_bailed"]:
		var stopped := ready.duplicate()
		stopped[key] = {"engine":false,"fuel":0,"hp":0,"service":"AWAITING SERVICE","crew_bailed":true}[key]
		check(not Boil.powered(stopped),"Inactive vehicle retained power: "+key)
	var unit := preload("res://scripts/combat_unit.gd").new()
	unit.core_record = ready.duplicate()
	unit.core_record.id = "boil-test-tank"
	root.add_child(unit)
	unit.set_process(false)
	var assembly: Node3D = unit.source_model.get_parent()
	var rest := assembly.transform
	for index in 240: unit._process(1.0/60.0)
	check(unit.motor_root.is_ancestor_of(assembly),"Complete vehicle is outside the motor wrapper")
	check(assembly.transform == rest,"Motor changed authored model alignment")
	check(unit.motor_root.transform != Transform3D.IDENTITY,"Runtime powered unit did not vibrate")
	unit.core_record.engine = false
	for index in 180: unit._process(1.0/60.0)
	check(unit.motor_root.transform == Transform3D.IDENTITY,"Runtime shutdown left transform drift")
	unit.free()
	print("ENGINE BOIL SMOKE: ","PASS" if failures == 0 else "FAIL")
	quit(0 if failures == 0 else 1)
