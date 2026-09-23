extends Control

const INK := Color("eef2f5")
const MUTED := Color("98a4ad")
const BLUE := Color("7dbcff")
const RED := Color("ff8080")
const AMBER := Color("f7bd6b")
var world: Node3D
var clock_label: Label
var pause_button: Button
var pause_banner: Label
var force_title: Button
var force_metrics: Label
var supply_value: Label
var group_value: Label
var force_identity: Label
var tempo_value: Label
var tempo_note: Label
var brand_subtitle: Label
var force_panel: PanelContainer
var radio_panel: PanelContainer
var mono_font: Font
var bold_font: Font
var tempo_label: Label
var tempo_bar: ProgressBar
var order_label: Label
var radio_text: RichTextLabel
var radio_filter: OptionButton
var inspector: PanelContainer
var inspector_title: Label
var inspector_type: Label
var inspector_fuel: Label
var inspector_follow: Label
var inspector_text: RichTextLabel
var inspector_phase: Label
var inspector_metrics: Array[Label] = []
var inspector_actions: VBoxContainer
var inspector_action_signature := ""
var carrier_actions: HBoxContainer
var launch_button: Button
var victory_panel: PanelContainer
var victory_title: Label
var victory_detail: Label
var drawer: PanelContainer
var drawer_title: Label
var drawer_tabs: HBoxContainer
var drawer_footer: Label
var drawer_scroll: ScrollContainer
var modal_backdrop: ColorRect
var drawer_text: RichTextLabel
var drawer_actions: VBoxContainer
var drawer_tab := "Forces"
var drawer_roster_ids := ""
var menu: PanelContainer
var rail: HBoxContainer
var rail_label: Label
var rail_ids := ""
var rail_buttons: Dictionary = {}
var objective_buttons: Dictionary = {}
var speed_buttons: Dictionary = {}
var side_buttons: Dictionary = {}
var toast: Label
var diagnostics: Label
var refresh := 0.0
var objective_choice: OptionButton
var requisition_choice: OptionButton
var minimap: Control
var attribution_text: RichTextLabel
var workspace_button: Button
var update_button: Button
var update_caption: Label
var update_icon: TextureRect
var update_fill: ColorRect
var update_applied_acknowledged := false

class TheaterMiniMap extends Control:
	var world: Node3D
	func point(v: Vector3) -> Vector2:
		return Vector2((v.x+150.0)/310.0*size.x,(335.0+v.z)/675.0*size.y)
	func _process(_delta: float) -> void: queue_redraw()
	func _gui_input(event: InputEvent) -> void:
		if event is InputEventMouseButton and event.button_index == MOUSE_BUTTON_LEFT and event.pressed:
			world.focus_theater_point(Vector3(event.position.x/size.x*310.0-150.0,0,event.position.y/size.y*675.0-335.0))
			accept_event()
	func _draw() -> void:
		draw_rect(Rect2(Vector2.ZERO,size),Color("0a0e13"))
		var corridor: Array = world.map.get_corridor()
		for i in range(corridor.size()-1): draw_line(point(corridor[i]),point(corridor[i+1]),Color("445265"),1.5)
		var font := ThemeDB.fallback_font
		for objective in world.map.get_objectives():
			var owner: String = world.objective_owner.get(objective["id"],"")
			var color := Color("7dbcff") if owner == "BLU" else Color("ff8080") if owner == "RED" else Color("98a4ad")
			var pos := point(objective["pos"])
			draw_circle(pos,2.5,color)
			draw_string(font,pos+Vector2(5,3),objective["id"],HORIZONTAL_ALIGNMENT_LEFT,-1,9,color)
		for side in ["BLU","RED"]:
			var pos := point(world.map.bases[side])
			draw_rect(Rect2(pos-Vector2(3,3),Vector2(6,6)),Color("7dbcff") if side == "BLU" else Color("ff8080"))
		for unit in world.units:
			if unit.is_alive: draw_circle(point(unit.position),1.8,Color("7dbcff") if unit.team == 0 else Color("ff8080"))
		if world.operation_view_active:
			var focus := point(world.camera.focus)
			draw_rect(Rect2(focus-Vector2(8,5),Vector2(16,10)),Color("eef2f5"),false,1.0)
		else:
			draw_string(font,Vector2(8,size.y-8),"SAN DIEGO · RETURN",HORIZONTAL_ALIGNMENT_LEFT,-1,9,Color("eef2f5"))
		draw_string(font,Vector2(8,14),"N ↑",HORIZONTAL_ALIGNMENT_LEFT,-1,10,Color("98a4ad"))

func _ready() -> void:
	set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	mouse_filter = Control.MOUSE_FILTER_IGNORE
	var ui_theme := Theme.new()
	ui_theme.default_font_size = 11
	var body_font := FontVariation.new(); body_font.base_font = load("res://assets/fonts/Archivo.ttf"); body_font.variation_opentype = {"wght":400.0}; ui_theme.default_font = body_font
	var heavy_font := FontVariation.new(); heavy_font.base_font = body_font.base_font; heavy_font.variation_opentype = {"wght":700.0}; bold_font = heavy_font
	mono_font = load("res://assets/fonts/JetBrainsMono.ttf")
	ui_theme.set_color("font_color","Label",INK)
	ui_theme.set_color("default_color","RichTextLabel",INK)
	ui_theme.set_color("font_color","Button",INK)
	ui_theme.set_stylebox("normal","Button",_style(Color("19212b"),6))
	ui_theme.set_stylebox("hover","Button",_style(Color("26374c"),6))
	ui_theme.set_stylebox("pressed","Button",_style(Color("24466a"),6))
	ui_theme.set_stylebox("focus","Button",_style(Color("24466a"),6))
	theme = ui_theme
	_build_workspace()
	_build_force()
	_build_time()
	_build_inspector()
	_build_map_tools()
	_build_rail()
	_build_drawer()
	_build_attribution()
	if UpdateService.get_meta("update_menu_open",false):
		menu.show(); move_child(menu,get_child_count()-1)
	toast = _label("",11,INK)
	add_child(toast)
	toast.set_anchors_and_offsets_preset(Control.PRESET_CENTER_BOTTOM)
	toast.offset_left = -260; toast.offset_right = 260; toast.offset_top = -140; toast.offset_bottom = -112
	toast.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	diagnostics = _label("",9,MUTED)
	add_child(diagnostics)
	diagnostics.set_anchors_and_offsets_preset(Control.PRESET_BOTTOM_RIGHT)
	diagnostics.offset_left = -350; diagnostics.offset_right = -20; diagnostics.offset_top = -18; diagnostics.offset_bottom = -2
	diagnostics.horizontal_alignment = HORIZONTAL_ALIGNMENT_RIGHT

func _style(color: Color, radius: int = 12) -> StyleBoxFlat:
	var style := StyleBoxFlat.new()
	style.bg_color = color
	style.border_color = Color(1,1,1,0.14)
	style.set_border_width_all(1)
	style.set_corner_radius_all(radius)
	style.content_margin_left = 10; style.content_margin_right = 10
	style.content_margin_top = 8; style.content_margin_bottom = 8
	return style

func _track_style(color: Color) -> StyleBoxFlat:
	var style := StyleBoxFlat.new(); style.bg_color = color; return style

func _panel(parent: Node, rect: Rect2, anchor: Vector2 = Vector2.ZERO) -> PanelContainer:
	var panel := PanelContainer.new()
	panel.add_theme_stylebox_override("panel",_style(Color(0.039,0.055,0.075,0.72)))
	parent.add_child(panel)
	panel.anchor_left = anchor.x; panel.anchor_right = anchor.x
	panel.anchor_top = anchor.y; panel.anchor_bottom = anchor.y
	panel.offset_left = rect.position.x; panel.offset_top = rect.position.y
	panel.offset_right = rect.end.x; panel.offset_bottom = rect.end.y
	return panel

func _column(parent: Node) -> VBoxContainer:
	var box := VBoxContainer.new(); box.add_theme_constant_override("separation",8); parent.add_child(box); return box
func _row(parent: Node) -> HBoxContainer:
	var box := HBoxContainer.new(); box.add_theme_constant_override("separation",5); parent.add_child(box); return box
func _label(text: String, font_size: int = 11, color: Color = INK) -> Label:
	var label := Label.new(); label.text = text; label.add_theme_font_size_override("font_size",font_size); label.add_theme_color_override("font_color",color); label.mouse_filter = Control.MOUSE_FILTER_IGNORE; return label
func _button(text: String, callback: Callable, parent: Node) -> Button:
	var button := Button.new(); button.text = text; button.focus_mode = Control.FOCUS_NONE; button.custom_minimum_size.y = 28; button.pressed.connect(callback); parent.add_child(button); return button
func _rich(parent: Node, minimum: Vector2) -> RichTextLabel:
	var label := RichTextLabel.new(); label.bbcode_enabled = true; label.custom_minimum_size = minimum; label.size_flags_vertical = Control.SIZE_EXPAND_FILL; label.add_theme_font_size_override("normal_font_size",11); label.add_theme_constant_override("line_separation",6); parent.add_child(label); return label

func _mono(label: Control, font_size: int) -> void:
	label.add_theme_font_override("font",mono_font)
	label.add_theme_font_size_override("font_size",font_size)

func _icon(parent: Control, key: String, at: Vector2, pixels: int = 16, color: Color = MUTED) -> TextureRect:
	var paths := {
		"Battlefield": '<circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="3"/><path d="M12 2v3m0 14v3M2 12h3m14 0h3"/>',
		"Model Preview": '<path d="m12 3 10 5-10 5L2 8Zm-10 9 10 5 10-5M2 16l10 5 10-5"/>',
		"Model Preview Gallery": '<path d="M3 3h7v7H3Zm11 0h7v7h-7ZM3 14h7v7H3Zm11 0h7v7h-7Z"/>',
		"SFX Designer": '<path d="M2 10v4m4-7v10m4-14v18m4-13v8m4-11v14m4-9v4"/>',
		"Graphics & settings": '<path d="M3 8h4m4 0h10M3 16h10m4 0h4"/><circle cx="9" cy="8" r="2"/><circle cx="15" cy="16" r="2"/>',
		"Controls & help": '<circle cx="12" cy="12" r="10"/><path d="M9.1 9a3 3 0 0 1 5.8 1c0 2-3 3-3 3m.1 4h.01"/>',
		"New operation": '<path d="M3 11a9 9 0 1 1 2.6 6.4M3 3v8h8"/>',
		"Check for updates": '<path d="M12 3v12m-5-5 5 5 5-5M5 17v4h14v-4"/>',
		"menu": '<path d="M4 6h16M4 12h16M4 18h16"/>',
		"mute": '<path d="m11 5-6 4H2v6h3l6 4Zm6 4 5 6m0-6-5 6"/>',
		"north": '<path d="m12 3 8 18-8-5-8 5Z"/>',
		"plus": '<path d="M12 5v14M5 12h14"/>',
		"minus": '<path d="M5 12h14"/>',
		"fullscreen": '<path d="M8 3H3v5m13-5h5v5M3 16v5h5m13-5v5h-5M3 3l6 6m12-6-6 6M3 21l6-6m12 6-6-6"/>',
	}
	var svg := '<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#'+color.to_html(false)+'" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round">'+str(paths.get(key,paths["Battlefield"]))+'</svg>'
	var image := Image.new(); image.load_svg_from_string(svg,2.0)
	var icon := TextureRect.new(); icon.texture = ImageTexture.create_from_image(image); icon.expand_mode = TextureRect.EXPAND_IGNORE_SIZE; icon.size = Vector2(pixels,pixels); icon.position = at; icon.mouse_filter = Control.MOUSE_FILTER_IGNORE; parent.add_child(icon)
	return icon

func _bare(button: Button) -> void:
	button.add_theme_stylebox_override("normal",StyleBoxEmpty.new())
	button.add_theme_stylebox_override("focus",StyleBoxEmpty.new())

func _spacer(parent: Node, height: float) -> void:
	var space := Control.new(); space.custom_minimum_size.y = height; space.mouse_filter = Control.MOUSE_FILTER_IGNORE; parent.add_child(space)

func _rule(parent: Node) -> void:
	var line := HSeparator.new(); line.add_theme_stylebox_override("separator",_track_style(Color(1,1,1,0.14))); line.custom_minimum_size.y = 1; parent.add_child(line)

func _toggle_menu() -> void:
	menu.visible = not menu.visible
	if menu.visible: move_child(menu,get_child_count()-1)
	else:
		if UpdateService.phase == "applied": update_applied_acknowledged = true
	UpdateService.set_meta("update_menu_open",menu.visible)

func _start_inline_update() -> void:
	if UpdateService.is_busy(): return
	if UpdateService.phase == "restart_required":
		UpdateService.restart_game()
		return
	update_applied_acknowledged = false
	UpdateService.set_meta("update_menu_open",true)
	await UpdateService.check_for_updates()
	if UpdateService.phase == "available": UpdateService.apply_update()

func _refresh_inline_update(delta: float) -> void:
	if update_button == null: return
	var phase: String = UpdateService.phase
	var caption := "Check for updates"
	match phase:
		"checking": caption = "Checking for Updates"
		"downloading": caption = "Downloading Update %d%%" % roundi(clampf(float(UpdateService.progress),0.0,1.0)*100.0)
		"applying": caption = "Applying Update"
		"applied":
			if not update_applied_acknowledged: caption = "Update Applied"
		"restart_required": caption = "Restart Required"
		"error": caption = "Retry update"
	update_button.text = caption; update_caption.text = caption; update_button.tooltip_text = UpdateService.status_text
	update_icon.rotation = update_icon.rotation + delta*TAU if UpdateService.is_busy() else 0.0
	var fraction := clampf(float(UpdateService.progress),0.0,1.0) if phase in ["checking","downloading","applying"] else 1.0 if phase == "applied" and not update_applied_acknowledged else 0.0
	update_fill.size = Vector2(update_button.size.x*fraction,update_button.size.y)
	update_fill.visible = fraction > 0.0

func _build_workspace() -> void:
	workspace_button = Button.new()
	workspace_button.position = Vector2(20,20); workspace_button.size = Vector2(296,58)
	workspace_button.add_theme_stylebox_override("normal",_style(Color(0.039,0.055,0.075,0.72),12))
	workspace_button.add_theme_stylebox_override("hover",_style(Color(0.039,0.055,0.075,0.9),12))
	workspace_button.pressed.connect(_toggle_menu)
	add_child(workspace_button)
	_icon(workspace_button,"Battlefield",Vector2(13,17),24,BLUE)
	var name_label := _label("GRID COMMAND",13,INK); _mono(name_label,13); workspace_button.add_child(name_label); name_label.position = Vector2(50,13)
	var brand_font := FontVariation.new(); brand_font.base_font = mono_font; brand_font.variation_opentype = {"wght":700.0}; brand_font.set_spacing(TextServer.SPACING_GLYPH,1); name_label.add_theme_font_override("font",brand_font)
	name_label.add_theme_constant_override("outline_size",0)
	brand_subtitle = _label("San Diego · City theater",10,Color("b3bfc8")); _mono(brand_subtitle,10); workspace_button.add_child(brand_subtitle); brand_subtitle.position = Vector2(50,33)
	_icon(workspace_button,"menu",Vector2(261,19),20,INK)
	menu = _panel(self,Rect2(20,86,296,328)); menu.z_index = 120
	menu.add_theme_stylebox_override("panel",_style(Color(0.039,0.055,0.075,0.95),12))
	var box := _column(menu); box.add_theme_constant_override("separation",0)
	for item in [["⊕", "Battlefield", "F1"], ["▱", "Model Preview", "F2"], ["▦", "Model Preview Gallery", "F3"], ["≋", "SFX Designer", "F4"], ["", "", ""], ["☷", "Graphics & settings", ""], ["?", "Controls & help", ""], ["↶", "New operation", ""], ["↓", "Check for updates", ""]]:
		var title: String = item[1]
		if title.is_empty(): _spacer(box,6); _rule(box); _spacer(box,6); continue
		var callback: Callable
		match title:
			"Battlefield": callback = close_panels
			"Model Preview": callback = func(): close_panels(); world.open_model_preview()
			"Model Preview Gallery": callback = func(): close_panels(); world.open_model_gallery()
			"SFX Designer": callback = func(): close_panels(); world.open_sfx_designer()
			"Graphics & settings": callback = func(): open_drawer("Settings")
			"Controls & help": callback = toggle_help
			"Check for updates": callback = _start_inline_update
			_: callback = func(): open_drawer("Restart")
		var button := _button(title,callback,box); button.custom_minimum_size.y = 38; _bare(button)
		for state in ["font_color","font_hover_color","font_pressed_color","font_focus_color"]: button.add_theme_color_override(state,Color.TRANSPARENT)
		var icon := _icon(button,title,Vector2(8,11))
		var caption := _label(title,12,Color("c6cfd6")); button.add_child(caption); caption.position = Vector2(36,10)
		if title == "Check for updates":
			update_button = button; update_caption = caption; update_icon = icon; update_icon.pivot_offset = Vector2(8,8)
			update_fill = ColorRect.new(); update_fill.color = Color(0.24,0.7,0.36,0.28); update_fill.mouse_filter = Control.MOUSE_FILTER_IGNORE; button.add_child(update_fill); button.move_child(update_fill,0); update_fill.hide(); button.clip_contents = true
		var hint := _label(item[2],9,MUTED); _mono(hint,9); button.add_child(hint); hint.position = Vector2(236,13)
	menu.hide()

func _build_force() -> void:
	force_panel = _panel(self,Rect2(20,90,296,264))
	var panel_style := _style(Color(0.039,0.055,0.075,0.72),12)
	panel_style.content_margin_left = 13; panel_style.content_margin_right = 13; panel_style.content_margin_top = 13; panel_style.content_margin_bottom = 13
	force_panel.add_theme_stylebox_override("panel",panel_style)
	var box := _column(force_panel); box.add_theme_constant_override("separation",0)
	var switch_frame := PanelContainer.new(); var switch_style := _style(Color.TRANSPARENT,7)
	switch_style.content_margin_left = 3; switch_style.content_margin_right = 3; switch_style.content_margin_top = 3; switch_style.content_margin_bottom = 3
	switch_frame.add_theme_stylebox_override("panel",switch_style); box.add_child(switch_frame)
	var switch := _row(switch_frame); switch.add_theme_constant_override("separation",3)
	for side in ["BLU","RED"]:
		var button := _button("▪  "+side+" FORCE",func(): _set_side(side),switch)
		button.size_flags_horizontal = Control.SIZE_EXPAND_FILL; button.add_theme_font_size_override("font_size",11)
		button.add_theme_font_override("font",bold_font)
		side_buttons[side] = button
	_spacer(box,13)
	var title_row := _row(box)
	force_title = _button("Saber Command",func(): world.focus_theater_point(world.map.bases[world.active_side]),title_row)
	_bare(force_title); force_title.custom_minimum_size.y = 14; force_title.alignment = HORIZONTAL_ALIGNMENT_LEFT; force_title.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	force_title.add_theme_font_override("font",bold_font)
	force_identity = _label("BLU · TF SABER",9,Color("b3bfc8")); _mono(force_identity,9); title_row.add_child(force_identity)
	_spacer(box,12)
	var metrics := _row(box); metrics.add_theme_constant_override("separation",10)
	for caption in ["Personnel / groups","Supply points"]:
		var card := PanelContainer.new(); card.size_flags_horizontal = Control.SIZE_EXPAND_FILL; card.custom_minimum_size = Vector2(0,65)
		var card_style := _style(Color(1,1,1,0.04),8); card_style.content_margin_top = 10; card_style.content_margin_bottom = 10
		card.add_theme_stylebox_override("panel",card_style); metrics.add_child(card)
		var column := _column(card); column.add_theme_constant_override("separation",5)
		var values := _row(column); values.alignment = BoxContainer.ALIGNMENT_BEGIN
		var value := _label("0",20); _mono(value,20); values.add_child(value)
		if caption == "Personnel / groups":
			force_metrics = value; group_value = _label("/ 0",11,Color("b3bfc8")); _mono(group_value,11); group_value.size_flags_vertical = Control.SIZE_SHRINK_CENTER; values.add_child(group_value)
		else: supply_value = value
		column.add_child(_label(caption,10,Color("b3bfc8")))
	_spacer(box,12)
	var tempo_row := _row(box)
	tempo_label = _label("Operational tempo",10,Color("c6cfd6")); tempo_label.size_flags_horizontal = Control.SIZE_EXPAND_FILL; tempo_row.add_child(tempo_label)
	tempo_value = _label("0 / 100",10,BLUE); _mono(tempo_value,10); tempo_row.add_child(tempo_value)
	_spacer(box,7)
	tempo_bar = ProgressBar.new(); tempo_bar.show_percentage = false; tempo_bar.custom_minimum_size.y = 3; tempo_bar.max_value = 100.0; box.add_child(tempo_bar)
	tempo_bar.add_theme_stylebox_override("fill",_track_style(AMBER)); tempo_bar.add_theme_stylebox_override("background",_track_style(Color(1,1,1,0.13)))
	tempo_note = _label("Near saturation — new orders will queue",9,Color("c6cfd6")); box.add_child(tempo_note); tempo_note.hide()
	_spacer(box,11); _rule(box); _spacer(box,11)
	var current := _row(box)
	var order_box := _column(current); order_box.add_theme_constant_override("separation",4); order_box.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	var order_caption := _label("CURRENT ORDER",8,MUTED); _mono(order_caption,8); order_box.add_child(order_caption)
	order_label = _label("",10,INK); _mono(order_label,10); order_box.add_child(order_label)
	var change := _button("Change",func(): open_drawer("Forces"),current); change.custom_minimum_size.y = 25; change.size_flags_vertical = Control.SIZE_SHRINK_END; change.add_theme_font_size_override("font_size",10)
	radio_panel = _panel(self,Rect2(20,366,296,280)); radio_panel.anchor_bottom = 1.0; radio_panel.offset_bottom = -126
	var radio_style := _style(Color(0.039,0.055,0.075,0.72),12); radio_style.content_margin_left = 13; radio_style.content_margin_right = 13; radio_style.content_margin_top = 0; radio_style.content_margin_bottom = 12
	radio_panel.add_theme_stylebox_override("panel",radio_style)
	var radio_box := _column(radio_panel); radio_box.add_theme_constant_override("separation",5)
	var header := _row(radio_box); header.custom_minimum_size.y = 45
	var radio_caption := _label("RADIO TRAFFIC",9,MUTED); _mono(radio_caption,9); radio_caption.size_flags_horizontal = Control.SIZE_EXPAND_FILL; header.add_child(radio_caption)
	radio_filter = OptionButton.new(); _mono(radio_filter,9); radio_filter.custom_minimum_size = Vector2(80,25); radio_filter.size_flags_vertical = Control.SIZE_SHRINK_CENTER
	for text in ["All","Command","Contact","Logistics"]: radio_filter.add_item(text)
	header.add_child(radio_filter)
	var mute := _button("",func(): AudioServer.set_bus_mute(0,not AudioServer.is_bus_mute(0)),header); _bare(mute); mute.custom_minimum_size = Vector2(25,25); mute.size_flags_vertical = Control.SIZE_SHRINK_CENTER; mute.tooltip_text = "Toggle radio audio"; _icon(mute,"mute",Vector2(5,5),14)
	_rule(radio_box)
	radio_text = _rich(radio_box,Vector2(268,120)); radio_text.add_theme_font_size_override("normal_font_size",10); radio_text.add_theme_constant_override("line_separation",4)
func _build_time() -> void:
	var clock := _panel(self,Rect2(-69,20,138,56),Vector2(0.5,0))
	var box := _column(clock)
	var caption := _label("ELAPSED",9,MUTED); caption.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER; box.add_child(caption)
	clock_label = _label("00:00:00",18,INK); _mono(clock_label,18); clock_label.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER; box.add_child(clock_label)
	var controls := _panel(self,Rect2(-118,84,236,38),Vector2(0.5,0))
	var row := _row(controls)
	pause_button = _button("Ⅱ",world.toggle_pause,row)
	_button("▷|",world.step_once,row)
	for value in [1,2,4,8,16]: speed_buttons[value] = _button(str(value)+"×",func(): world.set_speed(float(value)),row)
	for button in row.get_children():
		button.custom_minimum_size = Vector2(27,27); button.add_theme_font_size_override("font_size",9)
		var button_style := _style(Color.TRANSPARENT,5); button_style.set_border_width_all(0); button_style.content_margin_left = 7; button_style.content_margin_right = 7; button_style.content_margin_top = 0; button_style.content_margin_bottom = 0; button.add_theme_stylebox_override("normal",button_style)
	row.add_theme_constant_override("separation",3)
	var compact_style := _style(Color(0.039,0.055,0.075,0.72),10); compact_style.content_margin_left = 5; compact_style.content_margin_right = 5; compact_style.content_margin_top = 5; compact_style.content_margin_bottom = 5
	controls.add_theme_stylebox_override("panel",compact_style)
	var objectives := _panel(self,Rect2(-177,130,354,38),Vector2(0.5,0))
	objectives.add_theme_stylebox_override("panel",compact_style)
	row = _row(objectives)
	for objective in world.map.get_objectives():
		var button := _button(str(objective["id"]),func(): world.focus_theater_point(objective["pos"]); world.camera.target_distance = 25.0,row)
		button.custom_minimum_size.x = 28
		button.tooltip_text = objective["name"]
		objective_buttons[objective["id"]] = button
	pause_banner = _label("",11,INK); add_child(pause_banner)
	pause_banner.set_anchors_and_offsets_preset(Control.PRESET_CENTER_TOP)
	pause_banner.offset_left = -170; pause_banner.offset_right = 170; pause_banner.offset_top = 182; pause_banner.offset_bottom = 206; pause_banner.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER

func _build_inspector() -> void:
	inspector = _panel(self,Rect2(-320,20,300,0),Vector2(1,0))
	inspector.z_index = 22
	inspector.add_theme_stylebox_override("panel",_style(Color(0.039,0.055,0.075,0.95),12))
	var box := _column(inspector)
	var heading := _row(box)
	var names := _column(heading); names.size_flags_horizontal = Control.SIZE_EXPAND_FILL; names.add_theme_constant_override("separation",4)
	inspector_type = _label("",8,MUTED); _mono(inspector_type,8); names.add_child(inspector_type)
	inspector_title = _label("",11,INK); _mono(inspector_title,11); inspector_title.clip_text = true; inspector_title.text_overrun_behavior = TextServer.OVERRUN_TRIM_ELLIPSIS; names.add_child(inspector_title)
	_button("×",world.clear_selection,heading)
	_rule(box)
	inspector_phase = _label("READY",11,INK)
	inspector_phase.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
	box.add_child(inspector_phase)
	var metrics := HBoxContainer.new(); metrics.add_theme_constant_override("separation",7); box.add_child(metrics)
	for caption in ["Condition","Ammunition","Personnel"]:
		var card := PanelContainer.new(); card.size_flags_horizontal = Control.SIZE_EXPAND_FILL; card.custom_minimum_size.x = 78; card.add_theme_stylebox_override("panel",_style(Color("151d25"),7)); metrics.add_child(card)
		var column := _column(card)
		var value := _label("100%",14,Color("9ad7a6") if caption == "Condition" else RED if caption == "Ammunition" else BLUE); _mono(value,14)
		column.add_child(value); inspector_metrics.append(value)
		column.add_child(_label(caption,8,MUTED))
	inspector_fuel = _label("",9,BLUE); inspector_fuel.add_theme_stylebox_override("normal",_style(Color(0.49,0.737,1.0,0.1),8)); box.add_child(inspector_fuel)
	inspector_text = _rich(box,Vector2(278,155))
	inspector_text.custom_minimum_size.y = 0; inspector_text.fit_content = true; inspector_text.size_flags_vertical = Control.SIZE_SHRINK_BEGIN
	inspector_actions = _column(box)
	carrier_actions = _row(box)
	_button("Deploy",func(): world.carrier_action("deploying"),carrier_actions)
	_button("Undeploy",func(): world.carrier_action("undeploying"),carrier_actions)
	launch_button = _button("Launch",func(): world.carrier_action("launch"),carrier_actions)
	_rule(box)
	var footer := _row(box); footer.custom_minimum_size.y = 35
	inspector_follow = _label("● Camera following unit",9,BLUE); inspector_follow.size_flags_horizontal = Control.SIZE_EXPAND_FILL; footer.add_child(inspector_follow)
	_button("Release",world.clear_selection,footer).add_theme_font_size_override("font_size",9)
	_build_victory_panel()

func _build_victory_panel() -> void:
	victory_panel = _panel(self,Rect2(-190,-95,190,95),Vector2(0.5,0.5))
	victory_panel.z_index = 60
	var box := _column(victory_panel)
	victory_title = _label("OPERATION COMPLETE",20,INK)
	victory_title.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	box.add_child(victory_title)
	victory_detail = _label("",11,MUTED)
	victory_detail.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	box.add_child(victory_detail)
	_button("New operation",func(): world.get_tree().reload_current_scene(),box)
	victory_panel.hide()

func _build_map_tools() -> void:
	var tools := VBoxContainer.new(); add_child(tools)
	tools.z_index = 17
	tools.anchor_left = 1; tools.anchor_right = 1; tools.anchor_top = 0.5; tools.anchor_bottom = 0.5
	tools.offset_left = -52; tools.offset_right = -20; tools.offset_top = -106; tools.offset_bottom = 106
	_button("⌂",world.overview_camera,tools).tooltip_text = "Overview (O)"
	_button("2D",func(): world.camera.pitch = 1.53 if world.camera.pitch < 1.4 else 0.91,tools).tooltip_text = "Toggle 2D / 3D"
	_button("N",world.north_camera,tools).tooltip_text = "North up"
	_button("+",func(): world.zoom_camera(-1),tools)
	_button("−",func(): world.zoom_camera(1),tools)
	_button("□",func(): DisplayServer.window_set_mode(DisplayServer.WINDOW_MODE_WINDOWED if DisplayServer.window_get_mode() == DisplayServer.WINDOW_MODE_FULLSCREEN else DisplayServer.WINDOW_MODE_FULLSCREEN),tools).tooltip_text = "Fullscreen"
	tools.add_theme_constant_override("separation",5)
	var icon_keys := ["Battlefield","Model Preview","north","plus","minus","fullscreen"]
	for index in range(tools.get_child_count()):
		var control: Button = tools.get_child(index)
		control.text = ""; control.custom_minimum_size = Vector2(32,32)
		control.add_theme_stylebox_override("normal",_style(Color(0.039,0.055,0.075,0.72),7))
		_icon(control,icon_keys[index],Vector2(8,8),16,INK)
	var panel := _panel(self,Rect2(-208,-242,188,210),Vector2.ONE)
	minimap = TheaterMiniMap.new(); minimap.world = world; minimap.custom_minimum_size = Vector2(164,186); minimap.clip_contents = true; panel.add_child(minimap)

func _build_attribution() -> void:
	attribution_text = RichTextLabel.new()
	attribution_text.bbcode_enabled = true
	attribution_text.scroll_active = false
	attribution_text.add_theme_font_size_override("normal_font_size",10)
	attribution_text.add_theme_color_override("default_color",MUTED)
	add_child(attribution_text)
	attribution_text.anchor_left = 0.5; attribution_text.anchor_right = 0.5
	attribution_text.anchor_top = 1; attribution_text.anchor_bottom = 1
	attribution_text.offset_left = -180; attribution_text.offset_right = 180
	attribution_text.z_index = 40
	attribution_text.offset_top = -20; attribution_text.offset_bottom = -3
	attribution_text.visible = world.geography_active
	attribution_text.text = "© [url=https://www.openstreetmap.org/copyright]OpenStreetMap contributors[/url] · [url=https://openfreemap.org]OpenFreeMap[/url]"
	attribution_text.tooltip_text = world.geography_attribution
	attribution_text.meta_clicked.connect(func(value: Variant):
		var url := str(value)
		if url in ["https://www.openstreetmap.org/copyright","https://openfreemap.org"]: OS.shell_open(url)
	)

func _build_rail() -> void:
	var rail_area := VBoxContainer.new(); add_child(rail_area)
	rail_area.anchor_top = 1; rail_area.anchor_bottom = 1; rail_area.anchor_right = 1
	rail_area.offset_left = 332; rail_area.offset_right = -220; rail_area.offset_top = -110; rail_area.offset_bottom = -16
	rail_label = _label("BLU ELEMENTS · 0     0 LOST",8,INK); _mono(rail_label,8)
	rail_area.add_child(rail_label)
	rail_area.clip_contents = true
	var rail_row := _row(rail_area); rail_row.add_theme_constant_override("separation",8)
	var scroll := ScrollContainer.new(); scroll.clip_contents = true; scroll.size_flags_horizontal = Control.SIZE_EXPAND_FILL; scroll.custom_minimum_size.y = 75; scroll.horizontal_scroll_mode = ScrollContainer.SCROLL_MODE_SHOW_NEVER; scroll.vertical_scroll_mode = ScrollContainer.SCROLL_MODE_DISABLED
	var left := _button("‹",func(): scroll.scroll_horizontal -= 180,rail_row); left.custom_minimum_size = Vector2(30,75)
	rail_row.add_child(scroll)
	var right := _button("›",func(): scroll.scroll_horizontal += 180,rail_row); right.custom_minimum_size = Vector2(30,75)
	rail = _row(scroll)
	rail.add_theme_constant_override("separation",8)

func _build_drawer() -> void:
	modal_backdrop = ColorRect.new(); modal_backdrop.color = Color(0,0,0,0.5); modal_backdrop.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT); modal_backdrop.z_index = 125; add_child(modal_backdrop); modal_backdrop.hide()
	modal_backdrop.gui_input.connect(func(event):
		if event is InputEventMouseButton and event.pressed: close_panels()
	)
	drawer = _panel(self,Rect2(0,0,430,1000))
	drawer.anchor_bottom = 1; drawer.offset_bottom = 0; drawer.z_index = 130
	drawer.add_theme_stylebox_override("panel",_style(Color("0a0e13"),12))
	var box := _column(drawer)
	var heading := _row(box)
	var title := _label("COMMAND CENTER",16,INK); title.size_flags_horizontal = Control.SIZE_EXPAND_FILL; heading.add_child(title)
	drawer_title = title
	_button("×",close_panels,heading)
	var tabs := _row(box)
	drawer_tabs = tabs
	for tab in ["Forces","Logistics","Staff"]: _button(tab,func(): open_drawer(tab),tabs)
	var scroll := ScrollContainer.new()
	drawer_scroll = scroll
	scroll.size_flags_vertical = Control.SIZE_EXPAND_FILL
	scroll.horizontal_scroll_mode = ScrollContainer.SCROLL_MODE_DISABLED
	box.add_child(scroll)
	var content := _column(scroll)
	content.custom_minimum_size.x = 402
	content.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	drawer_text = _rich(content,Vector2(402,200))
	drawer_text.fit_content = true
	drawer_text.size_flags_vertical = Control.SIZE_SHRINK_BEGIN
	drawer_actions = _column(content)
	drawer_footer = _label("LOCAL COMMANDERS · BLU / RED OBSERVER",9,MUTED); box.add_child(drawer_footer)
	drawer.hide()

func open_drawer(tab: String) -> void:
	move_child(modal_backdrop,get_child_count()-1)
	move_child(drawer,get_child_count()-1)
	drawer_tab = tab; drawer.show(); menu.hide()
	var modal: bool = tab in ["Settings","Help","Restart"]
	modal_backdrop.visible = modal; drawer_tabs.visible = not modal; drawer_footer.visible = not modal
	var dialog_style := _style(Color("0a0e13"),8 if modal else 12)
	if modal:
		dialog_style.content_margin_left = 24; dialog_style.content_margin_right = 24; dialog_style.content_margin_top = 24; dialog_style.content_margin_bottom = 24
	drawer.add_theme_stylebox_override("panel",dialog_style)
	drawer_title.add_theme_font_size_override("font_size",18 if modal else 16); drawer_title.add_theme_font_override("font",bold_font)
	drawer_text.add_theme_font_size_override("normal_font_size",14 if modal else 11)
	drawer_title.text = {"Settings":"Graphics & battlefield","Help":"Welcome to Grid Command","Restart":"Start a new operation?"}.get(tab,"COMMAND CENTER")
	drawer_text.custom_minimum_size.y = 0
	if modal:
		drawer.anchor_left = 0.5; drawer.anchor_right = 0.5; drawer.anchor_top = 0.5; drawer.anchor_bottom = 0.5
		var width := 672.0 if tab == "Settings" else 512.0
		var height := minf(size.y*0.85,760.0) if tab in ["Help","Settings"] else 220.0 if tab == "Settings" else 190.0
		drawer.offset_left = -width/2; drawer.offset_right = width/2; drawer.offset_top = -height/2; drawer.offset_bottom = height/2
		drawer_text.custom_minimum_size.x = width-48; drawer_text.get_parent().custom_minimum_size.x = width-48
	else:
		drawer.anchor_left = 0; drawer.anchor_right = 0; drawer.anchor_top = 0; drawer.anchor_bottom = 1
		drawer.offset_left = 0; drawer.offset_right = 430; drawer.offset_top = 0; drawer.offset_bottom = 0
		drawer_text.custom_minimum_size.x = 402; drawer_text.get_parent().custom_minimum_size.x = 402
	for child in drawer_actions.get_children(): child.queue_free()
	if tab == "Forces":
		var row := _row(drawer_actions)
		for side in ["BLU","RED"]: _button(side,func(): _set_side(side),row)
		_add_force_roster(world.active_side)
	elif tab == "Logistics":
		var row := _row(drawer_actions)
		_button("Upgrade MOB",func(): _logistics_action(world.core.upgrade_mob(world.active_side)),row)
		_button("Upgrade airfield",func(): _logistics_action(world.core.upgrade_airfield(world.active_side)),row)
		objective_choice = OptionButton.new()
		for objective in world.map.get_objectives(): objective_choice.add_item("OBJ "+str(objective["id"]))
		drawer_actions.add_child(objective_choice)
		row = _row(drawer_actions)
		_button("Helipad · 500 SP",func(): _logistics_action(world.core.build_facility(world.active_side,world.map.get_objectives()[objective_choice.selected]["id"],"helipad")),row)
		_button("Vehicle bay · 650 SP",func(): _logistics_action(world.core.build_facility(world.active_side,world.map.get_objectives()[objective_choice.selected]["id"],"vehicleBay")),row)
		_button("Dispatch forward stock",func(): _logistics_action(world.core.dispatch_forward_stock(world.active_side,world.map.get_objectives()[objective_choice.selected]["id"],world.map.bases[world.active_side])),drawer_actions)
		requisition_choice = OptionButton.new()
		for role in SimulationCore.ROLES:
			if role != "COMMAND": requisition_choice.add_item(role+" · "+str(SimulationCore.CATALOG[role][4])+" SP")
		drawer_actions.add_child(requisition_choice)
		_button("Queue requisition (observer)",func(): world.request_reinforcement(requisition_choice.get_item_text(requisition_choice.selected).split(" · ")[0]),drawer_actions)
	elif tab == "Map":
		drawer_actions.add_child(_label("LONGITUDE  (−180 to 180)",10,MUTED))
		var longitude := LineEdit.new(); longitude.text = str(world.geography.get("origin")[0]) if world.geography_active else "-117.08"; drawer_actions.add_child(longitude)
		drawer_actions.add_child(_label("LATITUDE  (−85.0511 to 85.0511)",10,MUTED))
		var latitude := LineEdit.new(); latitude.text = str(world.geography.get("origin")[1]) if world.geography_active else "32.82"; drawer_actions.add_child(latitude)
		for field in [longitude,latitude]:
			field.focus_entered.connect(func(): world.camera.input_enabled = false)
			field.focus_exited.connect(func(): world.camera.input_enabled = true)
		_button("Go to location",func():
			if not longitude.text.is_valid_float() or not latitude.text.is_valid_float() or not world.focus_geographic_location(longitude.text.to_float(),latitude.text.to_float()):
				world.notify("Enter a valid longitude and Mercator latitude.")
			else: close_panels()
		,drawer_actions)
		_button("Return to current theater",func(): world.return_to_theater(); close_panels(),drawer_actions)
	elif tab == "Settings":
		_build_graphics_controls()
	elif tab == "Help":
		_build_help_content()
	elif tab == "Restart":
		_button("Keep watching",close_panels,drawer_actions)
		_button("Start new operation",func(): world.get_tree().reload_current_scene(),drawer_actions)
	_refresh_drawer()

func _paragraph(parent: Node, content: String, width: float = 580) -> Label:
	var label := _label(content,14,MUTED); label.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART; label.custom_minimum_size.x = width; parent.add_child(label); return label

func _graphics_changed(key: String, value: Variant) -> void:
	world.set_graphics_setting(key,value)
	if key == "performanceMode": call_deferred("open_drawer","Settings")

func _build_graphics_controls() -> void:
	var settings: Dictionary = world.graphics_settings
	var performance: bool = settings.get("performanceMode",false)
	for item in [
		["performanceMode","Performance mode","Nearby models only; off-screen units keep simulating."],
		["quality","Render quality","Pixel density and city detail · target 60 FPS"],
		["terrain","Disable heightmap","Flat rendering is the default; navigation and collision still use terrain data."],
		["buildings","3D buildings","Temporarily disabled while the city renderer is under review"],
		["models","Units & base models","Infantry, armor, aircraft, MOBs and airfields"],
		["shadows","Terrain & contact shading","Terrain hillshade and inexpensive unit grounding"],
		["labels","Tactical labels","Street names and close-range unit callsigns"],
		["routes","Movement routes","Live navigation paths for maneuver elements"],
		["grid","Coordinate grid","2-kilometer geographic reference grid"]
	]:
		var key: String = item[0]
		_spacer(drawer_actions,6)
		var row := _row(drawer_actions); row.add_theme_constant_override("separation",16)
		var description := _column(row); description.size_flags_horizontal = Control.SIZE_EXPAND_FILL; description.add_theme_constant_override("separation",4)
		description.add_child(_label(item[1],14,INK)); _paragraph(description,item[2],440)
		if key == "quality":
			var quality := OptionButton.new(); quality.custom_minimum_size.x = 125; quality.size_flags_vertical = Control.SIZE_SHRINK_CENTER
			for title in ["Low · 1×","Balanced · 1.5×","High · 2×"]: quality.add_item(title)
			quality.selected = 0 if performance else ["performance","balanced","high"].find(settings.get("quality","balanced")); quality.disabled = performance
			quality.item_selected.connect(func(index): _graphics_changed("quality",["performance","balanced","high"][index])); row.add_child(quality)
		else:
			var toggle := CheckBox.new(); toggle.size_flags_vertical = Control.SIZE_SHRINK_CENTER
			toggle.button_pressed = true if key == "terrain" else false if key == "buildings" or (performance and key not in ["performanceMode","models"]) else bool(settings.get(key,true))
			toggle.disabled = key in ["terrain","buildings"] or (performance and key not in ["performanceMode","models"])
			if key == "terrain": toggle.tooltip_text = "Raised terrain is not available in this native build."
			toggle.toggled.connect(func(value): _graphics_changed(key,value)); row.add_child(toggle)
		_spacer(drawer_actions,6); _rule(drawer_actions)
		if key == "performanceMode" and performance:
			_paragraph(drawer_actions,"Uses 1× pixel density, limits models to 1 km around the view center, and hides 3D city buildings, shading, labels, routes, grid and minimap. Navigation, combat and collision remain active. Normal graphics choices return when disabled.")
	_spacer(drawer_actions,8)
	_paragraph(drawer_actions,"Collision geometry remains active on the flat map and when buildings are hidden.")
	_button("Open model preview",func(): close_panels(); world.open_model_preview(),drawer_actions)
	_button("Open raycast and projectile verification range",func(): OS.shell_open("https://rhs059.github.io/grid_command/range/"),drawer_actions)

func _build_help_content() -> void:
	_paragraph(drawer_actions,"The battlefield opens flat by default. Clear Disable heightmap in Graphics & battlefield to try raised terrain; navigation, line of sight, and collision continue using streamed terrain data in either view.",440)
	_spacer(drawer_actions,12)
	_paragraph(drawer_actions,"Both commanders start alone with 2,000 SP and empty depots. Autonomous purchases establish infantry and transport, then prioritize airfield tiers 2 and 3 before expensive armor and aircraft. Tier upgrades cost 600/1,200 SP and take 60/90 simulation seconds; supply throughput and income scale 1×/2×/4×. External supply flights start after 30 seconds and recur on a 180-second schedule, with visible handling and onward MOB delivery; no owned logistics assets are required. Vehicles arrive empty, burn fuel while engines run, use ammunition when firing, and consume depot materials for repairs. Ground vehicles service only at MOBs; aircraft must land at airfields. No free field repair or refill. Selecting an asset uses a rear third-person chase camera; the operation opens in theater overview. Automatic commanders run the operation. Select an eligible logistics team or squad leader to deploy a UAV jammer (200 SP, 15 seconds, 600 m radius). Transport helicopters carry 24 troops (six four-person rifle squads) and require at least 12 active troops for an assault flight. They must fully land and unload one soldier per second; capture starts only after the troops are dismounted. Crew, hovering helicopters and embarked troops never count. Helicopter loss kills those still aboard. Cargo aircraft land and unload before forklifts and heavy-lift helicopters move supplies. Bodies and wrecks remain until restart. Watch local deterministic AI direct its forces, contest objectives, and resupply. Select a unit to follow it, or switch perspectives to see only reported enemy contacts. The Model Preview tab includes all 25 unit types and both base compounds, with orbit, zoom, team liveries and animation controls. Switching tabs preserves the running battle; pause first if you want it to wait.",440)
	_spacer(drawer_actions,12)
	for item in [["Pan the battlefield","Drag"],["Rotate & tilt","Right-drag"],["Zoom","Scroll"],["Pause / resume","Space"],["Simulation speed","1 / 2 / 4 / 8"],["Return to overview","O"],["Toggle movement routes","F9"],["Toggle coordinate grid","G"],["Clear selection","Esc"]]:
		var row := _row(drawer_actions); var caption := _label(item[0],14,MUTED); caption.size_flags_horizontal = Control.SIZE_EXPAND_FILL; row.add_child(caption); var key := _label(item[1],12,INK); _mono(key,12); row.add_child(key)
	_spacer(drawer_actions,12)
	drawer_actions.add_child(_label("Victory conditions",14,INK))
	_paragraph(drawer_actions,"Eliminate the enemy commander, or own A–J uncontested for 60 uninterrupted seconds. All ten objectives start neutral. Six active infantry within 100 m are needed to capture. Actual passengers in a transport helicopter also count during landing or disembarking at no more than 5 m altitude. Other aircraft, empty helicopters, vehicle crews, commanders, and pilots never capture or contest. There is no match time limit.",440)
	_help_disclosure("About this implementation","A new browser prototype from the v37 handoff, not the missing v37 source. Implements building-prism and terrain raycasts, 600 m rifles, weapon-specific armor damage, animated infantry, smoke and casualty rescue, and simplified jet/helicopter attack and rearm cycles. Models use real-world scale; select a group for a closeup. Full v37 adversarial search, construction, destructible buildings, and detailed flight physics remain outside this prototype. Battles reset on reload; validated sound banks are stored in this browser. Map collision data requires internet access.")
	_help_disclosure("Build 0.9.27 · Buildings temporarily disabled","Battlefield startup no longer fetches, indexes or constructs the San Diego building catalog. Building collision geometry and modular render meshes are disabled, while empty flat navigation sectors still initialize the simulation. The settings toggle remains unavailable until the city renderer is restored.")
	_help_disclosure("Build 0.9.26 · Native WebGPU battlefield","Babylon.js now owns the geographic map, terrain, procedural models and effects through one native WebGPU renderer; Three.js and MapLibre have been removed. The graphics pipeline includes clustered lighting, three cascaded shadows, screen-space reflections, SSAO2 contact shading, temporal anti-aliasing, AgX tone mapping and bloom, with a Babylon WebGL fallback when WebGPU is unavailable. The root building catalog now creates both instance and collision data in short loading steps without running a second hidden city scan.")
	_help_disclosure("Build 0.9.25 · Focused building visibility","The renderer constructs the complete building instance catalog once and keeps those buffers in memory. Flat 2D view submits no building meshes. In a pitched close-ground view, shaders show only buildings within 200 meters of the camera focus and dither them across the outer 20-meter band as the focus moves, without regenerating instance data.")
	_help_disclosure("Build 0.9.24 · Dithered building transitions","Instanced buildings now appear through a staggered screen-door dither instead of popping into the theater at once. Zoom transitions use the same coverage fade, and nearby window interiors, frames and facade details blend against their inexpensive distant versions across a wider distance band.")
	_help_disclosure("Build 0.9.23 · Persistent building catalog","The complete San Diego building placement catalog now lives at the app root as san-diego-buildings.json. The build pipeline validates it, resumes an incomplete catalog, replaces corrupt data, and records each consolidated building’s point, rotation, deterministic 16-digit seed, type, footprint and dimensions. Later battlefield loads read the finished catalog directly while terrain and collision data continue streaming.")
	_help_disclosure("Build 0.9.22 · Consolidated San Diego buildings","The opening loading screen scans the fixed theater circle centered on the middle objective and extending 200 meters beyond both MOBs and airfields. The simulation remains stopped while every building footprint is counted and assessed. Exact duplicate footprints collapse to one building; intersecting footprints combine on the same four-meter shape grid and retain one source building’s deterministic seed and materials. The renderer keeps the full consolidated theater catalog instead of selecting a camera-local building quota, while window frames and detailed interiors remain close-range detail.")
	_help_disclosure("Build 0.9.21 · Landmark building silhouettes","Government buildings now use a broad pale-stone facade, raised stairs, a six-column portico, pediment, pitched metal roof, square tower, open-column belfry, shallow gold dome and crown flag. Parking garages use stacked concrete slabs, columns, beams, low spandrels and open vehicle bays without window glass or trim. Power stations read as generation sites with cooling towers, stacks, turbine and boiler masses, process pipes and transformer yards. Gas stations and grocery stores receive guaranteed storefront glazing, while service cables use connected rectangular segments.")
	_help_disclosure("Build 0.9.20 · Distinct building types","Facade patterns leave intentional blank wall modules, window sills follow one building-wide rule, and automatic roofs match the building type. Churches use paired doors; gas stations include pump islands; power stations use transformer-yard equipment; government buildings gain formal civic details; and parking garages show parked vehicles through dedicated parallax bays. Battlefield building batches use an explicit direct-color attribute and shader independent of map lighting.")
	_help_disclosure("Build 0.9.19 · Battlefield building colors","City buildings use direct vertex-colored materials in the battlefield renderer so their seeded facade, roof, trim and detail colors remain visible inside the shared map render pass.")
	_help_disclosure("Build 0.9.18 · Room families and building detail","Interior-mapped windows now choose deterministic bedrooms, living rooms, offices, meeting rooms, stores, shelving, workshops and civic spaces appropriate to each building type. Rooms may span one to three adjacent panes. Seeded exterior detail adds sills, awnings, gutters, drains, HVAC, water tanks, signs, garage slats, flags, pottery, trash, dumpsters, electrical boxes, pipes and close-range billboard wiring. Parallax interiors and tiny detail render only within 360 meters at close zoom on the battlefield; distant glazing uses a colored low-cost material. Battlefield building batches initialize and preserve their facade colors.")
	_help_disclosure("Build 0.9.17 · Interior-mapped windows","Windows show inexpensive view-dependent rooms with side walls, floors, ceilings, furnishings and deterministic lighting. Their light-colored frames are separate shallow geometry around the glazing instead of solid white slabs behind it.")
	_help_disclosure("Build 0.9.16 · Closed gable roofs","Gable roofs use explicit local-axis rotation, meet at a capped ridge, and include triangular planar end walls that rise from the final story to the roof peak. Story walls remain flat planes.")
	_help_disclosure("Build 0.9.15 · Roof geometry and SFX audition","Building walls remain low-cost outward-facing planes while roof slabs, glazing, window frames, doors, trim and unique details use shallow 3D geometry. Corrected gable pitch closes both roof panels at the ridge. SFX Audition now plays the visible draft directly and refreshes obsolete browser-saved defaults.")
	_help_disclosure("Build 0.9.14 · Viewport-first interface","The live battlefield and every editor now fill the window with their real 3D renderer. A compact workspace switcher opens Battlefield, Model Preview, Building Designer, and SFX Designer. Battlefield controls float above the map in focused cards for force status, radio traffic, time, objectives, the selected element, and the horizontal element rail. Model Preview, Building Designer, and SFX Designer use the same visual system while preserving their editing, import, export, audition, orbit, and preview controls.")
	_help_disclosure("Build 0.9.13 · Building generator build repair","Corrects the building generator syntax error that prevented the previous building and transport updates from compiling and deploying.")
	_help_disclosure("Build 0.9.12 · Reliable troop boarding","A carrier now keeps the selected squad locked through the boarding phase, closes any remaining gap without restarting pickup, and advances directly to its next passenger or destination after boarding. A stalled approach times out cleanly instead of alternating forever between boarding and pickup.")
	_help_disclosure("Build 0.9.11 · Building geometry and shape tools","Exterior walls, windows, doors and trim now use outward-facing four-vertex planes. Angled roofs use the footprint long axis, correct pitch length and a lower ridge. Seeds contain eight labeled two-digit controls for wall material, wall color, window type, window material, roof material, entrance placement, facade spacing and details. Every building has an entrance. The designer supports rectangular footprints and closed freeform outlines, with optional diagonal exterior walls. New presets cover parking garages, government buildings, apartments, houses, power stations, gas stations, grocery and department stores, and churches.")
	_help_disclosure("Build 0.9.10 · Exact 3D building preview","The Building Designer now uses a real orbitable Three.js viewport with drag rotation and wheel zoom. It consumes the same generated building parts and transform function as the battlefield renderer, so the preview is the building that appears in game. The modular kit now includes framed glazing, storefronts, industrial loading bays, facade bands, residential balconies, awnings, roof parapets and rooftop equipment while retaining low-poly instanced geometry.")
	_help_disclosure("Build 0.9.9 · Modular building system","Map footprints now generate deterministic industrial, commercial and residential buildings from separate four-meter wall, window, door, floor and roof parts. Nearby parts are rendered through five reusable instance batches, replacing the previous monolithic extrusion layers while source footprints still drive navigation and line of sight. The Building Designer tab creates footprints by dragging a grid, raises them floor by floor, previews deterministic facade and roof choices, and imports or exports extensible _buildings.json preset lists.")
	_help_disclosure("Build 0.9.8 · Infantry final approach","Infantry always completes the final 1.5 km into its assigned objective on foot, even when Motorcade Command cannot supply a carrier. Longer point-to-point moves still prefer personnel carriers, but a squad waiting 60 seconds without pickup marches for two minutes before trying transport again. Staff approvals are applied per squad so a distant carrier shortage cannot freeze troops already inside the capture approach.")
	_help_disclosure("Build 0.9.7 · Delegated command staff","Each force now has persistent Troop, Fuel, Motorcade, Air, Logistics and Fires subcommanders. Their readiness, authority, metrics, approvals and refusals appear in the Staff tab. Troop movement beyond 500 m requires Troop, Motorcade and Fuel approval; combat aircraft require Air approval and individual fuel clearance; fire support requires Fires approval. Logistics Command controls fuel-aware procurement, while every planning cycle records a combined staff review in radio traffic.")
	_help_disclosure("Build 0.9.6 · Weapon hand alignment","Detailed rifles, machine guns and launchers now receive the corrected 45-degree local attachment rotation from the soldier's weapon bone, aligning them with the updated hand and arm animations.")
	_help_disclosure("Build 0.9.5 · Sustainable fuel economy","Vehicle fuel burn now follows explicit operational ranges scaled to the 60 km theater. Trucks and helicopters can support theater-wide movement while armor depends on stocked forward vehicle bays for the deepest operations. Every mission retains a 15% recovery reserve, and impossible routes are refused with a forward-service reason. New vehicles arrive with commissioning fuel, while Fuel Command forecasts service, queued acquisitions and protected logistics reserves before approving more vehicles. Supply flights preserve total cargo capacity but shift toward fuel during shortages, and airfield-to-MOB transfers respond to actual aircraft and ground-force demand. The Logistics panel shows fuel on hand, inbound fuel, service commitments and protected reserves.")
	_help_disclosure("Build 0.9.4 · Combat lighting & rocket trails","Bullets and shells now render as warm emissive streaks that briefly light nearby terrain and units. Every shot produces a short muzzle flash with its own glow. AT, AA and aircraft missiles burn in flight and leave a finite smoke trail that expands, rises and fades after impact. Combat lights and trail particles use fixed pools, with tighter limits in Performance Mode.")
	_help_disclosure("Build 0.9.3 · Revised soldiers, SFX designer & logistics","On-foot units use the corrected Blender-authored low-poly rig with separate boots, shins, hands and fingers. Revised ready, passive, walk, cover and peek animations drive the body, AT troops receive their arm pose dynamically, and rifle, MG and launcher models attach from a separate weapon library through the rig's weapon bone. Scheduled airfield-to-MOB supply trucks no longer consume fuel. The main SFX Designer tab edits the repository sound bank, imports compatible _sfx.json files immediately, and exports the active bank. Model Preview can audition each vehicle engine with speed, distance, and listening-angle controls. Supply trucks queue at their MOB and transfer stock only after a crane visibly moves every container to a receiving trailer. MOB level 1 has one crane at 18 seconds per container. Level 2 costs 4,000 SP, takes 90 seconds, adds a second crane, and makes troop requisitions and unloading 50% faster. Level 3 costs 8,000 SP, takes 150 seconds, adds a third crane, a permanent raised helipad and upgraded vehicle-bay equipment, and makes selected trucks, tanks and helicopters 25% cheaper and faster to requisition. The same marked austere pad supports MOB helicopter landings at levels 1 and 2; one helicopter uses it at a time while others hold clear. Requisitioned ground vehicles emerge one at a time through the MOB garage and enter service only after clearing its door. Units can pass through one another while terrain and building navigation remain active. Select a controlled infantry squad to order the nearest eligible personnel vehicle within 150 m to pick it up. Get In uses normal approach and boarding; Dismount unloads passengers one soldier at a time. Dismount all incl. crew deliberately abandons the vehicle and creates its surviving crew on foot. Manually attached ground carriers continue following and supporting their squad after passenger dismount.")
	_help_disclosure("Build 0.6 · airfield tiers & landing assaults","Frame-synchronized rear asset tracking. Commander-only starts and empty depots. Recurring external supplies support expansion without free starting units. Tanks cost 8,000 SP; jets cost 16,000 SP. Engine-running fuel consumption, ammunition expenditure and damage persist until stock-consuming service at the correct facility. Tier 1: one strip, one forklift, one delivery truck. Tier 2: one strip, two forklifts, two trucks. Tier 3: two strips, four forklifts, four trucks with two trailers each. Only fully dismounted active infantry can capture. Vehicle fuel burn is doubled; refueling and rearming take three times as long (60 seconds empty-to-full with sufficient stock). Repair speed is unchanged. No FOB construction in this build.")
	_help_disclosure("Build 0.4 · city-wide operations","RED stages near San Pasqual and BLU near San Ysidro, with ten neutral objectives. Added forklifts, cargo aircraft, troop and heavy-lift helicopters, light troop carriers, UAV jammers and AA teams. APCs now use eight wheels; IFVs retain tracks and an autocannon. Corrected knee articulation and retained bodies and wrecks for the operation. Terrain streams independently in bounded sectors; units hold when collision data is unavailable. Strategic travel uses a staging corridor with local obstacle avoidance, not a turn-by-turn road-traffic service. Detailed terrain still depends on external map tiles and GPU capability.")

func _help_disclosure(title: String, text: String) -> void:
	var section := _column(drawer_actions)
	var button := _button("▸ "+title,func(): pass,section); button.alignment = HORIZONTAL_ALIGNMENT_LEFT; _bare(button)
	var body := _paragraph(section,text,440); body.hide()
	button.pressed.connect(func(): body.visible = not body.visible; button.text = ("▾ " if body.visible else "▸ ")+title)

func _add_force_roster(side: String) -> void:
	drawer_roster_ids = side
	drawer_actions.add_child(_label("CURRENT FORCE",9,MUTED))
	for record in world.core.units.get(side,[]):
		if float(record.get("hp",100.0)) <= 0.0: continue
		var id := str(record.get("id",""))
		drawer_roster_ids += "|"+id
		var role := str(record.get("role","")).replace("_"," ").capitalize()
		var visual: CombatUnit = world.visual_core_units.get(id)
		var callsign := visual.call_sign if visual != null else id
		var button := _button("%s\n%s · %d personnel" % [callsign,role,int(record.get("members",0))],func(): _select_roster_unit(id),drawer_actions)
		button.alignment = HORIZONTAL_ALIGNMENT_LEFT
		button.tooltip_text = "Inspect and select this element"

func _select_roster_unit(id: String) -> void:
	var visual: CombatUnit = world.visual_core_units.get(id)
	if visual == null: return
	world.select_unit(visual,false)
	world.focus_selection()

func _unit_side(unit: CombatUnit) -> String:
	return "BLU" if unit.team == 0 else "RED"

func _core_unit(side: String, id: String) -> Dictionary:
	return world.core._unit(side,id)

func _passengers(record: Dictionary) -> Array:
	var result: Array = []
	var side := str(record.get("side",""))
	for id in record.get("transport",{}).get("passengers",[]):
		var passenger := _core_unit(side,str(id))
		if not passenger.is_empty() and float(passenger.get("hp",100.0)) > 0.0: result.append(passenger)
	return result

func _nearest_boarding_transport(unit: CombatUnit) -> Dictionary:
	var record: Dictionary = unit.core_record
	if SimulationCore.is_vehicle(str(record.get("role",""))) or str(record.get("role","")) == "COMMAND" or not record.get("transport",{}).is_empty(): return {}
	var best: Dictionary = {}
	var best_distance := INF
	var side := _unit_side(unit)
	for carrier in world.core.units.get(side,[]):
		var role := str(carrier.get("role",""))
		if not SimulationCore.TRANSPORT_CAPACITY.has(role) or carrier.get("moving",false) or float(carrier.get("hp",100.0)) <= 0.0: continue
		var occupied := 0
		for passenger in _passengers(carrier): occupied += int(passenger.get("members",0))
		if occupied+int(record.get("members",0)) > int(SimulationCore.TRANSPORT_CAPACITY[role]): continue
		var distance: float = record.get("position",unit.position).distance_to(carrier.get("position",Vector3.ZERO))
		if distance <= 0.18 and distance < best_distance: best = carrier; best_distance = distance
	return best

func _carrier_for(record: Dictionary) -> Dictionary:
	var id := str(record.get("transport",{}).get("carrier",""))
	return {} if id.is_empty() else _core_unit(str(record.get("side","")),id)

func _request_boarding(passenger_id: String, carrier_id: String, side: String) -> void:
	if world.core.embark(side,passenger_id,carrier_id):
		world.notify("Manual vehicle pickup ordered.")
	else:
		world.notify("Move the squad within 18 m of a stopped friendly carrier with free seats.")

func _request_passenger_dismount(record: Dictionary, include_crew: bool = false) -> void:
	var side := str(record.get("side",""))
	var accepted: bool = world.core.request_dismount(side,str(record.get("id","")),include_crew)
	world.notify(("Passenger and crew dismount ordered." if include_crew else "Passenger dismount ordered.") if accepted else "The carrier must stop before passengers can dismount.")

func _deploy_jammer(record: Dictionary) -> void:
	var error: String = world.core.deploy_jammer(str(record.get("side","")),str(record.get("id","")))
	if error.is_empty():
		world._sync_core_visuals()
		world.notify("UAV jammer construction started. Coverage online in 15 seconds.")
	else:
		world.notify(error)

func _rebuild_inspector_actions(unit: CombatUnit, record: Dictionary) -> void:
	var boarding := _nearest_boarding_transport(unit)
	var carrier := _carrier_for(record)
	var passengers := _passengers(record)
	var signature := "%s|%s|%s|%d" % [record.get("id",""),boarding.get("id",""),carrier.get("id",""),passengers.size()]
	if signature == inspector_action_signature: return
	inspector_action_signature = signature
	for child in inspector_actions.get_children(): child.free()
	if not boarding.is_empty():
		_button("Get in · "+str(boarding.get("id","carrier")),func(): _request_boarding(str(record.get("id","")),str(boarding.get("id","")),str(record.get("side",""))),inspector_actions)
	if not carrier.is_empty() or not passengers.is_empty():
		_button("Dismount passengers",func(): _request_passenger_dismount(record),inspector_actions)
	if not carrier.is_empty() and not str(carrier.get("role","")) in SimulationCore.AIR:
		var destructive := _button("Dismount all incl. crew",func(): _request_passenger_dismount(record,true),inspector_actions)
		destructive.add_theme_color_override("font_color",RED)
	var role := str(record.get("role",""))
	if role in ["LOGISTICS","RIFLE","SCOUT","MG","AT","ENGINEER"] and not record.get("transport",{}).has("carrier") and float(record.get("hp",100.0)) > 0.0:
		_button("Deploy UAV jammer · 200 SP",func(): _deploy_jammer(record),inspector_actions)

func _logistics_action(ok: bool) -> void:
	world.notify("Construction queued." if ok else "Unavailable: check ownership, existing construction and SP reserve.")
func _set_side(side: String) -> void:
	world.active_side = side; rail_ids = ""; refresh = 0
	if drawer.visible and drawer_tab == "Forces": call_deferred("open_drawer","Forces")
func toggle_help() -> void:
	open_drawer("Help")
func close_panels() -> void:
	if menu.visible and UpdateService.phase == "applied": update_applied_acknowledged = true
	UpdateService.set_meta("update_menu_open",false)
	menu.hide(); drawer.hide()
	modal_backdrop.hide()
	world.camera.input_enabled = true

func _refresh_drawer() -> void:
	var text := ""
	if drawer_tab == "Help":
		text = "An autonomous battlefield. Two commanders. One theater of operations."
	elif drawer_tab == "Map":
		text = "[b]GLOBAL MAP[/b]\n\nPan and zoom anywhere in the world, or enter a longitude and latitude below. Geographic roads, water and buildings stream around the camera.\n\nSan Diego is the current operation theater. It keeps its simulation state while you explore. Its units and installations are hidden outside the theater. Click the minimap, an objective or Return to current theater to resume the operation view.\n\nNew areas require a connection; recently visited tiles remain cached."
	elif drawer_tab == "Settings":
		text = "Balance visual detail with your device’s rendering budget."
	elif drawer_tab == "Restart":
		text = "The current battle will be discarded. Both sides reset to one commander, 2,000 SP, and empty depots with a new simulation seed."
	else:
		for side in ["BLU","RED"]:
			var f: Dictionary = world.core.forces[side]
			text += "[color=%s][b]%s · %s COMMAND[/b][/color]\n" % ["#7dbcff" if side == "BLU" else "#ff8080",side,"SABER" if side == "BLU" else "VIPER"]
			if drawer_tab == "Forces":
				text += "%s\nOPERATIONAL TEMPO %d%%\nCURRENT ORDER · %s / OBJ %s\n%s\nCasualties %d · delivered %d\n" % [world.core.force_report(side),f["tempo"],f["action"],f["target"],f["purchase"],f["casualties"],f["delivered"]]
				for unit in world.core.units[side]: text += "  %s · %s · HP %d\n" % [unit["id"],unit["role"],unit.get("hp",100)]
			elif drawer_tab == "Logistics":
				for site in ["pending","airfield","mob"]:
					var stock: Dictionary = world.core.depots[side][site]
					text += "%s   FUEL %d   AMMO %d   REPAIR %d\n" % [site.to_upper(),stock["fuel"],stock["ammo"],stock["repair"]]
				for site in ["MOB","AIRFIELD"]:
					var state: Dictionary = world.core.mobs[side] if site == "MOB" else world.core.airfields[side]
					text += "%s T%d%s\n" % [site,state["tier"]," · upgrading %ds" % ceili(float(state["upgrade"]["due"])-world.core.time) if not state["upgrade"].is_empty() else ""]
				for item in f["queue"]: text += "QUEUED %s · %ds\n" % [item["role"],ceili(float(item["due"])-world.core.time)]
				text += "Next scheduled cargo · %ds\n" % ceili(world.core.next_supply-world.core.time)
				for id in world.core.objectives:
					var objective: Dictionary = world.core.objectives[id]
					if objective["owner"] == side: text += "OBJ %s · %s\n" % [id,", ".join(objective["facilities"].keys()) if not objective["facilities"].is_empty() else "no forward facilities"]+"FUEL %d · AMMO %d · REPAIR %d\n" % [objective["stock"]["fuel"],objective["stock"]["ammo"],objective["stock"]["repair"]]
			else:
				var council: Dictionary = world.commander_director.council_for(side) if world.commander_director != null else {}
				var reports: Dictionary = council.get("reports",{})
				if reports.is_empty():
					for report in world.core.staff_reports(side): text += "[b]%s[/b] · %s\n%s\n\n" % [report["name"],report["status"],report["detail"]]
				else:
					text += "%s · OBJECTIVE %s · REV %d\n\n" % [council.get("action","ASSESS"),council.get("target","—"),council.get("revision",0)]
					for id in ["TROOPS","FUEL","MOTORCADE","AIR","LOGISTICS","FIRES"]:
						var report: Dictionary = reports.get(id,{})
						if report.is_empty(): continue
						text += "[b]%s[/b] · %s\n%s · %s\n\n" % [report.get("name",id),report.get("status","HOLD"),report.get("reason","No report."),"decision authority" if report.get("required",false) else "advisory"]
			text += "\n"
	drawer_text.text = text

func _process(delta: float) -> void:
	_refresh_inline_update(delta)
	queue_redraw(); refresh -= delta
	if refresh > 0 or world == null: return
	refresh = 0.2
	brand_subtitle.text = "San Diego · City theater" if world.operation_view_active else "Global map · outside theater"
	radio_panel.offset_top = force_panel.position.y + force_panel.size.y + 12
	clock_label.text = "%02d:%02d:%02d" % [int(world.elapsed)/3600,(int(world.elapsed)/60)%60,int(world.elapsed)%60]
	pause_button.text = "▷" if world.paused else "Ⅱ"
	pause_banner.text = world.mission_state if world.mission_state != "ACTIVE" else "PAUSED" if world.paused else ""
	for value in speed_buttons: speed_buttons[value].modulate = BLUE if is_equal_approx(world.speed,float(value)) else INK
	var side: String = world.active_side
	var f: Dictionary = world.core.forces[side]
	var members := 0; var groups := 0
	var ids := side
	for unit in world.units:
		if not unit.is_alive or unit.team != (0 if side == "BLU" else 1): continue
		groups += 1; members += int(unit.core_record.get("members",0)); ids += str(unit.core_record.get("id",""))
	for key in side_buttons:
		var active: bool = key == side
		var fill := Color(0.49,0.737,1.0,0.2) if key == "BLU" else Color(1,0.5,0.5,0.16)
		var tab_style := _style(fill if active else Color.TRANSPARENT,5); tab_style.set_border_width_all(0)
		side_buttons[key].add_theme_stylebox_override("normal",tab_style)
		side_buttons[key].add_theme_color_override("font_color",INK if active else MUTED)
	force_title.text = "Saber Command" if side == "BLU" else "Viper Command"
	force_identity.text = side+" · TF "+("SABER" if side == "BLU" else "VIPER")
	force_metrics.text = str(members)
	group_value.text = "/ %d" % groups
	supply_value.text = String.num_int64(int(f["sp"]))
	tempo_value.text = "%d / 100" % f["tempo"]
	tempo_value.add_theme_color_override("font_color",AMBER if f["tempo"] >= 85 else BLUE)
	tempo_note.visible = f["tempo"] >= 85
	tempo_bar.value = f["tempo"]
	order_label.text = "%s · OBJ %s" % [f["action"],f["target"]]
	var feed := ""
	var filter := radio_filter.get_item_text(radio_filter.selected).to_lower()
	var events: Array = world.core.radio
	for index in range(events.size()-1,maxi(-1,events.size()-26),-1):
		var event: Dictionary = events[index]
		var event_type := str(event.get("type",""))
		if filter != "all" and not (filter == "contact" and event_type in ["contact","combat"]) and event_type != filter: continue
		var badge := "#503237" if event["side"] == "RED" else "#283e54" if event["side"] == "BLU" else "#343940"
		feed += "[font_size=9][color=#98a4ad]%02d:%02d:%02d[/color]   [bgcolor=%s][color=#eef2f5] %s [/color][/bgcolor][/font_size]\n%s\n[color=#38414a]────────────────────────────────[/color]\n" % [int(event["time"])/3600,(int(event["time"])/60)%60,int(event["time"])%60,badge,event["side"],event["text"]]
	radio_text.text = feed
	if ids != rail_ids:
		rail_ids = ids; rail_buttons.clear()
		for child in rail.get_children(): child.queue_free()
		for unit in world.units:
			if not unit.is_alive or unit.team != (0 if side == "BLU" else 1): continue
			var button := _button("",func(): world.select_unit(unit,false),rail)
			button.custom_minimum_size = Vector2(154,75); button.alignment = HORIZONTAL_ALIGNMENT_LEFT; button.clip_text = true; button.text_overrun_behavior = TextServer.OVERRUN_TRIM_ELLIPSIS
			for state in ["font_color","font_hover_color","font_pressed_color"]: button.add_theme_color_override(state,Color.TRANSPARENT)
			var name_label := _label("",9,INK); _mono(name_label,9); name_label.position = Vector2(23,10); name_label.size.x = 121; name_label.clip_text = true; button.add_child(name_label); button.set_meta("name_label",name_label)
			var dot := ColorRect.new(); dot.color = BLUE if unit.team == 0 else RED; dot.position = Vector2(10,14); dot.size = Vector2(6,6); dot.mouse_filter = Control.MOUSE_FILTER_IGNORE; button.add_child(dot)
			var detail := _label("",9,Color("b3bfc8")); detail.position = Vector2(10,30); detail.size.x = 134; detail.clip_text = true; button.add_child(detail); button.set_meta("detail",detail)
			var health_bar := ProgressBar.new(); health_bar.show_percentage = false; health_bar.position = Vector2(10,57); health_bar.size = Vector2(108,3); health_bar.mouse_filter = Control.MOUSE_FILTER_IGNORE; health_bar.add_theme_stylebox_override("background",_track_style(Color(1,1,1,0.14))); health_bar.add_theme_stylebox_override("fill",_track_style(BLUE if unit.team == 0 else RED)); button.add_child(health_bar); button.set_meta("health_bar",health_bar)
			var health_label := _label("",8,INK); _mono(health_label,8); health_label.position = Vector2(122,52); button.add_child(health_label); button.set_meta("health_label",health_label)
			rail_buttons[str(unit.core_record["id"])] = button
	for id in rail_buttons:
		var unit: CombatUnit = world.visual_core_units.get(id)
		if unit != null:
			var record: Dictionary = unit.core_record
			rail_buttons[id].text = "%s\n%s · %d/%d\nCONDITION %d%%" % [unit.call_sign,unit.role.replace("_"," ").to_lower(),record.get("members",0),SimulationCore.CATALOG.get(unit.role,[record.get("members",0)])[0],unit.health]
			var card: Button = rail_buttons[id]
			card.get_meta("name_label").text = unit.call_sign
			card.get_meta("detail").text = "%s · %d/%d" % [unit.role.replace("_"," ").to_lower(),record.get("members",0),SimulationCore.CATALOG.get(unit.role,[record.get("members",0)])[0]]
			card.get_meta("health_bar").value = unit.health
			card.get_meta("health_label").text = "%d" % unit.health
			var card_style := _style(Color("1b3f6b") if unit.selected and unit.team == 0 else Color("5c242d") if unit.selected else Color(0.039,0.055,0.075,0.95),9)
			if unit.selected: card_style.border_color = BLUE if unit.team == 0 else RED
			card.add_theme_stylebox_override("normal",card_style)
	rail_label.text = "%s ELEMENTS · %d     %d LOST" % [side,groups,int(f.get("casualties",0))]
	for id in objective_buttons:
		var owner: String = world.objective_owner[id]
		objective_buttons[id].modulate = BLUE if owner == "BLU" else RED if owner == "RED" else MUTED
	inspector.visible = not world.selected_units.is_empty()
	if not inspector.visible: inspector_action_signature = ""
	if inspector.visible:
		var unit: CombatUnit = world.selected_units[0]
		var record: Dictionary = unit.core_record
		inspector_type.text = ("BLU" if unit.team == 0 else "RED")+" · "+unit.role.replace("_"," ")
		inspector_title.text = unit.call_sign
		inspector_follow.text = "● Camera following unit" if unit.is_alive else "● Last known position"
		inspector_phase.text = ("ELEMENT LOST" if not unit.is_alive else unit.order)+" · "+str(record.get("target",f["target"]))
		inspector_metrics[0].text = "%d%%" % unit.health
		inspector_metrics[1].text = "%d%%" % record.get("ammo",100)
		inspector_metrics[2].text = "%d / %d" % [record.get("members",0),SimulationCore.CATALOG.get(unit.role,[record.get("members",0)])[0]]
		var details := ""
		inspector_fuel.visible = SimulationCore.is_vehicle(unit.role)
		if SimulationCore.is_vehicle(unit.role):
			inspector_fuel.text = "Fuel %d%% — %s" % [record.get("fuel",100),"engine running" if record.get("engine",record.get("moving",false)) else "engine off"]
			inspector_fuel.add_theme_color_override("font_color",AMBER if float(record.get("fuel",100)) <= 15 else BLUE)
			details += "Servicing                  %s\n" % record.get("service","READY")
		var carrier := _carrier_for(record)
		if not carrier.is_empty(): details += "Embarked                  %s\n" % carrier.get("id","carrier")
		var passengers := _passengers(record)
		if not passengers.is_empty():
			var names: Array[String] = []
			var occupied := 0
			for passenger in passengers:
				names.append(str(passenger.get("id","squad")))
				occupied += int(passenger.get("members",0))
			details += "Manifest                   %s\n" % ", ".join(names)
			details += "Seats                        %d / %d\n" % [occupied,int(SimulationCore.TRANSPORT_CAPACITY.get(unit.role,0))]
		if not record.get("transport",{}).is_empty(): details += "Status                       %s\n" % str(record.get("transport",{}).get("phase","available")).replace("-"," ")
		inspector_text.text = details
		_rebuild_inspector_actions(unit,record)

		carrier_actions.visible = unit.role == "AIRCRAFT_CARRIER"
		if carrier_actions.visible:
			var maritime: Dictionary = record["maritime"]
			inspector_text.text += "\nDECK %s · %d aircraft\n%s" % [str(maritime.get("phase","moving")).to_upper(),maritime.get("sorties",0),"Transition %ds" % ceili(float(maritime["due"])-world.core.time) if maritime.has("due") else ""]
			launch_button.disabled = not world.core.carrier_can_launch("BLU" if unit.team == 0 else "RED",str(record["id"]))
	toast.text = world.message if world.message_time > 0 else ""
	diagnostics.text = "%d FPS · %d ELEMENTS · NATIVE" % [Engine.get_frames_per_second(),world.units.size()]
	var complete: bool = str(world.mission_state) != "ACTIVE"
	victory_panel.visible = complete
	if complete:
		victory_title.text = "MUTUAL COMMAND LOSS" if world.mission_state == "DRAW" else world.mission_state.replace(" VICTORY","")+" FORCE VICTORIOUS"
		victory_detail.text = "Operation ended at %02d:%02d." % [int(world.elapsed)/60,int(world.elapsed)%60]
	if drawer.visible:
		if drawer_tab == "Forces":
			var roster_ids: String = str(world.active_side)
			for record in world.core.units.get(world.active_side,[]):
				if float(record.get("hp",100.0)) > 0.0: roster_ids += "|"+str(record.get("id",""))
			if roster_ids != drawer_roster_ids:
				call_deferred("open_drawer","Forces")
				return
		_refresh_drawer()

func _draw() -> void:
	if world == null or world.camera == null or not world.operation_view_active: return
	var font := ThemeDB.fallback_font
	if world.selection_drag:
		var rect := Rect2(world.drag_start,world.drag_end-world.drag_start).abs()
		draw_rect(rect,Color(0.49,0.74,1,0.12)); draw_rect(rect,BLUE,false,1)
	if world.camera.distance > 100.0 and not world.geography_active:
		var corridor: Array = world.map.get_corridor()
		for i in range(corridor.size()-1):
			if not world.camera.is_position_behind(corridor[i]) and not world.camera.is_position_behind(corridor[i+1]):
				draw_line(world.camera.unproject_position(corridor[i]),world.camera.unproject_position(corridor[i+1]),Color("314252"),1.0,true)
	for objective in world.map.get_objectives():
		var point: Vector3 = objective["pos"]
		if world.camera.is_position_behind(point): continue
		var screen: Vector2 = world.camera.unproject_position(point)
		var owner: String = world.objective_owner.get(objective["id"],"")
		var color := BLUE if owner == "BLU" else RED if owner == "RED" else MUTED
		draw_rect(Rect2(screen-Vector2(10,10),Vector2(20,20)),Color("0a0e13"))
		draw_rect(Rect2(screen-Vector2(10,10),Vector2(20,20)),color,false,1)
		draw_string(font,screen+Vector2(-4,4),objective["id"],HORIZONTAL_ALIGNMENT_LEFT,-1,11,color)
	for unit in world.units:
		if not unit.is_alive or unit.core_record.get("transport",{}).has("carrier"): continue
		var center: Vector3 = unit.position+Vector3.UP*(unit.altitude+0.02)
		if world.camera.is_position_behind(center): continue
		var screen: Vector2 = world.camera.unproject_position(center)
		if not Rect2(Vector2.ZERO,size).has_point(screen): continue
		var color := BLUE if unit.team == 0 else RED
		draw_rect(Rect2(screen-Vector2(6,6),Vector2(12,12)),Color("0a0e13"))
		draw_rect(Rect2(screen-Vector2(6,6),Vector2(12,12)),color,false,1)
		if unit.role == "COMMAND": draw_string(font,screen+Vector2(-4,4),"★",HORIZONTAL_ALIGNMENT_LEFT,-1,10,color)
		if unit.selected or world.camera.distance < 20:
			draw_string(font,screen+Vector2(9,3),unit.call_sign,HORIZONTAL_ALIGNMENT_LEFT,-1,10,color)
		if (unit.selected or world.show_routes) and not unit.route.is_empty():
			var previous := screen
			for waypoint in unit.route:
				if world.camera.is_position_behind(waypoint): continue
				var next: Vector2 = world.camera.unproject_position(waypoint)
				draw_line(previous,next,Color(color,0.35),1,true); previous = next
	if world.show_grid:
		for x in range(-140,160,20):
			var a := Vector3(x,0,-330); var b := Vector3(x,0,335)
			if not world.camera.is_position_behind(a) and not world.camera.is_position_behind(b): draw_line(world.camera.unproject_position(a),world.camera.unproject_position(b),Color(0.3,0.4,0.5,0.2),1)
