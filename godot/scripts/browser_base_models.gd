extends RefCounted
class_name BrowserBaseModels

## Direct source port of lib/game/base-models.ts, mob-models.ts and container-model.ts.
## Dimensions are source metres. Browser (x,y,z-up) becomes Godot (x,z,-y).
## Static geometry is merged by material; named garage/crane parts remain movable.
const GRADE_CLEARANCE := 0.1

class Builder:
	var root: Node3D
	var materials: Array[Material]
	var surfaces: Dictionary = {}
	func _init(parent: Node3D, palette: Array[Material]) -> void:
		root = parent
		materials = palette
	func put(mesh: Mesh, position: Vector3, index: int = 0, basis: Basis = Basis.IDENTITY) -> void:
		if not surfaces.has(index):
			var surface := SurfaceTool.new()
			surface.begin(Mesh.PRIMITIVE_TRIANGLES)
			surface.set_material(materials[index])
			surfaces[index] = surface
		surfaces[index].append_from(mesh,0,Transform3D(basis,position))
	func box(w: float,d: float,h: float,x: float,y: float,z: float,index: int = 0,subdivide := false) -> void:
		var mesh := BoxMesh.new()
		mesh.size = Vector3(w,h,d)
		if subdivide:
			mesh.subdivide_width = maxi(0,ceili(w/12.0)-1)
			mesh.subdivide_depth = maxi(0,ceili(d/12.0)-1)
		put(mesh,Vector3(x,z,-y),index)
	func pole(radius: float,h: float,x: float,y: float,index := 2) -> void:
		var mesh := CylinderMesh.new()
		mesh.top_radius = radius
		mesh.bottom_radius = radius
		mesh.height = h
		mesh.radial_segments = 12
		put(mesh,Vector3(x,h/2,-y),index)
	func flush() -> void:
		for index in surfaces:
			var instance := MeshInstance3D.new()
			instance.name = root.name+"-"+str(index)
			instance.mesh = surfaces[index].commit()
			root.add_child(instance)
		surfaces.clear()

static func _material(color: Color, roughness := 0.85, metallic := 0.12) -> StandardMaterial3D:
	var material := StandardMaterial3D.new()
	material.albedo_color = color
	material.roughness = roughness
	material.metallic = metallic
	material.cull_mode = BaseMaterial3D.CULL_DISABLED
	return material

static func create(kind: String, team: int = 0, tier: int = 1) -> Node3D:
	var root := Node3D.new()
	root.name = kind
	tier = clampi(tier,1,3)
	root.set_meta("tier",tier)
	root.set_meta("source_units","metres")
	var side := Color("54b7ff") if team == 0 else Color("ee777b")
	# Keep the slabs and trim in the same concrete family. The old pale trim
	# (#a4afb4) clipped almost white under the model-viewer key light.
	var palette: Array[Material] = [
		_material(Color("65716a"),0.94,0.03),
		_material(Color("18222b"),0.92,0.04),
		_material(Color("7b8582"),0.97,0.0),
		_material(side,0.85,0.0),
		_material(Color("293e4c"),0.2,0.7),
	]
	var b := Builder.new(root,palette)
	if kind == "MOB":
		b.box(160,180,0.35,0,50,-0.175,2,true)
		root.add_child(_create_yard(tier,side))
		_shelter(b,-16,-13,27,17,7)
		for i in range(5): b.box(2.3,0.18,1.6,-26+i*4.8,-21.6,4,4)
		b.box(5,4,1.4,-23,-14,7.8,1)
		b.box(5,4,1.4,-13,-14,7.8,1)
		_shelter(b,23,-17,15,22,5)
		for i in range(4):
			b.box(2,2,1.8,-25+i*3,22,0.9)
			b.box(2.1,2.1,0.12,-25+i*3,22,1.8,1)
		b.pole(0.3,22,-34,-23)
		b.pole(0.12,14,-31,-23)
		for i in range(4):
			b.box(5,0.15,0.15,-34,-23,14+i*2,2)
			b.box(0.15,4,0.15,-34,-23,14+i*2,2)
		b.put(_dish_mesh(),Vector3(-31,13,23),2)
		for x in range(-72,73,8):
			b.box(7,1.2,1.6,x,-38,0.8,2)
			if x < 48: b.box(7,1.2,1.6,x,138,0.8,2)
		for x in [-78,78]:
			for y in range(-30,131,8): b.box(1.2,7,1.6,x,y,0.8,2)
		b.pole(0.12,10,-9,24)
		b.box(3,0.08,1.6,-7.5,24,9,3)
		b.box(14,1,0.05,0,29,0.04,1)
	elif kind == "AIRFIELD":
		b.box(240 if tier == 3 else 170,1200,0.45,-35 if tier == 3 else 0,0,-0.225,2,true)
		if tier == 3:
			_runway(b,-118)
			for y in [-160,140]: b.box(70,12,0.1,-83,y,0.04,1,true)
		b.box(32,1200,0.12,-48,0,0.02,1,true)
		b.box(13,350,0.12,-8,0,0.02,1,true)
		b.box(90,190,0.12,32,-5,0.02,1,true)
		for y in [-160,140]: b.box(40,12,0.1,-30,y,0.04,1,true)
		_runway_markings(b,-48)
		_shelter(b,46,-64,48,38,14)
		_shelter(b,46,4,48,38,14)
		b.box(9,10,19,57,71,9.5)
		b.box(17,15,5,57,71,21,4)
		b.box(18,16,0.6,57,71,23.8,2)
		for x in [49,53,57,61,65]: b.box(0.18,15.2,4.8,x,71,21,2)
		b.pole(0.13,29,57,71)
		for y in [127,171]:
			b.box(31,31,0.08,42,y,0.05,1)
			b.box(2,14,0.04,37,y,0.13,2)
			b.box(2,14,0.04,47,y,0.13,2)
			b.box(10,2,0.04,42,y,0.13,2)
			b.put(_ring_mesh(12,12.4),Vector3(42,0.14,-y),2)
		for i in range(3):
			b.pole(4,7,23+i*18,-165,2)
			b.box(6,6,0.5,23+i*18,-165,7.2)
		for y in range(-115,100,45): b.box(15,0.3,0.04,6,y,0.12,2)
	else:
		push_error("Unsupported browser base kind: "+kind)
	b.flush()
	return root

static func _shelter(b: Builder,x: float,y: float,w: float,d: float,h: float) -> void:
	b.box(w,d,h,x,y,h/2,0,true)
	b.box(w+0.5,d+0.5,0.4,x,y,h,2,true)
	b.box(w*0.78,0.15,h*0.72,x,y+d/2+0.1,h*0.37,1)
	for i in range(6): b.box(0.08,0.18,h*0.7,x-w*0.33+i*w*0.13,y+d/2+0.2,h*0.37,2)
	b.box(w*0.7,0.16,0.55,x,y+d/2+0.25,h-0.8,3)

static func _runway(b: Builder,x: float) -> void:
	b.box(32,1200,0.12,x,0,0.02,1,true)
	_runway_markings(b,x)

static func _runway_markings(b: Builder,x: float) -> void:
	for y in range(-570,571,27): b.box(1,12,0.03,x,y,0.11,2)
	for sign_value in [-1,1]:
		b.box(0.5,1180,0.03,x+sign_value*14,0,0.11,2,true)
		for i in range(4): b.box(1.5,17,0.03,x-11+i*7,sign_value*583,0.11,2)
	for y in range(-175,176,25):
		for offset in [-17,17]: b.box(0.6,0.6,0.25,x+offset,y,0.2,3)

static func _dynamic_box(parent: Node3D,mat: Material,w: float,d: float,h: float,x: float,y: float,z: float,node_name: String) -> MeshInstance3D:
	var mesh := BoxMesh.new()
	mesh.size = Vector3(w,h,d)
	var instance := MeshInstance3D.new()
	instance.mesh = mesh
	instance.material_override = mat
	instance.position = Vector3(x,z,-y)
	instance.name = node_name
	parent.add_child(instance)
	return instance

static func _create_yard(tier: int,side: Color) -> Node3D:
	var yard := Node3D.new()
	yard.name = "mob-yard"
	yard.set_meta("skip_terrain_conform",true)
	var green := _material(Color("35432c"),0.92,0.15)
	var steel := _material(Color("424a3c"),0.8,0.3)
	var black := _material(Color("181e1b"),1,0)
	var marking := _material(side,0.72,0)
	marking.emission_enabled = true
	marking.emission = side
	marking.emission_energy_multiplier = 0.08
	var palette: Array[Material] = [green,steel,black,marking]
	for slot in range(3):
		var storage_x := 15+slot*7
		var trailer := Node3D.new()
		trailer.name = "mob-storage-%d" % slot
		yard.add_child(trailer)
		var t := Builder.new(trailer,palette)
		t.box(2.7,5.6,0.25,storage_x,16,1.35,1)
		for x in [-1.3,1.3]:
			for y in [-1.7,1.7]:
				var wheel := CylinderMesh.new()
				wheel.top_radius = 0.6
				wheel.bottom_radius = 0.6
				wheel.height = 0.3
				wheel.radial_segments = 10
				t.put(wheel,Vector3(storage_x+x,0.6,-16-y),2,Basis(Vector3.FORWARD,PI/2))
		t.flush()
		var stored := _cargo_container()
		stored.position = Vector3(storage_x,2.7,-16)
		trailer.add_child(stored)
		if slot >= tier: continue
		var crane := Node3D.new()
		crane.name = "mob-crane-%d" % slot
		yard.add_child(crane)
		var c := Builder.new(crane,palette)
		for sign_value in [-1,1]:
			c.box(0.5,76,0.5,storage_x+sign_value*3,49,10)
			for y in [12,86]:
				c.box(0.65,0.65,10,storage_x+sign_value*3,y,5)
				c.box(1.2,2,0.3,storage_x+sign_value*3,y,0.2,1)
			for y in range(16,85,8): c.box(0.12,0.12,1.2,storage_x+sign_value*3,y,10.6,1)
		c.box(6.5,1,0.6,storage_x,12,10.1)
		c.box(6.5,1,0.6,storage_x,86,10.1)
		c.flush()
		var trolley := Node3D.new()
		trolley.name = "trolley"
		trolley.position.z = -16
		crane.add_child(trolley)
		var moving := Builder.new(trolley,palette)
		moving.box(6.5,1.2,0.5,storage_x,0,10.4)
		moving.box(1.8,1.8,1,storage_x,0,10.9,1)
		moving.flush()
		_dynamic_box(trolley,black,0.07,0.07,1,storage_x,0,9.65,"cable").scale.y = 1.1
		_dynamic_box(trolley,steel,2.6,5.3,0.16,storage_x,0,9.1,"spreader")
		var cargo := _cargo_container()
		cargo.name = "lifted-container"
		cargo.visible = false
		crane.add_child(cargo)
	var b := Builder.new(yard,palette)
	var pad_top := 0.55 if tier == 3 else 0.08
	var pad := CylinderMesh.new()
	pad.top_radius = 16
	pad.bottom_radius = 16
	pad.height = pad_top
	pad.radial_segments = 48
	b.put(pad,Vector3(-55,pad_top/2,-78),1)
	b.put(_ring_mesh(12.8,13.5),Vector3(-55,pad_top+0.015,-78),3)
	b.box(2,14,0.06,-60,78,pad_top+0.04,3)
	b.box(2,14,0.06,-50,78,pad_top+0.04,3)
	b.box(10,2,0.06,-55,78,pad_top+0.04,3)
	b.flush()
	var garage := Node3D.new()
	garage.name = "mob-garage"
	yard.add_child(garage)
	var g := Builder.new(garage,palette)
	g.box(38,32,0.6,-52,-18,0.3,1)
	g.box(38,32,0.7,-52,-18,11,1)
	g.box(1.2,32,11,-70.4,-18,5.5)
	g.box(1.2,32,11,-33.6,-18,5.5)
	g.box(38,1.2,11,-52,-33.4,5.5)
	g.box(6,1.2,11,-68,-2.6,5.5)
	g.box(6,1.2,11,-36,-2.6,5.5)
	if tier == 3:
		g.box(40,2,0.5,-52,-35,12,3)
		for x in [-12,0,12]: g.box(3,0.3,0.4,-52+x,-1.4,10,3)
	g.flush()
	var door := _dynamic_box(garage,black,26,0.5,8,-52,-1.8,4,"mob-garage-door")
	door.set_meta("closed_y",4.0)
	return yard

static func _cargo_container() -> Node3D:
	var root := Node3D.new()
	root.name = "cargo-container"
	var materials: Array[Material] = [_material(Color("73765a"),0.9,0.12)]
	var b := Builder.new(root,materials)
	b.box(2.5,5.15,2.45,0,0,0)
	for sign_value in [-1,1]:
		for i in range(24): b.box(0.05,0.055,2.3,sign_value*1.275,-2.47+i*0.215,0)
	for i in range(24): b.box(2.45,0.055,0.035,0,-2.47+i*0.215,1.245)
	for x in [-1.24,1.24]:
		for y in [-2.6,2.6]: b.box(0.1,0.1,2.5,x,y,0)
	for x in [-0.63,0.63]:
		b.box(1.2,0.045,2.3,x,-2.6,0)
		b.box(0.035,0.065,2.05,x,-2.65,0)
		b.box(0.23,0.07,0.045,x,-2.67,-0.4)
	b.flush()
	return root

static func _ring_mesh(inner: float,outer: float) -> ArrayMesh:
	var tool := SurfaceTool.new()
	tool.begin(Mesh.PRIMITIVE_TRIANGLES)
	for i in range(48):
		var a := TAU*i/48.0
		var b := TAU*(i+1)/48.0
		for vertex in [Vector3(cos(a)*inner,0,-sin(a)*inner),Vector3(cos(a)*outer,0,-sin(a)*outer),Vector3(cos(b)*outer,0,-sin(b)*outer),Vector3(cos(a)*inner,0,-sin(a)*inner),Vector3(cos(b)*outer,0,-sin(b)*outer),Vector3(cos(b)*inner,0,-sin(b)*inner)]:
			tool.set_normal(Vector3.UP)
			tool.add_vertex(vertex)
	return tool.commit()

static func _dish_mesh() -> ArrayMesh:
	var tool := SurfaceTool.new()
	tool.begin(Mesh.PRIMITIVE_TRIANGLES)
	var source_rotation := Basis(Vector3.RIGHT,PI/3)
	for row in range(8):
		for column in range(16):
			var corners: Array[Vector3] = []
			for offset in [Vector2(0,0),Vector2(1,0),Vector2(1,1),Vector2(0,1)]:
				var phi: float = (column+offset.x)/16.0*TAU
				var theta: float = (row+offset.y)/8.0*PI/3
				var normal := source_rotation*Vector3(-cos(phi)*sin(theta),cos(theta),sin(phi)*sin(theta))
				corners.append(Vector3(normal.x,normal.z,-normal.y))
			for index in [0,1,3,1,2,3]:
				tool.set_normal(corners[index])
				tool.add_vertex(corners[index]*2)
	return tool.commit()

## Same level grade/skirt rule as conformBase; heights are source metres.
static func conform(root: Node3D, high: float, low: float) -> void:
	var deck := high+GRADE_CLEARANCE
	root.set_meta("platform_height",deck)
	for child in root.get_children():
		if child.get_meta("skip_terrain_conform",false):
			if child is Node3D: child.position.y = deck
			continue
		if not child is MeshInstance3D or not child.mesh is ArrayMesh: continue
		if not child.has_meta("source_mesh"): child.set_meta("source_mesh",child.mesh)
		var original: ArrayMesh = child.get_meta("source_mesh")
		var conformed := ArrayMesh.new()
		for index in range(original.get_surface_count()):
			var arrays := original.surface_get_arrays(index)
			var positions: PackedVector3Array = arrays[Mesh.ARRAY_VERTEX].duplicate()
			for vertex in range(positions.size()):
				positions[vertex].y += low-2 if positions[vertex].y < -0.3 else deck
			arrays[Mesh.ARRAY_VERTEX] = positions
			conformed.add_surface_from_arrays(Mesh.PRIMITIVE_TRIANGLES,arrays)
			conformed.surface_set_material(index,original.surface_get_material(index))
		child.mesh = conformed

static func set_garage_open(root: Node3D, fraction: float) -> void:
	var door := root.find_child("mob-garage-door",true,false) as Node3D
	if door: door.position.y = float(door.get_meta("closed_y",4.0))+clampf(fraction,0,1)*8.0
