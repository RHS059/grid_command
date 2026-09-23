extends Control
## One renderer, shared production models, and a scrollable grid of turntables.

const Catalog = preload("res://scripts/native_workspaces.gd")
const Factory = preload("res://scripts/browser_model_factory.gd")
const Dimensions = preload("res://scripts/model_dimensions.gd")
const CameraMotion = preload("res://scripts/preview_camera_motion.gd")
const EXTRA_NAMES := {"FUEL_TRUCK":"HEMTT fuel tanker", "TROOP_HEMTT":"HEMTT troop transport", "MEDICAL_HEMTT":"HEMTT medical", "REPAIR_HEMTT":"HEMTT recovery", "FOB_HEMTT":"HEMTT mobile base"}
var world
var viewport: SubViewport
var camera: Camera3D
var stage: Node3D
var content: Control
var cards: Control
var scrollbar: VScrollBar
var title: Label
var close_focus: Button
var entries: Array[Dictionary] = []
var selected := -1
var team := 0
var columns := 4
var cell_size := Vector2(280,240)
var yaw := 0.6
var pitch := 0.25
var distance := 4.8
var dragging := false
var panning := false
var focus_target := Vector3.ZERO
var move_keys: Dictionary = {}
var focus_radius := 1.0
var hint: Label
var focus_grid: MeshInstance3D
var built := false
var return_scroll := 0.0

func setup(game_world) -> void:
	world = game_world
	set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	mouse_filter = Control.MOUSE_FILTER_STOP
	theme = Theme.new()
	theme.default_font = load("res://assets/fonts/Archivo.ttf")
	theme.default_font_size = 13
	var bg := ColorRect.new()
	bg.color = Color("101821")
	bg.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	add_child(bg)
	var header := HBoxContainer.new()
	header.set_anchors_and_offsets_preset(Control.PRESET_TOP_WIDE)
	header.offset_left = 20; header.offset_right = -20
	header.offset_top = 14; header.offset_bottom = 54
	header.add_theme_constant_override("separation",16)
	add_child(header)
	_button(header,"← Battlefield",func(): world.open_battlefield())
	title = Label.new(); title.text = "MODEL PREVIEW GALLERY"
	title.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	header.add_child(title)
	var faction := OptionButton.new()
	faction.add_item("BLUFOR"); faction.add_item("REDFOR")
	faction.item_selected.connect(_change_team)
	header.add_child(faction)
	close_focus = _button(header,"X",_return_to_grid)
	close_focus.tooltip_text = "Return to the model grid (Escape)"
	close_focus.custom_minimum_size.x = 44
	close_focus.hide()
	content = Control.new()
	content.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	content.offset_top = 66; content.offset_bottom = -30
	content.clip_contents = true
	add_child(content)
	var container := SubViewportContainer.new()
	container.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	container.stretch = true
	container.mouse_filter = Control.MOUSE_FILTER_IGNORE
	content.add_child(container)
	viewport = SubViewport.new()
	viewport.own_world_3d = true
	viewport.render_target_update_mode = SubViewport.UPDATE_DISABLED
	container.add_child(viewport)
	stage = Node3D.new(); viewport.add_child(stage)
	var environment := WorldEnvironment.new()
	var env := Environment.new()
	env.background_mode = Environment.BG_COLOR
	env.background_color = Color("182630")
	env.ambient_light_source = Environment.AMBIENT_SOURCE_COLOR
	env.ambient_light_color = Color("e0e5e9"); env.ambient_light_energy = 0.7
	environment.environment = env; stage.add_child(environment)
	var light := DirectionalLight3D.new()
	light.rotation_degrees = Vector3(-40,-35,0); light.light_energy = 1.1
	stage.add_child(light)
	camera = Camera3D.new(); camera.fov = 40; camera.far = 200
	stage.add_child(camera)
	focus_grid = MeshInstance3D.new(); stage.add_child(focus_grid); focus_grid.hide()
	var grid_material := StandardMaterial3D.new()
	grid_material.shading_mode = BaseMaterial3D.SHADING_MODE_UNSHADED
	grid_material.albedo_color = Color("496376")
	focus_grid.material_override = grid_material
	cards = Control.new(); cards.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	cards.mouse_filter = Control.MOUSE_FILTER_IGNORE; content.add_child(cards)
	scrollbar = VScrollBar.new()
	scrollbar.set_anchors_and_offsets_preset(Control.PRESET_RIGHT_WIDE)
	scrollbar.offset_left = -14
	scrollbar.value_changed.connect(func(_value): _layout())
	content.add_child(scrollbar)
	content.gui_input.connect(_input_view)
	content.resized.connect(_layout)
	hint = Label.new()
	hint.text = "Click a model to inspect · Scroll to browse"
	hint.set_anchors_and_offsets_preset(Control.PRESET_BOTTOM_WIDE)
	hint.offset_top = -27; hint.offset_left = 20
	hint.add_theme_color_override("font_color", Color("9aafb9"))
	hint.mouse_filter = Control.MOUSE_FILTER_IGNORE; add_child(hint)
	hide()

func _button(parent: Node, caption: String, callback: Callable) -> Button:
	var button := Button.new(); button.text = caption
	button.pressed.connect(callback); parent.add_child(button)
	return button

func show_gallery() -> void:
	show()
	viewport.render_target_update_mode = SubViewport.UPDATE_ALWAYS
	if not built: _build_catalog()
	_layout()

func hide_gallery() -> void:
	hide(); dragging = false; panning = false; move_keys.clear()
	viewport.render_target_update_mode = SubViewport.UPDATE_DISABLED

func _build_catalog() -> void:
	var names: Dictionary = Catalog.MODEL_NAMES.duplicate()
	names.merge(EXTRA_NAMES)
	for id in names:
		_add_entry(id,names[id],false)
		if id in ["MEDICAL_HEMTT","REPAIR_HEMTT","FOB_HEMTT"]:
			_add_entry(id,names[id]+" · deployed",true)
	built = true

func _add_entry(id: String, caption: String, deployed: bool) -> void:
	var pivot := Node3D.new(); stage.add_child(pivot)
	var button := Button.new(); button.text = ""
	var border := StyleBoxFlat.new()
	border.bg_color = Color(0,0,0,0)
	border.border_color = Color("8ca5b32b"); border.set_border_width_all(1)
	border.set_corner_radius_all(8)
	button.add_theme_stylebox_override("normal",border)
	var hover: StyleBoxFlat = border.duplicate()
	hover.border_color = Color("73b6e8"); hover.bg_color = Color(0.2,0.4,0.6,0.08)
	button.add_theme_stylebox_override("hover",hover)
	button.mouse_filter = Control.MOUSE_FILTER_PASS
	button.pressed.connect(_focus.bind(entries.size()))
	cards.add_child(button)
	var label := Label.new(); label.text = caption
	label.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	label.set_anchors_and_offsets_preset(Control.PRESET_BOTTOM_WIDE)
	label.offset_top = -36; label.offset_bottom = -10
	label.mouse_filter = Control.MOUSE_FILTER_IGNORE; button.add_child(label)
	var entry := {"id":id,"caption":caption,"pivot":pivot,"card":button,"label":label,"deployed":deployed,"model":null}
	entries.append(entry)
	_populate(entry)

func _populate(entry: Dictionary) -> void:
	var id: String = entry.id
	var pivot: Node3D = entry.pivot
	for child in pivot.get_children():
		pivot.remove_child(child); child.queue_free()
	var model: Node3D = Factory.create(id,team)
	var file: String = Catalog.MODEL_FILES.get(id,id.to_lower())
	if model == null:
		var path := "res://assets/models/"+file+".glb"
		if ResourceLoader.exists(path):
			var packed: PackedScene = load(path)
			model = packed.instantiate()
	entry.model = model
	if model == null:
		entry.label.text = entry.caption+"\nAsset unavailable"
		return
	var motor_root := Node3D.new(); pivot.add_child(motor_root)
	entry.motor_root = motor_root
	entry.motor = preload("res://scripts/engine_boil.gd").new("gallery:"+id)
	var centered := Node3D.new(); motor_root.add_child(centered); centered.add_child(model)
	if id == "TANK":
		preload("res://scripts/tank_material.gd").apply(model)
		var stowage := preload("res://scripts/vehicle_greebles.gd").new()
		model.add_child(stowage); stowage.build_tank_stowage(model)
	preload("res://scripts/ground_vehicle_material.gd").apply(model,team,file)
	preload("res://scripts/air_naval_material.gd").apply(model,file,team)
	preload("res://scripts/naval_material.gd").apply(model,file,team)
	preload("res://scripts/personnel_animations.gd").install(model,file)
	preload("res://scripts/personnel_equipment.gd").attach(model,id)
	if file in Catalog.Z_UP_MODEL_FILES: model.rotation_degrees.x = -90
	if file == "soldier": _filter_gear(model,id)
	if id not in ["MOB","AIRFIELD"] and DisplayServer.get_name() != "headless":
		var rim := ShaderMaterial.new(); rim.shader = preload("res://shaders/unit_fresnel.gdshader")
		rim.set_shader_parameter("rim_color",Color.WHITE); rim.set_shader_parameter("strength",0.5)
		_apply_rim(model,rim)
	var bounds := _bounds(model,Transform3D.IDENTITY)
	# Determine scale from the stowed body so deploying a mast cannot shrink its truck.
	var factor := Dimensions.scale_factor(id,bounds.size)
	if entry.deployed:
		preload("res://scripts/browser_support_models.gd").set_deployed(model,true)
		bounds = _bounds(model,Transform3D.IDENTITY)
	centered.scale = Vector3.ONE * factor
	centered.position = -bounds.get_center() * factor
	entry.span = maxf(0.001,maxf(bounds.size.x,maxf(bounds.size.y,bounds.size.z))*factor)
	entry.radius = maxf(0.1,bounds.size.length()*factor*0.5)
	entry.height = bounds.size.y*factor
	entry.label.text = entry.caption+" · "+Dimensions.label(id)

func _filter_gear(node: Node, role: String) -> void:
	if node is Node3D and str(node.name).begins_with("Gear_"): node.visible = str(node.name) == "Gear_"+role
	for child in node.get_children(): _filter_gear(child,role)

func _apply_rim(node: Node, material: Material) -> void:
	if node is MeshInstance3D: node.material_overlay = material
	for child in node.get_children(): _apply_rim(child,material)

func _bounds(node: Node3D, parent_transform: Transform3D) -> AABB:
	if not node.visible: return AABB()
	var transform := parent_transform*node.transform
	var result := AABB()
	if node is MeshInstance3D: result = transform*node.get_aabb()
	for child in node.get_children():
		if child is Node3D:
			var next := _bounds(child,transform)
			if next.size.length_squared() > 0: result = next if result.size.length_squared() == 0 else result.merge(next)
	return result

func _change_team(value: int) -> void:
	team = value
	for entry in entries: _populate(entry)
	_layout()

func _layout() -> void:
	if not is_instance_valid(camera) or content.size.x < 1 or content.size.y < 1: return
	if selected >= 0:
		_update_focus_camera(); return
	columns = maxi(1,int((content.size.x-30)/270.0))
	cell_size = Vector2((content.size.x-30)/columns,240)
	var pixels_per_unit := cell_size.x/3.5
	var total_height := ceilf(float(entries.size())/columns)*cell_size.y
	scrollbar.max_value = maxf(total_height,content.size.y)
	scrollbar.page = content.size.y
	scrollbar.visible = total_height > content.size.y
	camera.projection = Camera3D.PROJECTION_ORTHOGONAL
	camera.near = 0.05; camera.far = 200
	camera.size = content.size.y/pixels_per_unit
	camera.rotation = Vector3.ZERO
	camera.position = Vector3(content.size.x/(2*pixels_per_unit),-(content.size.y/2+scrollbar.value)/pixels_per_unit,30)
	for index in entries.size():
		var entry: Dictionary = entries[index]
		var card: Button = entry.card
		card.position = Vector2((index%columns)*cell_size.x+8,(index/columns)*cell_size.y-scrollbar.value+6)
		card.size = cell_size-Vector2(12,12)
		var pivot: Node3D = entry.pivot
		# Thumbnail presentation only. Focused scenes retain the canonical metre scale.
		pivot.scale = Vector3.ONE*(2.5/float(entry.get("span",2.5)))
		pivot.position = Vector3((float(index%columns)+0.5)*cell_size.x/pixels_per_unit,-((index/columns)*cell_size.y+cell_size.y*0.45)/pixels_per_unit,0)
		pivot.rotation.x = 0.25
		pivot.visible = card.position.y+cell_size.y > 0 and card.position.y < content.size.y

func _focus(index: int) -> void:
	selected = index; return_scroll = scrollbar.value
	cards.hide(); scrollbar.hide(); close_focus.show()
	title.text = entries[index].caption
	for i in entries.size(): entries[i].pivot.visible = i == index
	var pivot: Node3D = entries[index].pivot
	pivot.position = Vector3.ZERO; pivot.rotation = Vector3.ZERO; pivot.scale = Vector3.ONE
	focus_radius = float(entries[index].get("radius",1.0))
	focus_target = Vector3.ZERO; move_keys.clear(); dragging = false; panning = false
	yaw = 0.6; pitch = 0.25
	var aspect := maxf(0.1,content.size.x/maxf(1.0,content.size.y))
	var half_fov := atan(tan(deg_to_rad(camera.fov*0.5))*minf(1.0,aspect))
	distance = focus_radius/sin(half_fov)*1.1
	var spacing := Dimensions.grid_spacing(float(entries[index].get("span",1.0)))
	var extent := maxf(5.0,ceil(focus_radius*3.0/spacing)*spacing)
	var mesh := ImmediateMesh.new(); mesh.surface_begin(Mesh.PRIMITIVE_LINES)
	for line in range(-int(extent/spacing),int(extent/spacing)+1):
		var coordinate := line*spacing
		mesh.surface_add_vertex(Vector3(coordinate,0,-extent)); mesh.surface_add_vertex(Vector3(coordinate,0,extent))
		mesh.surface_add_vertex(Vector3(-extent,0,coordinate)); mesh.surface_add_vertex(Vector3(extent,0,coordinate))
	mesh.surface_end(); focus_grid.mesh = mesh
	focus_grid.position.y = -float(entries[index].get("height",1.0))*0.5-0.01
	focus_grid.show()
	hint.text = Dimensions.label(entries[index].id)+" · Grid: "+str(spacing)+" m · WASD move · Shift faster · Drag orbit · Right-drag pan · Wheel zoom · Esc returns"
	_update_focus_camera()

func _return_to_grid() -> void:
	selected = -1; dragging = false; panning = false; move_keys.clear()
	focus_grid.hide()
	hint.text = "Click a model to inspect · Scroll to browse"
	title.text = "MODEL PREVIEW GALLERY"
	cards.show(); close_focus.hide(); scrollbar.value = return_scroll
	_layout()

func _update_focus_camera() -> void:
	camera.projection = Camera3D.PROJECTION_PERSPECTIVE
	camera.near = maxf(0.015,focus_radius/100.0)
	camera.far = maxf(200.0,distance+focus_radius*50.0)
	camera.position = focus_target+Vector3(sin(yaw)*cos(pitch),sin(pitch),cos(yaw)*cos(pitch))*distance
	camera.look_at(focus_target)

func _input_view(event: InputEvent) -> void:
	if event is InputEventMouseButton:
		if selected >= 0 and event.button_index in [MOUSE_BUTTON_LEFT,MOUSE_BUTTON_MIDDLE,MOUSE_BUTTON_RIGHT]:
			dragging = event.pressed
			panning = event.button_index != MOUSE_BUTTON_LEFT or event.shift_pressed
			if event.pressed:
				var owner := get_viewport().gui_get_focus_owner()
				if owner != null: owner.release_focus()
			accept_event()
		if event.pressed and event.button_index in [MOUSE_BUTTON_WHEEL_UP,MOUSE_BUTTON_WHEEL_DOWN]:
			var direction := -1.0 if event.button_index == MOUSE_BUTTON_WHEEL_UP else 1.0
			if selected >= 0:
				distance = clampf(distance*pow(1.12,direction),focus_radius*0.3,focus_radius*30.0)
				_update_focus_camera()
			else: scrollbar.value += direction*90
			accept_event()
	if event is InputEventMouseMotion and dragging and selected >= 0:
		if panning: focus_target += CameraMotion.pan(event.relative,camera.basis,distance,camera.fov,content.size.y)
		else:
			yaw -= event.relative.x*0.008
			pitch = clampf(pitch+event.relative.y*0.008,-1.4,1.4)
		_update_focus_camera(); accept_event()

func _input(event: InputEvent) -> void:
	if not visible: return
	if event is InputEventKey and selected >= 0 and CameraMotion.is_move_key(event.physical_keycode):
		if event.pressed and not event.ctrl_pressed and not event.alt_pressed and not event.meta_pressed and get_viewport().gui_get_focus_owner() == null:
			move_keys[event.physical_keycode] = true
			get_viewport().set_input_as_handled()
		elif not event.pressed: move_keys.erase(event.physical_keycode)
	if event is InputEventKey and event.pressed and event.physical_keycode == KEY_ESCAPE:
		if selected >= 0: _return_to_grid()
		else: world.open_battlefield()
		get_viewport().set_input_as_handled()
	if event is InputEventMouseButton and not event.pressed and event.button_index in [MOUSE_BUTTON_LEFT,MOUSE_BUTTON_MIDDLE,MOUSE_BUTTON_RIGHT]: dragging = false

func _notification(what: int) -> void:
	if what == NOTIFICATION_APPLICATION_FOCUS_OUT:
		move_keys.clear(); dragging = false

func _process(delta: float) -> void:
	if not visible: return
	if selected >= 0:
		if get_viewport().gui_get_focus_owner() != null: move_keys.clear()
		var motion := CameraMotion.movement(move_keys,camera.basis,delta,distance)
		if motion.length_squared() > 0:
			focus_target += motion
			_update_focus_camera()
	for entry in entries:
		if not entry.pivot.visible: continue
		if selected < 0: entry.pivot.rotation.y += delta*0.16
		if entry.has("motor_root"):
			entry.motor_root.transform = entry.motor.sample(entry.id,delta,not entry.deployed,false,true,float(entry.get("span",2.5)))

