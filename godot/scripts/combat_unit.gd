extends Node3D
class_name CombatUnit

signal fired(unit: CombatUnit, target: CombatUnit)
signal destroyed(unit: CombatUnit)

const FRESNEL = preload("res://shaders/unit_fresnel.gdshader")
const BLUE := Color("66b9ec")
const RED := Color("e98d79")
const SPECS := {
	"tank": {"name": "MAIN BATTLE TANK", "size": 4.7, "speed": 5.5, "health": 160.0, "range": 25.0, "damage": 24.0, "rate": 2.2},
	"apc": {"name": "ARMORED CARRIER", "size": 4.3, "speed": 7.5, "health": 110.0, "range": 20.0, "damage": 10.0, "rate": 1.0},
	"troop_transport": {"name": "TROOP TRANSPORT", "size": 4.6, "speed": 8.2, "health": 85.0, "range": 16.0, "damage": 6.0, "rate": 1.0},
	"soldier": {"name": "INFANTRY TEAM", "size": 1.7, "speed": 4.0, "health": 65.0, "range": 16.0, "damage": 5.0, "rate": 0.7},
	"fighter": {"name": "FIGHTER", "size": 8.2, "speed": 16.0, "health": 100.0, "range": 30.0, "damage": 13.0, "rate": 1.8},
	"vtol_attack": {"name": "ATTACK HELICOPTER", "size": 6.1, "speed": 10.0, "health": 100.0, "range": 24.0, "damage": 10.0, "rate": 1.4}
}

var kind := "tank"
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

func _ready() -> void:
	stats = SPECS.get(kind, SPECS["tank"])
	max_health = float(stats["health"])
	health = max_health
	airborne = kind in ["fighter", "vtol_attack"]
	altitude = 10.0 if kind == "fighter" else 7.0 if airborne else 0.0
	phase = float(get_instance_id() % 100) * 0.1
	visual = Node3D.new()
	visual.name = "UnitVisual"
	visual.position.y = altitude + 0.14
	add_child(visual)
	_create_model()
	_create_markers()
	if kind == "fighter":
		_create_exhaust()

func _create_model() -> void:
	var path := "res://assets/models/" + kind + ".glb"
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
	overlay = ShaderMaterial.new()
	overlay.shader = FRESNEL
	overlay.set_shader_parameter("team_color", BLUE if team == 0 else RED)
	overlay.set_shader_parameter("strength", 0.11)
	for mesh in visual_meshes:
		mesh.layers = 2 if team == 0 else 4
		# The dummy renderer has no shader material storage in headless runs.
		mesh.material_overlay = overlay if DisplayServer.get_name() != "headless" else null
		mesh.visibility_range_end = 310.0
		# Keep the authored smooth normals and all source textures.
		for surface in range(mesh.mesh.get_surface_count()):
			var source: Material = mesh.get_active_material(surface)
			if source is StandardMaterial3D:
				var mat: StandardMaterial3D = source.duplicate()
				mat.roughness = maxf(mat.roughness, 0.60)
				mat.metallic = minf(mat.metallic, 0.45)
				mat.albedo_color = mat.albedo_color.lerp(BLUE if team == 0 else RED, 0.07)
				mesh.set_surface_override_material(surface, mat)

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
	if kind == "soldier":
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
	var radius := 1.1 if kind == "soldier" else 2.8 if airborne else 2.1
	torus.inner_radius = radius
	torus.outer_radius = radius + 0.13
	torus.rings = 40
	torus.ring_segments = 6
	selection_ring.mesh = torus
	selection_ring.position.y = 0.18
	var mat := TacticalMap.material(BLUE if team == 0 else RED)
	mat.shading_mode = BaseMaterial3D.SHADING_MODE_UNSHADED
	selection_ring.material_override = mat
	selection_ring.cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_OFF
	selection_ring.visible = false
	add_child(selection_ring)
	team_marker = MeshInstance3D.new()
	var marker := CylinderMesh.new()
	marker.top_radius = 0.42
	marker.bottom_radius = 0.42
	marker.height = 0.045
	marker.radial_segments = 16
	team_marker.mesh = marker
	team_marker.position = Vector3(0, 0.15, 0)
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
	visual.add_child(exhaust)

func set_selected(value: bool) -> void:
	selected = value
	selection_ring.visible = selected and is_alive
	if overlay != null:
		overlay.set_shader_parameter("strength", 0.17 if selected else 0.10)

func move_to(destination: Vector3, attack_move: bool = true) -> bool:
	if not is_alive:
		return false
	attack_target = null
	if airborne:
		route = PackedVector3Array([Vector3(clampf(destination.x, -86, 86), 0, clampf(destination.z, -84, 84))])
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
	cooldown = maxf(0.0, cooldown - delta)
	next_scan -= delta
	if next_scan <= 0.0:
		next_scan = 0.28
		_find_target(units)
	var engaged := is_instance_valid(attack_target) and attack_target.is_alive
	if engaged and global_position.distance_to(attack_target.global_position) <= float(stats["range"]):
		if cooldown <= 0.0:
			cooldown = float(stats["rate"])
			fired.emit(self, attack_target)
			attack_target.take_damage(float(stats["damage"]))
		if route.is_empty():
			_face(attack_target.position - position, delta)
	if not route.is_empty() and not (engaged and order == "ADVANCE" and not airborne):
		var to_point := route[0] - position
		to_point.y = 0.0
		var step := float(stats["speed"]) * delta
		if to_point.length() <= maxf(step, 0.25):
			position = route[0]
			route.remove_at(0)
		else:
			position += to_point.normalized() * step
			_face(to_point, delta)
		if route.is_empty():
			order = "READY"
	if airborne:
		visual.position.y = altitude + 0.14 + sin(elapsed * 1.6 + phase) * 0.20
	if exhaust != null:
		exhaust.emitting = true
	if animation_player != null:
		var desired := anim_idle if route.is_empty() else anim_move
		if not desired.is_empty() and animation_player.current_animation != desired:
			animation_player.play(desired, 0.2)

func _face(direction: Vector3, delta: float) -> void:
	if direction.length_squared() > 0.001:
		rotation.y = lerp_angle(rotation.y, atan2(-direction.x, -direction.z), minf(delta * 5.0, 1.0))

func _find_target(units: Array[CombatUnit]) -> void:
	if is_instance_valid(attack_target) and attack_target.is_alive and attack_target.team != team:
		if global_position.distance_to(attack_target.global_position) <= float(stats["range"]):
			return
	attack_target = null
	var nearest := float(stats["range"])
	for unit in units:
		if unit == self or not unit.is_alive or unit.team == team:
			continue
		# Infantry and ground carriers cannot engage aircraft in this slice.
		if unit.airborne and not airborne:
			continue
		var gap := global_position.distance_to(unit.global_position)
		if gap < nearest:
			nearest = gap
			attack_target = unit

func take_damage(amount: float) -> void:
	if not is_alive:
		return
	health = maxf(0.0, health - amount)
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
			visual.position.y = 0.2
			visual.rotation.z = 0.22
		destroyed.emit(self)

func set_fresnel(enabled: bool) -> void:
	for mesh in visual_meshes:
		mesh.material_overlay = overlay if enabled and is_alive and DisplayServer.get_name() != "headless" else null
