extends "res://scripts/browser_aircraft_models.gd"
class_name BrowserArmoredModels
## Direct IFV branch port from lib/game/armored-models.ts.
var sand: StandardMaterial3D
var light: StandardMaterial3D
var shade: StandardMaterial3D
var rubber: StandardMaterial3D

static func create(role: String,team: int=0) -> Node3D:
	var b:=BrowserArmoredModels.new(); b.root=Node3D.new(); b.root.name=role; b.flat=false
	var palette = preload("res://scripts/ground_vehicle_material.gd")
	var faction := clampi(team,0,1)
	b.sand=b.material(palette.BODY[faction].to_html(false),0.9,0.0); b.body=b.sand
	b.light=b.material(palette.LIGHT[faction].to_html(false),0.9,0.0); b.shade=b.material(palette.SHADE[faction].to_html(false),0.9,0.0); b.rubber=b.material("282c29",0.95,0.0)
	b.metal=b.material("54574d",0.85,0.08); b.glass=b.material("384b49",0.85,0.08); b.dark=b.rubber
	b.mark=b.material("54b7ff" if team==0 else "ee777b",0.85,0.08)
	b.hull_ifv(); b.bake_painted(b.root)
	var hull_root:=b.root; var turret:=Node3D.new(); turret.name="turret"; hull_root.add_child(turret); b.root=turret
	b.turret_ifv(); b.bake_painted(turret)
	return hull_root

## IFV has code-authored geometry, not an imported UV atlas. Retain each part's
## local face coordinates while merging and carry paint/grunge masks in UV.
## Small fittings, running gear, glass and markings never receive body noise.
func bake_painted(parent: Node3D) -> void:
	var st := SurfaceTool.new()
	st.begin(Mesh.PRIMITIVE_TRIANGLES)
	for child in parent.get_children():
		if not child is MeshInstance3D:
			continue
		var mat: StandardMaterial3D = child.material_override
		var arrays: Array = child.mesh.surface_get_arrays(0)
		var positions: PackedVector3Array = arrays[Mesh.ARRAY_VERTEX]
		var normals: PackedVector3Array = arrays[Mesh.ARRAY_NORMAL]
		var colors: PackedColorArray = arrays[Mesh.ARRAY_COLOR] if arrays[Mesh.ARRAY_COLOR] != null else PackedColorArray()
		var indices: PackedInt32Array = arrays[Mesh.ARRAY_INDEX] if arrays[Mesh.ARRAY_INDEX] != null else PackedInt32Array()
		if indices.is_empty():
			for i in positions.size(): indices.append(i)
		var bounds: AABB = child.mesh.get_aabb()
		var sizes: Array = [bounds.size.x, bounds.size.y, bounds.size.z]
		sizes.sort()
		var large := float(sizes[1]) > 0.38 and float(sizes[1]) * float(sizes[2]) > 0.55
		for index in indices:
			var col: Color = colors[index] if not colors.is_empty() else mat.albedo_color
			var paint := col.r > col.b * 1.12 and col.g > col.b * 1.15 and col.r > 0.22
			var p: Vector3 = positions[index] - bounds.position
			var n: Vector3 = normals[index]
			var face: Vector2
			if absf(n.x) > absf(n.y) and absf(n.x) > absf(n.z):
				face = Vector2(p.z / maxf(bounds.size.z, 0.001), p.y / maxf(bounds.size.y, 0.001))
			elif absf(n.y) > absf(n.z):
				face = Vector2(p.x / maxf(bounds.size.x, 0.001), p.z / maxf(bounds.size.z, 0.001))
			else:
				face = Vector2(p.x / maxf(bounds.size.x, 0.001), p.y / maxf(bounds.size.y, 0.001))
			var family := float(child.get_meta("surface_family", 1.0 if paint else 0.0))
			st.set_uv(Vector2(1.0 if large and paint else 0.0, family))
			st.set_uv2(face)
			st.set_color(col)
			st.set_normal((child.basis * n).normalized())
			st.add_vertex(child.transform * positions[index])
		parent.remove_child(child)
		child.free()
	var result := MeshInstance3D.new()
	result.mesh = st.commit()
	var painted := ShaderMaterial.new()
	painted.shader = preload("res://shaders/ifv_painted_surface.gdshader")
	painted.set_shader_parameter("surface_atlas", preload("res://assets/textures/vehicles/hemtt_atlas.png"))
	painted.set_shader_parameter("tire_sheet", preload("res://assets/textures/vehicles/hemtt_tire.png"))
	result.material_override = painted
	parent.add_child(result)

func panel(sections: Array,mat: Material=null,x: float=0) -> void:
	var rings: Array=[]
	for s in sections:
		var half_width: float=s[1]/2.0; var half_depth: float=s[2]/2.0; var shift: float=s[3] if s.size()>3 else 0.0
		var ring: Array=[]
		for pair in [[-half_width*0.8,-half_depth],[half_width*0.8,-half_depth],[half_width,-half_depth*0.8],[half_width,half_depth*0.8],[half_width*0.8,half_depth],[-half_width*0.8,half_depth],[-half_width,half_depth*0.8],[-half_width,-half_depth*0.8]]:
			ring.append(point([pair[0]+x,pair[1]+shift,s[0]]))
		rings.append(ring)
	ring_mesh(rings,mat)
	tint_last(0.12)

func tint_last(variation: float) -> void:
	var object: MeshInstance3D=root.get_child(root.get_child_count()-1)
	var arrays:=object.mesh.surface_get_arrays(0); var colors:=PackedColorArray()
	var base: Color=object.material_override.albedo_color.srgb_to_linear()
	for i in range(arrays[Mesh.ARRAY_VERTEX].size()):
		var level:=1.0+variation*((int(i/6)*7%5)/4.0-0.5); colors.append(Color(base.r*level,base.g*level,base.b*level,1).linear_to_srgb())
	arrays[Mesh.ARRAY_COLOR]=colors
	var mesh:=ArrayMesh.new(); mesh.add_surface_from_arrays(Mesh.PRIMITIVE_TRIANGLES,arrays); object.mesh=mesh
	var mat: StandardMaterial3D=object.material_override.duplicate(); mat.albedo_color=Color.WHITE; mat.vertex_color_use_as_albedo=true; object.material_override=mat

func hull_ifv() -> void:
	panel([[0.5,2.25,5.5,-0.1],[1.15,2.95,6.25],[1.93,2.68,4.9,-0.48]],sand)
	for sign in [-1,1]:
		extrusion([[-2.85,0.28],[-3.05,0.68],[-2.7,1.14],[2.55,1.14],[3.02,0.7],[2.75,0.17],[-2.45,0.17]],0.49,"x",sign*1.42,rubber); tint_last(0.08)
		root.get_child(root.get_child_count()-1).set_meta("surface_family", 3.0)
		for i in range(6):
			var y: float=-2.3+i*0.89; wheel_mesh(sign*1.67,y,0.64,0.43,0.055,shade)
			root.get_child(root.get_child_count()-1).set_meta("surface_family", 2.0)
			wheel_mesh(sign*1.71,y,0.64,0.17,0.025,metal)
		for i in range(17):
			var y: float=-2.65+i*0.32; box(0.54,0.07,0.035,sign*1.42,y,1.15,metal); box(0.025,0.07,0.13,sign*1.69,y,0.23,metal)
		for i in range(5):
			var y: float=-2.12+i*0.99; box(0.16,0.93,0.52,sign*1.55,y,1.41,light); box(0.035,0.025,0.37,sign*1.65,y-0.4,1.43,shade)
			box(0.055,0.1,0.04,sign*1.65,y-0.2,1.28,shade); box(0.055,0.1,0.04,sign*1.65,y+0.2,1.28,shade)
	panel([[1.94,0.64,0.78,1.15],[2.01,0.59,0.7,1.15]],light,-0.64)
	box(0.35,0.035,0.09,-0.64,1.49,2.02,glass)
	for i in range(8): box(0.88,0.055,0.025,0.6,-1.25+i*0.12,1.95,shade)
	box(1.75,0.055,0.94,0,-2.99,1.21,shade); box(1.57,0.04,0.82,0,-3.025,1.23,sand)
	for x in [-0.62,0.62]: box(0.16,0.055,0.045,x,-3.06,1.48,metal)
	for sign in [-1,1]:
		box(0.32,0.32,0.22,sign*1.05,2.22,1.62,shade); box(0.24,0.02,0.11,sign*1.05,2.4,1.65,material("c4c6a9",0.85,0.08))
		rail([sign*1.03,2.78,0.86],[sign*1.03,3.08,0.81],0.05,metal)
		box(0.04,0.65,0.2,sign*1.5,-1.6,1.66,mark); box(0.28,0.42,0.38,sign*1.14,-2.34,2.05,shade)

func turret_ifv() -> void:
	panel([[1.92,1.65,1.85,-0.2],[2.2,1.95,2.1,-0.25],[2.73,1.45,1.65,-0.4]])
	box(0.5,0.48,0.37,0,0.76,2.4,shade)
	rail([0,0.78,2.43],[0,3,2.43],0.04,rubber)
	rail([0,1.05,2.43],[0,1.5,2.43],0.085,shade)
	rail([0,2.87,2.43],[0,3.13,2.43],0.067,metal)
	panel([[2.72,0.6,0.65,-0.7],[2.84,0.55,0.58,-0.7]],shade,0.35)
	box(0.25,0.3,0.22,-0.42,-0.3,2.83,shade); box(0.2,0.02,0.12,-0.42,-0.135,2.84,glass)
	box(0.5,0.08,0.34,0.5,-0.99,2.94,light); box(0.055,0.5,0.34,0.23,-0.76,2.94,light); box(0.055,0.5,0.34,0.77,-0.76,2.94,light)
	rail([-0.65,-0.8,2.72],[-0.65,-0.8,3.95],0.015,rubber); rail([0.72,-0.83,2.72],[0.72,-0.83,3.35],0.018,shade)
	for x in [-0.98,0.98]:
		box(0.35,1.18,0.43,x,-0.35,2.5,shade)
		for z in [2.4,2.6]: rail([x,-0.85,z],[x,0.27,z],0.085,rubber)
	for x in [-1,1]:
		for i in range(3): rail([x*0.73,0.25+i*0.18,2.37],[x*0.95,0.42+i*0.18,2.58],0.047,shade)


