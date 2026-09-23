extends SceneTree

const Equipment = preload("res://scripts/personnel_equipment.gd")
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
		var skeleton := Personnel._find_skeleton(model)
		var leg := skeleton.find_bone("Bone_016" if kind == "commander" else "Bone_008")
		player.play("walk")
		player.seek(0.05,true)
		var first := skeleton.get_bone_pose_rotation(leg)
		player.seek(player.get_animation("walk").length*0.5,true)
		_check(first.angle_to(skeleton.get_bone_pose_rotation(leg)) > 0.05,"Walk does not move the leg: "+kind)
		_check(model.get_meta("personnel_animation_mode") == "skeletal","All personnel need skeletal motion.")
		var role := "COMMAND" if kind == "commander" else "LOGISTICS" if kind == "logistics" else "RIFLE"
		var socket := Equipment.attach(model,role)
		if role == "LOGISTICS":
			_check(socket == null,"Logistics worker must not carry a rifle.")
		else:
			_check(socket != null,"Combat model has no hand-mounted rifle: "+kind)
			if socket != null:
				_check(socket.get_parent() == skeleton,"Rifle must be attached to the animated body skeleton.")
				_check(socket.bone_name == ("Bone_026" if kind == "commander" else "Bone_022"),"Wrong hand for "+kind)
				player.play("idle_ready")
				player.seek(0.0,true)
				player.pause()
				skeleton.force_update_all_bone_transforms()
				await process_frame
				await process_frame
				var hand := skeleton.find_bone(socket.bone_name)
				_check(socket.position.distance_to(skeleton.get_bone_global_pose(hand).origin) < 0.001,"Rifle socket must follow the animated hand: "+kind)
		root.remove_child(model)
		model.free()
	print("PERSONNEL_ANIMATION_CONTRACT: %d failures" % failures)
	quit(1 if failures else 0)


