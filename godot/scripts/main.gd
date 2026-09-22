extends Node3D

const MapScript = preload("res://scripts/tactical_map.gd")
const CameraScript = preload("res://scripts/rts_camera.gd")
const UnitScript = preload("res://scripts/combat_unit.gd")
const HudScript = preload("res://scripts/tactical_hud.gd")
const CoreScript = preload("res://scripts/simulation_core.gd")
const CommanderDirectorScript = preload("res://scripts/commander_director.gd")
const GeographyScript = preload("res://scripts/geographic_streamer.gd")

var map: TacticalMap
var operation_root: Node3D
var operation_view_active := true
var theater_origin: Array = []
var theater_camera_state: Dictionary = {}
var camera: RTSCamera
var hud: Control
var native_workspaces: Control
var sun: DirectionalLight3D
var units: Array[CombatUnit] = []
var selected_units: Array[CombatUnit] = []
var paused := false
var speed := 1.0
var elapsed := 0.0
var capture := 0.0
var hold_time := 0.0
var ai_time := 4.0
var mission_state := "ACTIVE"
var command_mode := "ADVANCE"
var message := "Select either force to inspect. Commanders issue missions automatically."
var message_time := 8.0
var drag_start := Vector2.ZERO
var drag_end := Vector2.ZERO
var selection_drag := false
var mouse_down := false
var effects: Array[Dictionary] = []
var marker: MeshInstance3D
var marker_time := 0.0
var shadow_enabled := true
var fresnel_enabled := true
var core
var commander_director
var visual_core_units: Dictionary = {}
var supply_points := 2000
var manpower := 120
var fuel_stock := 0
var ammo_stock := 0
var readiness := 100
var next_supply := 30.0
var sim_accumulator := 0.0
var objective_progress: Dictionary = {}
var objective_owner: Dictionary = {}
var objective_capture_side: Dictionary = {}
var victory_hold := 0.0
var radio_system := "Command net online. Supplies inbound at 00:30."
var radio_blue := "MOB is ready. Request elements to assemble the force."
var requisition_serial := 0
var building_streamer: Node3D
var geography: Node3D
var geography_active := false
var geography_attribution := ""
var active_side := "BLU"
var show_routes := false
var show_grid := false
var winner_side := ""
var graphics_settings := {"performanceMode":false,"quality":"balanced","terrain":false,"buildings":false,"models":true,"shadows":true,"labels":true,"routes":false,"grid":false}

func _ready() -> void:
	_create_environment()
	operation_root = Node3D.new()
	operation_root.name = "CurrentOperation"
	add_child(operation_root)
	map = MapScript.new()
	map.name = "CurrentTheater"
	map.geographic_active = true
	operation_root.add_child(map)
	core = CoreScript.new()
	core.setup(map.get_objectives())
	core.external_command_planner = true
	commander_director = CommanderDirectorScript.new()
	commander_director.setup(3701)
	camera = CameraScript.new()
	camera.name = "CommandCamera"
	add_child(camera)
	_setup_geography()
	_create_units()
	for objective in map.get_objectives():
		objective_progress[str(objective["id"])] = 0.0
		objective_owner[str(objective["id"])] = ""
		objective_capture_side[str(objective["id"])] = ""
	var layer := CanvasLayer.new()
	layer.name = "CommandInterface"
	add_child(layer)
	hud = HudScript.new()
	hud.world = self
	layer.add_child(hud)
	_create_order_marker()
	select_unit(units[0], false)
	var snapshot := UpdateService.take_session_snapshot()
	if not snapshot.is_empty():
		restore_session_state(snapshot)
	if "--smoke-test" in OS.get_cmdline_user_args() and not UpdateService.smoke_finished:
		_run_smoke_test.call_deferred()

func _setup_geography() -> void:
	geography = GeographyScript.new()
	geography.name = "GlobalGeography"
	add_child(geography)
	var options := {
		"theater_path":"res://data/theater.json",
		"frame_budget_usec":2000,
		"max_cached_tiles":112,
		"max_cache_bytes":192*1024*1024,
		"include_buildings":true,
		"network_enabled":bool(ProjectSettings.get_setting("geography/network_enabled",true)) and not "--smoke-test" in OS.get_cmdline_user_args(),
		"disk_cache_path":str(ProjectSettings.get_setting("geography/disk_cache_path","user://geography-v1"))
	}
	var ca_path := str(ProjectSettings.get_setting("geography/tls_ca_bundle",""))
	if not ca_path.is_empty() and FileAccess.file_exists(ca_path): options["tls_ca_bundle"] = ca_path
	var error: Error = geography.call("setup",options)
	geography_active = error == OK
	if geography_active:
		theater_origin = geography.get("origin").duplicate()
		geography.call("set_exclusion_rects",map.installation_rectangles())
		geography.call("update_camera",camera)
		geography_attribution = str(geography.call("get_attribution"))
		camera.set_geographic_bounds(geography.call("project_point",-180.0,85.05112878),geography.call("project_point",180.0,-85.05112878))
	else:
		geography.queue_free(); geography = null
		map.enable_schematic_fallback()
		notify("The geographic map could not initialize. Showing the theater schematic.")

func _set_geographic_origin(new_origin: Array) -> bool:
	if not geography_active: return false
	if geography.get("origin") != new_origin:
		if not geography.has_method("set_origin") or geography.call("set_origin",new_origin) != OK: return false
	camera.set_geographic_bounds(geography.call("project_point",-180.0,85.05112878),geography.call("project_point",180.0,-85.05112878))
	return true

func _camera_state() -> Dictionary:
	return {"focus":camera.focus,"distance":camera.distance,"target_distance":camera.target_distance,"yaw":camera.yaw,"pitch":camera.pitch}

func _set_operation_view(active: bool) -> void:
	operation_view_active = active
	operation_root.visible = active
	selection_drag = false; mouse_down = false
	if not active and is_instance_valid(marker):
		marker.hide(); marker_time = 0.0
	if geography_active:
		var exclusions: Array[Rect2] = []
		if active: exclusions.assign(map.installation_rectangles())
		if geography.get("exclusions") != exclusions:
			geography.call("set_exclusion_rects",exclusions)
	if is_instance_valid(hud): hud.queue_redraw()

func focus_geographic_location(longitude: float, latitude: float) -> bool:
	if not geography_active or not is_finite(longitude) or not is_finite(latitude) or absf(longitude) > 180.0 or absf(latitude) > 85.05112878: return false
	var theater_point: Vector3 = GeographyScript.project(longitude,latitude,theater_origin)
	if absf(theater_point.x) <= TacticalMap.HALF_SIZE and absf(theater_point.z) <= TacticalMap.HALF_SIZE:
		if not return_to_theater(false): return false
		camera.focus_at(theater_point)
	else:
		var previous_camera := _camera_state()
		if not _set_geographic_origin([longitude,latitude]): return false
		if operation_view_active: theater_camera_state = previous_camera
		_set_operation_view(false)
		camera.focus_at(Vector3.ZERO)
	camera.target_distance = 60.0
	camera._update_pose(0.0)
	geography.call("update_camera",camera)
	notify("Map location %.4f°, %.4f°. Current theater remains San Diego." % [latitude,longitude])
	return true

func return_to_theater(restore_camera: bool = true) -> bool:
	if not geography_active: return true
	if not _set_geographic_origin(theater_origin): return false
	var returning := not operation_view_active
	_set_operation_view(true)
	if returning:
		if restore_camera and not theater_camera_state.is_empty():
			for key in theater_camera_state: camera.set(key,theater_camera_state[key])
		else:
			camera.focus_at(Vector3(-5,0,0)); camera.target_distance = 900.0
		camera._update_pose(0.0)
		geography.call("update_camera",camera)
		notify("Returned to the current operation. Its simulation state was preserved.")
	return true

func focus_theater_point(point: Vector3) -> void:
	if return_to_theater(false):
		camera.focus_at(point)

func _create_environment() -> void:
	var environment := Environment.new()
	environment.background_mode = Environment.BG_COLOR
	environment.background_color = Color("020611")
	environment.ambient_light_source = Environment.AMBIENT_SOURCE_COLOR
	environment.ambient_light_color = Color("bbc3cd")
	environment.ambient_light_energy = 0.7
	environment.tonemap_mode = Environment.TONE_MAPPER_LINEAR
	environment.fog_enabled = false
	var world_environment := WorldEnvironment.new()
	world_environment.environment = environment
	add_child(world_environment)
	sun = DirectionalLight3D.new()
	sun.name = "LateMorningSun"
	sun.rotation_degrees = Vector3(-56.0, -32.0, 0.0)
	sun.light_color = Color("f0f2f5")
	sun.light_energy = 0.95
	sun.shadow_enabled = true
	sun.directional_shadow_max_distance = 80.0
	sun.directional_shadow_mode = DirectionalLight3D.SHADOW_PARALLEL_4_SPLITS
	sun.shadow_bias = 0.01
	add_child(sun)

func _create_units() -> void:
	_sync_core_visuals()

func _spawn(kind: String, team: int, call_sign: String, pos: Vector3, role: String = "RIFLE", record: Dictionary = {}) -> CombatUnit:
	var unit := UnitScript.new()
	unit.name = call_sign.replace(" ", "_")
	unit.kind = kind
	unit.role = role
	unit.core_record = record
	unit.simulation_core = core
	unit.team = team
	unit.call_sign = call_sign
	unit.position = pos
	unit.map = map
	unit.fired.connect(_on_unit_fired)
	unit.destroyed.connect(_on_unit_destroyed)
	operation_root.add_child(unit)
	units.append(unit)
	unit.set_fresnel(fresnel_enabled)
	if team == 1: unit.rotation.y = PI
	return unit

func _process(delta: float) -> void:
	_apply_model_visibility()
	message_time = maxf(0.0, message_time - delta)
	_tick_effects(delta)
	if paused or mission_state != "ACTIVE":
		return
	var sim_delta := minf(delta, 0.1) * speed
	sim_accumulator += sim_delta
	while sim_accumulator >= 0.05:
		sim_accumulator -= 0.05
		_tick_simulation(0.05)

func _tick_simulation(step: float) -> void:
	elapsed += step
	core.tick(step)
	commander_director.tick(core)
	_sync_core_summary()
	_sync_core_visuals()
	for unit in units:
		var record: Dictionary = unit.core_record
		var side := "BLU" if unit.team == 0 else "RED"
		var service_site: Vector3 = map.airbases[side] if unit.airborne else map.bases[side]
		if unit.role in SimulationCore.NAVAL: service_site = map.naval_base(side)
		record["at_base"] = unit.position.distance_to(service_site) < 1.1
		var carrier_id: String = record.get("transport",{}).get("carrier","")
		if not carrier_id.is_empty() and visual_core_units.has(carrier_id):
			unit.position = visual_core_units[carrier_id].position
			unit.route.clear()
		unit.health = float(record.get("hp",unit.health))
		unit.tick(step, units, elapsed)
	ai_time -= step
	if ai_time <= 0.0:
		ai_time = 3.0
		_update_command_orders()
	_sync_objective_display()

func _sync_core_summary() -> void:
	var blu: Dictionary = core.forces["BLU"]
	var depot: Dictionary = core.depots["BLU"]["airfield"]
	supply_points = int(blu["sp"])
	manpower = int(blu["manpower"])
	readiness = int(blu["tempo"])
	fuel_stock = int(depot["fuel"])
	ammo_stock = int(depot["ammo"])
	next_supply = core.next_supply
	radio_system = str(core.radio.back().get("text","")) if not core.radio.is_empty() else radio_system
	radio_blue = core.staff_report("BLU")

func _sync_core_visuals() -> void:
	for side in ["BLU","RED"]:
		for record in core.units[side]:
			var id: String = record["id"]
			if visual_core_units.has(id):
				visual_core_units[id].core_record = record
				continue
			var role: String = record["role"]
			var base: Vector3 = map.airbases[side] if role in SimulationCore.AIR else map.naval_base(side) if role in SimulationCore.NAVAL else map.bases[side]
			var n := visual_core_units.size()
			var offset := Vector3(float(n%5)*0.10,0,float(n%3)*0.10)
			var pos: Vector3 = record.get("spawn_position",base+offset)
			var callsign: String = ("SABER command" if side == "BLU" else "VIPER command") if role == "COMMAND" else "%s %s %s" % ["SABER" if side == "BLU" else "VIPER",role.replace("_"," "),id.get_slice("-",1)]
			var unit := _spawn(_visual_kind_for_role(role),0 if side == "BLU" else 1,callsign,pos,role,record)
			record["position"] = pos
			visual_core_units[id] = unit

func _visual_kind_for_role(role: String) -> String:
	return {"COMMAND":"command","TANK":"tank","APC":"apc","CANNON_APC":"cannon_apc","IFV":"ifv","AMPHIBIOUS_APC":"amphibious_apc","TROOP_TRUCK":"troop_transport","TRUCK":"truck","CAS_FIGHTER":"cas","JET":"fighter","ATTACK_HELI":"vtol_attack","TRANSPORT_HELI":"transport_heli","HEAVY_LIFT_HELI":"vtol_cargo","CARGO_PLANE":"cargo_plane","RECON_UAV":"recon_uav","AIRCRAFT_CARRIER":"aircraft_carrier","FRIGATE":"missile_cruiser","PATROL_BOAT":"patrol_boat","LANDING_CRAFT":"landing_craft","FORKLIFT":"forklift","UAV_JAMMER":"uav_jammer"}.get(role,"soldier")

func _unhandled_input(event: InputEvent) -> void:
	if event is InputEventKey and event.pressed and not event.echo:
		match event.physical_keycode:
			KEY_SPACE:
				toggle_pause()
			KEY_1:
				set_speed(1.0)
			KEY_2:
				set_speed(2.0)
			KEY_4:
				set_speed(4.0)
			KEY_8:
				set_speed(8.0)
			KEY_O:
				overview_camera()
			KEY_G:
				show_grid = not show_grid
			KEY_F9:
				show_routes = not show_routes
			KEY_F1:
				open_battlefield()
			KEY_F2:
				open_model_preview()
			KEY_F4:
				open_sfx_designer()
			KEY_PERIOD:
				step_once()
			KEY_F:
				focus_selection()
			KEY_H:
				hud.toggle_help()
			KEY_R:
				if event.ctrl_pressed: get_tree().reload_current_scene()
			KEY_TAB:
				select_next()
			KEY_ESCAPE:
				hud.close_panels()
				clear_selection()
			KEY_X:
				hold_selection()
	if is_instance_valid(native_workspaces) and native_workspaces.visible: return
	if not operation_view_active: return
	if event is InputEventMouseButton:
		if event.button_index == MOUSE_BUTTON_LEFT:
			if event.pressed:
				mouse_down = true
				drag_start = event.position
				drag_end = event.position
			else:
				if not mouse_down:
					return
				if not selection_drag:
					var hit := _pick_unit(event.position)
					if hit != null:
						select_unit(hit, event.shift_pressed)
					elif not event.shift_pressed:
						clear_selection()
				mouse_down = false
				selection_drag = false
		# Secondary drag belongs to the orbit camera, matching the browser.
		# The current game is AI versus AI; observer clicks do not inject orders.
	if event is InputEventMouseMotion and mouse_down:
		drag_end = event.position
		selection_drag = drag_start.distance_to(drag_end) > 7.0

func _ensure_native_workspaces() -> void:
	if is_instance_valid(native_workspaces): return
	native_workspaces = load("res://scripts/native_workspaces.gd").new()
	hud.get_parent().add_child(native_workspaces)
	native_workspaces.setup(self)

func open_model_preview() -> void:
	_ensure_native_workspaces()
	hud.close_panels()
	hud.hide()
	camera.input_enabled = false
	native_workspaces.show_models()

func open_sfx_designer() -> void:
	_ensure_native_workspaces()
	hud.close_panels()
	hud.hide()
	camera.input_enabled = false
	native_workspaces.show_sfx()

func open_battlefield() -> void:
	if is_instance_valid(native_workspaces): native_workspaces.hide()
	camera.input_enabled = true
	hud.show()
	hud.close_panels()

func _pick_unit(screen_pos: Vector2) -> CombatUnit:
	if not operation_view_active: return null
	var best: CombatUnit
	var nearest := 25.0
	for unit in units:
		if not unit.is_alive:
			continue
		var center := unit.position + Vector3.UP * (unit.altitude + 0.02)
		if camera.is_position_behind(center):
			continue
		var point := camera.unproject_position(center)
		var gap := point.distance_to(screen_pos)
		if gap < nearest:
			nearest = gap
			best = unit
	return best

func clear_selection() -> void:
	for unit in selected_units:
		unit.set_selected(false)
	selected_units.clear()

func select_unit(unit: CombatUnit, append: bool) -> void:
	if not append:
		clear_selection()
	if append and selected_units.has(unit):
		selected_units.erase(unit)
		unit.set_selected(false)
	else:
		selected_units.append(unit)
		unit.set_selected(true)

func _select_box(append: bool) -> void:
	if not append:
		clear_selection()
	var rect := Rect2(drag_start, drag_end - drag_start).abs()
	for unit in units:
		if not unit.is_alive or selected_units.has(unit):
			continue
		var center := unit.position + Vector3.UP * (unit.altitude + 0.02)
		if not camera.is_position_behind(center) and rect.has_point(camera.unproject_position(center)):
			selected_units.append(unit)
			unit.set_selected(true)

func select_next() -> void:
	var blue: Array[CombatUnit] = []
	for unit in units:
		if unit.is_alive:
			blue.append(unit)
	if blue.is_empty():
		return
	var current := blue.find(selected_units[0]) if not selected_units.is_empty() else -1
	select_unit(blue[(current + 1) % blue.size()], false)

func select_all_blue() -> void:
	# Retained name for the existing HUD hook; observer selection includes both sides.
	clear_selection()
	for unit in units:
		if unit.is_alive:
			selected_units.append(unit)
			unit.set_selected(true)

func issue_order(point: Vector3, target: CombatUnit = null) -> void:
	if not operation_view_active:
		notify("Return to the current theater to issue a map order.")
		return
	var controlled: Array[CombatUnit] = []
	for unit in selected_units:
		if unit.is_alive:
			controlled.append(unit)
	if controlled.is_empty():
		notify("Select a unit first.")
		return
	var success := 0
	for i in range(controlled.size()):
		var offset := Vector3.ZERO
		if controlled.size() > 1:
			offset = Vector3(float(i % 3 - 1) * 0.15, 0.0, floorf(float(i) / 3.0) * 0.15)
		var unit := controlled[i]
		unit.core_record["manual_until"] = elapsed+120.0
		var destination := point+offset
		if unit.move_to(destination, command_mode == "ADVANCE"):
			if unit.role in SimulationCore.NAVAL:
				core.set_maritime_order("BLU" if unit.team == 0 else "RED",str(unit.core_record["id"]),Vector2(destination.x,destination.z))
			success += 1
			if target != null and target.team != unit.team:
				unit.attack_target = target
	marker.position = Vector3(point.x, 0.003, point.z)
	marker.show()
	marker_time = 1.5
	notify("Order sent to %d unit%s." % [success, "" if success == 1 else "s"] if success > 0 else "No route to this point. Select a road.")

func hold_selection() -> void:
	for unit in selected_units:
		if unit.is_alive:
			unit.hold()
			unit.core_record["manual_until"] = elapsed+120.0
	notify("Selected units will hold their positions.")

func focus_selection() -> void:
	if not return_to_theater(false): return
	if selected_units.is_empty():
		camera.focus_at(map.objective_position)
		return
	var center := Vector3.ZERO
	for unit in selected_units:
		center += unit.position+Vector3.UP*unit.altitude
	camera.focus_at(center / selected_units.size())
	camera.target_distance = maxf(0.18,float(selected_units[0].stats["size"])*4.0)

func toggle_pause() -> void:
	paused = not paused
	for unit in units:
		if unit.exhaust != null:
			unit.exhaust.speed_scale = 0.0 if paused else speed
		if unit.animation_player != null:
			unit.animation_player.speed_scale = 0.0 if paused else speed

func set_speed(value: float) -> void:
	speed = value
	for unit in units:
		if unit.exhaust != null:
			unit.exhaust.speed_scale = 0.0 if paused else speed
		if unit.animation_player != null:
			unit.animation_player.speed_scale = 0.0 if paused else speed

func step_once() -> void:
	if not paused: toggle_pause()
	_tick_simulation(0.05)
	notify("Simulation advanced by 0.05 seconds.")

func set_graphics_setting(key: String, value: Variant) -> void:
	if not graphics_settings.has(key): return
	graphics_settings[key] = value
	var performance: bool = graphics_settings["performanceMode"]
	set_shadows(bool(graphics_settings["shadows"]) and not performance)
	show_routes = bool(graphics_settings["routes"]) and not performance
	show_grid = bool(graphics_settings["grid"]) and not performance
	get_viewport().scaling_3d_scale = 1.0 if performance else {"performance":1.0,"balanced":1.5,"high":2.0}.get(graphics_settings["quality"],1.0)
	for node in map.get_children():
		if node is MultiMeshInstance3D or node.is_in_group("installation_models"): node.visible = bool(graphics_settings["models"])
	_apply_model_visibility()
	hud.queue_redraw()

func _apply_model_visibility() -> void:
	for unit in units:
		unit.visible = bool(graphics_settings["models"]) and (not graphics_settings["performanceMode"] or unit.position.distance_to(camera.focus) <= 10.0)

func set_shadows(enabled: bool) -> void:
	shadow_enabled = enabled
	sun.shadow_enabled = enabled

func set_fresnel(enabled: bool) -> void:
	fresnel_enabled = enabled
	for unit in units:
		unit.set_fresnel(enabled)

func notify(text: String) -> void:
	message = text
	message_time = 5.0

func _update_command_orders() -> void:
	for side in ["BLU","RED"]:
		var team := 0 if side == "BLU" else 1
		var force: Dictionary = core.forces[side]
		var target: Vector3 = core.objectives[str(force["target"])]["position"]
		for unit in units:
			if unit.team != team or not unit.is_alive or unit.role == "COMMAND": continue
			var record: Dictionary = unit.core_record
			if force["hold"] or force["action"] == "HOLD": unit.hold(); continue
			if record.get("refuel_run", false): _continue_refuel_run(side, unit); continue
			if record["service"] != "READY":
				if unit.role in ["TROOP_TRUCK","TRANSPORT_HELI"] and record["service"] == "AWAITING FUEL / AMMO" and not record["at_base"]: _start_refuel_run(side, unit)
				else: unit.order = record["service"]
				continue
			if record["transport"].has("carrier"): continue
			if unit.role in ["TROOP_TRUCK","TRANSPORT_HELI"]:
				var passengers: Array = record["transport"].get("passengers",[])
				if not passengers.is_empty():
					var seated := true
					for id in passengers:
						if core._unit(side,id).get("transport",{}).get("phase","") != "seated": seated = false
					if not seated: unit.hold(); continue
					if unit.position.distance_to(target) < 0.7:
						unit.hold(); record["moving"] = false
						for id in passengers.duplicate(): core.dismount(side,id)
					elif (unit.route.is_empty() or unit.route[-1].distance_to(target) > 0.12) and not unit.move_to(target,false) and unit.order.begins_with("MISSION FUEL") and not record["at_base"]: _start_refuel_run(side, unit)
				else:
					var pickup: CombatUnit
					var nearest := INF
					for squad in units:
						if squad.team != team or not squad.is_alive or squad.personnel == 0 or not squad.core_record["transport"].is_empty() or squad.position.distance_to(target) < 1.0: continue
						if squad.core_record.get("command_mission", {}).get("task", "") in ["DEFEND_BASE", "RESUPPLY", "WITHDRAW", "RESERVE", "HOLD"]: continue
						var gap := squad.position.distance_to(unit.position)
						if gap < nearest: pickup = squad; nearest = gap
					if pickup != null:
						if nearest < 0.18:
							unit.hold(); record["moving"] = false
							pickup.hold()
							core.embark(side,str(pickup.core_record["id"]),str(record["id"]))
						elif unit.route.is_empty() and not unit.move_to(pickup.position,false) and unit.order.begins_with("MISSION FUEL") and not record["at_base"]: _start_refuel_run(side, unit)
				continue
			var mission: Dictionary = record.get("command_mission", {})
			if mission.is_empty():
				unit.hold()
				unit.order = "AWAITING COMMAND"
				continue
			var task := str(mission.get("task", "RESERVE"))
			if task == "RESERVE":
				unit.hold()
				unit.order = "RESERVE"
				continue
			var ordered: Variant = mission.get("destination", Vector2(target.x, target.z))
			var mission_target := Vector3(float(ordered.x), 0.0, float(ordered.y)) if ordered is Vector2 else target
			if unit.role in SimulationCore.NAVAL:
				var maritime_target := map.maritime_staging_point(mission_target)
				if unit.route.is_empty() and unit.position.distance_to(maritime_target) > 0.12:
					if unit.move_to(maritime_target,task == "ASSAULT"):
						core.set_maritime_order(side,str(record["id"]),Vector2(maritime_target.x,maritime_target.z))
				unit.order = "%s · OFFSHORE OBJ %s" % [task,str(mission.get("target",force["target"]))]
				continue
			if task in ["ASSAULT", "RECON", "SUPPORT"] and unit.personnel > 0 and unit.position.distance_to(mission_target) > 5.0:
				if not record.has("transport_wait"): record["transport_wait"] = elapsed
				if elapsed-float(record["transport_wait"]) < 60.0:
					unit.hold(); unit.order = "WAITING FOR TRANSPORT"; continue
			if (unit.route.is_empty() or unit.route[-1].distance_to(mission_target) > 0.12) and unit.position.distance_to(mission_target) > 0.12:
				unit.move_to(mission_target, task == "ASSAULT")
			unit.order = "%s · OBJ %s" % [task, str(mission.get("target", force["target"]))]

# A transport stranded forward below its next leg's fuel requirement would never
# move again: service only happens at base. Unload, drive home, top off, resume.
func _start_refuel_run(side: String, unit: CombatUnit) -> void:
	unit.core_record["refuel_run"] = true
	_continue_refuel_run(side, unit)

func _continue_refuel_run(side: String, unit: CombatUnit) -> void:
	var record: Dictionary = unit.core_record
	var passengers: Array = record["transport"].get("passengers",[])
	if not passengers.is_empty():
		unit.hold(); record["moving"] = false
		for id in passengers.duplicate():
			if core._unit(side,id).get("transport",{}).get("phase","") != "dismounting": core.dismount(side,id)
		unit.order = "UNLOADING TO REFUEL"
		return
	if record["at_base"]:
		unit.hold(); record["moving"] = false
		unit.order = "REFUELING"
		if float(record["fuel"]) >= 90.0 or float(core.depots[side]["airfield" if unit.airborne else "mob"]["fuel"]) < 1.0: record["refuel_run"] = false
		return
	if unit.route.is_empty(): unit.move_to(map.airbases[side] if unit.airborne else map.bases[side], false, false)
	unit.order = "RETURNING TO REFUEL"

func carrier_action(action: String) -> void:
	if selected_units.is_empty(): return
	var unit: CombatUnit = selected_units[0]
	var side := "BLU" if unit.team == 0 else "RED"
	var id: String = unit.core_record.get("id","")
	if action == "launch":
		if core.launch_sortie(side,id).is_empty(): notify("Deck launch requires a stationary deployed carrier, fuel, ammunition and an available aircraft.")
		else: _sync_core_visuals(); notify("Aircraft launched from the deployed deck.")
	elif core.set_carrier_state(side,id,action):
		unit.hold(); unit.core_record["moving"] = false
		notify("Carrier " + str(unit.core_record["maritime"]["phase"]) + ".")

func embark_selection() -> void:
	if selected_units.is_empty(): return
	var squad: CombatUnit = selected_units[0]
	var side := "BLU" if squad.team == 0 else "RED"
	for carrier in units:
		if carrier.team == squad.team and carrier != squad and core.embark(side,str(squad.core_record.get("id","")),str(carrier.core_record.get("id",""))):
			notify("Boarding " + carrier.call_sign); return
	notify("Move the squad within 18 m of a stopped friendly carrier with free seats.")

func dismount_selection() -> void:
	for unit in selected_units:
		core.dismount("BLU" if unit.team == 0 else "RED",str(unit.core_record.get("id","")))

func _update_capture(delta: float) -> void:
	# Test and adapter hook: copy presentation positions before advancing the
	# authoritative browser-parity capture/victory rules.
	for unit in units:
		unit.core_record["position"] = unit.position
	core.update_objective_control(delta)
	core._update_victory(delta)
	_sync_objective_display()

func _sync_objective_display() -> void:
	for id in core.objectives:
		var objective: Dictionary = core.objectives[id]
		objective_owner[id] = str(objective.get("owner",""))
		objective_capture_side[id] = str(objective.get("capturing",""))
		objective_progress[id] = float(objective.get("progress",0.0))*8.0
		var owner := str(objective_owner[id])
		map.set_objective_control(id,100.0 if owner == "BLU" else -100.0 if owner == "RED" else 0.0)
	capture = 100.0 if objective_owner.get("G","") == "BLU" else -100.0 if objective_owner.get("G","") == "RED" else 0.0
	winner_side = str(core.winner)
	victory_hold = maxf(float(core.territory_hold.get("BLU",0.0)),float(core.territory_hold.get("RED",0.0)))
	hold_time = victory_hold
	if not winner_side.is_empty():
		mission_state = "MUTUAL COMMAND LOSS" if winner_side == "DRAW" else winner_side+" VICTORY"

func request_reinforcement(role: String = "RIFLE") -> void:
	notify("Requisition queued: " + role if core.procure(active_side,role) else "Requisition unavailable: check SP reserve, personnel and queue capacity.")

func objective_summary() -> String:
	var summary := ""
	for objective in map.get_objectives():
		var id := str(objective["id"])
		var owner := str(objective_owner.get(id,""))
		summary += id + ("●" if owner == "BLU" else "×" if owner == "RED" else "○") + "  "
	return summary.strip_edges() + "  ·  NEUTRAL OBJECTIVES"

func zoom_camera(direction: float) -> void:
	camera.target_distance = clampf(camera.target_distance * (0.84 if direction < 0 else 1.18), camera.MIN_DISTANCE, camera.MAX_DISTANCE)
func overview_camera() -> void:
	if not return_to_theater(false): return
	camera.focus_at(Vector3(-5,0,0)); camera.target_distance = 900.0
func north_camera() -> void:
	camera.yaw = 0.0

func _create_order_marker() -> void:
	marker = MeshInstance3D.new()
	var mesh := TorusMesh.new()
	mesh.inner_radius = 0.04
	mesh.outer_radius = 0.05
	mesh.rings = 32
	mesh.ring_segments = 6
	marker.mesh = mesh
	var mat := TacticalMap.material(Color("deebba"))
	mat.shading_mode = BaseMaterial3D.SHADING_MODE_UNSHADED
	marker.material_override = mat
	marker.cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_OFF
	marker.hide()
	operation_root.add_child(marker)

func _on_unit_fired(unit: CombatUnit, target: CombatUnit) -> void:
	var start := unit.muzzle_position()
	var end := target.global_position + Vector3.UP * (target.altitude + 0.01)
	var beam := MeshInstance3D.new()
	var mesh := CylinderMesh.new()
	mesh.top_radius = 0.001
	mesh.bottom_radius = 0.0015
	mesh.height = maxf(0.1, start.distance_to(end))
	mesh.radial_segments = 6
	beam.mesh = mesh
	var mat := TacticalMap.material(Color("ffe5ab") if unit.team == 0 else Color("efad86"))
	mat.shading_mode = BaseMaterial3D.SHADING_MODE_UNSHADED
	beam.material_override = mat
	beam.cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_OFF
	operation_root.add_child(beam)
	beam.position = (start + end) * 0.5
	var direction := (end - start).normalized()
	if direction.length_squared() > 0.001:
		beam.quaternion = Quaternion(Vector3.UP, direction)
	effects.append({"node": beam, "life": 0.10})

func _on_unit_destroyed(unit: CombatUnit) -> void:
	if selected_units.has(unit):
		selected_units.erase(unit)
	var side := "BLU" if unit.team == 0 else "RED"
	core.log_event(side,unit.call_sign + " is lost.","contact")
	notify(unit.call_sign + " is lost.")

func _tick_effects(delta: float) -> void:
	for i in range(effects.size() - 1, -1, -1):
		effects[i]["life"] -= delta
		if effects[i]["life"] <= 0.0:
			effects[i]["node"].queue_free()
			effects.remove_at(i)
	if marker_time > 0.0:
		marker_time -= delta
		marker.scale = Vector3.ONE * (1.0 + sin(marker_time * 9.0) * 0.12)
		if marker_time <= 0.0:
			marker.hide()

func _run_smoke_test() -> void:
	assert(geography_active and geography != null,"The main scene must initialize geographic vector streaming.")
	assert(map.geographic_active and building_streamer == null,"Geography must replace duplicate terrain/road/catalog renderers.")
	assert(map.find_child("SanDiegoLandmass",true,false) == null and map.find_child("PacificOceanAndSanDiegoBay",true,false) == null)
	assert(geography.get("exclusions").size() == 4,"MOB and airfield footprints must be excluded from geographic tiles.")
	assert(geography_attribution.contains("OpenStreetMap") and geography_attribution.contains("OpenFreeMap"))
	assert(hud.attribution_text.visible and hud.attribution_text.get_parsed_text().contains("OpenStreetMap"))
	assert(geography.scale == Vector3.ONE,"Geographic tile coordinates already use -Z north.")
	var theater_camera := _camera_state()
	var operation_before: Dictionary = core.snapshot()
	var command_position := units[0].position
	var selection_before := selected_units.duplicate()
	assert(focus_geographic_location(2.3522,48.8566),"Map navigation must accept a location outside the current theater.")
	camera._process(0.0)
	assert(camera.focus.length() < 0.01 and geography.get("origin") == [2.3522,48.8566],"Distant navigation must rebase geographic geometry and keep the camera local.")
	assert(not operation_view_active and not map.is_visible_in_tree() and not units[0].is_visible_in_tree(),"The current operation must not appear in another city.")
	assert(geography.get("exclusions").is_empty(),"San Diego installation exclusions must not cut holes in another city.")
	assert(not focus_geographic_location(0.0,90.0),"Mercator latitude limits must be enforced.")
	assert(return_to_theater(),"Returning to the operation must restore its geographic origin.")
	assert(operation_view_active and map.is_visible_in_tree() and units[0].is_visible_in_tree())
	assert(geography.get("origin") == theater_origin and geography.get("exclusions").size() == 4)
	assert(_camera_state() == theater_camera and units[0].position == command_position)
	assert(core.snapshot() == operation_before and selected_units == selection_before,"Map excursions must preserve the current simulation and selection.")
	assert(focus_geographic_location(139.6917,35.6895))
	var distant_session := export_session_state()
	assert(return_to_theater())
	restore_session_state(distant_session)
	assert(not operation_view_active and geography.get("origin") == [139.6917,35.6895] and camera.focus.length() < 0.01,"Session restoration must retain a rebased distant map view.")
	assert(return_to_theater() and core.snapshot() == operation_before,"Returning from a restored map excursion must retain the operation.")
	assert(units.size() == 2 and map.get_objectives().size() == 10)
	assert(not units[0].move_to(map.objective_position), "Command elements are stationary.")
	assert(SimulationCore.CATALOG["TANK"][4] == 8000 and SimulationCore.CATALOG["JET"][4] == 16000)
	assert(core.ROLES.size() == 31)
	toggle_pause(); set_speed(4.0)
	assert(paused and speed == 4.0,"Changing speed must preserve pause.")
	var before := elapsed
	step_once()
	assert(is_equal_approx(elapsed,before+0.05))
	for side in ["BLU","RED"]:
		core.forces[side]["sp"] = 60000
		assert(core.procure(side,"RIFLE"))
		assert(core.forces[side]["queue"][0]["due"] > core.time+8.0)
	core.time = 30.0; core.next_supply = 30.0; core.tick(0.05)
	assert(core.next_supply == 210.0 and core.shipments.size() == 2)
	assert(core.depots["BLU"]["airfield"]["fuel"] == 0,"Inbound supply is not instantly spendable.")
	core.time = 100.0; core.tick(0.05); _sync_core_visuals()
	assert(units.size() >= 4)
	commander_director.next_plan = core.time
	commander_director.tick(core)
	core.time += 1.0; commander_director.tick(core)
	assert(not commander_director.plan_for("BLU").is_empty() and not commander_director.plan_for("RED").is_empty())
	assert(not core.units["BLU"][1].get("command_mission",{}).is_empty() and not core.units["RED"][1].get("command_mission",{}).is_empty(),"Both commanders must deliver per-unit missions through the live core records.")
	_update_command_orders()
	var rifle: CombatUnit = visual_core_units[core.units["BLU"][1]["id"]]
	assert(is_equal_approx(float(rifle.stats["speed"]),0.038),"Native infantry speed is browser m/s divided by 100.")
	var initial := rifle.position
	assert(rifle.move_to(initial+Vector3(1,0,0)))
	rifle.tick(0.1,units,0.1)
	assert(rifle.position.distance_to(initial) > 0 and rifle.position.distance_to(initial) < 0.01)
	for side in ["BLU","RED"]: core.units[side].append(core.make_unit(side,"RIFLE","test-"+side))
	_sync_core_visuals()
	var g: Vector3 = core.objectives["G"]["position"]
	for unit in units:
		if unit.team == 0 and unit.personnel > 0: unit.position = g; unit.hold()
	_update_capture(0.05); _update_capture(7.95)
	assert(objective_owner["G"] == "BLU")
	var saved := export_session_state()
	core.forces["BLU"]["sp"] = 0
	restore_session_state(saved)
	assert(core.forces["BLU"]["sp"] > 0 and objective_owner["G"] == "BLU")
	for unit in units: assert(unit.core_record == core._unit("BLU" if unit.team == 0 else "RED",str(unit.core_record["id"])))
	var carrier: Dictionary = core.make_unit("BLU","AIRCRAFT_CARRIER","smoke-carrier")
	carrier["fuel"] = 100.0; carrier["ammo"] = 100.0; carrier["service"] = "READY"
	core.units["BLU"].append(carrier)
	assert(not core.set_carrier_state("BLU","smoke-carrier","deployed"))
	assert(core.set_carrier_state("BLU","smoke-carrier","deploying"))
	assert(not core.carrier_can_launch("BLU","smoke-carrier"))
	core.time += SimulationCore.CARRIER_STOP_SECONDS; core._tick_units(0.0)
	assert(carrier["maritime"]["phase"] == "deploying")
	core.time += SimulationCore.CARRIER_DEPLOY_SECONDS; core._tick_units(0.0)
	assert(core.carrier_can_launch("BLU","smoke-carrier"))
	assert(not core.launch_sortie("BLU","smoke-carrier").is_empty())
	assert(not core.carrier_can_launch("BLU","smoke-carrier"))
	assert(core.set_maritime_order("BLU","smoke-carrier",Vector2(-100,0)))
	assert(carrier["maritime"]["phase"] == "undeploying")
	core.time += SimulationCore.CARRIER_UNDEPLOY_SECONDS; core._tick_units(0.0)
	assert(carrier["maritime"]["phase"] == "moving")
	carrier["position"] = map.naval_base("BLU")
	carrier["command_mission"] = {"task":"SUPPORT","target":"G","destination":Vector2(g.x,g.z),"revision":1}
	_sync_core_visuals()
	var carrier_visual: CombatUnit = visual_core_units["smoke-carrier"]
	carrier_visual.position = carrier["position"]
	_update_command_orders()
	assert(not carrier_visual.route.is_empty() and is_equal_approx(carrier_visual.route[-1].x,-120.0),"AI commander must issue a validated offshore naval route.")
	carrier_visual.route.clear()
	carrier["maritime"]["phase"] = "deployed"
	selected_units = [carrier_visual]
	issue_order(Vector3.ZERO)
	assert(carrier["maritime"]["phase"] == "deployed" and carrier_visual.route.is_empty(),"A rejected dry naval order must not undeploy a carrier or replace its route.")
	for unit in units: unit.position = Vector3(90,0,0)
	for id in core.objectives: core.objectives[id]["owner"] = "RED"
	_update_capture(0.05); _update_capture(60.0)
	assert(mission_state == "RED VICTORY","Victory works symmetrically.")
	assert(core.staff_reports("RED").size() == 6)
	var test_core := CoreScript.new()
	test_core.setup(map.get_objectives())
	var carrier_record := test_core.make_unit("BLU","APC","test-apc")
	carrier_record["fuel"] = 100.0; carrier_record["ammo"] = 100.0; carrier_record["hp"] = 50.0
	test_core.units["BLU"].append(carrier_record)
	for i in range(3): test_core.units["BLU"].append(test_core.make_unit("BLU","RIFLE","passenger-"+str(i)))
	assert(test_core.embark("BLU","passenger-0","test-apc"))
	assert(test_core.embark("BLU","passenger-1","test-apc"))
	assert(not test_core.embark("BLU","passenger-2","test-apc"),"APC seats cannot be overbooked.")
	test_core.time += SimulationCore.BOARD_SECONDS
	test_core._tick_units(0.0)
	assert(test_core._unit("BLU","passenger-0")["transport"]["phase"] == "seated")
	assert(test_core.dismount("BLU","passenger-0"))
	test_core.time += SimulationCore.BOARD_SECONDS
	test_core._tick_units(0.0)
	assert(test_core._unit("BLU","passenger-0")["transport"].is_empty(),"Dismounted passengers must not become seated again.")
	assert(carrier_record["transport"]["passengers"].size() == 1)
	test_core.depots["BLU"]["mob"]["repair"] = 100.0
	test_core._tick_units(1.0)
	assert(carrier_record["hp"] > 50 and test_core.depots["BLU"]["mob"]["repair"] < 100)
	assert(SimulationCore.TRANSPORT_CAPACITY["LANDING_CRAFT"] == 24)
	assert(map.bases["BLU"].z > map.bases["RED"].z and map.bases["RED"].x > map.bases["BLU"].x,"Scene adapter preserves north/south and east/west geography.")

	assert(UpdateService.run_smoke_tests())
	print("GRID_COMMAND_SMOKE_OK: catalog, scale, queues, phased supplies, commander missions, authoritative combat/capture, RED victory, pause/step, session restore, carrier legal transitions and launch gates")
	get_tree().quit(0)

func export_session_state() -> Dictionary:
	var records: Array = []
	var selected: Array = []
	for unit in units:
		records.append({"id":unit.core_record.get("id",""),"position":unit.position,"rotation":unit.rotation,"health":unit.health,"is_alive":unit.is_alive,"route":unit.route.duplicate(),"order":unit.order,"cooldown":unit.cooldown,"target":unit.attack_target.core_record.get("id","") if is_instance_valid(unit.attack_target) else ""})
	for unit in selected_units: selected.append(unit.core_record.get("id",""))
	return {"schema":2,"elapsed":elapsed,"ai_time":ai_time,"mission_state":mission_state,"paused":paused,"speed":speed,"active_side":active_side,"objective_progress":objective_progress.duplicate(true),"objective_owner":objective_owner.duplicate(true),"objective_capture_side":objective_capture_side.duplicate(true),"victory_hold":victory_hold,"winner_side":winner_side,"shadow_enabled":shadow_enabled,"fresnel_enabled":fresnel_enabled,"core":core.snapshot(),"commander_director":commander_director.snapshot(),"units":records,"selected":selected,"camera":_camera_state(),"geographic_view":{"origin":geography.get("origin").duplicate() if geography_active else [],"operation":operation_view_active,"theater_camera":theater_camera_state.duplicate(true)}}

func restore_session_state(snapshot: Dictionary) -> void:
	if int(snapshot.get("schema",0)) != 2:
		notify("This simulation update starts a new operation; the previous state schema is incompatible.")
		return
	clear_selection()
	for unit in units: unit.queue_free()
	units.clear(); visual_core_units.clear()
	core.restore(snapshot["core"])
	if snapshot.has("commander_director"):
		commander_director.restore(snapshot["commander_director"])
	else:
		commander_director.setup(3701)
	for key in ["elapsed","ai_time","mission_state","active_side","objective_progress","objective_owner","objective_capture_side","victory_hold","winner_side"]:
		if snapshot.has(key): set(key,snapshot[key])
	_sync_core_visuals(); _sync_core_summary()
	for record in snapshot.get("units",[]):
		var unit: CombatUnit = visual_core_units.get(record["id"])
		if unit == null: continue
		unit.position = record["position"]; unit.rotation = record["rotation"]
		unit.health = record["health"]; unit.route = record["route"]; unit.order = record["order"]; unit.cooldown = record["cooldown"]
		unit.attack_target = visual_core_units.get(record["target"])
		if not record["is_alive"]:
			unit.destroyed.disconnect(_on_unit_destroyed)
			unit.take_damage(unit.max_health)
	for id in snapshot.get("selected",[]):
		var unit: CombatUnit = visual_core_units.get(id)
		if unit != null and unit.is_alive: selected_units.append(unit); unit.set_selected(true)
	var geographic_view: Dictionary = snapshot.get("geographic_view",{})
	var view_origin: Array = geographic_view.get("origin",theater_origin)
	if geography_active and view_origin.size() == 2 and _set_geographic_origin(view_origin):
		theater_camera_state = geographic_view.get("theater_camera",{}).duplicate(true)
		_set_operation_view(bool(geographic_view.get("operation",true)))
	for key in snapshot.get("camera",{}): camera.set(key,snapshot["camera"][key])
	camera._update_pose(0.0)
	if geography_active: geography.call("update_camera",camera)
	set_shadows(snapshot.get("shadow_enabled",true)); set_fresnel(snapshot.get("fresnel_enabled",true))
	paused = bool(snapshot.get("paused",false)); set_speed(float(snapshot.get("speed",1)))
	notify("The update is active. The operation was kept.")
