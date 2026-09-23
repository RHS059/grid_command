extends "res://scripts/browser_aircraft_models.gd"
class_name BrowserArmoredModels
## Bradley-inspired IFV. Browser coordinates are X right, Y forward, Z up.
## Keep the original runtime footprint and the independently rotating turret.
var sand: StandardMaterial3D
var light: StandardMaterial3D
var shade: StandardMaterial3D
var rubber: StandardMaterial3D
var canvas: StandardMaterial3D
var lamp: StandardMaterial3D
static var _geometry_cache: Dictionary = {}
static var _paint_material: ShaderMaterial

static func create(role: String, team: int = 0) -> Node3D:
	var faction := clampi(team, 0, 1)
	if _geometry_cache.has(faction):
		var cached := Node3D.new()
		cached.name = role
		var hull := MeshInstance3D.new()
		hull.name = "PaintedHull"
		hull.mesh = _geometry_cache[faction][0]
		hull.material_override = _paint_material
		cached.add_child(hull)
		var turret := Node3D.new()
		turret.name = "turret"
		cached.add_child(turret)
		var turret_mesh := MeshInstance3D.new()
		turret_mesh.name = "PaintedTurret"
		turret_mesh.mesh = _geometry_cache[faction][1]
		turret_mesh.material_override = _paint_material
		turret.add_child(turret_mesh)
		cached.set_meta("visual_revision", "bradley_ifv_2004_r2")
		return cached
	var b := BrowserArmoredModels.new()
	b.root = Node3D.new()
	b.root.name = role
	b.flat = false
	var palette = preload("res://scripts/ground_vehicle_material.gd")
	b.sand = b.material(palette.BODY[faction].to_html(false), 0.92, 0.0)
	b.body = b.sand
	b.light = b.material(palette.LIGHT[faction].to_html(false), 0.92, 0.0)
	b.shade = b.material(palette.SHADE[faction].to_html(false), 0.95, 0.0)
	b.rubber = b.material("232827", 0.98, 0.0)
	b.metal = b.material("4a4e49", 0.88, 0.04)
	b.glass = b.material("203b41", 0.6, 0.0)
	b.dark = b.rubber
	b.canvas = b.material("605b42" if faction == 0 else "4c583e", 0.98, 0.0)
	b.lamp = b.material("b5beb4", 0.65, 0.0)
	b.mark = b.material("54b7ff" if faction == 0 else "ee777b", 0.85, 0.0)
	b.hull_ifv()
	b.bake_painted(b.root)
	var hull_root := b.root
	var turret := Node3D.new()
	turret.name = "turret"
	hull_root.add_child(turret)
	b.root = turret
	b.turret_ifv()
	b.bake_painted(turret)
	_geometry_cache[faction] = [hull_root.get_node("PaintedHull").mesh, turret.get_node("PaintedTurret").mesh]
	hull_root.set_meta("visual_revision", "bradley_ifv_2004_r2")
	return hull_root

## Mesh parts retain local face coordinates and material classes when merged.
## The two output meshes keep this detailed model to two main draw calls.
func bake_painted(parent: Node3D) -> void:
	var st := SurfaceTool.new()
	st.begin(Mesh.PRIMITIVE_TRIANGLES)
	for child in parent.get_children():
		if not child is MeshInstance3D:
			continue
		var mat: StandardMaterial3D = child.material_override
		var arrays: Array = child.mesh.surface_get_arrays(0)
		var positions: PackedVector3Array = arrays[Mesh.ARRAY_VERTEX]
		var normals: PackedVector3Array = arrays[Mesh.ARRAY_NORMAL]
		var colors: PackedColorArray = arrays[Mesh.ARRAY_COLOR] if arrays[Mesh.ARRAY_COLOR] != null else PackedColorArray()
		var indices: PackedInt32Array = arrays[Mesh.ARRAY_INDEX] if arrays[Mesh.ARRAY_INDEX] != null else PackedInt32Array()
		if indices.is_empty():
			for i in positions.size(): indices.append(i)
		var bounds: AABB = child.mesh.get_aabb()
		var sizes: Array = [bounds.size.x, bounds.size.y, bounds.size.z]
		sizes.sort()
		var large := float(sizes[1]) > 0.30 and float(sizes[1]) * float(sizes[2]) > 0.38
		for index in indices:
			var col: Color = colors[index] if not colors.is_empty() else mat.albedo_color
			var paint := mat == sand or mat == light or mat == shade or mat == canvas
			var p: Vector3 = positions[index] - bounds.position
			var n: Vector3 = normals[index]
			var face: Vector2
			if absf(n.x) > absf(n.y) and absf(n.x) > absf(n.z):
				face = Vector2(p.z / maxf(bounds.size.z, 0.001), p.y / maxf(bounds.size.y, 0.001))
			elif absf(n.y) > absf(n.z):
				face = Vector2(p.x / maxf(bounds.size.x, 0.001), p.z / maxf(bounds.size.z, 0.001))
			else:
				face = Vector2(p.x / maxf(bounds.size.x, 0.001), p.y / maxf(bounds.size.y, 0.001))
			var family := float(child.get_meta("surface_family", 1.0 if paint else 0.0))
			st.set_uv(Vector2(1.0 if large and paint else 0.0, family))
			st.set_uv2(face)
			st.set_color(col)
			st.set_normal((child.basis * n).normalized())
			st.add_vertex(child.transform * positions[index])
		parent.remove_child(child)
		child.free()
	var result := MeshInstance3D.new()
	result.name = "PaintedHull" if parent.name != "turret" else "PaintedTurret"
	st.index()
	result.mesh = st.commit()
	if _paint_material == null:
		_paint_material = ShaderMaterial.new()
		_paint_material.shader = preload("res://shaders/ifv_painted_surface.gdshader")
		_paint_material.set_shader_parameter("surface_atlas", preload("res://assets/textures/vehicles/hemtt_atlas.png"))
	result.material_override = _paint_material
	parent.add_child(result)

func family(value: float) -> void:
	root.get_child(root.get_child_count() - 1).set_meta("surface_family", value)

func panel(sections: Array, mat: Material = null, x: float = 0.0) -> void:
	var rings: Array = []
	for s in sections:
		var w: float = s[1] / 2.0
		var d: float = s[2] / 2.0
		var shift: float = s[3] if s.size() > 3 else 0.0
		var ring: Array = []
		for pair in [[-w*0.90,-d],[w*0.90,-d],[w,-d*0.90],[w,d*0.90],[w*0.90,d],[-w*0.90,d],[-w,d*0.90],[-w,-d*0.90]]:
			ring.append(point([pair[0]+x, pair[1]+shift, s[0]]))
		rings.append(ring)
	ring_mesh(rings, mat)

func disc(x: float, y: float, z: float, radius: float, width: float, mat: Material, axis: Vector3 = Vector3.RIGHT, segments: int = 20) -> void:
	var mesh := CylinderMesh.new()
	mesh.top_radius = radius
	mesh.bottom_radius = radius
	mesh.height = width
	mesh.radial_segments = segments
	mesh.rings = 0
	add_mesh(mesh, mat, null, Transform3D(Basis(Quaternion(Vector3.UP, axis)), point([x,y,z])))

func handle(x: float, y: float, z: float, width: float, height: float, axis: String = "top") -> void:
	if axis == "rear":
		rail([x-width/2,y,z],[x-width/2,y-0.075,z+height],0.018,shade)
		rail([x-width/2,y-0.075,z+height],[x+width/2,y-0.075,z+height],0.018,light)
		rail([x+width/2,y-0.075,z+height],[x+width/2,y,z],0.018,shade)
	else:
		rail([x-width/2,y,z],[x-width/2,y,z+height],0.018,shade)
		rail([x-width/2,y,z+height],[x+width/2,y,z+height],0.018,light)
		rail([x+width/2,y,z+height],[x+width/2,y,z],0.018,shade)

func road_wheel(sign: float, y: float, z: float, radius: float, drive: bool = false) -> void:
	var x := sign * 1.48
	disc(x, y, z, radius, 0.38, rubber)
	disc(sign*1.69, y, z, radius*0.82, 0.055, shade)
	disc(sign*1.726, y, z, radius*0.65, 0.035, sand)
	disc(sign*1.755, y, z, radius*0.28, 0.07, metal if drive else shade, Vector3.RIGHT, 12)
	for i in range(6):
		var a := TAU * float(i) / 6.0
		disc(sign*1.759,y+cos(a)*radius*0.48,z+sin(a)*radius*0.48,0.026,0.025,metal,Vector3.RIGHT,6)
	if drive:
		for i in range(14):
			var a := TAU * float(i) / 14.0
			box(0.14,0.105,0.08,sign*1.72,y+cos(a)*radius,z+sin(a)*radius,metal)
			root.get_child(root.get_child_count()-1).rotate_x(-a)

func tracks(sign: float) -> void:
	# Open track loop. This leaves real gaps between the road wheels.
	var outer: Array[Vector2] = [Vector2(-2.62,0.11),Vector2(2.40,0.11),Vector2(2.98,0.52),Vector2(3.01,0.94),Vector2(2.63,1.29),Vector2(-2.59,1.29),Vector2(-2.99,0.92),Vector2(-3.00,0.52)]
	var inner: Array[Vector2] = [Vector2(-2.57,0.22),Vector2(2.36,0.22),Vector2(2.87,0.58),Vector2(2.89,0.89),Vector2(2.58,1.18),Vector2(-2.54,1.18),Vector2(-2.87,0.87),Vector2(-2.88,0.56)]
	var vertices: Array = []
	for j in range(8):
		var k := (j + 1) % 8
		for side in [-1.0,1.0]:
			var x: float = sign*1.49 + side*0.245
			var a := point([x,outer[j].x,outer[j].y])
			var b := point([x,outer[k].x,outer[k].y])
			var c := point([x,inner[k].x,inner[k].y])
			var d := point([x,inner[j].x,inner[j].y])
			vertices.append_array([a,c,b,a,d,c] if side > 0 else [a,b,c,a,c,d])
		for edge in [outer,inner]:
			var a := point([sign*1.49-0.245,edge[j].x,edge[j].y])
			var b := point([sign*1.49-0.245,edge[k].x,edge[k].y])
			var c := point([sign*1.49+0.245,edge[k].x,edge[k].y])
			var d := point([sign*1.49+0.245,edge[j].x,edge[j].y])
			vertices.append_array([a,b,c,a,c,d] if edge == outer else [a,c,b,a,d,c])
	triangles(vertices,rubber)
	var perimeter := 0.0
	for i in range(8): perimeter += outer[i].distance_to(outer[(i+1)%8])
	var count := 56
	for i in range(count):
		var distance := perimeter * (float(i) + 0.5) / float(count)
		var j := 0
		while j < 7 and distance > outer[j].distance_to(outer[j+1]):
			distance -= outer[j].distance_to(outer[j+1])
			j += 1
		var v: Vector2 = (outer[(j+1)%8] - outer[j]).normalized()
		var p: Vector2 = outer[j] + v * distance
		var outward := Vector2(v.y,-v.x)
		var shoe := BoxMesh.new()
		shoe.size = Vector3(0.54,0.062,perimeter/float(count)*0.82)
		var basis := Basis(Vector3.RIGHT,atan2(v.y,v.x))
		add_mesh(shoe,metal,null,Transform3D(basis,point([sign*1.49,p.x,p.y])))
		var pad := BoxMesh.new()
		pad.size = Vector3(0.38,0.035,perimeter/float(count)*0.62)
		add_mesh(pad,rubber,null,Transform3D(basis,point([sign*1.49,p.x+outward.x*0.045,p.y+outward.y*0.045])))
	for i in range(6): road_wheel(sign,-2.20+float(i)*0.855,0.66,0.445)
	road_wheel(sign,2.59,0.86,0.35,true)
	road_wheel(sign,-2.64,0.88,0.32)

func hull_ifv() -> void:
	# Main manufactured shell: belly, vertical side, glacis break and roof.
	panel([[0.47,2.10,5.50,-0.12],[1.06,2.88,6.34,0.0],[1.48,2.93,6.20,-0.04],[2.04,2.69,4.98,-0.57]],sand)
	panel([[0.46,1.90,4.90,-0.1],[0.58,2.12,5.20,-0.1]],shade)
	# Nose service panels follow the slope instead of floating above it.
	for row in [[-0.49,0.98],[0.55,0.81]]:
		var x: float = row[0]
		var w: float = row[1]
		var mesh := BoxMesh.new()
		mesh.size = Vector3(w,0.028,1.0)
		var slope := Basis(Vector3.RIGHT,-0.456)
		add_mesh(mesh,shade,null,Transform3D(slope,point([x,2.33,1.862])))
		mesh = BoxMesh.new()
		mesh.size = Vector3(w-0.045,0.030,0.945)
		add_mesh(mesh,sand,null,Transform3D(slope,point([x,2.339,1.882])))
		for dy in [-0.34,0.34]:
			handle(x,2.32+dy,1.899-dy*0.49,0.19,0.035)
	# Tall side skirt cassette plates and a separate fender lip.
	for sign in [-1.0,1.0]:
		tracks(sign)
		box(0.44,5.48,0.105,sign*1.43,-0.07,1.41,shade)
		for i in range(6):
			var y := -2.37 + float(i)*0.91
			box(0.15,0.876,0.61,sign*1.615,y,1.77,shade)
			box(0.028,0.814,0.55,sign*1.70,y,1.79,sand if i%3 != 0 else light)
			# Top hinge and bottom lift points, not random surface clutter.
			for dy in [-0.27,0.27]:
				box(0.072,0.13,0.075,sign*1.73,y+dy,2.018,shade)
				box(0.078,0.09,0.035,sign*1.73,y+dy,1.58,metal)
		box(0.12,4.8,0.055,sign*1.50,-0.16,2.115,light)
		# Mudguard ends and front lamp cages follow the glacis corners.
		extrusion([[2.40,1.45],[3.10,1.09],[3.14,0.84],[2.90,0.82],[2.68,1.05]],0.49,"x",sign*1.49,sand)
		extrusion([[-2.65,1.42],[-3.10,1.19],[-3.16,0.77],[-2.93,0.77],[-2.81,1.08]],0.47,"x",sign*1.49,shade)
		box(0.38,0.35,0.35,sign*1.10,2.19,1.90,shade)
		box(0.26,0.025,0.235,sign*1.10,2.38,1.925,rubber)
		for side in [-1,1]:
			disc(sign*1.10+side*0.065,2.402,1.946,0.055,0.022,lamp,Vector3.FORWARD,12)
		for x in [sign*1.10-0.15,sign*1.10+0.15]:
			rail([x,2.385,1.77],[x,2.385,2.105],0.018,sand)
		rail([sign*1.10-0.15,2.385,2.105],[sign*1.10+0.15,2.385,2.105],0.018,sand)
		# Tow eyes have a true open center.
		tow_eye(sign*0.90,3.23,0.97)
		box(0.024,0.49,0.16,sign*1.72,-1.59,1.90,mark)
	# Driver hatch with three separate observation blocks.
	panel([[2.05,0.66,0.80,1.27],[2.10,0.68,0.81,1.27]],shade,-0.67)
	panel([[2.11,0.59,0.71,1.27],[2.145,0.56,0.69,1.27]],sand,-0.67)
	for x in [-0.89,-0.67,-0.45]:
		box(0.17,0.11,0.08,x,1.60,2.15,shade)
		box(0.128,0.012,0.044,x,1.662,2.17,glass)
	handle(-0.67,1.26,2.166,0.18,0.055)
	# Engine deck and passenger roof: large forms are visibly distinct.
	box(1.06,1.15,0.032,0.64,0.94,2.062,rubber)
	for i in range(9): box(0.99,0.063,0.035,0.64,0.45+i*0.123,2.092,shade)
	box(1.77,1.18,0.055,0,-1.98,2.077,shade)
	for sign in [-1,1]:
		box(0.815,1.065,0.04,sign*0.433,-1.98,2.118,sand)
		handle(sign*0.46,-1.68,2.14,0.22,0.055)
		for y in [-2.31,-1.81]: box(0.065,0.17,0.042,sign*0.84,y,2.145,metal)
	# Rear personnel ramp and inset access door, with hinges and lamps.
	box(1.88,0.055,1.07,0,-3.125,1.44,shade)
	box(1.73,0.04,0.94,0,-3.167,1.45,sand)
	box(0.63,0.016,0.67,-0.22,-3.193,1.47,shade)
	box(0.575,0.015,0.60,-0.22,-3.210,1.48,sand)
	handle(-0.42,-3.234,1.38,0.15,0.05,"rear")
	for x in [-0.63,0.63]:
		box(0.24,0.1,0.12,x,-3.204,1.01,metal)
		rail([x,-3.267,1.01],[x+0.16,-3.267,1.01],0.028,shade)
	for sign in [-1,1]:
		box(0.21,0.12,0.23,sign*1.24,-3.08,1.61,shade)
		box(0.105,0.018,0.10,sign*1.24,-3.15,1.64,material("88342d"))
		box(0.24,0.22,0.36,sign*1.17,-2.45,2.20,shade)
	# Right exhaust has a dark opening and local stain; no body-wide soot.
	box(0.047,0.57,0.25,1.384,0.45,1.98,rubber)
	for i in range(5): box(0.06,0.045,0.235,1.42,0.21+i*0.115,1.99,metal)

func tow_eye(x: float,y: float,z: float) -> void:
	var mesh := TorusMesh.new()
	mesh.inner_radius = 0.053
	mesh.outer_radius = 0.106
	mesh.rings = 12
	mesh.ring_segments = 6
	add_mesh(mesh,metal,null,Transform3D(Basis(Vector3.RIGHT,PI/2.0),point([x,y,z])))
	box(0.19,0.15,0.18,x,y-0.065,z+0.11,shade)

func turret_ifv() -> void:
	# Raised ring keeps an honest seam and a visible dark under-turret cavity.
	disc(0,-0.22,2.10,0.92,0.18,rubber,Vector3.UP,32)
	disc(0,-0.22,2.17,0.97,0.08,shade,Vector3.UP,32)
	panel([[2.19,1.88,2.00,-0.24],[2.47,2.00,2.18,-0.28],[2.93,1.57,1.77,-0.42]],sand)
	# Defined cheek plates leave the mantlet and weapon cradle readable.
	for sign in [-1,1]:
		panel([[2.43,0.40,0.80,0.40],[2.80,0.33,0.72,0.29]],light,sign*0.69)
	box(0.58,0.43,0.43,0,0.83,2.58,shade)
	disc(0,1.048,2.60,0.18,0.19,sand,Vector3.FORWARD,16)
	rail([0,1.08,2.60],[0,1.47,2.60],0.097,shade)
	rail([0,1.45,2.60],[0,3.23,2.60],0.047,metal)
	rail([0,3.18,2.60],[0,3.38,2.60],0.076,shade)
	disc(0,3.391,2.60,0.048,0.010,rubber,Vector3.FORWARD,12)
	# Coax and sight housings are small functional shapes with clean paint.
	rail([0.29,0.93,2.56],[0.29,1.47,2.56],0.024,rubber)
	box(0.37,0.45,0.27,-0.43,0.13,2.992,shade)
	box(0.285,0.032,0.15,-0.43,0.377,3.004,glass)
	box(0.33,0.12,0.03,-0.43,0.353,3.101,sand)
	# Closed commander's cupola, hatch, periscopes and handle.
	disc(0.36,-0.53,2.984,0.33,0.092,shade,Vector3.UP,24)
	disc(0.36,-0.53,3.048,0.285,0.058,light,Vector3.UP,24)
	for i in range(5):
		var a := TAU*float(i)/5.0
		box(0.13,0.10,0.065,0.36+cos(a)*0.255,-0.53+sin(a)*0.255,3.108,shade)
	handle(0.36,-0.54,3.085,0.17,0.05)
	# One left-side twin TOW launcher, not duplicated missile boxes.
	box(0.22,0.48,0.19,-1.02,-0.24,2.74,metal)
	panel([[2.68,0.56,1.40,-0.34],[2.78,0.58,1.43,-0.34],[3.08,0.53,1.41,-0.34]],shade,-1.27)
	box(0.46,1.33,0.06,-1.27,-0.34,3.13,sand)
	for x in [-1.40,-1.14]:
		box(0.207,0.018,0.28,x,0.384,2.909,rubber)
		box(0.167,0.018,0.23,x,0.396,2.911,metal)
		box(0.027,1.21,0.027,x,-0.31,3.179,light)
	for y in [-0.84,0.15]: box(0.56,0.065,0.048,-1.27,y,3.185,shade)
	# Smoke launchers: two banks of four tubes with real dark bores.
	for sign in [-1,1]:
		box(0.16,0.50,0.13,sign*0.94,0.25,2.46,shade)
		for i in range(4):
			var y := 0.06+i*0.155
			rail([sign*0.95,y,2.48],[sign*1.13,y+0.18,2.71],0.045,shade)
			disc(sign*1.132,y+0.181,2.713,0.03,0.008,rubber,Vector3(sign*0.52,0.68,-0.52).normalized(),8)
	# Right sight, rear stowage basket and two grounded aerial bases.
	box(0.31,0.30,0.32,0.68,-0.89,3.01,shade)
	box(0.23,0.02,0.16,0.68,-0.727,3.03,glass)
	box(1.30,0.35,0.21,0,-1.35,2.48,shade)
	for x in [-0.64,0.0,0.64]: rail([x,-1.33,2.52],[x,-1.53,2.84],0.022,metal)
	rail([-0.67,-1.53,2.84],[0.67,-1.53,2.84],0.022,metal)
	rail([-0.67,-1.51,2.66],[0.67,-1.51,2.66],0.018,metal)
	# Two strapped canvas packs are small enough to fit their actual basket.
	for x in [-0.33,0.30]:
		panel([[2.57,0.45,0.32,-1.36],[2.68,0.48,0.38,-1.36],[2.85,0.40,0.34,-1.36]],canvas,x)
		family(4.0)
		for y in [-1.47,-1.26]: box(0.46,0.026,0.028,x,y,2.855,shade)
	for pair in [[-0.57,-0.93,4.13],[0.70,-1.10,3.78]]:
		var x: float = pair[0]
		var y: float = pair[1]
		disc(x,y,2.93,0.064,0.18,shade,Vector3.UP,12)
		rail([x,y,3.01],[x,y,pair[2]],0.011,rubber)
	box(0.020,0.45,0.14,0.976,-0.34,2.62,mark)
