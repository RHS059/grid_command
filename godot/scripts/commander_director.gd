extends RefCounted
class_name CommanderDirector

## Deterministic native counterpart to the browser hierarchy modules.
## Commanders receive delayed contact reports and unit status. They never inspect
## enemy records directly while scoring an operational plan.

const UPDATE_SECONDS := 0.5
const PLAN_SECONDS := 30.0
const CONTACT_MEMORY_SECONDS := 18.0
const ORDER_LIFETIME_SECONDS := 120.0
const REPORT_DELAY_SECONDS := 1.5
const ORDER_DELAY_SECONDS := 0.75
const SENSOR_RANGE := 25.0 # Browser metres / 100.
const OBJECTIVE_SENSOR_RANGE := 1.8
const OBJECTIVE_SAMPLE_SECONDS := 2.0
const OBJECTIVE_REPORT_DELAY_SECONDS := 2.0

var seed := 3701
var next_update := 0.0
var next_plan := PLAN_SECONDS
var sides: Dictionary = {}
var reports: Array[Dictionary] = []
var objective_reports: Array[Dictionary] = []
var orders: Array[Dictionary] = []
var traces: Array[Dictionary] = []

func setup(value: int = 3701) -> void:
	seed = value
	next_update = 0.0
	next_plan = PLAN_SECONDS
	reports.clear()
	objective_reports.clear()
	orders.clear()
	traces.clear()
	for side in ["BLU", "RED"]:
		sides[side] = {
			"personality": _personality(side),
			"contacts": {},
			"objectives": {},
			"last_objective_report": {},
			"formations": [],
			"plan": {},
			"revision": 0,
			"degraded": false,
			"council": {},
		}

func tick(core) -> void:
	if sides.is_empty():
		setup(seed)
	var now: float = float(core.time)
	if now + 0.0001 < next_update:
		_deliver_orders(core, now)
		return
	next_update = now + UPDATE_SECONDS
	_observe_objectives(core, now)
	_deliver_objective_reports(now)
	_observe(core, now)
	_deliver_reports(now)
	_update_factors(core, now)
	if now + 0.0001 >= next_plan:
		# Both plans are derived before either side receives new orders.
		var planned := {
			"BLU": _plan_side(core, "BLU", now),
			"RED": _plan_side(core, "RED", now),
		}
		for side in ["BLU", "RED"]:
			_apply_plan(core, side, planned[side], now)
		next_plan += PLAN_SECONDS
	_deliver_orders(core, now)

func contacts_for(side: String) -> Array:
	var result: Array = sides.get(side, {}).get("contacts", {}).values()
	result.sort_custom(func(a: Dictionary, b: Dictionary) -> bool: return str(a["unit_id"]) < str(b["unit_id"]))
	return result

func council_for(side: String) -> Dictionary:
	return sides.get(side, {}).get("council", {}).duplicate(true)

func plan_for(side: String) -> Dictionary:
	return sides.get(side, {}).get("plan", {}).duplicate(true)

func snapshot() -> Dictionary:
	return {
		"seed": seed,
		"next_update": next_update,
		"next_plan": next_plan,
		"sides": sides,
		"reports": reports,
		"objective_reports": objective_reports,
		"orders": orders,
		"traces": traces,
	}.duplicate(true)

func restore(data: Dictionary) -> void:
	seed = int(data.get("seed", 3701))
	next_update = float(data.get("next_update", 0.0))
	next_plan = float(data.get("next_plan", PLAN_SECONDS))
	sides = data.get("sides", {}).duplicate(true)
	reports = data.get("reports", []).duplicate(true)
	objective_reports = data.get("objective_reports", []).duplicate(true)
	orders = data.get("orders", []).duplicate(true)
	traces = data.get("traces", []).duplicate(true)
	if sides.is_empty():
		setup(seed)
	for side in sides:
		if not sides[side].has("objectives"):
			sides[side]["objectives"] = {}
		if not sides[side].has("last_objective_report"):
			sides[side]["last_objective_report"] = {}

func _ensure_objectives(core, side: String) -> void:
	var known: Dictionary = sides[side]["objectives"]
	for id in core.objectives:
		if not known.has(id):
			# Positions are public. Control status needs a local report.
			known[id] = {"id": id, "position": _vector2(core.objectives[id].get("position", Vector3.ZERO)), "owner": null, "contested": false, "observed_at": -1.0}

func _observe_objectives(core, now: float) -> void:
	for side in ["BLU", "RED"]:
		_ensure_objectives(core, side)
		var command: Dictionary = sides[side]
		for id in command["objectives"]:
			var known: Dictionary = command["objectives"][id]
			if now - float(command["last_objective_report"].get(id, -INF)) < OBJECTIVE_SAMPLE_SECONDS:
				continue
			var observed := false
			for unit in core.units.get(side, []):
				if _can_observe(unit) and not bool(unit.get("surrendered", false)) and not bool(unit.get("crew_bailed", unit.get("crewBailed", false))) and not bool(unit.get("external", false)) and not unit.get("carrier", ""):
					if _position(unit).distance_to(_vector2(known["position"])) <= OBJECTIVE_SENSOR_RANGE:
						observed = true
						break
			if not observed or not core.objectives.has(id):
				continue
			var report: Dictionary = known.duplicate(true)
			report["owner"] = core.objectives[id].get("owner", null)
			report["contested"] = bool(core.objectives[id].get("contested", false))
			report["observed_at"] = now
			command["last_objective_report"][id] = now
			objective_reports.append({"side": side, "due": now + OBJECTIVE_REPORT_DELAY_SECONDS, "objective": report})

func _deliver_objective_reports(now: float) -> void:
	var pending: Array[Dictionary] = []
	for packet in objective_reports:
		if float(packet["due"]) > now:
			pending.append(packet)
			continue
		var known: Dictionary = sides[packet["side"]]["objectives"]
		var report: Dictionary = packet["objective"]
		var id = report["id"]
		if known.has(id) and float(report["observed_at"]) > float(known[id]["observed_at"]):
			known[id] = report.duplicate(true)
	objective_reports = pending

func _observe(core, now: float) -> void:
	for side in ["BLU", "RED"]:
		var enemy := "RED" if side == "BLU" else "BLU"
		var seen: Dictionary = {}
		for observer in core.units.get(side, []):
			if not _can_observe(observer):
				continue
			var observer_position := _position(observer)
			for target in core.units.get(enemy, []):
				if not _can_be_seen(target):
					continue
				if observer_position.distance_to(_position(target)) > SENSOR_RANGE:
					continue
				var id := str(target.get("id", ""))
				if not seen.has(id):
					seen[id] = []
				seen[id].append(str(observer.get("id", "")))
		for target in core.units.get(enemy, []):
			var id := str(target.get("id", ""))
			if not seen.has(id):
				continue
			var key := "%s:%s:%d" % [side, id, int(floor(now * 2.0))]
			if reports.any(func(packet: Dictionary) -> bool: return packet.get("key", "") == key):
				continue
			reports.append({
				"key": key,
				"side": side,
				"due": now + REPORT_DELAY_SECONDS,
				"contact": {
					"unit_id": id,
					"role": str(target.get("role", "UNKNOWN")),
					"position": _position(target),
					"last_seen": now,
					"confidence": 1.0,
					"observers": seen[id].duplicate(),
				}
			})

func _deliver_reports(now: float) -> void:
	var pending: Array[Dictionary] = []
	for packet in reports:
		if float(packet["due"]) > now:
			pending.append(packet)
			continue
		var side := str(packet["side"])
		var contact: Dictionary = packet["contact"]
		sides[side]["contacts"][str(contact["unit_id"])] = contact
	reports = pending
	for side in ["BLU", "RED"]:
		var contacts: Dictionary = sides[side]["contacts"]
		for id in contacts.keys():
			var contact: Dictionary = contacts[id]
			var age := now - float(contact["last_seen"])
			if age > CONTACT_MEMORY_SECONDS:
				contacts.erase(id)
			else:
				contact["confidence"] = clampf(1.0 - age / CONTACT_MEMORY_SECONDS, 0.0, 1.0)

func _update_factors(core, now: float) -> void:
	for side in ["BLU", "RED"]:
		for unit in core.units.get(side, []):
			if float(unit.get("hp", 0.0)) <= 0.0:
				continue
			var factors: Dictionary = unit.get("human_factors", {
				"morale": 0.8,
				"cohesion": 0.8,
				"fatigue": 0.0,
				"suppression": 0.0,
				"last_hp": float(unit.get("hp", 100.0)),
				"updated_at": now,
				"posture": "STEADY",
			})
			var dt := maxf(0.0, now - float(factors.get("updated_at", now)))
			var losses := maxf(0.0, float(factors.get("last_hp", 100.0)) - float(unit.get("hp", 100.0))) / 100.0
			var suppression := clampf(float(unit.get("suppression", factors.get("suppression", 0.0))), 0.0, 1.0)
			var moving := bool(unit.get("moving", false))
			factors["fatigue"] = clampf(float(factors["fatigue"]) + dt * (0.001 if moving else -0.002), 0.0, 1.0)
			factors["cohesion"] = clampf(float(factors["cohesion"]) - losses * 0.35 + dt * (0.0006 if suppression < 0.2 else -0.0006), 0.0, 1.0)
			factors["morale"] = clampf(float(factors["morale"]) - losses * 0.55 + dt * (0.0015 * float(factors["cohesion"]) - suppression * 0.006 - (0.0015 if float(unit.get("ammo", 100.0)) < 12.0 else 0.0)), 0.0, 1.0)
			factors["suppression"] = suppression
			factors["last_hp"] = float(unit.get("hp", 100.0))
			factors["updated_at"] = now
			var posture := "STEADY"
			if float(factors["morale"]) < 0.12 and suppression > 0.7:
				posture = "ROUT"
			elif float(factors["morale"]) < 0.21 or suppression > 0.82 or float(unit.get("hp", 100.0)) < 22.0:
				posture = "WITHDRAW"
			elif str(factors.get("posture", "")) in ["WITHDRAW", "ROUT"] and (float(factors["morale"]) < 0.4 or suppression > 0.35):
				posture = "WITHDRAW"
			factors["posture"] = posture
			unit["human_factors"] = factors

func _plan_side(core, side: String, now: float) -> Dictionary:
	_ensure_objectives(core, side)
	var command: Dictionary = sides[side]
	var personality: Dictionary = command["personality"]
	var own: Array = core.units.get(side, []).filter(func(unit: Dictionary) -> bool: return _commandable(unit))
	own.sort_custom(func(a: Dictionary, b: Dictionary) -> bool: return str(a["id"]) < str(b["id"]))
	var contacts: Array = contacts_for(side)
	var readiness := 0.0
	for unit in own:
		var factors: Dictionary = unit.get("human_factors", {})
		readiness += (float(unit.get("hp", 100.0)) / 100.0 + float(unit.get("ammo", 100.0)) / 100.0 + float(unit.get("fuel", 100.0)) / 100.0 + float(factors.get("morale", 0.8))) / 4.0
	readiness = readiness / maxf(1.0, float(own.size()))
	var command_position := _command_position(core, side)
	var scores: Dictionary = {}
	for id in command["objectives"].keys():
		var objective: Dictionary = command["objectives"][id]
		var position := _vector2(objective.get("position", Vector3.ZERO))
		var threat := 0.0
		for contact in contacts:
			if _vector2(contact["position"]).distance_to(position) < 5.0:
				threat += float(contact["confidence"])
		var score := 100.0 - command_position.distance_to(position) * 1.0 - threat * (25.0 - float(personality["risk"]) * 18.0)
		if str(objective.get("owner", "")) == side:
			score -= 100.0
		if bool(objective.get("contested", false)):
			score += 15.0
		if str(command.get("plan", {}).get("target", "")) == str(id):
			score += 12.0 * float(personality["consistency"])
		scores[str(id)] = score
	# Match the browser fronts' eligibility rule. A finite ownership penalty
	# cannot exclude secured objectives on a theater wider than that penalty.
	# Keep the score ledger, but expand only toward unowned/contested reports.
	var targets: Array = scores.keys().filter(func(id: String) -> bool: return command["objectives"][id]["owner"] != side or command["objectives"][id]["contested"])
	var all_secured := targets.is_empty() and not scores.is_empty()
	if all_secured:
		targets = scores.keys()
	var target := ""
	for id in targets:
		if target.is_empty() or float(scores[id]) > float(scores[target]) or (is_equal_approx(float(scores[id]), float(scores[target])) and str(id) < target):
			target = str(id)
	var base_threat := contacts.any(func(contact: Dictionary) -> bool: return float(contact["confidence"]) > 0.3 and _vector2(contact["position"]).distance_to(command_position) < 4.0)
	var posture := "HOLD" if all_secured else "RECOVER" if readiness < 0.4 else "DEFEND" if readiness < 0.58 - float(personality["risk"]) * 0.15 else "ADVANCE"
	var action := "HOLD" if posture == "HOLD" else "RESUPPLY" if posture == "RECOVER" else "ASSEMBLE" if posture == "DEFEND" else "MASS" if contacts.is_empty() else "FLANK" if float(personality["initiative"]) > 0.6 and float(personality["risk"]) > 0.45 else "SEIZE"
	var reserve_ids := _base_defenders(core, side, own, contacts, personality)
	return {
		"revision": int(command["revision"]) + 1,
		"target": target,
		"action": action,
		"posture": posture,
		"reserve_ids": reserve_ids,
		"issued_at": now,
		"expires_at": now + ORDER_LIFETIME_SECONDS,
		"readiness": readiness,
		"scores": scores,
		"contact_count": contacts.size(),
		"base_threat": base_threat,
	}

func _base_defenders(core, side: String, own: Array, contacts: Array, personality: Dictionary) -> Array[String]:
	var base := _command_position(core, side)
	var ready := own.filter(func(unit: Dictionary) -> bool: return str(unit["role"]) in ["RIFLE", "MG", "AT", "TANK", "APC", "CANNON_APC", "IFV"] and unit.get("service", "READY") == "READY" and float(unit.get("hp", 0.0)) >= 25.0 and float(unit.get("ammo", 0.0)) >= 12.0 and not unit.get("transport", {}).has("carrier"))
	ready.sort_custom(func(a: Dictionary, b: Dictionary) -> bool:
		var a_distance := _position(a).distance_squared_to(base)
		var b_distance := _position(b).distance_squared_to(base)
		return str(a["id"]) < str(b["id"]) if is_equal_approx(a_distance, b_distance) else a_distance < b_distance)
	var capture_bodies := 0
	for unit in own:
		if str(unit["role"]) in ["RIFLE", "AT"] and float(unit.get("hp", 0.0)) >= 25.0 and float(unit.get("ammo", 0.0)) >= 12.0:
			capture_bodies += int(unit.get("members", 0))
	var threats := contacts.filter(func(contact: Dictionary) -> bool: return float(contact["confidence"]) > 0.3 and _vector2(contact["position"]).distance_to(base) < 4.0).size()
	var desired := maxi(1, maxi(threats, ceili(float(ready.size()) * 0.2 * (0.5 + float(personality["reserve"])))))
	var defenders: Array[String] = []
	for unit in ready:
		var bodies := int(unit.get("members", 0)) if str(unit["role"]) in ["RIFLE", "AT"] else 0
		# Keep a capture-capable force advancing while a supplied local guard
		# protects command. A base contact reinforces that guard, not a global retreat.
		if bodies > 0 and capture_bodies >= core.CAPTURE_MIN_BODIES and capture_bodies - bodies < core.CAPTURE_MIN_BODIES:
			continue
		if defenders.size() >= desired:
			break
		defenders.append(str(unit["id"]))
		capture_bodies -= bodies
	return defenders

func _apply_plan(core, side: String, plan: Dictionary, now: float) -> void:
	var command: Dictionary = sides[side]
	command["revision"] = int(plan["revision"])
	command["plan"] = plan
	var own: Array = core.units.get(side, []).filter(func(unit: Dictionary) -> bool: return _commandable(unit))
	own.sort_custom(func(a: Dictionary, b: Dictionary) -> bool: return str(a["id"]) < str(b["id"]))
	command["formations"] = _assign_formations(side, own)
	command["council"] = _assess_council(core, side, plan, own, now)
	if core.forces.has(side):
		core.forces[side]["action"] = plan["action"]
		core.forces[side]["target"] = plan["target"]
		core.forces[side]["cycles"] = int(core.forces[side].get("cycles", 0)) + 1
		core.log_event(side,"%s objective %s. %s" % [plan["action"],plan["target"],core.forces[side].get("purchase","")],"command")
	var objective: Dictionary = core.objectives.get(plan["target"], {})
	var target_position := _vector2(objective.get("position", Vector3.ZERO))
	for formation in command["formations"]:
		for slot in range(formation["unit_ids"].size()):
			var id := str(formation["unit_ids"][slot])
			var unit := _unit(core, side, id)
			if unit.is_empty():
				continue
			var task := _task_for(unit, plan)
			var destination := _destination_for(core, side, unit, target_position, task, slot)
			var revision := int(unit.get("mission_revision", 0)) + 1
			unit["mission_revision"] = revision
			orders.append({
				"side": side,
				"unit_id": id,
				"issuer": formation["id"],
				"revision": revision,
				"action": plan["action"],
				"task": task,
				"target": plan["target"],
				"destination": destination,
				"issued_at": now,
				"execute_at": now + ORDER_DELAY_SECONDS + float(slot) * 0.05,
				"expires_at": float(plan["expires_at"]),
			})
	_trace(now, side, "PLAN %s %s" % [plan["action"], plan["target"]], ["readiness %.2f" % plan["readiness"], "%d received contacts" % plan["contact_count"]])

func _deliver_orders(core, now: float) -> void:
	var pending: Array[Dictionary] = []
	orders.sort_custom(func(a: Dictionary, b: Dictionary) -> bool: return float(a["execute_at"]) < float(b["execute_at"]) if not is_equal_approx(float(a["execute_at"]), float(b["execute_at"])) else str(a["unit_id"]) < str(b["unit_id"]))
	for order in orders:
		if float(order["expires_at"]) < now:
			continue
		if float(order["execute_at"]) > now:
			pending.append(order)
			continue
		var unit := _unit(core, str(order["side"]), str(order["unit_id"]))
		if unit.is_empty() or float(unit.get("hp", 0.0)) <= 0.0:
			continue
		var current: Dictionary = unit.get("command_mission", {})
		if current.is_empty() or int(order["revision"]) > int(current.get("revision", 0)):
			unit["command_mission"] = order.duplicate(true)
			unit["mission"] = order["task"]
			unit["subcommand"] = order["issuer"]
			unit["target"] = order["target"]
	orders = pending

func _assign_formations(side: String, own: Array) -> Array[Dictionary]:
	var formations: Array[Dictionary] = []
	for unit in own:
		var formation: Dictionary = {}
		if not formations.is_empty() and formations.back()["unit_ids"].size() < 3:
			formation = formations.back()
		else:
			formation = {"id": "%s:auto:%d" % [side, formations.size() + 1], "name": "Maneuver group %d" % [formations.size() + 1], "unit_ids": []}
			formations.append(formation)
		formation["unit_ids"].append(str(unit["id"]))
	return formations

func _assess_council(core, side: String, plan: Dictionary, own: Array, now: float) -> Dictionary:
	var infantry := own.filter(func(unit: Dictionary) -> bool: return not _is_vehicle(str(unit["role"]))).size()
	var aircraft := own.filter(func(unit: Dictionary) -> bool: return str(unit["role"]) in core.AIR).size()
	var fires := own.filter(func(unit: Dictionary) -> bool: return str(unit["role"]) in ["MG", "MORTAR", "AT", "AA_TEAM", "TANK", "IFV", "CANNON_APC"]).size()
	var seats := 0
	for unit in own:
		seats += int(core.TRANSPORT_CAPACITY.get(str(unit["role"]), 0))
	var stock: Dictionary = core.depots[side]["mob"]
	var available_fuel: float = float(core.fuel_economy(side)["available"])
	var reports := {
		"TROOPS": _report("Troop Command", infantry >= 2, "%d maneuver groups available" % infantry, now),
		"FUEL": _report("Fuel Command", available_fuel > 0.0, "%d fuel available" % int(available_fuel), now),
		"MOTORCADE": _report("Motorcade", seats >= 4, "%d troop seats available" % seats, now),
		"AIR": _report("Air Command", aircraft > 0, "%d aircraft available" % aircraft, now),
		"LOGISTICS": _report("Logistics", float(stock["repair"]) + float(stock["ammo"]) + float(stock["fuel"]) > 0.0, "%d physical stock" % int(float(stock["repair"]) + float(stock["ammo"]) + float(stock["fuel"])), now),
		"FIRES": _report("Fires", fires > 0, "%d fire-support elements" % fires, now),
	}
	return {"revision": plan["revision"], "action": plan["action"], "target": plan["target"], "issued_at": now, "reports": reports}

func _report(name: String, approved: bool, metrics: String, now: float) -> Dictionary:
	return {"name": name, "approved": approved, "required": name in ["Troop Command", "Fuel Command"], "status": "APPROVED" if approved else "HOLD", "reason": metrics, "metrics": metrics, "updated_at": now}

func _task_for(unit: Dictionary, plan: Dictionary) -> String:
	var role := str(unit["role"])
	if str(plan["posture"]) == "HOLD":
		return "HOLD"
	if str(unit["id"]) in plan["reserve_ids"]:
		return "DEFEND_BASE"
	if str(plan["posture"]) == "RECOVER" or float(unit.get("ammo", 100.0)) < 12.0 or float(unit.get("hp", 100.0)) < 25.0:
		return "RESUPPLY"
	if str(plan["posture"]) == "DEFEND":
		return "WITHDRAW"
	if role in ["SCOUT", "RECON_UAV"]:
		return "RECON"
	if role in ["MG", "MORTAR", "MEDIC", "AA_TEAM"]:
		return "SUPPORT"
	return "ASSAULT"

func _destination_for(core, side: String, unit: Dictionary, target: Vector2, task: String, slot: int) -> Vector2:
	if task == "HOLD":
		return _position(unit)
	if task == "DEFEND_BASE":
		return _command_position(core, side) + Vector2(float(slot - 1) * 0.3, -0.4 if side == "BLU" else 0.4)
	if task in ["RESUPPLY", "WITHDRAW", "RESERVE"]:
		return _command_position(core, side)
	var sign := -1.0 if side == "BLU" else 1.0
	var rear := 3.8 if str(unit["role"]) == "MORTAR" else 1.5 if task == "SUPPORT" else 1.0 if task == "RECON" else 0.2
	return target + Vector2(float(slot - 1) * 0.24, sign * rear)

func _command_position(core, side: String) -> Vector2:
	for unit in core.units.get(side, []):
		if str(unit.get("role", "")) == "COMMAND":
			return _position(unit)
	return Vector2.ZERO

func _unit(core, side: String, id: String) -> Dictionary:
	for unit in core.units.get(side, []):
		if str(unit.get("id", "")) == id:
			return unit
	return {}

func _can_observe(unit: Dictionary) -> bool:
	return float(unit.get("hp", 0.0)) > 0.0 and not unit.get("transport", {}).has("carrier")

func _can_be_seen(unit: Dictionary) -> bool:
	return _can_observe(unit)

func _commandable(unit: Dictionary) -> bool:
	return float(unit.get("hp", 0.0)) > 0.0 and not unit.get("surrendered", false) and not unit.get("crew_bailed", false) and not unit.get("external", false) and str(unit.get("role", "")) not in ["COMMAND", "PILOT", "LOGISTICS", "FORKLIFT", "CARGO_PLANE", "UAV_JAMMER", "TRUCK", "TROOP_TRUCK", "TRANSPORT_HELI", "HEAVY_LIFT_HELI"]

func _is_vehicle(role: String) -> bool:
	return role not in ["RIFLE", "SCOUT", "MG", "AT", "MORTAR", "ENGINEER", "MEDIC", "LOGISTICS", "PILOT", "COMMAND", "AA_TEAM"]

func _position(unit: Dictionary) -> Vector2:
	return _vector2(unit.get("position", Vector3.ZERO))

func _vector2(value: Variant) -> Vector2:
	if value is Vector2:
		return value
	if value is Vector3:
		return Vector2(value.x, value.z)
	if value is Array and value.size() >= 2:
		return Vector2(float(value[0]), float(value[1]))
	return Vector2.ZERO

func _personality(side: String) -> Dictionary:
	var result := {}
	for key in ["risk", "tempo", "initiative", "consistency", "reserve", "experience"]:
		result[key] = 0.25 + _seeded("%s:%s" % [side, key]) * 0.5
	return result

func _seeded(key: String) -> float:
	var value := seed & 0xffffffff
	for character in key:
		value = int((value ^ character.unicode_at(0)) * 16777619) & 0xffffffff
	value = (value ^ (value >> 16)) & 0xffffffff
	value = int(value * 2246822507) & 0xffffffff
	value = (value ^ (value >> 13)) & 0xffffffff
	return float(value) / 4294967296.0

func _trace(now: float, actor: String, decision: String, reasons: Array) -> void:
	traces.append({"time": now, "actor": actor, "level": "commander", "decision": decision, "reasons": reasons.duplicate()})
	if traces.size() > 240:
		traces = traces.slice(traces.size() - 240)
