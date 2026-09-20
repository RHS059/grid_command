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
var tempo_label: Label
var tempo_bar: ProgressBar
var order_label: Label
var radio_text: RichTextLabel
var radio_filter: OptionButton
var inspector: PanelContainer
var inspector_title: Label
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
	panel.add_theme_stylebox_override("panel",_style(Color(0.039,0.055,0.075,0.94)))
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

func _build_workspace() -> void:
	var brand := _panel(self,Rect2(20,20,296,58))
	workspace_button = _button("◉   GRID COMMAND                         ≡\nGlobal map · San Diego theater",func(): menu.visible = not menu.visible,brand)
	menu = _panel(self,Rect2(20,86,296,320))
	menu.z_index = 20
	var box := _column(menu)
	_button("Battlefield                                      F1",close_panels,box)
	_button("Go to map location",func(): open_drawer("Map"),box)
	_button("Command center",func(): open_drawer("Forces"),box)
	_button("Graphics & settings",func(): open_drawer("Settings"),box)
	_button("Controls & help",toggle_help,box)
	_button("New operation",func(): world.get_tree().reload_current_scene(),box)
	box.add_child(_label("Model Preview and SFX Designer\nremain browser workspaces.",10,MUTED))
	menu.hide()

func _build_force() -> void:
	var panel := _panel(self,Rect2(20,90,296,282))
	var box := _column(panel)
	var switch := _row(box)
	for side in ["BLU","RED"]:
		var button := _button("■  "+side,func(): _set_side(side),switch)
		button.size_flags_horizontal = Control.SIZE_EXPAND_FILL
		side_buttons[side] = button
	force_title = _button("SABER command  ↗",func(): world.focus_theater_point(world.map.bases[world.active_side]),box)
	force_metrics = _label("",17,INK); box.add_child(force_metrics)
	tempo_label = _label("",10,MUTED); box.add_child(tempo_label)
	tempo_bar = ProgressBar.new(); tempo_bar.show_percentage = false; tempo_bar.custom_minimum_size.y = 3; tempo_bar.max_value = 100.0; box.add_child(tempo_bar)
	tempo_bar.add_theme_stylebox_override("fill",_track_style(AMBER))
	var current := _row(box)
	order_label = _label("",10,INK); order_label.size_flags_horizontal = Control.SIZE_EXPAND_FILL; current.add_child(order_label)
	_button("Change",func(): open_drawer("Forces"),current)
	var radio_panel := _panel(self,Rect2(20,384,296,280))
	radio_panel.anchor_bottom = 1.0; radio_panel.offset_bottom = -132
	var radio_box := _column(radio_panel)
	var header := _row(radio_box)
	header.add_child(_label("RADIO TRAFFIC",10,MUTED))
	radio_filter = OptionButton.new()
	for text in ["All","Command","Contact","Logistics"]: radio_filter.add_item(text)
	header.add_child(radio_filter)
	radio_text = _rich(radio_box,Vector2(270,120))

func _build_time() -> void:
	var clock := _panel(self,Rect2(-69,20,138,56),Vector2(0.5,0))
	var box := _column(clock)
	var caption := _label("ELAPSED",9,MUTED); caption.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER; box.add_child(caption)
	clock_label = _label("00:00",18,INK); clock_label.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER; box.add_child(clock_label)
	var controls := _panel(self,Rect2(-171,84,342,38),Vector2(0.5,0))
	var row := _row(controls)
	pause_button = _button("Pause",world.toggle_pause,row)
	_button("Step",world.step_once,row)
	for value in [1,2,4,8,16]: speed_buttons[value] = _button(str(value)+"×",func(): world.set_speed(float(value)),row)
	var objectives := _panel(self,Rect2(-177,130,354,38),Vector2(0.5,0))
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
	inspector = _panel(self,Rect2(-340,20,320,430),Vector2(1,0))
	inspector.z_index = 22
	var box := _column(inspector)
	var heading := _row(box)
	inspector_title = _label("",11,INK); inspector_title.size_flags_horizontal = Control.SIZE_EXPAND_FILL; inspector_title.clip_text = true; inspector_title.text_overrun_behavior = TextServer.OVERRUN_TRIM_ELLIPSIS; heading.add_child(inspector_title)
	_button("×",world.clear_selection,heading)
	inspector_phase = _label("READY",11,INK)
	inspector_phase.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
	box.add_child(inspector_phase)
	var metrics := HBoxContainer.new(); metrics.add_theme_constant_override("separation",7); box.add_child(metrics)
	for caption in ["CONDITION","AMMUNITION","PERSONNEL"]:
		var card := PanelContainer.new(); card.size_flags_horizontal = Control.SIZE_EXPAND_FILL; card.custom_minimum_size.x = 84; card.add_theme_stylebox_override("panel",_style(Color("151d25"),7)); metrics.add_child(card)
		var column := _column(card)
		var value := _label("100%",15,Color("9ad7a6") if caption == "CONDITION" else RED if caption == "AMMUNITION" else BLUE)
		column.add_child(value); inspector_metrics.append(value)
		column.add_child(_label(caption,9,MUTED))
	inspector_text = _rich(box,Vector2(296,155))
	inspector_actions = _column(box)
	carrier_actions = _row(box)
	_button("Deploy",func(): world.carrier_action("deploying"),carrier_actions)
	_button("Undeploy",func(): world.carrier_action("undeploying"),carrier_actions)
	launch_button = _button("Launch",func(): world.carrier_action("launch"),carrier_actions)
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
	rail_area.offset_left = 332; rail_area.offset_right = -222; rail_area.offset_top = -118; rail_area.offset_bottom = -16
	rail_label = _label("BLU ELEMENTS · 0     0 LOST",9,INK)
	rail_area.add_child(rail_label)
	rail_area.clip_contents = true
	var scroll := ScrollContainer.new(); scroll.clip_contents = true; scroll.size_flags_horizontal = Control.SIZE_EXPAND_FILL; scroll.custom_minimum_size.y = 83; scroll.horizontal_scroll_mode = ScrollContainer.SCROLL_MODE_AUTO; scroll.vertical_scroll_mode = ScrollContainer.SCROLL_MODE_DISABLED; rail_area.add_child(scroll)
	rail = _row(scroll)

func _build_drawer() -> void:
	drawer = _panel(self,Rect2(0,0,430,1000))
	drawer.anchor_bottom = 1; drawer.offset_bottom = 0; drawer.z_index = 30
	var box := _column(drawer)
	var heading := _row(box)
	var title := _label("COMMAND CENTER",16,INK); title.size_flags_horizontal = Control.SIZE_EXPAND_FILL; heading.add_child(title)
	_button("×",close_panels,heading)
	var tabs := _row(box)
	for tab in ["Forces","Logistics","Staff"]: _button(tab,func(): open_drawer(tab),tabs)
	var scroll := ScrollContainer.new()
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
	box.add_child(_label("LOCAL COMMANDERS · BLU / RED OBSERVER",9,MUTED))
	drawer.hide()

func open_drawer(tab: String) -> void:
	drawer_tab = tab; drawer.show(); menu.hide()
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
		var shadows := CheckButton.new(); shadows.text = "Sun shadows"; shadows.button_pressed = world.shadow_enabled; shadows.toggled.connect(world.set_shadows); drawer_actions.add_child(shadows)
		var fresnel := CheckButton.new(); fresnel.text = "Unit contour light"; fresnel.button_pressed = world.fresnel_enabled; fresnel.toggled.connect(world.set_fresnel); drawer_actions.add_child(fresnel)
		_button("Check for updates",UpdateService.check_for_updates,drawer_actions)
		_button("Apply available update",UpdateService.apply_update,drawer_actions)
		_button("Native releases",UpdateService.open_native_download,drawer_actions)
	_refresh_drawer()

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
	var general := _row(inspector_actions)
	_button("Focus",world.focus_selection,general)
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
	menu.hide(); drawer.hide()
	world.camera.input_enabled = true

func _refresh_drawer() -> void:
	var text := ""
	if drawer_tab == "Help":
		text = "[b]CONTROLS & HELP[/b]\n\nLeft click · inspect either side\nLeft drag · pan the map\nRight drag · orbit the 3D view\nW A S D / arrows · pan camera\nWheel / + / − · zoom\nSpace · pause / resume\n1 / 2 / 4 / 8 · simulation speed\nStep · pause and advance 0.05 s\nO · overview\nG · grid    F9 · routes\nEsc · close panels / clear selection\nCtrl + R · new operation\n\nCapture needs six active dismounted infantry within 100 m, unopposed for eight seconds. Hold every objective for 60 seconds to win. Both commanders operate autonomously.\n\nCarrier deck: stop 8 s, deploy 20 s, undeploy 15 s. Only a stationary deployed carrier can launch; fuel, ammunition, aircraft inventory and deck interval also apply."
	elif drawer_tab == "Map":
		text = "[b]GLOBAL MAP[/b]\n\nPan and zoom anywhere in the world, or enter a longitude and latitude below. Geographic roads, water and buildings stream around the camera.\n\nSan Diego is the current operation theater. It keeps its simulation state while you explore. Its units and installations are hidden outside the theater. Click the minimap, an objective or Return to current theater to resume the operation view.\n\nNew areas require a connection; recently visited tiles remain cached."
	elif drawer_tab == "Settings":
		text = "[b]GRAPHICS & SETTINGS[/b]\n\nProduction GLB materials retain their source textures. Unit contour light is a subtle Fresnel overlay. Source buildings stream in bounded sectors.\n\n[b]UPDATES · %s[/b]\n%s\n\n%s" % [UpdateService.current_version,UpdateService.status_text,"An update keeps compatible operation state."]
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
	queue_redraw(); refresh -= delta
	if refresh > 0 or world == null: return
	refresh = 0.2
	workspace_button.text = "◉   GRID COMMAND                         ≡\n"+("Global map · San Diego theater" if world.operation_view_active else "Global map · outside current theater")
	clock_label.text = "%02d:%02d" % [int(world.elapsed)/60,int(world.elapsed)%60]
	pause_button.text = "Resume" if world.paused else "Pause"
	pause_banner.text = world.mission_state if world.mission_state != "ACTIVE" else "PAUSED" if world.paused else ""
	for value in speed_buttons: speed_buttons[value].modulate = BLUE if is_equal_approx(world.speed,float(value)) else INK
	var side: String = world.active_side
	var f: Dictionary = world.core.forces[side]
	var members := 0; var groups := 0
	var ids := side
	for unit in world.units:
		if not unit.is_alive or unit.team != (0 if side == "BLU" else 1): continue
		groups += 1; members += int(unit.core_record.get("members",0)); ids += str(unit.core_record.get("id",""))
	for key in side_buttons: side_buttons[key].modulate = (BLUE if key == "BLU" else RED) if key == side else MUTED
	force_title.text = ("SABER" if side == "BLU" else "VIPER")+" command  ↗"
	force_metrics.text = "%d personnel / %d groups\n%d SP" % [members,groups,f["sp"]]
	tempo_label.text = "Operational tempo                         %d%%" % f["tempo"]
	tempo_bar.value = f["tempo"]
	order_label.text = "CURRENT ORDER\n%s / OBJ %s" % [f["action"],f["target"]]
	var feed := ""
	var filter := radio_filter.get_item_text(radio_filter.selected).to_lower()
	var events: Array = world.core.radio
	for index in range(events.size()-1,maxi(-1,events.size()-26),-1):
		var event: Dictionary = events[index]
		var event_type := str(event.get("type",""))
		if filter != "all" and not (filter == "contact" and event_type in ["contact","combat"]) and event_type != filter: continue
		feed += "[color=#98a4ad]%02d:%02d  %s[/color]\n%s\n\n" % [int(event["time"])/60,int(event["time"])%60,event["side"],event["text"]]
	radio_text.text = feed
	if ids != rail_ids:
		rail_ids = ids; rail_buttons.clear()
		for child in rail.get_children(): child.queue_free()
		for unit in world.units:
			if not unit.is_alive or unit.team != (0 if side == "BLU" else 1): continue
			var button := _button("",func(): world.select_unit(unit,false),rail)
			button.custom_minimum_size = Vector2(154,75); button.alignment = HORIZONTAL_ALIGNMENT_LEFT; button.clip_text = true; button.text_overrun_behavior = TextServer.OVERRUN_TRIM_ELLIPSIS
			rail_buttons[str(unit.core_record["id"])] = button
	for id in rail_buttons:
		var unit: CombatUnit = world.visual_core_units.get(id)
		if unit != null:
			var record: Dictionary = unit.core_record
			rail_buttons[id].text = "%s\n%s · %d/%d\nCONDITION %d%%" % [unit.call_sign,unit.role.replace("_"," ").to_lower(),record.get("members",0),SimulationCore.CATALOG.get(unit.role,[record.get("members",0)])[0],unit.health]
			rail_buttons[id].modulate = (BLUE if unit.team == 0 else RED) if unit.selected else INK
	rail_label.text = "%s ELEMENTS · %d     %d LOST" % [side,groups,int(f.get("casualties",0))]
	for id in objective_buttons:
		var owner: String = world.objective_owner[id]
		objective_buttons[id].modulate = BLUE if owner == "BLU" else RED if owner == "RED" else MUTED
	inspector.visible = not world.selected_units.is_empty()
	if not inspector.visible: inspector_action_signature = ""
	if inspector.visible:
		var unit: CombatUnit = world.selected_units[0]
		var record: Dictionary = unit.core_record
		inspector_title.text = ("BLU" if unit.team == 0 else "RED")+" / "+unit.role+"\n"+unit.call_sign
		inspector_phase.text = ("ELEMENT LOST" if not unit.is_alive else unit.order)+" · "+str(record.get("target",f["target"]))
		inspector_metrics[0].text = "%d%%" % unit.health
		inspector_metrics[1].text = "%d%%" % record.get("ammo",100)
		inspector_metrics[2].text = "%d / %d" % [record.get("members",0),SimulationCore.CATALOG.get(unit.role,[record.get("members",0)])[0]]
		var details := ""
		if SimulationCore.is_vehicle(unit.role):
			details += "Fuel                         %d%% · %s\n" % [record.get("fuel",100),"engine running" if record.get("moving",false) else "engine off"]
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
		details += "Speed                       %.1f m/s\nWeapon range          %d m\nPosition                   %d E / %d N\n" % [float(unit.stats["speed"])*100,int(float(unit.stats["range"])*100),int(unit.position.x*100),int(-unit.position.z*100)]
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
