extends Node3D
class_name TacticalMap

## Exact browser Mercator projection at metres / 100. Scene +X=east, -Z=north.
## Global geographic tiles supply ground, water, roads and buildings. This node
## owns current-theater installations/objectives/navigation and an offline fallback.
const HALF_SIZE := 360.0
const CELL := 1.0
const GRID_SIZE := 720
const OBJECTIVES := [
	{"id":"A", "name":"SAN PASQUAL VALLEY", "pos":Vector3(56,0,286)}, {"id":"B", "name":"RANCHO BERNARDO", "pos":Vector3(6,0,219)},
	{"id":"C", "name":"CARMEL MOUNTAIN", "pos":Vector3(-2.8,0,176.0)}, {"id":"D", "name":"SABRE SPRINGS", "pos":Vector3(-13,0,142)},
	{"id":"E", "name":"SCRIPPS RANCH", "pos":Vector3(-28,0,88)}, {"id":"F", "name":"TIERRASANTA", "pos":Vector3(-17,0,13)},
	{"id":"G", "name":"MISSION VALLEY", "pos":Vector3(-28,0,-48)}, {"id":"H", "name":"CITY HEIGHTS", "pos":Vector3(-22,0,-90)},
	{"id":"I", "name":"SOUTH BAY CORRIDOR", "pos":Vector3(21,0,-202)}, {"id":"J", "name":"OTAY MESA", "pos":Vector3(49,0,-273)},
]
const BASES := {"BLU": Vector3(42,0,-304), "RED": Vector3(70,0,302)}
const AIRBASES := {"BLU": Vector3(51,0,-296), "RED": Vector3(57.1,0,294.3)}
const CORRIDOR := [Vector3(70,0,302),Vector3(56,0,286),Vector3(6,0,219),Vector3(-28,0,175),Vector3(-13,0,142),Vector3(-28,0,88),Vector3(-17,0,13),Vector3(-28,0,-48),Vector3(-22,0,-90),Vector3(21,0,-202),Vector3(49,0,-273),Vector3(42,0,-304)]

var geographic_active := false
var nav := AStarGrid2D.new()
var building_rects: Array[Rect2] = []
var batches: Dictionary = {}
var map_materials: Dictionary = {}
var objective_position := Vector3(-28,0,-48)
var objective_ring: MeshInstance3D
var objective_label: Label3D
var objective_rings: Dictionary = {}
var objective_labels: Dictionary = {}
var rng := RandomNumberGenerator.new()
var objective_data: Array = OBJECTIVES.duplicate(true)
var corridor_data: Array = CORRIDOR.duplicate()
var bases: Dictionary = BASES.duplicate()
var airbases: Dictionary = AIRBASES.duplicate()

func _ready() -> void:
	rng.seed = 941921
	_load_authoritative_theater()
	_create_materials()
	if not geographic_active:
		_create_terrain()
		_create_corridor_roads()
	_create_installations(); _flush_batches(); _create_objectives(); _create_navigation()

func enable_schematic_fallback() -> void:
	if not geographic_active: return
	geographic_active = false
	_create_terrain(); _create_corridor_roads(); _flush_batches()

func _create_materials() -> void:
	for spec in [["ground","030815"],["water","02040b"],["road","23394b"],["stripe","526b7c"],["concrete","495865"],["wall","253d55"],["white","5e707f"],["blue","173c6b"],["roof","163257"],["glass","2c4d6b"],["park","0c1824"],["container","303e31"],["orange","79613d"],["runway","172431"]]: map_materials[spec[0]] = material(Color(spec[1]))

static func material(color: Color, roughness: float = 0.8) -> StandardMaterial3D:
	var result := StandardMaterial3D.new(); result.albedo_color = color; result.roughness = roughness; result.metallic_specular = 0.0; return result

func _box(pos: Vector3, size: Vector3, mat_key: String, rotation_y: float = 0.0) -> void:
	if not batches.has(mat_key): batches[mat_key] = []
	batches[mat_key].append(Transform3D(Basis(Vector3.UP,rotation_y).scaled(size),pos))

func _flush_batches() -> void:
	for key_variant in batches:
		var key: String = str(key_variant)
		var transforms: Array = batches[key]
		var instance := MultiMeshInstance3D.new(); instance.name = "SanDiego_" + key
		var mesh := BoxMesh.new(); mesh.size = Vector3.ONE; mesh.material = map_materials[key]
		var multi := MultiMesh.new(); multi.transform_format = MultiMesh.TRANSFORM_3D; multi.mesh = mesh; multi.instance_count = transforms.size()
		for index in range(transforms.size()): multi.set_instance_transform(index,transforms[index])
		instance.multimesh = multi; instance.visibility_range_end = 1600.0; instance.cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_ON; add_child(instance)
	batches.clear()

func _create_terrain() -> void:
	var water := MeshInstance3D.new(); water.name = "PacificOceanAndSanDiegoBay"
	var plane := PlaneMesh.new(); plane.size = Vector2(1600,1600); water.mesh = plane; water.position.y = -0.005
	var water_mat: StandardMaterial3D = map_materials["water"].duplicate(); water_mat.metallic = 0.0; water_mat.emission_enabled = true; water_mat.emission = Color("02040b"); water.material_override = water_mat; water.cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_OFF; add_child(water)
	var polygon := PackedVector2Array([Vector2(-150,-350),Vector2(108,-350),Vector2(110,340),Vector2(-10,340),Vector2(-20,270),Vector2(-65,205),Vector2(-50,95),Vector2(-88,20),Vector2(-80,-80),Vector2(-115,-175),Vector2(-72,-290)])
	var st := SurfaceTool.new(); st.begin(Mesh.PRIMITIVE_TRIANGLES)
	for index in Geometry2D.triangulate_polygon(polygon): st.set_normal(Vector3.UP); st.add_vertex(Vector3(polygon[index].x,0,-polygon[index].y))
	var land := MeshInstance3D.new(); land.name = "SanDiegoLandmass"; land.mesh = st.commit(); var land_mat: StandardMaterial3D = map_materials["ground"].duplicate(); land_mat.cull_mode = BaseMaterial3D.CULL_DISABLED; land.material_override = land_mat; add_child(land)
	_create_map_label("PACIFIC OCEAN",Vector3(-135,0.01,-30),Color("526b7c"),0.05)

func _create_corridor_roads() -> void:
	# A strategic centerline until source road vector geometry is ported.
	for i in range(corridor_data.size()-1): _road_between(corridor_data[i],corridor_data[i+1],0.24)

func _road_between(a: Vector3,b: Vector3,width: float) -> void:
	var delta := b-a; var length := Vector2(delta.x,delta.z).length()
	if length < 0.1: return
	var angle := atan2(delta.x,delta.z); _box((a+b)*0.5+Vector3(0,0.001,0),Vector3(width,0.002,length),"road",angle)
	for d in range(1,int(length),3): _box(a.lerp(b,float(d)/length)+Vector3(0,0.0025,0),Vector3(0.005,0.001,0.15),"stripe",angle)

func installation_rectangles() -> Array[Rect2]:
	var rectangles: Array[Rect2] = []
	for side in ["BLU","RED"]:
		var base: Vector3 = bases[side]
		var air: Vector3 = airbases[side]
		rectangles.append(Rect2(Vector2(base.x-0.83,base.z-1.43),Vector2(1.66,1.86)))
		rectangles.append(Rect2(Vector2(air.x-1.58,air.z-6.03),Vector2(2.46,12.06)))
	return rectangles

func source_installation_rectangles() -> Array[Rect2]:
	var rectangles: Array[Rect2] = []
	for rect in installation_rectangles(): rectangles.append(Rect2(Vector2(rect.position.x,-rect.end.y),rect.size))
	return rectangles

func naval_base(side: String) -> Vector3:
	return Vector3(-120.0,0,240.0 if side == "BLU" else -260.0)

func _create_installations() -> void:
	for side in ["BLU","RED"]:
		var base: Vector3 = bases[side]
		var air: Vector3 = airbases[side]
		var team := 0 if side == "BLU" else 1
		var color := Color("7dbcff") if team == 0 else Color("ff8080")
		for kind in ["MOB", "AIRFIELD"]:
			var installation: Node3D = preload("res://scripts/browser_model_factory.gd").create(kind, team)
			installation.name = side + "_" + kind
			installation.scale = Vector3.ONE * 0.01
			installation.position = (base if kind == "MOB" else air) + Vector3.UP * 0.001
			installation.add_to_group("installation_models")
			add_child(installation)
		_create_map_label(side+" MOB",base+Vector3(0,0.008,-0.5),color,0.001)
		_create_map_label(side+" AIRBASE",air+Vector3(0,0.008,6.4),color,0.001)

func _create_objectives() -> void:
	for entry in objective_data:
		var point: Vector3 = entry["pos"]; var ring := MeshInstance3D.new(); var mesh := TorusMesh.new(); mesh.inner_radius = 0.98; mesh.outer_radius = 1.0; mesh.rings = 32; mesh.ring_segments = 6; ring.mesh = mesh; ring.position = point+Vector3.UP*0.003; ring.material_override = material(Color("c5bd76"),0.8); ring.cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_OFF; add_child(ring); objective_rings[str(entry["id"])] = ring; objective_labels[str(entry["id"])] = _create_map_label(str(entry["id"])+" / "+str(entry["name"]),point+Vector3(0,0.006,-1.2),Color("9aa8b8"),0.004)
	objective_ring = objective_rings["G"]; objective_label = objective_labels["G"]

func set_objective_control(id: String,progress: float) -> void:
	var ring: MeshInstance3D = objective_rings.get(id)
	if ring == null: return
	var mat: StandardMaterial3D = ring.material_override; mat.albedo_color = Color("66b9ec") if progress >= 100.0 else Color("e98d79") if progress <= -100.0 else Color("c5bd76")

func get_objectives() -> Array:
	return objective_data

func get_corridor() -> Array:
	return corridor_data

func _load_authoritative_theater() -> void:
	var parsed: Variant = JSON.parse_string(FileAccess.get_file_as_string("res://data/theater.json"))
	if not parsed is Dictionary or parsed.get("schema",0) != 1 or not parsed.get("objectives",null) is Array:
		push_error("The San Diego theater data is not valid.")
		return
	var records: Array = parsed["objectives"]
	if records.size() != 10:
		push_error("The San Diego theater must contain objectives A through J.")
		return
	objective_data.clear()
	for record in records:
		if not record is Array or record.size() != 4: continue
		var longitude := float(record[2])
		var latitude := float(record[3])
		# Exact local Web Mercator projection, matching browser geography.ts.
		objective_data.append({"id":str(record[0]),"name":str(record[1]).to_upper(),"pos":project(longitude,latitude)})
	corridor_data.clear()
	for record in parsed.get("corridor",[]):
		if record is Array and record.size() == 2:
			corridor_data.append(project(float(record[0]),float(record[1])))

	for side in ["BLU","RED"]:
		var base: Array = parsed["bases"][side]
		var air: Array = parsed["airbases"][side]
		bases[side] = project(float(base[0]),float(base[1]))
		airbases[side] = project(float(air[0]),float(air[1]))
	objective_position = objective_data[6]["pos"]

static func project(longitude: float, latitude: float) -> Vector3:
	var origin_lat := deg_to_rad(32.82)
	var scale := 40075016.68557849*cos(origin_lat)/100.0
	var x := (longitude+117.08)/360.0*scale
	var z := (log(tan(PI/4.0+deg_to_rad(latitude)/2.0))-log(tan(PI/4.0+origin_lat/2.0)))/(TAU)*scale
	return Vector3(x,0,-z)

func _create_map_label(text: String,pos: Vector3,color: Color,pixel: float) -> Label3D:
	var label := Label3D.new(); label.text = text; label.font_size = 38; label.pixel_size = pixel; label.modulate = color; label.position = pos; label.rotation_degrees.x = -90; label.cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_OFF; add_child(label); return label

func _create_navigation() -> void:
	nav.region = Rect2i(0,0,GRID_SIZE,GRID_SIZE); nav.cell_size = Vector2(CELL,CELL); nav.offset = Vector2(-HALF_SIZE+CELL*0.5,-HALF_SIZE+CELL*0.5); nav.diagonal_mode = AStarGrid2D.DIAGONAL_MODE_ONLY_IF_NO_OBSTACLES; nav.default_compute_heuristic = AStarGrid2D.HEURISTIC_OCTILE; nav.default_estimate_heuristic = AStarGrid2D.HEURISTIC_OCTILE; nav.update()
	for x in range(GRID_SIZE):
		for y in range(GRID_SIZE):
			var cell := Vector2i(x,y); var pos := nav.get_point_position(cell); var blocked := pos.x < -96.0 or pos.x > 105.0
			if not blocked:
				for rect in building_rects:
					if rect.has_point(pos): blocked = true; break
			nav.set_point_solid(cell,blocked)

func _cell_for(pos: Vector3) -> Vector2i: return Vector2i(clampi(int(floor((pos.x+HALF_SIZE)/CELL)),0,GRID_SIZE-1),clampi(int(floor((pos.z+HALF_SIZE)/CELL)),0,GRID_SIZE-1))
func _nearest_open(cell: Vector2i) -> Vector2i:
	if not nav.is_point_solid(cell): return cell
	for radius in range(1,18):
		for x in range(-radius,radius+1):
			for y in range(-radius,radius+1):
				if absi(x)!=radius and absi(y)!=radius: continue
				var candidate := cell+Vector2i(x,y)
				if nav.is_in_boundsv(candidate) and not nav.is_point_solid(candidate): return candidate
	return Vector2i(-1,-1)
func find_route(from: Vector3,to: Vector3) -> PackedVector3Array:
	var start := _nearest_open(_cell_for(from)); var end := _nearest_open(_cell_for(to)); var route := PackedVector3Array()
	if start.x < 0 or end.x < 0: return route
	for point in nav.get_point_path(start,end): route.append(Vector3(point.x,0,point.y))
	if not route.is_empty():
		route[0] = from
		if not nav.is_point_solid(_cell_for(to)): route.append(Vector3(to.x,0,to.z))
	return route

# This network defines the schematic San Diego offshore operating area.
var maritime_water: Array = [PackedVector2Array([Vector2(-180,-340),Vector2(-96,-340),Vector2(-96,340),Vector2(-180,340)])]
var maritime_ports: Array = [
	{"id":"BLU_PORT","side":"BLU","position":Vector3(-120,0,240)},
	{"id":"RED_PORT","side":"RED","position":Vector3(-120,0,-260)}
]
var maritime_landings: Array = [
	{"id":"BLU_SHORE","water":Vector3(-96.1,0,240),"shore":Vector3(-95.9,0,240)},
	{"id":"RED_SHORE","water":Vector3(-96.1,0,-260),"shore":Vector3(-95.9,0,-260)}
]

func find_maritime_route(from: Vector3,to: Vector3,amphibious: bool = false) -> PackedVector3Array:
	var navigation = preload("res://scripts/maritime_navigation.gd")
	var start := Vector3(from.x,0,from.z)
	var finish := Vector3(to.x,0,to.z)
	var prefix := PackedVector3Array()
	var suffix := PackedVector3Array()
	if amphibious:
		for link in maritime_landings:
			# Only the authored link permits travel across the water boundary.
			var water: Vector3 = link["water"]
			var shore: Vector3 = link["shore"]
			if start.distance_to(water)+start.distance_to(shore) <= water.distance_to(shore)+0.00001:
				prefix.append(water)
				start = water
			if finish.distance_to(shore) < 0.00001:
				suffix.append(shore)
				finish = water
	var result: PackedVector3Array = navigation.route(maritime_water,start,finish)
	if result.is_empty(): return result
	prefix.append_array(result)
	prefix.append_array(suffix)
	return prefix

func maritime_recovery_distance(from: Vector3,side: String,amphibious: bool = false) -> float:
	var shortest := INF
	for port in maritime_ports:
		if str(port["side"]) != side: continue
		var recovery := find_maritime_route(from,port["position"],amphibious)
		if not recovery.is_empty():
			shortest = minf(shortest,preload("res://scripts/maritime_navigation.gd").length(from,recovery))
	return shortest

func maritime_staging_point(destination: Vector3) -> Vector3:
	# Surface units remain offshore at the objective latitude.
	return Vector3(-120.0,0.0,clampf(destination.z,-330.0,330.0))
