shader_type spatial;
render_mode diffuse_lambert, specular_schlick_ggx;

// Keep authored seams, cavities, edge dodge and large-island weathering.
// Warm/olive paint is recolored; cool glass, neutral rubber, lights and decals
// retain their source colors. No world-space noise or guessed UV island edges.
uniform sampler2D albedo_map : source_color, filter_linear_mipmap, repeat_enable;
uniform vec4 source_tint : source_color = vec4(1.0);
uniform vec3 source_mid : source_color = vec3(0.188, 0.22, 0.122);
uniform vec3 paint_mid : source_color = vec3(0.47, 0.447, 0.353);
uniform vec2 uv_scale = vec2(1.0);
uniform vec2 uv_offset = vec2(0.0);

void fragment() {
	vec3 original = texture(albedo_map, UV * uv_scale + uv_offset).rgb * source_tint.rgb;
	float lum = dot(original, vec3(0.299, 0.587, 0.114));
	float mid_lum = max(dot(source_mid, vec3(0.299, 0.587, 0.114)), 0.001);
	float olive = smoothstep(1.12, 1.5, original.g / max(original.b, 0.001));
	float warm = smoothstep(1.06, 1.35, original.r / max(original.b, 0.001));
	float not_red = 1.0 - smoothstep(1.8, 2.7, original.r / max(original.g, 0.001));
	float paint = olive * warm * not_red * smoothstep(0.003, 0.015, lum);
	vec3 recolored = paint_mid * clamp(lum / mid_lum, 0.16, 1.9);
	ALBEDO = mix(original, recolored, paint);
	ROUGHNESS = 0.9;
	METALLIC = 0.0;
	SPECULAR = 0.15;
}

