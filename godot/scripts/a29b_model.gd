extends RefCounted
## A-29B Super Tucano (two-seat): procedural airframe in the 2004 vehicle style.
## Real-scale proportions: 11.38 m long, 11.14 m span, 3.97 m tall, PT6A turboprop
## with a five-blade propeller, tandem canopy, low wing with dihedral, twin wing
## .50 guns, five hardpoints, ventral strakes and a large swept fin.
## Coordinates follow browser_support_models: x right, y forward, z up.
## Painted surfaces use the HEMTT grey atlas and team ramps (ps2_surface);
## lofted shells carry UV2 panel coordinates for seam burn and edge dodge.

const S := preload("res://scripts/browser_support_models.gd")
const BODY := ["#a58d68", "#4b6046"]
const MARK := ["#54b7ff", "#ee777b"]
const DIHEDRAL := 0.105  # tan(6 deg)

static func create(team: int = 0) -> Node3D:
	team = 1 if team == 1 else 0
	S.palette_team = team
	var root := Node3D.new()
	root.name = "a29b"
	var body := S.material(BODY[team], 0.9)
	var dark := S.material("#262c29", 0.9)
	var metal := S.material("#565f51", 0.8, 0.15)
	var mark := S.material(MARK[team], 0.85)
	var ordnance := S.material("#4d5a3a", 0.85)
	var yellow := S.material("#c9a227", 0.8)
	var glass := StandardMaterial3D.new()
	glass.albedo_color = Color(0.16, 0.22, 0.27, 0.62)
	glass.transparency = BaseMaterial3D.TRANSPARENCY_ALPHA
	glass.cull_mode = BaseMaterial3D.CULL_DISABLED
	glass.roughness = 0.08
	glass.metallic_specular = 0.7

	fuselage(root, body, dark)
	cockpit(root, body, dark, metal, glass)
	for s in [-1.0, 1.0]:
		wing(root, s, body, dark, metal, mark, ordnance, yellow)
	tail(root, body, dark, mark)
	gear(root, dark, metal)
	propeller(root, dark, metal)
	S.merge_stationary(root)
	return root

## Spins the propeller in previews.
static func animate(model: Node3D, delta: float) -> void:
	var prop := model.get_node_or_null("propeller")
	if prop != null: prop.rotate_object_local(Vector3(0, 0, 1), delta * 30.0)

static func fuselage(root: Node3D, body: Material, dark: Material) -> void:
	# [y, half width, half height, centre z]: cowling, tandem cockpit, tapering tail cone.
	var stations := [[5.22,.31,.34,1.45],[4.95,.39,.43,1.45],[4.4,.46,.53,1.46],[3.6,.52,.60,1.49],[2.8,.54,.61,1.51],[1.8,.55,.61,1.52],[0.8,.54,.60,1.52],[-0.2,.50,.57,1.52],[-1.4,.42,.49,1.55],[-2.8,.32,.39,1.60],[-4.2,.22,.29,1.66],[-5.2,.14,.20,1.70],[-5.72,.06,.10,1.72]]
	var rings := []
	for st in stations: rings.append(super_ring(st[0], st[1], st[2], st[3], 24, 2.4))
	loft(root, rings, body, true, true, [0.0,.4,.7,1.0,1.3,1.6,1.8,2.0,2.4,2.7,3.0,3.5,3.9])
	# Chin intake under the spinner, twin exhaust stacks each side of the cowling.
	S.box(root, Vector3(.62,.95,.3), Vector3(0,4.55,1.0), body)
	S.box(root, Vector3(.46,.05,.2), Vector3(0,5.03,.99), dark)
	for s in [-1.0, 1.0]:
		S.rod(root, Vector3(s*.44,4.02,1.56), Vector3(s*.66,3.62,1.47), .085, dark, 10)
		S.rod(root, Vector3(s*.44,4.02,1.33), Vector3(s*.64,3.66,1.26), .075, dark, 10)
	# Dorsal and ventral antennas, ventral 20 mm pod fairing stays clean.
	S.box(root, Vector3(.03,.35,.28), Vector3(0,-1.3,2.15), dark)
	S.box(root, Vector3(.03,.28,.2), Vector3(0,-2.4,1.03), dark)

static func cockpit(root: Node3D, body: Material, dark: Material, metal: Material, glass: Material) -> void:
	# Tandem bubble: windscreen, front (pilot) and rear (WSO/instructor) cockpits.
	var arches := [[3.45,.30,1.98,.2],[3.05,.38,1.98,.46],[2.5,.41,1.98,.6],[1.8,.42,1.98,.63],[1.1,.41,1.98,.62],[0.5,.38,1.98,.54],[0.05,.33,1.98,.38]]
	var rings := []
	for a in arches: rings.append(arch(a[0], a[1], a[2], a[3], 16))
	loft(root, rings, glass, false, false)
	# Dorsal spine fairs the canopy into the rear fuselage.
	var spine := []
	for a in [[0.05,.33,1.98,.38],[-0.6,.28,1.98,.22],[-1.3,.2,1.98,.1],[-1.9,.1,1.98,.02]]: spine.append(arch(a[0], a[1], a[2], a[3], 12))
	loft(root, spine, body, false, false, [0.0,.3,.6,.9])
	for y in [3.45, 3.02, 1.8, 0.05]:
		var frame: PackedVector3Array = arch(y, arches_width(arches, y) + .015, 1.98, arches_height(arches, y) + .015, 12)
		for i in range(frame.size() - 1):
			S.rod(root, frame[i], frame[i+1], .03 if y != 1.8 else .022, dark)
	for s in [-1.0, 1.0]:
		S.rod(root, Vector3(s*.3,3.45,1.99), Vector3(s*.42,1.8,1.99), .03, dark)
		S.rod(root, Vector3(s*.42,1.8,1.99), Vector3(s*.33,0.05,1.99), .03, dark)
	# Ejection seats, headrests and instrument coamings seen through the glass.
	for y in [2.35, 1.05]:
		S.box(root, Vector3(.46,.18,.55), Vector3(0,y-.28,1.98), dark)
		S.box(root, Vector3(.34,.14,.2), Vector3(0,y-.3,2.33), dark)
		S.box(root, Vector3(.5,.4,.14), Vector3(0,y+.55,2.12), dark)
		S.box(root, Vector3(.3,.05,.12), Vector3(0,y+.72,2.22), metal)

static func arches_width(arches: Array, y: float) -> float:
	for a in arches: if absf(a[0]-y) < .05: return a[1]
	return .38
static func arches_height(arches: Array, y: float) -> float:
	for a in arches: if absf(a[0]-y) < .05: return a[3]
	return .45

static func wing(root: Node3D, s: float, body: Material, dark: Material, metal: Material, mark: Material, ordnance: Material, yellow: Material) -> void:
	# Low straight wing, slight leading-edge sweep, 6 degree dihedral from the root.
	var rings := []
	for st in [[.3,1.38,2.45,.13],[1.6,1.25,2.15,.13],[3.6,.98,1.65,.12],[5.5,.62,1.12,.11]]:
		var x: float = st[0]
		rings.append(airfoil(Vector3(s*x, st[1], wing_z(x)), st[2], st[3], false, 18))
	loft(root, rings, body, true, true, [0.0,.3,.6,1.0])
	var tip := Vector3(s*5.55, .1, wing_z(5.55))
	S.box(root, Vector3(.06,.22,.06), tip + Vector3(s*.02,.2,0), S.material("#3f8a4a" if s > 0 else "#a8302a", 0.5))
	# Wing guns (FN M3P .50) muzzles, team roundels, pylons and a mixed load.
	S.rod(root, Vector3(s*1.9,1.55,wing_z(1.9)), Vector3(s*1.9,1.05,wing_z(1.9)), .035, dark, 8)
	S.rod(root, Vector3(s*4.3,.45,wing_z(4.3)+.095), Vector3(s*4.3,.45,wing_z(4.3)+.105), .32, mark, 16)
	if s < 0: S.rod(root, Vector3(s*4.9,1.0,wing_z(4.9)-.02), Vector3(s*4.9,1.6,wing_z(4.9)-.02), .02, metal)
	for x in [2.3, 3.5]:
		var z := wing_z(x) - .2
		S.box(root, Vector3(.08,.8,.2), Vector3(s*x,.1,z), metal)
		if x < 3.0:
			# Mk 82 bomb: olive body, yellow band, nose fuze and cruciform fins.
			S.rod(root, Vector3(s*x,1.05,z-.3), Vector3(s*x,-.9,z-.3), .14, ordnance, 12)
			S.rod(root, Vector3(s*x,1.35,z-.3), Vector3(s*x,1.05,z-.3), .07, ordnance, 10)
			S.rod(root, Vector3(s*x,.85,z-.3), Vector3(s*x,.72,z-.3), .145, yellow, 12)
			for f in [Vector3(.3,.02,.02), Vector3(.02,.02,.3)]:
				S.box(root, Vector3(f.x,.3,f.z) + Vector3(0,0,0), Vector3(s*x,-.95,z-.3), dark)
		else:
			# LAU-68 style seven-tube rocket pod.
			S.rod(root, Vector3(s*x,.95,z-.28), Vector3(s*x,-.75,z-.28), .15, metal, 12)
			S.rod(root, Vector3(s*x,.97,z-.28), Vector3(s*x,.95,z-.28), .12, dark, 12)

static func wing_z(x: float) -> float:
	return 1.02 + maxf(0.0, absf(x) - .3) * DIHEDRAL

static func tail(root: Node3D, body: Material, dark: Material, mark: Material) -> void:
	for s in [-1.0, 1.0]:
		var rings := []
		for st in [[.12,-4.5,1.3],[2.3,-5.02,.72]]:
			rings.append(airfoil(Vector3(s*st[0], st[1], 1.74), st[2], .1, false, 14))
		loft(root, rings, body, true, true, [0.0,1.0])
		# Ventral strakes under the tail cone.
		var strake := S.box(root, Vector3(.03,1.0,.16), Vector3(s*.16,-4.7,1.42), body)
		strake.rotate_z(s * .5)
	# Swept fin with a long dorsal fillet; rudder hinge line and team flash.
	var fin := []
	for st in [[2.02,-2.9,3.0,.05],[2.4,-4.0,2.0,.1],[3.97,-5.15,.85,.1]]:
		fin.append(airfoil(Vector3(0, st[1], st[0]), st[2], st[3], true, 16))
	loft(root, fin, body, true, true, [0.0,.4,1.0])
	S.box(root, Vector3(.13,.03,1.5), Vector3(0,-5.3,3.0), dark)
	for s in [-1.0, 1.0]:
		S.box(root, Vector3(.012,.8,.5), Vector3(s*.09,-4.85,3.0), mark)

static func gear(root: Node3D, dark: Material, metal: Material) -> void:
	# Tricycle gear: single-wheel mains retract into the wing, nose gear aft.
	for s in [-1.0, 1.0]:
		S.rod(root, Vector3(s*1.65,.15,1.02), Vector3(s*1.72,.06,.35), .06, metal, 8)
		S.rod(root, Vector3(s*1.62,.35,.98), Vector3(s*1.7,.08,.55), .03, metal)
		S.rod(root, Vector3(s*1.73,.06,.33), Vector3(s*1.93,.06,.33), .33, S.tire(), 24)
		S.rod(root, Vector3(s*1.93,.06,.33), Vector3(s*1.97,.06,.33), .1, metal, 10)
		S.box(root, Vector3(.03,.55,.5), Vector3(s*1.58,.1,.72), dark)
	S.rod(root, Vector3(0,3.95,.95), Vector3(0,4.02,.3), .05, metal, 8)
	S.rod(root, Vector3(-.08,4.02,.24), Vector3(.08,4.02,.24), .24, S.tire(), 20)
	S.box(root, Vector3(.24,.12,.08), Vector3(0,4.02,.5), metal)

static func propeller(root: Node3D, dark: Material, metal: Material) -> void:
	# Five-blade Hartzell propeller (2.4 m) and spinner in their own spinning node.
	var prop := Node3D.new()
	prop.name = "propeller"
	prop.position = S.point(Vector3(0, 5.28, 1.44))
	root.add_child(prop)
	var spinner := []
	for st in [[0.0,.36],[.18,.33],[.34,.25],[.46,.13],[.52,.02]]:
		spinner.append(super_ring(st[0], st[1], st[1], 0.0, 16, 2.0))
	loft(prop, spinner, metal, true, true)
	for k in range(5):
		var turn := Basis(Vector3(0,0,1), TAU * k / 5.0)
		for part in [[.42,.3,.26],[.85,.27,.62],[1.12,.17,.28]]:
			var blade := MeshInstance3D.new()
			var mesh := BoxMesh.new()
			mesh.size = Vector3(part[1], part[2] * 2.0, .045)
			blade.mesh = mesh
			blade.material_override = dark
			blade.transform = Transform3D(turn * Basis(Vector3(0,1,0), .45), turn * Vector3(0, part[0], -.12))
			prop.add_child(blade)

## Superellipse ring (browser coordinates) at station y.
static func super_ring(y: float, w: float, h: float, zc: float, n: int, p: float) -> PackedVector3Array:
	var ring := PackedVector3Array()
	for i in range(n):
		var a := TAU * i / n
		var c := cos(a)
		var s := sin(a)
		ring.append(Vector3(w * signf(c) * pow(absf(c), 2.0/p), y, zc + h * signf(s) * pow(absf(s), 2.0/p)))
	return ring

## Open canopy arch: upper half superellipse from side to side.
static func arch(y: float, w: float, base: float, h: float, n: int) -> PackedVector3Array:
	var ring := PackedVector3Array()
	for i in range(n + 1):
		var a := PI * i / n
		var c := cos(a)
		ring.append(Vector3(w * signf(c) * pow(absf(c), 2.0/2.2), y, base + h * pow(sin(a), 2.0/2.2)))
	return ring

## NACA-style section: leading edge le, chord running aft (-y). Thickness in z
## (wings) or x (fin, vertical). Closed ring, upper surface first.
static func airfoil(le: Vector3, chord: float, ratio: float, vertical: bool, n: int) -> PackedVector3Array:
	var half := n / 2
	var ring := PackedVector3Array()
	for j in range(n):
		var upper := j < half
		var k := half - j if upper else j - half
		var s := (1.0 - cos(PI * float(k) / half)) * .5
		var t := 5.0 * ratio * chord * (.2969*sqrt(s) - .126*s - .3516*s*s + .2843*s*s*s - .1036*s*s*s*s)
		t = maxf(t, .004 * chord) * (1.0 if upper else -1.0)
		ring.append(le + Vector3(t if vertical else 0.0, -s * chord, 0.0 if vertical else t))
	return ring

## Lofts rings (browser coords) into one smooth shell. UV2 carries panel
## coordinates for ps2_surface: seams where they cross integers.
static func loft(parent: Node3D, rings: Array, mat: Material, closed: bool, caps: bool, panels: Array = []) -> MeshInstance3D:
	var count: int = rings[0].size()
	var grid := []
	for ring in rings:
		var row := []
		for p in ring: row.append(S.point(p))
		grid.append(row)
	var normals := []
	for r in range(grid.size()):
		var row := []
		var centre := Vector3.ZERO
		for p in grid[r]: centre += p
		centre /= count
		for i in range(count):
			var i0: int = (i - 1 + count) % count if closed else maxi(i - 1, 0)
			var i1: int = (i + 1) % count if closed else mini(i + 1, count - 1)
			var along: Vector3 = grid[mini(r + 1, grid.size() - 1)][i] - grid[maxi(r - 1, 0)][i]
			var around: Vector3 = grid[r][i1] - grid[r][i0]
			var nrm := around.cross(along).normalized()
			if nrm.dot(grid[r][i] - centre) < 0.0: nrm = -nrm
			if nrm == Vector3.ZERO: nrm = (grid[r][i] - centre).normalized()
			row.append(nrm)
		normals.append(row)
	var st := SurfaceTool.new()
	st.begin(Mesh.PRIMITIVE_TRIANGLES)
	var segments := count if closed else count - 1
	var put := func(r: int, i: int) -> void:
		var ii: int = i % count
		st.set_normal(normals[r][ii])
		# One seam along the underside (x = 1 at three quarters round); seams across at integer panels[r].
		st.set_uv2(Vector2(float(i) / segments + .25, panels[r]) if panels.size() == grid.size() else Vector2(.5, .5))
		st.add_vertex(grid[r][ii])
	for r in range(grid.size() - 1):
		for i in range(segments):
			for v in [[r,i],[r,i+1],[r+1,i+1],[r,i],[r+1,i+1],[r+1,i]]: put.call(v[0], v[1])
	if caps and closed:
		for r in [0, grid.size() - 1]:
			var centre := Vector3.ZERO
			for p in grid[r]: centre += p
			centre /= count
			var nrm: Vector3 = (grid[r][0] - grid[r][count/2]).cross(grid[r][count/4] - grid[r][0]).normalized()
			var other: Vector3 = grid[1 if r == 0 else r - 1][0]
			if nrm.dot(centre - other) < 0.0: nrm = -nrm
			for i in range(count):
				for p in [centre, grid[r][i], grid[r][(i + 1) % count]]:
					st.set_normal(nrm)
					st.set_uv2(Vector2(.5, .5))
					st.add_vertex(p)
	var node := MeshInstance3D.new()
	node.mesh = st.commit()
	node.material_override = mat
	parent.add_child(node)
	return node
