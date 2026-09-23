extends RefCounted
## Support Helicopter B: UH-60 Black Hawk utility helicopter, procedural, real scale.
## 15.3 m fuselage, 16.36 m four-blade main rotor, 5.1 m tall. Long low cabin with
## sliding doors, twin T700 engines beside the transmission, canted four-blade
## tail rotor on the right of the pylon, low stabilator, fixed gear and tailwheel.
## Neutral grey; faction reads from the markings. Coordinates: x right, y forward, z up.

const S := preload("res://scripts/browser_support_models.gd")
const L := preload("res://scripts/aircraft_loft.gd")
const BODY := "#4a4f53"
const MARK := ["#54b7ff", "#ee777b"]
const P := 3.6  # flat-sided cabin with rounded corners
## [y, half width, half height, centre z]: drooped nose under a steep windscreen,
## long flat-bottomed cabin (belly 0.55 m, roof 2.5 m), belly sweeping up into a
## straight high tail boom whose top line continues the roof.
const FUSELAGE := [[7.65,.15,.10,1.15],[7.35,.55,.30,1.20],[6.9,.85,.485,1.235],[6.3,1.0,.665,1.285],[5.4,1.1,.91,1.47],[4.8,1.12,.96,1.51],[0.0,1.12,.975,1.525],[-1.5,1.05,.95,1.55],[-2.6,.8,.65,1.8],[-3.6,.5,.35,2.07],[-6.5,.32,.22,2.24],[-7.75,.26,.19,2.31]]
## [z, LE y, chord, thickness]: swept tail pylon.
const PYLON := [[2.2,-6.8,1.5,.16],[4.45,-7.95,1.0,.13]]

static func create(team: int = 0) -> Node3D:
	team = 1 if team == 1 else 0
	S.palette_team = team
	var root := Node3D.new()
	root.name = "support_heli_b"
	var body := S.material(BODY, 0.9)
	var dark := S.material("#262c29", 0.9)
	var metal := S.material("#565f51", 0.8, 0.15)
	var mark := S.material(MARK[team], 0.85)
	var glass := StandardMaterial3D.new()
	glass.albedo_color = Color("1b252c")
	glass.roughness = 0.1
	glass.metallic_specular = 0.8

	var rings := []
	for st in FUSELAGE: rings.append(L.super_ring(st[0], st[1], st[2], st[3], 24, P))
	L.loft(root, rings, body, true, true, [0.0,.3,.6,1.0,1.4,1.6,2.4,2.8,3.0,3.4,3.9,4.2])
	# Transmission and engine deck: fairing on the roof, T700 nacelles either side.
	var deck := []
	for st in [[4.6,.15,.1],[3.9,.72,.45],[.4,.72,.5],[-1.4,.35,.3],[-2.4,.1,.08]]:
		deck.append(L.super_ring(st[0], st[1], st[2], 2.55, 16, 2.4))
	L.loft(root, deck, body, true, true, [0.0,.5,1.5,2.0,2.3])
	for s in [-1.0, 1.0]:
		var nacelle := []
		for st in [[3.0,.2],[2.7,.36],[-.1,.36],[-.7,.24]]:
			var ring := L.super_ring(st[0], st[1], st[1] * .9, 2.78, 14, 2.2)
			for k in range(ring.size()): ring[k].x += s * .72
			nacelle.append(ring)
		L.loft(root, nacelle, body, true, true, [0.0,.4,1.6,2.0])
		S.rod(root, Vector3(s * .72, 3.02, 2.78), Vector3(s * .72, 2.9, 2.78), .17, dark, 12)  # intake
		S.rod(root, Vector3(s * .8, -.55, 2.78), Vector3(s * 1.15, -1.15, 2.62), .2, dark, 10)  # IR suppressor, angled out
	# Glazing, doors and markings follow the skin.
	L.body_decal(root, FUSELAGE, P, 5.35, 6.75, PI * .16, PI * .84, glass, 10, 4)  # windscreen
	for s in [-1.0, 1.0]:
		var a := 0.0 if s > 0 else PI
		L.body_decal(root, FUSELAGE, P, 4.3, 5.35, a - s * .1, a + s * .5, glass, 4, 4)  # cockpit door
		L.body_decal(root, FUSELAGE, P, 6.0, 6.8, a - s * .2, a - s * .7, glass, 3, 3)  # chin window
		L.body_decal(root, FUSELAGE, P, 3.35, 3.95, a + s * .1, a + s * .6, glass, 3, 3)  # gunner window
		for y in [0.6, 3.15]: L.body_decal(root, FUSELAGE, P, y, y - .05, a - s * .8, a + s * .72, dark, 1, 6)
		L.body_decal(root, FUSELAGE, P, 3.15, 0.6, a + s * .72, a + s * .68, dark, 6, 1)  # sliding door rail
		L.body_decal(root, FUSELAGE, P, 2.6, 1.4, a + s * .12, a + s * .55, glass, 3, 3)  # door window
		L.body_roundel(root, FUSELAGE, P, -1.2, a + s * .05, .45, 1.08, mark)
		pylon_flash(root, s, mark)
	# Tail pylon, stabilator and tailwheel.
	var pylon := []
	for st in PYLON: pylon.append(L.airfoil(Vector3(0, st[1], st[0]), st[2], st[3], true, 16))
	L.loft(root, pylon, body, true, true, [0.0,1.0])
	for s in [-1.0, 1.0]:
		var stab := []
		for st in [[.15,-7.3,1.05,.1],[2.2,-7.45,.9,.1]]:
			stab.append(L.airfoil(Vector3(s * st[0], st[1], 2.4), st[2], st[3], false, 12))
		L.loft(root, stab, body, true, true, [0.0,1.0])
	gear(root, dark, metal)
	main_rotor(root, dark, metal)
	tail_rotor(root, dark, metal)
	S.merge_stationary(root)
	return root

## Spins both rotors in previews.
static func animate(model: Node3D, delta: float) -> void:
	var main := model.get_node_or_null("main-rotor")
	if main != null: main.rotate_object_local(Vector3.UP, delta * 12.0)
	var tail := model.get_node_or_null("tail-rotor")
	if tail != null: tail.rotate_object_local(Vector3.RIGHT, delta * 40.0)

static func pylon_flash(root: Node3D, side: float, mat: Material) -> void:
	var rings := []
	for z in [3.0, 3.35, 3.7]:
		var ring := PackedVector3Array()
		for k in range(6):
			var p := L.skin(PYLON, z, lerpf(-7.3, -7.95, k / 5.0), 1.0)
			ring.append(Vector3(side * p.z, p.y, z))
		rings.append(ring)
	L.decal(root, rings, mat, Vector3(side, 0, 0), false)

static func gear(root: Node3D, dark: Material, metal: Material) -> void:
	# Fixed mains on drag-braced struts under the cockpit; tailwheel under the boom.
	for s in [-1.0, 1.0]:
		S.rod(root, Vector3(s * 1.0, 4.35, .8), Vector3(s * 1.45, 4.15, .4), .07, metal, 8)
		S.rod(root, Vector3(s * 1.0, 3.3, .8), Vector3(s * 1.45, 4.1, .45), .05, metal, 8)
		S.rod(root, Vector3(s * 1.4, 4.15, .38), Vector3(s * 1.62, 4.15, .38), .38, S.tire(), 20)
	S.rod(root, Vector3(0, -5.9, 2.0), Vector3(0, -6.05, .45), .06, metal, 8)
	S.rod(root, Vector3(-.08, -6.1, .22), Vector3(.08, -6.1, .22), .22, S.tire(), 16)

static func main_rotor(root: Node3D, dark: Material, metal: Material) -> void:
	S.rod(root, Vector3(0, 2.0, 3.0), Vector3(0, 2.0, 3.72), .16, metal, 10)  # mast
	var rotor := Node3D.new()
	rotor.name = "main-rotor"
	rotor.position = S.point(Vector3(0, 2.0, 3.78))
	root.add_child(rotor)
	S.rod(rotor, Vector3(0, 0, -.12), Vector3(0, 0, .12), .38, metal, 12)  # hub
	for k in range(4):
		var arm := Node3D.new()
		arm.rotate_y(TAU * k / 4.0 + .3)
		rotor.add_child(arm)
		S.box(arm, Vector3(7.7, .53, .08), Vector3(4.35, 0, -.06), dark)
		S.box(arm, Vector3(.5, .3, .14), Vector3(.55, 0, 0), metal)

static func tail_rotor(root: Node3D, dark: Material, metal: Material) -> void:
	# Right-hand pusher rotor, canted 20 degrees for lift.
	var rotor := Node3D.new()
	rotor.name = "tail-rotor"
	rotor.position = S.point(Vector3(.3, -7.95, 4.15))
	rotor.rotate_z(deg_to_rad(20.0))
	root.add_child(rotor)
	S.rod(rotor, Vector3(-.08, 0, 0), Vector3(.12, 0, 0), .14, metal, 10)
	for k in range(4):
		var arm := Node3D.new()
		arm.rotate_x(TAU * k / 4.0 + .4)
		rotor.add_child(arm)
		S.box(arm, Vector3(.04, .24, 1.5), Vector3(.05, 0, .9), dark)
