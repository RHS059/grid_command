extends SceneTree

func _init() -> void:
	call_deferred("_run")

func _button_texts(root: Node) -> Array[String]:
	var result: Array[String] = []
	for child in root.find_children("*","Button",true,false): result.append(str(child.text))
	return result

func _run() -> void:
	ProjectSettings.set_setting("geography/network_enabled",false)
	var world = load("res://scenes/main.tscn").instantiate()
	root.add_child(world)
	await process_frame
	await process_frame
	var hud = world.hud
	assert(hud != null and hud.inspector_actions is VBoxContainer)
	assert(not hud.drawer.find_children("*","ScrollContainer",true,false).is_empty(),"The command-center body must scroll like the browser panel.")

	var rifle: Dictionary = world.core.make_unit("BLU","RIFLE","hud-rifle")
	var apc: Dictionary = world.core.make_unit("BLU","APC","hud-apc")
	rifle["position"] = Vector3.ZERO
	apc["position"] = Vector3(0.1,0,0)
	apc["fuel"] = 100.0; apc["ammo"] = 100.0; apc["service"] = "READY"
	world.core.units["BLU"].append(rifle)
	world.core.units["BLU"].append(apc)
	world._sync_core_visuals()
	world.visual_core_units["hud-rifle"].position = Vector3.ZERO
	world.visual_core_units["hud-apc"].position = Vector3(0.1,0,0)
	rifle["position"] = Vector3.ZERO
	apc["position"] = Vector3(0.1,0,0)
	world.select_unit(world.visual_core_units["hud-rifle"],false)
	hud.refresh = 0.0; hud._process(0.2)
	assert(not _button_texts(hud.inspector_actions).has("Hold"),"The observer inspector must not expose direct movement orders absent from the browser.")
	assert(_button_texts(hud.inspector_actions).any(func(text: String) -> bool: return text.begins_with("Get in")),"Nearby stopped transports must appear as a contextual browser-style action.")
	assert(_button_texts(hud.inspector_actions).has("Deploy UAV jammer · 200 SP"),"Eligible squads must expose the browser jammer command.")
	hud._request_boarding("hud-rifle","hud-apc","BLU")
	assert(rifle["transport"].get("carrier","") == "hud-apc")
	hud.inspector_action_signature = ""; hud.refresh = 0.0; hud._process(0.2)
	assert(_button_texts(hud.inspector_actions).has("Dismount all incl. crew"))
	world.select_unit(world.visual_core_units["hud-apc"],false)
	hud.refresh = 0.0; hud._process(0.2)
	assert(_button_texts(hud.inspector_actions).has("Dismount passengers"))

	hud.radio_filter.select(2)
	world.core.log_event("BLU","Contact filter smoke event.","combat")
	hud.refresh = 0.0; hud._process(0.2)
	assert(hud.radio_text.text.contains("Contact filter smoke event."),"The Contact channel must accept browser combat events.")

	hud.open_drawer("Forces")
	assert(_button_texts(hud.drawer_actions).any(func(text: String) -> bool: return text.contains("Rifle · 4 personnel")),"The force roster must expose selectable elements.")
	assert(not _button_texts(hud.drawer_actions).has("Assign objective"),"The observer drawer must remain read-only like the browser command panel.")
	hud.open_drawer("Help"); hud._refresh_drawer()
	var help_labels: Array = hud.drawer_actions.find_children("*","Label",true,false).map(func(label: Label): return label.text)
	assert(help_labels.has("Pan the battlefield") and help_labels.has("Rotate & tilt"))
	assert(not hud.drawer_text.text.contains("observer movement order"))
	world.core.time = 30.0; world.commander_director.tick(world.core)
	hud.open_drawer("Staff"); hud._refresh_drawer()
	assert(hud.drawer_text.text.contains("REV 1") and hud.drawer_text.text.contains("Troop Command"),"Staff must render the authoritative commander council after its first plan.")
	world.mission_state = "BLU VICTORY"
	hud.refresh = 0.0; hud._process(0.2)
	assert(hud.victory_panel.visible and hud.victory_title.text == "BLU FORCE VICTORIOUS")
	print("GRID_COMMAND_TACTICAL_HUD_SMOKE_OK")
	quit(0)
