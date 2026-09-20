shader_type spatial;
render_mode unshaded, blend_mix, depth_draw_never, cull_back;

uniform vec4 team_color : source_color = vec4(0.2, 0.65, 1.0, 1.0);
uniform float strength : hint_range(0.0, 0.3) = 0.1;

void fragment() {
	float edge = pow(1.0 - clamp(dot(normalize(NORMAL), normalize(VIEW)), 0.0, 1.0), 3.5);
	ALBEDO = team_color.rgb;
	EMISSION = team_color.rgb * 0.12;
	ALPHA = edge * strength;
}
