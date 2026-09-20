extends Camera3D
class_name RTSCamera

const MIN_DISTANCE := 0.15
const MAX_DISTANCE := 12000.0
var geographic_bounds := Rect2(-400000,-400000,800000,800000)

var focus := Vector3(-5.0, 0.0, 0.0)
var distance := 900.0
var target_distance := 900.0
var yaw := 0.0
var pitch := 0.91
var dragging := false
var drag_mode := 0
var input_enabled := true
var follow_subject: CombatUnit
var follow_heading := 0.0
var follow_orbit_yaw := 0.0
var follow_scale := 1.0
var _followed_id := 0
var _follow_selection_id := 0
var _suppressed_follow_id := 0

func _ready() -> void:
	near = 0.003
	far = 2400.0
	fov = 48.0
	current = true
	_update_pose(1.0)
	# These fill lights affect only unit layers, leaving the map light unchanged.
	for team in range(2):
		var light := DirectionalLight3D.new()
		light.name = "BlueCameraFill" if team == 0 else "RedCameraFill"
		light.light_color = Color("b4d6ef") if team == 0 else Color("f3c8b8")
		light.light_energy = 0.55
		light.light_cull_mask = 2 if team == 0 else 4
		light.shadow_enabled = false
		add_child(light)
		light.rotation_degrees = Vector3(-12.0, -18.0, 0.0)

func _process(delta: float) -> void:
	_sync_selected_subject()
	if input_enabled:
		var axis := Vector2.ZERO
		axis.x = float(Input.is_physical_key_pressed(KEY_D) or Input.is_physical_key_pressed(KEY_RIGHT)) - float(Input.is_physical_key_pressed(KEY_A) or Input.is_physical_key_pressed(KEY_LEFT))
		axis.y = float(Input.is_physical_key_pressed(KEY_S) or Input.is_physical_key_pressed(KEY_DOWN)) - float(Input.is_physical_key_pressed(KEY_W) or Input.is_physical_key_pressed(KEY_UP))
		if axis.length_squared() > 0.0:
			release_follow()
			var right := Vector3(cos(yaw), 0.0, -sin(yaw))
			var back := Vector3(sin(yaw), 0.0, cos(yaw))
			focus += (right * axis.normalized().x + back * axis.normalized().y) * distance * 0.56 * delta
		focus.x = clampf(focus.x, geographic_bounds.position.x, geographic_bounds.end.x)
		focus.z = clampf(focus.z, geographic_bounds.position.y, geographic_bounds.end.y)
	_update_follow(delta)
	_update_pose(delta)

func _unhandled_input(event: InputEvent) -> void:
	if not input_enabled:
		return
	if event is InputEventMouseButton:
		if event.button_index == MOUSE_BUTTON_WHEEL_UP and event.pressed:
			if is_instance_valid(follow_subject):
				follow_scale = maxf(0.6,follow_scale*0.88)
			else:
				target_distance = maxf(MIN_DISTANCE, target_distance * 0.88)
		elif event.button_index == MOUSE_BUTTON_WHEEL_DOWN and event.pressed:
			if is_instance_valid(follow_subject):
				follow_scale = minf(6.0,follow_scale*1.12)
			else:
				target_distance = minf(MAX_DISTANCE, target_distance * 1.12)
		elif event.button_index in [MOUSE_BUTTON_LEFT, MOUSE_BUTTON_MIDDLE, MOUSE_BUTTON_RIGHT]:
			dragging = event.pressed
			# Browser gestures: primary drag pans and secondary drag orbits.
			# Middle drag retains the native Shift-pan shortcut.
			drag_mode = 1 if event.button_index == MOUSE_BUTTON_LEFT or (event.button_index == MOUSE_BUTTON_MIDDLE and event.shift_pressed) else 0
	if event is InputEventMouseMotion and dragging:
		if drag_mode == 1:
			release_follow()
			var right := Vector3(cos(yaw), 0.0, -sin(yaw))
			var back := Vector3(sin(yaw), 0.0, cos(yaw))
			focus -= (right * event.relative.x + back * event.relative.y) * distance * 0.0015
		else:
			var yaw_delta: float = -event.relative.x*0.005
			yaw += yaw_delta
			if is_instance_valid(follow_subject):
				follow_orbit_yaw = wrapf(follow_orbit_yaw+yaw_delta,-PI,PI)
			pitch = clampf(pitch + event.relative.y * 0.004, 0.38, 1.35)

func _sync_selected_subject() -> void:
	var selected: Array[Node] = []
	for candidate in get_tree().get_nodes_in_group("combat_units"):
		if candidate is CombatUnit and candidate.selected and candidate.is_alive and candidate.is_visible_in_tree():
			selected.append(candidate)
	var subject: CombatUnit
	if selected.is_empty():
		_suppressed_follow_id = 0
		_follow_selection_id = 0
	if selected.size() == 1:
		subject = selected[0]
		var selection_id := subject.get_instance_id()
		if selection_id == _suppressed_follow_id:
			return
		var carrier_id := str(subject.core_record.get("transport",{}).get("carrier",""))
		if not carrier_id.is_empty():
			var living_carrier: CombatUnit
			for candidate in get_tree().get_nodes_in_group("combat_units"):
				if candidate is CombatUnit and candidate.is_alive and str(candidate.core_record.get("id","")) == carrier_id:
					living_carrier = candidate
					break
			subject = living_carrier
		if subject == follow_subject and selection_id == _follow_selection_id:
			return
		_follow_selection_id = selection_id
	elif subject == follow_subject:
		return
	follow_subject = subject
	if is_instance_valid(subject):
		_followed_id = subject.get_instance_id()
		follow_heading = subject.presentation_heading()
		follow_orbit_yaw = 0.0
		follow_scale = 1.0
		pitch = 0.40
	else:
		_followed_id = 0
		_follow_selection_id = 0

func _update_follow(delta: float) -> void:
	if not is_instance_valid(follow_subject) or not follow_subject.is_alive:
		return
	var target_heading := follow_subject.presentation_heading()
	follow_heading = lerp_angle(follow_heading,target_heading,1.0-exp(-12.0*minf(delta,0.1)))
	var subject_position := follow_subject.presentation_position()
	var vehicle := SimulationCore.is_vehicle(follow_subject.role)
	var base_distance := 0.06
	if follow_subject.airborne:
		base_distance = 1.10 if follow_subject.role == "CARGO_PLANE" else 0.65 if follow_subject.role in ["JET","CAS_FIGHTER"] else 0.40
	elif vehicle:
		base_distance = 0.15
	follow_scale = clampf(follow_scale,0.6,6.0)
	target_distance = clampf(base_distance*follow_scale,MIN_DISTANCE,MAX_DISTANCE)
	yaw = follow_heading+follow_orbit_yaw
	var forward := Vector3(-sin(follow_heading),0.0,-cos(follow_heading))
	focus = subject_position+forward*(0.02 if vehicle else 0.01)

func release_follow() -> void:
	if _follow_selection_id != 0:
		_suppressed_follow_id = _follow_selection_id
	follow_subject = null
	_followed_id = 0
	_follow_selection_id = 0

func _update_pose(delta: float) -> void:
	distance = lerpf(distance, target_distance, 1.0 - exp(-10.0 * delta))
	# Keep enough depth precision for geographic road/water layers separated by centimetres.
	# The ground is always farther than half the orbit distance inside this pitch range.
	near = maxf(0.003,distance*0.25)
	far = maxf(2400.0,distance*4.0)
	position = focus + Vector3(sin(yaw) * cos(pitch), sin(pitch), cos(yaw) * cos(pitch)) * distance
	look_at(focus, Vector3.UP)

func ground_point(screen_point: Vector2) -> Variant:
	return Plane(Vector3.UP, 0.0).intersects_ray(project_ray_origin(screen_point), project_ray_normal(screen_point))

func focus_at(point: Vector3) -> void:
	release_follow()
	focus = point

func set_geographic_bounds(northwest: Vector3, southeast: Vector3) -> void:
	geographic_bounds = Rect2(Vector2(northwest.x,northwest.z),Vector2(southeast.x-northwest.x,southeast.z-northwest.z)).abs()
