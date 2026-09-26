extends RefCounted
## Loads the approved modular HEMTT assets shared with the browser build.

const BASE_PATH := "res://assets/models/vehicles/hemtt_base_pbr.glb"
const MODULES := {
	"TRUCK": "supply",
	"FUEL_TRUCK": "fuel",
	"TROOP_HEMTT": "troop",
	"MEDICAL_HEMTT": "medical",
	"REPAIR_HEMTT": "repair",
	"FOB_HEMTT": "fob",
}

static func create_hemtt(role: String, team: int = 0) -> Node3D:
	if not ResourceLoader.exists(BASE_PATH):
		return null
	var base_scene := load(BASE_PATH) as PackedScene
	if base_scene == null:
		return null
	var base := base_scene.instantiate() as Node3D
	if base == null:
		return null
	base.name = role.to_lower()
	base.set_meta("pbr_vehicle", true)
	base.set_meta("team", team)
	var module_name: String = MODULES.get(role, "")
	if not module_name.is_empty():
		_attach_module(base, module_name)
	# These Blender-authored GLBs retain +Z up. Godot uses +Y up.
	base.rotation_degrees.x = -90.0
	return base

static func _attach_module(base: Node3D, module_name: String) -> void:
	var path := "res://assets/models/vehicles/hemtt_%s_module_pbr.glb" % module_name
	if not ResourceLoader.exists(path):
		push_error("Missing HEMTT rear module: " + path)
		return
	var module_scene := load(path) as PackedScene
	if module_scene == null:
		push_error("Invalid HEMTT rear module: " + path)
		return
	var module := module_scene.instantiate() as Node3D
	if module == null:
		return
	module.name = "GC_MODULE_" + module_name
	var mount := base.find_child("Mount_rear_module", true, false) as Node3D
	if mount == null:
		mount = Node3D.new()
		mount.name = "Mount_rear_module"
		mount.position = Vector3(0.0, -1.5, 1.396894)
		base.add_child(mount)
	mount.add_child(module)
	module.transform = Transform3D.IDENTITY
