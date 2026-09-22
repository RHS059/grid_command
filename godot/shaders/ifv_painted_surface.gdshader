shader_type spatial;
render_mode diffuse_lambert;
uniform sampler2D surface_atlas : filter_linear_mipmap, repeat_enable;
uniform sampler2D tire_sheet : filter_linear_mipmap, repeat_disable;
varying vec3 part_position;
varying vec3 part_normal;

void vertex() {
	part_position = VERTEX;
	part_normal = NORMAL;
}

float grain(vec2 p) {
	// Body tile only, inset away from other material tiles. Deliberately sample
	// a coarse mip so bolts and atlas microdetail cannot become surface noise.
	return textureLod(surface_atlas, vec2(0.012) + fract(p) * 0.476, 3.0).r;
}

void fragment() {
	vec3 w = pow(abs(normalize(part_normal)), vec3(4.0));
	w /= max(w.x + w.y + w.z, 0.001);
	vec3 p = part_position * 0.17 + vec3(0.24, 0.43, 0.19);
	float broad = grain(p.zy) * w.x + grain(p.xz) * w.y + grain(p.xy) * w.z;
	vec3 col = COLOR.rgb;
	col *= 1.0 + clamp((broad - 0.5) * 1.7, -0.13, 0.1) * UV.x;
	vec2 edge = min(UV2, vec2(1.0) - UV2);
	float d = min(edge.x, edge.y);
	// Broken contact-edge dodge: never outline every manufactured face white.
	float wear = (1.0 - smoothstep(0.004, 0.028, d)) * smoothstep(0.47, 0.58, broad);
	float cavity = smoothstep(0.012, 0.035, d) * (1.0 - smoothstep(0.035, 0.085, d));
	col *= 1.0 + wear * 0.16 * UV.y - cavity * 0.11 * UV.y;
	col *= mix(0.88, 1.0, smoothstep(-0.6, 0.2, part_normal.y));
	if (UV.y > 1.5 && UV.y < 2.5) {
		vec4 wheel = texture(tire_sheet, vec2(UV2.x * 0.5, 0.5 + UV2.y * 0.5));
		vec3 rubber = vec3(0.09, 0.105, 0.10) * (0.4 + wheel.r * 1.2);
		col = mix(rubber, COLOR.rgb * wheel.r * 2.0, wheel.a);
	} else if (UV.y > 2.5) {
		float link = fract(part_position.z * 3.2);
		float joint = smoothstep(0.03, 0.10, link) * (1.0 - smoothstep(0.86, 0.98, link));
		col = COLOR.rgb * mix(0.52, 1.05, joint);
	}
	ALBEDO = col;
	ROUGHNESS = 0.9;
	METALLIC = 0.0;
	SPECULAR = 0.15;
}

