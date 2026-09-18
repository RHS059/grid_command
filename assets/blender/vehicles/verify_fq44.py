"""Reimport the exact GLB and audit the delivered geometry in a clean scene."""
import bpy,bmesh,os,json,math,sys
from mathutils import Vector,Matrix
sys.path.insert(0,os.path.dirname(os.path.abspath(__file__)))
import fq44_normals_audit
HERE=os.path.dirname(os.path.abspath(__file__))
bpy.ops.wm.open_mainfile(filepath=os.path.join(HERE,'fighter.blend'))
source_normals=fq44_normals_audit.snapshot(bpy.context.scene.objects)
source_health=[]
for o in bpy.context.scene.objects:
    if o.type!='MESH':continue
    bm=bmesh.new();bm.from_mesh(o.data)
    source_health.append({'name':o.name,'vertices':len(bm.verts),'nonmanifold_edges':sum(not e.is_manifold for e in bm.edges),'zero_area_faces':sum(f.calc_area()<1e-12 for f in bm.faces)})
    bm.free()
bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.gltf(filepath=os.path.join(HERE,'fighter.glb'))
scene=bpy.context.scene
for o in scene.objects:
    if o.animation_data:
        o.animation_data.action=None
        for t in o.animation_data.nla_tracks:t.mute=True
# The game deliberately uses Z-up glTF. Undo the standard importer's Y-up conversion.
for o in list(scene.objects):
    if not o.parent:o.matrix_world=Matrix.Rotation(-math.pi/2,4,'X')@o.matrix_world
bpy.context.view_layer.update()
meshes=[o for o in scene.objects if o.type=='MESH'];coords=[o.matrix_world@v.co for o in meshes for v in o.data.vertices]
health=[]
for o in meshes:
    bm=bmesh.new();bm.from_mesh(o.data)
    bmesh.ops.remove_doubles(bm,verts=list(bm.verts),dist=1e-6)
    boundary=sum(e.is_boundary for e in bm.edges);nonmanifold=sum(not e.is_manifold for e in bm.edges)
    health.append({'name':o.name,'vertices_after_diagnostic_weld':len(bm.verts),'boundary_edges':boundary,'nonmanifold_edges':nonmanifold,'zero_area_faces':sum(f.calc_area()<1e-12 for f in bm.faces),'signed_volume':bm.calc_volume(signed=True) if boundary==0 else None})
    bm.free()
images={n.image for m in bpy.data.materials if m.use_nodes for n in m.node_tree.nodes if n.type=='TEX_IMAGE' and n.image}
report=json.load(open(os.path.join(HERE,'fighter_verification.json')))
report['normal_round_trip']=fq44_normals_audit.compare(source_normals,meshes)
report['source_geometry']={'vertices':sum(h['vertices'] for h in source_health),'zero_area_faces':sum(h['zero_area_faces'] for h in source_health),'nonmanifold_edges':sum(h['nonmanifold_edges'] for h in source_health),'open_components':[h for h in source_health if h['nonmanifold_edges']>0]}
report['round_trip']={'mesh_objects':len(meshes),'vertices':sum(len(o.data.vertices) for o in meshes),'materials':len({m for o in meshes for m in o.data.materials}),'image_sizes':[list(im.size) for im in images],'bounds_min':[min(v[i] for v in coords) for i in range(3)],'bounds_max':[max(v[i] for v in coords) for i in range(3)],'axis_note':'Undo standard glTF Y-up import conversion for the documented game Z-up export.','zero_area_faces':sum(h['zero_area_faces'] for h in health),'closed_negative_volume':[h['name'] for h in health if h['signed_volume'] is not None and h['signed_volume']<0],'intentional_open_surfaces':[h['name'] for h in health if h['boundary_edges']>0],'components':health}
scene.render.engine='CYCLES';scene.cycles.samples=24;scene.render.resolution_x=1200;scene.render.resolution_y=900;scene.render.resolution_percentage=100;scene.render.image_settings.file_format='PNG';scene.view_settings.view_transform='AgX'
world=bpy.data.worlds.new('Roundtrip studio');world.use_nodes=True;world.node_tree.nodes['Background'].inputs[0].default_value=(.16,.18,.22,1);world.node_tree.nodes['Background'].inputs[1].default_value=.45;scene.world=world
center=Vector((0,.4,1.9))
for loc,power,size in [((3,5,11),2100,7),((-6,2,6),1700,6),((2,-9,8),2400,5)]:
    bpy.ops.object.light_add(type='AREA',location=loc);l=bpy.context.object;l.data.energy=power;l.data.shape='DISK';l.data.size=size;l.rotation_euler=(center-l.location).to_track_quat('-Z','Y').to_euler()
bpy.ops.object.camera_add();cam=bpy.context.object;cam.data.type='ORTHO';scene.camera=cam
cam.location=center+Vector((12,18,11));cam.rotation_euler=(center-cam.location).to_track_quat('-Z','Y').to_euler();bpy.context.view_layer.update();cc=[cam.matrix_world.inverted()@p for p in coords]
low=Vector((min(v.x for v in cc),min(v.y for v in cc),0));high=Vector((max(v.x for v in cc),max(v.y for v in cc),0));cam.data.ortho_scale=max(high.x-low.x,(high.y-low.y)*4/3)*1.12;cam.location+=cam.rotation_euler.to_matrix()@((low+high)/2)
scene.render.filepath=os.path.join(HERE,'fighter_roundtrip.png');bpy.ops.render.render(write_still=True)
with open(os.path.join(HERE,'fighter_verification.json'),'w') as f:json.dump(report,f,indent=2)
print('ROUNDTRIP',json.dumps({k:v for k,v in report['round_trip'].items() if k!='components'}))
print('NORMAL_ROUNDTRIP',json.dumps({k:v for k,v in report['normal_round_trip'].items() if k!='components'}))
if not report['normal_round_trip']['pass']:raise RuntimeError('The GLB did not preserve source corner normals.')
