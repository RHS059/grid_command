extends Control
class_name NativeWorkspaces

signal closed

const MODEL_NAMES := {
  "PATROL_BOAT":"Patrol boat", "FRIGATE":"Missile cruiser", "AIRCRAFT_CARRIER":"Aircraft carrier", "LANDING_CRAFT":"Landing craft", "AMPHIBIOUS_APC":"Amphibious APC",
  "FORKLIFT":"Supply forklift", "CARGO_PLANE":"Tactical cargo plane", "UAV_JAMMER":"UAV jammer", "AA_TEAM":"Anti-air launcher team", "TRANSPORT_HELI":"Troop transport helicopter", "HEAVY_LIFT_HELI":"Heavy-lift helicopter", "TROOP_TRUCK":"Light troop carrier",
  "RIFLE":"Rifle squad", "SCOUT":"Scout team", "MG":"Machine gun team", "AT":"Anti-tank team", "MORTAR":"Mortar team", "ENGINEER":"Combat engineer", "MEDIC":"Combat medic", "LOGISTICS":"Logistics team", "TANK":"Main battle tank", "PILOT":"Pilot", "COMMAND":"Command officer", "TRUCK":"Supply truck", "RECON_UAV":"Reconnaissance UAV", "APC":"Armored personnel carrier", "CANNON_APC":"Cannon APC", "IFV":"Infantry fighting vehicle", "CAS_FIGHTER":"CAS fighter", "JET":"FQ-44 Fury strike fighter", "ATTACK_HELI":"Attack helicopter", "MOB":"Main operating base", "AIRFIELD":"Airfield compound",}
const MODEL_FILES := {"COMMAND":"soldier","RIFLE":"soldier","SCOUT":"soldier","MG":"soldier","AT":"soldier","MORTAR":"soldier","ENGINEER":"soldier","MEDIC":"soldier","LOGISTICS":"soldier","PILOT":"soldier","AA_TEAM":"soldier","TANK":"tank","APC":"apc","CANNON_APC":"cannon_apc","IFV":"ifv","AMPHIBIOUS_APC":"amphibious_apc","TROOP_TRUCK":"troop_transport","TRUCK":"truck","CAS_FIGHTER":"cas","JET":"fighter","ATTACK_HELI":"vtol_attack","TRANSPORT_HELI":"transport_heli","HEAVY_LIFT_HELI":"vtol_cargo","CARGO_PLANE":"cargo_plane","RECON_UAV":"recon_uav","AIRCRAFT_CARRIER":"aircraft_carrier","FRIGATE":"missile_cruiser","PATROL_BOAT":"patrol_boat","LANDING_CRAFT":"landing_craft","FORKLIFT":"forklift","UAV_JAMMER":"uav_jammer","MOB":"mob","AIRFIELD":"airfield"}
const Z_UP_MODEL_FILES := ["fighter","troop_transport","vtol_attack","vtol_cargo"]
var world
var viewport: SubViewport
var scene: Node3D
var camera: Camera3D
var model_root: Node3D
var model: Node3D
var preview_greebles: VehicleGreebles
var preview_tank_fire: TankFireEffects
var fire_cannon_button: Button
var _previous_clip := ""
var _previous_clip_time := -1.0
var animation: AnimationPlayer
var clips: OptionButton
var model_title: Label
var catalog: VBoxContainer
var model_page: Control
var sfx_page: Control
var sound_controls: VBoxContainer
var player: AudioStreamPlayer
var sound_bank: Dictionary = {}
var sound_key := ""
var yaw := 0.6
var pitch := 0.32
var distance := 5.0
var auto_rotate := false
var drag := false
var team := 0
var material_overlay: ShaderMaterial
var animation_progress: HSlider
var updating_progress := false
var sound_status: Label
var master_volume := 0.7
var selected_model := "CANNON_APC"

func setup(game_world) -> void:
	world = game_world
	set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	mouse_filter = Control.MOUSE_FILTER_STOP
	var native_theme := Theme.new()
	native_theme.default_font = load("res://assets/fonts/Archivo.ttf")
	native_theme.default_font_size = 12
	var button_style := StyleBoxFlat.new()
	button_style.bg_color = Color("ffffff0b")
	button_style.border_color = Color("c7d8ea33")
	button_style.set_border_width_all(1)
	button_style.set_corner_radius_all(6)
	button_style.content_margin_left = 10
	button_style.content_margin_right = 10
	var hover_style: StyleBoxFlat = button_style.duplicate()
	hover_style.bg_color = Color("3680cd52")
	hover_style.border_color = Color("69baff")
	for type_name in ["Button","OptionButton"]:
		native_theme.set_stylebox("normal",type_name,button_style)
		native_theme.set_stylebox("hover",type_name,hover_style)
		native_theme.set_stylebox("pressed",type_name,hover_style)
		native_theme.set_color("font_color",type_name,Color("cdd8e5"))
	native_theme.set_color("font_color","Label",Color("dce5ef"))
	theme = native_theme
	var bg := ColorRect.new()
	bg.color = Color("101821")
	bg.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	add_child(bg)
	_build_models()
	_build_sfx()
	visible = false

func _panel(parent: Node, rect: Rect2, right := false) -> VBoxContainer:
	var panel := PanelContainer.new()
	parent.add_child(panel)
	if right:
		panel.anchor_left = 1.0
		panel.anchor_right = 1.0
	panel.offset_left = rect.position.x
	panel.offset_top = rect.position.y
	panel.offset_right = rect.end.x
	panel.offset_bottom = rect.end.y
	var style := StyleBoxFlat.new()
	style.bg_color = Color("0a121df5")
	style.border_color = Color("c7d8ea21")
	style.set_border_width_all(1)
	style.set_corner_radius_all(11)
	style.content_margin_left = 14
	style.content_margin_right = 14
	style.content_margin_top = 13
	style.content_margin_bottom = 13
	panel.add_theme_stylebox_override("panel",style)
	var box := VBoxContainer.new()
	box.add_theme_constant_override("separation",9)
	panel.add_child(box)
	return box

func _label(parent: Node, text: String, font_size := 12) -> Label:
	var node := Label.new()
	node.text = text
	node.add_theme_font_size_override("font_size",font_size)
	parent.add_child(node)
	return node

func _button(parent: Node, text: String, callback: Callable) -> Button:
	var button := Button.new()
	button.text = text
	button.custom_minimum_size.y = 30
	button.pressed.connect(callback)
	parent.add_child(button)
	return button

func _build_models() -> void:
	model_page = Control.new()
	model_page.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	add_child(model_page)
	var container := SubViewportContainer.new()
	container.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	container.stretch = true
	model_page.add_child(container)
	container.gui_input.connect(_orbit_input)
	viewport = SubViewport.new()
	viewport.own_world_3d = true
	viewport.render_target_update_mode = SubViewport.UPDATE_DISABLED
	container.add_child(viewport)
	scene = Node3D.new()
	viewport.add_child(scene)
	var environment := WorldEnvironment.new()
	var env := Environment.new()
	env.background_mode = Environment.BG_COLOR
	env.background_color = Color("343d49")
	env.ambient_light_source = Environment.AMBIENT_SOURCE_COLOR
	env.ambient_light_color = Color("d7e3f0")
	env.ambient_light_energy = 0.65
	environment.environment = env
	scene.add_child(environment)
	var light := DirectionalLight3D.new()
	light.rotation_degrees = Vector3(-45,-30,0)
	light.light_energy = 1.2
	light.shadow_enabled = true
	scene.add_child(light)
	var floor_node := MeshInstance3D.new()
	var floor_mesh := PlaneMesh.new()
	floor_mesh.size = Vector2(100,100)
	floor_node.mesh = floor_mesh
	var floor_mat := StandardMaterial3D.new()
	floor_mat.albedo_color = Color("333d49")
	floor_mat.roughness = 0.95
	floor_node.material_override = floor_mat
	scene.add_child(floor_node)
	var grid_mesh := ImmediateMesh.new()
	grid_mesh.surface_begin(Mesh.PRIMITIVE_LINES)
	for line in range(-20,21):
		grid_mesh.surface_add_vertex(Vector3(line,0.002,-20))
		grid_mesh.surface_add_vertex(Vector3(line,0.002,20))
		grid_mesh.surface_add_vertex(Vector3(-20,0.002,line))
		grid_mesh.surface_add_vertex(Vector3(20,0.002,line))
	grid_mesh.surface_end()
	var grid := MeshInstance3D.new()
	grid.mesh = grid_mesh
	var grid_mat := StandardMaterial3D.new()
	grid_mat.shading_mode = BaseMaterial3D.SHADING_MODE_UNSHADED
	grid_mat.albedo_color = Color("496376")
	grid.material_override = grid_mat
	scene.add_child(grid)
	camera = Camera3D.new()
	camera.fov = 40
	scene.add_child(camera)
	model_root = Node3D.new()
	scene.add_child(model_root)
	var header := _panel(model_page,Rect2(16,18,296,56))
	_button(header,"GRID COMMAND   Return to battlefield",hide_workspace)
	var left := _panel(model_page,Rect2(16,88,296,520))
	_label(left,"CATALOG                         %d MODELS" % MODEL_NAMES.size(),10)
	var category_scroll := ScrollContainer.new()
	category_scroll.vertical_scroll_mode = ScrollContainer.SCROLL_MODE_DISABLED
	left.add_child(category_scroll)
	var categories := HBoxContainer.new()
	category_scroll.add_child(categories)
	var category_group := ButtonGroup.new()
	for category in ["All","Personnel","Vehicles","Aircraft","Structures"]:
		var pill := _button(categories,category,func(): _populate_catalog(category))
		pill.toggle_mode = true
		pill.button_group = category_group
		pill.button_pressed = category == "All"
		pill.add_theme_font_size_override("font_size",11)
	left.get_parent().set_anchor(SIDE_BOTTOM,1.0,true)
	left.get_parent().offset_bottom = -16
	var scroll := ScrollContainer.new()
	scroll.custom_minimum_size = Vector2(265,200)
	scroll.size_flags_vertical = Control.SIZE_EXPAND_FILL
	left.add_child(scroll)
	catalog = VBoxContainer.new()
	catalog.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	scroll.add_child(catalog)
	_populate_catalog("All")
	var info := _panel(model_page,Rect2(-304,18,288,120),true)
	_label(info,"SELECTED MODEL",10)
	model_title = _label(info,"",16)
	var livery := HBoxContainer.new()
	info.add_child(livery)
	_label(livery,"Livery")
	_button(livery,"BLU",func(): _set_team(0))
	_button(livery,"RED",func(): _set_team(1))
	var controls := _panel(model_page,Rect2(-304,-378,288,362),true)
	controls.get_parent().set_anchor(SIDE_TOP,1.0,true)
	controls.get_parent().set_anchor(SIDE_BOTTOM,1.0,true)
	var rotate := CheckBox.new()
	rotate.text = "Auto-rotate"
	rotate.toggled.connect(func(value: bool): auto_rotate = value)
	controls.add_child(rotate)
	_button(controls,"Reset view",func(): yaw = 0.6; pitch = 0.32; distance = 5.0; _update_camera())
	fire_cannon_button = _button(controls,"Fire cannon",_fire_preview_cannon)
	_label(controls,"Animation")
	clips = OptionButton.new()
	controls.add_child(clips)
	clips.item_selected.connect(func(index: int):
		if is_instance_valid(animation): animation.play(clips.get_item_text(index)))
	_button(controls,"Play / pause",func():
		if is_instance_valid(animation):
			if animation.is_playing(): animation.pause()
			else: animation.play())
	_button(controls,"Restart animation",func():
		if is_instance_valid(animation): animation.seek(0,true))
	animation_progress = HSlider.new()
	animation_progress.step = 0.01
	animation_progress.value_changed.connect(func(value: float):
		if not updating_progress and is_instance_valid(animation): animation.seek(value,true))
	controls.add_child(animation_progress)
	_label(controls,"Drag to orbit · Wheel to zoom",11)
	_load_model("CANNON_APC")

func _category(id: String) -> String:
	if MODEL_FILES.get(id,"") == "soldier": return "Personnel"
	if id in ["MOB","AIRFIELD"]: return "Structures"
	if id in ["JET","CAS_FIGHTER","ATTACK_HELI","TRANSPORT_HELI","HEAVY_LIFT_HELI","RECON_UAV","CARGO_PLANE"]: return "Aircraft"
	return "Vehicles"

func _populate_catalog(category: String) -> void:
	for child in catalog.get_children():
		catalog.remove_child(child)
		child.queue_free()
	var selection := ButtonGroup.new()
	for id in MODEL_NAMES:
		if category != "All" and _category(id) != category: continue
		var button := _button(catalog,MODEL_NAMES[id]+"\n"+_category(id).to_upper(),_load_model.bind(id))
		button.toggle_mode = true
		button.button_group = selection
		button.button_pressed = id == selected_model
		button.add_theme_stylebox_override("normal",StyleBoxEmpty.new())
		button.alignment = HORIZONTAL_ALIGNMENT_LEFT
		button.custom_minimum_size.y = 48

func _load_model(id: String) -> void:
	selected_model = id
	if is_instance_valid(preview_tank_fire):
		model_root.remove_child(preview_tank_fire)
		preview_tank_fire.queue_free()
	elif is_instance_valid(model):
		model_root.remove_child(model)
		model.queue_free()
	preview_tank_fire = null
	_previous_clip = ""
	_previous_clip_time = -1.0
	fire_cannon_button.visible = id == "TANK"
	preview_greebles = null
	animation = null
	clips.clear()
	var path := "res://assets/models/"+str(MODEL_FILES.get(id,id))+".glb"
	model = preload("res://scripts/browser_model_factory.gd").create(id, team)
	if model == null:
		if not ResourceLoader.exists(path):
			model_title.text = "Asset unavailable: "+id
			return
		var packed: PackedScene = load(path)
		model = packed.instantiate()
	model_root.add_child(model)
	if id == "TANK":
		preload("res://scripts/tank_material.gd").apply(model)
	preload("res://scripts/ground_vehicle_material.gd").apply(model, team, str(MODEL_FILES.get(id, id)))
	preload("res://scripts/air_naval_material.gd").apply(model, str(MODEL_FILES.get(id, id)), team)
	preload("res://scripts/naval_material.gd").apply(model, str(MODEL_FILES.get(id, id)), team)
	if id == "TANK":
		preview_greebles = preload("res://scripts/vehicle_greebles.gd").new()
		model.add_child(preview_greebles)
		preview_greebles.build_tank_stowage(model)
	# These Blender-authored GLBs retain their source Z-up axes. Rotate the
	# complete vehicle once; this also keeps wheel and rotor child axes aligned.
	if MODEL_FILES.get(id,"") in Z_UP_MODEL_FILES: model.rotation_degrees.x = -90
	if MODEL_FILES.get(id,"") == "soldier": _filter_gear(model,id)
	var bounds := _bounds(model,Transform3D.IDENTITY)
	var span := maxf(0.001,maxf(bounds.size.x,maxf(bounds.size.y,bounds.size.z)))
	var factor := 3.0 / span
	model_root.scale = Vector3.ONE*factor
	model_root.position = Vector3(-bounds.get_center().x,-bounds.position.y,-bounds.get_center().z)*factor
	model_title.text = MODEL_NAMES[id]
	_find_animation(model)
	if animation:
		for clip in animation.get_animation_list():
			if clip != "RESET": clips.add_item(clip)
		if clips.item_count > 0: animation.play(clips.get_item_text(0))
	clips.disabled = clips.item_count == 0
	_set_team(team)
	if id == "TANK":
		preview_tank_fire = preload("res://scripts/tank_fire_effects.gd").new()
		model_root.add_child(preview_tank_fire)
		preview_tank_fire.setup(model, model)
	_update_camera()

func _fire_preview_cannon() -> void:
	if is_instance_valid(preview_tank_fire):
		preview_tank_fire.fire()

func _filter_gear(node: Node, role: String) -> void:
	if node is Node3D and str(node.name).begins_with("Gear_"): node.visible = str(node.name) == "Gear_"+role
	for child in node.get_children(): _filter_gear(child,role)

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

func _find_animation(node: Node) -> void:
	if node is AnimationPlayer: animation = node
	for child in node.get_children(): _find_animation(child)

func _set_team(value: int) -> void:
	var changed := team != value
	team = value
	if changed and selected_model in ["TRUCK","FORKLIFT","UAV_JAMMER","CARGO_PLANE","TRANSPORT_HELI","IFV","MOB","AIRFIELD"]:
		_load_model(selected_model)
		return
	material_overlay = ShaderMaterial.new()
	material_overlay.shader = load("res://shaders/unit_fresnel.gdshader")
	material_overlay.set_shader_parameter("rim_color",Color.WHITE)
	material_overlay.set_shader_parameter("strength",0.5)
	if is_instance_valid(model): _apply_team(model)

func _apply_team(node: Node) -> void:
	if node.has_meta("tank_muzzle_flash"): return
	if node is MeshInstance3D and DisplayServer.get_name() != "headless":
		node.material_overlay = null if selected_model in ["MOB","AIRFIELD"] else material_overlay
	for child in node.get_children(): _apply_team(child)

func _orbit_input(event: InputEvent) -> void:
	if event is InputEventMouseButton:
		if event.button_index == MOUSE_BUTTON_LEFT: drag = event.pressed
		if event.pressed and event.button_index == MOUSE_BUTTON_WHEEL_UP: distance = maxf(1.2,distance*0.9)
		if event.pressed and event.button_index == MOUSE_BUTTON_WHEEL_DOWN: distance = minf(20,distance*1.1)
	if event is InputEventMouseMotion and drag:
		yaw -= event.relative.x*0.008
		pitch = clampf(pitch+event.relative.y*0.008,-0.1,1.45)
	_update_camera()

func _update_camera() -> void:
	var target := Vector3(0,0.6,0)
	camera.position = target+Vector3(sin(yaw)*cos(pitch),sin(pitch),cos(yaw)*cos(pitch))*distance
	camera.look_at(target)

func _process(delta: float) -> void:
	if not visible: return
	if model_page.visible and is_instance_valid(preview_tank_fire) and is_instance_valid(animation):
		var clip := animation.current_animation
		var clip_time := animation.current_animation_position
		if animation.is_playing() and clip.to_lower() == "shoot" and (clip != _previous_clip or clip_time < _previous_clip_time):
			_fire_preview_cannon()
		_previous_clip = clip
		_previous_clip_time = clip_time
	if is_instance_valid(preview_greebles):
		var driving := is_instance_valid(animation) and animation.is_playing() and "drive" in animation.current_animation.to_lower()
		preview_greebles.set_activity(driving, delta)
	if model_page.visible and selected_model == "TRANSPORT_HELI" and is_instance_valid(model):
		preload("res://scripts/browser_aircraft_models.gd").animate(model, delta)
	if model_page.visible and auto_rotate:
		yaw += delta*0.25
		_update_camera()
	if is_instance_valid(animation) and animation.is_playing():
		updating_progress = true
		animation_progress.max_value = animation.current_animation_length
		animation_progress.value = animation.current_animation_position
		updating_progress = false

func show_models() -> void:
	show()
	model_page.show()
	sfx_page.hide()
	viewport.render_target_update_mode = SubViewport.UPDATE_ALWAYS
	player.stop()

func show_sfx() -> void:
	show()
	model_page.hide()
	sfx_page.show()
	viewport.render_target_update_mode = SubViewport.UPDATE_DISABLED

func hide_workspace_for_switch() -> void:
	hide()
	viewport.render_target_update_mode = SubViewport.UPDATE_DISABLED
	player.stop()

func hide_workspace() -> void:
	hide()
	viewport.render_target_update_mode = SubViewport.UPDATE_DISABLED
	player.stop()
	closed.emit()
	if is_instance_valid(world) and world.has_method("open_battlefield"): world.open_battlefield()

func _build_sfx() -> void:
	sound_bank = JSON.parse_string(DEFAULT_SOUND_BANK)
	if FileAccess.file_exists("user://sound-bank.json"):
		var saved = JSON.parse_string(FileAccess.get_file_as_string("user://sound-bank.json"))
		if saved is Dictionary: sound_bank.merge(saved,true)
	player = AudioStreamPlayer.new()
	add_child(player)
	sfx_page = Control.new()
	sfx_page.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	add_child(sfx_page)
	var left := _panel(sfx_page,Rect2(16,18,296,600))
	_button(left,"GRID COMMAND   Return to battlefield",hide_workspace)
	_label(left,"SFX DESIGNER",18)
	_label(left,"SOUND EVENTS                %d SOUNDS" % sound_bank.size(),10)
	var scroll := ScrollContainer.new()
	scroll.custom_minimum_size = Vector2(265,480)
	left.add_child(scroll)
	var list := VBoxContainer.new()
	list.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	scroll.add_child(list)
	for key in sound_bank:
		_button(list,str(sound_bank[key].get("name",key))+"\n"+_sound_kind(key,sound_bank[key])+" · 3 LAYERS",_edit_sound.bind(key))
	_compact(left,"Master volume",master_volume,0,1,func(value: float): master_volume = value; player.volume_db = linear_to_db(maxf(0.0001,value)))
	var library_actions := HBoxContainer.new()
	left.add_child(library_actions)
	_button(library_actions,"Import",func(): _sound_file_dialog(false))
	_button(library_actions,"Export",func(): _sound_file_dialog(true))
	_button(library_actions,"Copy",func(): DisplayServer.clipboard_set(JSON.stringify(sound_bank,"\t")); sound_status.text = "Sound bank copied")
	_button(library_actions,"Reset all",func(): sound_bank = JSON.parse_string(DEFAULT_SOUND_BANK); _edit_sound(sound_key); _save_sounds())
	var right := _panel(sfx_page,Rect2(332,18,670,680))
	right.get_parent().set_anchor(SIDE_RIGHT,1.0,true)
	right.get_parent().offset_right = -16
	right.get_parent().set_anchor(SIDE_BOTTOM,1.0,true)
	right.get_parent().offset_bottom = -16
	var toolbar := HBoxContainer.new()
	right.add_child(toolbar)
	_button(toolbar,"Audition",_play_sound)
	_button(toolbar,"Stop",func(): player.stop())
	_button(toolbar,"Save sound bank",_save_sounds)
	_button(toolbar,"Reset preset",func():
		var original: Dictionary = JSON.parse_string(DEFAULT_SOUND_BANK)
		sound_bank[sound_key] = original[sound_key].duplicate(true)
		_edit_sound(sound_key))
	var controls_scroll := ScrollContainer.new()
	controls_scroll.custom_minimum_size = Vector2(630,560)
	right.add_child(controls_scroll)
	sound_controls = VBoxContainer.new()
	sound_controls.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	controls_scroll.add_child(sound_controls)
	sound_status = _label(right,"Edits are saved on this device.",11)
	_edit_sound(str(sound_bank.keys()[0]))

func _sound_kind(key: String, preset: Dictionary) -> String:
	if preset.get("vehicle",false): return "VEHICLE"
	for word in ["FIRE","CANNON","ROCKET","IMPACT"]:
		if word in key: return "WEAPON"
	for word in ["RADIO","OBJECTIVE","CAPTURE"]:
		if word in key: return "UI"
	return "EFFECT"

func _sound_file_dialog(exporting: bool) -> void:
	var dialog := FileDialog.new()
	dialog.access = FileDialog.ACCESS_FILESYSTEM
	dialog.file_mode = FileDialog.FILE_MODE_SAVE_FILE if exporting else FileDialog.FILE_MODE_OPEN_FILE
	dialog.filters = PackedStringArray(["*.json ; Sound bank JSON"])
	dialog.current_file = "_sfx.json" if exporting else ""
	add_child(dialog)
	dialog.file_selected.connect(func(path: String):
		if exporting:
			var file := FileAccess.open(path,FileAccess.WRITE)
			if file: file.store_string(JSON.stringify(sound_bank,"\t")); sound_status.text = "Sound bank exported"
			else: sound_status.text = "Could not write sound bank"
		else:
			var text := FileAccess.get_file_as_string(path)
			if text.to_utf8_buffer().size() > 256*1024:
				sound_status.text = "Sound bank exceeds 256 KB"
			else:
				var data = JSON.parse_string(text)
				if data is Dictionary:
					var imported := 0
					for key in data:
						if sound_bank.has(key) and data[key] is Dictionary:
							var preset: Dictionary = sound_bank[key].duplicate(true)
							for field in preset:
								if data[key].has(field) and typeof(data[key][field]) == typeof(preset[field]) and field != "oscillators": preset[field] = data[key][field]
							if data[key].get("oscillators") is Array:
								for index in range(mini(3,data[key].oscillators.size())):
									if not data[key].oscillators[index] is Dictionary: continue
									for field in preset.oscillators[index]:
										var input = data[key].oscillators[index].get(field)
										if typeof(input) == typeof(preset.oscillators[index][field]): preset.oscillators[index][field] = input
							preset.duration = clampf(float(preset.get("duration",0.2)),0.01,30)
							preset.release = clampf(float(preset.get("release",0.1)),0,10)
							sound_bank[key] = preset
							imported += 1
					_edit_sound(sound_key)
					_save_sounds()
					sound_status.text = "%d sound presets imported" % imported
				else: sound_status.text = "That file is not a sound preset collection"
		dialog.queue_free())
	dialog.canceled.connect(dialog.queue_free)
	dialog.popup_centered_ratio(0.75)

func _slider(parent: Node, title: String, value: float, minimum: float, maximum: float, callback: Callable) -> void:
	var row := HBoxContainer.new()
	parent.add_child(row)
	var label := _label(row,title)
	label.custom_minimum_size.x = 140
	var slider := HSlider.new()
	slider.min_value = minimum
	slider.max_value = maximum
	slider.step = 0.001
	slider.value = value
	slider.custom_minimum_size.x = 270
	row.add_child(slider)
	var number := _label(row,"%.2f" % value)
	slider.value_changed.connect(func(next: float): number.text = "%.2f" % next; callback.call(next))

func _edit_sound(key: String) -> void:
	player.stop()
	sound_key = key
	for child in sound_controls.get_children():
		sound_controls.remove_child(child)
		child.queue_free()
	var preset: Dictionary = sound_bank[key]
	_label(sound_controls,"3-LAYER TONE GENERATOR",9)
	_label(sound_controls,str(preset.get("name",key)),18)
	for i in range(mini(3,preset.oscillators.size())):
		var oscillator: Dictionary = preset.oscillators[i]
		var row_panel := PanelContainer.new()
		var row_style := StyleBoxFlat.new()
		row_style.bg_color = Color("191c26")
		row_style.border_color = Color("ffffff1c")
		row_style.set_border_width_all(1)
		row_style.set_corner_radius_all(8)
		row_style.content_margin_top = 8
		row_style.content_margin_bottom = 8
		row_style.content_margin_left = 8
		row_style.content_margin_right = 8
		row_panel.add_theme_stylebox_override("panel",row_style)
		sound_controls.add_child(row_panel)
		var row := HBoxContainer.new()
		row.add_theme_constant_override("separation",10)
		row_panel.add_child(row)
		var enabled := CheckBox.new()
		enabled.text = str(i+1)
		enabled.button_pressed = oscillator.get("enabled",false)
		enabled.toggled.connect(func(value: bool): oscillator.enabled = value; _save_sounds())
		row.add_child(enabled)
		var wave_box := VBoxContainer.new()
		row.add_child(wave_box)
		_label(wave_box,"WAVEFORM",8)
		var waves := GridContainer.new()
		waves.columns = 2
		wave_box.add_child(waves)
		var group := ButtonGroup.new()
		for waveform in ["sine","square","triangle","sawtooth"]:
			var button := _button(waves,{"sine":"∿","square":"⊓","triangle":"△","sawtooth":"⋀"}[waveform],func(): oscillator.wave = waveform; _save_sounds())
			button.tooltip_text = waveform
			button.toggle_mode = true
			button.button_group = group
			button.button_pressed = oscillator.get("wave","sine") == waveform
			button.custom_minimum_size = Vector2(34,28)
		for field in [["phase","PHASE",0,360],["detune","DETUNE",-1200,1200]]:
			var field_name: String = field[0]
			var box := VBoxContainer.new()
			box.custom_minimum_size.x = 44
			row.add_child(box)
			_label(box,field[1],8)
			var fader := VSlider.new()
			fader.custom_minimum_size = Vector2(18,58)
			fader.size_flags_horizontal = Control.SIZE_SHRINK_CENTER
			fader.min_value = field[2]
			fader.max_value = field[3]
			fader.value = float(oscillator.get(field_name,0))
			box.add_child(fader)
			var output := _label(box,"%.0f" % fader.value,9)
			fader.value_changed.connect(func(value: float): oscillator[field_name] = value; output.text = "%.0f" % value; _save_sounds())
		for field in [["freq","COARSE",20,4000],["ratio","FINE",0.01,20],["gain","LEVEL",0,2],["endRatio","SWEEP",0.05,4],["pan","PAN",-1,1]]:
			var field_name: String = field[0]
			var box := VBoxContainer.new()
			box.custom_minimum_size.x = 56
			row.add_child(box)
			var knob := RotaryControl.new()
			knob.minimum = field[2]
			knob.maximum = field[3]
			knob.value = float(oscillator.get(field_name,0))
			box.add_child(knob)
			_label(box,field[1],8)
			var output := _label(box,"%.2f" % knob.value,10)
			knob.changed.connect(func(value: float): oscillator[field_name] = value; output.text = "%.2f" % value; _save_sounds())
	var global_row := HBoxContainer.new()
	sound_controls.add_child(global_row)
	_label(global_row,"GLOBAL",10)
	_label(global_row,"Filter",11)
	var filter_picker := OptionButton.new()
	var filter_names := ["lowpass","highpass","bandpass","notch","allpass","peaking","lowshelf","highshelf"]
	for filter_name in filter_names: filter_picker.add_item(filter_name)
	filter_picker.select(maxi(0,filter_names.find(preset.get("filterType","lowpass"))))
	filter_picker.item_selected.connect(func(index: int): preset.filterType = filter_picker.get_item_text(index); _save_sounds())
	global_row.add_child(filter_picker)
	var loop := CheckBox.new()
	loop.text = "Loop"
	loop.button_pressed = preset.get("loop",false)
	loop.toggled.connect(func(value: bool): preset.loop = value; _save_sounds())
	global_row.add_child(loop)
	var grid := GridContainer.new()
	grid.columns = 4
	grid.add_theme_constant_override("h_separation",12)
	grid.add_theme_constant_override("v_separation",12)
	sound_controls.add_child(grid)
	var fields := [["attack","Attack",0,3],["decay","Decay",0,5],["sustain","Sustain",0,1],["release","Release",0,5],["duration","Length",0.01,10],["output","Output",0,2],["filterFreq","Cutoff",20,20000],["filterQ","Focus",0,30],["noiseGain","Noise",0,2],["noiseFreq","Noise tone",20,20000],["distortion","Drive",0,50]]
	if preset.get("vehicle",false): fields.append_array([["speedPitchMax","Speed pitch",0.25,4],["speedFilterMax","Speed filter",0.25,4],["repeatHz","Pulse rate",0,40],["repeatSpeedMax","Pulse speed",0.05,8],["repeatDepth","Pulse depth",0,1]])
	for field in fields:
		var field_name: String = field[0]
		_compact(grid,field[1],float(preset.get(field_name,0)),field[2],field[3],func(value: float): preset[field_name] = value; _save_sounds())

func _compact(parent: Node, title: String, value: float, minimum: float, maximum: float, callback: Callable) -> void:
	var box := VBoxContainer.new()
	box.custom_minimum_size.x = 125
	box.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	parent.add_child(box)
	var labels := HBoxContainer.new()
	box.add_child(labels)
	var label := _label(labels,title,10)
	label.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	var number := _label(labels,"%.2f" % value,10)
	var slider := HSlider.new()
	slider.min_value = minimum
	slider.max_value = maximum
	slider.step = 0.01
	slider.value = value
	box.add_child(slider)
	slider.value_changed.connect(func(next: float): number.text = "%.2f" % next; callback.call(next))

class RotaryControl extends Control:
	signal changed(value: float)
	var minimum := 0.0
	var maximum := 1.0
	var value := 0.0
	var dragging := false
	func _init() -> void:
		custom_minimum_size = Vector2(56,44)
		mouse_default_cursor_shape = Control.CURSOR_HSIZE
	func _draw() -> void:
		var center := Vector2(28,22)
		draw_circle(center,21,Color("202831"))
		draw_arc(center,21,0,TAU,40,Color("637080"),1,true)
		var angle := deg_to_rad(-135+clampf((value-minimum)/(maximum-minimum),0,1)*270)-PI/2
		draw_line(center+Vector2.from_angle(angle)*6,center+Vector2.from_angle(angle)*18,Color("7fc8ff"),2,true)
	func _gui_input(event: InputEvent) -> void:
		if event is InputEventMouseButton and event.button_index == MOUSE_BUTTON_LEFT: dragging = event.pressed
		if event is InputEventMouseMotion and dragging:
			value = clampf(value+(event.relative.x-event.relative.y)*(maximum-minimum)/200,minimum,maximum)
			queue_redraw()
			changed.emit(value)
func _save_sounds() -> void:
	var file := FileAccess.open("user://sound-bank.json",FileAccess.WRITE)
	if file:
		file.store_string(JSON.stringify(sound_bank,"\t"))
		sound_status.text = "Sound bank saved on this device."
	else: sound_status.text = "Could not save sound bank."

func _play_sound() -> void:
	if sound_key.is_empty(): return
	var preset: Dictionary = sound_bank[sound_key]
	var rate := 22050
	var duration := float(preset.get("duration",0.2))
	var release := float(preset.get("release",0.1))
	var frames := int((duration+release)*rate)
	var bytes := PackedByteArray()
	bytes.resize(frames*4)
	var phases: Array[float] = []
	for oscillator in preset.oscillators: phases.append(deg_to_rad(float(oscillator.get("phase",0))))
	var filter := _biquad(str(preset.get("filterType","lowpass")),float(preset.get("filterFreq",12000)),float(preset.get("filterQ",0.707)),rate)
	var noise_filter := _biquad("bandpass",float(preset.get("noiseFreq",4000)),0.707,rate)
	var history := [Vector2.ZERO,Vector2.ZERO,Vector2.ZERO,Vector2.ZERO]
	var noise_history := [Vector2.ZERO,Vector2.ZERO,Vector2.ZERO,Vector2.ZERO]
	var rng := RandomNumberGenerator.new()
	rng.seed = 42
	for frame in range(frames):
		var time := float(frame)/rate
		var envelope := minf(1,time/maxf(0.001,float(preset.get("attack",0.001))))
		var attack := float(preset.get("attack",0.001))
		if time > attack: envelope *= lerpf(1,float(preset.get("sustain",0.5)),clampf((time-attack)/maxf(0.001,float(preset.get("decay",0.05))),0,1))
		if time > duration: envelope *= maxf(0,1-(time-duration)/maxf(0.001,release))
		var channels := _filter_sample(Vector2.ONE*rng.randf_range(-1,1),noise_filter,noise_history)*float(preset.get("noiseGain",0))*0.3
		for i in range(preset.oscillators.size()):
			var oscillator: Dictionary = preset.oscillators[i]
			if not oscillator.get("enabled",false): continue
			var frequency := float(oscillator.get("freq",220))*float(oscillator.get("ratio",1))*pow(2,float(oscillator.get("detune",0))/1200.0)
			frequency *= lerpf(1,float(oscillator.get("endRatio",1)),minf(1,time/maxf(0.001,duration)))
			phases[i] += TAU*frequency/rate
			var wave := sin(phases[i])
			match oscillator.get("wave","sine"):
				"square": wave = 1.0 if wave >= 0 else -1.0
				"triangle": wave = asin(wave)*2/PI
				"sawtooth": wave = fposmod(phases[i]/TAU,1)*2-1
			var pan := float(oscillator.get("pan",0))
			channels += Vector2(sqrt((1-pan)*0.5),sqrt((1+pan)*0.5))*wave*float(oscillator.get("gain",0))
		channels = _filter_sample(channels,filter,history)
		var pulse := 1.0
		if float(preset.get("repeatHz",0)) > 0: pulse = 1-float(preset.get("repeatDepth",0))*0.5+sin(time*TAU*float(preset.repeatHz))*float(preset.get("repeatDepth",0))*0.5
		channels *= envelope*float(preset.get("output",0.5))*0.35*pulse
		var drive := 1+float(preset.get("distortion",0))*0.1
		for channel in range(2):
			var sample := int(clampf(tanh(channels[channel]*drive),-1,1)*32767)
			bytes.encode_s16(frame*4+channel*2,sample)
	var stream := AudioStreamWAV.new()
	stream.format = AudioStreamWAV.FORMAT_16_BITS
	stream.mix_rate = rate
	stream.stereo = true
	stream.data = bytes
	if preset.get("loop",false):
		stream.loop_mode = AudioStreamWAV.LOOP_FORWARD
		stream.loop_end = frames
	player.volume_db = linear_to_db(maxf(0.0001,master_volume))
	player.stream = stream
	player.play()
	sound_status.text = "Playing: "+str(preset.get("name",sound_key))
func _filter_sample(sample: Vector2, coefficients: Array, history: Array) -> Vector2:
	var output: Vector2 = sample*coefficients[0]+history[0]*coefficients[1]+history[1]*coefficients[2]-history[2]*coefficients[3]-history[3]*coefficients[4]
	history[1] = history[0]
	history[0] = sample
	history[3] = history[2]
	history[2] = output
	return output

func _biquad(kind: String, frequency: float, resonance: float, sample_rate: float) -> Array:
	var omega := TAU*clampf(frequency,10,sample_rate*0.49)/sample_rate
	var cosine := cos(omega)
	var alpha := sin(omega)/(2*maxf(0.1,resonance))
	var a0 := 1+alpha
	var a1 := -2*cosine
	var a2 := 1-alpha
	var b0 := (1-cosine)*0.5
	var b1 := 1-cosine
	var b2 := b0
	match kind:
		"highpass": b0 = (1+cosine)*0.5; b1 = -(1+cosine); b2 = b0
		"bandpass": b0 = alpha; b1 = 0; b2 = -alpha
		"notch": b0 = 1; b1 = -2*cosine; b2 = 1
		"allpass": b0 = 1-alpha; b1 = -2*cosine; b2 = 1+alpha
		"peaking", "lowshelf", "highshelf":
			# Browser BiquadFilter gain defaults to zero dB for these modes.
			return [1.0,0.0,0.0,0.0,0.0]
	return [b0/a0,b1/a0,b2/a0,a1/a0,a2/a0]

const DEFAULT_SOUND_BANK := '''{
  "RIFLE_FIRE": {
    "name": "Rifle fire",
    "loop": false,
    "vehicle": false,
    "duration": 0.11,
    "attack": 0.001,
    "decay": 0.025,
    "sustain": 0.12,
    "release": 0.045,
    "filterType": "bandpass",
    "filterFreq": 504,
    "filterQ": 0.8,
    "noiseGain": 0.25,
    "noiseFreq": 2200,
    "distortion": 3.7,
    "output": 0.72,
    "speedPitchMax": 1.18,
    "speedFilterMax": 1.15,
    "repeatHz": 0,
    "repeatSpeedMax": 1,
    "repeatDepth": 0,
    "oscillators": [
      {
        "enabled": true,
        "wave": "sawtooth",
        "freq": 46,
        "ratio": 1,
        "gain": 0.15,
        "detune": 0,
        "endRatio": 0.26,
        "pan": 0,
        "phase": 0
      },
      {
        "enabled": true,
        "wave": "sawtooth",
        "freq": 84,
        "ratio": 1,
        "gain": 0.09,
        "detune": 7,
        "endRatio": 0.48,
        "pan": 0,
        "phase": 0
      },
      {
        "enabled": false,
        "wave": "triangle",
        "freq": 90,
        "ratio": 1,
        "gain": 0.08,
        "detune": 0,
        "endRatio": 1,
        "pan": 0,
        "phase": 0
      }
    ]
  },
  "MG_FIRE": {
    "name": "Machine gun fire",
    "loop": false,
    "vehicle": false,
    "duration": 0.11,
    "attack": 0.034,
    "decay": 0.001,
    "sustain": 0.165,
    "release": 0.002,
    "filterType": "lowpass",
    "filterFreq": 404,
    "filterQ": 0.72,
    "noiseGain": 0.085,
    "noiseFreq": 1800,
    "distortion": 2.35,
    "output": 0.8,
    "speedPitchMax": 1.18,
    "speedFilterMax": 1.15,
    "repeatHz": 0,
    "repeatSpeedMax": 1,
    "repeatDepth": 0,
    "oscillators": [
      {
        "enabled": true,
        "wave": "triangle",
        "freq": 75,
        "ratio": 1,
        "gain": 0.23,
        "detune": 0,
        "endRatio": 0.34,
        "pan": 0,
        "phase": 0
      },
      {
        "enabled": false,
        "wave": "sawtooth",
        "freq": 130,
        "ratio": 1,
        "gain": 0.13,
        "detune": -8,
        "endRatio": 0.5,
        "pan": 0,
        "phase": 0
      },
      {
        "enabled": false,
        "wave": "triangle",
        "freq": 70,
        "ratio": 1,
        "gain": 0.06,
        "detune": 0,
        "endRatio": 1,
        "pan": 0,
        "phase": 0
      }
    ]
  },
  "TANK_FIRE": {
    "name": "Tank cannon",
    "loop": false,
    "vehicle": false,
    "duration": 0.46,
    "attack": 0.001,
    "decay": 0.1,
    "sustain": 0.22,
    "release": 0.26,
    "filterType": "lowpass",
    "filterFreq": 1350,
    "filterQ": 0.65,
    "noiseGain": 0.62,
    "noiseFreq": 700,
    "distortion": 4.6,
    "output": 1,
    "speedPitchMax": 1.18,
    "speedFilterMax": 1.15,
    "repeatHz": 0,
    "repeatSpeedMax": 1,
    "repeatDepth": 0,
    "oscillators": [
      {
        "enabled": true,
        "wave": "sawtooth",
        "freq": 110,
        "ratio": 1,
        "gain": 0.68,
        "detune": 0,
        "endRatio": 0.34,
        "pan": 0,
        "phase": 0
      },
      {
        "enabled": true,
        "wave": "square",
        "freq": 56,
        "ratio": 1,
        "gain": 0.26,
        "detune": -5,
        "endRatio": 0.55,
        "pan": 0,
        "phase": 0
      },
      {
        "enabled": true,
        "wave": "sine",
        "freq": 33,
        "ratio": 1,
        "gain": 0.3,
        "detune": 3,
        "endRatio": 0.72,
        "pan": 0,
        "phase": 0
      }
    ]
  },
  "AT_FIRE": {
    "name": "AT launcher",
    "loop": false,
    "vehicle": false,
    "duration": 0.32,
    "attack": 0.001,
    "decay": 0.07,
    "sustain": 0.18,
    "release": 0.18,
    "filterType": "lowpass",
    "filterFreq": 1600,
    "filterQ": 0.7,
    "noiseGain": 0.52,
    "noiseFreq": 850,
    "distortion": 4.1,
    "output": 0.9,
    "speedPitchMax": 1.18,
    "speedFilterMax": 1.15,
    "repeatHz": 0,
    "repeatSpeedMax": 1,
    "repeatDepth": 0,
    "oscillators": [
      {
        "enabled": true,
        "wave": "sawtooth",
        "freq": 145,
        "ratio": 1,
        "gain": 0.52,
        "detune": 0,
        "endRatio": 0.38,
        "pan": 0,
        "phase": 0
      },
      {
        "enabled": true,
        "wave": "square",
        "freq": 76,
        "ratio": 1,
        "gain": 0.19,
        "detune": 9,
        "endRatio": 0.6,
        "pan": 0,
        "phase": 0
      },
      {
        "enabled": true,
        "wave": "sine",
        "freq": 42,
        "ratio": 1,
        "gain": 0.19,
        "detune": -5,
        "endRatio": 0.72,
        "pan": 0,
        "phase": 0
      }
    ]
  },
  "MORTAR_FIRE": {
    "name": "Mortar launch",
    "loop": false,
    "vehicle": false,
    "duration": 0.23,
    "attack": 0.002,
    "decay": 0.045,
    "sustain": 0.16,
    "release": 0.12,
    "filterType": "lowpass",
    "filterFreq": 1000,
    "filterQ": 0.8,
    "noiseGain": 0.65,
    "noiseFreq": 600,
    "distortion": 4.7,
    "output": 1.155,
    "speedPitchMax": 1.18,
    "speedFilterMax": 1.15,
    "repeatHz": 0,
    "repeatSpeedMax": 1,
    "repeatDepth": 0,
    "oscillators": [
      {
        "enabled": true,
        "wave": "triangle",
        "freq": 155,
        "ratio": 1,
        "gain": 0.045,
        "detune": 0,
        "endRatio": 0.4,
        "pan": 0,
        "phase": 0
      },
      {
        "enabled": true,
        "wave": "sine",
        "freq": 77,
        "ratio": 1,
        "gain": 0.2,
        "detune": -6,
        "endRatio": 0.62,
        "pan": 0,
        "phase": 0
      },
      {
        "enabled": false,
        "wave": "square",
        "freq": 55,
        "ratio": 1,
        "gain": 0.08,
        "detune": 0,
        "endRatio": 1,
        "pan": 0,
        "phase": 0
      }
    ]
  },
  "EXPLOSION": {
    "name": "Explosion",
    "loop": false,
    "vehicle": false,
    "duration": 0.62,
    "attack": 0.001,
    "decay": 0.1,
    "sustain": 0.24,
    "release": 0.4,
    "filterType": "lowpass",
    "filterFreq": 1450,
    "filterQ": 0.55,
    "noiseGain": 0.88,
    "noiseFreq": 900,
    "distortion": 2.6,
    "output": 1,
    "speedPitchMax": 1.18,
    "speedFilterMax": 1.15,
    "repeatHz": 0,
    "repeatSpeedMax": 1,
    "repeatDepth": 0,
    "oscillators": [
      {
        "enabled": true,
        "wave": "sine",
        "freq": 92,
        "ratio": 1,
        "gain": 0.52,
        "detune": 0,
        "endRatio": 0.32,
        "pan": 0,
        "phase": 0
      },
      {
        "enabled": true,
        "wave": "triangle",
        "freq": 47,
        "ratio": 1,
        "gain": 0.23,
        "detune": -4,
        "endRatio": 0.55,
        "pan": 0,
        "phase": 0
      },
      {
        "enabled": true,
        "wave": "sine",
        "freq": 29,
        "ratio": 1,
        "gain": 0.2,
        "detune": 6,
        "endRatio": 0.78,
        "pan": 0,
        "phase": 0
      }
    ]
  },
  "FOOTSTEP": {
    "name": "Footstep",
    "loop": false,
    "vehicle": false,
    "duration": 0.085,
    "attack": 0.001,
    "decay": 0.018,
    "sustain": 0.08,
    "release": 0.045,
    "filterType": "bandpass",
    "filterFreq": 450,
    "filterQ": 0.9,
    "noiseGain": 0.42,
    "noiseFreq": 500,
    "distortion": 0.4,
    "output": 0.34,
    "speedPitchMax": 1.18,
    "speedFilterMax": 1.15,
    "repeatHz": 0,
    "repeatSpeedMax": 1,
    "repeatDepth": 0,
    "oscillators": [
      {
        "enabled": true,
        "wave": "sine",
        "freq": 86,
        "ratio": 1,
        "gain": 0.18,
        "detune": 0,
        "endRatio": 0.64,
        "pan": 0,
        "phase": 0
      },
      {
        "enabled": false,
        "wave": "square",
        "freq": 120,
        "ratio": 1,
        "gain": 0.08,
        "detune": 0,
        "endRatio": 1,
        "pan": 0,
        "phase": 0
      },
      {
        "enabled": false,
        "wave": "triangle",
        "freq": 60,
        "ratio": 1,
        "gain": 0.07,
        "detune": 0,
        "endRatio": 1,
        "pan": 0,
        "phase": 0
      }
    ]
  },
  "VEHICLE_ENGINE": {
    "name": "Vehicle engine",
    "loop": true,
    "vehicle": true,
    "duration": 1,
    "attack": 0.08,
    "decay": 0.12,
    "sustain": 0.8,
    "release": 0.18,
    "filterType": "lowpass",
    "filterFreq": 1000,
    "filterQ": 0.65,
    "noiseGain": 0.035,
    "noiseFreq": 600,
    "distortion": 1.5,
    "output": 0.2,
    "speedPitchMax": 1.32,
    "speedFilterMax": 1.28,
    "repeatHz": 0,
    "repeatSpeedMax": 1,
    "repeatDepth": 0,
    "oscillators": [
      {
        "enabled": true,
        "wave": "sawtooth",
        "freq": 20,
        "ratio": 1,
        "gain": 0.42,
        "detune": 0,
        "endRatio": 1,
        "pan": 0,
        "phase": 0
      },
      {
        "enabled": false,
        "wave": "sawtooth",
        "freq": 62,
        "ratio": 2.02,
        "gain": 0.23,
        "detune": -7,
        "endRatio": 1,
        "pan": 0,
        "phase": 0
      },
      {
        "enabled": true,
        "wave": "sawtooth",
        "freq": 62,
        "ratio": 0.5,
        "gain": 0.1,
        "detune": 5,
        "endRatio": 1,
        "pan": 0,
        "phase": 0
      }
    ]
  },
  "TANK_ENGINE": {
    "name": "Tank engine",
    "loop": true,
    "vehicle": true,
    "duration": 1,
    "attack": 0.09,
    "decay": 0.14,
    "sustain": 0.82,
    "release": 0.2,
    "filterType": "lowpass",
    "filterFreq": 554,
    "filterQ": 0.7,
    "noiseGain": 0.075,
    "noiseFreq": 420,
    "distortion": 2.3,
    "output": 0.24,
    "speedPitchMax": 1.22,
    "speedFilterMax": 1.18,
    "repeatHz": 0,
    "repeatSpeedMax": 1,
    "repeatDepth": 0,
    "oscillators": [
      {
        "enabled": true,
        "wave": "sawtooth",
        "freq": 20,
        "ratio": 1,
        "gain": 0.46,
        "detune": 0,
        "endRatio": 1,
        "pan": 0,
        "phase": 0
      },
      {
        "enabled": true,
        "wave": "triangle",
        "freq": 42,
        "ratio": 2.01,
        "gain": 0.25,
        "detune": -9,
        "endRatio": 1,
        "pan": 0,
        "phase": 0
      },
      {
        "enabled": true,
        "wave": "sine",
        "freq": 1400,
        "ratio": 4.32,
        "gain": 0.11,
        "detune": 73,
        "endRatio": 0.23,
        "pan": 0,
        "phase": 0
      }
    ]
  },
  "TRANSPORT_HELO_ENGINE": {
    "name": "Helicopter rotor",
    "loop": true,
    "vehicle": true,
    "duration": 0.07,
    "attack": 0.001,
    "decay": 0.001,
    "sustain": 0.065,
    "release": 0.076,
    "filterType": "highpass",
    "filterFreq": 40,
    "filterQ": 1.23,
    "noiseGain": 0.375,
    "noiseFreq": 40,
    "distortion": 6.05,
    "output": 0.96,
    "speedPitchMax": 2.5,
    "speedFilterMax": 2.5,
    "repeatHz": 5.8,
    "repeatSpeedMax": 1.66,
    "repeatDepth": 0.62,
    "oscillators": [
      {
        "enabled": true,
        "wave": "sawtooth",
        "freq": 94,
        "ratio": 0.86,
        "gain": 0,
        "detune": 0,
        "endRatio": 0.19,
        "pan": 0,
        "phase": 0
      },
      {
        "enabled": false,
        "wave": "square",
        "freq": 267,
        "ratio": 0.245,
        "gain": 0,
        "detune": -3,
        "endRatio": 1,
        "pan": 0,
        "phase": 0
      },
      {
        "enabled": false,
        "wave": "triangle",
        "freq": 58,
        "ratio": 2,
        "gain": 0.14,
        "detune": 6,
        "endRatio": 1,
        "pan": 0,
        "phase": 0
      }
    ]
  },
  "HEAVYLIFT_HELO_ENGINE": {
    "name": "Heavy-lift helicopter",
    "loop": true,
    "vehicle": true,
    "duration": 0.52,
    "attack": 0.076,
    "decay": 0.001,
    "sustain": 0.055,
    "release": 0.045,
    "filterType": "highpass",
    "filterFreq": 40,
    "filterQ": 0.01,
    "noiseGain": 0.35,
    "noiseFreq": 40,
    "distortion": 5.6,
    "output": 0.72,
    "speedPitchMax": 1.09,
    "speedFilterMax": 1.1,
    "repeatHz": 6.6,
    "repeatSpeedMax": 0.92,
    "repeatDepth": 0.88,
    "oscillators": [
      {
        "enabled": true,
        "wave": "square",
        "freq": 46,
        "ratio": 1,
        "gain": 0,
        "detune": 0,
        "endRatio": 1,
        "pan": 0,
        "phase": 0
      },
      {
        "enabled": true,
        "wave": "sine",
        "freq": 20,
        "ratio": 1.68,
        "gain": 0.035,
        "detune": -7,
        "endRatio": 1,
        "pan": 0,
        "phase": 0
      },
      {
        "enabled": false,
        "wave": "triangle",
        "freq": 46,
        "ratio": 0.5,
        "gain": 0.18,
        "detune": 4,
        "endRatio": 1,
        "pan": 0,
        "phase": 0
      }
    ]
  },
  "MEDEVAC_HELO_ENGINE": {
    "name": "Medevac helicopter",
    "loop": true,
    "vehicle": true,
    "duration": 0.11,
    "attack": 0.003,
    "decay": 0.02,
    "sustain": 0.54,
    "release": 0.034,
    "filterType": "bandpass",
    "filterFreq": 1380,
    "filterQ": 0.62,
    "noiseGain": 0.055,
    "noiseFreq": 900,
    "distortion": 0.8,
    "output": 0.2,
    "speedPitchMax": 1.14,
    "speedFilterMax": 1.15,
    "repeatHz": 9.3,
    "repeatSpeedMax": 1.18,
    "repeatDepth": 0.78,
    "oscillators": [
      {
        "enabled": true,
        "wave": "triangle",
        "freq": 63,
        "ratio": 1,
        "gain": 0.28,
        "detune": 0,
        "endRatio": 1,
        "pan": 0,
        "phase": 0
      },
      {
        "enabled": true,
        "wave": "square",
        "freq": 63,
        "ratio": 0.25,
        "gain": 0.17,
        "detune": -4,
        "endRatio": 1,
        "pan": 0,
        "phase": 0
      },
      {
        "enabled": true,
        "wave": "sine",
        "freq": 63,
        "ratio": 2,
        "gain": 0.14,
        "detune": 5,
        "endRatio": 1,
        "pan": 0,
        "phase": 0
      }
    ]
  },
  "ATTACK_HELO_ENGINE": {
    "name": "Attack helicopter",
    "loop": true,
    "vehicle": true,
    "duration": 1.37,
    "attack": 0.002,
    "decay": 0.016,
    "sustain": 0.48,
    "release": 0.03,
    "filterType": "bandpass",
    "filterFreq": 404,
    "filterQ": 0.72,
    "noiseGain": 0.48,
    "noiseFreq": 40,
    "distortion": 3.3,
    "output": 1.265,
    "speedPitchMax": 1.18,
    "speedFilterMax": 1.2,
    "repeatHz": 6.1,
    "repeatSpeedMax": 1.96,
    "repeatDepth": 0.86,
    "oscillators": [
      {
        "enabled": true,
        "wave": "sine",
        "freq": 20,
        "ratio": 1.68,
        "gain": 0.645,
        "detune": -1083,
        "endRatio": 1,
        "pan": 0,
        "phase": 0
      },
      {
        "enabled": false,
        "wave": "square",
        "freq": 20,
        "ratio": 0.125,
        "gain": 0.75,
        "detune": -5,
        "endRatio": 0.61,
        "pan": 0,
        "phase": 0
      },
      {
        "enabled": false,
        "wave": "triangle",
        "freq": 68,
        "ratio": 2.02,
        "gain": 0.14,
        "detune": 8,
        "endRatio": 1,
        "pan": 0,
        "phase": 0
      }
    ]
  },
  "CARGO_JET_ENGINE": {
    "name": "Aircraft engine",
    "loop": true,
    "vehicle": true,
    "duration": 1,
    "attack": 0.18,
    "decay": 0.2,
    "sustain": 0.85,
    "release": 0.28,
    "filterType": "bandpass",
    "filterFreq": 1500,
    "filterQ": 0.6,
    "noiseGain": 0.11,
    "noiseFreq": 1600,
    "distortion": 1.3,
    "output": 0.18,
    "speedPitchMax": 1.28,
    "speedFilterMax": 1.35,
    "repeatHz": 0,
    "repeatSpeedMax": 1,
    "repeatDepth": 0,
    "oscillators": [
      {
        "enabled": true,
        "wave": "sawtooth",
        "freq": 95,
        "ratio": 1,
        "gain": 0.3,
        "detune": 0,
        "endRatio": 1,
        "pan": 0,
        "phase": 0
      },
      {
        "enabled": true,
        "wave": "triangle",
        "freq": 95,
        "ratio": 2.03,
        "gain": 0.17,
        "detune": -8,
        "endRatio": 1,
        "pan": 0,
        "phase": 0
      },
      {
        "enabled": true,
        "wave": "square",
        "freq": 95,
        "ratio": 0.5,
        "gain": 0.08,
        "detune": 5,
        "endRatio": 1,
        "pan": 0,
        "phase": 0
      }
    ]
  },
  "FIGHTER_JET_ENGINE": {
    "name": "Fighter jet",
    "loop": true,
    "vehicle": true,
    "duration": 1,
    "attack": 0.001,
    "decay": 0.577,
    "sustain": 0.545,
    "release": 0.002,
    "filterType": "lowpass",
    "filterFreq": 255,
    "filterQ": 0.73,
    "noiseGain": 0.87,
    "noiseFreq": 40,
    "distortion": 2.3,
    "output": 1.34,
    "speedPitchMax": 0.5,
    "speedFilterMax": 2.5,
    "repeatHz": 0,
    "repeatSpeedMax": 0.5,
    "repeatDepth": 0,
    "oscillators": [
      {
        "enabled": true,
        "wave": "sawtooth",
        "freq": 20,
        "ratio": 1,
        "gain": 0.02,
        "detune": 0,
        "endRatio": 1,
        "pan": 0,
        "phase": 0
      },
      {
        "enabled": false,
        "wave": "triangle",
        "freq": 128,
        "ratio": 2.05,
        "gain": 0.2,
        "detune": -9,
        "endRatio": 1,
        "pan": 0,
        "phase": 0
      },
      {
        "enabled": true,
        "wave": "sine",
        "freq": 20,
        "ratio": 0.5,
        "gain": 0.285,
        "detune": 7,
        "endRatio": 1,
        "pan": 0,
        "phase": 0
      }
    ]
  },
  "BOMBER_JET_ENGINE": {
    "name": "Bomber jet",
    "loop": true,
    "vehicle": true,
    "duration": 1,
    "attack": 0.22,
    "decay": 0.24,
    "sustain": 0.88,
    "release": 0.34,
    "filterType": "lowpass",
    "filterFreq": 1750,
    "filterQ": 0.54,
    "noiseGain": 0.23,
    "noiseFreq": 1800,
    "distortion": 1.45,
    "output": 0.25,
    "speedPitchMax": 1.25,
    "speedFilterMax": 1.28,
    "repeatHz": 0,
    "repeatSpeedMax": 1,
    "repeatDepth": 0,
    "oscillators": [
      {
        "enabled": true,
        "wave": "sawtooth",
        "freq": 74,
        "ratio": 1,
        "gain": 0.36,
        "detune": 0,
        "endRatio": 1,
        "pan": 0,
        "phase": 0
      },
      {
        "enabled": true,
        "wave": "triangle",
        "freq": 74,
        "ratio": 2.01,
        "gain": 0.22,
        "detune": -6,
        "endRatio": 1,
        "pan": 0,
        "phase": 0
      },
      {
        "enabled": true,
        "wave": "sine",
        "freq": 74,
        "ratio": 0.5,
        "gain": 0.12,
        "detune": 4,
        "endRatio": 1,
        "pan": 0,
        "phase": 0
      }
    ]
  },
  "CAS_JET_ENGINE": {
    "name": "CAS jet",
    "loop": true,
    "vehicle": true,
    "duration": 0.21,
    "attack": 0.15,
    "decay": 0.17,
    "sustain": 0.705,
    "release": 0.26,
    "filterType": "bandpass",
    "filterFreq": 156,
    "filterQ": 0.66,
    "noiseGain": 0.4,
    "noiseFreq": 219,
    "distortion": 2,
    "output": 0.24,
    "speedPitchMax": 1.38,
    "speedFilterMax": 1.16,
    "repeatHz": 0,
    "repeatSpeedMax": 1,
    "repeatDepth": 0,
    "oscillators": [
      {
        "enabled": true,
        "wave": "sine",
        "freq": 20,
        "ratio": 1,
        "gain": 0.25,
        "detune": 0,
        "endRatio": 1,
        "pan": 0,
        "phase": 0
      },
      {
        "enabled": true,
        "wave": "sawtooth",
        "freq": 26,
        "ratio": 0.805,
        "gain": 0,
        "detune": -8,
        "endRatio": 1,
        "pan": 0,
        "phase": 0
      },
      {
        "enabled": true,
        "wave": "sine",
        "freq": 1163,
        "ratio": 3.66,
        "gain": 0.005,
        "detune": 5,
        "endRatio": 1,
        "pan": 0,
        "phase": 0
      }
    ]
  },
  "RADIO_SQUELCH": {
    "name": "Radio squelch",
    "loop": false,
    "vehicle": false,
    "duration": 0.31,
    "attack": 0.001,
    "decay": 0.001,
    "sustain": 0.1,
    "release": 0.06,
    "filterType": "bandpass",
    "filterFreq": 2044,
    "filterQ": 0.85,
    "noiseGain": 0.65,
    "noiseFreq": 592,
    "distortion": 4.35,
    "output": 0.94,
    "speedPitchMax": 1.18,
    "speedFilterMax": 1.15,
    "repeatHz": 0,
    "repeatSpeedMax": 1,
    "repeatDepth": 0,
    "oscillators": [
      {
        "enabled": true,
        "wave": "sawtooth",
        "freq": 142,
        "ratio": 4.1,
        "gain": 0.12,
        "detune": -1200,
        "endRatio": 0.1,
        "pan": 0,
        "phase": 0
      },
      {
        "enabled": false,
        "wave": "sine",
        "freq": 700,
        "ratio": 1,
        "gain": 0.05,
        "detune": 0,
        "endRatio": 1,
        "pan": 0,
        "phase": 0
      },
      {
        "enabled": false,
        "wave": "triangle",
        "freq": 1600,
        "ratio": 1,
        "gain": 0.04,
        "detune": 0,
        "endRatio": 1,
        "pan": 0,
        "phase": 0
      }
    ]
  }
}


'''
