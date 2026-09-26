extends RefCounted
## Browser models authored as code keep the same geometry in native Godot.
## File-backed browser models continue to load their original GLBs.

static func create(role: String, team: int = 0) -> Node3D:
	match role:
		"TRUCK", "FUEL_TRUCK", "TROOP_HEMTT", "MEDICAL_HEMTT", "REPAIR_HEMTT", "FOB_HEMTT", "FORKLIFT", "UAV_JAMMER":
			if role in ["TRUCK", "FUEL_TRUCK", "TROOP_HEMTT", "MEDICAL_HEMTT", "REPAIR_HEMTT", "FOB_HEMTT"]:
				var pbr_model := preload("res://scripts/pbr_vehicle_models.gd").create_hemtt(role, team)
				if pbr_model != null:
					return pbr_model
			return preload("res://scripts/browser_support_models.gd").create(role, team)
		"CAS_FIGHTER":
			return preload("res://scripts/a29b_model.gd").create(team)
		"CARGO_PLANE":
			return preload("res://scripts/galaxy_b_model.gd").create(team)
		"TRANSPORT_HELI":
			return preload("res://scripts/support_heli_b_model.gd").create(team)
		"AMPHIBIOUS_APC":
			return preload("res://scripts/amphibious_apc_model.gd").create(team)
		"IFV":
			return preload("res://scripts/browser_armored_models.gd").create(role, team)
		"MOB", "AIRFIELD":
			return preload("res://scripts/browser_base_models.gd").create(role, team)
	return null
