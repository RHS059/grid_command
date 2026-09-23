extends RefCounted
## Shared helpers for procedural aircraft: smooth lofts with UV2 panel seams for
## ps2_surface, NACA-style sections, and skin-conforming decals for markings.
## Browser coordinates: x right, y forward, z up.

const S := preload("res://scripts/browser_support_models.gd")
## Markings are built on the lofted surface itself (same interpolation as the
## loft, lifted 6 mm along the surface), so they never float off the skin.
static func half_thickness(s: float, chord: float, ratio: float) -> float:
	return maxf(5.0 * ratio * chord * (.2969*sqrt(s) - .126*s - .3516*s*s + .2843*s*s*s - .1036*s*s*s*s), .004 * chord)

## Surface point between loft stations: station[0] is the span coordinate.
static func skin(stations: Array, span: float, y: float, side: float, lift := .006) -> Vector3:
	var i := 0
	while i < stations.size() - 2 and span > stations[i+1][0]: i += 1
	var a: Array = stations[i]
	var b: Array = stations[i+1]
	var t := clampf((span - a[0]) / (b[0] - a[0]), 0.0, 1.0)
	var le := lerpf(a[1], b[1], t)
	var chord := lerpf(a[2], b[2], t)
	var s := clampf((le - y) / chord, 0.0, 1.0)
	var thick := lerpf(half_thickness(s, a[2], a[3]), half_thickness(s, b[2], b[3]), t) + lift
	return Vector3(span, y, side * thick)

## Thin patch through the given skin points, facing out.
static func decal(root: Node3D, rings: Array, mat: Material, out: Vector3, closed := true) -> void:
	var st := SurfaceTool.new()
	st.begin(Mesh.PRIMITIVE_TRIANGLES)
	var count: int = rings[0].size()
	var normal := S.point(out)
	for r in range(rings.size() - 1):
		for i in range(count if closed else count - 1):
			var n := (i + 1) % count
			for tri in [[rings[r][i], rings[r][n], rings[r+1][n]], [rings[r][i], rings[r+1][n], rings[r+1][i]]]:
				emit(st, [[S.point(tri[0]), normal, Vector2(.5, .5)], [S.point(tri[1]), normal, Vector2(.5, .5)], [S.point(tri[2]), normal, Vector2(.5, .5)]])
	var node := MeshInstance3D.new()
	node.mesh = st.commit()
	node.material_override = mat
	root.add_child(node)

## Adds one triangle of [position, normal, uv2] vertices, wound so its front face
## matches the normals (Godot fronts are clockwise); double-sided shaders flip
## back-face normals, so mirrored parts would otherwise light as if inside out.
static func emit(st: SurfaceTool, v: Array) -> void:
	var face: Vector3 = (v[1][0] - v[0][0]).cross(v[2][0] - v[0][0])
	if face.dot(v[0][1] + v[1][1] + v[2][1]) > 0.0: v = [v[0], v[2], v[1]]
	for p in v:
		st.set_normal(p[1])
		st.set_uv2(p[2])
		st.add_vertex(p[0])

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
## skip(r, i) -> true leaves that quad out (door openings); ring index i maps to
## angle TAU * (i + .5) / count on super_ring rings.
static func loft(parent: Node3D, rings: Array, mat: Material, closed: bool, caps: bool, panels: Array = [], skip: Callable = Callable()) -> MeshInstance3D:
	return build(parent, loft_triangles(rings, closed, caps, panels, skip), mat)

## Loft as a triangle list: each triangle is three [native position, normal, uv2].
static func loft_triangles(rings: Array, closed: bool, caps: bool, panels: Array = [], skip: Callable = Callable()) -> Array:
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
	var tris := []
	var segments := count if closed else count - 1
	var vert := func(r: int, i: int) -> Array:
		var ii: int = i % count
		# One seam along the underside (x = 1 at three quarters round); seams across at integer panels[r].
		return [grid[r][ii], normals[r][ii], Vector2(float(i) / segments + .25, panels[r]) if panels.size() == grid.size() else Vector2(.5, .5)]
	for r in range(grid.size() - 1):
		for i in range(segments):
			if skip.is_valid() and skip.call(r, i): continue
			tris.append([vert.call(r, i), vert.call(r, i + 1), vert.call(r + 1, i + 1)])
			tris.append([vert.call(r, i), vert.call(r + 1, i + 1), vert.call(r + 1, i)])
	if caps and closed:
		for r in [0, grid.size() - 1]:
			var centre := Vector3.ZERO
			for p in grid[r]: centre += p
			centre /= count
			var nrm: Vector3 = (grid[r][0] - grid[r][count/2]).cross(grid[r][count/4] - grid[r][0]).normalized()
			var other: Vector3 = grid[1 if r == 0 else r - 1][0]
			if nrm.dot(centre - other) < 0.0: nrm = -nrm
			for i in range(count):
				tris.append([[centre, nrm, Vector2(.5, .5)], [grid[r][i], nrm, Vector2(.5, .5)], [grid[r][(i + 1) % count], nrm, Vector2(.5, .5)]])
	return tris

static func build(parent: Node3D, tris: Array, mat: Material) -> MeshInstance3D:
	var st := SurfaceTool.new()
	st.begin(Mesh.PRIMITIVE_TRIANGLES)
	for t in tris: emit(st, t)
	var node := MeshInstance3D.new()
	node.mesh = st.commit()
	node.material_override = mat
	parent.add_child(node)
	return node

## Splits triangles by a linear test f(browser point) -> float. Returns
## [pieces where f >= 0, pieces where f < 0]; cut edges interpolate position,
## normal and uv2, so door seams follow straight clean lines across the skin.
static func split(tris: Array, f: Callable) -> Array:
	var inside := []
	var outside := []
	for tri in tris:
		var d := []
		for v in tri: d.append(f.call(Vector3(v[0].x, -v[0].z, v[0].y)))
		if d.min() >= 0.0:
			inside.append(tri)
			continue
		if d.max() < 0.0:
			outside.append(tri)
			continue
		var pos := []
		var neg := []
		for k in range(3):
			var a: Array = tri[k]
			var b: Array = tri[(k + 1) % 3]
			var da: float = d[k]
			var db: float = d[(k + 1) % 3]
			(pos if da >= 0.0 else neg).append(a)
			if (da >= 0.0) != (db >= 0.0):
				var t := da / (da - db)
				var m := [a[0].lerp(b[0], t), a[1].lerp(b[1], t).normalized(), a[2].lerp(b[2], t)]
				pos.append(m)
				neg.append(m)
		for poly in [[pos, inside], [neg, outside]]:
			var pts: Array = poly[0]
			for k in range(1, pts.size() - 1): poly[1].append([pts[0], pts[k], pts[k + 1]])
	return [inside, outside]

## Region = all tests >= 0. Returns [pieces inside the region, the rest].
static func carve(tris: Array, tests: Array) -> Array:
	var rest := []
	var cur := tris
	for f in tests:
		var parts := split(cur, f)
		cur = parts[0]
		rest.append_array(parts[1])
	return [cur, rest]


## Point on a superellipse fuselage between [y, half width, half height, centre z,
## optional exponent] stations (as lofted), at angle a (0 = right side, PI/2 = top), lifted off the skin.
static func body_skin(stations: Array, y: float, a: float, p: float, lift := .01) -> Vector3:
	var i := 0
	while i < stations.size() - 2 and y < stations[i+1][0]: i += 1
	var s0: Array = stations[i]
	var s1: Array = stations[i+1]
	var t := clampf((y - s0[0]) / (s1[0] - s0[0]), 0.0, 1.0)
	var w := lerpf(s0[1], s1[1], t)
	var h := lerpf(s0[2], s1[2], t)
	var zc := lerpf(s0[3], s1[3], t)
	p = lerpf(s0[4] if s0.size() > 4 else p, s1[4] if s1.size() > 4 else p, t)  # optional per-station exponent
	var c := cos(a)
	var s := sin(a)
	var local := Vector2(w * signf(c) * pow(absf(c), 2.0/p), h * signf(s) * pow(absf(s), 2.0/p))
	local += local.normalized() * lift
	return Vector3(local.x, y, zc + local.y)

## Decal patch on a fuselage: y range by angle range, grid nu x nv.
static func body_decal(root: Node3D, stations: Array, p: float, y0: float, y1: float, a0: float, a1: float, mat: Material, nu := 6, nv := 6, lift := .01) -> void:
	var rings := []
	for j in range(nv + 1):
		var ring := PackedVector3Array()
		for k in range(nu + 1):
			ring.append(body_skin(stations, lerpf(y0, y1, float(j) / nv), lerpf(a0, a1, float(k) / nu), p, lift))
		rings.append(ring)
	var mid := (a0 + a1) * .5
	decal(root, rings, mat, Vector3(cos(mid), 0, sin(mid)), false)

## Round decal on a fuselage side (radius in metres, approximately).
static func body_roundel(root: Node3D, stations: Array, p: float, y: float, a: float, radius: float, half_width: float, mat: Material, lift := .01) -> void:
	var rings := []
	for r in [radius, radius * .5, 0.001]:
		var ring := PackedVector3Array()
		for k in range(20):
			var t := TAU * k / 20.0
			ring.append(body_skin(stations, y + cos(t) * r, a + sin(t) * r / half_width, p, lift))
		rings.append(ring)
	decal(root, rings, mat, Vector3(cos(a), 0, sin(a)))

static var cab_materials: Dictionary = {}

## Glazed window on a fuselage between two stations and two angles: a patch that
## follows the skin (lifted slightly), mapped with the HEMTT interior cab shader
## (kind 1 = windscreen with dash, 0 = side glass) and edged with a rubber seal
## that also follows the skin. UVs run left-right, top-bottom as seen from outside.
static func body_pane(parent: Node3D, stations: Array, p: float, y0: float, y1: float, a0: float, a1: float, kind: int, frame_mat: Material, lift := .015, frame := .05, depth := 1.4) -> void:
	var nu := 6
	var nv := 4
	var grid := []
	for j in range(nv + 1):
		var row := []
		for k in range(nu + 1):
			var y := lerpf(y1, y0, float(j) / nv)
			var a := lerpf(a0, a1, float(k) / nu)
			var at := body_skin(stations, y, a, p, lift)
			row.append([S.point(at), S.point((body_skin(stations, y, a, p, lift + .1) - at).normalized())])
		grid.append(row)
	var c: Array = grid[nv / 2][nu / 2]
	var n: Vector3 = c[1]
	var up := Vector3.UP - n * n.y
	if up.length() < .2: up = Vector3(0, 0, -1) - n * -n.z
	up = up.normalized()
	var right := (-n).cross(up).normalized()
	var xs := []
	var ys := []
	for row in grid:
		for v in row:
			xs.append((v[0] - c[0]).dot(right))
			ys.append((v[0] - c[0]).dot(up))
	var w: float = xs.max() - xs.min()
	var h: float = ys.max() - ys.min()
	var key := "%d:%.1f:%.1f" % [kind, w / h, depth]
	if not cab_materials.has(key):
		var m := ShaderMaterial.new()
		m.shader = preload("res://shaders/cab_interior.gdshader")
		m.set_shader_parameter("aspect", w / h)
		m.set_shader_parameter("kind", kind)
		m.set_shader_parameter("depth", depth)
		m.set_shader_parameter("frame", 0.0)
		cab_materials[key] = m
	var st := SurfaceTool.new()
	st.begin(Mesh.PRIMITIVE_TRIANGLES)
	var vert := func(j: int, k: int) -> Array:
		var v: Array = grid[j][k]
		var d: Vector3 = v[0] - c[0]
		return [v[0], v[1], Vector2((d.dot(right) - xs.min()) / w, 1.0 - (d.dot(up) - ys.min()) / h)]
	for j in range(nv):
		for k in range(nu):
			for tri in [[vert.call(j, k), vert.call(j, k + 1), vert.call(j + 1, k + 1)], [vert.call(j, k), vert.call(j + 1, k + 1), vert.call(j + 1, k)]]:
				var t: Array = tri
				var face: Vector3 = (t[1][0] - t[0][0]).cross(t[2][0] - t[0][0])
				if face.dot(t[0][1]) > 0.0: t = [t[0], t[2], t[1]]
				for v in t:
					st.set_normal(v[1])
					st.set_uv(v[2])
					st.add_vertex(v[0])
	st.generate_tangents()
	var node := MeshInstance3D.new()
	node.mesh = st.commit()
	node.material_override = cab_materials[key]
	parent.add_child(node)
	if frame > 0.0:
		body_line(parent, stations, p, [[y0, a0], [y0, a1], [y1, a1], [y1, a0], [y0, a0]], frame, frame_mat, lift + .004)

## Thin strip along a polyline of [y, angle] points on a fuselage (seams, door edges).
static func body_line(root: Node3D, stations: Array, p: float, points: Array, width: float, mat: Material, lift := .012) -> void:
	var st := SurfaceTool.new()
	st.begin(Mesh.PRIMITIVE_TRIANGLES)
	for k in range(points.size() - 1):
		var a: Array = points[k]
		var b: Array = points[k + 1]
		for j in range(8):
			var t0 := j / 8.0
			var t1 := (j + 1) / 8.0
			var p0 := body_skin(stations, lerpf(a[0], b[0], t0), lerpf(a[1], b[1], t0), p, lift)
			var p1 := body_skin(stations, lerpf(a[0], b[0], t1), lerpf(a[1], b[1], t1), p, lift)
			var out := (body_skin(stations, lerpf(a[0], b[0], t0), lerpf(a[1], b[1], t0), p, lift + .1) - p0).normalized()
			var side := (p1 - p0).cross(out).normalized() * width * .5
			var nrm := S.point(out)
			emit(st, [[S.point(p0 - side), nrm, Vector2(.5, .5)], [S.point(p0 + side), nrm, Vector2(.5, .5)], [S.point(p1 + side), nrm, Vector2(.5, .5)]])
			emit(st, [[S.point(p0 - side), nrm, Vector2(.5, .5)], [S.point(p1 + side), nrm, Vector2(.5, .5)], [S.point(p1 - side), nrm, Vector2(.5, .5)]])
	var node := MeshInstance3D.new()
	node.mesh = st.commit()
	node.material_override = mat
	root.add_child(node)
