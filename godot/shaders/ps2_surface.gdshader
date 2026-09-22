shader_type spatial;
render_mode cull_disabled;

// PS2-era painted surface for code-built vehicles. Primitive meshes carry no
// authored UVs, so one tile of a 512 atlas is projected on three model-space
// axes. tint_mode recolors the body tile's grime for markings and decals.
// UV2 holds face-local edge coordinates (written when parts are merged), which
// drive hand-painted style dodge on worn edges and burn in panel bands,
// undersides and near the ground.
uniform sampler2D atlas : source_color, filter_linear_mipmap, repeat_enable;
uniform vec4 region = vec4(0.0, 0.0, 0.5, 0.5);   // tile rect in atlas UV
uniform float tiles_per_unit = 0.22;
uniform float macro_scale = 0.055;                  // second, larger sample that breaks repeats
uniform bool tint_mode = false;
uniform vec3 tint : source_color = vec3(1.0);
uniform vec3 tile_mean = vec3(0.44, 0.45, 0.34);    // body tile average colour
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

vec3 sample_tile(vec2 p) {
	vec2 inset = vec2(2.0 / 512.0);
	vec2 uv = region.xy + inset + fract(p) * (region.zw - 2.0 * inset);
	// Gradients from the unwrapped coordinate avoid mip seams at tile edges.
	vec2 g = p * (region.zw - 2.0 * inset);
	return textureGrad(atlas, uv, dFdx(g), dFdy(g)).rgb;
}

vec3 triplanar(vec3 p, vec3 w) {
	return sample_tile(p.zy) * w.x + sample_tile(p.xz) * w.y + sample_tile(p.xy) * w.z;
}

float luma(vec3 c) { return dot(c, vec3(0.299, 0.587, 0.114)); }

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
	vec3 col = triplanar(model_pos * tiles_per_unit, w);
	// Large, offset sample of the same tile modulates brightness so repeats vanish.
	vec3 macro = triplanar(model_pos * macro_scale + vec3(0.37, 0.61, 0.13), w);
	col *= mix(1.0, luma(macro) / luma(tile_mean), 0.55);
	if (tint_mode) col = tint * clamp(col / tile_mean, 0.6, 1.3);

	float grime = luma(col) / max(luma(tint_mode ? tint : tile_mean), 0.05);
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
