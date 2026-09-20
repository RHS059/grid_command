extends RefCounted
class_name SimulationCore

## Browser catalog, in metres/second and SP. Presentation uses metres / 100.
## Cargo choreography and combat remain native approximations; see PORT_PARITY.md.
const CATALOG := {
	"PATROL_BOAT":[4,14,1200,12,1800], "FRIGATE":[32,12,2400,40,14000], "AIRCRAFT_CARRIER":[48,10,2400,28,24000],
	"LANDING_CRAFT":[3,8,0,0,2000], "AMPHIBIOUS_APC":[3,7,1200,12,5500], "RIFLE":[4,3.8,600,6,200],
	"SCOUT":[4,4.5,600,3,150], "MG":[4,3.2,800,7,250], "AT":[4,3.4,410,7,350], "MORTAR":[4,2.7,1200,8,450],
	"ENGINEER":[4,3.4,150,1,300], "MEDIC":[3,3.8,150,1,250], "LOGISTICS":[4,3.6,160,2,300], "TANK":[3,9,600,22,8000],
	"PILOT":[2,3.8,120,1,200], "COMMAND":[1,0,220,1,0], "TRUCK":[1,12,0,0,350], "RECON_UAV":[1,24,950,0,500],
	"APC":[3,10,420,11,4000], "CANNON_APC":[3,10,1100,14,5000], "IFV":[3,10,1300,18,6000], "CAS_FIGHTER":[2,85,1200,12,8000],
	"JET":[1,110,1800,28,16000], "ATTACK_HELI":[2,28,1500,24,10000], "FORKLIFT":[1,3,0,0,150], "CARGO_PLANE":[3,85,0,0,7000],
	"UAV_JAMMER":[0,0,600,0,200], "AA_TEAM":[2,3.4,2400,60,500], "TRANSPORT_HELI":[2,75,0,0,4500], "HEAVY_LIFT_HELI":[3,65,0,0,6000], "TROOP_TRUCK":[1,24,0,0,300]
}
const ROLES := ["PATROL_BOAT","FRIGATE","AIRCRAFT_CARRIER","LANDING_CRAFT","AMPHIBIOUS_APC","RIFLE","SCOUT","MG","AT","MORTAR","ENGINEER","MEDIC","LOGISTICS","TANK","PILOT","COMMAND","TRUCK","RECON_UAV","APC","CANNON_APC","IFV","CAS_FIGHTER","JET","ATTACK_HELI","FORKLIFT","CARGO_PLANE","UAV_JAMMER","AA_TEAM","TRANSPORT_HELI","HEAVY_LIFT_HELI","TROOP_TRUCK"]
const TRANSPORT_CAPACITY := {"APC":8,"CANNON_APC":6,"IFV":6,"TROOP_TRUCK":7,"TRANSPORT_HELI":24,"LANDING_CRAFT":24,"AMPHIBIOUS_APC":8}
const NAVAL := ["PATROL_BOAT","FRIGATE","AIRCRAFT_CARRIER","LANDING_CRAFT","AMPHIBIOUS_APC"]
const AIR := ["RECON_UAV","CAS_FIGHTER","JET","ATTACK_HELI","CARGO_PLANE","TRANSPORT_HELI","HEAVY_LIFT_HELI"]
const GROUND_VEHICLES := ["TANK","TRUCK","APC","CANNON_APC","IFV","FORKLIFT","UAV_JAMMER","TROOP_TRUCK"]
const DISCOUNTED := ["TANK","TRUCK","TROOP_TRUCK","ATTACK_HELI","TRANSPORT_HELI","HEAVY_LIFT_HELI"]
const OPERATIONAL_RANGE := {"TRUCK":260000,"TROOP_TRUCK":260000,"FORKLIFT":40000,"APC":180000,"CANNON_APC":180000,"IFV":180000,"TANK":140000,"TRANSPORT_HELI":280000,"HEAVY_LIFT_HELI":260000,"ATTACK_HELI":220000,"RECON_UAV":240000,"CAS_FIGHTER":600000,"JET":600000,"CARGO_PLANE":800000}
const CARRIER_STOP_SECONDS := 8.0
const CARRIER_DEPLOY_SECONDS := 20.0
const CARRIER_UNDEPLOY_SECONDS := 15.0
const BOARD_SECONDS := 80.0 / 24.0
const CAPTURE_RADIUS := 1.0
const CAPTURE_MIN_BODIES := 6
const CAPTURE_SECONDS := 8.0
const TERRITORIAL_HOLD_SECONDS := 60.0
const ARMORED := ["TANK","APC","CANNON_APC","IFV","FRIGATE","AIRCRAFT_CARRIER","AMPHIBIOUS_APC"]
const MISSION_ASSETS := ["FORKLIFT","CARGO_PLANE","UAV_JAMMER","TRANSPORT_HELI","HEAVY_LIFT_HELI","TROOP_TRUCK","TRUCK"]
## Exact browser weapon contracts. Distances are source metres and are converted
## by weapon_damage() at the native presentation boundary.
const WEAPONS := {
	"rifle":{"id":"rifle","range":600.0,"damage":3.0,"cooldown":0.5,"armor":false,"air":false,"ammo":0.3,"blast":0.0},
	"mg":{"id":"mg","range":800.0,"damage":3.5,"cooldown":0.16,"armor":false,"air":false,"ammo":0.3,"blast":0.0},
	"cannon":{"id":"cannon","range":1400.0,"damage":23.0,"cooldown":3.8,"armor":true,"air":false,"ammo":2.0,"blast":12.0},
	"rocket":{"id":"rocket","range":1500.0,"damage":12.0,"cooldown":0.35,"armor":true,"air":false,"ammo":2.0,"blast":7.0},
	"bomb":{"id":"bomb","range":900.0,"damage":45.0,"cooldown":1.2,"armor":true,"air":false,"ammo":2.0,"blast":22.0},
	"cas-gun":{"id":"cas-gun","range":1200.0,"damage":6.0,"cooldown":0.2,"armor":false,"air":false,"ammo":0.3,"blast":0.0},
	"aa":{"id":"aa","range":2400.0,"damage":65.0,"cooldown":8.0,"armor":true,"air":true,"ammo":25.0,"blast":0.0},
	"at":{"id":"at","range":900.0,"damage":29.0,"cooldown":5.0,"armor":true,"air":false,"ammo":2.0,"blast":8.0},
	"autocannon":{"id":"autocannon","range":1200.0,"damage":9.0,"cooldown":0.7,"armor":true,"air":true,"ammo":2.0,"blast":5.0},
	"missile":{"id":"missile","range":1800.0,"damage":32.0,"cooldown":4.0,"armor":true,"air":true,"ammo":2.0,"blast":14.0},
	"mortar":{"id":"mortar","range":1200.0,"damage":12.0,"cooldown":6.0,"armor":false,"air":false,"ammo":0.3,"blast":20.0}
}

var time := 0.0
var next_plan := 30.0
var next_supply := 30.0
var next_income := 5.0
var next_ground_logistics := 1.0
var serial := 0
var forces: Dictionary = {}
var depots: Dictionary = {}
var airfields: Dictionary = {}
var mobs: Dictionary = {}
var objectives: Dictionary = {}
var units: Dictionary = {}
var shipments: Array = []
var radio: Array = []
var external_command_planner := false
var missiles: Array = []
var territory_hold := {"BLU":0.0,"RED":0.0}
var winner := ""

static func is_vehicle(role: String) -> bool:
	return role in AIR or role in NAVAL or role in GROUND_VEHICLES

static func resources(role: String) -> Dictionary:
	var air := role in AIR
	var armor := role in ["TANK","APC","CANNON_APC","IFV","FRIGATE","AIRCRAFT_CARRIER","AMPHIBIOUS_APC"]
	var heavy := role in ["JET","CARGO_PLANE","HEAVY_LIFT_HELI"]
	return {"fuel":2200.0 if heavy else 900.0 if air else 800.0 if armor else 180.0,"repair":1600.0 if heavy else 1000.0 if air else 800.0 if armor else 120.0,"ammo":(1200.0 if air else 600.0 if armor else 100.0) if CATALOG[role][3] > 0 else 0.0}

static func weapon_for(role: String) -> Dictionary:
	if role in ["RECON_UAV","TRUCK","FORKLIFT","CARGO_PLANE","UAV_JAMMER","TRANSPORT_HELI","HEAVY_LIFT_HELI","TROOP_TRUCK","LANDING_CRAFT"]: return {}
	if role in ["FRIGATE","ATTACK_HELI"]: return WEAPONS["missile"]
	if role == "AIRCRAFT_CARRIER" or role == "AA_TEAM": return WEAPONS["aa"]
	if role in ["PATROL_BOAT","AMPHIBIOUS_APC","IFV","CANNON_APC"]: return WEAPONS["autocannon"]
	if role == "JET": return WEAPONS["rocket"]
	if role == "CAS_FIGHTER": return WEAPONS["cas-gun"]
	if role in ["MG","APC"]: return WEAPONS["mg"]
	if role == "AT": return WEAPONS["at"]
	if role == "TANK": return WEAPONS["cannon"]
	if role == "MORTAR": return WEAPONS["mortar"]
	return WEAPONS["rifle"]

static func weapon_can_target(weapon: Dictionary, target_role: String) -> bool:
	if weapon.is_empty(): return false
	if weapon["id"] == "aa" and not target_role in AIR: return false
	if target_role in ARMORED and not weapon["armor"] and weapon["id"] != "cas-gun": return false
	if target_role in AIR and not weapon["air"]: return false
	return true

static func weapon_damage(weapon: Dictionary, target_role: String, distance_native: float) -> float:
	if not weapon_can_target(weapon,target_role): return 0.0
	var distance_m := maxf(0.0,distance_native)*100.0
	var result: float = float(weapon["damage"])*maxf(0.35,1.0-distance_m/float(weapon["range"])*0.5)
	if weapon["id"] == "cas-gun" and target_role == "TANK": result *= 0.1
	return result

func make_unit(side: String, role: String, id: String) -> Dictionary:
	var vehicle := is_vehicle(role)
	var max_members: int = CATALOG[role][0]
	var soldier_offsets: Array = []
	if not vehicle:
		for index in max_members:
			var column := float(index % 3)-1.0
			var row := float(index / 3)
			soldier_offsets.append(Vector3(column*0.08,0.0,row*0.08))
	return {"id":id,"role":role,"side":side,"members":max_members,"max_members":max_members,"soldier_offsets":soldier_offsets,"hp":100.0,"fuel":0.0 if vehicle else 100.0,"ammo":0.0 if vehicle else 100.0,"service":"AWAITING SERVICE" if vehicle else "READY","transport":{},"maritime":{"phase":"moving","since":time,"sorties":4,"launch_at":0.0} if role == "AIRCRAFT_CARRIER" else {},"moving":false,"at_base":true,"position":Vector3.ZERO,"manual_until":0.0,"suppression":0.0,"surrendered":false,"crew_bailed":false,"external":false,"combat_ready_at":0.0,"lock":{},"loss_processed":false}

func setup(theater_objectives: Array) -> void:
	forces.clear(); depots.clear(); airfields.clear(); mobs.clear(); objectives.clear(); units.clear()
	shipments.clear(); radio.clear(); missiles.clear()
	time = 0.0; next_plan = 30.0; next_supply = 30.0; next_income = 5.0; next_ground_logistics = 1.0; serial = 0
	territory_hold = {"BLU":0.0,"RED":0.0}; winner = ""
	for side in ["BLU","RED"]:
		forces[side] = {"sp":2000,"manpower":120,"tempo":58,"queue":[],"casualties":0,"action":"ASSEMBLE","target":"J" if side == "BLU" else "A","purchase":"Awaiting first requisition","delivered":0,"hold":false}
		depots[side] = {"airfield":{"fuel":0.0,"ammo":0.0,"repair":0.0},"pending":{"fuel":0.0,"ammo":0.0,"repair":0.0},"mob":{"fuel":0.0,"ammo":0.0,"repair":0.0}}
		airfields[side] = {"tier":1,"upgrade":{}}
		mobs[side] = {"tier":1,"upgrade":{}}
		units[side] = [make_unit(side,"COMMAND",side+"-command")]
	for entry in theater_objectives:
		objectives[str(entry["id"])] = {"owner":"","position":entry["pos"],"stock":{"fuel":0.0,"ammo":0.0,"repair":0.0},"facilities":{},"contested":false,"progress":0.0,"capturing":""}
	log_event("SYS", "Commanders online. Depots empty. Scheduled airfield supplies inbound; all force assets must be purchased.", "system")

func log_event(side: String, text: String, type: String = "command") -> void:
	radio.append({"side":side,"text":text,"type":type,"time":time})
	if radio.size() > 80: radio.pop_front()

func tick(delta: float) -> void:
	time += delta
	while time >= next_income:
		next_income += 5.0
		for side in ["BLU","RED"]:
			forces[side]["sp"] += [10,20,40][int(airfields[side]["tier"])-1]
			forces[side]["manpower"] = minf(250.0,float(forces[side]["manpower"])+0.3)
	while time >= next_supply:
		next_supply += 180.0
		for side in ["BLU","RED"]:
			var multiplier: float = [1.0,2.0,4.0][int(airfields[side]["tier"])-1]
			var share := 0.72 if float(depots[side]["airfield"]["fuel"])+float(depots[side]["mob"]["fuel"]) < 700.0 else 0.55
			shipments.append({"side":side,"phase":"APPROACH","due":time+30.0,"stock":{"fuel":3300.0*multiplier*share,"ammo":3300.0*multiplier*(1.0-share)*2.0/3.0,"repair":3300.0*multiplier*(1.0-share)/3.0}})
			log_event(side,"Scheduled airfield cargo approaching.","logistics")
	while time >= next_ground_logistics:
		next_ground_logistics += 1.0
		_process_ground_logistics()
	_process_logistics(delta)
	_process_upgrades()
	_process_queues()
	_tick_units(delta)
	_process_missiles()
	update_objective_control(delta)
	_update_victory(delta)
	while time >= next_plan:
		next_plan += 30.0
		for side in ["BLU","RED"]: _plan_side(side)

func _process_ground_logistics() -> void:
	for side in ["BLU","RED"]:
		for unit in units[side]:
			if float(unit.get("hp",100.0)) <= 0.0 or is_vehicle(unit["role"]): continue
			var stock: Dictionary = {}
			if unit.get("at_base",false): stock = depots[side]["mob"]
			else:
				for objective in objectives.values():
					if objective["owner"] == side and not objective["contested"] and unit.get("position",Vector3.ZERO).distance_to(objective["position"]) < CAPTURE_RADIUS:
						stock = objective["stock"]; break
			if not stock.is_empty():
				var amount := minf(4.0,minf(100.0-float(unit["ammo"]),float(stock["ammo"])))
				unit["ammo"] += amount; stock["ammo"] -= amount
			if unit["role"] == "MEDIC":
				for friendly in units[side]:
					if is_vehicle(friendly["role"]) or float(friendly.get("hp",100.0)) <= 0.0: continue
					if unit.get("position",Vector3.ZERO).distance_to(friendly.get("position",Vector3.ZERO)) < 0.8:
						friendly["hp"] = minf(100.0,float(friendly["hp"])+1.0)

func _process_logistics(delta: float) -> void:
	for shipment in shipments:
		if time < float(shipment["due"]): continue
		var side: String = shipment["side"]
		if shipment["phase"] == "FORWARD":
			var objective: Dictionary = objectives.get(shipment.get("objective",""),{})
			if not objective.is_empty() and objective["owner"] == side:
				for key in ["fuel","ammo","repair"]:
					objective["stock"][key] = minf(float({"fuel":1800,"ammo":600,"repair":1200}[key]),float(objective["stock"][key])+float(shipment["stock"][key]))
				log_event(side,"Forward stock delivered to objective "+str(shipment["objective"]),"logistics")
			shipment["phase"] = "COMPLETE"
			continue
		if shipment["phase"] == "APPROACH":
			for key in ["fuel","ammo","repair"]: depots[side]["pending"][key] += shipment["stock"][key]
			shipment["phase"] = "UNLOADING"
			shipment["due"] = time+18.0
			log_event(side,"Cargo landed; forklifts transferring pending stock.","logistics")
		else:
			shipment["phase"] = "COMPLETE"
	shipments = shipments.filter(func(s: Dictionary) -> bool: return s["phase"] != "COMPLETE")
	for side in ["BLU","RED"]:
		var depot: Dictionary = depots[side]
		var rate: float = [1.0,2.0,4.0][int(airfields[side]["tier"])-1]*20.0*delta
		for key in ["fuel","ammo","repair"]:
			var moved := minf(float(depot["pending"][key]),rate)
			depot["pending"][key] -= moved
			depot["airfield"][key] += moved
			# Native stock transfer approximation. Physical truck/container choreography is pending.
			var reserve: float = 350.0 if key == "fuel" else 300.0 if key == "ammo" else 150.0
			moved = minf(maxf(0.0,float(depot["airfield"][key])-reserve),12.0*delta)
			depot["airfield"][key] -= moved
			depot["mob"][key] += moved

func _count(side: String, role: String) -> int:
	var result := 0
	for unit in units[side]:
		if unit["role"] == role and float(unit.get("hp",100)) > 0: result += 1
	for item in forces[side]["queue"]:
		if item["role"] == role: result += 1
	return result

func _plan_side(side: String) -> void:
	var force: Dictionary = forces[side]
	if not external_command_planner:
		var ids: Array = objectives.keys()
		if side == "BLU": ids.reverse()
		for id in ids:
			if objectives[id]["owner"] != side:
				force["target"] = id
				break
	var troops := _count(side,"RIFLE")
	var role := ""
	if troops < 3: role = "RIFLE"
	elif _count(side,"TROOP_TRUCK") < 2: role = "TROOP_TRUCK"
	elif airfields[side]["tier"] < 3: upgrade_airfield(side)
	elif mobs[side]["tier"] < 3: upgrade_mob(side)
	elif troops < 6: role = "RIFLE"
	elif _count(side,"MG") < 1: role = "MG"
	elif _count(side,"AA_TEAM") < 1: role = "AA_TEAM"
	else:
		for candidate in ["APC","TRANSPORT_HELI","TANK","CAS_FIGHTER","ATTACK_HELI","JET","IFV","HEAVY_LIFT_HELI"]:
			if _count(side,candidate) < 1: role = candidate; break
	if not role.is_empty(): procure(side,role)
	if not external_command_planner:
		force["action"] = "HOLD" if force["hold"] else "SEIZE" if troops >= 2 else "ASSEMBLE"
	var ready := 0
	var living := 0
	for unit in units[side]:
		if float(unit.get("hp",100)) <= 0: continue
		living += 1
		if unit["service"] == "READY": ready += 1
	force["tempo"] = clampi(int(100.0*ready/maxi(1,living)),20,100)
	if not external_command_planner:
		log_event(side,"%s objective %s. %s" % [force["action"],force["target"],force["purchase"]])

func procure(side: String, role: String) -> bool:
	if not CATALOG.has(role) or role == "COMMAND" or forces[side]["queue"].size() >= 4: return false
	var tier := int(mobs[side]["tier"])
	var discount := 0.75 if tier == 3 and role in DISCOUNTED else 1.0
	var cost := ceili(float(CATALOG[role][4])*discount)
	var members := int(CATALOG[role][0])
	if int(forces[side]["sp"]) < cost+200 or int(forces[side]["manpower"]) < members: return false
	forces[side]["sp"] -= cost
	forces[side]["manpower"] -= members
	serial += 1
	var delay: float = (ceil((time+1.0)/60.0)*60.0+35.0-time)*discount
	if not is_vehicle(role) and tier >= 2: delay /= 1.5
	forces[side]["queue"].append({"role":role,"due":time+delay,"id":side+"-"+str(serial)})
	forces[side]["purchase"] = "%s · %d SP · %ds" % [role.replace("_"," "),cost,ceili(delay)]
	return true

func upgrade_airfield(side: String) -> bool:
	var state: Dictionary = airfields[side]
	var cost := 600 if int(state["tier"]) == 1 else 1200
	if state["tier"] >= 3 or not state["upgrade"].is_empty() or forces[side]["sp"] < cost+200: return false
	forces[side]["sp"] -= cost
	state["upgrade"] = {"tier":int(state["tier"])+1,"due":time+(60.0 if state["tier"] == 1 else 90.0)}
	forces[side]["purchase"] = "AIRFIELD TIER %d upgrading" % state["upgrade"]["tier"]
	return true

func upgrade_mob(side: String) -> bool:
	var state: Dictionary = mobs[side]
	var cost := 4000 if int(state["tier"]) == 1 else 8000
	if state["tier"] >= 3 or not state["upgrade"].is_empty() or forces[side]["sp"] < cost+200: return false
	forces[side]["sp"] -= cost
	state["upgrade"] = {"tier":int(state["tier"])+1,"due":time+(90.0 if state["tier"] == 1 else 150.0)}
	forces[side]["purchase"] = "MOB LEVEL %d upgrading" % state["upgrade"]["tier"]
	return true

func build_facility(side: String, objective_id: String, kind: String) -> bool:
	if not objectives.has(objective_id) or not kind in ["helipad","vehicleBay"]: return false
	var objective: Dictionary = objectives[objective_id]
	var cost := 500 if kind == "helipad" else 650
	if objective["owner"] != side or objective["facilities"].has(kind) or forces[side]["sp"] < cost+200: return false
	forces[side]["sp"] -= cost
	objective["facilities"][kind] = {"hp":1,"construction":{"due":time+(45.0 if kind == "helipad" else 60.0),"side":side}}
	return true

func dispatch_forward_stock(side: String, objective_id: String, origin: Vector3) -> bool:
	if not objectives.has(objective_id) or objectives[objective_id]["owner"] != side: return false
	for shipment in shipments:
		if shipment.get("objective","") == objective_id: return false
	var stock: Dictionary = depots[side]["mob"]
	var objective: Dictionary = objectives[objective_id]
	var cargo: Dictionary = {}
	var total := 0.0
	for key in ["fuel","ammo","repair"]:
		var capacity: float = {"fuel":1800.0,"ammo":600.0,"repair":1200.0}[key]
		var amount := minf(400.0,minf(float(stock[key]),maxf(0.0,capacity-float(objective["stock"][key]))))
		cargo[key] = amount; stock[key] -= amount; total += amount
	if total <= 0.0: return false
	var destination: Vector3 = objective["position"]
	shipments.append({"side":side,"phase":"FORWARD","objective":objective_id,"due":time+origin.distance_to(destination)*100.0/12.0+18.0,"stock":cargo})
	log_event(side,"Forward stock dispatched to objective "+objective_id,"logistics")
	return true

func _service_stock(side: String, unit: Dictionary) -> Dictionary:
	unit["forward_service"] = false
	if unit.get("at_base",false): return depots[side]["airfield" if unit["role"] in AIR else "mob"]
	var position: Vector3 = unit.get("position",Vector3.ZERO)
	var kind := "helipad" if unit["role"] in AIR else "vehicleBay"
	for objective in objectives.values():
		if objective["owner"] != side or position.distance_to(objective["position"]) > 0.45: continue
		var facility: Dictionary = objective["facilities"].get(kind,{})
		if facility.is_empty() or facility.has("construction") or float(facility.get("hp",0)) <= 0: continue
		unit["forward_service"] = true
		return objective["stock"]
	return {}

func embark(side: String, passenger_id: String, transport_id: String) -> bool:
	var passenger := _unit(side,passenger_id)
	var transport := _unit(side,transport_id)
	if passenger.is_empty() or transport.is_empty() or is_vehicle(passenger["role"]) or passenger["role"] == "COMMAND" or not TRANSPORT_CAPACITY.has(transport["role"]): return false
	if not passenger["transport"].is_empty() or passenger.get("position",Vector3.ZERO).distance_to(transport.get("position",Vector3.ZERO)) > 0.18 or transport.get("moving",false): return false
	var passengers: Array = transport["transport"].get("passengers",[])
	var seats := int(passenger["members"])
	for id in passengers: seats += int(_unit(side,id).get("members",0))
	if seats > int(TRANSPORT_CAPACITY[transport["role"]]): return false
	passengers.append(passenger_id)
	transport["transport"] = {"phase":"loading","since":time,"passengers":passengers}
	passenger["transport"] = {"phase":"mounting","carrier":transport_id,"since":time}
	return true

func dismount(side: String, passenger_id: String) -> bool:
	var passenger := _unit(side,passenger_id)
	if passenger.is_empty() or not passenger.get("transport",{}).has("carrier"): return false
	var carrier := _unit(side,str(passenger["transport"]["carrier"]))
	if carrier.is_empty() or carrier.get("moving",false): return false
	passenger["transport"]["phase"] = "dismounting"
	passenger["transport"]["since"] = time
	return true

func request_dismount(side: String, selected_id: String, include_crew: bool = false) -> bool:
	var selected := _unit(side,selected_id)
	if selected.is_empty(): return false
	var carrier := selected if TRANSPORT_CAPACITY.has(selected["role"]) else _unit(side,str(selected.get("transport",{}).get("carrier","")))
	if carrier.is_empty() or float(carrier.get("hp",0.0)) <= 0.0 or carrier.get("crew_bailed",false) or not TRANSPORT_CAPACITY.has(carrier["role"]) or carrier.get("moving",false): return false
	var changed := false
	var passenger_ids: Array = carrier.get("transport",{}).get("passengers",[]).duplicate()
	for passenger_id in passenger_ids:
		var passenger := _unit(side,str(passenger_id))
		if passenger.is_empty() or passenger.get("transport",{}).get("carrier","") != carrier["id"]: continue
		passenger["transport"]["phase"] = "dismounting"
		passenger["transport"]["since"] = time
		changed = true
	if include_crew:
		if changed: carrier["transport"]["dismount_crew"] = true
		else: changed = _bail_crew(side,carrier)
	return changed

func _bail_crew(side: String, carrier: Dictionary) -> bool:
	if carrier.get("crew_bailed",false) or int(carrier.get("members",0)) <= 0 or carrier["role"] in AIR: return false
	serial += 1
	var crew := make_unit(side,"PILOT",str(carrier["id"])+"-crew-"+str(serial))
	crew["members"] = int(carrier["members"]); crew["max_members"] = int(carrier["members"])
	crew["position"] = carrier.get("position",Vector3.ZERO)+Vector3(-0.06,0.0,0.06)
	crew["at_base"] = false; crew["service"] = "READY"; crew["mission"] = "DISMOUNTED CREW"
	units[side].append(crew)
	carrier["crew_bailed"] = true; carrier["members"] = 0; carrier["moving"] = false; carrier["service"] = "CREW DISMOUNTED"
	if not carrier.get("transport",{}).is_empty(): carrier["transport"]["phase"] = "abandoned"; carrier["transport"]["passengers"] = []
	return true

func deploy_jammer(side: String, builder_id: String) -> String:
	var builder := _unit(side,builder_id)
	if builder.is_empty() or float(builder.get("hp",0.0)) <= 0.0 or builder.get("transport",{}).has("carrier") or not builder["role"] in ["LOGISTICS","RIFLE","SCOUT","MG","AT","ENGINEER"]:
		return "An active logistics team or squad leader is required."
	for candidate in units[side]:
		if candidate.get("construction",{}).get("builder","") == builder_id and float(candidate.get("hp",0.0)) > 0.0: return "This team is already building."
	var active: Array = units[side].filter(func(unit: Dictionary) -> bool: return unit["role"] == "UAV_JAMMER" and float(unit.get("hp",0.0)) > 0.0)
	if active.size() >= 3: return "Three-jammer limit reached."
	for jammer in active:
		if jammer.get("position",Vector3.ZERO).distance_to(builder.get("position",Vector3.ZERO)) < 1.5: return "A jammer is already deployed nearby."
	if int(forces[side]["sp"]) < 200: return "Insufficient supply points."
	serial += 1
	var jammer := make_unit(side,"UAV_JAMMER",side+"-jammer-"+str(serial))
	jammer.merge({"position":builder.get("position",Vector3.ZERO)+Vector3(0.08,0.0,0.08),"at_base":false,"fuel":100.0,"service":"BUILDING","construction":{"builder":builder_id,"due":time+15.0}},true)
	units[side].append(jammer); forces[side]["sp"] -= 200
	log_event(side,"UAV jammer construction started. Coverage online in 15 seconds.","logistics")
	return ""

func jammer_blocks(observer: Dictionary, target: Dictionary) -> bool:
	if observer.get("role","") != "RECON_UAV": return false
	for side in ["BLU","RED"]:
		if side == observer.get("side",""): continue
		for jammer in units[side]:
			if jammer["role"] != "UAV_JAMMER" or float(jammer.get("hp",0.0)) <= 0.0 or jammer.has("construction"): continue
			if jammer.get("position",Vector3.ZERO).distance_to(observer.get("position",Vector3.ZERO)) <= 6.0 or jammer.get("position",Vector3.ZERO).distance_to(target.get("position",Vector3.ZERO)) <= 6.0: return true
	return false

func set_maritime_order(side: String, id: String, destination: Vector2) -> bool:
	var unit := _unit(side,id)
	if unit.is_empty() or not NAVAL.has(unit["role"]): return false
	unit["maritime"]["destination"] = destination
	if unit["role"] == "AIRCRAFT_CARRIER" and unit["maritime"].get("phase","moving") != "moving":
		return set_carrier_state(side,id,"undeploying")
	unit["maritime"]["phase"] = "moving"
	return true

func set_carrier_state(side: String, id: String, requested: String) -> bool:
	var unit := _unit(side,id)
	if unit.is_empty() or unit["role"] != "AIRCRAFT_CARRIER": return false
	var maritime: Dictionary = unit["maritime"]
	var phase: String = maritime.get("phase","moving")
	if requested == "deploying" and phase == "moving":
		maritime["phase"] = "stopping"
		maritime["due"] = time+CARRIER_STOP_SECONDS
	elif requested in ["moving","undeploying"] and phase in ["stopping","deploying","deployed"]:
		maritime["phase"] = "undeploying"
		maritime["due"] = time+CARRIER_UNDEPLOY_SECONDS
	else: return false
	maritime["since"] = time
	return true

func carrier_can_launch(side: String, id: String) -> bool:
	var unit := _unit(side,id)
	return not unit.is_empty() and unit["role"] == "AIRCRAFT_CARRIER" and float(unit.get("hp",100)) > 0 and unit["maritime"].get("phase","") == "deployed" and not unit.get("moving",false) and unit["fuel"] >= 10 and unit["ammo"] >= 10 and int(unit["maritime"].get("sorties",0)) > 0 and time >= float(unit["maritime"].get("launch_at",0.0))

func launch_sortie(side: String, id: String) -> Dictionary:
	if not carrier_can_launch(side,id): return {}
	var carrier := _unit(side,id)
	carrier["fuel"] -= 10.0
	carrier["ammo"] -= 10.0
	carrier["maritime"]["sorties"] -= 1
	carrier["maritime"]["launch_at"] = time+15.0
	serial += 1
	var aircraft := make_unit(side,"CAS_FIGHTER",side+"-deck-"+str(serial))
	aircraft.merge({"fuel":100.0,"ammo":100.0,"service":"READY","position":carrier["position"],"spawn_position":carrier["position"],"at_base":false,"deck_source":id},true)
	units[side].append(aircraft)
	log_event(side,"Carrier deck launched %s; %d aircraft remain." % [aircraft["id"],carrier["maritime"]["sorties"]],"command")
	return aircraft

func resolve_attack(side: String, attacker_id: String, target_id: String, distance_native: float = -1.0, weapon_id: String = "") -> Dictionary:
	var attacker := _unit(side,attacker_id)
	var enemy_side := "RED" if side == "BLU" else "BLU"
	var target := _unit(enemy_side,target_id)
	if attacker.is_empty() or target.is_empty() or float(attacker.get("hp",0.0)) <= 0.0 or float(target.get("hp",0.0)) <= 0.0: return {"fired":false,"reason":"invalid combatant"}
	if attacker.get("surrendered",false) or attacker.get("crew_bailed",false) or attacker.get("external",false) or attacker.get("service","") != "READY": return {"fired":false,"reason":"attacker unavailable"}
	var weapon: Dictionary = WEAPONS.get(weapon_id,weapon_for(str(attacker["role"])))
	if weapon.is_empty() or not weapon_can_target(weapon,str(target["role"])): return {"fired":false,"reason":"ineligible target"}
	if distance_native < 0.0: distance_native = attacker.get("position",Vector3.ZERO).distance_to(target.get("position",Vector3.ZERO))
	if distance_native*100.0 > float(weapon["range"]): return {"fired":false,"reason":"out of range"}
	if time < float(attacker.get("combat_ready_at",0.0)): return {"fired":false,"reason":"cooldown"}
	var ammo_cost: float = float(weapon["ammo"])
	if float(attacker.get("ammo",0.0)) < ammo_cost: return {"fired":false,"reason":"ammunition"}
	if weapon["id"] == "aa":
		if float(attacker.get("suppression",0.0)) > 0.5:
			attacker["lock"] = {}; return {"fired":false,"reason":"suppressed"}
		var lock: Dictionary = attacker.get("lock",{})
		if lock.get("target","") != target_id:
			attacker["lock"] = {"target":target_id,"since":time}
			return {"fired":false,"reason":"locking"}
		if time-float(lock.get("since",time)) < 2.5: return {"fired":false,"reason":"locking"}
		var flight := maxf(0.01,distance_native*100.0/320.0)
		missiles.append({"side":side,"source":attacker_id,"target":target_id,"due":time+flight,"damage":float(weapon["damage"])})
		attacker["lock"] = {}
	else:
		_apply_combat_hit(enemy_side,target,weapon_damage(weapon,str(target["role"]),distance_native))
	attacker["ammo"] = maxf(0.0,float(attacker["ammo"])-ammo_cost)
	attacker["combat_ready_at"] = time+float(weapon["cooldown"])
	return {"fired":true,"weapon":weapon["id"],"damage":0.0 if weapon["id"] == "aa" else weapon_damage(weapon,str(target["role"]),distance_native)}

func _apply_combat_hit(side: String, target: Dictionary, amount: float) -> void:
	if amount <= 0.0 or target.is_empty(): return
	var before := int(target.get("members",0))
	target["hp"] = maxf(0.0,float(target.get("hp",100.0))-amount)
	target["suppression"] = minf(1.0,float(target.get("suppression",0.0))+0.22)
	var expected := 0 if float(target["hp"]) <= 0.0 or target.get("crew_bailed",false) else ceili(float(target.get("max_members",before))*float(target["hp"])/100.0)
	target["members"] = mini(before,expected)
	forces[side]["casualties"] += maxi(0,before-int(target["members"]))

func _process_missiles() -> void:
	var pending: Array = []
	for missile in missiles:
		if time < float(missile["due"]): pending.append(missile); continue
		var enemy_side := "RED" if missile["side"] == "BLU" else "BLU"
		var target := _unit(enemy_side,str(missile["target"]))
		if not target.is_empty() and float(target.get("hp",0.0)) > 0.0: _apply_combat_hit(enemy_side,target,float(missile["damage"]))
	missiles = pending

func update_objective_control(delta: float) -> void:
	if delta <= 0.0: return
	for id in objectives:
		var objective: Dictionary = objectives[id]
		var bodies := {"BLU":0,"RED":0}
		for side in ["BLU","RED"]:
			for unit in units[side]:
				if float(unit.get("hp",0.0)) <= 0.0 or unit.get("surrendered",false) or unit.get("external",false) or is_vehicle(str(unit["role"])) or unit["role"] in ["COMMAND","PILOT"]: continue
				if unit.get("transport",{}).has("carrier"): continue
				var offsets: Array = unit.get("soldier_offsets",[])
				for member_index in int(unit.get("members",0)):
					var offset: Vector3 = offsets[member_index] if member_index < offsets.size() else Vector3.ZERO
					if (unit.get("position",Vector3.ZERO)+offset).distance_to(objective["position"]) <= CAPTURE_RADIUS:
						bodies[side] += 1
		objective["contested"] = bodies["BLU"] > 0 and bodies["RED"] > 0
		var capturing := ""
		if not objective["contested"] and bodies["BLU"] >= CAPTURE_MIN_BODIES: capturing = "BLU"
		elif not objective["contested"] and bodies["RED"] >= CAPTURE_MIN_BODIES: capturing = "RED"
		if capturing.is_empty() or capturing == objective["owner"]:
			objective["progress"] = 0.0; objective["capturing"] = ""; continue
		if objective["capturing"] != capturing: objective["progress"] = 0.0
		objective["capturing"] = capturing
		objective["progress"] = float(objective["progress"])+delta/CAPTURE_SECONDS
		if float(objective["progress"]) >= 1.0:
			objective["owner"] = capturing; objective["progress"] = 0.0; objective["capturing"] = ""
			log_event(capturing,"Objective %s secured." % id,"command")

func _update_victory(delta: float) -> void:
	if not winner.is_empty(): return
	var defeated: Array[String] = []
	for side in ["BLU","RED"]:
		var command_lost := false
		var successor := false
		for unit in units[side]:
			if unit["role"] == "COMMAND" and float(unit.get("hp",100.0)) <= 0.0: command_lost = true
			if float(unit.get("hp",0.0)) > 0.0 and not unit.get("surrendered",false) and not unit.get("crew_bailed",false) and not unit["role"] in MISSION_ASSETS and not unit["role"] in ["COMMAND","PILOT","LOGISTICS"]: successor = true
		if command_lost and not successor: defeated.append(side)
	if defeated.size() == 2: winner = "DRAW"
	elif defeated.size() == 1: winner = "RED" if defeated[0] == "BLU" else "BLU"
	if not winner.is_empty():
		log_event("SYS","Mutual command loss." if winner == "DRAW" else winner+" wins after opposing command collapse.","system")
		return
	for side in ["BLU","RED"]:
		var secured := not objectives.is_empty()
		for objective in objectives.values():
			if objective["owner"] != side or objective["contested"]: secured = false; break
		territory_hold[side] = float(territory_hold[side])+delta if secured else 0.0
		if float(territory_hold[side]) >= TERRITORIAL_HOLD_SECONDS:
			winner = side; log_event(side,"All %d objectives secured for 60 seconds. Territorial victory." % objectives.size(),"system"); return

func _process_upgrades() -> void:
	for side in ["BLU","RED"]:
		for state in [airfields[side],mobs[side]]:
			if not state["upgrade"].is_empty() and time >= float(state["upgrade"]["due"]): state["tier"] = state["upgrade"]["tier"]; state["upgrade"] = {}
	for objective in objectives.values():
		for facility in objective["facilities"].values():
			if facility.has("construction") and time >= float(facility["construction"]["due"]): facility["hp"] = 100; facility.erase("construction")

func _process_queues() -> void:
	for side in ["BLU","RED"]:
		var kept: Array = []
		for item in forces[side]["queue"]:
			if time < float(item["due"]): kept.append(item); continue
			units[side].append(make_unit(side,item["role"],item["id"]))
			forces[side]["delivered"] += 1
			forces[side]["purchase"] = str(item["role"]).replace("_"," ") + " delivered"
			log_event(side,forces[side]["purchase"],"logistics")
		forces[side]["queue"] = kept

func _tick_units(delta: float) -> void:
	for side in ["BLU","RED"]:
		for unit in units[side]:
			if float(unit.get("hp",100)) <= 0: continue
			var passenger_transport: Dictionary = unit.get("transport",{})
			if passenger_transport.has("carrier"):
				var lost_carrier := _unit(side,str(passenger_transport["carrier"]))
				if lost_carrier.is_empty() or float(lost_carrier.get("hp",0.0)) <= 0.0 or lost_carrier.get("crew_bailed",false):
					if not lost_carrier.is_empty() and float(lost_carrier.get("hp",0.0)) <= 0.0:
						_process_passenger_loss(side,unit,lost_carrier)
					elif not lost_carrier.is_empty(): unit["position"] = lost_carrier.get("position",unit.get("position",Vector3.ZERO))
					unit["transport"] = {}
					if int(unit.get("members",0)) > 0:
						unit["service"] = "READY"
						log_event(side,str(unit["id"])+" survivors dismounted after carrier loss.","combat")
			var role: String = unit["role"]
			if role == "UAV_JAMMER" and unit.has("construction"):
				var builder := _unit(side,str(unit["construction"].get("builder","")))
				if builder.is_empty() or float(builder.get("hp",0.0)) <= 0.0 or builder.get("position",Vector3.ZERO).distance_to(unit.get("position",Vector3.ZERO)) > 0.5:
					unit["hp"] = 0.0; unit["service"] = "BUILD INTERRUPTED"; continue
				if time >= float(unit["construction"]["due"]):
					unit.erase("construction"); unit["service"] = "READY"
			if role == "UAV_JAMMER": continue
			if is_vehicle(role):
				if unit.get("moving",false):
					unit["fuel"] = maxf(0.0,float(unit["fuel"])-float(CATALOG[role][1])/float(OPERATIONAL_RANGE.get(role,100000))*100.0*delta)
				else:
					var stock: Dictionary = _service_stock(side,unit)
					var specs := resources(role)
					for key in ["fuel","ammo","repair"]:
						if stock.is_empty() or (key == "ammo" and unit.get("forward_service",false)): continue
						var gauge: String = "hp" if key == "repair" else key
						if specs[key] == 0: unit[key] = 100.0; continue
						var amount := minf(100.0-float(unit[gauge]),minf((5.0 if key == "repair" else 5.0/3.0)*delta,float(stock[key])/float(specs[key])*100.0))
						stock[key] -= amount/100.0*float(specs[key])
						unit[gauge] += amount
				unit["service"] = "READY" if float(unit["fuel"]) >= 25.0 and float(unit["ammo"]) >= 25.0 else "AWAITING FUEL / AMMO"
			var transport: Dictionary = unit["transport"]
			if transport.has("carrier") and time-float(transport["since"]) >= BOARD_SECONDS:
				if transport["phase"] == "mounting": transport["phase"] = "seated"
				elif transport["phase"] == "dismounting":
					var carrier := _unit(side,str(transport["carrier"]))
					if not carrier.is_empty():
						carrier["transport"].get("passengers",[]).erase(unit["id"])
						if carrier["transport"].get("passengers",[]).is_empty() and carrier["transport"].get("dismount_crew",false): _bail_crew(side,carrier)
					unit["transport"] = {}
			if role == "AIRCRAFT_CARRIER":
				var maritime: Dictionary = unit["maritime"]
				if time >= float(maritime.get("due",INF)):
					if maritime["phase"] == "stopping": maritime["phase"] = "deploying"; maritime["due"] = time+CARRIER_DEPLOY_SECONDS
					elif maritime["phase"] == "deploying": maritime["phase"] = "deployed"; maritime.erase("due")
					elif maritime["phase"] == "undeploying": maritime["phase"] = "moving"; maritime.erase("due")

func _process_passenger_loss(side: String, passenger: Dictionary, carrier: Dictionary) -> void:
	if passenger.get("loss_processed",false): return
	passenger["loss_processed"] = true
	passenger["position"] = carrier.get("position",passenger.get("position",Vector3.ZERO))
	var before := int(passenger.get("members",0))
	var survivors := before
	if str(carrier.get("role","")) in AIR or str(carrier.get("role","")) in NAVAL:
		survivors = 0
	else:
		survivors = 0
		var rng := RandomNumberGenerator.new()
		rng.seed = hash("%s|%s|%s|%d" % [side,passenger.get("id",""),carrier.get("id",""),int(time*20.0)])
		for _member in before:
			if rng.randf() >= 0.65: survivors += 1
	passenger["members"] = survivors
	passenger["hp"] = 0.0 if before <= 0 else float(survivors)/float(passenger.get("max_members",before))*100.0
	forces[side]["casualties"] += before-survivors
	var carrier_passengers: Array = carrier.get("transport",{}).get("passengers",[])
	carrier_passengers.erase(passenger.get("id",""))

func _unit(side: String, id: String) -> Dictionary:
	for unit in units.get(side,[]):
		if unit["id"] == id: return unit
	return {}

func staff_reports(side: String) -> Array:
	var living := 0
	var troops := 0
	var aircraft := 0
	var seats := 0
	var firepower := 0
	var fuel := 100.0
	for unit in units[side]:
		if float(unit.get("hp",100)) <= 0: continue
		living += 1
		if not is_vehicle(unit["role"]) and unit["role"] != "COMMAND": troops += int(unit["members"])
		if unit["role"] in AIR: aircraft += 1
		seats += int(TRANSPORT_CAPACITY.get(unit["role"],0))
		firepower += int(CATALOG[unit["role"]][3])
		if is_vehicle(unit["role"]): fuel = minf(fuel,float(unit["fuel"]))
	return [
		{"name":"Troop Command","status":"READY" if troops >= 6 else "ASSEMBLING","detail":"%d active infantry · 6 required to capture" % troops},
		{"name":"Fuel Command","status":"APPROVED" if fuel >= 25 else "SERVICE REQUIRED","detail":"Lowest vehicle fuel %d%% · recovery reserve 15%%" % int(fuel)},
		{"name":"Motorcade","status":"LIFT AVAILABLE" if seats >= 4 else "WAITING FOR TRANSPORT","detail":"%d troop seats · long marches require lift" % seats},
		{"name":"Air Command","status":"ONLINE" if aircraft > 0 else "NO AIRCRAFT","detail":"%d air elements · airfield tier %d" % [aircraft,airfields[side]["tier"]]},
		{"name":"Logistics","status":"ASSEMBLY QUEUED" if not forces[side]["queue"].is_empty() else "MONITORING","detail":"%d/4 requisitions · next cargo %ds" % [forces[side]["queue"].size(),ceili(next_supply-time)]},
		{"name":"Fires","status":"AVAILABLE" if firepower > 1 else "ASSEMBLING","detail":"%d catalog firepower · %d living elements" % [firepower,living]}
	]

func force_report(side: String) -> String:
	var f: Dictionary = forces[side]
	return "%s · %d SP · %d reserve personnel\nMOB T%d · AIRFIELD T%d · queue %d/4" % [side,f["sp"],f["manpower"],mobs[side]["tier"],airfields[side]["tier"],f["queue"].size()]

func staff_report(side: String) -> String:
	return "%s: %s objective %s" % [side,forces[side]["action"],forces[side]["target"]]

func snapshot() -> Dictionary:
	return {"time":time,"next_plan":next_plan,"next_supply":next_supply,"next_income":next_income,"next_ground_logistics":next_ground_logistics,"serial":serial,"forces":forces,"depots":depots,"airfields":airfields,"mobs":mobs,"objectives":objectives,"units":units,"shipments":shipments,"radio":radio,"missiles":missiles,"territory_hold":territory_hold,"winner":winner}.duplicate(true)

func restore(data: Dictionary) -> void:
	for key in ["time","next_plan","next_supply","next_income","next_ground_logistics","serial","forces","depots","airfields","mobs","objectives","units","shipments","radio","missiles","territory_hold","winner"]:
		if data.has(key): set(key,data[key].duplicate(true) if data[key] is Dictionary or data[key] is Array else data[key])
