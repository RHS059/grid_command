shader_type spatial;
render_mode unshaded, blend_mix, depth_draw_never, cull_back;

// A white grazing-angle overlay retains the imported surface and its textures.
// Half opacity at the silhouette gives the reference rim at half intensity.
uniform vec4 rim_color : source_color = vec4(1.0, 1.0, 1.0, 1.0);
uniform float strength : hint_range(0.0, 1.0) = 0.5;

void fragment() {
	float facing = clamp(dot(normalize(NORMAL), normalize(VIEW)), 0.0, 1.0);
	float edge = pow(1.0 - facing, 3.0);
	ALBEDO = rim_color.rgb;
	ALPHA = edge * strength * rim_color.a;
}
