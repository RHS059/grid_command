shader_type spatial;
render_mode cull_disabled;

// PS2-era painted surface for code-built vehicles. Primitive meshes carry no
// authored UVs, so one tile of a 512 grey atlas is projected on three
// model-space axes. The grey is palette-swapped (Street Fighter style) through
// a three-colour ramp per material and team: 0 = shadow, 0.5 = base, 1 = light.
// UV2 holds face-local edge coordinates (written when parts are merged), which
// drive hand-painted style dodge on worn edges and burn in panel bands,
// undersides and near the ground.
uniform sampler2D atlas : filter_linear_mipmap, repeat_enable;
uniform vec4 region = vec4(0.0, 0.0, 0.5, 0.5);   // tile rect in atlas UV
uniform float tiles_per_unit = 0.22;
uniform float macro_scale = 0.055;                  // second, larger sample that breaks repeats
uniform vec3 ramp_dark : source_color = vec3(0.19, 0.2, 0.17);
uniform vec3 ramp_mid : source_color = vec3(0.45, 0.46, 0.35);
uniform vec3 ramp_light : source_color = vec3(0.66, 0.66, 0.53);
uniform float edge_width = 0.07;                    // worn edge band, model units
uniform float dodge = 0.32;
uniform float burn = 0.16;
uniform float roughness_value = 0.85;
uniform float metallic_value = 0.05;

varying vec3 model_pos;
varying vec3 model_normal;

void vertex() {
	model_pos = VERTEX;
	model_normal = NORMAL;
}

float sample_tile(vec2 p) {
	vec2 inset = vec2(2.0 / 512.0);
	vec2 uv = region.xy + inset + fract(p) * (region.zw - 2.0 * inset);
	// Gradients from the unwrapped coordinate avoid mip seams at tile edges.
	vec2 g = p * (region.zw - 2.0 * inset);
	return textureGrad(atlas, uv, dFdx(g), dFdy(g)).r;
}

float triplanar(vec3 p, vec3 w) {
	return sample_tile(p.zy) * w.x + sample_tile(p.xz) * w.y + sample_tile(p.xy) * w.z;
}

vec3 palette(float v) {
	return v < 0.5 ? mix(ramp_dark, ramp_mid, v * 2.0) : mix(ramp_mid, ramp_light, v * 2.0 - 1.0);
}

// Distance from this fragment to the nearest edge of its face, in model units.
float edge_distance(vec2 e) {
	vec2 dux = dFdx(e), duy = dFdy(e);
	vec3 dpx = dFdx(model_pos), dpy = dFdy(model_pos);
	float det = dux.x * duy.y - dux.y * duy.x;
	if (abs(det) < 1e-10) return 1e3;
	vec3 dpdu = (dpx * duy.y - dpy * dux.y) / det;
	vec3 dpdv = (dpy * dux.x - dpx * duy.x) / det;
	vec2 f = fract(e);
	vec2 d = min(f, 1.0 - f);
	return min(d.x * length(dpdu), d.y * length(dpdv));
}

void fragment() {
	vec3 n = normalize(model_normal);
	vec3 w = pow(abs(n), vec3(4.0));
	w /= w.x + w.y + w.z;
	float v = triplanar(model_pos * tiles_per_unit, w);
	// Large, offset sample of the same tile modulates brightness so repeats vanish.
	float macro = triplanar(model_pos * macro_scale + vec3(0.37, 0.61, 0.13), w);
	v = clamp(v * mix(1.0, macro * 2.0, 0.55), 0.0, 1.0);
	vec3 col = palette(v);
	float grime = v * 2.0;
	float e = edge_distance(UV2);
	float worn = 1.0 - smoothstep(0.0, edge_width, e);
	float band = smoothstep(edge_width * 0.6, edge_width * 1.6, e) * (1.0 - smoothstep(edge_width * 1.6, edge_width * 5.0, e));
	col *= 1.0 + dodge * worn * clamp(grime, 0.5, 1.4);
	col *= 1.0 - burn * band;
	// Cavity and road grime: undersides and parts near the ground darken.
	col *= mix(0.62, 1.0, smoothstep(-0.8, 0.2, n.y));
	col *= mix(0.72, 1.0, smoothstep(0.35, 1.7, model_pos.y));

	ALBEDO = col;
	ROUGHNESS = roughness_value;
	METALLIC = metallic_value;
}
