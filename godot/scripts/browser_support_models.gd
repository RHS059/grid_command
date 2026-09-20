extends RefCounted
class_name BrowserSupportModels
## Direct native translation of lib/game/support-models.ts and container-model.ts.
## Browser dimensions are preserved; browser (x,y,z) maps to native (x,z,-y).

static func create(role: String, team: int = 0) -> Node3D:
	var root := Node3D.new()
	root.name = role.to_lower()
	var body := material("#73765a", 0.9)
	var dark := material("#262c29", 0.9)
	var metal := material("#565f51", 0.8, 0.15)
	var glass := material("#293e4c", 0.15, 0.6)
	var mark := material("#ee777b" if team == 1 else "#54b7ff", 0.85)
	match role.to_upper():
		"FORKLIFT":
			box(root, Vector3(1.7,2.4,.65), Vector3(0,-.1,.7), body)
			box(root, Vector3(1.7,.8,1), Vector3(0,-.95,1.15), body)
			box(root, Vector3(.65,.65,.2), Vector3(0,0,1.15), dark)
			box(root, Vector3(.65,.2,.65), Vector3(0,-.3,1.45), dark)
			for x in [-.78,.78]:
				for y in [-.7,.75]:
					wheel(root,x,y,.4,.38,dark,metal)
					box(root,Vector3(.09,.09,1.65),Vector3(x,y,1.75),metal)
				box(root,Vector3(.1,.16,3.2),Vector3(x,1.3,1.8),dark)
			box(root,Vector3(1.8,1.9,.12),Vector3(0,0,2.65),metal)
			var forks := Node3D.new()
			forks.name = "fork-carriage"
			root.add_child(forks)
			box(forks,Vector3(1.6,.12,.8),Vector3(0,1.45,.8),metal)
			for x in [-.5,.5]:
				box(forks,Vector3(.18,1.65,.08),Vector3(x,2.1,.35),metal)
			var pallet := Node3D.new()
			pallet.name = "pallet"
			forks.add_child(pallet)
			box(pallet,Vector3(1.5,1.25,.18),Vector3(0,2,.5),metal)
			box(pallet,Vector3(1.25,1.1,.8),Vector3(0,2,1),body)
			box(pallet,Vector3(.07,1.15,.85),Vector3(0,2,1),dark)
			box(pallet,Vector3(1.25,.04,.24),Vector3(0,2.56,1),mark)
			box(root,Vector3(1,.03,.25),Vector3(0,-1.36,1.2),mark)
		"TRUCK":
			box(root,Vector3(2.45,9.2,.28),Vector3(0,-.25,.95),dark)
			box(root,Vector3(2.6,5.4,.18),Vector3(0,-1.9,1.38),metal)
			shell(root,[[1.1,2.15,2.2,3.05],[1.7,2.65,2.65,3.1],[3.05,2.5,1.85,2.9],[3.2,2.25,1.65,2.86]],body)
			for x in [-.62,.62]:
				box(root,Vector3(1.08,.035,.98),Vector3(x,3.96,2.49),glass).rotate_x(.31)
			box(root,Vector3(2.7,.2,.23),Vector3(0,4.43,1.48),metal)
			box(root,Vector3(1.35,.06,.35),Vector3(0,4.33,1.79),dark)
			for i in range(4):
				box(root,Vector3(1.3,.025,.025),Vector3(0,4.37,1.67+i*.07),metal)
			for sign_value in [-1.0,1.0]:
				for y in [3.1,1.55,-2.5,-4.1]:
					wheel(root,sign_value*1.35,y,.7,.69,dark,metal)
					box(root,Vector3(.5,1.5,.1),Vector3(sign_value*1.15,y,1.43),body)
				box(root,Vector3(.025,1,.7),Vector3(sign_value*1.28,2.95,2.48),glass)
				box(root,Vector3(.04,.9,.035),Vector3(sign_value*1.29,2.9,1.84),metal)
				box(root,Vector3(.075,.23,.045),Vector3(sign_value*1.32,2.57,2),dark)
				box(root,Vector3(.38,.62,.1),Vector3(sign_value*1.39,2.58,1.14),metal)
				rod(root,Vector3(sign_value*1.2,3.35,2.7),Vector3(sign_value*1.65,3.5,2.75),.025,metal)
				box(root,Vector3(.09,.27,.4),Vector3(sign_value*1.65,3.5,2.68),glass)
				for x in [sign_value*.95,sign_value*1.17]:
					box(root,Vector3(.17,.045,.18),Vector3(x,4.43,1.83),metal)
				box(root,Vector3(.055,.75,.2),Vector3(sign_value*1.33,1.02,1.83),mark)
				rod(root,Vector3(sign_value*1.05,-.85,1.04),Vector3(sign_value*1.05,.55,1.04),.43,metal,10)
				for y in [-.7,.4]:
					box(root,Vector3(.88,.045,.65),Vector3(sign_value*1.05,y,1.03),dark)
				box(root,Vector3(.08,.65,.55),Vector3(sign_value*1.35,-4.55,.75),dark)
			var cargo := container()
			cargo.name = "truck-container-0"
			cargo.position = point(Vector3(0,-1.9,2.7))
			root.add_child(cargo)
			box(root,Vector3(2.65,.17,.2),Vector3(0,-4.83,1.18),metal)
			rod(root,Vector3(-.15,1.15,2.05),Vector3(.15,1.15,2.05),.64,dark,12)
			for i in range(2):
				var trailer := Node3D.new()
				trailer.name = "cargo-trailer-%d" % (i+1)
				trailer.position = point(Vector3(0,-7-i*6.2,0))
				trailer.visible = false
				root.add_child(trailer)
				box(trailer,Vector3(.2,2,.2),Vector3(0,3,.6),metal)
				box(trailer,Vector3(2.5,4.8,.3),Vector3(0,0,.8),dark)
				var load_model := container()
				load_model.name = "truck-container-%d" % (i+1)
				load_model.position.y = 2.2
				trailer.add_child(load_model)
				for x in [-1.3,1.3]:
					for y in [-1.3,1.3]:
						rod(trailer,Vector3(x-.15,y,.5),Vector3(x+.15,y,.5),.5,dark,16)
		"UAV_JAMMER":
			box(root,Vector3(2,1.6,.2),Vector3(0,0,.15),metal)
			box(root,Vector3(1.35,1.2,1.4),Vector3(0,0,.95),body)
			box(root,Vector3(.8,.04,.4),Vector3(0,.62,1.2),dark)
			box(root,Vector3(.55,.045,.1),Vector3(0,.65,1.2),mark)
			for i in range(6):
				box(root,Vector3(.85,.04,.04),Vector3(0,-.62,.55+i*.12),dark)
			box(root,Vector3(.13,.13,5),Vector3(0,0,3.8),metal)
			for x in [-.7,.7]:
				box(root,Vector3(.08,.08,2),Vector3(x,0,5.1),dark)
				box(root,Vector3(1.5,.09,.08),Vector3(0,0,4.6),metal)
			box(root,Vector3(.65,.7,.6),Vector3(1.15,0,.45),dark)
			box(root,Vector3(.35,.05,.13),Vector3(1.15,.36,.5),mark)
	merge_stationary(root)
	return root

static func merge_stationary(parent: Node3D) -> void:
	# Same material batching as the browser. Keep cargo, forks and trailers as nodes.
	var batches: Dictionary = {}
	for child in parent.get_children():
		if child is MeshInstance3D:
			var mat: Material = child.material_override
			if not batches.has(mat):
				batches[mat] = []
			batches[mat].append(child)
		elif child is Node3D:
			merge_stationary(child)
	for mat in batches:
		var surface := SurfaceTool.new()
		surface.begin(Mesh.PRIMITIVE_TRIANGLES)
		for child in batches[mat]:
			surface.append_from(child.mesh,0,child.transform)
			parent.remove_child(child)
			child.free()
		var merged := MeshInstance3D.new()
		merged.mesh = surface.commit()
		merged.material_override = mat
		parent.add_child(merged)

static func point(p: Vector3) -> Vector3:
	return Vector3(p.x,p.z,-p.y)

static func material(color: String, roughness: float, metallic: float = .05) -> StandardMaterial3D:
	var result := StandardMaterial3D.new()
	result.albedo_color = Color(color)
	result.roughness = roughness
	result.metallic = metallic
	# The hand-built cab shell has thin, open joins around the windscreen.
	# Render both sides so those joins cannot make the whole cabin disappear
	# when viewed from the opposite winding after the browser-axis conversion.
	result.cull_mode = BaseMaterial3D.CULL_DISABLED
	return result

static func box(parent: Node3D, size: Vector3, position: Vector3, mat: Material) -> MeshInstance3D:
	var mesh := BoxMesh.new()
	mesh.size = Vector3(size.x,size.z,size.y)
	var node := MeshInstance3D.new()
	node.mesh = mesh
	node.material_override = mat
	node.position = point(position)
	parent.add_child(node)
	return node

static func rod(parent: Node3D, a: Vector3, b: Vector3, radius: float, mat: Material, sides: int = 6) -> void:
	var mesh := CylinderMesh.new()
	mesh.top_radius = radius
	mesh.bottom_radius = radius
	mesh.height = a.distance_to(b)
	mesh.radial_segments = sides
	var node := MeshInstance3D.new()
	node.mesh = mesh
	node.material_override = mat
	node.position = point((a+b)*.5)
	node.quaternion = Quaternion(Vector3.UP,point(b-a).normalized())
	parent.add_child(node)

static func wheel(parent: Node3D, x: float, y: float, z: float, radius: float, dark: Material, metal: Material) -> void:
	rod(parent,Vector3(x-.15,y,z),Vector3(x+.15,y,z),radius,dark,16)
	box(parent,Vector3(.05,.3,.3),Vector3(x*1.02,y,z),metal)

static func container() -> Node3D:
	var root := Node3D.new()
	var mat := material("#73765a",.9,.12)
	box(root,Vector3(2.5,5.15,2.45),Vector3.ZERO,mat)
	for sign_value in [-1.0,1.0]:
		for i in range(24):
			box(root,Vector3(.05,.055,2.3),Vector3(sign_value*1.275,-2.47+i*.215,0),mat)
	for i in range(24):
		box(root,Vector3(2.45,.055,.035),Vector3(0,-2.47+i*.215,1.245),mat)
	for x in [-1.24,1.24]:
		for y in [-2.6,2.6]:
			box(root,Vector3(.1,.1,2.5),Vector3(x,y,0),mat)
	for x in [-.63,.63]:
		box(root,Vector3(1.2,.045,2.3),Vector3(x,-2.6,0),mat)
		box(root,Vector3(.035,.065,2.05),Vector3(x,-2.65,0),mat)
		box(root,Vector3(.23,.07,.045),Vector3(x,-2.67,-.4),mat)
	return root

static func shell(parent: Node3D, rings: Array, mat: Material) -> void:
	var sections: Array = []
	for ring in rings:
		var x: float = ring[1]/2.0
		var y: float = ring[2]/2.0
		var section: Array[Vector3] = []
		for p in [Vector2(-x*.8,-y),Vector2(x*.8,-y),Vector2(x,-y*.8),Vector2(x,y*.8),Vector2(x*.8,y),Vector2(-x*.8,y),Vector2(-x,y*.8),Vector2(-x,-y*.8)]:
			section.append(point(Vector3(p.x,p.y+ring[3],ring[0])))
		sections.append(section)
	var surface := SurfaceTool.new()
	surface.begin(Mesh.PRIMITIVE_TRIANGLES)
	surface.set_smooth_group(-1)
	for r in range(sections.size()-1):
		for i in range(8):
			var n := (i+1)%8
			triangle(surface,sections[r][i],sections[r][n],sections[r+1][n])
			triangle(surface,sections[r][i],sections[r+1][n],sections[r+1][i])
	for i in range(1,7):
		triangle(surface,sections[0][0],sections[0][i+1],sections[0][i])
		triangle(surface,sections[-1][0],sections[-1][i],sections[-1][i+1])
	surface.generate_normals()
	var node := MeshInstance3D.new()
	node.mesh = surface.commit()
	node.material_override = mat
	parent.add_child(node)

static func triangle(surface: SurfaceTool, a: Vector3, b: Vector3, c: Vector3) -> void:
	# Godot uses clockwise front faces; browser source uses counterclockwise.
	surface.add_vertex(c)
	surface.add_vertex(b)
	surface.add_vertex(a)
