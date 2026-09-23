extends RefCounted
## Galaxy-B: C-5 Galaxy strategic airlifter, procedural, real scale.
## 75.5 m long, 67.9 m span, 19.85 m tall. High wing swept about 25 degrees with
## anhedral, four underwing turbofans, T-tail, upswept tail with rear doors,
## lifting visor nose, 28-wheel gear (four six-wheel main bogies in sponsons,
## four-wheel nose gear). Neutral grey; faction reads from the markings.
## Rigged for drive-through loading: nose visor, forward ramp, aft clamshell
## doors and aft ramp are pivot nodes; the "unload" clip opens both ends and
## drives two HEMTTs out. set_cargo_doors(model, t) poses the doors for gameplay.
## Coordinates: x right, y forward, z up (see aircraft_loft.gd).

const S := preload("res://scripts/browser_support_models.gd")
const L := preload("res://scripts/aircraft_loft.gd")
const BODY := "#5d6368"
const MARK := ["#54b7ff", "#ee777b"]
const P := 3.0  # boxy superellipse cargo fuselage
## [y, half width, half height, centre z]
## Nose: radome tip low, steep 45 degree windscreen slope up to a flat-topped flight deck.
## Fifth value: superellipse exponent, rounder at the radome, boxy along the hold.
const FUSELAGE := [[37.95,.2,.25,4.35,2.0],[37.7,.95,1.0,4.3,2.1],[37.2,1.75,1.85,4.35,2.3],[36.5,2.45,2.55,4.5,2.5],[35.6,2.95,3.2,4.8,2.7],[34.6,3.3,3.55,5.05,2.85],[33.3,3.48,3.75,5.2,3.0],[31.5,3.55,3.875,5.325,3.0],[30.0,3.55,3.9,5.35],[-16.0,3.55,3.9,5.35],[-22.0,3.3,3.55,5.9],[-28.0,2.65,2.85,6.85],[-33.0,1.85,2.05,7.75],[-36.6,1.0,1.2,8.35],[-37.8,.3,.4,8.6]]
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

	# Fuselage split into the fixed airframe and rigged cargo doors (see cargo_fuselage).
	cargo_fuselage(root, body, dark, metal)
	for s in [-1.0, 1.0]:
		var pod := []
		for st in [[5.0,.2,.5,1.9],[3.5,.75,.95,2.0],[-8.5,.75,.95,2.0],[-11.0,.2,.5,2.1]]:
			var ring := L.super_ring(st[0], st[1], st[2], st[3], 16, 2.6)
			for k in range(ring.size()): ring[k].x += s * 3.3
			pod.append(ring)
		L.loft(root, pod, body, true, true, [0.0,.5,3.5,4.0])
	flight_deck(root, body, dark, metal)
	for s in [-1.0, 1.0]:
		var a := 0.0 if s > 0 else PI
		L.body_decal(root, FUSELAGE, P, -12.5, -11.2, a + s * .05, a - s * .3, dark, 3, 3, .05)  # paratroop door
		for i in range(12):
			var y := 20.0 - i * 2.4
			L.body_decal(root, FUSELAGE, P, y, y - .45, a + s * .95, a + s * 1.02, glass, 1, 1, .05)  # upper-deck windows
		L.body_roundel(root, FUSELAGE, P, 14.0, a + s * .05, 1.2, 3.55, mark, .05)
	cargo(root, team)

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

## Flight deck and visor nose: framed interior-mapped windscreen (six front
## panes, eyebrows, side and aft side windows), visor hinge and split seams, darker
## radome, pitot probes, crew door with airstair, refuelling slipway, antennas.
static func flight_deck(root: Node3D, body: Material, dark: Material, metal: Material) -> void:
	var top := PI * .5
	var seal := S.material("#1d2224", 0.9)
	# Front panes step round the nose; eyebrow panes sit above on the roof curve.
	for s in [-1.0, 1.0]:
		var a := 0.0 if s > 0 else PI
		var edges := [.02, .24, .47, .7]
		for k in range(3):
			L.body_pane(root, FUSELAGE, P, 36.25, 35.25, top - s * edges[k], top - s * edges[k + 1], 1, seal, .03, .09, 1.2)
		for k in range(2):
			L.body_pane(root, FUSELAGE, P, 35.05, 34.45, top - s * (.06 + k * .24), top - s * (.26 + k * .24), 0, seal, .03, .08, 1.0)
		L.body_pane(root, FUSELAGE, P, 35.7, 34.55, a + s * .92, a + s * .78, 0, seal, .03, .09, 1.6)   # side window
		L.body_pane(root, FUSELAGE, P, 34.2, 33.35, a + s * 1.0, a + s * .84, 0, seal, .03, .08, 1.8)    # aft side window
		L.body_pane(root, FUSELAGE, P, 32.9, 32.25, a + s * 1.02, a + s * .88, 0, seal, .03, .07, 2.0)   # galley window
		# Visor: seam from the windscreen sill down and aft to the belly behind the nose gear.
		L.body_line(root, FUSELAGE, P, [[36.35, top - s * .72], [36.1, a + s * .75], [35.2, a + s * .1], [33.6, a - s * .7], [33.3, a - s * 1.4]], .1, dark, .03)
		L.body_line(root, FUSELAGE, P, [[36.35, top - s * .72], [36.35, top]], .1, dark, .03)
		L.body_line(root, FUSELAGE, P, [[36.9, a - s * .2], [36.1, a - s * .2]], .06, dark, .03)  # visor lock fairing
		var base := L.body_skin(FUSELAGE, 35.4, a + s * .3, P, 0.0)
		S.rod(root, base, base + Vector3(s * .12, .9, 0), .035, metal, 6)  # pitot
		S.box(root, Vector3(.08, .5, .06), L.body_skin(FUSELAGE, 34.0, a - s * .25, P, .04), S.material("#3f8a4a" if s > 0 else "#a8302a", .5))  # formation light
	# Crew entry door (left, forward) with its window and the airstair door below.
	L.body_line(root, FUSELAGE, P, [[30.2, PI - .05], [28.9, PI - .05], [28.9, PI + .55], [30.2, PI + .55], [30.2, PI - .05]], .07, dark, .03)
	L.body_pane(root, FUSELAGE, P, 29.95, 29.4, PI - .02, PI + .15, 0, seal, .035, .05, 1.5)
	L.body_line(root, FUSELAGE, P, [[30.2, PI + .62], [28.9, PI + .62], [28.9, PI + 1.05], [30.2, PI + 1.05], [30.2, PI + .62]], .06, dark, .03)
	for s in [-1.0, 1.0]:
		var a := 0.0 if s > 0 else PI
		L.body_line(root, FUSELAGE, P, [[-11.2, a - s * .05], [-12.5, a - s * .05], [-12.5, a - s * .45], [-11.2, a - s * .45], [-11.2, a - s * .05]], .07, dark, .05)  # paratroop door
		L.body_pane(root, FUSELAGE, P, -11.45, -11.9, a - s * .12, a - s * .02, 0, seal, .05, .04, 2.0)
	# Air-refuelling slipway on the roof behind the flight deck, with guide lines.
	L.body_decal(root, FUSELAGE, P, 32.4, 31.2, top - .12, top + .12, dark, 4, 3, .03)
	for s in [-1.0, 1.0]:
		L.body_line(root, FUSELAGE, P, [[31.2, top - s * .12], [29.2, top - s * .02]], .06, S.material("#c9c6b4", .85), .03)
	for y in [27.0, 18.0]: S.box(root, Vector3(.06, .9, .6), Vector3(0, y, 9.5), dark)  # antennas
	# Nose gear doors stand open either side of the four-wheel nose leg.
	for s in [-1.0, 1.0]:
		S.box(root, Vector3(.05, 3.2, 1.2), Vector3(s * .95, 31.0, .95), body)

## Stations densified so door cuts follow the skin closely (the loft is linear
## between stations, so this does not change the surface).
static func dense_stations(stations: Array, step: float) -> Array:
	var out := []
	for k in range(stations.size() - 1):
		var a: Array = stations[k]
		var b: Array = stations[k + 1]
		var n := maxi(1, ceili(absf(a[0] - b[0]) / step))
		for j in range(n):
			var t := float(j) / n
			var row := []
			for f in range(5):
				row.append(lerpf(a[f] if f < a.size() else P, b[f] if f < b.size() else P, t))
			out.append(row)
	var last: Array = stations[-1].duplicate()
	if last.size() < 5: last.append(P)
	out.append(last)
	return out

const VISOR_HINGE := Vector3(0, 36.35, 7.0)
const NOSE_RAMP_HINGE := Vector3(0, 33.35, 1.6)
const AFT_RAMP_HINGE := Vector3(0, -17.8, 1.62)
const FLOOR_Z := 1.6

## Which rigged part a fuselage quad (centre c, browser coords) belongs to.
static func door_part(c: Vector3) -> String:
	var cut := 33.2 + clampf((c.z - 1.4) / 5.5, 0.0, 1.0) * 3.2
	if c.y > cut and c.z < 7.05: return "visor"
	if c.y < -17.8 and c.y > -30.5 and c.z < 6.9:
		if c.y > -23.2 and absf(c.x) < 2.2 and c.z < 3.4: return "aft-ramp"
		return "clamshell-right" if c.x > 0.0 else "clamshell-left"
	return "airframe"

## Pivot node at a browser-space hinge with a holder that keeps child geometry
## in airframe coordinates.
static func pivot(root: Node3D, name: String, hinge: Vector3) -> Node3D:
	var p := Node3D.new()
	p.name = name
	p.position = S.point(hinge)
	root.add_child(p)
	var holder := Node3D.new()
	holder.name = "skin"
	holder.position = -S.point(hinge)
	p.add_child(holder)
	return holder

static func cargo_fuselage(root: Node3D, body: Material, dark: Material, metal: Material) -> void:
	var stations := dense_stations(FUSELAGE, 1.2)
	var rings := []
	for st in stations: rings.append(L.super_ring(st[0], st[1], st[2], st[3], 28, st[4]))
	var panels := []
	for st in stations: panels.append(st[0] * .25)
	var part := func(r: int, i: int, ring_set: Array) -> String:
		var n: int = ring_set[r].size()
		var c: Vector3 = (ring_set[r][i] + ring_set[r][(i + 1) % n] + ring_set[r + 1][i] + ring_set[r + 1][(i + 1) % n]) * .25
		return door_part(c)
	var holders := {
		"airframe": root,
		"visor": pivot(root, "visor-pivot", VISOR_HINGE),
		"aft-ramp": pivot(root, "aft-ramp-pivot", AFT_RAMP_HINGE),
		"clamshell-right": pivot(root, "clamshell-right-pivot", Vector3(2.7, -24.5, 6.9)),
		"clamshell-left": pivot(root, "clamshell-left-pivot", Vector3(-2.7, -24.5, 6.9)),
	}
	for key in holders:
		var k: String = key
		L.loft(holders[k], rings, body, true, false, panels, func(r, i): return part.call(r, i, rings) != k)
	# Hold: dark liner with the same openings, floor, ramp decks and the nose ramp.
	var hold := S.material("#3a3f3c", .95)
	var inner := []
	var inner_panels := []
	for st in stations:
		if st[0] < 34.6 and st[0] > -31.5:
			inner.append(L.super_ring(st[0], st[1] - .18, st[2] - .18, st[3], 28, st[4]))
			inner_panels.append(0.0)
	L.loft(root, inner, hold, true, false, [], func(r, i): return part.call(r, i, inner) != "airframe")
	S.box(root, Vector3(5.6, 51.0, .12), Vector3(0, 7.7, FLOOR_Z - .06), metal)
	# Aft ramp deck lies along the upswept belly (10 degrees) when stowed.
	var deck := S.box(holders["aft-ramp"], Vector3(4.2, 5.4, .15), AFT_RAMP_HINGE + Vector3(0, -2.66, .6), metal)
	deck.rotation.x = deg_to_rad(-10.0)
	for k in range(6):
		var d := .6 + k * .8
		S.box(holders["aft-ramp"], Vector3(3.8, .06, .04), AFT_RAMP_HINGE + Vector3(0, -d, .18 + d * .176), dark)  # treads
	var nose_ramp := pivot(root, "nose-ramp-pivot", NOSE_RAMP_HINGE)
	S.box(nose_ramp, Vector3(4.2, 5.2, .15), NOSE_RAMP_HINGE + Vector3(0, 2.6, .07), metal)
	for k in range(6):
		S.box(nose_ramp, Vector3(3.8, .06, .04), NOSE_RAMP_HINGE + Vector3(0, .5 + k * .8, .17), dark)
	set_cargo_doors(root, 0.0)

## Pose the cargo doors: 0 closed, 1 fully open (both ends).
static func set_cargo_doors(model: Node3D, t: float) -> void:
	var angles := door_angles(t)
	for key in angles:
		var node := model.get_node_or_null(key)
		if node != null: node.rotation = angles[key]

static func door_angles(t: float) -> Dictionary:
	var e := func(a: float, b: float) -> float: return clampf((t - a) / (b - a), 0.0, 1.0)
	return {
		"visor-pivot": Vector3(1.9 * e.call(0.0, .6), 0, 0),
		"nose-ramp-pivot": Vector3(lerpf(PI * .5, -.3, e.call(.45, 1.0)), 0, 0),
		"aft-ramp-pivot": Vector3(.49 * e.call(.35, 1.0), 0, 0),
		# Clamshells swing up and out about hinges along their top edges.
		"clamshell-right-pivot": Vector3(0, 0, 1.35 * e.call(0.0, .6)),
		"clamshell-left-pivot": Vector3(0, 0, -1.35 * e.call(0.0, .6)),
	}

## Cargo and the "unload" clip: doors open, then a container HEMTT drives out
## down the aft ramp and a troop HEMTT out through the nose.
static func cargo(root: Node3D, team: int) -> void:
	var aft: Node3D = S.create("TRUCK", team)
	aft.name = "cargo-aft"
	root.add_child(aft)
	var fwd: Node3D = S.create("TROOP_HEMTT", team)
	fwd.name = "cargo-forward"
	root.add_child(fwd)
	S.palette_team = team
	var anim := Animation.new()
	anim.length = 18.0
	for key in door_angles(0.0):
		var track := anim.add_track(Animation.TYPE_VALUE)
		anim.track_set_path(track, NodePath("%s:rotation" % key))
		for k in range(9):
			var time := 1.0 + k * .5
			anim.track_insert_key(track, time, door_angles(k / 8.0)[key])
		anim.track_insert_key(track, 0.0, door_angles(0.0)[key])
	# [time, browser y, z, pitch]: rolls to the ramp, pitches down it, rolls clear.
	var drive := func(node: String, yaw: float, keys: Array) -> void:
		var pos := anim.add_track(Animation.TYPE_VALUE)
		var rot := anim.add_track(Animation.TYPE_VALUE)
		anim.track_set_path(pos, NodePath("%s:position" % node))
		anim.track_set_path(rot, NodePath("%s:rotation" % node))
		for key in keys:
			anim.track_insert_key(pos, key[0], S.point(Vector3(0, key[1], key[2])))
			anim.track_insert_key(rot, key[0], Vector3(key[3], yaw, 0))
	drive.call("cargo-aft", PI, [[0.0, -6.0, FLOOR_Z, 0.0], [5.5, -6.0, FLOOR_Z, 0.0], [8.5, -13.5, FLOOR_Z, 0.0], [10.5, -20.3, .8, -.32], [12.5, -27.5, 0.0, 0.0], [14.0, -33.0, 0.0, 0.0]])
	drive.call("cargo-forward", 0.0, [[0.0, 21.0, FLOOR_Z, 0.0], [9.0, 21.0, FLOOR_Z, 0.0], [12.0, 29.5, FLOOR_Z, 0.0], [14.0, 35.8, .8, -.3], [16.0, 42.5, 0.0, 0.0], [17.5, 47.0, 0.0, 0.0]])
	var library := AnimationLibrary.new()
	library.add_animation("unload", anim)
	var player := AnimationPlayer.new()
	player.name = "AnimationPlayer"
	player.add_animation_library("", library)
	root.add_child(player)
	aft.position = S.point(Vector3(0, -6.0, FLOOR_Z))
	aft.rotation.y = PI
	fwd.position = S.point(Vector3(0, 21.0, FLOOR_Z))

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
