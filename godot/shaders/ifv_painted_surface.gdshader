shader_type spatial;
render_mode diffuse_lambert;
uniform sampler2D surface_atlas : filter_linear_mipmap, repeat_enable;
varying vec3 part_position;
varying vec3 part_normal;

void vertex() {
	part_position = VERTEX;
	part_normal = NORMAL;
}

float grain(vec2 p) {
	// Body tile only, inset away from other material tiles. Deliberately sample
	// a coarse mip so bolts and atlas microdetail cannot become surface noise.
	vec2 uv = vec2(0.012) + fract(p) * 0.476;
	vec2 derivative = p * 0.476;
	return textureGrad(surface_atlas, uv, dFdx(derivative), dFdy(derivative)).r;
}

void fragment() {
	vec3 w = pow(abs(normalize(part_normal)), vec3(4.0));
	w /= max(w.x + w.y + w.z, 0.001);
	vec3 p = part_position * 0.31 + vec3(0.24, 0.43, 0.19);
	float broad = grain(p.zy) * w.x + grain(p.xz) * w.y + grain(p.xy) * w.z;
	vec3 macro_p = part_position * 0.082 + vec3(0.41,0.15,0.59);
	float macro = grain(macro_p.zy) * w.x + grain(macro_p.xz) * w.y + grain(macro_p.xy) * w.z;
	vec3 col = COLOR.rgb;
	// Authored atlas, broad mottling and face-local cavity remain in diffuse.
	// Large armor varies; fittings, barrels, lamps and glass stay clean.
	col *= 1.0 + clamp((broad - 0.5) * 1.65 + (macro - 0.5)*0.7, -0.22, 0.14) * UV.x;
	vec2 edge = min(UV2, vec2(1.0) - UV2);
	float d = min(edge.x, edge.y);
	// Broken contact-edge dodge: never outline every manufactured face white.
	float wear = (1.0 - smoothstep(0.004, 0.028, d)) * smoothstep(0.47, 0.58, broad);
	float cavity = smoothstep(0.012, 0.035, d) * (1.0 - smoothstep(0.035, 0.085, d));
	float paint_mask = step(0.5,UV.y);
	col *= 1.0 + wear * 0.18 * paint_mask - cavity * 0.13 * paint_mask;
	col *= mix(0.80, 1.0, smoothstep(-0.6, 0.2, part_normal.y));
	col *= mix(0.84, 1.0, smoothstep(0.25, 1.75, part_position.y));
	// The basket canvas gets broad folds, with no high-frequency cloth noise.
	if (UV.y > 3.5) {
		float fold = sin(UV2.x*18.0+sin(UV2.y*8.0)*0.7);
		col *= 0.93 + fold*0.06;
	}
	ALBEDO = col;
	ROUGHNESS = 0.9;
	METALLIC = 0.0;
	SPECULAR = 0.15;
}
