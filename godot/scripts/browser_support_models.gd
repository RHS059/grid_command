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
		"TRUCK", "FUEL_TRUCK", "TROOP_HEMTT", "MEDICAL_HEMTT", "REPAIR_HEMTT", "FOB_HEMTT":
			# Base HEMTT: cab, chassis, wheels and bare deck. Rear bodies attach below.
			box(root,Vector3(2.45,9.2,.28),Vector3(0,-.25,.95),dark)
			box(root,Vector3(2.6,5.4,.18),Vector3(0,-1.9,1.38),metal)
			shell(root,[[1.1,2.15,2.2,3.05],[1.7,2.65,2.65,3.1],[3.05,2.5,1.85,2.9],[3.2,2.25,1.65,2.86]],body)
			# Windscreen panes lie on the sloped front face (y falls .444 per unit z).
			var screen_normal := Vector3(0,.406,-.914)
			for x in [-.52,.52]:
				cab_pane(root,Vector3(x,4.057,2.554),.9,.86,Vector3(-1,0,0),screen_normal,1)
			box(root,Vector3(2.7,.2,.23),Vector3(0,4.43,1.48),metal)
			box(root,Vector3(1.35,.06,.35),Vector3(0,4.33,1.79),dark)
			for i in range(4):
				box(root,Vector3(1.3,.025,.025),Vector3(0,4.37,1.67+i*.07),metal)
			for sign_value in [-1.0,1.0]:
				for y in [3.1,1.55,-2.5,-4.1]:
					wheel(root,sign_value*1.35,y,.7,.69,dark,metal)
					box(root,Vector3(.5,1.5,.1),Vector3(sign_value*1.15,y,1.43),body)
				cab_pane(root,Vector3(sign_value*1.29,2.95,2.48),1.0,.7,Vector3(0,0,-sign_value),Vector3(sign_value,0,0),0)
				box(root,Vector3(.04,.9,.035),Vector3(sign_value*1.29,2.9,1.84),metal)
				box(root,Vector3(.075,.23,.045),Vector3(sign_value*1.32,2.57,2),dark)
				box(root,Vector3(.38,.62,.1),Vector3(sign_value*1.39,2.58,1.14),metal)
				rod(root,Vector3(sign_value*1.2,3.35,2.7),Vector3(sign_value*1.65,3.5,2.75),.025,metal)
				box(root,Vector3(.09,.27,.4),Vector3(sign_value*1.65,3.5,2.68),glass)
				for x in [sign_value*.95,sign_value*1.17]:
					box(root,Vector3(.17,.045,.18),Vector3(x,4.43,1.83),metal)
				box(root,Vector3(.05,.6,.18),Vector3(sign_value*1.31,2.65,1.72),mark)
				rod(root,Vector3(sign_value*1.05,-.85,1.04),Vector3(sign_value*1.05,.55,1.04),.43,metal,10)
				for y in [-.7,.4]:
					box(root,Vector3(.88,.045,.65),Vector3(sign_value*1.05,y,1.03),dark)
				box(root,Vector3(.08,.65,.55),Vector3(sign_value*1.35,-4.55,.75),dark)
			if role.to_upper() != "TRUCK":
				match role.to_upper():
					"FUEL_TRUCK": fuel_body(root, body, dark, metal)
					"TROOP_HEMTT": troop_body(root, body, dark, metal)
					"MEDICAL_HEMTT": medical_body(root, body, dark, metal)
					"REPAIR_HEMTT": repair_body(root, body, dark, metal)
					"FOB_HEMTT": fob_body(root, body, dark, metal)
				merge_stationary(root)
				set_deployed(root, false)
				return root
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
		# Hand-built ArrayMeshes (the cab shell) use a different vertex format
		# than primitives and are dropped by append_from, so keep them separate.
		if child is MeshInstance3D and child.mesh is PrimitiveMesh:
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

## M978 HEMTT fuel servicing body: elliptical 2,500 gal tank, rear pump and
## hose-reel module, top manholes with a catwalk and rails, ladder, extinguishers.
static func fuel_body(root: Node3D, body: Material, dark: Material, metal: Material) -> void:
	var hazard := material("#a8453a", 0.8)
	var white := material("#c9c6b4", 0.85)
	var red := material("#9b2f2a", 0.6, 0.1)
	ellipse(root, Vector3(0,-1.35,2.4), 3.9, 1.2, .92, body)
	for y in [.25,-1.35,-2.95]:
		ellipse(root, Vector3(0,y,2.4), .09, 1.23, .95, metal)
		box(root,Vector3(2.3,.35,.2),Vector3(0,y,1.55),dark)
	box(root,Vector3(.75,3.5,.05),Vector3(0,-1.35,3.34),dark)
	for y in [-.45,-2.25]:
		rod(root,Vector3(0,y,3.3),Vector3(0,y,3.47),.3,metal,12)
		rod(root,Vector3(0,y,3.47),Vector3(0,y,3.53),.33,dark,12)
	for x in [-.52,.52]:
		rod(root,Vector3(x,.45,3.78),Vector3(x,-3.15,3.78),.025,metal)
		for y in [.45,-.75,-1.95,-3.15]:
			rod(root,Vector3(x,y,3.34),Vector3(x,y,3.78),.025,metal)
	box(root,Vector3(2.5,1.2,1.88),Vector3(0,-4.0,2.41),body)
	box(root,Vector3(2.52,.06,.06),Vector3(0,-4.0,3.36),metal)
	for x in [-.6,.6]:
		box(root,Vector3(1.1,.04,1.6),Vector3(x,-4.61,2.4),metal)
		box(root,Vector3(.12,.05,.05),Vector3(x*.25,-4.64,2.4),dark)
	box(root,Vector3(.03,.05,1.7),Vector3(0,-4.63,2.4),dark)
	for sign_value in [-1.0,1.0]:
		box(root,Vector3(.04,.95,1.5),Vector3(sign_value*1.26,-4.0,2.4),metal)
		for i in range(4):
			box(root,Vector3(.05,.7,.04),Vector3(sign_value*1.28,-4.0,2.85-i*.1),dark)
		box(root,Vector3(.03,.9,.5),Vector3(sign_value*1.21,-1.35,2.45),hazard)
		box(root,Vector3(.035,.55,.08),Vector3(sign_value*1.215,-1.35,2.45),white)
		rod(root,Vector3(sign_value*1.3,.5,1.55),Vector3(sign_value*1.3,.5,2.1),.09,red,10)
		box(root,Vector3(.22,.08,.04),Vector3(sign_value*1.26,.5,1.85),dark)
	box(root,Vector3(.7,.03,.4),Vector3(.6,-4.64,3.0),hazard)
	for x in [-1.05,-.7]:
		rod(root,Vector3(x,-4.68,.95),Vector3(x,-4.68,3.36),.03,metal)
	for i in range(8):
		rod(root,Vector3(-1.05,-4.68,1.1+i*.3),Vector3(-.7,-4.68,1.1+i*.3),.02,metal)
	rod(root,Vector3(.9,-4.66,1.3),Vector3(.9,-4.66,1.75),.06,dark,8)

## Deployable bodies keep "stowed" and "deployed" child nodes.
static func set_deployed(root: Node3D, deployed: bool) -> void:
	for state in ["stowed", "deployed"]:
		var node := root.get_node_or_null(state)
		if node != null: node.visible = (state == "deployed") == deployed

static func state_node(root: Node3D, state: String) -> Node3D:
	var node := Node3D.new()
	node.name = state
	root.add_child(node)
	return node

## Large troop transport: drop-side cargo bed under a canvas cover on bows,
## rear flap rolled up over benches, tailgate and boarding ladder.
static func troop_body(root: Node3D, body: Material, dark: Material, metal: Material) -> void:
	var canvas := material("#66654a", 0.95)
	for s in [-1.0,1.0]:
		box(root,Vector3(.08,5.1,.55),Vector3(s*1.26,-1.95,1.74),body)
		for i in range(6):
			box(root,Vector3(.1,.07,.56),Vector3(s*1.28,.5-i*.98,1.74),metal)
		box(root,Vector3(.03,5.0,.05),Vector3(s*1.295,-1.95,2.12),dark)
		for i in range(5):
			box(root,Vector3(.03,.07,1.25),Vector3(s*1.29,.3-i*1.12,2.66),dark)
	box(root,Vector3(2.52,.08,1.9),Vector3(0,.58,2.42),body)
	box(root,Vector3(2.56,5.0,1.25),Vector3(0,-1.95,2.66),canvas)
	ellipse(root,Vector3(0,-1.95,3.28),5.0,1.28,.38,canvas)
	for i in range(5):
		ellipse(root,Vector3(0,.3-i*1.12,3.28),.07,1.3,.4,dark)
	box(root,Vector3(2.2,.04,1.1),Vector3(0,-4.46,2.62),dark)
	rod(root,Vector3(-1.15,-4.5,3.22),Vector3(1.15,-4.5,3.22),.11,canvas,8)
	for s in [-1.0,1.0]:
		box(root,Vector3(.42,.05,.07),Vector3(s*.78,-4.47,2.1),metal)
		rod(root,Vector3(s*.3,-4.62,.7),Vector3(s*.3,-4.62,1.5),.025,metal)
	box(root,Vector3(2.52,.08,.55),Vector3(0,-4.52,1.74),body)
	for i in range(3):
		rod(root,Vector3(-.3,-4.62,.8+i*.25),Vector3(.3,-4.62,.8+i*.25),.02,metal)

## Medical: shelter with red crosses and roof AC. Deployed: side awning,
## tent walls, two litters and the rear stair.
static func medical_body(root: Node3D, body: Material, dark: Material, metal: Material) -> void:
	var white := material("#c9c6b4", 0.85)
	var red := material("#a8302a", 0.8)
	var canvas := material("#66654a", 0.95)
	box(root,Vector3(2.5,4.7,2.25),Vector3(0,-2.1,2.6),body)
	box(root,Vector3(2.56,4.76,.08),Vector3(0,-2.1,3.73),metal)
	for x in [-1.26,1.26]:
		for y in [.25,-4.45]:
			box(root,Vector3(.08,.08,2.25),Vector3(x,y,2.6),metal)
	for s in [-1.0,1.0]:
		red_cross(root,Vector3(s*1.26,-2.1,2.75),1.1,Vector3(s,0,0),white,red)
	red_cross(root,Vector3(0,-2.1,3.78),1.4,Vector3(0,0,1),white,red)
	red_cross(root,Vector3(.6,-4.47,3.0),.75,Vector3(0,1,0),white,red)
	box(root,Vector3(1.0,.04,1.9),Vector3(-.55,-4.47,2.45),metal)
	box(root,Vector3(.05,.05,.2),Vector3(-.15,-4.5,2.4),dark)
	box(root,Vector3(1.2,.35,.7),Vector3(0,.42,3.2),metal)
	for i in range(4):
		box(root,Vector3(1.0,.03,.04),Vector3(0,.61,2.98+i*.13),dark)
	var deployed := state_node(root,"deployed")
	var awning := box(deployed,Vector3(2.6,4.3,.05),Vector3(2.55,-2.1,3.45),canvas)
	awning.rotate_z(-.18)
	for y in [-.05,-4.15]:
		box(deployed,Vector3(2.5,.03,3.05),Vector3(2.5,y,1.72),canvas)
		rod(deployed,Vector3(3.8,y,0),Vector3(3.8,y,3.2),.03,metal)
	red_cross(deployed,Vector3(2.55,-2.1,3.49),.9,Vector3(0,0,1),white,red)
	for y in [-1.2,-3.0]:
		box(deployed,Vector3(.6,1.9,.06),Vector3(2.5,y,.55),canvas)
		for dy in [-.85,.85]:
			rod(deployed,Vector3(2.5,y+dy,0),Vector3(2.5,y+dy,.55),.02,metal)
	for i in range(3):
		box(deployed,Vector3(.9,.3,.05),Vector3(-.55,-4.75-i*.28,1.2-i*.35),metal)

static func red_cross(parent: Node3D, center: Vector3, size: float, facing: Vector3, white: Material, red: Material) -> void:
	# facing is the browser axis the panel faces (x side, y rear, z roof).
	var thin := Vector3(.03,.03,.03)
	var plate := Vector3(size,size,size) * (Vector3.ONE - facing.abs()) + thin * facing.abs()
	box(parent,plate,center,white)
	var long := size*.72
	var short := size*.22
	var lift := facing*.006
	var axes: Array = [Vector3(1,0,0),Vector3(0,1,0),Vector3(0,0,1)].filter(func(a): return a != facing.abs())
	box(parent,axes[0]*long + axes[1]*short + facing.abs()*.035,center+lift,red)
	box(parent,axes[0]*short + axes[1]*long + facing.abs()*.035,center+lift,red)

## Vehicle repair / recovery (M984 wrecker): crane on a pedestal, side tool
## lockers, rear underlift. Deployed: boom raised with outriggers down.
static func repair_body(root: Node3D, body: Material, dark: Material, metal: Material) -> void:
	var yellow := material("#c9a227", 0.8)
	var amber := material("#e0902a", 0.4)
	for s in [-1.0,1.0]:
		box(root,Vector3(.55,3.3,.85),Vector3(s*.98,-2.6,1.9),body)
		for i in range(3):
			box(root,Vector3(.03,.95,.7),Vector3(s*1.26,-1.5-i*1.1,1.9),metal)
			box(root,Vector3(.04,.2,.05),Vector3(s*1.28,-1.5-i*1.1,2.1),dark)
	rod(root,Vector3(0,-.1,1.47),Vector3(0,-.1,2.15),.45,metal,16)
	box(root,Vector3(1.0,1.0,.5),Vector3(0,-.1,2.35),body)
	rod(root,Vector3(0,-.1,2.6),Vector3(0,-.1,2.8),.07,amber,8)
	box(root,Vector3(.5,1.0,.3),Vector3(0,-5.0,.95),metal)
	box(root,Vector3(1.6,.22,.22),Vector3(0,-5.45,.95),yellow)
	for i in range(6):
		box(root,Vector3(.2,.03,.2),Vector3(-1.1+i*.44,-4.94,1.18),dark if i % 2 == 0 else yellow)
	var stowed := state_node(root,"stowed")
	box(stowed,Vector3(.45,4.3,.45),Vector3(0,-2.35,2.83),body)
	rod(stowed,Vector3(0,-.5,2.45),Vector3(0,-1.6,2.7),.09,metal,8)
	box(stowed,Vector3(.3,.25,.4),Vector3(0,-4.45,2.45),dark)
	var deployed := state_node(root,"deployed")
	var pivot := Node3D.new()
	pivot.name = "boom-pivot"
	pivot.position = point(Vector3(0,-.1,2.6))
	pivot.rotate_x(-.62)
	deployed.add_child(pivot)
	box(pivot,Vector3(.45,4.6,.45),Vector3(0,-2.3,.2),body)
	box(pivot,Vector3(.36,1.6,.36),Vector3(0,-4.9,.2),metal)
	rod(deployed,Vector3(0,-.5,2.45),Vector3(0,-1.35,3.35),.09,metal,8)
	rod(deployed,Vector3(0,-3.7,5.2),Vector3(0,-3.7,2.4),.015,dark,4)
	box(deployed,Vector3(.3,.25,.4),Vector3(0,-3.7,2.3),dark)
	for s in [-1.0,1.0]:
		box(deployed,Vector3(.9,.22,.22),Vector3(s*1.6,-3.9,1.05),yellow)
		box(deployed,Vector3(.2,.2,.9),Vector3(s*2.0,-3.9,.55),metal)
		box(deployed,Vector3(.6,.6,.08),Vector3(s*2.0,-3.9,.04),dark)

## FOB: expandable command shelter with generator, mast and dish. Deployed:
## side expansions out, mast raised with guys, dish open, camo net overhead.
static func fob_body(root: Node3D, body: Material, dark: Material, metal: Material) -> void:
	var net := material("#4b5638", 0.95)
	box(root,Vector3(2.45,4.3,2.25),Vector3(0,-2.35,2.6),body)
	box(root,Vector3(2.5,4.35,.08),Vector3(0,-2.35,3.73),metal)
	for s in [-1.0,1.0]:
		for i in range(5):
			box(root,Vector3(.03,.03,2.2),Vector3(s*1.23,-.4-i*.9,2.6),dark)
	box(root,Vector3(1.0,.04,1.9),Vector3(.5,-4.51,2.45),metal)
	box(root,Vector3(1.9,.5,.8),Vector3(0,.5,1.87),metal)
	for i in range(5):
		box(root,Vector3(.04,.52,.6),Vector3(-.8+i*.4,.5,1.87),dark)
	rod(root,Vector3(.7,.5,2.27),Vector3(.7,.5,2.7),.05,dark,6)
	rod(root,Vector3(-.9,-4.2,3.73),Vector3(-.9,-4.2,4.7),.08,metal,8)
	var stowed := state_node(root,"stowed")
	ellipse(stowed,Vector3(.5,-3.3,3.82),.12,.45,.45,metal)
	var deployed := state_node(root,"deployed")
	for s in [-1.0,1.0]:
		box(deployed,Vector3(1.5,3.9,2.05),Vector3(s*1.97,-2.35,2.55),body)
		box(deployed,Vector3(1.55,3.95,.06),Vector3(s*1.97,-2.35,3.6),metal)
		for y in [-.5,-4.2]:
			rod(deployed,Vector3(s*2.62,y,0),Vector3(s*2.62,y,1.52),.04,metal)
		box(deployed,Vector3(.03,.8,.5),Vector3(s*2.73,-1.6,2.8),dark)
	rod(deployed,Vector3(-.9,-4.2,4.7),Vector3(-.9,-4.2,10.5),.05,metal,8)
	for a in [Vector3(-3.5,-1.0,0),Vector3(2.5,-1.0,0),Vector3(-.9,-7.5,0)]:
		rod(deployed,Vector3(-.9,-4.2,9.5),a,.012,dark,4)
	box(deployed,Vector3(.8,.05,.05),Vector3(-.9,-4.2,10.3),metal)
	var dish := MeshInstance3D.new()
	var dish_mesh := CylinderMesh.new()
	dish_mesh.top_radius = .55
	dish_mesh.bottom_radius = .2
	dish_mesh.height = .18
	dish_mesh.radial_segments = 16
	dish.mesh = dish_mesh
	dish.material_override = metal
	dish.position = point(Vector3(.5,-3.3,4.25))
	dish.rotate_x(.7)
	deployed.add_child(dish)
	rod(deployed,Vector3(.5,-3.3,3.77),Vector3(.5,-3.3,4.15),.05,metal,6)
	box(deployed,Vector3(7.5,6.0,.04),Vector3(0,-2.35,4.35),net)
	for x in [-3.6,3.6]:
		for y in [.5,-5.2]:
			rod(deployed,Vector3(x,y,0),Vector3(x,y,4.33),.03,metal)

static var cab_glass: Dictionary = {}

## Interior-mapped cab window. center is browser space; axes are native.
static func cab_pane(parent: Node3D, center: Vector3, width: float, height: float, right: Vector3, normal: Vector3, kind: int) -> void:
	var key := "%d:%.2f" % [kind, width/height]
	if not cab_glass.has(key):
		var mat := ShaderMaterial.new()
		mat.shader = preload("res://shaders/cab_interior.gdshader")
		mat.set_shader_parameter("aspect", width/height)
		mat.set_shader_parameter("kind", kind)
		mat.set_shader_parameter("depth", 1.6 if kind == 1 else 2.6)
		cab_glass[key] = mat
	var mesh := QuadMesh.new()
	mesh.size = Vector2(width, height)
	var node := MeshInstance3D.new()
	node.mesh = mesh
	node.material_override = cab_glass[key]
	node.transform = Transform3D(Basis(right, normal.cross(right), normal), point(center))
	parent.add_child(node)

static func ellipse(parent: Node3D, center: Vector3, length: float, rx: float, rz: float, mat: Material) -> void:
	var mesh := CylinderMesh.new()
	mesh.top_radius = 1.0
	mesh.bottom_radius = 1.0
	mesh.height = 1.0
	mesh.radial_segments = 20
	mesh.rings = 1
	var node := MeshInstance3D.new()
	node.mesh = mesh
	node.material_override = mat
	node.transform = Transform3D(Basis(Vector3.RIGHT, PI/2.0) * Basis.from_scale(Vector3(rx,length,rz)), point(center))
	parent.add_child(node)

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
	# Military off-road tire: carcass, sidewall bulge, directional chevron tread,
	# recessed rim, hub with lug nuts and a CTIS cap on the outboard face.
	var out := signf(x) if x != 0.0 else 1.0
	var width := .34
	rod(parent,Vector3(x-width*.5,y,z),Vector3(x+width*.5,y,z),radius*.93,dark,24)
	rod(parent,Vector3(x-width*.38,y,z),Vector3(x+width*.38,y,z),radius*.97,dark,24)
	var blocks := 22
	for i in range(blocks):
		for lane in [-1.0,1.0]:
			var a := TAU*(float(i)+(.5 if lane > 0.0 else 0.0))/float(blocks)
			var block := box(parent,Vector3(width*.44,.15,.07),Vector3(x+lane*width*.24,y+sin(a)*radius*.97,z+cos(a)*radius*.97),dark)
			block.rotate_x(-a)
			block.rotate_object_local(Vector3.UP,lane*.35)
	var face := x+out*width*.5
	rod(parent,Vector3(face-out*.02,y,z),Vector3(face+out*.01,y,z),radius*.6,metal,16)
	rod(parent,Vector3(face,y,z),Vector3(face+out*.02,y,z),radius*.5,dark,16)
	rod(parent,Vector3(face,y,z),Vector3(face+out*.06,y,z),radius*.24,metal,12)
	for i in range(8):
		var a := TAU*float(i)/8.0
		rod(parent,Vector3(face,y+sin(a)*radius*.33,z+cos(a)*radius*.33),Vector3(face+out*.05,y+sin(a)*radius*.33,z+cos(a)*radius*.33),.025,metal,6)
	rod(parent,Vector3(face+out*.06,y,z),Vector3(face+out*.1,y,z),radius*.09,dark,8)

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
