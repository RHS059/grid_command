import bpy,bmesh,os,math,json,collections
from mathutils import Vector
from bpy_extras.object_utils import world_to_camera_view
OUT=os.path.abspath(os.path.join(os.path.dirname(__file__),'../../../../outputs/astra_2'))
bpy.ops.wm.open_mainfile(filepath=os.path.join(OUT,'soldier_medium_equipment_base.blend'))
body=bpy.data.objects['Scratch_Continuous_Body']
source=open(os.path.join(os.path.dirname(__file__),'medium_equipment.py')).read()
exec(source[source.index('def mat('):source.index('# Torso shell')])
tan=bpy.data.materials['helmet fabric tan'];brown=bpy.data.materials['carrier coyote brown'];olive=bpy.data.materials['olive webbing'];dark=bpy.data.materials['charcoal fabric'];shield=bpy.data.materials['graphite knee armor'];glass=bpy.data.materials['black smoked glass']
# Increase shoulder fullness and raise sleeve to the reference shoulder line.
for v in body.data.vertices:
 x,y,z=v.co
 if abs(x)>.17 and z>1.22:
  blend=min(1,max(0,(abs(x)-.17)/.08));v.co.z+=.020*blend
for o in list(bpy.context.scene.objects):
 if o.type!='MESH':continue
 if any(s in o.name for s in ['glove','elbow_cloth']):
  for v in o.data.vertices:v.co.z+=.020
 if 'shoulder_plate' in o.name:
  for v in o.data.vertices:v.co.z+=.025
 if 'thigh_strap' in o.name:
  center=.135 if sum(v.co.x for v in o.data.vertices)>0 else -.135
  for v in o.data.vertices:v.co.x=center+(v.co.x-center)*1.08;v.co.y*=1.16
 if 'knee_strap' in o.name:
  for v in o.data.vertices:v.co.y*=1.17
 if 'pack_webbing' in o.name:
  for v in o.data.vertices:v.co.y+=.047
# Scarf connects head to collar, eliminating the visual neck gap.
shell('Equipment_neck_wrap',[(1.455,.068,.085,.080),(1.50,.074,.086,.082),(1.545,.08,.09,.084)],dark)
# Wide convex visor: three horizontal contour lines with distinct nose relief.
for o in list(bpy.context.scene.objects):
 if any(s in o.name for s in ['Equipment_visor','Equipment_goggle']):bpy.data.objects.remove(o,do_unlink=True)
verts=[];faces=[]
for row in range(3):
 for j in range(9):
  a=-math.pi*.48+j*math.pi*.96/8
  x=.119*math.sin(a);y=.195-.068*math.sin(a)**2
  z=[1.683,1.643,1.609][row]
  if row==2:z+=.025*(1-abs(math.sin(a)))**5
  verts.append((x,y,z))
for r in range(2):
 for j in range(8):a=r*9+j;faces.append((a,a+1,a+10,a+9))
mesh('Equipment_visor',verts,faces,glass)
for row in [0,2]:
 vs=[]
 for j in range(9):
  x,y,z=verts[row*9+j];vs.extend([(x*1.035,y+.003,z-.006),(x*1.035,y+.003,z+.006)])
 mesh('Equipment_visor_frame',vs,[(j*2,j*2+1,j*2+3,j*2+2) for j in range(8)],brown)
# Add broad rounded backing and more convex shield center panels.
for o in list(bpy.context.scene.objects):
 if 'knee_shield' in o.name:
  for v in o.data.vertices:
   if v.co.y>.14:v.co.y+=.012
 if 'knee_rim' in o.name:
  center=.15 if sum(v.co.x for v in o.data.vertices)>0 else -.15
  for v in o.data.vertices:v.co.x=center+(v.co.x-center)*1.15;v.co.z=.51+(v.co.z-.51)*1.08
# Continuous tan annulus surrounds the broad convex knee shield.
for o in list(bpy.context.scene.objects):
 if 'Equipment_knee_rim' in o.name:bpy.data.objects.remove(o,do_unlink=True)
outline=[(-.054,.10),(.054,.10),(.081,.06),(.075,-.068),(.040,-.10),(-.040,-.10),(-.075,-.068),(-.081,.06)]
for side in [-1,1]:
 vs=[];fs=[]
 for scale,y in [(1.31,.075),(1.28,.136),(1.05,.145)]:
  for x,z in outline:vs.append((side*.15+x*scale,y,.51+z*scale))
 for r in range(2):
  for j in range(8):a=r*8+j;b=r*8+(j+1)%8;fs.append((a,b,b+8,a+8))
 mesh('Equipment_knee_rim',vs,fs,tan)
# Reference waist-mounted utility bag opposite the three magazine pouches.
pouch('Equipment_belt_utility',(.198,.128,1.032),(.085,.104,.13),olive)
# Larger connected cloth facets; retain triangle budget for the armor silhouette.
bpy.context.view_layer.objects.active=body
dec=body.modifiers.new('Cloth silhouette facets','DECIMATE');dec.ratio=.64
bpy.ops.object.modifier_apply(modifier=dec.name)
for p in body.data.polygons:p.material_index=0
# All bilateral body, glove, boot and pad surfaces derive from positive X topology.
prefixes=['Scratch_Continuous_Body','Equipment_gloves','Equipment_boots','Equipment_boot_soles','Equipment_glove_cuff','Equipment_elbow_cloth','Equipment_knee_shield','Equipment_knee_rim','Equipment_knee_strap','Equipment_shoulder_plate','Equipment_ankle_cuff','Equipment_thigh_strap']
reports={}
for prefix in prefixes:
 objs=[o for o in bpy.context.scene.objects if o.type=='MESH' and o.name.startswith(prefix)]
 if not objs:continue
 bpy.ops.object.select_all(action='DESELECT')
 for o in objs:o.select_set(True)
 bpy.context.view_layer.objects.active=objs[0]
 if len(objs)>1:bpy.ops.object.join()
 o=bpy.context.object;bpy.ops.object.transform_apply(location=True,rotation=True,scale=True)
 bm=bmesh.new();bm.from_mesh(o.data)
 bmesh.ops.bisect_plane(bm,geom=list(bm.verts)+list(bm.edges)+list(bm.faces),dist=.000001,plane_co=(0,0,0),plane_no=(1,0,0),clear_inner=True)
 for v in bm.verts:
  if abs(v.co.x)<.000001:v.co.x=0
 bm.to_mesh(o.data);bm.free()
 mod=o.modifiers.new('Exact centerline Mirror','MIRROR');mod.use_clip=True;mod.merge_threshold=.00001
 bpy.ops.object.modifier_apply(modifier=mod.name)
 coords=[tuple(round(c,6) for c in v.co) for v in o.data.vertices];points=set(coords);faceset={frozenset(coords[i] for i in p.vertices) for p in o.data.polygons}
 mirror=lambda p:(round(-p[0],6),p[1],p[2])
 reports[prefix]={'vertices':len(coords),'unpaired_vertices':sum(mirror(p) not in points for p in points),'unpaired_faces':sum(frozenset(mirror(p) for p in f) not in faceset for f in faceset)}
 assert reports[prefix]['unpaired_vertices']==0 and reports[prefix]['unpaired_faces']==0
# Verify body is a single manifold connected surface.
bm=bmesh.new();bm.from_mesh(body.data);remaining=set(bm.verts);components=0
while remaining:
 components+=1;todo=[remaining.pop()]
 while todo:
  v=todo.pop()
  for e in v.link_edges:
   w=e.other_vert(v)
   if w in remaining:remaining.remove(w);todo.append(w)
nonmanifold=sum(not e.is_manifold for e in bm.edges);bm.free()
triangles=0
for o in bpy.context.scene.objects:
 if o.type=='MESH':o.data.calc_loop_triangles();triangles+=len(o.data.loop_triangles)
scene=bpy.context.scene;camera=scene.camera;center=Vector((0,0,.89));view_bounds={}
for label,direction in {'front':(0,12,0),'side':(-12,0,0),'back':(0,-12,0),'top':(0,0,12),'top_3quarter':(-8,14,3)}.items():
 camera.location=center+Vector(direction);camera.rotation_euler=(center-camera.location).to_track_quat('-Z','Y').to_euler();scene.render.filepath=os.path.join(OUT,'soldier_medium_r8_'+label+'.png');bpy.ops.render.render(write_still=True)
 if label in ['front','side','top_3quarter']:
  points=[world_to_camera_view(scene,camera,o.matrix_world@v.co) for o in scene.objects if o.type=='MESH' for v in o.data.vertices];view_bounds[label]={'top':(1-max(p.y for p in points))*640,'bottom':(1-min(p.y for p in points))*640}
  scene.render.film_transparent=True;scene.render.filepath=os.path.join(OUT,'soldier_medium_r8_'+label+'_alpha.png');bpy.ops.render.render(write_still=True);scene.render.film_transparent=False
scene['static_review']='Astra Medium, revision 8; unrigged, no inherited mesh geometry.'
bpy.ops.wm.save_as_mainfile(filepath=os.path.join(OUT,'soldier_medium_static.blend'))
report={'triangles':triangles,'body_connected_components':components,'body_nonmanifold_edges':nonmanifold,'mirror':reports,'rigged':False,'view_bounds':view_bounds}
with open(os.path.join(OUT,'soldier_medium_static_verification.json'),'w') as f:json.dump(report,f,indent=2)
print(json.dumps(report,indent=2))


