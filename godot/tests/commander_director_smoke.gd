extends SceneTree

const CoreScript = preload("res://scripts/simulation_core.gd")
const DirectorScript = preload("res://scripts/commander_director.gd")

func _initialize() -> void:
	call_deferred("_run")

func _run() -> void:
	var core = CoreScript.new()
	core.setup([
		{"id":"A", "pos":Vector3(0, 0, -9)},
		{"id":"B", "pos":Vector3(0, 0, -4.5)},
		{"id":"C", "pos":Vector3.ZERO},
		{"id":"D", "pos":Vector3(0, 0, 4.5)},
		{"id":"E", "pos":Vector3(0, 0, 9)},
	])
	core._unit("BLU", "BLU-command")["position"] = Vector3(0, 0, 10)
	core._unit("RED", "RED-command")["position"] = Vector3(0, 0, -10)
	for side in ["BLU", "RED"]:
		for index in range(4):
			var role: String = ["RIFLE", "MG", "APC", "SCOUT"][index]
			var unit: Dictionary = core.make_unit(side, role, "%s-test-%d" % [side, index])
			unit["position"] = Vector3(80 if side == "BLU" else -80, 0, float(index))
			unit["fuel"] = 100.0
			unit["ammo"] = 100.0
			unit["service"] = "READY"
			core.units[side].append(unit)
	var director = DirectorScript.new()
	director.setup(3701)
	var second = DirectorScript.new()
	second.setup(3701)
	assert(director.sides["BLU"]["personality"] == second.sides["BLU"]["personality"], "Commander personalities must be deterministic for the operation seed.")

	core.time = 0.0
	director.tick(core)
	assert(director.contacts_for("BLU").is_empty() and director.contacts_for("RED").is_empty(), "Commanders must not receive omniscient contacts.")
	core._unit("RED", "RED-test-0")["position"] = Vector3(0, 0, 9)
	core.time = 0.5
	director.tick(core)
	assert(director.contacts_for("BLU").is_empty(), "A local observation must wait for the reporting delay.")
	core._unit("RED", "RED-test-0")["position"] = Vector3(-80, 0, 0)
	core.time = 2.0
	director.tick(core)
	assert(director.contacts_for("BLU").any(func(contact: Dictionary) -> bool: return contact["unit_id"] == "RED-test-0"), "The delayed contact report must reach command.")
	core.time = 21.0
	director.tick(core)
	assert(not director.contacts_for("BLU").any(func(contact: Dictionary) -> bool: return contact["unit_id"] == "RED-test-0"), "Unobserved contacts must expire after the browser memory interval.")

	core.time = 30.0
	director.tick(core)
	var blue_plan: Dictionary = director.plan_for("BLU")
	var red_plan: Dictionary = director.plan_for("RED")
	assert(int(blue_plan["revision"]) == 1 and int(red_plan["revision"]) == 1, "Both commanders must plan in the same command cycle.")
	assert(int(core.forces["BLU"]["cycles"]) == 1 and int(core.forces["RED"]["cycles"]) == 1)
	assert(not director.council_for("BLU").is_empty() and director.council_for("BLU")["reports"].size() == 6)
	assert(core._unit("BLU", "BLU-test-0").get("command_mission", {}).is_empty(), "Orders must respect the simulated command delay.")
	core.time = 31.0
	director.tick(core)
	for side in ["BLU", "RED"]:
		for index in range(4):
			var mission: Dictionary = core._unit(side, "%s-test-%d" % [side, index]).get("command_mission", {})
			assert(not mission.is_empty(), "Every commandable element must receive a formation mission.")
			assert(float(mission["execute_at"]) > float(mission["issued_at"]))
			assert(str(mission["issuer"]).begins_with(side + ":auto:"))

	var saved: Dictionary = director.snapshot()
	var restored = DirectorScript.new()
	restored.restore(saved)
	assert(restored.snapshot() == saved, "Commander contacts, plans, packets and traces must survive session restore.")
	print("GRID_COMMAND_COMMANDER_DIRECTOR_SMOKE_OK: delayed contacts, simultaneous plans, formations, delayed missions, council and restore")
	quit(0)
