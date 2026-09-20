extends SceneTree

const Navigation = preload("res://scripts/maritime_navigation.gd")
const Map = preload("res://scripts/tactical_map.gd")
const Unit = preload("res://scripts/combat_unit.gd")
var failures := 0

func check(condition: bool,message: String) -> void:
	if not condition:
		failures += 1
		push_error(message)

func _initialize() -> void:
	var map := Map.new()
	# A U-shaped channel requires a route around dry land.
	map.maritime_water = [
		PackedVector2Array([Vector2(0,0),Vector2(1,0),Vector2(1,3),Vector2(0,3)]),
		PackedVector2Array([Vector2(0,0),Vector2(3,0),Vector2(3,1),Vector2(0,1)]),
		PackedVector2Array([Vector2(2,0),Vector2(3,0),Vector2(3,3),Vector2(2,3)])
	]
	map.maritime_ports = [{"side":"BLU","position":Vector3(0.5,0,2.5)}]
	map.maritime_landings = [{"water":Vector3(0.1,0,2.5),"shore":Vector3(-0.1,0,2.5)}]
	var start := Vector3(0.5,0,2.5)
	var target := Vector3(2.5,0,2.5)
	var route := map.find_maritime_route(start,target)
	check(route.size() > 1,"Channel route must avoid the dry center")
	var previous := start
	for point in route:
		check(Navigation.clear(map.maritime_water,previous,point),"Every route segment must remain in water")
		previous = point
	check(route == map.find_maritime_route(start,target),"Route must be deterministic")
	var unit := Unit.new()
	unit.map = map
	unit.role = "PATROL_BOAT"
	unit.stats = {"speed":1.0}
	unit.position = start
	unit.core_record = {"fuel":100.0}
	check(unit.move_to(target),"Ship accepts water route with recovery reserve")
	var accepted := unit.route.duplicate()
	check(not unit.move_to(Vector3(1.5,0,2.5)),"Ship rejects dry target")
	check(unit.route == accepted,"Dry target retains the previous route")
	unit.core_record["fuel"] = 15.0+Navigation.length(start,accepted)*0.1+map.maritime_recovery_distance(target,"BLU")*0.05
	check(not unit.move_to(target),"Ship rejects insufficient route and recovery fuel")
	check(unit.route == accepted,"Fuel rejection retains the previous route")
	map.maritime_ports[0]["side"] = "RED"
	unit.core_record["fuel"] = 100.0
	check(not unit.move_to(target),"Ship requires a friendly recovery port")
	map.maritime_ports[0]["side"] = "BLU"
	unit.role = "AMPHIBIOUS_APC"
	check(unit.move_to(Vector3(-0.1,0,2.5)),"Amphibious unit accepts authored shore link")
	unit.position = Vector3(-0.1,0,2.5)
	check(unit.move_to(target),"Amphibious unit can return through the shore link")
	check(not unit.move_to(Vector3(-0.2,0,2.5)),"Amphibious unit rejects other dry destinations")
	var disconnected: Array = [PackedVector2Array([Vector2(0,0),Vector2(1,0),Vector2(1,1),Vector2(0,1)]),PackedVector2Array([Vector2(2,0),Vector2(3,0),Vector2(3,1),Vector2(2,1)])]
	check(Navigation.route(disconnected,Vector3(0.5,0,0.5),Vector3(2.5,0,0.5)).is_empty(),"Disconnected water must reject the route")
	unit.free()
	map.free()
	if failures == 0:
		print("GRID_COMMAND_MARITIME_NAVIGATION_SMOKE_OK")
	quit(0 if failures == 0 else 1)

