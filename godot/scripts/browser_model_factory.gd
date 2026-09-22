extends RefCounted
## Browser models authored as code keep the same geometry in native Godot.
## File-backed browser models continue to load their original GLBs.

static func create(role: String, team: int = 0) -> Node3D:
	match role:
		"TRUCK", "FUEL_TRUCK", "FORKLIFT", "UAV_JAMMER":
			return preload("res://scripts/browser_support_models.gd").create(role, team)
		"CARGO_PLANE", "TRANSPORT_HELI":
			return preload("res://scripts/browser_aircraft_models.gd").create(role, team)
		"IFV":
			return preload("res://scripts/browser_armored_models.gd").create(role, team)
		"MOB", "AIRFIELD":
			return preload("res://scripts/browser_base_models.gd").create(role, team)
	return null
