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
	if input_enabled:
		var axis := Vector2.ZERO
		axis.x = float(Input.is_physical_key_pressed(KEY_D) or Input.is_physical_key_pressed(KEY_RIGHT)) - float(Input.is_physical_key_pressed(KEY_A) or Input.is_physical_key_pressed(KEY_LEFT))
		axis.y = float(Input.is_physical_key_pressed(KEY_S) or Input.is_physical_key_pressed(KEY_DOWN)) - float(Input.is_physical_key_pressed(KEY_W) or Input.is_physical_key_pressed(KEY_UP))
		if axis.length_squared() > 0.0:
			var right := Vector3(cos(yaw), 0.0, -sin(yaw))
			var back := Vector3(sin(yaw), 0.0, cos(yaw))
			focus += (right * axis.normalized().x + back * axis.normalized().y) * distance * 0.56 * delta
		focus.x = clampf(focus.x, geographic_bounds.position.x, geographic_bounds.end.x)
		focus.z = clampf(focus.z, geographic_bounds.position.y, geographic_bounds.end.y)
	_update_pose(delta)

func _unhandled_input(event: InputEvent) -> void:
	if not input_enabled:
		return
	if event is InputEventMouseButton:
		if event.button_index == MOUSE_BUTTON_WHEEL_UP and event.pressed:
			target_distance = maxf(MIN_DISTANCE, target_distance * 0.88)
		elif event.button_index == MOUSE_BUTTON_WHEEL_DOWN and event.pressed:
			target_distance = minf(MAX_DISTANCE, target_distance * 1.12)
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
	# Keep enough depth precision for geographic road/water layers separated by centimetres.
	# The ground is always farther than half the orbit distance inside this pitch range.
	near = maxf(0.003,distance*0.25)
	far = maxf(2400.0,distance*4.0)
	position = focus + Vector3(sin(yaw) * cos(pitch), sin(pitch), cos(yaw) * cos(pitch)) * distance
	look_at(focus, Vector3.UP)

func ground_point(screen_point: Vector2) -> Variant:
	return Plane(Vector3.UP, 0.0).intersects_ray(project_ray_origin(screen_point), project_ray_normal(screen_point))

func focus_at(point: Vector3) -> void:
	focus = point

func set_geographic_bounds(northwest: Vector3, southeast: Vector3) -> void:
	geographic_bounds = Rect2(Vector2(northwest.x,northwest.z),Vector2(southeast.x-northwest.x,southeast.z-northwest.z)).abs()
