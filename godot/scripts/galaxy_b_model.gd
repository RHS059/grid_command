extends RefCounted
## Galaxy-B: C-5 Galaxy strategic airlifter, procedural, real scale.
## 75.5 m long, 67.9 m span, 19.85 m tall. High wing swept about 25 degrees with
## anhedral, four underwing turbofans, T-tail, upswept tail with rear doors,
## lifting visor nose, 28-wheel gear (four six-wheel main bogies in sponsons,
## four-wheel nose gear). Neutral grey; faction reads from the markings.
## Coordinates: x right, y forward, z up (see aircraft_loft.gd).

const S := preload("res://scripts/browser_support_models.gd")
const L := preload("res://scripts/aircraft_loft.gd")
const BODY := "#5d6368"
const MARK := ["#54b7ff", "#ee777b"]
const P := 3.0  # boxy superellipse cargo fuselage
## [y, half width, half height, centre z]
const FUSELAGE := [[37.7,.25,.3,5.3],[37.0,1.7,1.8,5.1],[35.5,2.7,2.9,5.2],[33.5,3.25,3.55,5.3],[30.0,3.55,3.9,5.35],[-16.0,3.55,3.9,5.35],[-22.0,3.3,3.55,5.9],[-28.0,2.65,2.85,6.85],[-33.0,1.85,2.05,7.75],[-36.6,1.0,1.2,8.35],[-37.8,.3,.4,8.6]]
## [x, LE y, chord, thickness]; 25 degree quarter-chord sweep.
const WING := [[1.0,8.0,13.0,.12],[12.0,3.33,9.8,.115],[24.0,-3.0,6.8,.105],[33.9,-8.3,4.4,.1]]
## [z, LE y, chord, thickness]
const FIN := [[9.3,-21.5,15.0,.1],[19.2,-29.3,8.0,.1]]
const STAB := [[.3,-28.6,8.4,.09],[10.4,-34.6,3.4,.08]]

static func create(team: int = 0) -> Node3D:
	team = 1 if team == 1 else 0
	S.palette_team = team
	var root := Node3D.new()
	root.name = "galaxy_b"
	var body := S.material(BODY, 0.9)
	# Scale the painted detail to a 75 m airframe so broad variation stays broad.
	body.set_shader_parameter("tiles_per_unit", .1)
	body.set_shader_parameter("macro_scale", .012)
	var dark := S.material("#262c29", 0.9)
	var metal := S.material("#565f51", 0.8, 0.15)
	var mark := S.material(MARK[team], 0.85)
	var glass := StandardMaterial3D.new()
	glass.albedo_color = Color("1b252c")
	glass.roughness = 0.1
	glass.metallic_specular = 0.8

	# Fuselage with visor-nose, main-gear sponsons and a belly fairing.
	var rings := []
	for st in FUSELAGE: rings.append(L.super_ring(st[0], st[1], st[2], st[3], 28, P))
	L.loft(root, rings, body, true, true, [0.0,.4,.8,1.0,1.4,4.0,4.5,5.0,5.5,5.8,6.0])
	for s in [-1.0, 1.0]:
		var pod := []
		for st in [[5.0,.2,.5,1.9],[3.5,.75,.95,2.0],[-8.5,.75,.95,2.0],[-11.0,.2,.5,2.1]]:
			var ring := L.super_ring(st[0], st[1], st[2], st[3], 16, 2.6)
			for k in range(ring.size()): ring[k].x += s * 3.3
			pod.append(ring)
		L.loft(root, pod, body, true, true, [0.0,.5,3.5,4.0])
	L.body_decal(root, FUSELAGE, P, 33.4, 33.55, -.1, PI + .1, dark, 16, 1, .05)  # visor hinge seam
	L.body_decal(root, FUSELAGE, P, 31.4, 33.0, PI * .33, PI * .67, glass, 8, 3, .05)  # flight deck glazing
	for s in [-1.0, 1.0]:
		var a := 0.0 if s > 0 else PI
		L.body_decal(root, FUSELAGE, P, 31.2, 32.2, a + s * .5, a + s * .75, glass, 3, 3, .05)
		L.body_decal(root, FUSELAGE, P, 24.0, 25.2, a + s * .05, a - s * .3, dark, 3, 3, .05)  # crew door
		L.body_decal(root, FUSELAGE, P, -12.5, -11.2, a + s * .05, a - s * .3, dark, 3, 3, .05)  # paratroop door
		for i in range(12):
			var y := 20.0 - i * 2.4
			L.body_decal(root, FUSELAGE, P, y, y - .45, a + s * .95, a + s * 1.02, glass, 1, 1, .05)  # upper-deck windows
		L.body_roundel(root, FUSELAGE, P, 14.0, a + s * .05, 1.2, 3.55, mark, .05)
	# Rear clamshell doors and ramp outline on the upswept belly.
	for a in [-PI * .82, -PI * .5, -PI * .18]:
		L.body_decal(root, FUSELAGE, P, -22.5, -34.0, a - .012, a + .012, dark, 1, 8, .05)
	L.body_decal(root, FUSELAGE, P, -22.4, -22.6, -PI * .82, -PI * .18, dark, 10, 1, .05)

	# High swept wing with anhedral, engine pylons and nacelles.
	for s in [-1.0, 1.0]:
		var wing := []
		for st in WING: wing.append(L.airfoil(Vector3(s * st[0], st[1], wing_z(st[0])), st[2], st[3], false, 20))
		L.loft(root, wing, body, true, true, [0.0,1.0,2.0,3.0])
		for x in [13.5, 22.5]:
			engine(root, s * x, dark, metal, body)
		S.box(root, Vector3(.4, .9, .3), Vector3(s * 33.95, -8.2, wing_z(33.9)), S.material("#3f8a4a" if s > 0 else "#a8302a", 0.5))
		for upper in [true, false]:
			wing_roundel(root, s, 27.0, upper, mark)
	S.box(root, Vector3(6.6, 13.0, 1.0), Vector3(0, 1.6, 9.2), body)  # wing-to-body fairing

	# T-tail: tall swept fin, stabiliser and bullet fairing on top.
	var fin := []
	for st in FIN: fin.append(L.airfoil(Vector3(0, st[1], st[0]), st[2], st[3], true, 20))
	L.loft(root, fin, body, true, true, [0.0,1.0])
	for s in [-1.0, 1.0]:
		var stab := []
		for st in STAB: stab.append(L.airfoil(Vector3(s * st[0], st[1], 19.4), st[2], st[3], false, 16))
		L.loft(root, stab, body, true, true, [0.0,1.0])
		fin_flash(root, s, mark)
	var bullet := []
	for st in [[-26.5,.05,.05],[-28.0,.6,.6],[-36.0,.6,.6],[-38.0,.05,.05]]:
		bullet.append(L.super_ring(st[0], st[1], st[2], 19.45, 12, 2.0))
	L.loft(root, bullet, body, true, true)

	gear(root, dark, metal)
	S.merge_stationary(root)
	return root

static func wing_z(x: float) -> float:
	return 9.1 - maxf(0.0, absf(x) - 1.0) * .096  # 5.5 degree anhedral

static func lerp_station(stations: Array, span: float, field: int) -> float:
	var i := 0
	while i < stations.size() - 2 and span > stations[i+1][0]: i += 1
	var t := clampf((span - stations[i][0]) / (stations[i+1][0] - stations[i][0]), 0.0, 1.0)
	return lerpf(stations[i][field], stations[i+1][field], t)

static func engine(root: Node3D, x: float, dark: Material, metal: Material, body: Material) -> void:
	# High-bypass turbofan: nacelle ahead of and below the wing on a swept pylon.
	var le := lerp_station(WING, absf(x), 1)
	var z := wing_z(x) - 2.3
	var front := le + 4.2
	var rings := []
	for st in [[front,1.2],[front - .4,1.42],[front - 3.0,1.45],[front - 5.6,1.15],[front - 7.2,.7]]:
		var ring := L.super_ring(st[0], st[1], st[1], z, 20, 2.0)
		for k in range(ring.size()): ring[k].x += x
		rings.append(ring)
	L.loft(root, rings, body, true, false, [0.0,.5,1.0,1.5,2.0])
	S.rod(root, Vector3(x, front + .05, z), Vector3(x, front - .5, z), 1.12, dark, 20)  # intake and fan face
	S.rod(root, Vector3(x, front - 6.8, z), Vector3(x, front - 8.6, z), .5, metal, 14)  # exhaust plug
	S.rod(root, Vector3(x, front - .2, z), Vector3(x, front + .35, z), .3, metal, 12)  # spinner
	var pylon := []
	for st in [[z + 1.1, front - 2.0, 6.5, .12],[wing_z(x) - .1, le + .5, 6.0, .12]]:
		var ring := L.airfoil(Vector3(x, st[1], st[0]), st[2], st[3], true, 12)
		pylon.append(ring)
	L.loft(root, pylon, body, true, true, [0.0,1.0])

static func wing_roundel(root: Node3D, s: float, span: float, upper: bool, mat: Material) -> void:
	var chord := lerp_station(WING, span, 2)
	var centre := lerp_station(WING, span, 1) - chord * .45
	var radius := 1.6
	var rings := []
	for r in [radius, radius * .5, 0.001]:
		var ring := PackedVector3Array()
		for k in range(24):
			var a := TAU * k / 24.0
			var px: float = span + cos(a) * r
			var p := L.skin(WING, px, centre + sin(a) * r, 1.0 if upper else -1.0, .04)
			ring.append(Vector3(s * px, p.y, wing_z(px) + p.z))
		rings.append(ring)
	L.decal(root, rings, mat, Vector3(0, 0, 1 if upper else -1))

static func fin_flash(root: Node3D, side: float, mat: Material) -> void:
	var rings := []
	for z in [13.0, 14.25, 15.5]:
		var ring := PackedVector3Array()
		for k in range(8):
			var p := L.skin(FIN, z, lerpf(-27.2, -31.8, k / 7.0), 1.0, .04)
			ring.append(Vector3(side * p.z, p.y, z))
		rings.append(ring)
	L.decal(root, rings, mat, Vector3(side, 0, 0), false)

static func gear(root: Node3D, dark: Material, metal: Material) -> void:
	# Four six-wheel main bogies under the sponsons and a four-wheel nose gear.
	for s in [-1.0, 1.0]:
		for y in [1.2, -5.8]:
			S.rod(root, Vector3(s * 3.3, y, 1.4), Vector3(s * 3.3, y, .8), .18, metal, 8)
			for dy in [-1.3, 0.0, 1.3]:
				for dx in [-.45, .45]:
					var wx: float = s * 3.3 + dx
					S.rod(root, Vector3(wx - .22, y + dy, .62), Vector3(wx + .22, y + dy, .62), .62, S.tire(), 20)
	S.rod(root, Vector3(0, 31.0, 1.6), Vector3(0, 31.0, .8), .22, metal, 8)
	for dy in [-.7, .7]:
		for dx in [-.45, .45]:
			S.rod(root, Vector3(dx - .2, 31.0 + dy, .56), Vector3(dx + .2, 31.0 + dy, .56), .56, S.tire(), 20)
