extends SceneTree

const Core = preload("res://scripts/simulation_core.gd")
var failures := 0

func _initialize() -> void:
	call_deferred("_run")

func check(condition: bool, message: String) -> void:
	if not condition:
		failures += 1
		push_error(message)

func fixture() -> SimulationCore:
	var core := Core.new()
	core.setup([{"id":"A","pos":Vector3.ZERO},{"id":"B","pos":Vector3(4,0,0)}])
	return core

func ready(core: SimulationCore, side: String, role: String, id: String, position := Vector3.ZERO) -> Dictionary:
	var unit := core.make_unit(side,role,id)
	unit.merge({"position":position,"at_base":false,"service":"READY","fuel":100.0,"ammo":100.0},true)
	core.units[side].append(unit)
	return unit

func _run() -> void:
	# Browser weapon identity, eligibility and damage falloff.
	check(Core.weapon_for("TANK")["id"] == "cannon","Tank weapon differs from browser weapon table.")
	check(not Core.weapon_can_target(Core.WEAPONS["rifle"],"TANK"),"Rifle must not damage armor.")
	check(not Core.weapon_can_target(Core.WEAPONS["aa"],"TANK") and Core.weapon_can_target(Core.WEAPONS["aa"],"JET"),"AA target filter changed.")
	check(is_equal_approx(Core.weapon_damage(Core.WEAPONS["cas-gun"],"TANK",0.0),0.6),"CAS gun armor reduction changed.")

	var core := fixture()
	var tank := ready(core,"BLU","TANK","tank")
	var rifle := ready(core,"RED","RIFLE","rifle",Vector3(5,0,0))
	var shot := core.resolve_attack("BLU","tank","rifle")
	check(shot["fired"] and is_equal_approx(float(rifle["hp"]),81.1071428571),"Direct-fire damage or range falloff changed.")
	check(not core.resolve_attack("BLU","tank","rifle")["fired"],"Weapon cooldown was not enforced.")

	var aa := ready(core,"BLU","AA_TEAM","aa")
	var jet := ready(core,"RED","JET","jet",Vector3(6,0,0))
	check(core.resolve_attack("BLU","aa","jet")["reason"] == "locking","AA must acquire a 2.5 second lock.")
	core.time = 2.5
	check(core.resolve_attack("BLU","aa","jet")["fired"] and core.missiles.size() == 1,"AA launch did not create a delayed missile.")
	core.time = float(core.missiles[0]["due"])
	core._process_missiles()
	check(is_equal_approx(float(jet["hp"]),35.0),"AA damage occurred before impact or used the wrong value.")

	# Individual active soldier positions capture at eight seconds; opposition contests it.
	core = fixture()
	ready(core,"BLU","RIFLE","blue-a")
	ready(core,"BLU","RIFLE","blue-b")
	core.update_objective_control(8.0)
	check(core.objectives["A"]["owner"] == "BLU","Six or more active bodies did not capture in eight seconds.")
	core = fixture()
	var edge := ready(core,"BLU","RIFLE","edge",Vector3(0.96,0,0))
	core.update_objective_control(8.0)
	check(core.objectives["A"]["owner"] == "","Capture counted the aggregate unit position instead of individual soldier positions.")
	edge["position"] = Vector3.ZERO
	ready(core,"BLU","RIFLE","edge-b")
	core.update_objective_control(8.0)
	check(core.objectives["A"]["owner"] == "BLU","Individual soldier positions did not contribute to capture.")
	var red := ready(core,"RED","RIFLE","red-a")
	core.update_objective_control(0.05)
	check(core.objectives["A"]["contested"] and core.objectives["A"]["progress"] == 0.0,"Opposition did not contest and stop capture.")
	red["surrendered"] = true
	core.update_objective_control(0.05)
	check(not core.objectives["A"]["contested"],"Surrendered infantry counted toward capture.")
	for objective in core.objectives.values(): objective["owner"] = "BLU"; objective["contested"] = false
	core._update_victory(60.0)
	check(core.winner == "BLU","Sixty-second all-objective hold did not award territorial victory.")

	# Command loss allows succession while a maneuver element survives.
	core.winner = ""; core.territory_hold = {"BLU":0.0,"RED":0.0}
	core._unit("BLU","BLU-command")["hp"] = 0.0
	core._update_victory(0.05)
	check(core.winner.is_empty(),"Command loss incorrectly defeated a side with a surviving successor.")
	for unit in core.units["BLU"]:
		if unit["role"] != "COMMAND": unit["hp"] = 0.0
	core._update_victory(0.05)
	check(core.winner == "RED","Complete command collapse did not award victory.")

	# Air and naval carrier losses kill occupants; ground carriers use the browser survival check.
	core = fixture()
	var carrier := ready(core,"BLU","TRANSPORT_HELI","carrier",Vector3(1,0,1))
	var squad := ready(core,"BLU","RIFLE","passenger",Vector3(1,0,1))
	check(core.embark("BLU","passenger","carrier"),"Passenger did not begin boarding.")
	core.time += Core.BOARD_SECONDS; core._tick_units(0.0)
	carrier["hp"] = 0.0; core._tick_units(0.0)
	check(squad["transport"].is_empty() and squad["position"] == carrier["position"] and squad["members"] == 0 and squad["hp"] == 0.0,"Destroyed aircraft did not kill its occupants.")
	check(core.forces["BLU"]["casualties"] == 4,"Passenger losses were not recorded.")

	# Context actions: jammer construction and passenger/crew dismount.
	core = fixture()
	var builder := ready(core,"BLU","ENGINEER","builder",Vector3(2,0,2))
	check(core.deploy_jammer("BLU","builder").is_empty(),"Eligible builder could not deploy jammer.")
	check(int(core.forces["BLU"]["sp"]) == 1800,"Jammer did not cost 200 SP.")
	var jammer: Dictionary = core.units["BLU"].back()
	core.time = 15.0; core._tick_units(0.0)
	check(not jammer.has("construction") and jammer["service"] == "READY","Jammer did not activate after 15 seconds.")
	check(core.deploy_jammer("BLU","builder") == "A jammer is already deployed nearby.","Jammer spacing rule changed.")

	carrier = ready(core,"BLU","APC","dismount-carrier",Vector3(3,0,3))
	squad = ready(core,"BLU","RIFLE","dismount-squad",Vector3(3,0,3))
	check(core.embark("BLU",squad["id"],carrier["id"]),"Dismount fixture failed to board.")
	core.time += Core.BOARD_SECONDS+0.05; core._tick_units(0.0)
	check(core.request_dismount("BLU",carrier["id"],true),"Dismount-all request was rejected.")
	core.time += Core.BOARD_SECONDS+0.05; core._tick_units(0.0)
	check(squad["transport"].is_empty() and carrier["crew_bailed"],"Dismount-all did not release passengers and crew.")
	check(core.units["BLU"].any(func(unit: Dictionary) -> bool: return str(unit["id"]).begins_with("dismount-carrier-crew-")),"Dismounted crew unit was not created.")

	core = fixture()
	carrier = ready(core,"BLU","APC","repair")
	carrier["at_base"] = true; carrier["hp"] = 50.0; core.depots["BLU"]["mob"]["repair"] = 100.0
	core._tick_units(1.0)
	check(float(carrier["hp"]) > 50.0 and float(core.depots["BLU"]["mob"]["repair"]) < 100.0,"Base repair stopped consuming stock.")
	var medic := ready(core,"BLU","MEDIC","medic")
	var wounded := ready(core,"BLU","RIFLE","wounded",Vector3(0.2,0,0))
	wounded["hp"] = 50.0; wounded["ammo"] = 50.0; wounded["at_base"] = true; core.depots["BLU"]["mob"]["ammo"] = 10.0
	core._process_ground_logistics()
	check(wounded["hp"] == 51.0 and wounded["ammo"] == 54.0 and core.depots["BLU"]["mob"]["ammo"] == 6.0,"Infantry resupply or medic pulse differs from browser behavior.")

	if failures == 0:
		print("GRID_COMMAND_GAMEPLAY_CORE_SMOKE_OK")
	quit(failures)
