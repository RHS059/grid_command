shader_type spatial;
render_mode diffuse_lambert, specular_schlick_ggx;
uniform sampler2D albedo_map : source_color, filter_linear_mipmap_anisotropic;
uniform vec3 paint_color : source_color = vec3(0.47, 0.447, 0.353);
uniform vec3 source_mid : source_color = vec3(0.208, 0.251, 0.247);
uniform bool paint_group = false;

void fragment() {
	vec3 source = texture(albedo_map, UV).rgb;
	float hi = max(source.r, max(source.g, source.b));
	float lo = min(source.r, min(source.g, source.b));
	float value = dot(source, vec3(0.299, 0.587, 0.114));
	// Work in linear color. Preserve near-black glass/waterline, bright marks,
	// and saturated lamps. Structural group selection excludes decks/weapons.
	float neutral = 1.0 - smoothstep(0.35, 0.55, (hi - lo) / max(hi, 0.001));
	float reference = dot(source_mid, vec3(0.299, 0.587, 0.114));
	float ratio = value / max(reference, 0.001);
	float midtone = smoothstep(0.22, 0.5, ratio) * (1.0 - smoothstep(1.6, 2.5, ratio));
	float mask = (paint_group ? 1.0 : 0.0) * neutral * midtone;
	// Authored atlas values retain their panel seams, cavities and broad dirt.
	vec3 painted = paint_color * clamp(ratio, 0.35, 1.5);
	ALBEDO = mix(source, painted, mask);
	METALLIC = 0.0;
	ROUGHNESS = 0.88;
	SPECULAR = 0.18;
}

