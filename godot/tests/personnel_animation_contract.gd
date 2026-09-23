extends SceneTree

const Personnel = preload("res://scripts/personnel_animations.gd")
var failures := 0

func _initialize() -> void:
	call_deferred("_run")

func _check(condition: bool, message: String) -> void:
	if not condition:
		failures += 1
		push_error(message)

func _run() -> void:
	_check(Personnel.select_clip(true,false,true,false,false) == "walk","Moving personnel must walk.")
	_check(Personnel.select_clip(true,false,false,true,false) == "idle_ready","Engaged personnel must aim.")
	_check(Personnel.select_clip(true,false,false,true,true) == "fire","Shots must select fire.")
	_check(Personnel.select_clip(true,true,false,false,false) == "downed","Downed personnel must select downed.")
	_check(Personnel.select_clip(false,false,false,false,false) == "dead","Dead personnel must select dead.")
	for kind in ["commander","logistics","soldier"]:
		var packed: PackedScene = load("res://assets/models/"+kind+".glb")
		_check(packed != null,"Missing model "+kind)
		if packed == null: continue
		var model := packed.instantiate() as Node3D
		root.add_child(model)
		var player := Personnel.install(model,kind)
		_check(player != null,"Animation bundle did not bind: "+kind)
		if player == null:
			model.queue_free()
			continue
		for clip in ["walk","idle_ready","fire","downed","dead"]:
			_check(player.has_animation(clip),"Missing "+kind+"/"+clip)
			player.play(clip)
			player.seek(player.get_animation(clip).length*0.5,true)
			_check(player.current_animation == clip,"Wrong active clip: "+kind+"/"+clip)
		if kind != "soldier":
			var skeleton := Personnel._find_skeleton(model)
			var leg := skeleton.find_bone("Bone_016" if kind == "commander" else "Bone_008")
			player.play("walk")
			player.seek(0.05,true)
			var first := skeleton.get_bone_pose_rotation(leg)
			player.seek(player.get_animation("walk").length*0.5,true)
			_check(first.angle_to(skeleton.get_bone_pose_rotation(leg)) > 0.05,"Walk does not move the leg: "+kind)
		else:
			_check(model.get_meta("personnel_animation_mode") == "rigid-fallback","Malformed rifle rig must retain safe presentation.")
		root.remove_child(model)
		model.free()
	print("PERSONNEL_ANIMATION_CONTRACT: %d failures" % failures)
	quit(1 if failures else 0)

