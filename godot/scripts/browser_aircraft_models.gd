extends RefCounted
class_name BrowserAircraftModels
## Direct source port: lib/game/reference-aircraft.ts and model-geometry.ts.
## Browser (X,Y,Z) becomes Godot (X,Z,-Y); dimensions remain in meters.
var root: Node3D
var body: StandardMaterial3D
var dark: StandardMaterial3D
var glass: StandardMaterial3D
var metal: StandardMaterial3D
var mark: StandardMaterial3D
var flat := false
var large_body_material: ShaderMaterial

static func create(role: String, team: int = 0) -> Node3D:
	var builder := BrowserAircraftModels.new()
	builder.root = Node3D.new(); builder.root.name = role
	# Aircraft retain their natural neutral finish. Faction ownership is confined
	# to the cyan/red recognition panels so silhouettes remain plausible.
	builder.body = builder.material("70777a",0.9,0.0)
	builder.large_body_material = ShaderMaterial.new()
	builder.large_body_material.shader = preload("res://shaders/ps2_surface.gdshader")
	builder.large_body_material.set_shader_parameter("atlas", preload("res://assets/textures/vehicles/hemtt_atlas.png"))
	var paint := Color("70777a")
	builder.large_body_material.set_shader_parameter("ramp_mid", paint)
	builder.large_body_material.set_shader_parameter("ramp_dark", paint.darkened(0.24))
	builder.large_body_material.set_shader_parameter("ramp_light", paint.lightened(0.12))
	builder.large_body_material.set_shader_parameter("tiles_per_unit", 0.18)
	builder.large_body_material.set_shader_parameter("roughness_value", 0.9)
	builder.large_body_material.set_shader_parameter("metallic_value", 0.0)
	builder.dark = builder.material("272e30",0.9)
	builder.glass = builder.material("344b59",0.55,0.0)
	builder.metal = builder.material("555f60",0.8)
	builder.mark = builder.material("54b7ff" if team == 0 else "ee777b",0.85)
	if role == "CARGO_PLANE": builder.cargo_plane()
	elif role == "TRANSPORT_HELI": builder.transport_heli()
	elif role == "CAS_FIGHTER": builder.cas_aircraft()
	builder.bake(builder.root)
	return builder.root

func material(color: String, roughness: float = 0.85, metallic: float = 0.0) -> StandardMaterial3D:
	var m := StandardMaterial3D.new(); m.albedo_color = Color(color); m.roughness = roughness; m.metallic = metallic; return m

func point(v: Array) -> Vector3:
	return Vector3(v[0],v[2],-v[1])

func add_mesh(mesh: Mesh, mat: Material = null, parent: Node3D = null, transform: Transform3D = Transform3D.IDENTITY) -> MeshInstance3D:
	var object := MeshInstance3D.new(); object.mesh = mesh; object.material_override = body if mat == null else mat; object.transform = transform
	# Large airframe shells receive the shared painted atlas; small parts, glass,
	# rotors and markings stay on their separate clean material contracts.
	var size := mesh.get_aabb().size
	var area := size.x*size.y + size.y*size.z + size.x*size.z
	if large_body_material != null and object.material_override == body and area > 3.0:
		object.material_override = large_body_material
	(root if parent == null else parent).add_child(object)
	return object

func triangles(vertices: Array, mat: Material = null, parent: Node3D = null) -> MeshInstance3D:
	var st := SurfaceTool.new(); st.begin(Mesh.PRIMITIVE_TRIANGLES)
	var face_normals: Array[Vector3]=[]
	var adjacency: Dictionary={}
	for i in range(0,vertices.size(),3):
		var normal: Vector3=(vertices[i+1]-vertices[i]).cross(vertices[i+2]-vertices[i]).normalized()
		face_normals.append(normal)
		for j in range(3):
			var key: Vector3=vertices[i+j].snapped(Vector3.ONE*0.000001)
			if not adjacency.has(key): adjacency[key]=[]
			adjacency[key].append(normal)
	for i in range(0,vertices.size(),3):
		var a: Vector3 = vertices[i]; var b: Vector3 = vertices[i+1]; var c: Vector3 = vertices[i+2]
		var normal: Vector3=face_normals[int(i/3)]
		for v in [a,c,b]:
			var smooth := Vector3.ZERO
			for adjacent in adjacency[v.snapped(Vector3.ONE*0.000001)]:
				if normal.dot(adjacent)>=cos(deg_to_rad(30.0)): smooth+=adjacent
			st.set_normal(normal if flat else smooth.normalized()); st.add_vertex(v)
	return add_mesh(st.commit(),mat,parent)

func box(w: float,d: float,h: float,x: float,y: float,z: float,mat: Material=null,parent: Node3D=null) -> void:
	var mesh := BoxMesh.new(); mesh.size = Vector3(w,h,d); add_mesh(mesh,mat,parent,Transform3D(Basis.IDENTITY,point([x,y,z])))

func rail(a: Array,b: Array,r: float,mat: Material=null,parent: Node3D=null) -> void:
	var start := point(a); var finish := point(b); var mesh := CylinderMesh.new(); mesh.top_radius=r; mesh.bottom_radius=r; mesh.height=start.distance_to(finish); mesh.radial_segments=8; mesh.rings=1
	add_mesh(mesh,metal if mat == null else mat,parent,Transform3D(Basis(Quaternion(Vector3.UP,(finish-start).normalized())),(start+finish)*0.5))

func wheel_mesh(x: float,y: float,z: float,r: float,width: float,mat: Material=null) -> void:
	var wheel_node: Node3D = preload("res://scripts/shared_vehicle_wheel.gd").create(r, width, Color("666b68"))
	wheel_node.position = point([x,y,z])
	root.add_child(wheel_node)

func wheel(x: float,y: float,r: float=0.3) -> void:
	wheel_mesh(x,y,r,r,0.23); rail([x,y,r],[x,y,1.25],0.055)

func hull(sections: Array,z: float,mat: Material=null,x: float=0.0) -> void:
	var rings: Array = []
	for s in sections:
		var w: float=s[1]/2.0; var h: float=s[2]/2.0
		var ring: Array=[]
		for pair in [[-w*0.8,-h],[w*0.8,-h],[w,-h*0.8],[w,h*0.8],[w*0.8,h],[-w*0.8,h],[-w,h*0.8],[-w,-h*0.8]]:
			ring.append(point([pair[0]+x,s[0],z-pair[1]]))
		rings.append(ring)
	ring_mesh(rings,mat)

func ring_mesh(rings: Array,mat: Material=null) -> void:
	var vertices: Array=[]
	for r in range(rings.size()-1):
		for i in range(8):
			var n := (i+1)%8
			vertices.append_array([rings[r][i],rings[r][n],rings[r+1][n],rings[r][i],rings[r+1][n],rings[r+1][i]])
	for i in range(1,7): vertices.append_array([rings[0][0],rings[0][i+1],rings[0][i],rings[-1][0],rings[-1][i],rings[-1][i+1]])
	triangles(vertices,mat)

func extrusion(points: Array,width: float,axis: String,offset: float,mat: Material=null,parent: Node3D=null) -> void:
	var contour := PackedVector2Array()
	for p in points: contour.append(Vector2(p[0],p[1]))
	if Geometry2D.is_polygon_clockwise(contour): contour.reverse()
	var indices := Geometry2D.triangulate_polygon(contour); var low: Array=[]; var high: Array=[]; var vertices: Array=[]
	for p in contour:
		low.append(point([-width/2+offset,p.x,p.y]) if axis == "x" else point([p.x,p.y,offset]))
		high.append(point([width/2+offset,p.x,p.y]) if axis == "x" else point([p.x,p.y,offset+width]))
	for i in range(0,indices.size(),3):
		var a:=indices[i]; var b:=indices[i+1]; var c:=indices[i+2]
		vertices.append_array([high[a],high[b],high[c],low[c],low[b],low[a]])
	for i in range(contour.size()):
		var n: int=(i+1)%contour.size(); vertices.append_array([low[i],low[n],high[n],low[i],high[n],high[i]])
	triangles(vertices,mat,parent)

func wing(points: Array,z: float,mat: Material=null,parent: Node3D=null) -> void:
	extrusion(points,0.1,"z",z,mat,parent)
func fin(points: Array,x: float,mat: Material=null) -> void:
	extrusion(points,0.12,"x",x,mat)

func rotor(label: String,x: float,y: float,z: float,radius: float,blades: int) -> Node3D:
	var group := Node3D.new(); group.name=label; group.position=point([x,y,z]); root.add_child(group)
	box(0.38,0.38,0.18,0,0,0,metal,group)
	for i in range(blades):
		var arm:=Node3D.new(); arm.rotation.y=i*TAU/blades; group.add_child(arm)
		wing([[-0.1,0.22],[0.14,0.22],[0.24,radius*0.88],[0.1,radius],[-0.12,radius]],0,dark,arm)
	return group

func intake(x: float,y: float,z: float) -> void:
	var vertices: Array=[]
	for i in range(12):
		for j in range(4):
			var quad: Array=[]
			for pair in [[i,j],[i+1,j],[i+1,j+1],[i,j+1]]:
				var u: float=pair[0]*TAU/12; var v: float=pair[1]*TAU/4
				quad.append(point([x+(0.64+0.09*cos(v))*cos(u),y+1.22-0.09*sin(v),z+(0.64+0.09*cos(v))*sin(u)]))
			vertices.append_array([quad[0],quad[1],quad[3],quad[1],quad[2],quad[3]])
	triangles(vertices,metal)
	vertices=[]
	for i in range(12): vertices.append_array([point([x,y+1.19,z]),point([x+0.6*cos(i*TAU/12),y+1.19,z-0.6*sin(i*TAU/12)]),point([x+0.6*cos((i+1)*TAU/12),y+1.19,z-0.6*sin((i+1)*TAU/12)])])
	triangles(vertices,dark)

func bake(parent: Node3D) -> void:
	var groups: Dictionary={}
	for child in parent.get_children():
		if child is MeshInstance3D:
			var material: Material=child.material_override
			if not groups.has(material): groups[material]=[]
			groups[material].append(child)
		elif child is Node3D and not child.has_meta("shared_vehicle_wheel"): bake(child)
	for mat in groups:
		var st:=SurfaceTool.new(); st.begin(Mesh.PRIMITIVE_TRIANGLES)
		for child in groups[mat]:
			var arrays: Array=child.mesh.surface_get_arrays(0); var positions: PackedVector3Array=arrays[Mesh.ARRAY_VERTEX]; var normals: PackedVector3Array=arrays[Mesh.ARRAY_NORMAL]; var indices: PackedInt32Array=arrays[Mesh.ARRAY_INDEX] if arrays[Mesh.ARRAY_INDEX] != null else PackedInt32Array()
			var colors: PackedColorArray=arrays[Mesh.ARRAY_COLOR] if arrays[Mesh.ARRAY_COLOR] != null else PackedColorArray()
			if indices.is_empty():
				for i in range(positions.size()): indices.append(i)
			for i in range(0,indices.size(),3):
				var normal: Vector3=(child.transform*positions[indices[i+2]]-child.transform*positions[indices[i]]).cross(child.transform*positions[indices[i+1]]-child.transform*positions[indices[i]]).normalized()
				for index in [indices[i],indices[i+1],indices[i+2]]:
					if not colors.is_empty(): st.set_color(colors[index])
					st.set_normal(normal if flat else (child.basis*normals[index]).normalized()); st.add_vertex(child.transform*positions[index])
			parent.remove_child(child); child.free()
		var mesh:=MeshInstance3D.new(); mesh.mesh=st.commit(); mesh.material_override=mat; parent.add_child(mesh)

static func animate(model: Node3D,delta: float,active: bool=true) -> void:
	if not active: return
	var time: float=float(model.get_meta("browser_animation_time",0.0))+delta
	model.set_meta("browser_animation_time",time)
	var main: Node3D=model.find_child("main-rotor",true,false)
	if main != null: main.rotation.y=time*35.0
	var tail: Node3D=model.find_child("tail-rotor",true,false)
	if tail != null:
		var conversion:=Basis(Vector3.RIGHT,-PI/2)
		tail.basis=conversion*Basis(Vector3.RIGHT,time*48.0)*Basis(Vector3.UP,PI/2)*conversion.inverse()
	var propeller: Node3D=model.find_child("propeller",true,false)
	if propeller != null: propeller.rotation.z=time*42.0

func cargo_plane() -> void:
	# C-5 Galaxy: bluff raised cockpit, high swept wing, four podded engines,
	# 28-wheel landing gear and high T-tail.
	hull([[-18.0,0.5,0.7],[-16.8,2.2,2.2],[-13.8,5.2,5.0],[10.5,5.4,5.2],[14.6,4.4,4.3],[17.2,2.3,2.3],[18.1,0.45,0.65]],4.0)
	hull([[10.0,3.8,0.55],[12.2,3.5,1.8],[14.7,2.25,0.7]],6.25,glass)
	# Cockpit panes and characteristic black radome/anti-glare strip.
	box(3.0,1.2,0.12,0,13.4,6.48,glass)
	box(2.5,2.2,0.08,0,14.3,5.65,dark)
	for sign in [-1,1]:
		# High-mounted 25-degree swept wings.
		wing([[sign*2.2,5.4],[sign*17.2,-2.2],[sign*17.0,-4.1],[sign*2.3,-1.0]],6.2)
		box(0.72,1.15,0.04,sign*13.3,-2.15,6.27,mark)
		# Four independently readable turbofan pods and pylons.
		for pair in [[6.2,1.25],[11.0,-0.85]]:
			var ex: float=pair[0]; var ey: float=pair[1]
			box(0.24,1.4,1.35,sign*ex,ey,5.25)
			hull([[ey-2.6,0.45,0.45],[ey-1.9,1.25,1.3],[ey+0.9,1.42,1.42],[ey+1.3,1.15,1.15]],4.35,metal,sign*ex)
			intake(sign*ex,ey,4.35)
			rail([sign*ex,ey-2.45,4.35],[sign*ex,ey-2.8,4.35],0.34,dark)
		# Main bogies: 24 wheels in four six-wheel trucks.
		for bogie_y in [-4.5,-1.0]:
			for axle in [-0.58,0.0,0.58]:
				wheel_mesh(sign*1.72,bogie_y+axle,0.55,0.55,0.42)
			rail([sign*1.72,bogie_y,0.65],[sign*1.72,bogie_y,2.0],0.1,metal)
		# Side cargo-door seams and faction recognition stripe.
		box(0.045,3.2,2.0,sign*2.72,2.2,3.6,metal)
		box(0.06,2.3,0.28,sign*2.76,5.0,3.5,mark)
	# Four-wheel nose gear.
	for x in [-0.42,0.42]:
		for y in [10.45,11.0]: wheel_mesh(x,y,0.43,0.43,0.3)
	rail([0,10.72,0.55],[0,10.72,2.2],0.11,metal)
	# Tall swept fin and stabilizer mounted at the top.
	fin([[-17.2,5.0],[-16.8,11.2],[-14.6,11.0],[-11.2,5.1]],0)
	wing([[-0.12,-14.8],[-6.2,-17.1],[-6.0,-18.0],[0,-16.9],[6.0,-18.0],[6.2,-17.1],[0.12,-14.8]],10.6)
	# Nose and rear drive-through cargo door outlines.
	for y in [-14.9,14.8]:
		box(3.7,0.05,2.7,0,y,3.75,metal)
		for i in range(5): box(3.3,0.065,0.035,0,y+0.03,2.75+i*0.48,dark)

func transport_heli() -> void:
	# UH-60 Black Hawk: faceted stepped cockpit, rectangular cabin, twin-engine
	# doghouse, long tail boom, low stabilator and fixed three-point gear.
	var charcoal:=material("303638",0.92)
	hull([[-4.4,0.55,0.65],[-3.5,2.3,2.0],[1.7,2.45,2.15],[3.0,2.15,1.85],[3.9,1.25,0.8]],2.1,charcoal)
	hull([[1.8,2.15,0.65],[2.8,2.0,1.35],[3.72,1.18,0.55]],2.75,glass)
	# Cockpit frames, chin and nose sensors.
	rail([0,2.05,3.35],[0,3.72,2.88],0.055,dark)
	for s in [-1,1]: rail([s*0.96,2.2,3.2],[s*0.62,3.58,2.63],0.045,dark)
	box(0.55,0.45,0.35,0,3.42,1.65,dark)
	# Twin T700 engine housings and exhausts.
	for s in [-1,1]:
		hull([[-1.8,0.55,0.45],[-1.35,0.78,0.72],[0.7,0.8,0.65],[1.15,0.35,0.3]],3.42,charcoal,s*0.83)
		rail([s*0.83,-1.65,3.4],[s*0.83,-2.18,3.38],0.25,dark)
	# Cabin sliding doors, three side windows, rails and team bars.
	for s in [-1,1]:
		for y in [-2.0,-0.85,0.3]:
			box(0.04,0.82,0.72,s*1.27,y,2.35,glass)
		box(0.055,3.05,0.045,s*1.3,-0.9,1.52,metal)
		box(0.06,0.82,0.22,s*1.33,-2.55,1.85,mark)
	# Tail boom and canted fin/stabilator.
	hull([[-9.2,0.18,0.25],[-4.0,0.62,0.72],[-2.7,0.95,0.9]],2.3,charcoal)
	fin([[-9.2,2.25],[-9.05,4.85],[-8.25,4.55],[-7.4,2.35]],0,charcoal)
	wing([[-2.7,-7.25],[2.7,-7.25],[2.7,-8.0],[-2.7,-8.0]],2.28,charcoal)
	# Fixed Black Hawk gear: widely spaced mains and tail wheel.
	for s in [-1,1]:
		rail([s*1.0,-1.75,1.35],[s*1.58,-1.55,0.48],0.085,metal)
		wheel_mesh(s*1.58,-1.55,0.45,0.45,0.3)
	wheel_mesh(0,-7.35,0.28,0.28,0.22)
	rail([0,-7.35,0.35],[0,-7.35,1.65],0.075,metal)
	rail([0,0,3.65],[0,0,4.25],0.14,metal)
	rotor("main-rotor",0,0,4.28,8.0,4)
	var tail:=rotor("tail-rotor",0.22,-8.75,4.05,1.65,4); tail.rotation.z=-PI/2

func cas_aircraft() -> void:
	# Embraer A-29 Super Tucano: tandem canopy, long turboprop nose, low straight
	# wing with clipped tips, tall fin and compact tricycle undercarriage.
	hull([[-4.7,0.35,0.42],[-3.7,1.05,1.15],[-1.4,1.35,1.45],[1.4,1.25,1.25],[3.45,0.72,0.74],[4.35,0.32,0.34]],1.65)
	hull([[-1.45,1.05,0.42],[-0.65,1.0,1.0],[1.55,0.92,0.78],[2.0,0.48,0.25]],2.45,glass)
	# Canopy bow and anti-glare nose deck.
	for y in [-0.65,0.4,1.42]: rail([-0.53,y,2.55],[0.53,y,2.55],0.025,dark)
	box(0.9,2.25,0.07,0,2.45,2.12,dark)
	# Five-blade propeller and spinner at the nose.
	var prop:=Node3D.new(); prop.name="propeller"; prop.position=point([0,4.48,1.65]); root.add_child(prop)
	var spinner:=SphereMesh.new(); spinner.radius=0.28; spinner.height=0.56; add_mesh(spinner,metal,prop)
	for i in range(5):
		var blade:=Node3D.new(); blade.rotation.z=i*TAU/5.0; prop.add_child(blade)
		box(0.14,0.06,1.55,0,0,0.78,dark,blade)
	# Low aspect wing, hardpoints and restrained faction panels.
	wing([[-0.9,1.15],[-5.75,-0.15],[-5.6,-1.05],[-0.8,-0.55],[0.8,-0.55],[5.6,-1.05],[5.75,-0.15],[0.9,1.15]],1.55)
	for s in [-1,1]:
		box(0.52,0.9,0.04,s*4.65,-0.38,1.62,mark)
		for x in [2.2,3.5]:
			rail([s*x,-0.15,1.45],[s*x,-0.15,0.85],0.045,metal)
			hull([[-0.48,0.12,0.12],[0.38,0.16,0.16],[0.55,0.05,0.05]],0.78,metal,s*x)
	# Tailplanes and dorsal fin.
	fin([[-4.55,1.7],[-4.4,4.15],[-3.42,4.0],[-2.75,1.78]],0)
	wing([[-0.15,-3.55],[-2.35,-4.2],[-2.2,-4.75],[0,-4.35],[2.2,-4.75],[2.35,-4.2],[0.15,-3.55]],2.65)
	# Exhaust stacks and tricycle landing gear using canonical wheel asset.
	for s in [-1,1]: rail([s*0.52,3.22,1.75],[s*0.8,2.82,1.7],0.09,dark)
	for s in [-1,1]:
		rail([s*1.45,-0.7,1.25],[s*1.55,-0.7,0.38],0.065,metal)
		wheel_mesh(s*1.55,-0.7,0.3,0.3,0.2)
	rail([0,3.05,1.2],[0,3.05,0.35],0.055,metal)
	wheel_mesh(0,3.05,0.24,0.24,0.17)
