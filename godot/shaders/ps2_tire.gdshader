shader_type spatial;
render_mode cull_disabled;

// Shared 512 tire sheet (CylinderMesh UVs): grey detail in red, rim mask in
// alpha. Rubber keeps a neutral ramp; the painted rim takes the team palette.
uniform sampler2D sheet : filter_linear_mipmap;
uniform vec3 rubber_dark : source_color = vec3(0.05, 0.055, 0.06);
uniform vec3 rubber_mid : source_color = vec3(0.14, 0.157, 0.165);
uniform vec3 rubber_light : source_color = vec3(0.3, 0.3, 0.28);
uniform vec3 ramp_dark : source_color = vec3(0.19, 0.2, 0.17);
uniform vec3 ramp_mid : source_color = vec3(0.37, 0.38, 0.29);
uniform vec3 ramp_light : source_color = vec3(0.6, 0.6, 0.48);

vec3 ramp(float v, vec3 d, vec3 m, vec3 l) {
	return v < 0.5 ? mix(d, m, v * 2.0) : mix(m, l, v * 2.0 - 1.0);
}

void fragment() {
	vec4 s = texture(sheet, UV);
	ALBEDO = mix(ramp(s.r, rubber_dark, rubber_mid, rubber_light), ramp(s.r, ramp_dark, ramp_mid, ramp_light), step(0.5, s.a));
	ROUGHNESS = mix(0.95, 0.8, s.a);
}
