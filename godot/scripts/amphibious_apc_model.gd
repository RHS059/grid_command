extends RefCounted
## Amphibious APC: ACV 1.1-style 8x8 amphibious combat vehicle, procedural, real scale.
## About 8.9 m long, 3.1 m wide, 2.8 m to the top of the weapon station. Boat hull
## with a V belly and hard chines, long glacis with a folding trim vane, rear
## ramp with door, two shrouded propellers and rudders at the stern, eight large
## HEMTT-style tyres (1-2, gap, 3-4) under a buoyancy sponson, driver hatch with vision
## blocks, commander's cupola, remote weapon station with an M2, smoke launchers,
## intake and exhaust grilles, lights, tow points and handrails.
## Faction body paint (FDE / pine) through the HEMTT atlas; small blue/red markers.
## Coordinates follow browser_support_models: x right, y forward, z up, ground at 0.

const S := preload("res://scripts/browser_support_models.gd")
const L := preload("res://scripts/aircraft_loft.gd")
const MARK := ["#54b7ff", "#ee777b"]
const WHEELS := [2.45, 1.1, -1.65, -3.0]
## [y, keel z, chine (w, z), beam (w, z), shoulder (w, z), roof (w, z)]
const HULL := [
	[4.45, 1.05, .95, 1.1, 1.1, 1.25, 1.0, 1.32, .9, 1.36],
	[4.0, .88, 1.12, 1.03, 1.36, 1.45, 1.22, 1.62, 1.0, 1.72],
	[3.5, .7, 1.25, .98, 1.5, 1.58, 1.34, 1.9, 1.08, 2.02],
	[2.9, .6, 1.3, .95, 1.55, 1.55, 1.4, 2.05, 1.15, 2.3],
	[-3.7, .6, 1.3, .95, 1.55, 1.55, 1.4, 2.05, 1.15, 2.3],
	[-4.15, .78, 1.28, 1.0, 1.52, 1.55, 1.38, 2.02, 1.13, 2.27],
]
const RAMP_HINGE := Vector3(0, -4.2, .9)

static func create(team: int = 0) -> Node3D:
	team = 1 if team == 1 else 0
	S.palette_team = team
	var root := Node3D.new()
	root.name = "amphibious_apc"
	var body := S.material("#73765a", 0.9)
	var dark := S.material("#262c29", 0.9)
	var metal := S.material("#565f51", 0.8, 0.15)
	var mark := S.material(MARK[team], 0.85)
	var lens := S.material("#d8d2b0", 0.3)

	hull(root, body, dark, metal, mark, lens)
	for s in [-1.0, 1.0]:
		for y in WHEELS:
			S.wheel(root, s * 1.33, y, .62, .62, dark, metal)
			S.box(root, Vector3(.4, 1.35, .1), Vector3(s * 1.3, y, 1.24), dark)    # wheel well shadow
		# Continuous buoyancy sponson over the wheels, tapered at both ends.
		S.box(root, Vector3(.38, 6.4, .34), Vector3(s * 1.5, -.28, 1.42), body)
		for end in [[2.95, 1.0], [-3.5, -1.0]]:
			var wedge := S.box(root, Vector3(.38, .8, .34), Vector3(s * 1.5, end[0] + end[1] * .3, 1.46), body)
			wedge.rotation.x = deg_to_rad(28.0 * end[1])
		S.box(root, Vector3(.03, 6.2, .04), Vector3(s * 1.7, -.28, 1.5), dark)  # sponson seam
	stern(root, body, dark, metal, mark, lens)
	roof(root, body, dark, metal)
	weapon_station(root, body, dark, metal)
	S.merge_stationary(root)
	return root

## Hull loft with flat plates: each triangle gets its own outward face normal.
static func hull(root: Node3D, body: Material, dark: Material, metal: Material, mark: Material, lens: Material) -> void:
	var rings := []
	var panels := []
	for h in HULL:
		var y: float = h[0]
		var ring := PackedVector3Array()
		# Keel, then round the right side from belly to roof and back down the left.
		for pt in [[0.0, h[1]], [h[2], h[3]], [h[4], h[5]], [h[6], h[7]], [h[8], h[9]], [0.0, h[9]], [-h[8], h[9]], [-h[6], h[7]], [-h[4], h[5]], [-h[2], h[3]]]:
			ring.append(Vector3(pt[0], y, pt[1]))
		rings.append(ring)
		panels.append([0.0, .5, 1.0, 1.5, 4.5, 5.0][panels.size()])
	var tris := L.loft_triangles(rings, true, true, panels)
	for t in tris:
		var n: Vector3 = (t[1][0] - t[0][0]).cross(t[2][0] - t[0][0]).normalized()
		var c: Vector3 = (t[0][0] + t[1][0] + t[2][0]) / 3.0
		if n.dot(c - Vector3(0, 1.45, c.z)) < 0.0 and absf(n.z) < .9: n = -n
		if absf(n.z) >= .9 and n.z * c.z < 0.0: n = -n  # bow and stern caps face out
		for v in t: v[1] = n
	L.build(root, tris, body)
	# Trim vane folded flat on the glacis, with hinge knuckles and a stiffening rib.
	var vane := S.box(root, Vector3(2.1, 1.05, .07), Vector3(0, 3.72, 1.98), body)
	vane.rotation.x = deg_to_rad(-26.0)
	for x in [-.8, 0.0, .8]:
		S.rod(root, Vector3(x - .15, 4.22, 1.63), Vector3(x + .15, 4.22, 1.63), .06, metal, 8)
	S.box(root, Vector3(1.9, .05, .06), Vector3(0, 3.55, 2.08), dark)
	# Headlight clusters, bow tow eyes, bilge outlets, plate seams, markers.
	for s in [-1.0, 1.0]:
		S.box(root, Vector3(.3, .08, .16), Vector3(s * .95, 4.28, 1.42), dark)
		S.box(root, Vector3(.1, .03, .1), Vector3(s * .88, 4.33, 1.42), lens)
		S.box(root, Vector3(.1, .03, .1), Vector3(s * 1.02, 4.33, 1.42), lens)
		S.rod(root, Vector3(s * .55, 4.42, 1.12), Vector3(s * .55, 4.62, 1.12), .07, metal, 8)
		S.rod(root, Vector3(s * 1.54, .2, 1.45), Vector3(s * 1.6, .2, 1.45), .06, dark, 8)
		S.box(root, Vector3(.02, 6.6, .03), Vector3(s * 1.47, -.4, 1.8), dark)     # upper hull weld line
		S.box(root, Vector3(.02, .5, .18), Vector3(s * 1.45, .6, 1.85), mark)       # side identifier
		S.rod(root, Vector3(s * 1.25, 1.9, 2.32), Vector3(s * 1.25, -1.2, 2.32), .025, metal)  # handrail
		for y in [1.9, .35, -1.2]: S.rod(root, Vector3(s * 1.25, y, 2.28), Vector3(s * 1.25, y, 2.32), .025, metal)

static func stern(root: Node3D, body: Material, dark: Material, metal: Material, mark: Material, lens: Material) -> void:
	# Rear ramp on its own hinge, with the troop door and its vision block.
	var ramp := Node3D.new()
	ramp.name = "ramp"
	ramp.position = S.point(RAMP_HINGE)
	root.add_child(ramp)
	var skin := Node3D.new()
	skin.position = -S.point(RAMP_HINGE)
	ramp.add_child(skin)
	S.box(skin, Vector3(2.0, .1, 1.3), Vector3(0, -4.22, 1.55), body)
	S.box(skin, Vector3(.7, .03, 1.05), Vector3(.35, -4.285, 1.6), dark)
	S.box(skin, Vector3(.6, .03, .95), Vector3(.35, -4.3, 1.6), body)
	S.box(skin, Vector3(.18, .03, .1), Vector3(.35, -4.32, 1.9), lens)
	S.box(skin, Vector3(.05, .05, .18), Vector3(.05, -4.33, 1.55), metal)
	S.box(skin, Vector3(.3, .03, .2), Vector3(-.6, -4.29, 1.95), mark)
	# Two shrouded propellers with rudders under the stern.
	for s in [-1.0, 1.0]:
		var shroud := []
		for st in [[-4.05, .42], [-4.2, .45], [-4.55, .45], [-4.66, .41]]:
			var ring := L.super_ring(st[0], st[1], st[1], .82, 16, 2.0)
			for k in range(ring.size()): ring[k].x += s * .95
			shroud.append(ring)
		L.loft(root, shroud, body, true, false, [0.0, .5, 1.5, 2.0])
		S.rod(root, Vector3(s * .95, -4.1, .82), Vector3(s * .95, -4.35, .82), .12, metal, 10)
		for k in range(4):
			var blade := S.box(root, Vector3(.08, .06, .7), Vector3(s * .95, -4.3, .82), dark)
			blade.rotation.z = TAU * k / 8.0
		S.box(root, Vector3(.05, .45, .7), Vector3(s * .95, -4.95, .82), metal)  # rudder
		S.box(root, Vector3(.3, .1, .25), Vector3(s * 1.25, -4.2, 1.95), dark)   # tail light cluster
		S.box(root, Vector3(.1, .03, .1), Vector3(s * 1.2, -4.26, 1.98), S.material("#a8302a", .4))
		S.rod(root, Vector3(s * .8, -4.15, 1.08), Vector3(s * .8, -4.4, 1.08), .07, metal, 8)  # tow pintle

static func roof(root: Node3D, body: Material, dark: Material, metal: Material) -> void:
	# Driver's hatch (front left) with three vision blocks.
	S.rod(root, Vector3(-.55, 2.35, 2.3), Vector3(-.55, 2.35, 2.4), .36, body, 16)
	S.rod(root, Vector3(-.55, 2.35, 2.4), Vector3(-.55, 2.35, 2.44), .3, body, 16)
	for k in range(3):
		var a := -.6 + k * .6
		S.box(root, Vector3(.16, .06, .1), Vector3(-.55 + sin(a) * .38, 2.35 + cos(a) * .38, 2.42), dark)
	# Commander's cupola with a ring of vision blocks.
	S.rod(root, Vector3(.55, 1.55, 2.3), Vector3(.55, 1.55, 2.5), .42, body, 16)
	S.rod(root, Vector3(.55, 1.55, 2.5), Vector3(.55, 1.55, 2.56), .34, body, 16)
	for k in range(6):
		var a := TAU * k / 6.0
		S.box(root, Vector3(.14, .06, .1), Vector3(.55 + sin(a) * .43, 1.55 + cos(a) * .43, 2.42), dark)
	# Engine intake and exhaust grilles (right), antennas, spare track-less jack mounts.
	S.box(root, Vector3(.8, 1.3, .08), Vector3(.65, -2.0, 2.33), dark)
	for k in range(7): S.box(root, Vector3(.75, .04, .05), Vector3(.65, -1.45 - k * .18, 2.38), metal)
	S.box(root, Vector3(.35, .9, .35), Vector3(1.35, -2.1, 2.1), body)
	S.box(root, Vector3(.05, .75, .25), Vector3(1.53, -2.1, 2.1), dark)
	S.box(root, Vector3(.7, 1.0, .08), Vector3(-.55, -2.6, 2.33), dark)
	for x in [-1.0, 1.0]:
		S.rod(root, Vector3(x * .95, -3.5, 2.3), Vector3(x * .95, -3.5, 4.1), .012, dark, 4)
		S.rod(root, Vector3(x * .95, -3.5, 2.28), Vector3(x * .95, -3.5, 2.42), .05, metal, 8)
	for k in range(4): S.box(root, Vector3(1.9, .04, .02), Vector3(0, 2.6 - k * 1.7, 2.31), dark)  # roof plate seams

static func weapon_station(root: Node3D, body: Material, dark: Material, metal: Material) -> void:
	# Remote weapon station: slew ring, cradle with sight box, M2 and ammo can,
	# smoke grenade launchers either side.
	var rws := Node3D.new()
	rws.name = "turret"
	rws.position = S.point(Vector3(0, .1, 2.3))
	root.add_child(rws)
	S.rod(rws, Vector3(0, 0, 0), Vector3(0, 0, .14), .45, metal, 20)
	S.box(rws, Vector3(.55, .6, .22), Vector3(0, -.05, .25), body)
	S.box(rws, Vector3(.28, .32, .26), Vector3(.35, .05, .45), body)             # sight
	S.box(rws, Vector3(.2, .03, .14), Vector3(.35, .22, .47), S.material("#1b252c", .3, .2))
	S.box(rws, Vector3(.14, .7, .16), Vector3(-.05, .05, .44), dark)            # receiver
	S.rod(rws, Vector3(-.05, .4, .46), Vector3(-.05, 1.55, .46), .03, dark, 8)   # barrel
	S.rod(rws, Vector3(-.05, 1.5, .46), Vector3(-.05, 1.6, .46), .045, dark, 8)  # flash hider
	S.box(rws, Vector3(.2, .3, .22), Vector3(-.28, -.05, .4), S.material("#4d5a3a", .85))
	for s in [-1.0, 1.0]:
		for k in range(4):
			S.rod(rws, Vector3(s * .35, .2, .2 + k * .07), Vector3(s * (.35 + .18), .38, .24 + k * .07), .035, dark, 6)
