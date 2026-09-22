shader_type spatial;
render_mode cull_back;

// Interior-mapped vehicle cab glass. A box room is ray-traced behind a flat
// quad (UV 0..1), so seats, dashboard and the far window shift with parallax.
uniform vec3 tint : source_color = vec3(0.16, 0.24, 0.30);
uniform float aspect = 1.0;      // pane width / height
uniform float depth = 1.4;       // room depth in pane heights
uniform int kind = 0;            // 0 = side window, 1 = windscreen
uniform float frame = 0.045;     // dark rubber seal width in UV

float box2(vec2 p, vec2 lo, vec2 hi) {
	return step(lo.x, p.x) * step(p.x, hi.x) * step(lo.y, p.y) * step(p.y, hi.y);
}

void fragment() {
	vec3 v = -VIEW;
	vec3 rd = vec3(dot(v, TANGENT), -dot(v, BINORMAL), max(dot(v, -NORMAL), 0.05));
	vec3 p0 = vec3(UV.x * aspect, 1.0 - UV.y, 0.0);
	vec3 size = vec3(aspect, 1.0, depth);
	vec3 t3 = (mix(vec3(0.0), size, step(vec3(0.0), rd)) - p0) / rd;
	float t = min(min(t3.x, t3.y), t3.z);
	vec3 hit = p0 + rd * t;

	// Cab shell: olive-grey walls, dark floor, lighter headliner.
	vec3 col = vec3(0.27, 0.28, 0.24);
	if (hit.y < 0.002) col = vec3(0.10, 0.10, 0.09);
	else if (hit.y > 0.998) col = vec3(0.40, 0.40, 0.35);
	else if (hit.z > depth - 0.002) {
		// Opposite glass shows daylight in its upper half.
		col = mix(vec3(0.20, 0.20, 0.17), vec3(0.55, 0.66, 0.72), step(0.48, hit.y) * box2(hit.xy, vec2(0.08 * aspect, 0.0), vec2(0.92 * aspect, 0.92)));
	}
	col *= 0.75 + 0.25 * hit.y;

	// Seats: backrest and headrest on a mid-depth plane.
	float zs = depth * (kind == 1 ? 0.72 : 0.55);
	float ts = zs / rd.z;
	if (ts < t) {
		vec2 s = (p0 + rd * ts).xy;
		float cx = 0.5 * aspect;
		float seat = box2(s, vec2(cx - 0.26, 0.0), vec2(cx + 0.26, 0.58)) + box2(s, vec2(cx - 0.14, 0.64), vec2(cx + 0.14, 0.8));
		if (seat > 0.5) { col = vec3(0.30, 0.22, 0.14) * (0.7 + 0.5 * s.y); t = ts; }
	}
	// Windscreen: dashboard with gauges in the foreground.
	if (kind == 1) {
		float td = depth * 0.16 / rd.z;
		vec2 d = (p0 + rd * td).xy;
		if (td < t && d.y < 0.3) {
			col = vec3(0.06, 0.065, 0.06);
			vec2 g = vec2(fract(d.x * 5.0 / aspect) - 0.5, d.y - 0.2);
			col += vec3(0.55, 0.42, 0.18) * (1.0 - smoothstep(0.08, 0.1, length(g * vec2(1.0, 3.0))));
		}
	}

	float edge = min(min(UV.x * aspect, (1.0 - UV.x) * aspect), min(UV.y, 1.0 - UV.y));
	float seal = step(edge, frame);
	ALBEDO = mix(mix(col, tint, 0.12), vec3(0.03), seal);
	EMISSION = col * 0.6 * (1.0 - seal);
	ROUGHNESS = mix(0.06, 0.8, seal);
	METALLIC = 0.25;
	SPECULAR = 0.7;
}
