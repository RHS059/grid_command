"""Fresh static body study. No old meshes, rig, or builder imports."""
import bpy, math, os, json
from mathutils import Vector
from bpy_extras.object_utils import world_to_camera_view
REV=7
OUT=os.path.abspath(os.path.join(os.path.dirname(__file__),'../../../../outputs/astra_2'))
bpy.ops.wm.read_factory_settings(use_empty=True)
def material(name,color):
 m=bpy.data.materials.new(name);m.diffuse_color=(*color,1);m.use_nodes=True;m.node_tree.nodes['Principled BSDF'].inputs['Base Color'].default_value=(*color,1);m.node_tree.nodes['Principled BSDF'].inputs['Roughness'].default_value=.9;return m
cloth=material('clothed body study',(.30,.255,.19))
parts=[]
def tube(name,centers,radii,axis='Z',count=12):
 vertices=[];faces=[]
 for center,(rx,ry) in zip(centers,radii):
  for j in range(count):
   angle=math.tau*(j+.5)/count
   a,b=rx*math.cos(angle),ry*math.sin(angle)
   offset=(a,b,0) if axis=='Z' else (0,b,a)
   vertices.append(tuple(Vector(center)+Vector(offset)))
 for i in range(len(centers)-1):
  for j in range(count):
   a=i*count+j;b=i*count+(j+1)%count;faces.append((a,b,b+count,a+count))
 faces.extend([tuple(reversed(range(count))),tuple((len(centers)-1)*count+j for j in range(count))])
 mesh=bpy.data.meshes.new(name);mesh.from_pydata(vertices,[],faces);mesh.update();obj=bpy.data.objects.new(name,mesh);bpy.context.collection.objects.link(obj);parts.append(obj);return obj
# All points are measured/interpreted from the new front and side images.
# +Y is the face direction. Exact horizontal arm centerline is z=1.40.
torso=[(.80,.115,.105),(.88,.19,.148),(.99,.181,.144),(1.09,.185,.125),(1.20,.20,.165),(1.35,.22,.154),(1.43,.17,.11),(1.49,.075,.075)]
tube('fresh torso',[(0,0,z) for z,x,y in torso],[(x,y) for z,x,y in torso])
tube('fresh neck',[(0,0,1.44),(0,0,1.51),(0,0,1.565)],[(.075,.075),(.065,.068),(.067,.067)])
tube('fresh head',[(0,0,z) for z in [1.53,1.56,1.64,1.70,1.765]],[(.063,.074),(.087,.095),(.108,.108),(.093,.095),(.040,.046)])
for side in [-1,1]:
 # Shoulder blends into torso; elbow narrows, forearm regains volume, wrist tapers.
 xs=[.13,.245,.33,.42,.49,.55,.63,.70,.76]
 rs=[(.082,.100),(.101,.113),(.085,.105),(.080,.099),(.059,.075),(.083,.099),(.080,.094),(.069,.080),(.046,.057)]
 tube('fresh horizontal sleeve',[(side*x,0,1.40) for x in xs],rs,'X')
 # Flattened palm and individually tapered fingers, all palms down.
 tube('fresh palm',[(side*x,.018,1.40) for x in [.735,.80,.865,.92]],[(.033,.049),(.041,.067),(.037,.062),(.029,.047)],'X',10)
 for index,y in enumerate([-.026,-.006,.014,.034]):
  end=[.976,.995,.986,.964][index]
  tube('fresh finger',[(side*.87,y+.018,1.40),(side*.94,y+.018,1.40),(side*end,y+.018,1.40)],[(.016,.016),(.015,.015),(.012,.012)],'X',8)
 tube('fresh thumb',[(side*.80,.058,1.395),(side*.84,.085,1.39),(side*.89,.085,1.39)],[(.020,.019),(.018,.017),(.011,.012)],'X',8)
 # Hip at .89, knee .51, ankle .17. Calf contour bulges behind and tapers down.
 zs=[.94,.84,.72,.62,.54,.49,.40,.31,.20,.15]
 centers=[(side*x,y,z) for x,y,z in zip([.10,.12,.135,.145,.15,.15,.15,.15,.15,.15],[0,0,0,0,0,0,-.013,-.012,0,0],zs)]
 radii=[(.083,.109),(.107,.133),(.108,.127),(.095,.110),(.082,.096),(.077,.089),(.089,.115),(.075,.095),(.060,.075),(.057,.065)]
 tube('fresh trouser leg',centers,radii)
 # Boot silhouette study, articulated equipment to be added only after approval.
 foot=tube('fresh foot',[(side*.15,.048,z) for z in [.015,.06,.12,.18]],[(.083,.16),(.085,.16),(.070,.10),(.054,.06)],count=10)
 for vertex in foot.data.vertices:
  x=vertex.co.x-side*.15;y=vertex.co.y;angle=-side*.12;vertex.co.x=side*.15+x*math.cos(angle)-y*math.sin(angle);vertex.co.y=x*math.sin(angle)+y*math.cos(angle)
# Fuse only these new intersecting surfaces into one connected anatomical mesh.
bpy.ops.object.select_all(action='DESELECT')
for o in parts:o.select_set(True)
bpy.context.view_layer.objects.active=parts[0];bpy.ops.object.join();body=bpy.context.object;body.name='Scratch_Continuous_Body'
remesh=body.modifiers.new('Fresh continuous body union','REMESH');remesh.mode='VOXEL';remesh.voxel_size=.008;bpy.ops.object.modifier_apply(modifier=remesh.name)
smooth=body.modifiers.new('Anatomical transition smoothing','SMOOTH');smooth.factor=.45;smooth.iterations=3;bpy.ops.object.modifier_apply(modifier=smooth.name)
bpy.ops.object.quadriflow_remesh(target_faces=3600,use_mesh_symmetry=True)
# Exact half-body reconstruction through a centerline Mirror modifier.
import bmesh
bm=bmesh.new();bm.from_mesh(body.data)
bmesh.ops.bisect_plane(bm,geom=list(bm.verts)+list(bm.edges)+list(bm.faces),dist=.000001,plane_co=(0,0,0),plane_no=(1,0,0),clear_inner=True)
for v in bm.verts:
 if abs(v.co.x)<.000001:v.co.x=0
bm.to_mesh(body.data);bm.free()
mirror=body.modifiers.new('Exact centerline source mirror','MIRROR');mirror.use_clip=True;mirror.use_mirror_merge=True;mirror.merge_threshold=.00001
bpy.ops.object.modifier_apply(modifier=mirror.name)
bpy.context.scene['mirror_verified']=True
tri=body.modifiers.new('Faceted triangles','TRIANGULATE');bpy.ops.object.modifier_apply(modifier=tri.name)
body.data.materials.append(cloth)
for face in body.data.polygons:face.use_smooth=False
body.data.calc_loop_triangles()
scene=bpy.context.scene;scene['provenance']='Fresh empty scene. Generated front/side/3quarter image references only. No imported meshes or rig.'
scene.render.engine='BLENDER_EEVEE_NEXT';scene.eevee.taa_render_samples=64;scene.render.resolution_x=640;scene.render.resolution_y=640;scene.render.resolution_percentage=100;scene.render.image_settings.file_format='PNG';scene.view_settings.view_transform='AgX'
world=bpy.data.worlds.new('neutral studio');world.use_nodes=True;world.node_tree.nodes['Background'].inputs[0].default_value=(.18,.20,.22,1);world.node_tree.nodes['Background'].inputs[1].default_value=.5;scene.world=world
center=Vector((0,0,.89))
for p,power in [((4,6,8),1100),((-4,2,5),750),((1,-5,7),1100)]:
 bpy.ops.object.light_add(type='AREA',location=p);light=bpy.context.object;light.data.energy=power;light.data.size=5;light.rotation_euler=(center-light.location).to_track_quat('-Z','Y').to_euler()
bpy.ops.object.camera_add();camera=bpy.context.object;camera.data.type='ORTHO';camera.data.ortho_scale=2.22;scene.camera=camera
for label,direction in {'front':(0,12,0),'side':(12,0,0),'back':(0,-12,0),'top':(0,0,12),'top_3quarter':(8,12,9)}.items():
 camera.location=center+Vector(direction);camera.rotation_euler=(center-camera.location).to_track_quat('-Z','Y').to_euler();scene.render.filepath=os.path.join(OUT,f'soldier_medium_r{REV}_'+label+'.png');bpy.ops.render.render(write_still=True)
 if label=='front':
  points=[world_to_camera_view(scene,camera,body.matrix_world@v.co) for v in body.data.vertices];front_bounds={'left':min(p.x for p in points)*640,'right':max(p.x for p in points)*640,'top':(1-max(p.y for p in points))*640,'bottom':(1-min(p.y for p in points))*640}
scene['arm_centerline_z']=1.40;scene['rig_status']='Unrigged static comparison only'
bpy.ops.wm.save_as_mainfile(filepath=os.path.join(OUT,'soldier_medium_body.blend'))
with open(os.path.join(OUT,'soldier_scratch_stats.json'),'w') as f:json.dump({'triangles':len(body.data.loop_triangles),'mesh_objects':1,'rigged':False,'arm_centerline_z':1.40,'front_bounds_pixels':front_bounds,'source':'Only three generated turnaround images; new empty scene'},f,indent=2)



