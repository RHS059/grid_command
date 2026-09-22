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
	var world = load("res://scenes/main.tscn").instantiate()
	root.add_child(world)
	world.set_process(false)
	# A forward troop truck too low on fuel for its next pickup leg used to hold
	# there forever. It must drive home, refuel, and return to service.
	world.core.depots["RED"]["mob"]["fuel"] = 5000.0
	var truck: Dictionary = world.core.make_unit("RED", "TROOP_TRUCK", "RED-stranded-truck")
	truck.merge({"fuel": 28.0, "service": "READY", "at_base": false, "spawn_position": world.core.objectives["F"]["position"]}, true)
	var squad: Dictionary = world.core.make_unit("RED", "RIFLE", "RED-waiting-squad")
	squad.merge({"at_base": false, "spawn_position": world.map.bases["RED"] + Vector3(0.3, 0, 0.3)}, true)
	squad["command_mission"] = {"task": "ASSAULT", "target": "F", "destination": Vector2(0, 0), "revision": 1, "expires_at": INF}
	world.core.units["RED"].append(truck)
	world.core.units["RED"].append(squad)
	world._sync_core_visuals()
	var started := false
	var refueled := false
	for tick in range(20 * 60 * 30):
		world._tick_simulation(0.05)
		started = started or bool(truck.get("refuel_run", false))
		if started and not truck.get("refuel_run", false) and float(truck["fuel"]) >= 90.0:
			refueled = true
			break
	check(started, "A stranded forward truck never started a refuel run.")
	check(refueled, "A stranded forward truck never reached base and refueled: fuel %.1f at %s." % [float(truck["fuel"]), truck["position"]])
	if failures == 0:
		print("GRID_COMMAND_TRANSPORT_REFUEL_SMOKE_OK: stranded forward transport returns to base and refuels at %.0fs" % world.core.time)
	world.free()
	quit(0 if failures == 0 else 1)
