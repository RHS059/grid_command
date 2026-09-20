extends SceneTree

var failures := 0

func _initialize() -> void:
	call_deferred("_run")

func check(condition: bool, message: String) -> void:
	if not condition:
		failures += 1
		push_error(message)

func _run() -> void:
	ProjectSettings.set_setting("geography/network_enabled", false)
	var first: Dictionary = _continue_operation()
	var second: Dictionary = _continue_operation()
	check(first == second, "The same stalled-operation fixture must produce identical commander, capture and unit results.")
	if failures == 0:
		print("GRID_COMMAND_COMMANDER_PROGRESSION_SMOKE_OK: two deterministic 600-second continuations, BLU advances beyond I/J and RED beyond A/B")
	quit(0 if failures == 0 else 1)

func _continue_operation() -> Dictionary:
	var world = load("res://scenes/main.tscn").instantiate()
	root.add_child(world)
	world.set_process(false)
	world.core.time = 346.0
	world.elapsed = 346.0
	world.core.next_plan = 360.0
	world.core.next_income = 350.0
	world.core.next_supply = 390.0
	world.core.next_ground_logistics = 347.0
	world.commander_director.next_plan = 346.0
	# Restore a plausible post-capture force at each frontier, retaining the
	# production theater, movement speeds, pathfinding and autonomous transport.
	for side in ["BLU", "RED"]:
		var held: Array = ["I", "J"] if side == "BLU" else ["A", "B"]
		var frontier: String = "I" if side == "BLU" else "B"
		world.commander_director._ensure_objectives(world.core, side)
		for id in held:
			world.core.objectives[id]["owner"] = side
			world.commander_director.sides[side]["objectives"][id]["owner"] = side
			world.commander_director.sides[side]["objectives"][id]["observed_at"] = 344.0
		for index in range(5):
			var role: String = "RIFLE" if index < 3 else "TROOP_TRUCK"
			var unit: Dictionary = world.core.make_unit(side, role, "%s-progress-%d" % [side, index])
			unit.merge({"fuel": 100.0, "ammo": 100.0, "service": "READY", "at_base": false,
				"spawn_position": (world.map.bases[side] if index == 0 else world.core.objectives[frontier]["position"]) + Vector3(float(index) * 0.03, 0, 0)}, true)
			world.core.units[side].append(unit)
	world._sync_core_visuals()
	var targeted := {"BLU": {}, "RED": {}}
	var previous_revision := {"BLU": 0, "RED": 0}
	for tick in range(12000):
		world._tick_simulation(0.05)
		for side in ["BLU", "RED"]:
			var plan: Dictionary = world.commander_director.plan_for(side)
			var revision := int(plan.get("revision", 0))
			if revision == previous_revision[side]:
				continue
			previous_revision[side] = revision
			var target := str(plan["target"])
			targeted[side][target] = true
			var known: Dictionary = world.commander_director.sides[side]["objectives"][target]
			check(known["owner"] != side or known["contested"], "%s selected already secured %s at %.2fs." % [side, target, world.core.time])
			check(not plan["reserve_ids"].is_empty(), "%s abandoned its supplied base guard." % side)
			check(world.core._unit(side, "%s-progress-0" % side)["position"].distance_to(world.map.bases[side]) < 1.0, "%s base guard wandered away during the advance." % side)
	var captured := {"BLU": [], "RED": []}
	for id in world.core.objectives:
		var owner := str(world.core.objectives[id]["owner"])
		if captured.has(owner):
			captured[owner].append(id)
	for side in ["BLU", "RED"]:
		if captured[side].size() <= 2:
			for unit in world.units:
				if unit.core_record["side"] == side:
					print("PROGRESS_DIAGNOSTIC %s role=%s pos=%s order=%s route=%d transport=%s fuel=%.2f" % [unit.core_record["id"], unit.role, unit.position, unit.order, unit.route.size(), unit.core_record["transport"], unit.core_record["fuel"]])
		check(captured[side].size() > 2, "%s did not capture another objective during ten minutes of autonomous continuation: %s" % [side, captured[side]])
		check(previous_revision[side] == 20, "%s stopped planning during the continuation." % side)
		check(targeted[side].has("H" if side == "BLU" else "C"), "%s never issued the next feasible objective." % side)
		var guard: Dictionary = world.core._unit(side, "%s-progress-0" % side)
		check(guard["command_mission"]["task"] == "DEFEND_BASE" and guard["position"].distance_to(world.map.bases[side]) < 1.0, "%s base guard left command unprotected while the main force advanced." % side)
	print("COMMANDER_PROGRESS elapsed=%.2f captured=%s targets=%s" % [world.core.time, captured, targeted])
	var result := {"core": world.core.snapshot(), "director": world.commander_director.snapshot()}
	world.free()
	return result
