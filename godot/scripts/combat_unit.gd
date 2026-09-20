extends Node3D
class_name CombatUnit

signal fired(unit: CombatUnit, target: CombatUnit)
signal destroyed(unit: CombatUnit)

const FRESNEL = preload("res://shaders/unit_fresnel.gdshader")
const BLUE := Color("66b9ec")
const RED := Color("e98d79")
const MODEL_LENGTH := {"command":0.025,"soldier":0.018,"tank":0.095,"apc":0.07,"cannon_apc":0.075,"troop_transport":0.07,"fighter":0.15,"cas":0.18,"vtol_attack":0.14,"vtol_cargo":0.20,"mec_lift":0.30,"cargo_plane":0.40,"recon_uav":0.06,"aircraft_carrier":3.30,"missile_cruiser":1.75,"patrol_boat":0.27,"landing_craft":0.46,"amphibious_apc":0.085,"truck":0.09,"forklift":0.035,"uav_jammer":0.03}

var kind := "tank"
var role := "TANK"
var core_record: Dictionary = {}
var simulation_core
var team := 0
var call_sign := "ALPHA 01"
var map: TacticalMap
var stats: Dictionary
var health := 100.0
var max_health := 100.0
var selected := false
var is_alive := true
var airborne := false
var altitude := 0.0
var route := PackedVector3Array()
var order := "READY"
var attack_target: CombatUnit
var cooldown := 0.0
var next_scan := 0.0
var visual: Node3D
var selection_ring: MeshInstance3D
var team_marker: MeshInstance3D
var visual_meshes: Array[MeshInstance3D] = []
var overlay: ShaderMaterial
var exhaust: CPUParticles3D
var animation_player: AnimationPlayer
var anim_idle := ""
var anim_move := ""
var phase := 0.0
var imported_model := false
var personnel := 0
var presentation_offset := Vector3.ZERO
var presentation_yaw_offset := 0.0

func _ready() -> void:
	add_to_group("combat_units")
	var catalog: Array = SimulationCore.CATALOG.get(role,SimulationCore.CATALOG["RIFLE"])
	var weapon: Dictionary = SimulationCore.weapon_for(role)
	stats = {"name":role.replace("_"," "),"size":MODEL_LENGTH.get(kind,0.07),"speed":float(catalog[1])/100.0,"health":100.0,"range":float(weapon.get("range",catalog[2]))/100.0,"damage":float(weapon.get("damage",catalog[3])),"rate":float(weapon.get("cooldown",2.0))}
	max_health = 100.0
	health = float(core_record.get("hp",max_health))
	airborne = role in SimulationCore.AIR
	personnel = int(catalog[0]) if not SimulationCore.is_vehicle(role) and role != "COMMAND" else 0
	altitude = 1.8 if role in ["JET","CAS_FIGHTER","CARGO_PLANE"] else 0.8 if airborne else 0.0
	phase = float(get_instance_id() % 100) * 0.1
	visual = Node3D.new()
	visual.name = "UnitVisual"
	visual.position.y = altitude + 0.0014
	add_child(visual)
	_create_model()
	_create_markers()
	if kind == "fighter":
		_create_exhaust()

func _process(delta: float) -> void:
	# Simulation records advance at 20 Hz. Retain the previous rendered transform
	# and consume that offset during the next fixed interval, matching the
	# browser's DisplayPoses interpolation instead of visibly stepping units.
	var weight := minf(1.0,delta/0.05)
	presentation_offset = presentation_offset.lerp(Vector3.ZERO,weight)
	presentation_yaw_offset = lerp_angle(presentation_yaw_offset,0.0,weight)
	if is_instance_valid(visual):
		visual.position.x = presentation_offset.x
		visual.position.z = presentation_offset.z
		visual.rotation.y = presentation_yaw_offset
	if is_instance_valid(selection_ring):
		selection_ring.position.x = presentation_offset.x
		selection_ring.position.z = presentation_offset.z
	if is_instance_valid(team_marker):
		team_marker.position.x = presentation_offset.x
		team_marker.position.z = presentation_offset.z

func presentation_position() -> Vector3:
	return global_position+Vector3(presentation_offset.x,altitude+0.0014,presentation_offset.z)

func presentation_heading() -> float:
	return rotation.y+presentation_yaw_offset

func _create_model() -> void:
	var source_kind := "soldier" if kind == "command" else kind
	var path := "res://assets/models/" + source_kind + ".glb"
	var model: Node3D
	if ResourceLoader.exists(path):
		var resource := load(path)
		if resource is PackedScene:
			var candidate: Node = resource.instantiate()
			if candidate is Node3D:
				model = candidate
			else:
				candidate.free()
	if model != null:
		var orient := Node3D.new()
		orient.name = "SourceAxisCorrection"
		visual.add_child(orient)
		orient.add_child(model)
		if source_kind == "soldier":
			_filter_personnel_gear(model)
		if kind == "fighter":
			orient.rotation_degrees.x = -90.0
		_collect_meshes(orient)
		if not visual_meshes.is_empty():
			var bounds := _model_bounds(orient, Transform3D.IDENTITY)
			var span := maxf(bounds.size.x, maxf(bounds.size.y, bounds.size.z))
			if span > 0.001:
				var factor := float(stats["size"]) / span
				orient.scale = Vector3.ONE * factor
				orient.position = Vector3(-bounds.get_center().x, -bounds.position.y, -bounds.get_center().z) * factor
				imported_model = true
			_find_animations(model)
		if not imported_model:
			orient.queue_free()
			visual_meshes.clear()
	if not imported_model:
		_create_fallback()
		# Fallback dimensions are metres; the theater uses metres / 100.
		for part in visual_meshes:
			part.scale *= 0.01
			part.position *= 0.01
	overlay = ShaderMaterial.new()
	overlay.shader = FRESNEL
	overlay.set_shader_parameter("team_color", BLUE if team == 0 else RED)
	overlay.set_shader_parameter("strength", 0.11)
	for mesh in visual_meshes:
		mesh.layers = 2 if team == 0 else 4
		# The dummy renderer has no shader material storage in headless runs.
		mesh.material_overlay = overlay if DisplayServer.get_name() != "headless" else null
		mesh.visibility_range_end = 1400.0
		# Keep the authored smooth normals and all source textures.
		for surface in range(mesh.mesh.get_surface_count()):
			var source: Material = mesh.get_active_material(surface)
			if source is StandardMaterial3D:
				var mat: StandardMaterial3D = source.duplicate()
				mat.roughness = maxf(mat.roughness, 0.60)
				mat.metallic = minf(mat.metallic, 0.45)
				mesh.set_surface_override_material(surface, mat)

func _filter_personnel_gear(node: Node) -> void:
	if node is Node3D and str(node.name).begins_with("Gear_"):
		node.visible = str(node.name) == "Gear_" + role
	for child in node.get_children():
		_filter_personnel_gear(child)

func _collect_meshes(node: Node) -> void:
	if node is MeshInstance3D and node.mesh != null:
		visual_meshes.append(node)
	for child in node.get_children():
		_collect_meshes(child)

func _model_bounds(node: Node3D, parent_transform: Transform3D) -> AABB:
	var combined := parent_transform * node.transform
	var result := AABB()
	var has_bounds := false
	if node is MeshInstance3D and node.mesh != null:
		result = combined * node.get_aabb()
		has_bounds = true
	for child in node.get_children():
		if child is Node3D:
			var child_bounds := _model_bounds(child, combined)
			if child_bounds.size.length_squared() > 0.0:
				result = result.merge(child_bounds) if has_bounds else child_bounds
				has_bounds = true
	return result

func _find_animations(node: Node) -> void:
	if node is AnimationPlayer:
		animation_player = node
		for name_in_list in animation_player.get_animation_list():
			var lower := name_in_list.to_lower()
			if "idle" in lower and anim_idle.is_empty():
				anim_idle = name_in_list
			if ("walk" in lower or "run" in lower) and anim_move.is_empty():
				anim_move = name_in_list
		if not anim_idle.is_empty():
			animation_player.play(anim_idle)
	for child in node.get_children():
		_find_animations(child)

func _add_part(mesh: Mesh, pos: Vector3, color: Color) -> MeshInstance3D:
	var part := MeshInstance3D.new()
	part.mesh = mesh
	part.position = pos
	part.material_override = TacticalMap.material(color, 0.78)
	visual.add_child(part)
	visual_meshes.append(part)
	return part

func _box_part(size: Vector3, pos: Vector3, color: Color) -> void:
	var box := BoxMesh.new()
	box.size = size
	_add_part(box, pos, color)

func _create_fallback() -> void:
	var paint := Color("738f96") if team == 0 else Color("a28c7a")
	var dark := Color("34464b")
	if kind in ["soldier", "command"]:
		var body := CapsuleMesh.new()
		body.radius = 0.30
		body.height = 1.3
		_add_part(body, Vector3(0, 0.82, 0), paint)
		var head := SphereMesh.new()
		head.radius = 0.23
		head.height = 0.46
		_add_part(head, Vector3(0, 1.6, 0), dark)
		_box_part(Vector3(0.13, 0.14, 0.8), Vector3(0.3, 1.0, -0.4), dark)
	elif airborne:
		var body := CapsuleMesh.new()
		body.radius = 0.46
		body.height = 5.7
		var body_part := _add_part(body, Vector3(0, 0.7, 0), paint)
		body_part.rotation_degrees.x = 90.0
		_box_part(Vector3(7.0, 0.12, 1.5), Vector3(0, 0.8, 0.2), paint)
		_box_part(Vector3(2.9, 0.13, 0.8), Vector3(0, 1.0, 2.2), paint)
		_box_part(Vector3(0.14, 1.1, 1.1), Vector3(0, 1.4, 2.0), paint)
		var cockpit := SphereMesh.new()
		cockpit.radius = 0.43
		cockpit.height = 0.5
		_add_part(cockpit, Vector3(0, 1.1, -1.3), Color("254e60"))
	else:
		_box_part(Vector3(2.1, 0.85, 3.7), Vector3(0, 0.65, 0), paint)
		_box_part(Vector3(0.48, 0.65, 3.9), Vector3(-1.04, 0.39, 0), dark)
		_box_part(Vector3(0.48, 0.65, 3.9), Vector3(1.04, 0.39, 0), dark)
		_box_part(Vector3(1.3, 0.54, 1.8), Vector3(0, 1.32, -0.2), paint)
		_box_part(Vector3(0.16, 0.16, 2.5), Vector3(0, 1.35, -1.9), dark)

func _create_markers() -> void:
	selection_ring = MeshInstance3D.new()
	var torus := TorusMesh.new()
	var radius := maxf(0.025,float(stats["size"])*0.6)
	torus.inner_radius = radius
	torus.outer_radius = radius + 0.003
	torus.rings = 40
	torus.ring_segments = 6
	selection_ring.mesh = torus
	selection_ring.position.y = 0.002
	var mat := TacticalMap.material(BLUE if team == 0 else RED)
	mat.shading_mode = BaseMaterial3D.SHADING_MODE_UNSHADED
	selection_ring.material_override = mat
	selection_ring.cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_OFF
	selection_ring.visible = false
	add_child(selection_ring)
	team_marker = MeshInstance3D.new()
	var marker := CylinderMesh.new()
	marker.top_radius = 0.008
	marker.bottom_radius = 0.008
	marker.height = 0.0005
	marker.radial_segments = 16
	team_marker.mesh = marker
	team_marker.position = Vector3(0, 0.003, 0)
	team_marker.material_override = mat
	team_marker.cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_OFF
	add_child(team_marker)

func _create_exhaust() -> void:
	exhaust = CPUParticles3D.new()
	exhaust.name = "JetExhaust"
	exhaust.amount = 18
	exhaust.lifetime = 0.34
	exhaust.local_coords = true
	exhaust.position = Vector3(0.0, 0.55, 2.9)
	exhaust.direction = Vector3.BACK
	exhaust.spread = 7.0
	exhaust.initial_velocity_min = 5.0
	exhaust.initial_velocity_max = 9.0
	exhaust.gravity = Vector3.ZERO
	exhaust.scale_amount_min = 0.13
	exhaust.scale_amount_max = 0.24
	var gradient := Gradient.new()
	gradient.set_color(0, Color(0.54, 0.82, 1.0, 0.75))
	gradient.set_color(1, Color(0.16, 0.30, 0.48, 0.0))
	exhaust.color_ramp = gradient
	var particle_mesh := SphereMesh.new()
	particle_mesh.radius = 1.0
	particle_mesh.height = 2.0
	particle_mesh.radial_segments = 8
	particle_mesh.rings = 4
	var mat := StandardMaterial3D.new()
	mat.vertex_color_use_as_albedo = true
	mat.transparency = BaseMaterial3D.TRANSPARENCY_ALPHA
	mat.shading_mode = BaseMaterial3D.SHADING_MODE_UNSHADED
	mat.emission_enabled = true
	mat.emission = Color("719ec6")
	mat.emission_energy_multiplier = 0.45
	particle_mesh.material = mat
	exhaust.mesh = particle_mesh
	exhaust.cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_OFF
	exhaust.scale = Vector3.ONE*0.01
	exhaust.position *= 0.01
	visual.add_child(exhaust)

func set_selected(value: bool) -> void:
	selected = value
	selection_ring.visible = selected and is_alive
	if overlay != null:
		overlay.set_shader_parameter("strength", 0.17 if selected else 0.10)

func move_to(destination: Vector3, attack_move: bool = true) -> bool:
	if not is_alive or role == "COMMAND" or float(stats["speed"]) <= 0.0:
		return false
	if role in SimulationCore.NAVAL:
		var candidate := map.find_maritime_route(position,destination,role == "AMPHIBIOUS_APC")
		if candidate.is_empty():
			order = "NO WATER ROUTE"
			return false
		var recovery := map.maritime_recovery_distance(destination,"BLU" if team == 0 else "RED",role == "AMPHIBIOUS_APC")
		if is_inf(recovery):
			order = "NO FRIENDLY PORT ROUTE"
			return false
		var distance := preload("res://scripts/maritime_navigation.gd").length(position,candidate)+recovery
		var required := 15.0+distance*100.0/float(SimulationCore.OPERATIONAL_RANGE.get(role,100000))*100.0
		if float(core_record.get("fuel",100.0)) < required:
			order = "MISSION FUEL REQUIRED %d%%" % ceili(required)
			return false
		route = candidate
		attack_target = null
		order = "ADVANCE" if attack_move else "MOVE"
		return true
	attack_target = null
	if SimulationCore.is_vehicle(role) and not core_record.is_empty():
		var required := position.distance_to(destination)*100.0/float(SimulationCore.OPERATIONAL_RANGE.get(role,100000))*100.0*2.7+15.0
		if float(core_record.get("fuel",0)) < required:
			order = "MISSION FUEL REQUIRED %d%%" % ceili(required)
			return false
	if airborne:
		route = PackedVector3Array([Vector3(clampf(destination.x, -180, 150), 0, clampf(destination.z, -340, 340))])
	else:
		route = map.find_route(position, destination)
		if route.size() > 1:
			route.remove_at(0)
	order = "ADVANCE" if attack_move else "MOVE"
	if route.is_empty():
		order = "NO ROUTE"
		return false
	return true

func hold() -> void:
	route.clear()
	attack_target = null
	order = "HOLD"

func tick(delta: float, units: Array[CombatUnit], elapsed: float) -> void:
	if not is_alive:
		return
	if not core_record.is_empty():
		var authoritative_hp := float(core_record.get("hp", health))
		if authoritative_hp < health:
			take_damage(health-authoritative_hp)
		elif authoritative_hp > health:
			health = authoritative_hp
		if not is_alive:
			return
	var transport: Dictionary = core_record.get("transport",{})
	var mounted: bool = transport.get("phase","") in ["mounting","seated","dismounting"]
	visual.visible = not mounted
	team_marker.visible = not mounted
	if mounted: return
	var can_operate: bool = not SimulationCore.is_vehicle(role) or (float(core_record.get("fuel",100)) > 0 and core_record.get("service","READY") == "READY")
	var deck_phase: String = core_record.get("maritime",{}).get("phase","moving")
	var can_move: bool = can_operate and (role != "AIRCRAFT_CARRIER" or deck_phase == "moving")
	if role == "AIRCRAFT_CARRIER":
		order = deck_phase.to_upper()
		selection_ring.visible = selected or deck_phase in ["stopping","deploying","deployed","undeploying"]
		selection_ring.scale = Vector3.ONE*(1.0+0.02*sin(elapsed*3.0)) if deck_phase != "moving" else Vector3.ONE
		var deck_mat: StandardMaterial3D = selection_ring.material_override
		deck_mat.albedo_color = Color("9ad7a6") if deck_phase == "deployed" else Color("f7bd6b")
	cooldown = maxf(0.0, float(core_record.get("combat_ready_at",0.0))-float(simulation_core.time)) if simulation_core != null else maxf(0.0, cooldown - delta)
	next_scan -= delta
	if next_scan <= 0.0:
		next_scan = 0.28
		_find_target(units)
	var engaged := is_instance_valid(attack_target) and attack_target.is_alive
	if can_operate and engaged and float(core_record.get("ammo",100)) > 0 and global_position.distance_to(attack_target.global_position) <= float(stats["range"]):
		if simulation_core != null:
			var outcome: Dictionary = simulation_core.resolve_attack("BLU" if team == 0 else "RED",str(core_record.get("id","")),str(attack_target.core_record.get("id","")),global_position.distance_to(attack_target.global_position))
			if bool(outcome.get("fired",false)):
				fired.emit(self, attack_target)
				var target_hp := float(attack_target.core_record.get("hp",attack_target.health))
				if target_hp < attack_target.health:
					attack_target.take_damage(attack_target.health-target_hp)
		else:
			if cooldown <= 0.0:
				cooldown = float(stats["rate"])
				if not core_record.is_empty(): core_record["ammo"] = maxf(0.0,float(core_record["ammo"])-1.0)
				fired.emit(self, attack_target)
				attack_target.take_damage(float(stats["damage"]))
		if route.is_empty():
			_face(attack_target.position - position, delta)
	if can_move and not route.is_empty() and not (engaged and order == "ADVANCE" and not airborne):
		var previous_position := position
		var to_point := route[0] - position
		to_point.y = 0.0
		var step := float(stats["speed"]) * delta
		if to_point.length() <= maxf(step, 0.0025):
			position = route[0]
			route.remove_at(0)
		else:
			position += to_point.normalized() * step
			_face(to_point, delta)
		# Moving the authoritative node would otherwise teleport every visible
		# child. Compensate in local space and interpolate that error to zero.
		presentation_offset += previous_position-position
		if route.is_empty():
			order = "READY"
	if not core_record.is_empty():
		core_record["position"] = position
		core_record["moving"] = can_move and not route.is_empty()
		# SimulationCore owns HP, ammunition, casualties and delayed impacts.
		if simulation_core == null: core_record["hp"] = health
	if airborne:
		var target_altitude := 0.0 if not can_operate else (1.8 if role in ["JET","CAS_FIGHTER","CARGO_PLANE"] else 0.8)
		altitude = move_toward(altitude,target_altitude,delta*0.08)
		visual.position.y = altitude + 0.0014 + sin(elapsed * 1.6 + phase) * 0.002
	if exhaust != null:
		exhaust.emitting = can_move
	if animation_player != null:
		var desired := anim_idle if route.is_empty() else anim_move
		if not desired.is_empty() and animation_player.current_animation != desired:
			animation_player.play(desired, 0.2)

func _face(direction: Vector3, delta: float) -> void:
	if direction.length_squared() > 0.001:
		var previous_yaw := rotation.y
		rotation.y = lerp_angle(rotation.y, atan2(-direction.x, -direction.z), minf(delta * 5.0, 1.0))
		presentation_yaw_offset = wrapf(presentation_yaw_offset+previous_yaw-rotation.y,-PI,PI)

func _find_target(units: Array[CombatUnit]) -> void:
	var weapon: Dictionary = SimulationCore.weapon_for(role)
	if is_instance_valid(attack_target) and attack_target.is_alive and attack_target.team != team:
		if SimulationCore.weapon_can_target(weapon,attack_target.role) and global_position.distance_to(attack_target.global_position) <= float(stats["range"]):
			return
	attack_target = null
	if weapon.is_empty(): return
	var nearest := float(stats["range"])
	for unit in units:
		if unit == self or not unit.is_alive or unit.team == team:
			continue
		if not str(unit.core_record.get("transport",{}).get("carrier","")).is_empty(): continue
		if not SimulationCore.weapon_can_target(weapon,unit.role): continue
		var gap := global_position.distance_to(unit.global_position)
		if gap < nearest:
			nearest = gap
			attack_target = unit

func take_damage(amount: float) -> void:
	if not is_alive:
		return
	health = maxf(0.0, health - amount)
	if not core_record.is_empty(): core_record["hp"] = health
	if health <= 0.0:
		is_alive = false
		order = "LOST"
		route.clear()
		selection_ring.hide()
		team_marker.hide()
		if exhaust != null:
			exhaust.emitting = false
		for mesh in visual_meshes:
			mesh.material_overlay = null
			mesh.material_override = TacticalMap.material(Color("3d4948"), 1.0)
		if airborne:
			visual.position.y = 0.002
			visual.rotation.z = 0.22
		destroyed.emit(self)

func set_fresnel(enabled: bool) -> void:
	for mesh in visual_meshes:
		mesh.material_overlay = overlay if enabled and is_alive and DisplayServer.get_name() != "headless" else null
