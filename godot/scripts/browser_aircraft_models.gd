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

static func create(role: String, team: int = 0) -> Node3D:
	var builder := BrowserAircraftModels.new()
	builder.root = Node3D.new(); builder.root.name = role
	builder.body = builder.material("777868" if role == "TRANSPORT_HELI" else "b1b7b4",0.88,0.08)
	builder.dark = builder.material("272e30",0.9)
	builder.glass = builder.material("344b59",0.3,0.2)
	builder.metal = builder.material("555f60",0.8)
	builder.mark = builder.material("54b7ff" if team == 0 else "ee777b",0.85)
	if role == "CARGO_PLANE": builder.cargo_plane()
	elif role == "TRANSPORT_HELI": builder.transport_heli()
	builder.bake(builder.root)
	return builder.root

func material(color: String, roughness: float = 0.85, metallic: float = 0.0) -> StandardMaterial3D:
	var m := StandardMaterial3D.new(); m.albedo_color = Color(color); m.roughness = roughness; m.metallic = metallic; return m

func point(v: Array) -> Vector3:
	return Vector3(v[0],v[2],-v[1])

func add_mesh(mesh: Mesh, mat: Material = null, parent: Node3D = null, transform: Transform3D = Transform3D.IDENTITY) -> MeshInstance3D:
	var object := MeshInstance3D.new(); object.mesh = mesh; object.material_override = body if mat == null else mat; object.transform = transform
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
	var mesh := CylinderMesh.new(); mesh.top_radius=r; mesh.bottom_radius=r; mesh.height=width; mesh.radial_segments=12; mesh.rings=1
	add_mesh(mesh,dark if mat == null else mat,null,Transform3D(Basis(Vector3.FORWARD,PI/2),point([x,y,z])))

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
		elif child is Node3D: bake(child)
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

func cargo_plane() -> void:
	hull([[-14,0.6,0.8],[-11,2.6,2.8],[-7,4.6,4.6],[7,4.8,4.8],[10,4.2,4.2],[12.3,2.8,2.8],[13.6,0.8,1.2]],3.65)
	hull([[8.7,3.1,0.6],[10,2.9,1.6],[11.5,1.8,0.75]],5.05,glass)
	rail([0,9.5,5.83],[0,11.45,5.32],0.065)
	for sign in [-1,1]:
		rail([sign*1.15,9.6,5.65],[sign*0.7,11.3,5.3],0.055)
		wing([[sign*1.8,4.1],[sign*14,-1.9],[sign*14,-3.4],[sign*2,-0.7]],5.55)
		wing([[sign*1.7,3.8],[sign*6.1,1.4],[sign*5.8,-0.8],[sign*1.7,-1]],5.38)
		rail([sign*6.6,-1.25,5.67],[sign*13.2,-3.12,5.67],0.02,metal)
		box(0.65,0.85,0.025,sign*11,-1.85,5.68,mark)
		for pair in [[5,1.7],[9.2,-0.25]]:
			var x: float=pair[0]; var y: float=pair[1]
			box(0.2,1.5,1.1,sign*x,y,4.9)
			hull([[y-2.7,0.65,0.65],[y-1.8,1.18,1.22],[y+0.9,1.5,1.5],[y+1.2,1.4,1.4]],3.95,body,sign*x)
			intake(sign*x,y,3.95)
			rail([sign*x,y+0.98,3.95],[sign*x,y+1.23,3.95],0.15,metal)
			for i in range(8):
				var a:=i*PI/4; rail([sign*x+cos(a)*0.2,y+1.205,3.95+sin(a)*0.2],[sign*x+cos(a+0.2)*0.51,y+1.205,3.95+sin(a+0.2)*0.51],0.025,metal)
			rail([sign*x,y-2.5,3.95],[sign*x,y-2.85,3.95],0.32,dark)
		hull([[-5.8,0.45,0.4],[-4.6,1.1,1],[1,1.1,1],[2,0.3,0.3]],1.8,body,sign*2.2)
		for y in [-4.6,-3.8,-1.2,-0.4]:
			for x in [1.88,2.42]: wheel_mesh(sign*x,y,0.46,0.46,0.23)
			rail([sign*2.15,y,0.6],[sign*2.15,y,1.75],0.09,metal)
		box(0.035,0.6,0.85,sign*2.28,6.7,3.7,metal); box(0.045,0.1,0.1,sign*2.31,6.9,3.7,dark)
		box(0.045,1.2,0.23,sign*2.4,3.3,3.2,mark)
	fin([[-13.4,4],[-13.3,9.5],[-11.8,9.6],[-9.2,4.6]],0)
	wing([[-0.12,-10.9],[-5.7,-13.1],[-5.5,-14.1],[0,-13.3],[5.5,-14.1],[5.7,-13.1],[0.12,-10.9]],9.45)
	for x in [-0.32,0.32]: wheel_mesh(x,9.2,0.38,0.38,0.24)
	rail([0,9.2,0.5],[0,9.2,1.9],0.1,metal)
	var ramp:=Node3D.new(); ramp.name="cargo-ramp"; ramp.position=point([0,-11.12,1.1]); root.add_child(ramp)
	box(2.5,0.14,2.5,0,0,1.25,metal,ramp); box(2.22,0.035,2.23,0,-0.09,1.25,dark,ramp)
	for i in range(7): box(2.1,0.04,0.045,0,-0.12,0.3+i*0.31,metal,ramp)

func transport_heli() -> void:
	hull([[-4,0.45,0.7],[-2.7,2.3,2.15],[1.8,2.5,2.25],[3.5,1.7,1.5],[4.05,0.9,0.6]],2.05)
	hull([[2.1,2.1,0.75],[3,1.85,1.2],[3.73,1.15,0.5]],2.65,glass)
	rail([0,2.15,3.1],[0,3.7,2.8],0.055); rail([-0.95,2.3,3.05],[-0.65,3.65,2.5],0.05); rail([0.95,2.3,3.05],[0.65,3.65,2.5],0.05)
	hull([[-9,0.17,0.28],[-4,0.5,0.7],[-2.5,0.85,0.85]],2.2)
	fin([[-9,2.1],[-9.1,4.8],[-8.5,4.6],[-7.6,2.3]],0)
	wing([[-2,-7.4],[2,-7.4],[2,-8],[-2,-8]],2.25)
	for s in [-1,1]:
		hull([[-2,0.45,0.5],[-1.5,0.8,0.7],[0.8,0.85,0.7],[1.2,0.45,0.4]],3.3,body,s*0.88)
		for y in [-1.7,-0.55,0.6]:
			box(0.025,0.7,0.7,s*1.255,y,2.35,glass); box(0.055,0.82,0.045,s*1.28,y,1.55,metal)
		rail([s*1.28,-2.1,1.45],[s*1.28,-2.1,2.95],0.03); box(0.055,0.23,0.045,s*1.3,-0.15,1.9,dark)
		wing([[s*0.9,0.4],[s*2.9,0],[s*2.8,-0.7],[s*0.9,-0.8]],2.3)
		hull([[-2.1,0.1,0.1],[-1.7,0.7,0.65],[1,0.7,0.65],[1.5,0.1,0.1]],1.4,body,s*2.45)
		rail([s*1.05,0.1,1.5],[s*1.5,0.25,0.45],0.09); wheel(s*1.5,0.25,0.4); box(0.055,0.5,0.22,s*1.26,-1.7,1.85,mark)
	wheel(0,-7.3,0.23); rail([0,0,3.3],[0,0,4.2],0.13); rotor("main-rotor",0,0,4.25,7.1,4)
	var tail:=rotor("tail-rotor",0.2,-8.8,4.2,1,4); tail.rotation.z=-PI/2
