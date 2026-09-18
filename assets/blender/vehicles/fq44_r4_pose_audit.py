"""Test gear samples against the intact R4 outer body envelope."""
import bpy,bmesh,os,json,math
from mathutils import Vector
from mathutils.bvhtree import BVHTree
HERE=os.path.dirname(os.path.abspath(__file__));OUT=os.path.join(HERE,'fighter_r4')
bpy.ops.wm.open_mainfile(filepath=os.path.join(OUT,'fighter.blend'))
with bpy.data.libraries.load(os.path.join(OUT,'03_body_loft_blockout.blend'),link=False) as (source,destination):destination.objects=['FURY_R4_NEW_CONTOUR_LOFT']
envelope=destination.objects[0];bpy.context.scene.collection.objects.link(envelope);bpy.context.view_layer.update()
bm=bmesh.new();bm.from_mesh(envelope.data);bmesh.ops.transform(bm,matrix=envelope.matrix_world,verts=list(bm.verts));bvh=BVHTree.FromBMesh(bm);bm.free()
rig=json.load(open(os.path.join(OUT,'fighter_rig.json')));rows=[]
for key,node in rig['nodes'].items():
    if node['kind']!='gear':continue
    group=bpy.data.objects['Assembly_'+key]
    group.location=Vector(node['pivot'])+Vector((0,0,node['retractLift']))
    group.rotation_euler=(-math.pi/2,0,0) if key=='gear_N' else (0,math.pi/2*(1 if node['pivot'][0]>0 else -1),0)
bpy.context.view_layer.update()
for key,node in rig['nodes'].items():
    if node['kind']!='gear':continue
    points=[]
    for obj in bpy.context.scene.objects:
        if obj.type!='MESH' or obj.get('part')!=key:continue
        points.extend(obj.matrix_world@v.co for v in obj.data.vertices)
        obj.data.calc_loop_triangles()
        for tri in obj.data.loop_triangles:points.append(obj.matrix_world@(sum((obj.data.vertices[v].co for v in tri.vertices),Vector())/3))
        for edge in obj.data.edges:points.append(obj.matrix_world@((obj.data.vertices[edge.vertices[0]].co+obj.data.vertices[edge.vertices[1]].co)/2))
    outside=[];clearances=[]
    for p in points:
        nearest=bvh.find_nearest(p);clearances.append(nearest[3])
        if nearest[3]<=1e-5:continue
        hit=bvh.ray_cast(p,Vector((1,0,0)))
        # Every section of this X-symmetric body is convex. A point inside
        # exits through the +X face. A point outside hits -X first or no face.
        if hit[0] is None or hit[1].x<=0:outside.append(tuple(round(v,6) for v in p))
    rows.append({'part':key,'sample_count':len(points),'outside_body_samples':len(outside),'minimum_outer_surface_clearance':min(clearances),'outside_examples':outside[:8]})
result={'all_inside_body':all(r['outside_body_samples']==0 for r in rows),'test':'Source vertices, edge midpoints and triangle centres are inside the intact R4 body envelope. Open gear bay space is included.','body_envelope':'03_body_loft_blockout.blend:FURY_R4_NEW_CONTOUR_LOFT','parts':rows}
report=json.load(open(os.path.join(OUT,'fighter_verification.json')));report['gear_retraction']=result
uv_path=os.path.join(OUT,'fighter_exact_uv_audit.json')
if os.path.exists(uv_path):report['exact_uv_audit']=json.load(open(uv_path))
with open(os.path.join(OUT,'fighter_verification.json'),'w') as f:json.dump(report,f,indent=2)
print('GEAR_RETRACTION',json.dumps(result))
if not result['all_inside_body']:raise RuntimeError('A gear sample remains outside the body in the flight pose.')
