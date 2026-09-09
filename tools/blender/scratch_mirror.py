"""Enforce and verify exact centerline symmetry on the accepted fresh body."""
import bpy,bmesh,os,json
OUT=os.path.abspath(os.path.join(os.path.dirname(__file__),'../../../../outputs/astra_2'))
bpy.ops.wm.open_mainfile(filepath=os.path.join(OUT,'soldier_scratch_body.blend'))
body=bpy.data.objects['Scratch_Continuous_Body'];bm=bmesh.new();bm.from_mesh(body.data)
bmesh.ops.bisect_plane(bm,geom=list(bm.verts)+list(bm.edges)+list(bm.faces),dist=.000001,plane_co=(0,0,0),plane_no=(1,0,0),clear_inner=True)
for v in bm.verts:
 if abs(v.co.x)<.000001:v.co.x=0
bm.to_mesh(body.data);bm.free()
bpy.context.view_layer.objects.active=body;mod=body.modifiers.new('Exact anatomical centerline mirror','MIRROR');mod.use_axis[0]=True;mod.use_clip=True;mod.use_mirror_merge=True;mod.merge_threshold=.00001;bpy.ops.object.modifier_apply(modifier=mod.name)
key=lambda p:tuple(round(c,6) for c in p)
coords={key(v.co):v.index for v in body.data.vertices};pairs={};missing=[]
for v in body.data.vertices:
 target=(-v.co.x,v.co.y,v.co.z);partner=coords.get(key(target))
 if partner is None:missing.append(v.index)
 else:pairs[v.index]=partner
faces={frozenset(p.vertices) for p in body.data.polygons};unpaired_faces=[p.index for p in body.data.polygons if frozenset(pairs.get(i,-1) for i in p.vertices) not in faces]
assert not missing and not unpaired_faces,(missing,unpaired_faces)
body.data.calc_loop_triangles();bpy.context.scene['mirror_verified']='Positive-X half bisected at x=0, Mirror modifier applied; paired vertex and topology checks passed.'
report={'method':'Keep positive-X half using centerline bisect, apply X Mirror modifier with seam merge.','vertex_count':len(body.data.vertices),'triangles':len(body.data.loop_triangles),'coordinate_precision':1e-6,'unpaired_vertices':missing,'unpaired_faces':unpaired_faces,'paired_topology':'pass','rigged':False}
with open(os.path.join(OUT,'soldier_scratch_mirror_verification.json'),'w') as f:json.dump(report,f,indent=2)
bpy.ops.wm.save_as_mainfile(filepath=os.path.join(OUT,'soldier_scratch_body.blend'))
print(report)
