shader_type spatial;
render_mode diffuse_lambert, specular_schlick_ggx;

uniform sampler2D albedo_map : source_color, filter_linear_mipmap_anisotropic;

void fragment() {
	vec4 texel = texture(albedo_map, UV);
	vec3 source = texel.rgb;
	float hi = max(source.r, max(source.g, source.b));
	float lo = min(source.r, min(source.g, source.b));
	float chroma = hi - lo;
	float value = dot(source, vec3(0.299, 0.587, 0.114));
	// Preserve saturated team flashes, navigation lights, glass and very dark
	// hardware. Desaturate broad painted panels into operational aircraft grey.
	float painted_panel = (1.0 - smoothstep(0.075, 0.18, chroma))
		* smoothstep(0.10, 0.24, value) * (1.0 - smoothstep(0.82, 0.98, value));
	vec3 neutral = mix(vec3(value), vec3(0.43, 0.47, 0.49), 0.32);
	ALBEDO = mix(source, neutral, painted_panel);
	ALPHA = texel.a;
	METALLIC = 0.0;
	ROUGHNESS = 0.84;
	SPECULAR = 0.2;
}
