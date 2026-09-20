extends Node3D
class_name TacticalMap

const HALF_SIZE := 96.0
const CELL := 2.0
const GRID_SIZE := 96
const LAND := [Vector2(-48, -88), Vector2(90, -88), Vector2(90, 90), Vector2(-48, 90), Vector2(-48, 55), Vector2(-31, 47), Vector2(-28, 26), Vector2(-43, 12), Vector2(-42, -12), Vector2(-29, -30), Vector2(-31, -53), Vector2(-48, -62)]
var nav := AStarGrid2D.new()
var building_rects: Array[Rect2] = []
var batches: Dictionary = {}
var map_materials: Dictionary = {}
var objective_position := Vector3(0.0, 0.0, 12.0)
var objective_ring: MeshInstance3D
var objective_label: Label3D
var rng := RandomNumberGenerator.new()

func _ready() -> void:
	rng.seed = 941921
	_create_materials()
	_create_terrain()
	_create_roads()
	_create_city()
	_create_port()
	_create_palms()
	_flush_batches()
	_create_objective()
	_create_navigation()

func _create_materials() -> void:
	map_materials["ground"] = material(Color("b5b49e"), 1.0)
	map_materials["sand"] = material(Color("d4c8a3"), 1.0)
	map_materials["road"] = material(Color("4b5a60"), 1.0)
	map_materials["stripe"] = material(Color("bdc7bd"), 1.0)
	map_materials["walk"] = material(Color("d6d5bf"), 1.0)
	map_materials["wall"] = material(Color("d9dfd6"), 0.9)
	map_materials["white"] = material(Color("e7e8d6"), 0.88)
	map_materials["blue"] = material(Color("87a7ad"), 0.64)
	map_materials["roof"] = material(Color("638082"), 0.92)
	map_materials["glass"] = material(Color("456d79"), 0.38)
	map_materials["park"] = material(Color("8a9b73"), 1.0)
	map_materials["trunk"] = material(Color("80705a"), 1.0)
	map_materials["leaf"] = material(Color("537f69"), 1.0)
	map_materials["orange"] = material(Color("b17d56"), 0.9)
	map_materials["container"] = material(Color("678d90"), 0.85)

static func material(color: Color, roughness: float = 0.8) -> StandardMaterial3D:
	var result := StandardMaterial3D.new()
	result.albedo_color = color
	result.roughness = roughness
	return result

func _box(pos: Vector3, size: Vector3, mat_key: String, rotation_y: float = 0.0) -> void:
	if not batches.has(mat_key):
		batches[mat_key] = []
	var basis := Basis(Vector3.UP, rotation_y).scaled(size)
	batches[mat_key].append(Transform3D(basis, pos))

func _flush_batches() -> void:
	for key: String in batches:
		var transforms: Array = batches[key]
		var instance := MultiMeshInstance3D.new()
		instance.name = "City_" + key
		var mesh := BoxMesh.new()
		mesh.size = Vector3.ONE
		mesh.material = map_materials[key]
		var multi := MultiMesh.new()
		multi.transform_format = MultiMesh.TRANSFORM_3D
		multi.mesh = mesh
		multi.instance_count = transforms.size()
		for index in range(transforms.size()):
			multi.set_instance_transform(index, transforms[index])
		instance.multimesh = multi
		instance.visibility_range_end = 330.0
		instance.cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_ON
		add_child(instance)
	# One draw batch per city material, with batch bounds and range culling.
	batches.clear()

func _create_terrain() -> void:
	var water := MeshInstance3D.new()
	water.name = "PacificOcean"
	var plane := PlaneMesh.new()
	plane.size = Vector2(900.0, 900.0)
	water.mesh = plane
	water.position.y = -0.55
	var water_mat := material(Color("3f8793"), 0.33)
	water_mat.metallic = 0.14
	water.material_override = water_mat
	water.cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_OFF
	add_child(water)
	var polygon := PackedVector2Array(LAND)
	var triangles := Geometry2D.triangulate_polygon(polygon)
	var st := SurfaceTool.new()
	st.begin(Mesh.PRIMITIVE_TRIANGLES)
	for index in triangles:
		st.set_normal(Vector3.UP)
		st.add_vertex(Vector3(polygon[index].x, 0.0, polygon[index].y))
	var land := MeshInstance3D.new()
	land.name = "Mainland"
	land.mesh = st.commit()
	var land_mat: StandardMaterial3D = map_materials["ground"].duplicate()
	land_mat.cull_mode = BaseMaterial3D.CULL_DISABLED
	land.material_override = land_mat
	add_child(land)
	# Coronado-like sand spit on the west side of the bay.
	_box(Vector3(-72.0, -0.48, 26.0), Vector3(13.0, 0.6, 132.0), "sand", -0.12)
	_box(Vector3(-72.0, -0.10, 26.0), Vector3(5.8, 0.12, 126.0), "park", -0.12)
	_box(Vector3(-72.0, 0.02, 26.0), Vector3(1.8, 0.14, 121.0), "walk", -0.12)
	for i in range(24):
		var z := -76.0 + i * 7.0
		_box(Vector3(92.0, 1.0 + sin(i * 0.6) * 0.5, z), Vector3(14.0, 5.0 + sin(i * 0.6), 9.0), "park")

func _create_roads() -> void:
	for x in [-24.0, 0.0, 24.0, 48.0, 72.0]:
		_box(Vector3(x, 0.035, 0.0), Vector3(6.0, 0.07, 170.0), "road")
		for z in range(-80, 84, 5):
			_box(Vector3(x, 0.078, float(z)), Vector3(0.10, 0.014, 2.0), "stripe")
	for z in [-60.0, -36.0, -12.0, 12.0, 36.0, 60.0, 84.0]:
		_box(Vector3(29.5, 0.04, z), Vector3(119.0, 0.08, 6.0), "road")
		for x in range(-27, 87, 5):
			_box(Vector3(float(x), 0.084, z), Vector3(2.0, 0.014, 0.10), "stripe")
	# Seafront path and a harbor quay.
	_box(Vector3(-24.0, 0.09, 65.0), Vector3(8.0, 0.1, 41.0), "walk")
	_box(Vector3(-42.0, -0.10, 66.0), Vector3(11.0, 0.35, 27.0), "walk")
	_create_map_label("PACIFIC OCEAN", Vector3(-87.0, 0.1, -33.0), Color("a6d8db"), 0.038)
	_create_map_label("CORONADO", Vector3(-71.0, 0.7, 12.0), Color("dce0c5"), 0.025)
	_create_map_label("HARBOR DRIVE", Vector3(-21.0, 0.17, 43.0), Color("dfe1cb"), 0.019)
	_create_map_label("DOWNTOWN", Vector3(12.0, 0.2, -60.0), Color("ced9ce"), 0.028)

func _create_city() -> void:
	for x in [-12.0, 12.0, 36.0, 60.0]:
		for z in [-48.0, -24.0, 0.0, 24.0, 48.0, 72.0]:
			if x == -12.0 and z >= 24.0:
				_box(Vector3(x, 0.09, z), Vector3(16.0, 0.16, 16.0), "park")
				continue
			_box(Vector3(x, 0.08, z), Vector3(18.0, 0.16, 18.0), "walk")
			for dx in [-4.5, 4.5]:
				for dz in [-4.5, 4.5]:
					var bx: float = x + dx
					var bz: float = z + dz
					var width := rng.randf_range(5.4, 7.4)
					var depth := rng.randf_range(5.2, 7.6)
					var height := rng.randf_range(2.2, 7.0)
					if z <= 0.0 and x <= 36.0:
						height += rng.randf_range(1.0, 13.0)
					var key: String = ["wall", "white", "blue"][rng.randi_range(0, 2)]
					_box(Vector3(bx, height * 0.5 + 0.17, bz), Vector3(width, height, depth), key)
					_box(Vector3(bx, height + 0.28, bz), Vector3(width + 0.20, 0.24, depth + 0.20), "roof")
					_box(Vector3(bx + 0.3, height + 0.62, bz + 0.2), Vector3(width * 0.30, 0.62, depth * 0.34), "white")
					for floor_index in range(1, int(height / 2.2)):
						var fy := floor_index * 2.2 + 0.45
						_box(Vector3(bx, fy, bz + depth * 0.5 + 0.016), Vector3(width * 0.83, 0.78, 0.03), "glass")
						_box(Vector3(bx + width * 0.5 + 0.016, fy, bz), Vector3(0.03, 0.78, depth * 0.83), "glass")
					building_rects.append(Rect2(Vector2(bx - width * 0.5 - 0.9, bz - depth * 0.5 - 0.9), Vector2(width + 1.8, depth + 1.8)))
	# A hangar, an apron, and a short visual runway north of downtown.
	_box(Vector3(9.0, 0.1, -75.0), Vector3(43.0, 0.16, 11.0), "road")
	for x in range(-10, 31, 5):
		_box(Vector3(float(x), 0.195, -75.0), Vector3(2.3, 0.02, 0.2), "stripe")
	_box(Vector3(49.0, 3.0, -77.0), Vector3(17.0, 6.0, 13.0), "wall")
	building_rects.append(Rect2(39.5, -84.5, 19.0, 15.0))

func _create_port() -> void:
	for z in [58.0, 72.0, 84.0]:
		_box(Vector3(-49.0, -0.1, z), Vector3(18.0, 0.5, 5.0), "walk")
	for i in range(11):
		var pos := Vector3(-39.0 + (i % 2) * 5.0, 1.2, 56.0 + (i / 2) * 4.7)
		_box(pos, Vector3(3.5, 2.1, 3.0), "orange" if i % 3 == 0 else "container")
		building_rects.append(Rect2(Vector2(pos.x - 2.3, pos.z - 2.0), Vector2(4.6, 4.0)))
	# Bridge deck across the bay; it is scenic and outside the active road graph.
	_box(Vector3(-52.0, 4.0, 89.0), Vector3(55.0, 1.0, 4.0), "wall", -0.13)
	for x in [-72.0, -61.0, -50.0, -39.0]:
		_box(Vector3(x, 1.6, 89.0), Vector3(1.4, 4.0, 2.0), "roof")

func _create_palms() -> void:
	for i in range(35):
		var x := -18.7 if i < 17 else 78.0
		var z := -70.0 + (i % 18) * 8.5
		if not is_land(Vector2(x, z)):
			continue
		var h := rng.randf_range(2.4, 3.7)
		_box(Vector3(x, h * 0.5, z), Vector3(0.23, h, 0.23), "trunk", 0.2)
		for leaf in range(5):
			_box(Vector3(x, h, z), Vector3(2.6, 0.14, 0.46), "leaf", leaf * TAU / 5.0)

func _create_objective() -> void:
	objective_ring = MeshInstance3D.new()
	objective_ring.name = "HarborControlRing"
	var ring := TorusMesh.new()
	ring.inner_radius = 7.8
	ring.outer_radius = 8.05
	ring.rings = 64
	ring.ring_segments = 8
	objective_ring.mesh = ring
	objective_ring.position = objective_position + Vector3.UP * 0.15
	objective_ring.material_override = material(Color("e0c988"), 0.8)
	objective_ring.cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_OFF
	add_child(objective_ring)
	objective_label = _create_map_label("01 / HARBOR", objective_position + Vector3(0, 0.4, -8.5), Color("e4d9b1"), 0.025)

func _create_map_label(text: String, pos: Vector3, color: Color, pixel: float) -> Label3D:
	var label := Label3D.new()
	label.text = text
	label.font_size = 42
	label.pixel_size = pixel
	label.modulate = color
	label.outline_size = 0
	label.no_depth_test = false
	label.position = pos
	label.rotation_degrees.x = -90.0
	label.cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_OFF
	add_child(label)
	return label

func _create_navigation() -> void:
	nav.region = Rect2i(0, 0, GRID_SIZE, GRID_SIZE)
	nav.cell_size = Vector2(CELL, CELL)
	nav.offset = Vector2(-HALF_SIZE + CELL * 0.5, -HALF_SIZE + CELL * 0.5)
	nav.diagonal_mode = AStarGrid2D.DIAGONAL_MODE_ONLY_IF_NO_OBSTACLES
	nav.default_compute_heuristic = AStarGrid2D.HEURISTIC_OCTILE
	nav.default_estimate_heuristic = AStarGrid2D.HEURISTIC_OCTILE
	nav.update()
	for x in range(GRID_SIZE):
		for y in range(GRID_SIZE):
			var cell := Vector2i(x, y)
			var pos := nav.get_point_position(cell)
			var blocked := not is_land(pos)
			if not blocked:
				for rect in building_rects:
					if rect.has_point(pos):
						blocked = true
						break
			nav.set_point_solid(cell, blocked)

func is_land(point: Vector2) -> bool:
	return Geometry2D.is_point_in_polygon(point, PackedVector2Array(LAND))

func _cell_for(pos: Vector3) -> Vector2i:
	return Vector2i(clampi(int(floor((pos.x + HALF_SIZE) / CELL)), 0, GRID_SIZE - 1), clampi(int(floor((pos.z + HALF_SIZE) / CELL)), 0, GRID_SIZE - 1))

func _nearest_open(cell: Vector2i) -> Vector2i:
	if not nav.is_point_solid(cell):
		return cell
	for radius in range(1, 15):
		for x in range(-radius, radius + 1):
			for y in range(-radius, radius + 1):
				if absi(x) != radius and absi(y) != radius:
					continue
				var candidate := cell + Vector2i(x, y)
				if nav.is_in_boundsv(candidate) and not nav.is_point_solid(candidate):
					return candidate
	return Vector2i(-1, -1)

func find_route(from: Vector3, to: Vector3) -> PackedVector3Array:
	var start := _nearest_open(_cell_for(from))
	var end := _nearest_open(_cell_for(to))
	var route := PackedVector3Array()
	if start.x < 0 or end.x < 0:
		return route
	var points := nav.get_point_path(start, end)
	for point in points:
		route.append(Vector3(point.x, 0.0, point.y))
	return route
