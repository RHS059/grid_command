extends RefCounted
## A-29B Super Tucano (two-seat): procedural airframe in the 2004 vehicle style.
## Real-scale proportions: 11.38 m long, 11.14 m span, 3.97 m tall, PT6A turboprop
## with a five-blade propeller, tandem canopy, low wing with dihedral, twin wing
## .50 guns, five hardpoints, ventral strakes and a large swept fin.
## Coordinates follow browser_support_models: x right, y forward, z up.
## Painted surfaces use the HEMTT grey atlas (ps2_surface) in neutral grey;
## lofted shells carry UV2 panel coordinates for seam burn and edge dodge.

const S := preload("res://scripts/browser_support_models.gd")
const L := preload("res://scripts/aircraft_loft.gd")
## Aircraft are neutral grey for both sides; faction reads from the blue/red markings.
const BODY := "#565b5f"
const WING := [[.3,1.38,2.45,.13],[1.6,1.25,2.15,.13],[3.6,.98,1.65,.12],[5.5,.62,1.12,.11]]  # [x, LE y, chord, thickness]
const FIN := [[2.02,-2.9,3.0,.05],[2.4,-4.0,2.0,.1],[3.97,-5.15,.85,.1]]  # [z, LE y, chord, thickness]
const MARK := ["#54b7ff", "#ee777b"]
const DIHEDRAL := 0.105  # tan(6 deg)

static func create(team: int = 0) -> Node3D:
	team = 1 if team == 1 else 0
	S.palette_team = team
	var root := Node3D.new()
	root.name = "a29b"
	root.set_meta("procedural_paint", true)
	root.set_meta("animate_with", "res://scripts/a29b_model.gd")
	var body := S.material(BODY, 0.9)
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
	for st in stations: rings.append(L.super_ring(st[0], st[1], st[2], st[3], 24, 2.4))
	L.loft(root, rings, body, true, true, [0.0,.4,.7,1.0,1.3,1.6,1.8,2.0,2.4,2.7,3.0,3.5,3.9])
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
	for a in arches: rings.append(L.arch(a[0], a[1], a[2], a[3], 16))
	L.loft(root, rings, glass, false, false)
	# Dorsal spine fairs the canopy into the rear fuselage.
	var spine := []
	for a in [[0.05,.33,1.98,.38],[-0.6,.28,1.98,.22],[-1.3,.2,1.98,.1],[-1.9,.1,1.98,.02]]: spine.append(L.arch(a[0], a[1], a[2], a[3], 12))
	L.loft(root, spine, body, false, false, [0.0,.3,.6,.9])
	for y in [3.45, 3.02, 1.8, 0.05]:
		var frame: PackedVector3Array = L.arch(y, arches_width(arches, y) + .015, 1.98, arches_height(arches, y) + .015, 12)
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
	for st in WING:
		var x: float = st[0]
		rings.append(L.airfoil(Vector3(s*x, st[1], wing_z(x)), st[2], st[3], false, 18))
	L.loft(root, rings, body, true, true, [0.0,.3,.6,1.0])
	S.box(root, Vector3(.06,.22,.06), Vector3(s*5.53,.3,wing_z(5.5)), S.material("#3f8a4a" if s > 0 else "#a8302a", 0.5))
	# Wing guns (FN M3P .50) muzzles, team roundels, pylons and a mixed load.
	S.rod(root, Vector3(s*1.9,1.55,wing_z(1.9)), Vector3(s*1.9,1.05,wing_z(1.9)), .035, dark, 8)
	for upper in [true, false]: roundel(root, s * 4.2, .2, .38, upper, mark)
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
			rings.append(L.airfoil(Vector3(s*st[0], st[1], 1.74), st[2], .1, false, 14))
		L.loft(root, rings, body, true, true, [0.0,1.0])
		# Ventral strakes under the tail cone.
		var strake := S.box(root, Vector3(.03,1.0,.16), Vector3(s*.16,-4.7,1.42), body)
		strake.rotate_z(s * .5)
	# Swept fin with a long dorsal fillet; rudder hinge line and team flash.
	var fin := []
	for st in FIN:
		fin.append(L.airfoil(Vector3(0, st[1], st[0]), st[2], st[3], true, 16))
	L.loft(root, fin, body, true, true, [0.0,.4,1.0])
	S.box(root, Vector3(.13,.03,1.5), Vector3(0,-5.3,3.0), dark)
	for s in [-1.0, 1.0]:
		fin_flash(root, s, mark)

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
		spinner.append(L.super_ring(st[0], st[1], st[1], 0.0, 16, 2.0))
	L.loft(prop, spinner, metal, true, true)
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

## Markings are built on the lofted surface (aircraft_loft.skin), so they never float.
static func roundel(root: Node3D, x: float, y: float, radius: float, upper: bool, mat: Material) -> void:
	var rings := []
	for r in [radius, radius * .5, 0.001]:
		var ring := PackedVector3Array()
		for k in range(20):
			var a := TAU * k / 20.0
			var px: float = x + cos(a) * r
			var p := L.skin(WING, absf(px), y + sin(a) * r, 1.0 if upper else -1.0)
			ring.append(Vector3(px, p.y, wing_z(absf(px)) + p.z))
		rings.append(ring)
	L.decal(root, rings, mat, Vector3(0, 0, 1) if upper else Vector3(0, 0, -1))

static func fin_flash(root: Node3D, side: float, mat: Material) -> void:
	var rings := []
	for z in [2.75, 3.0, 3.25]:
		var ring := PackedVector3Array()
		for k in range(8):
			var p := L.skin(FIN, z, lerpf(-4.7, -5.4, k / 7.0), 1.0)
			ring.append(Vector3(side * p.z, p.y, z))
		rings.append(ring)
	L.decal(root, rings, mat, Vector3(side, 0, 0), false)
