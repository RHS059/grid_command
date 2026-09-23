extends RefCounted
## The rifle is an independent prop; the body always stays the supplied humanoid.

const Personnel = preload("res://scripts/personnel_animations.gd")
const COMBAT_ROLES := ["RIFLE","SCOUT","MG","AT","MORTAR","ENGINEER","MEDIC","AA_TEAM","COMMAND"]

static func find_hand(skeleton: Skeleton3D, equipment: Dictionary) -> int:
	var explicit := skeleton.find_bone(str(equipment.get("hand","")))
	if explicit >= 0: return explicit
	for index in skeleton.get_bone_count():
		var key := skeleton.get_bone_name(index).to_lower().replace(":","").replace("_","").replace(".","").replace("-","")
		key = key.trim_prefix("mixamorig")
		if key in ["righthand","handr","rhand","bip01rhand"]: return index
	return skeleton.find_bone("weapon")

static func attach(model: Node3D, role: String) -> BoneAttachment3D:
	if role not in COMBAT_ROLES: return null
	if model.has_meta("personnel_rifle_socket"): return model.get_meta("personnel_rifle_socket") as BoneAttachment3D
	var kind := "commander" if role == "COMMAND" else "soldier"
	Personnel.install(model,kind)
	var equipment: Dictionary = model.get_meta("personnel_equipment",{})
	var skeleton := Personnel._find_skeleton(model)
	if skeleton == null:
		push_error("Cannot attach rifle: missing personnel skeleton for "+role)
		return null
	var hand := find_hand(skeleton,equipment)
	if hand < 0:
		push_error("Cannot attach rifle: no right hand bone for "+role)
		return null
	var packed := load("res://assets/models/rifle.glb") as PackedScene
	if packed == null: return null
	var socket := BoneAttachment3D.new()
	socket.name = "EquippedRifleSocket"
	socket.bone_name = skeleton.get_bone_name(hand)
	skeleton.add_child(socket)
	var rifle := packed.instantiate() as Node3D
	rifle.name = "EquippedRifle"
	socket.add_child(rifle)
	var q: Array = equipment.get("rotation",[0,0,0,1])
	var orientation := Quaternion(q[0],q[1],q[2],q[3]).normalized()
	var scale_factor := float(equipment.get("scale",1.0))
	var palm: Array = equipment.get("palm_offset",[0,0.045,0])
	var grip: Array = equipment.get("grip",[0,0,0])
	rifle.quaternion = orientation
	rifle.scale = Vector3.ONE*scale_factor
	rifle.position = Vector3(palm[0],palm[1],palm[2])-orientation*Vector3(grip[0],grip[1],grip[2])*scale_factor
	model.set_meta("personnel_rifle_socket",socket)
	return socket

