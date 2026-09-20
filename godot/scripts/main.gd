extends Node3D

const MapScript = preload("res://scripts/tactical_map.gd")
const CameraScript = preload("res://scripts/rts_camera.gd")
const UnitScript = preload("res://scripts/combat_unit.gd")
const HudScript = preload("res://scripts/tactical_hud.gd")

var map: TacticalMap
var camera: RTSCamera
var hud: Control
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
var message := "Select a blue unit. Right-click the map to give an order."
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

func _ready() -> void:
	_create_environment()
	map = MapScript.new()
	map.name = "SanDiegoHarbor"
	add_child(map)
	camera = CameraScript.new()
	camera.name = "CommandCamera"
	add_child(camera)
	_create_units()
	var layer := CanvasLayer.new()
	layer.name = "CommandInterface"
	add_child(layer)
	hud = HudScript.new()
	hud.world = self
	layer.add_child(hud)
	_create_order_marker()
	select_unit(units[0], false)
	if "--smoke-test" in OS.get_cmdline_user_args():
		_run_smoke_test.call_deferred()

func _create_environment() -> void:
	var environment := Environment.new()
	environment.background_mode = Environment.BG_SKY
	var sky := Sky.new()
	var sky_mat := ProceduralSkyMaterial.new()
	sky_mat.sky_top_color = Color("628aab")
	sky_mat.sky_horizon_color = Color("c0d6d3")
	sky_mat.ground_bottom_color = Color("728c8b")
	sky_mat.ground_horizon_color = Color("c0d6d3")
	sky_mat.sky_energy_multiplier = 0.75
	sky.sky_material = sky_mat
	environment.sky = sky
	environment.ambient_light_source = Environment.AMBIENT_SOURCE_COLOR
	environment.ambient_light_color = Color("c1d5d9")
	environment.ambient_light_energy = 0.53
	environment.tonemap_mode = Environment.TONE_MAPPER_FILMIC
	environment.fog_enabled = true
	environment.fog_light_color = Color("a1bebc")
	environment.fog_light_energy = 0.7
	environment.fog_density = 0.0014
	environment.fog_sky_affect = 0.10
	var world_environment := WorldEnvironment.new()
	world_environment.environment = environment
	add_child(world_environment)
	sun = DirectionalLight3D.new()
	sun.name = "LateMorningSun"
	sun.rotation_degrees = Vector3(-56.0, -32.0, 0.0)
	sun.light_color = Color("fff0d2")
	sun.light_energy = 1.3
	sun.shadow_enabled = true
	sun.directional_shadow_max_distance = 260.0
	sun.directional_shadow_mode = DirectionalLight3D.SHADOW_PARALLEL_4_SPLITS
	sun.shadow_bias = 0.06
	add_child(sun)

func _create_units() -> void:
	_spawn("tank", 0, "ALPHA 01", Vector3(-24, 0, 58))
	_spawn("tank", 0, "ALPHA 02", Vector3(0, 0, 62))
	_spawn("apc", 0, "BRAVO 01", Vector3(-24, 0, 68))
	_spawn("troop_transport", 0, "BRAVO 02", Vector3(0, 0, 73))
	_spawn("soldier", 0, "CHARLIE 01", Vector3(-16, 0, 47))
	_spawn("soldier", 0, "CHARLIE 02", Vector3(-9, 0, 47))
	_spawn("fighter", 0, "FALCON 01", Vector3(-24, 0, 29))
	_spawn("vtol_attack", 0, "RAVEN 01", Vector3(0, 0, 40))
	_spawn("tank", 1, "RED 01", Vector3(48, 0, -36))
	_spawn("apc", 1, "RED 02", Vector3(24, 0, -36))
	_spawn("soldier", 1, "RED 03", Vector3(24, 0, -12))
	_spawn("soldier", 1, "RED 04", Vector3(3, 0, -18))
	_spawn("fighter", 1, "RED 05", Vector3(42, 0, -58))

func _spawn(kind: String, team: int, call_sign: String, pos: Vector3) -> void:
	var unit := UnitScript.new()
	unit.name = call_sign.replace(" ", "_")
	unit.kind = kind
	unit.team = team
	unit.call_sign = call_sign
	unit.position = pos
	unit.map = map
	unit.fired.connect(_on_unit_fired)
	unit.destroyed.connect(_on_unit_destroyed)
	add_child(unit)
	units.append(unit)
	if team == 1:
		unit.rotation.y = PI

func _process(delta: float) -> void:
	message_time = maxf(0.0, message_time - delta)
	_tick_effects(delta)
	if paused or mission_state != "ACTIVE":
		return
	var sim_delta := minf(delta, 0.1) * speed
	elapsed += sim_delta
	for unit in units:
		unit.tick(sim_delta, units, elapsed)
	ai_time -= sim_delta
	if ai_time <= 0.0:
		ai_time = 3.0
		_update_red_orders()
	_update_capture(sim_delta)

func _unhandled_input(event: InputEvent) -> void:
	if event is InputEventKey and event.pressed and not event.echo:
		match event.physical_keycode:
			KEY_SPACE:
				toggle_pause()
			KEY_1:
				set_speed(1.0)
			KEY_2:
				set_speed(2.0)
			KEY_3:
				set_speed(4.0)
			KEY_F:
				focus_selection()
			KEY_H:
				hud.toggle_help()
			KEY_R:
				get_tree().reload_current_scene()
			KEY_TAB:
				select_next()
			KEY_ESCAPE:
				clear_selection()
			KEY_X:
				hold_selection()
	if event is InputEventMouseButton:
		if event.button_index == MOUSE_BUTTON_LEFT:
			if event.pressed:
				mouse_down = true
				drag_start = event.position
				drag_end = event.position
			else:
				if not mouse_down:
					return
				if selection_drag:
					_select_box(event.shift_pressed)
				else:
					var hit := _pick_unit(event.position)
					if hit != null:
						select_unit(hit, event.shift_pressed)
					elif not event.shift_pressed:
						clear_selection()
				mouse_down = false
				selection_drag = false
		elif event.button_index == MOUSE_BUTTON_RIGHT and event.pressed:
			var ground: Variant = camera.ground_point(event.position)
			if ground is Vector3:
				issue_order(ground, _pick_unit(event.position))
	if event is InputEventMouseMotion and mouse_down:
		drag_end = event.position
		selection_drag = drag_start.distance_to(drag_end) > 7.0

func _pick_unit(screen_pos: Vector2) -> CombatUnit:
	var best: CombatUnit
	var nearest := 25.0
	for unit in units:
		if not unit.is_alive:
			continue
		var center := unit.position + Vector3.UP * (unit.altitude + 1.0)
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
		if unit.team != 0 or not unit.is_alive or selected_units.has(unit):
			continue
		var center := unit.position + Vector3.UP * (unit.altitude + 1.0)
		if not camera.is_position_behind(center) and rect.has_point(camera.unproject_position(center)):
			selected_units.append(unit)
			unit.set_selected(true)

func select_next() -> void:
	var blue: Array[CombatUnit] = []
	for unit in units:
		if unit.team == 0 and unit.is_alive:
			blue.append(unit)
	if blue.is_empty():
		return
	var current := blue.find(selected_units[0]) if not selected_units.is_empty() else -1
	select_unit(blue[(current + 1) % blue.size()], false)

func select_all_blue() -> void:
	clear_selection()
	for unit in units:
		if unit.team == 0 and unit.is_alive:
			selected_units.append(unit)
			unit.set_selected(true)

func issue_order(point: Vector3, target: CombatUnit = null) -> void:
	var controlled: Array[CombatUnit] = []
	for unit in selected_units:
		if unit.team == 0 and unit.is_alive:
			controlled.append(unit)
	if controlled.is_empty():
		notify("Select a blue unit first.")
		return
	var success := 0
	for i in range(controlled.size()):
		var offset := Vector3.ZERO
		if controlled.size() > 1:
			offset = Vector3(float(i % 3 - 1) * 3.5, 0.0, floorf(float(i) / 3.0) * 3.5)
		var unit := controlled[i]
		if unit.move_to(point + offset, command_mode == "ADVANCE"):
			success += 1
			if target != null and target.team == 1:
				unit.attack_target = target
	marker.position = Vector3(point.x, 0.24, point.z)
	marker.show()
	marker_time = 1.5
	notify("Order sent to %d unit%s." % [success, "" if success == 1 else "s"] if success > 0 else "No route to this point. Select a road.")

func hold_selection() -> void:
	for unit in selected_units:
		if unit.team == 0:
			unit.hold()
	notify("Selected blue units will hold their positions.")

func focus_selection() -> void:
	if selected_units.is_empty():
		camera.focus_at(map.objective_position)
		return
	var center := Vector3.ZERO
	for unit in selected_units:
		center += unit.position
	camera.focus_at(center / selected_units.size())

func toggle_pause() -> void:
	paused = not paused
	for unit in units:
		if unit.exhaust != null:
			unit.exhaust.speed_scale = 0.0 if paused else speed
		if unit.animation_player != null:
			unit.animation_player.speed_scale = 0.0 if paused else speed

func set_speed(value: float) -> void:
	speed = value
	if paused:
		toggle_pause()
	for unit in units:
		if unit.exhaust != null:
			unit.exhaust.speed_scale = speed
		if unit.animation_player != null:
			unit.animation_player.speed_scale = speed

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

func _update_red_orders() -> void:
	for unit in units:
		if unit.team != 1 or not unit.is_alive:
			continue
		if unit.route.is_empty() and not is_instance_valid(unit.attack_target):
			if unit.position.distance_to(map.objective_position) > 7.0:
				unit.move_to(map.objective_position + Vector3(float(unit.get_index() % 3 - 1) * 3.0, 0, 0))

func _update_capture(delta: float) -> void:
	var blue_count := 0
	var red_count := 0
	var blue_ground := 0
	for unit in units:
		if not unit.is_alive or unit.airborne:
			continue
		if unit.team == 0:
			blue_ground += 1
		if unit.position.distance_to(map.objective_position) < 9.0:
			if unit.team == 0:
				blue_count += 1
			else:
				red_count += 1
	if blue_count > 0 and red_count == 0:
		capture = minf(100.0, capture + 13.0 * delta)
	elif red_count > 0 and blue_count == 0:
		capture = maxf(-100.0, capture - 13.0 * delta)
	if capture >= 100.0 and blue_count > 0 and red_count == 0:
		hold_time += delta
	else:
		hold_time = 0.0
	var ring_mat: StandardMaterial3D = map.objective_ring.material_override
	ring_mat.albedo_color = CombatUnit.BLUE if capture >= 100.0 else CombatUnit.RED if capture <= -100.0 else Color("e0c988")
	if hold_time >= 25.0:
		mission_state = "PORT SECURED"
		notify("Port secured. Press R to start a new mission.")
	elif blue_ground == 0:
		mission_state = "MISSION ENDED"
		notify("All blue ground units are lost. Press R to try again.")

func _create_order_marker() -> void:
	marker = MeshInstance3D.new()
	var mesh := TorusMesh.new()
	mesh.inner_radius = 1.35
	mesh.outer_radius = 1.50
	mesh.rings = 32
	mesh.ring_segments = 6
	marker.mesh = mesh
	var mat := TacticalMap.material(Color("deebba"))
	mat.shading_mode = BaseMaterial3D.SHADING_MODE_UNSHADED
	marker.material_override = mat
	marker.cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_OFF
	marker.hide()
	add_child(marker)

func _on_unit_fired(unit: CombatUnit, target: CombatUnit) -> void:
	var start := unit.global_position + Vector3.UP * (unit.altitude + 1.1)
	var end := target.global_position + Vector3.UP * (target.altitude + 1.0)
	var beam := MeshInstance3D.new()
	var mesh := CylinderMesh.new()
	mesh.top_radius = 0.035
	mesh.bottom_radius = 0.045
	mesh.height = maxf(0.1, start.distance_to(end))
	mesh.radial_segments = 6
	beam.mesh = mesh
	var mat := TacticalMap.material(Color("ffe5ab") if unit.team == 0 else Color("efad86"))
	mat.shading_mode = BaseMaterial3D.SHADING_MODE_UNSHADED
	beam.material_override = mat
	beam.cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_OFF
	add_child(beam)
	beam.position = (start + end) * 0.5
	var direction := (end - start).normalized()
	if direction.length_squared() > 0.001:
		beam.quaternion = Quaternion(Vector3.UP, direction)
	effects.append({"node": beam, "life": 0.10})

func _on_unit_destroyed(unit: CombatUnit) -> void:
	if selected_units.has(unit):
		selected_units.erase(unit)
	if unit.team == 0:
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
	# Exercise actual scene wiring and route execution in a bounded headless run.
	var route := map.find_route(Vector3(-24, 0, 58), map.objective_position)
	assert(not route.is_empty(), "A road route to the harbor must exist.")
	assert(units.size() == 13, "The mission must start with thirteen units.")
	assert(units[0].move_to(map.objective_position), "Ground order must succeed.")
	var initial := units[0].position
	units[0].tick(0.1, units, 0.1)
	assert(units[0].position.distance_to(initial) > 0.0, "A move order must change unit position.")
	select_all_blue()
	assert(selected_units.size() == 8, "All eight blue units must be selectable.")
	hold_selection()
	assert(units[0].route.is_empty(), "Hold must clear the route.")
	toggle_pause()
	assert(paused, "Pause must stop the simulation.")
	set_speed(2.0)
	assert(not paused and speed == 2.0, "Speed must resume the simulation.")
	print("GRID_COMMAND_SMOKE_OK: scene, 13 units, navigation, movement, selection, hold, pause, speed")
	get_tree().quit(0)
