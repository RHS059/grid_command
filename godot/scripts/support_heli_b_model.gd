extends RefCounted
## Support Helicopter B: UH-60 Black Hawk utility helicopter, procedural, real scale.
## 15.3 m fuselage, 16.36 m four-blade main rotor, 5.1 m tall. Flat-sided cabin
## with both sliding doors open (troop seats, door guns), framed interior-mapped
## cockpit glazing, wire-strike cutters, twin T700s with angled IR suppressors,
## bifilar rotor head, drive-shaft cover along the boom, canted tail rotor on the
## right, stabilator, fixed gear and tailwheel.
## Neutral grey; faction reads from the markings. Coordinates: x right, y forward, z up.

const S := preload("res://scripts/browser_support_models.gd")
const L := preload("res://scripts/aircraft_loft.gd")
const BODY := "#4a4f53"
const MARK := ["#54b7ff", "#ee777b"]
const P := 3.6  # flat-sided cabin with rounded corners
const RING := 24
## [y, half width, half height, centre z]: drooped nose under a steep windscreen,
## long flat-bottomed cabin (belly 0.55 m, roof 2.5 m), belly sweeping up into a
## straight high tail boom whose top line continues the roof. 3.15 / 0.6 bound the doors.
const FUSELAGE := [[7.72,.25,.14,1.12],[7.55,.6,.33,1.16],[7.2,.85,.5,1.22],[6.8,.97,.6,1.26],[6.3,1.04,.68,1.29],[5.4,1.1,.91,1.47],[4.8,1.12,.96,1.51],[3.15,1.12,.968,1.518],[0.6,1.12,.974,1.524],[0.0,1.12,.975,1.525],[-1.5,1.05,.95,1.55],[-2.6,.8,.65,1.8],[-3.6,.5,.35,2.07],[-6.5,.32,.22,2.24],[-7.75,.26,.19,2.31]]
const DOOR_RING := 7        # quads between the 3.15 and 0.6 stations
const DOOR_ANGLE := .785    # opening spans +/-45 degrees around each side
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
	var interior := S.material("#3d423f", 0.95)
	var canvas := S.material("#56583f", 0.95)

	fuselage(root, body, dark, metal)
	cabin(root, body, dark, metal, interior, canvas)
	cockpit(root, dark, metal)
	for s in [-1.0, 1.0]:
		var a := 0.0 if s > 0 else PI
		L.body_roundel(root, FUSELAGE, P, -4.6, a + s * .1, .28, .42, mark)
		pylon_flash(root, s, mark)
	tail(root, body, dark)
	gear(root, body, metal)
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

## True inside either door opening (ring quad r, i on a RING-sided super_ring).
static func in_door(r: int, i: int, door_ring := DOOR_RING) -> bool:
	if r != door_ring: return false
	var a := TAU * (i + .5) / RING
	return absf(wrapf(a, -PI, PI)) < DOOR_ANGLE or absf(wrapf(a - PI, -PI, PI)) < DOOR_ANGLE

static func fuselage(root: Node3D, body: Material, dark: Material, metal: Material) -> void:
	var rings := []
	for st in FUSELAGE: rings.append(L.super_ring(st[0], st[1], st[2], st[3], RING, P))
	L.loft(root, rings, body, true, true, [0.0,.2,.4,.6,1.0,1.4,1.6,1.9,2.2,2.4,2.8,3.0,3.4,3.9,4.2], func(r, i): return in_door(r, i))
	# Transmission and engine deck, T700 nacelles, angled IR suppressors, oil-cooler grille.
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
		S.rod(root, Vector3(s * .72, 3.02, 2.78), Vector3(s * .72, 2.92, 2.78), .19, dark, 12)  # intake
		S.rod(root, Vector3(s * .72, 3.06, 2.78), Vector3(s * .72, 3.0, 2.78), .07, metal, 8)   # starter bullet
		S.rod(root, Vector3(s * .8, -.55, 2.78), Vector3(s * 1.2, -1.3, 2.6), .22, body, 12)     # suppressor duct
		S.rod(root, Vector3(s * 1.2, -1.3, 2.6), Vector3(s * 1.25, -1.4, 2.58), .19, dark, 12)   # exhaust mouth
		var a := 0.0 if s > 0 else PI
		L.body_line(root, FUSELAGE, P, [[4.8, a + s * 1.2], [-1.5, a + s * 1.2]], .04, dark)  # upper cowl seam
	S.box(root, Vector3(.5, .35, .04), Vector3(0, -1.0, 2.86), dark)  # oil cooler exhaust
	S.rod(root, Vector3(0, -1.9, 2.62), Vector3(0, -2.2, 2.6), .08, dark, 8)  # APU exhaust
	S.box(root, Vector3(.03, .3, .32), Vector3(0, -2.0, 2.2), dark)  # VHF blade
	S.box(root, Vector3(.03, .4, .12), Vector3(0, 1.5, .5), dark)    # belly antenna

static func cabin(root: Node3D, body: Material, dark: Material, metal: Material, interior: Material, canvas: Material) -> void:
	# Inner liner closes the cabin behind the openings; its caps are the bulkheads.
	var liner := []
	for y in [3.2, 3.15, 0.6, 0.55]:
		liner.append(L.super_ring(y, 1.07, .92, 1.52, RING, P))
	L.loft(root, liner, interior, true, true, [], func(r, i): return in_door(r, i, 1))
	S.box(root, Vector3(2.1, 2.6, .06), Vector3(0, 1.875, .66), dark)  # floor
	for s in [-1.0, 1.0]:
		var a := 0.0 if s > 0 else PI
		# Door frame, then the door slid fully aft along its rails, with its window.
		L.body_line(root, FUSELAGE, P, [[3.15, a - s * DOOR_ANGLE], [3.15, a + s * DOOR_ANGLE], [0.6, a + s * DOOR_ANGLE], [0.6, a - s * DOOR_ANGLE], [3.15, a - s * DOOR_ANGLE]], .06, dark)
		L.body_decal(root, FUSELAGE, P, .55, -1.95, a - s * DOOR_ANGLE, a + s * DOOR_ANGLE, body, 6, 8, .06)
		L.body_line(root, FUSELAGE, P, [[.55, a - s * DOOR_ANGLE], [.55, a + s * DOOR_ANGLE], [-1.95, a + s * DOOR_ANGLE], [-1.95, a - s * DOOR_ANGLE], [.55, a - s * DOOR_ANGLE]], .035, dark, .07)
		L.body_pane(root, FUSELAGE, P, .25, -.85, a + s * .12, a + s * .58, 0, dark, .075, .03, 2.2)
		S.box(root, Vector3(.04, .18, .04), Vector3(s * 1.2, .35, 1.3), metal)  # door handle
		L.body_line(root, FUSELAGE, P, [[3.3, a + s * .82], [-2.1, a + s * .82]], .05, metal, .02)  # upper rail
		L.body_line(root, FUSELAGE, P, [[3.3, a - s * .82], [-2.1, a - s * .82]], .05, metal, .02)  # lower rail
		# Door gunner's M240 on its pintle arm at the gunner window, with ammo can.
		S.box(root, Vector3(.12, .1, .35), Vector3(s * .95, 3.6, 1.35), metal)
		S.box(root, Vector3(.1, .5, .12), Vector3(s * 1.05, 3.65, 1.6), dark)
		S.rod(root, Vector3(s * 1.05, 3.9, 1.62), Vector3(s * 1.55, 4.55, 1.62), .025, dark, 6)
		S.box(root, Vector3(.14, .22, .16), Vector3(s * .92, 3.55, 1.48), S.material("#4d5a3a", .85))
	# Troop seats: four facing forward on the rear bulkhead, three facing aft forward.
	for row in [[.72, .6, 1.0], [2.95, 3.1, -1.0]]:
		var n := 4 if row[2] > 0 else 3
		for k in range(n):
			var x: float = (k - (n - 1) * .5) * .5
			S.box(root, Vector3(.42, .4, .05), Vector3(x, row[0] + row[2] * .12, 1.05), canvas)
			S.box(root, Vector3(.42, .05, .55), Vector3(x, row[1], 1.38), canvas)
			for dx in [-.18, .18]:
				S.rod(root, Vector3(x + dx, row[0] + row[2] * .28, .69), Vector3(x + dx, row[0] + row[2] * .28, 1.05), .015, metal, 4)
			S.rod(root, Vector3(x - .2, row[1], 1.66), Vector3(x + .2, row[1], 1.66), .015, metal, 4)

static func cockpit(root: Node3D, dark: Material, metal: Material) -> void:
	# Framed interior-mapped glazing: split windscreen, overhead, door and chin windows.
	var top := PI * .5
	for s in [-1.0, 1.0]:
		var a := 0.0 if s > 0 else PI
		L.body_pane(root, FUSELAGE, P, 6.72, 5.42, top - s * .03, top - s * .78, 1, dark, .02, .06, 1.1)   # windscreen
		L.body_pane(root, FUSELAGE, P, 5.3, 4.65, top - s * .06, top - s * .38, 0, dark, .02, .03, .9)     # overhead
		L.body_pane(root, FUSELAGE, P, 5.35, 4.3, a + s * .2, a + s * .8, 0, dark, .02, .04, 1.3)         # cockpit door
		L.body_pane(root, FUSELAGE, P, 5.2, 4.45, a - s * .12, a + s * .14, 0, dark, .02, .03, 1.3)       # lower door
		L.body_pane(root, FUSELAGE, P, 6.85, 6.05, a - s * .3, a - s * .78, 0, dark, .02, .03, 1.0)       # chin window
		L.body_pane(root, FUSELAGE, P, 3.95, 3.35, a + s * .12, a + s * .62, 0, dark, .02, .03, 1.6)      # gunner window
		L.body_line(root, FUSELAGE, P, [[5.4, a + s * .9], [4.2, a + s * .9], [4.2, a - s * .5], [5.4, a - s * .5]], .03, dark)  # cockpit door outline
		S.rod(root, Vector3(s * .5, 7.1, 1.5), Vector3(s * .5, 7.9, 1.48), .012, metal, 4)  # pitot
	# Wire-strike protection: roof cutter, windscreen deflector, chin cutter.
	S.box(root, Vector3(.03, .9, .08), Vector3(0, 4.95, 2.65), metal).rotate_x(-.35)
	S.rod(root, L.body_skin(FUSELAGE, 6.45, top, P, .06), L.body_skin(FUSELAGE, 5.45, top, P, .06), .02, metal, 4)
	S.box(root, Vector3(.03, .5, .25), Vector3(0, 6.7, .5), metal)

static func tail(root: Node3D, body: Material, dark: Material) -> void:
	var pylon := []
	for st in PYLON: pylon.append(L.airfoil(Vector3(0, st[1], st[0]), st[2], st[3], true, 16))
	L.loft(root, pylon, body, true, true, [0.0,1.0])
	for s in [-1.0, 1.0]:
		var stab := []
		for st in [[.15,-7.3,1.05,.1],[2.2,-7.45,.9,.1]]:
			stab.append(L.airfoil(Vector3(s * st[0], st[1], 2.4), st[2], st[3], false, 12))
		L.loft(root, stab, body, true, true, [0.0,1.0])
	# Tail-rotor drive-shaft cover along the boom top, gearbox fairing at the pylon tip.
	var shaft := []
	for st in [[-2.3,.05,.03,2.47],[-2.6,.13,.08,2.5],[-6.6,.11,.07,2.53],[-6.9,.05,.03,2.55]]:
		shaft.append(L.super_ring(st[0], st[1], st[2], st[3], 10, 2.2))
	L.loft(root, shaft, body, true, true, [0.0,.5,1.5,2.0])
	var gearbox := []
	for st in [[-7.55,.05,.05],[-7.7,.18,.2],[-8.1,.18,.2],[-8.3,.05,.05]]:
		var ring := L.super_ring(st[0], st[1], st[2], 4.15, 10, 2.2)
		for k in range(ring.size()): ring[k].x += .1
		gearbox.append(ring)
	L.loft(root, gearbox, body, true, true)
	S.box(root, Vector3(.03, .45, .03), Vector3(0, -7.9, 4.55), dark)  # tail antenna

static func pylon_flash(root: Node3D, side: float, mat: Material) -> void:
	var rings := []
	for z in [3.0, 3.35, 3.7]:
		var ring := PackedVector3Array()
		for k in range(6):
			var p := L.skin(PYLON, z, lerpf(-7.3, -7.95, k / 5.0), 1.0)
			ring.append(Vector3(side * p.z, p.y, z))
		rings.append(ring)
	L.decal(root, rings, mat, Vector3(side, 0, 0), false)

static func gear(root: Node3D, body: Material, metal: Material) -> void:
	# Trailing-arm mains from small sponsons under the cockpit; tailwheel under the boom.
	for s in [-1.0, 1.0]:
		S.box(root, Vector3(.3, .8, .3), Vector3(s * 1.08, 4.3, .78), body)
		S.rod(root, Vector3(s * 1.15, 4.5, .78), Vector3(s * 1.45, 4.15, .4), .07, metal, 8)
		S.rod(root, Vector3(s * 1.15, 3.9, .85), Vector3(s * 1.45, 4.1, .45), .05, metal, 8)
		S.rod(root, Vector3(s * 1.38, 4.15, .38), Vector3(s * 1.62, 4.15, .38), .38, S.tire(), 20)
		S.rod(root, Vector3(s * 1.62, 4.15, .38), Vector3(s * 1.66, 4.15, .38), .12, metal, 10)
	S.rod(root, Vector3(0, -5.9, 2.0), Vector3(0, -6.05, .45), .06, metal, 8)
	S.rod(root, Vector3(-.08, -6.1, .22), Vector3(.08, -6.1, .22), .22, S.tire(), 16)

static func main_rotor(root: Node3D, dark: Material, metal: Material) -> void:
	S.rod(root, Vector3(0, 2.0, 3.0), Vector3(0, 2.0, 3.72), .16, metal, 10)  # mast
	S.rod(root, Vector3(0, 2.0, 3.28), Vector3(0, 2.0, 3.36), .42, metal, 16)  # swashplate
	var rotor := Node3D.new()
	rotor.name = "main-rotor"
	rotor.position = S.point(Vector3(0, 2.0, 3.78))
	root.add_child(rotor)
	S.rod(rotor, Vector3(0, 0, -.14), Vector3(0, 0, .14), .42, metal, 12)  # hub
	S.rod(rotor, Vector3(0, 0, .14), Vector3(0, 0, .42), .07, metal, 8)
	for k in range(4):
		var arm := Node3D.new()
		arm.rotate_y(TAU * k / 4.0 + .3)
		rotor.add_child(arm)
		# Elastomeric bearing, pitch link, blade with slight droop and a swept tip.
		S.box(arm, Vector3(.55, .3, .16), Vector3(.62, 0, 0), metal)
		S.rod(arm, Vector3(.5, .18, -.45), Vector3(.5, .18, 0), .02, metal, 4)
		var blade := Node3D.new()
		blade.position = S.point(Vector3(.9, 0, 0))
		blade.rotate_z(-.025)
		arm.add_child(blade)
		S.box(blade, Vector3(7.0, .53, .07), Vector3(3.5, 0, -.04), dark)
		S.box(blade, Vector3(.55, .4, .06), Vector3(7.2, -.05, -.04), dark).rotate_y(.3)
		# Bifilar vibration absorber: arm and weight above the hub.
		var bif := Node3D.new()
		bif.rotate_y(PI / 4.0)
		arm.add_child(bif)
		S.box(bif, Vector3(.45, .08, .06), Vector3(.25, 0, .3), metal)
		S.rod(bif, Vector3(.5, 0, .22), Vector3(.5, 0, .38), .09, metal, 10)

static func tail_rotor(root: Node3D, dark: Material, metal: Material) -> void:
	# Right-hand pusher rotor, canted 20 degrees for lift.
	var rotor := Node3D.new()
	rotor.name = "tail-rotor"
	rotor.position = S.point(Vector3(.32, -7.95, 4.15))
	rotor.rotate_z(deg_to_rad(20.0))
	root.add_child(rotor)
	S.rod(rotor, Vector3(-.1, 0, 0), Vector3(.14, 0, 0), .15, metal, 10)
	for k in range(4):
		var arm := Node3D.new()
		arm.rotate_x(TAU * k / 4.0 + .4)
		rotor.add_child(arm)
		S.box(arm, Vector3(.04, .26, 1.5), Vector3(.06, 0, .9), dark)
