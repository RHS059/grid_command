extends Camera3D
class_name RTSCamera

var focus := Vector3(7.0, 0.0, 12.0)
var distance := 113.0
var target_distance := 113.0
var yaw := -0.25
var pitch := 0.91
var dragging := false
var drag_mode := 0
var input_enabled := true

func _ready() -> void:
	near = 0.4
	far = 700.0
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
	if input_enabled:
		var axis := Vector2.ZERO
		axis.x = float(Input.is_physical_key_pressed(KEY_D) or Input.is_physical_key_pressed(KEY_RIGHT)) - float(Input.is_physical_key_pressed(KEY_A) or Input.is_physical_key_pressed(KEY_LEFT))
		axis.y = float(Input.is_physical_key_pressed(KEY_S) or Input.is_physical_key_pressed(KEY_DOWN)) - float(Input.is_physical_key_pressed(KEY_W) or Input.is_physical_key_pressed(KEY_UP))
		if axis.length_squared() > 0.0:
			var right := Vector3(cos(yaw), 0.0, -sin(yaw))
			var back := Vector3(sin(yaw), 0.0, cos(yaw))
			focus += (right * axis.normalized().x + back * axis.normalized().y) * distance * 0.56 * delta
		focus.x = clampf(focus.x, -75.0, 86.0)
		focus.z = clampf(focus.z, -80.0, 85.0)
	_update_pose(delta)

func _unhandled_input(event: InputEvent) -> void:
	if not input_enabled:
		return
	if event is InputEventMouseButton:
		if event.button_index == MOUSE_BUTTON_WHEEL_UP and event.pressed:
			target_distance = maxf(22.0, target_distance * 0.88)
		elif event.button_index == MOUSE_BUTTON_WHEEL_DOWN and event.pressed:
			target_distance = minf(190.0, target_distance * 1.12)
		elif event.button_index == MOUSE_BUTTON_MIDDLE:
			dragging = event.pressed
			drag_mode = 1 if event.shift_pressed else 0
	if event is InputEventMouseMotion and dragging:
		if drag_mode == 1:
			var right := Vector3(cos(yaw), 0.0, -sin(yaw))
			var back := Vector3(sin(yaw), 0.0, cos(yaw))
			focus -= (right * event.relative.x + back * event.relative.y) * distance * 0.0015
		else:
			yaw -= event.relative.x * 0.005
			pitch = clampf(pitch + event.relative.y * 0.004, 0.38, 1.35)

func _update_pose(delta: float) -> void:
	distance = lerpf(distance, target_distance, 1.0 - exp(-10.0 * delta))
	position = focus + Vector3(sin(yaw) * cos(pitch), sin(pitch), cos(yaw) * cos(pitch)) * distance
	look_at(focus, Vector3.UP)

func ground_point(screen_point: Vector2) -> Variant:
	return Plane(Vector3.UP, 0.0).intersects_ray(project_ray_origin(screen_point), project_ray_normal(screen_point))

func focus_at(point: Vector3) -> void:
	focus = Vector3(point.x, 0.0, point.z)
