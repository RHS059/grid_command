extends RefCounted
## Shared animation sidecars retain the user's model files unchanged.
## Commander/logistics use retargeted owned clips. Rifle's malformed rig uses
## rigid presentation only; see docs/personnel-animations.md.

static var _bundles: Dictionary = {}
static var _libraries: Dictionary = {}

static func _find_skeleton(node: Node) -> Skeleton3D:
	if node is Skeleton3D: return node
	for child in node.get_children():
		var found := _find_skeleton(child)
		if found != null: return found
	return null

static func _find_named(node: Node, target: String) -> Node:
	if str(node.name) == target: return node
	for child in node.get_children():
		var found := _find_named(child,target)
		if found != null: return found
	return null

static func install(model: Node3D, kind: String) -> AnimationPlayer:
	if kind not in ["soldier","commander","logistics"]: return null
	var existing := model.get_node_or_null("PersonnelAnimations") as AnimationPlayer
	if existing != null: return existing
	if not _bundles.has(kind):
		var file := FileAccess.open("res://assets/animations/personnel/"+kind+".json",FileAccess.READ)
		if file == null:
			push_error("Missing personnel animation bundle: "+kind)
			return null
		var parsed: Variant = JSON.parse_string(file.get_as_text())
		if not parsed is Dictionary or parsed.get("schema",0) != 1 or parsed.get("model","") != kind:
			push_error("Invalid personnel animation bundle: "+kind)
			return null
		_bundles[kind] = parsed
	var bundle: Dictionary = _bundles[kind]
	var skeleton := _find_skeleton(model)
	var skeleton_path := str(model.get_path_to(skeleton)) if skeleton != null else ""
	var cache_key := kind+":"+skeleton_path
	var library: AnimationLibrary = _libraries.get(cache_key)
	if library == null:
		library = AnimationLibrary.new()
		for clip: Dictionary in bundle["clips"]:
			var animation := Animation.new()
			animation.length = float(clip["duration"])
			animation.loop_mode = Animation.LOOP_LINEAR if clip["loop"] else Animation.LOOP_NONE
			var times: Array = clip["times"]
			for channel: Dictionary in clip["tracks"]:
				var target := str(channel["target"])
				var path: NodePath
				if channel["type"] == "bone":
					if skeleton == null or skeleton.find_bone(target) < 0:
						push_error("Missing personnel bone: "+kind+"/"+target)
						return null
					path = NodePath(skeleton_path+":"+target)
				else:
					var target_node := _find_named(model,target)
					if target_node == null:
						push_error("Missing personnel animation node: "+target)
						return null
					path = model.get_path_to(target_node)
				var rotation_track := animation.add_track(Animation.TYPE_ROTATION_3D)
				var position_track := animation.add_track(Animation.TYPE_POSITION_3D)
				animation.track_set_path(rotation_track,path)
				animation.track_set_path(position_track,path)
				for index in range(times.size()):
					var q: Array = channel["rotation"][index]
					var p: Array = channel["position"][index]
					animation.rotation_track_insert_key(rotation_track,float(times[index]),Quaternion(q[0],q[1],q[2],q[3]).normalized())
					animation.position_track_insert_key(position_track,float(times[index]),Vector3(p[0],p[1],p[2]))
			library.add_animation(str(clip["name"]),animation)
		_libraries[cache_key] = library
	var player := AnimationPlayer.new()
	player.name = "PersonnelAnimations"
	model.add_child(player)
	player.root_node = NodePath("..")
	player.add_animation_library("",library)
	player.play("idle_passive")
	model.set_meta("personnel_animation_mode",bundle["mode"])
	return player

static func select_clip(alive: bool, downed: bool, moving: bool, engaged: bool, fired_recently: bool) -> String:
	if not alive: return "dead"
	if downed: return "downed"
	if fired_recently: return "fire"
	if moving: return "walk"
	if engaged: return "idle_ready"
	return "idle_passive"

