"""Render the remaining R4 views and measure assembly contacts."""
import bpy,bmesh,os,json,math
from mathutils import Vector,Matrix
from mathutils.bvhtree import BVHTree
HERE=os.path.dirname(os.path.abspath(__file__));OUT=os.path.join(HERE,'fighter_r4')
bpy.ops.wm.open_mainfile(filepath=os.path.join(OUT,'fighter.blend'))
scene=bpy.context.scene;meshes=[o for o in scene.objects if o.type=='MESH'];scene.cycles.samples=24
def find(prefix):return next(o for o in meshes if o.name.startswith(prefix))
def tree(obj):
    bm=bmesh.new();bm.from_mesh(obj.data);bmesh.ops.transform(bm,matrix=obj.matrix_world,verts=list(bm.verts));t=BVHTree.FromBMesh(bm);bm.free();return t
body=find('fury_chined_fuselage');body_tree=tree(body);contacts=[]
for prefix in ['fixed_trunnion_N','fixed_trunnion_L','fixed_trunnion_R','main_wing_L','main_wing_R','elevator_L','elevator_R','single_vertical_tail','tail_root_fairing']:
    obj=find(prefix);distances=[]
    for v in obj.data.vertices:
        hit=body_tree.find_nearest(obj.matrix_world@v.co)
        if hit:distances.append(hit[3])
    overlaps=tree(obj).overlap(body_tree)
    contacts.append({'component':obj.name,'nearest_surface_distance':min(distances),'intersecting_triangle_pairs':len(overlaps),'contact_pass':bool(overlaps) or min(distances)<.025})
cam=scene.camera;cam.data.type='ORTHO';center=Vector((0,0,1.4))
def frame(vector,label,scope=None):
    cam.location=center+Vector(vector);cam.rotation_euler=(center-cam.location).to_track_quat('-Z','Y').to_euler();bpy.context.view_layer.update()
    cc=[cam.matrix_world.inverted()@(o.matrix_world@v.co) for o in (scope or meshes) for v in o.data.vertices]
    lo=Vector((min(p.x for p in cc),min(p.y for p in cc),0));hi=Vector((max(p.x for p in cc),max(p.y for p in cc),0));cam.data.ortho_scale=max(hi.x-lo.x,(hi.y-lo.y)*1400/950)*1.10;cam.location+=cam.rotation_euler.to_matrix()@((lo+hi)/2)
    scene.render.filepath=os.path.join(OUT,'fighter_'+label+'.png');bpy.ops.render.render(write_still=True)
for label,view in {'top':(0,0,20),'rear':(0,-20,1),'three_quarter':(12,18,10)}.items():frame(view,label)
rig=json.load(open(os.path.join(OUT,'fighter_rig.json')))
for key,node in rig['nodes'].items():
    if node['kind']!='gear':continue
    obj=bpy.data.objects['Assembly_'+key];obj.location=Vector(node['pivot'])+Vector((0,0,node['retractLift']))
    if key=='gear_N':obj.rotation_euler.x=-math.pi/2
    else:obj.rotation_euler.y=math.pi/2*(1 if node['pivot'][0]>0 else -1)
bpy.context.view_layer.update();frame((-12,18,-5),'flight_low_angle');frame((-15,20,12),'flight');frame((0,0,-20),'underside')
gear=[]
for key,node in rig['nodes'].items():
    if node['kind']!='gear':continue
    scope=[o for o in meshes if o.get('part')==key];coords=[o.matrix_world@v.co for o in scope for v in o.data.vertices]
    gear.append({'part':key,'retracted_min':[min(v[i] for v in coords) for i in range(3)],'retracted_max':[max(v[i] for v in coords) for i in range(3)]})
    obj=bpy.data.objects['Assembly_'+key];obj.location=node['pivot'];obj.rotation_euler=(0,0,0)
bpy.context.view_layer.update()
# Render the whole asset wireframe without changing the delivered geometry.
wiremat=bpy.data.materials.new('QA wire');wiremat.use_nodes=True;n=wiremat.node_tree.nodes;n.clear();e=n.new('ShaderNodeEmission');e.inputs[0].default_value=(1,.36,.05,1);out=n.new('ShaderNodeOutputMaterial');wiremat.node_tree.links.new(e.outputs[0],out.inputs[0])
wires=[]
for obj in meshes:
    data=bpy.data.curves.new('QA_'+obj.name,'CURVE');data.dimensions='3D';data.bevel_depth=.0018;data.bevel_resolution=0
    for edge in obj.data.edges:
        sp=data.splines.new('POLY');sp.points.add(1)
        for p,v in zip(sp.points,edge.vertices):p.co=(*(obj.matrix_world@obj.data.vertices[v].co),1)
    o=bpy.data.objects.new('QA_'+obj.name,data);scene.collection.objects.link(o);o.data.materials.append(wiremat);wires.append(o)
frame((-15,20,12),'wireframe')
for o in wires:bpy.data.objects.remove(o,do_unlink=True)
report=json.load(open(os.path.join(OUT,'fighter_verification.json')));report['assembly_contacts']=contacts;report['retracted_gear_bounds']=gear
with open(os.path.join(OUT,'fighter_verification.json'),'w') as f:json.dump(report,f,indent=2)
print('CONTACTS',json.dumps(contacts));print('RETRACTED_GEAR',json.dumps(gear))
