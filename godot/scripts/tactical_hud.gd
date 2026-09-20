extends Control

const INK := Color("e1e9e6")
const MUTED := Color("8ea7ad")
const ACCENT := Color("d9e4aa")
const PANEL := Color(0.052, 0.092, 0.115, 0.95)
var world: Node3D
var clock_label: Label
var status_label: Label
var capture_label: Label
var capture_bar: ProgressBar
var selected_name: Label
var selected_type: Label
var selected_health: ProgressBar
var selected_details: Label
var count_label: Label
var perf_label: Label
var toast: Label
var pause_button: Button
var mode_label: Label
var help_panel: PanelContainer
var pause_banner: Label
var speed_buttons: Array[Button] = []
var refresh := 0.0
var map_control: MiniMap
var update_status: Label
var update_version: Label
var update_check_button: Button
var update_apply_button: Button
var update_native_button: Button

class MiniMap extends Control:
	var world: Node3D
	func _ready() -> void:
		mouse_filter = Control.MOUSE_FILTER_STOP
		mouse_default_cursor_shape = Control.CURSOR_POINTING_HAND
		gui_input.connect(_on_input)
	func point(pos: Vector3) -> Vector2:
		return Vector2((pos.x + 96.0) / 192.0 * size.x, (pos.z + 96.0) / 192.0 * size.y)
	func _process(_delta: float) -> void:
		queue_redraw()
	func _draw() -> void:
		if world == null or world.map == null:
			return
		draw_rect(Rect2(Vector2.ZERO, size), Color("214c58"))
		var land := PackedVector2Array()
		for vertex in TacticalMap.LAND:
			land.append(point(Vector3(vertex.x, 0, vertex.y)))
		draw_colored_polygon(land, Color("637a74"))
		draw_line(point(Vector3(-80, 0, -40)), point(Vector3(-65, 0, 85)), Color("9aab89"), 9.0)
		for x in [-24.0, 0.0, 24.0, 48.0, 72.0]:
			draw_line(point(Vector3(x, 0, -83)), point(Vector3(x, 0, 85)), Color("83918a"), 1.0)
		for z in [-60.0, -36.0, -12.0, 12.0, 36.0, 60.0, 84.0]:
			draw_line(point(Vector3(-28, 0, z)), point(Vector3(86, 0, z)), Color("83918a"), 1.0)
		draw_arc(point(world.map.objective_position), 10.0, 0.0, TAU, 28, Color("e1d399"), 1.5, true)
		for unit in world.units:
			if not unit.is_alive:
				continue
			var pos := point(unit.position)
			var color: Color = CombatUnit.BLUE if unit.team == 0 else CombatUnit.RED
			if unit.selected:
				draw_circle(pos, 5.0, Color("f4f2df"))
			draw_circle(pos, 3.0, color)
		var focus := point(world.camera.focus)
		draw_rect(Rect2(focus - Vector2(21, 15), Vector2(42, 30)), Color(0.95, 0.97, 0.83, 0.80), false, 1.0)
	func _on_input(event: InputEvent) -> void:
		if event is InputEventMouseButton and event.button_index == MOUSE_BUTTON_LEFT and event.pressed:
			var target := Vector3(event.position.x / size.x * 192.0 - 96.0, 0.0, event.position.y / size.y * 192.0 - 96.0)
			world.camera.focus_at(target)
			accept_event()

func _ready() -> void:
	set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	mouse_filter = Control.MOUSE_FILTER_IGNORE
	var ui_theme := Theme.new()
	var font := SystemFont.new()
	font.font_names = PackedStringArray(["Bahnschrift", "Segoe UI", "DejaVu Sans"])
	ui_theme.default_font = font
	ui_theme.default_font_size = 16
	theme = ui_theme
	_build_top_bar()
	_build_mission_panel()
	_build_selection_panel()
	_build_commands()
	_build_minimap()
	_build_help()
	toast = _label("", 15, ACCENT)
	toast.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	add_child(toast)
	toast.set_anchors_and_offsets_preset(Control.PRESET_TOP_WIDE)
	toast.offset_top = 92
	toast.offset_bottom = 118
	toast.mouse_filter = Control.MOUSE_FILTER_IGNORE
	pause_banner = _label("PAUSED", 24, ACCENT)
	pause_banner.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	add_child(pause_banner)
	pause_banner.set_anchors_and_offsets_preset(Control.PRESET_CENTER_TOP)
	pause_banner.position = Vector2(-220, 130)
	pause_banner.size = Vector2(440, 34)
	pause_banner.mouse_filter = Control.MOUSE_FILTER_IGNORE

func _style(color: Color = PANEL, border: Color = Color("30464f")) -> StyleBoxFlat:
	var style := StyleBoxFlat.new()
	style.bg_color = color
	style.border_color = border
	style.set_border_width_all(1)
	style.set_corner_radius_all(4)
	style.content_margin_left = 16
	style.content_margin_right = 16
	style.content_margin_top = 13
	style.content_margin_bottom = 13
	return style

func _panel() -> PanelContainer:
	var panel := PanelContainer.new()
	panel.add_theme_stylebox_override("panel", _style())
	panel.mouse_filter = Control.MOUSE_FILTER_STOP
	add_child(panel)
	return panel

func _label(value: String, font_size: int = 16, color: Color = INK) -> Label:
	var label := Label.new()
	label.text = value
	label.add_theme_color_override("font_color", color)
	label.add_theme_font_size_override("font_size", font_size)
	label.mouse_filter = Control.MOUSE_FILTER_IGNORE
	return label

func _button(value: String, callback: Callable, min_width: float = 72.0) -> Button:
	var button := Button.new()
	button.text = value
	button.custom_minimum_size = Vector2(min_width, 35)
	button.add_theme_color_override("font_color", INK)
	button.add_theme_color_override("font_hover_color", Color.WHITE)
	button.add_theme_color_override("font_pressed_color", Color("132b35"))
	button.add_theme_stylebox_override("normal", _style(Color("172d38"), Color("3c525c")))
	button.add_theme_stylebox_override("hover", _style(Color("2b4651"), Color("7a969c")))
	button.add_theme_stylebox_override("pressed", _style(ACCENT, ACCENT))
	button.add_theme_stylebox_override("focus", StyleBoxEmpty.new())
	button.focus_mode = Control.FOCUS_NONE
	button.pressed.connect(callback)
	return button

func _build_top_bar() -> void:
	var panel := _panel()
	panel.set_anchors_and_offsets_preset(Control.PRESET_TOP_WIDE)
	panel.offset_left = 22
	panel.offset_right = -22
	panel.offset_top = 20
	panel.offset_bottom = 82
	var row := HBoxContainer.new()
	row.add_theme_constant_override("separation", 24)
	panel.add_child(row)
	var brand := VBoxContainer.new()
	brand.add_theme_constant_override("separation", 0)
	row.add_child(brand)
	brand.add_child(_label("GRID COMMAND", 24, INK))
	brand.add_child(_label("NATIVE TACTICAL OPERATIONS", 10, MUTED))
	var divider := VSeparator.new()
	row.add_child(divider)
	var region := VBoxContainer.new()
	region.add_theme_constant_override("separation", 2)
	row.add_child(region)
	region.add_child(_label("SAN DIEGO / HARBOR", 15, ACCENT))
	region.add_child(_label("32.7157° N   117.1611° W  /  FICTIONAL MAP", 10, MUTED))
	var spacer := Control.new()
	spacer.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	row.add_child(spacer)
	clock_label = _label("00:00", 20, INK)
	clock_label.vertical_alignment = VERTICAL_ALIGNMENT_CENTER
	row.add_child(clock_label)
	pause_button = _button("PAUSE", world.toggle_pause, 82)
	row.add_child(pause_button)
	var speeds := HBoxContainer.new()
	speeds.add_theme_constant_override("separation", 4)
	row.add_child(speeds)
	for value in [1.0, 2.0, 4.0]:
		var button := _button("%d×" % int(value), world.set_speed.bind(value), 52)
		speeds.add_child(button)
		speed_buttons.append(button)

func _build_mission_panel() -> void:
	var panel := _panel()
	panel.position = Vector2(22, 103)
	panel.custom_minimum_size = Vector2(278, 0)
	var column := VBoxContainer.new()
	column.add_theme_constant_override("separation", 11)
	panel.add_child(column)
	column.add_child(_label("OPERATION 01", 11, MUTED))
	column.add_child(_label("HOLD THE PORT", 23, INK))
	var instruction := _label("Move ground units to the ring.\nClear red units from the ring.\nHold it for 25 seconds.", 14, MUTED)
	column.add_child(instruction)
	column.add_child(HSeparator.new())
	capture_label = _label("HARBOR  /  NEUTRAL", 13, ACCENT)
	column.add_child(capture_label)
	capture_bar = _progress(ACCENT)
	column.add_child(capture_bar)
	status_label = _label("Control 0%  /  Hold 0 of 25 s", 12, MUTED)
	column.add_child(status_label)
	count_label = _label("BLUE 08     RED 05", 13, INK)
	column.add_child(count_label)
	column.add_child(_button("SELECT ALL BLUE", world.select_all_blue, 240))
	column.add_child(_button("CONTROLS  [H]", toggle_help, 240))
	column.add_child(HSeparator.new())
	update_version = _label("APP VERSION " + UpdateService.current_version, 11, MUTED)
	column.add_child(update_version)
	update_check_button = _button("CHECK FOR UPDATES", UpdateService.check_for_updates, 240)
	column.add_child(update_check_button)
	update_apply_button = _button("DOWNLOAD AND APPLY", UpdateService.apply_update, 240)
	column.add_child(update_apply_button)
	update_native_button = _button("OPEN APP DOWNLOAD", UpdateService.open_native_download, 240)
	column.add_child(update_native_button)
	update_status = _label("", 12, MUTED)
	update_status.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
	update_status.custom_minimum_size.x = 240
	column.add_child(update_status)
	UpdateService.status_changed.connect(_update_update_controls)
	_update_update_controls()

func _update_update_controls() -> void:
	update_status.text = UpdateService.status_text
	update_version.text = "APP VERSION " + UpdateService.current_version
	update_check_button.disabled = UpdateService.is_busy()
	update_apply_button.visible = UpdateService.phase == "available"
	update_native_button.visible = UpdateService.phase == "restart_required"

func _progress(color: Color) -> ProgressBar:
	var bar := ProgressBar.new()
	bar.custom_minimum_size = Vector2(0, 6)
	bar.show_percentage = false
	var background := StyleBoxFlat.new()
	background.bg_color = Color("243b45")
	background.set_corner_radius_all(2)
	var fill := StyleBoxFlat.new()
	fill.bg_color = color
	fill.set_corner_radius_all(2)
	bar.add_theme_stylebox_override("background", background)
	bar.add_theme_stylebox_override("fill", fill)
	return bar

func _build_selection_panel() -> void:
	var panel := _panel()
	panel.set_anchors_and_offsets_preset(Control.PRESET_BOTTOM_LEFT)
	panel.offset_left = 22
	panel.offset_right = 342
	panel.offset_top = -194
	panel.offset_bottom = -24
	var column := VBoxContainer.new()
	column.add_theme_constant_override("separation", 7)
	panel.add_child(column)
	column.add_child(_label("UNIT STATUS", 11, MUTED))
	selected_name = _label("NO UNIT SELECTED", 22, INK)
	column.add_child(selected_name)
	selected_type = _label("Select a blue unit to give orders.", 12, MUTED)
	column.add_child(selected_type)
	selected_health = _progress(CombatUnit.BLUE)
	column.add_child(selected_health)
	selected_details = _label("", 13, INK)
	column.add_child(selected_details)

func _build_commands() -> void:
	var panel := _panel()
	panel.set_anchors_and_offsets_preset(Control.PRESET_CENTER_BOTTOM)
	panel.offset_left = -214
	panel.offset_right = 214
	panel.offset_top = -113
	panel.offset_bottom = -24
	var column := VBoxContainer.new()
	column.add_theme_constant_override("separation", 9)
	panel.add_child(column)
	mode_label = _label("ORDER: ADVANCE  /  RIGHT-CLICK THE MAP", 11, MUTED)
	column.add_child(mode_label)
	var row := HBoxContainer.new()
	row.add_theme_constant_override("separation", 6)
	column.add_child(row)
	row.add_child(_button("ADVANCE", _set_mode.bind("ADVANCE"), 101))
	row.add_child(_button("MOVE", _set_mode.bind("MOVE"), 80))
	row.add_child(_button("HOLD [X]", world.hold_selection, 95))
	row.add_child(_button("FOCUS [F]", world.focus_selection, 101))
	perf_label = _label("", 12, Color("cfddda"))
	add_child(perf_label)
	perf_label.set_anchors_and_offsets_preset(Control.PRESET_CENTER_BOTTOM)
	perf_label.offset_left = -250
	perf_label.offset_right = 250
	perf_label.offset_top = -145
	perf_label.offset_bottom = -121
	perf_label.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER

func _set_mode(value: String) -> void:
	world.command_mode = value
	world.notify("Right-click the map to give the %s order." % value.to_lower())

func _build_minimap() -> void:
	var panel := _panel()
	panel.set_anchors_and_offsets_preset(Control.PRESET_BOTTOM_RIGHT)
	panel.offset_left = -271
	panel.offset_right = -22
	panel.offset_top = -261
	panel.offset_bottom = -24
	var column := VBoxContainer.new()
	column.add_theme_constant_override("separation", 8)
	panel.add_child(column)
	var title := HBoxContainer.new()
	column.add_child(title)
	var title_label := _label("SECTOR MAP", 11, MUTED)
	title_label.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	title.add_child(title_label)
	title.add_child(_label("N ↑", 11, ACCENT))
	map_control = MiniMap.new()
	map_control.world = world
	map_control.custom_minimum_size = Vector2(214, 180)
	map_control.size_flags_vertical = Control.SIZE_EXPAND_FILL
	column.add_child(map_control)

func _build_help() -> void:
	help_panel = _panel()
	help_panel.set_anchors_and_offsets_preset(Control.PRESET_TOP_RIGHT)
	help_panel.offset_left = -350
	help_panel.offset_right = -22
	help_panel.offset_top = 103
	var column := VBoxContainer.new()
	column.add_theme_constant_override("separation", 10)
	help_panel.add_child(column)
	column.add_child(_label("FIELD CONTROLS", 18, INK))
	column.add_child(_label("Left click          Select unit\nShift + click     Add or remove unit\nLeft drag          Select blue units\nRight click        Give order\nW A S D             Move camera\nMiddle drag      Turn camera\nShift + middle   Move camera\nMouse wheel    Zoom\nTab / F              Next unit / Focus\nSpace / 1 2 3     Pause / Time speed\nX / Esc               Hold / Clear selection\nR                         Start new mission", 14, MUTED))
	column.add_child(HSeparator.new())
	var shadows := CheckButton.new()
	shadows.text = "Sun shadows"
	shadows.button_pressed = true
	shadows.focus_mode = Control.FOCUS_NONE
	shadows.toggled.connect(world.set_shadows)
	column.add_child(shadows)
	var fresnel := CheckButton.new()
	fresnel.text = "Unit edge light"
	fresnel.button_pressed = true
	fresnel.focus_mode = Control.FOCUS_NONE
	fresnel.toggled.connect(world.set_fresnel)
	column.add_child(fresnel)
	column.add_child(_button("CLOSE [H]", toggle_help))
	help_panel.hide()

func toggle_help() -> void:
	help_panel.visible = not help_panel.visible

func _process(delta: float) -> void:
	queue_redraw()
	refresh -= delta
	if refresh > 0.0 or world == null:
		return
	refresh = 0.1
	clock_label.text = "%02d:%02d" % [int(world.elapsed) / 60, int(world.elapsed) % 60]
	pause_button.text = "RESUME" if world.paused else "PAUSE"
	for i in range(speed_buttons.size()):
		speed_buttons[i].modulate = ACCENT if is_equal_approx(world.speed, [1.0, 2.0, 4.0][i]) else Color.WHITE
	pause_banner.text = world.mission_state if world.mission_state != "ACTIVE" else "PAUSED" if world.paused else ""
	toast.text = world.message if world.message_time > 0.0 or world.mission_state != "ACTIVE" else ""
	mode_label.text = "ORDER: %s  /  RIGHT-CLICK THE MAP" % world.command_mode
	var control: String = "BLUE CONTROL" if world.capture >= 100.0 else "RED CONTROL" if world.capture <= -100.0 else "CAPTURE IN PROGRESS" if absf(world.capture) > 0.0 else "NEUTRAL"
	capture_label.text = "HARBOR  /  " + control
	capture_bar.value = absf(world.capture)
	status_label.text = "Control %d%%  /  Hold %d of 25 s" % [int(absf(world.capture)), int(world.hold_time)]
	var blue := 0
	var red := 0
	for unit in world.units:
		if unit.is_alive:
			if unit.team == 0:
				blue += 1
			else:
				red += 1
	count_label.text = "BLUE %02d     RED %02d" % [blue, red]
	var draws := int(Performance.get_monitor(Performance.RENDER_TOTAL_DRAW_CALLS_IN_FRAME))
	var memory := Performance.get_monitor(Performance.MEMORY_STATIC) / 1048576.0
	perf_label.text = "%d FPS   /   %d DRAWS   /   %.0f MB   /   %d UNITS" % [Engine.get_frames_per_second(), draws, memory, blue + red]
	if world.selected_units.is_empty():
		selected_name.text = "NO UNIT SELECTED"
		selected_type.text = "Select a blue unit to give orders."
		selected_health.value = 0
		selected_details.text = "Left click a unit or drag a box."
	elif world.selected_units.size() == 1:
		var unit: CombatUnit = world.selected_units[0]
		selected_name.text = unit.call_sign
		selected_type.text = str(unit.stats["name"]) + ("  /  BLUE" if unit.team == 0 else "  /  RED")
		selected_health.value = unit.health / unit.max_health * 100.0
		selected_details.text = "HEALTH %d / %d   •   %s" % [int(unit.health), int(unit.max_health), unit.order]
	else:
		selected_name.text = "%02d UNITS SELECTED" % world.selected_units.size()
		selected_type.text = "GROUP ORDER"
		var ratio := 0.0
		for unit in world.selected_units:
			ratio += unit.health / unit.max_health
		selected_health.value = ratio / world.selected_units.size() * 100.0
		selected_details.text = "Right-click to move this group."

func _draw() -> void:
	if world == null or world.camera == null:
		return
	if world.selection_drag:
		var rect := Rect2(world.drag_start, world.drag_end - world.drag_start).abs()
		draw_rect(rect, Color(0.39, 0.73, 0.91, 0.10))
		draw_rect(rect, CombatUnit.BLUE, false, 1.0)
	for unit in world.units:
		if not unit.is_alive:
			continue
		var center: Vector3 = unit.position + Vector3.UP * (unit.altitude + (2.5 if unit.kind != "soldier" else 2.0))
		if world.camera.is_position_behind(center):
			continue
		var screen: Vector2 = world.camera.unproject_position(center)
		if not Rect2(Vector2.ZERO, size).has_point(screen):
			continue
		var color: Color = CombatUnit.BLUE if unit.team == 0 else CombatUnit.RED
		draw_circle(screen + Vector2(0, -14), 3.0, color)
		if unit.selected or unit.health < unit.max_health:
			var origin := screen + Vector2(-20, -24)
			draw_rect(Rect2(origin - Vector2(1, 1), Vector2(42, 5)), Color("152b35"))
			draw_rect(Rect2(origin, Vector2(40 * unit.health / unit.max_health, 3)), color)
		if unit.selected and not unit.route.is_empty():
			var previous: Vector2 = world.camera.unproject_position(unit.position + Vector3.UP * 0.25)
			for waypoint in unit.route:
				if world.camera.is_position_behind(waypoint):
					continue
				var next: Vector2 = world.camera.unproject_position(waypoint + Vector3.UP * 0.25)
				draw_line(previous, next, Color(color, 0.40), 1.0, true)
				previous = next
			draw_arc(previous, 6, 0, TAU, 20, color, 1.0, true)
