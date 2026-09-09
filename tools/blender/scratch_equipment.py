"""Fit newly authored equipment over the accepted fresh body; no old asset inputs."""
import bpy, os, math, json, hashlib
from mathutils import Vector
from bpy_extras.object_utils import world_to_camera_view
OUT=os.path.abspath(os.path.join(os.path.dirname(__file__),'../../../../outputs/astra_2'))
REV=6
bpy.ops.wm.open_mainfile(filepath=os.path.join(OUT,'soldier_scratch_body.blend'))
body=bpy.data.objects['Scratch_Continuous_Body']
assert bpy.context.scene.get('mirror_verified'),'Run scratch_mirror.py before equipment fitting'
def digest():return hashlib.sha256(str([(tuple(v.co)) for v in body.data.vertices]).encode()).hexdigest()
before=digest()
def mat(name,c):
 m=bpy.data.materials.new(name);m.diffuse_color=(*c,1);m.use_nodes=True;m.node_tree.nodes['Principled BSDF'].inputs['Base Color'].default_value=(*c,1);m.node_tree.nodes['Principled BSDF'].inputs['Roughness'].default_value=.87;return m
tan=mat('helmet fabric tan',(.38,.32,.23));brown=mat('carrier coyote brown',(.12,.088,.05));olive=mat('olive webbing',(.40,.43,.27));dark=mat('charcoal fabric',(.025,.028,.023));shield=mat('graphite knee armor',(.075,.085,.08));glass=mat('black smoked glass',(.006,.010,.008))
def mesh(name,verts,faces,m):
 data=bpy.data.meshes.new(name);data.from_pydata(verts,[],faces);data.update();o=bpy.data.objects.new(name,data);bpy.context.collection.objects.link(o);data.materials.append(m);return o
def shell(name,levels,m):
 # Fitted convex cross-sections: front and back faces, chamfered side transitions.
 v=[];f=[]
 for z,rx,front,back in levels:
  v.extend([(-rx*.78,front,z),(rx*.78,front,z),(rx,front*.6,z),(rx,-back*.6,z),(rx*.74,-back,z),(-rx*.74,-back,z),(-rx,-back*.6,z),(-rx,front*.6,z)])
 for row in range(len(levels)-1):
  for j in range(8):a=row*8+j;b=row*8+(j+1)%8;f.append((a,b,b+8,a+8))
 f.extend([tuple(reversed(range(8))),tuple((len(levels)-1)*8+j for j in range(8))]);return mesh(name,v,f,m)
def pouch(name,center,size,m):
 x,y,z=center;w,d,h=size
 o=shell(name,[(z-h/2,w*.40,d*.30,d*.30),(z-h*.30,w*.50,d*.5,d*.5),(z+h*.30,w*.47,d*.5,d*.5),(z+h/2,w*.38,d*.30,d*.30)],m)
 for v in o.data.vertices:v.co.x+=x;v.co.y+=y
 return o
def ribbon(name,path,width,thick,m):
 verts=[];faces=[]
 for i,p in enumerate(path):
  tangent=Vector(path[min(i+1,len(path)-1)])-Vector(path[max(i-1,0)]);normal=Vector((0,-tangent.z,tangent.y)).normalized()*thick/2
  for dx,dn in [(-width/2,-1),(width/2,-1),(width/2,1),(-width/2,1)]:verts.append(Vector(p)+Vector((dx,0,0))+normal*dn)
 for i in range(len(path)-1):
  for j in range(4):a=i*4+j;b=i*4+(j+1)%4;faces.append((a,b,b+4,a+4))
 faces.extend([(3,2,1,0),tuple((len(path)-1)*4+i for i in range(4))]);return mesh(name,verts,faces,m)
def band(name,z,rx,ry,height,m,x=0,y=0):
 verts=[];faces=[];n=16
 for zz in [z-height/2,z+height/2]:
  for i in range(n):a=i*math.tau/n;verts.append((x+rx*math.cos(a),y+ry*math.sin(a),zz))
 for i in range(n):faces.append((i,(i+1)%n,(i+1)%n+n,i+n))
 return mesh(name,verts,faces,m)
# Torso shell follows ribcage, has angled shoulder corners and a narrower waist.
carrier=shell('Equipment_plate_carrier',[(1.065,.166,.137,.12),(1.15,.184,.157,.13),(1.31,.207,.165,.13),(1.415,.168,.145,.115)],brown)
carrier.data.materials.append(tan)
for p in carrier.data.polygons:
 if p.center.z>1.33:p.material_index=1
# Long webbing straps go across shoulder and down front, staying outside shell.
for side in [-1,1]:
 ribbon('Equipment_shoulder_strap',[(side*.155,.166,1.245),(side*.16,.175,1.36),(side*.16,.09,1.435),(side*.16,-.025,1.465),(side*.16,-.12,1.39)],.056,.030,olive)
 pouch('Equipment_strap_buckle',(side*.155,.200,1.265),(.065,.027,.040),olive)
 plate=pouch('Equipment_shoulder_plate',(side*.295,0,1.487),(.15,.17,.043),olive)
 for v in plate.data.vertices:v.co.z-=side*(v.co.x-side*.295)*.18
 pouch('Equipment_side_pouch',(side*.22,0,1.18),(.075,.15,.18),olive)
# Substantial pack depth is taken from the side reference.
pouch('Equipment_backpack',(0,-.196,1.295),(.32,.16,.40),olive)
for z in [1.16,1.34]:pouch('Equipment_pack_compartment',(0,-.277,z),(.23,.042,.135),olive)
band('Equipment_belt',1.065,.18,.133,.048,brown)
pouch('Equipment_belt_buckle',(.045,.145,1.065),(.061,.025,.045),dark)
for x in [-.015,-.095,-.175]:
 pouch('Equipment_magazine_pouch',(x,.168,1.025),(.077,.10,.15),olive)
 pouch('Equipment_magazine_flap',(x,.225,1.068),(.071,.018,.050),olive)
for side in [-1,1]:
 bag=pouch('Equipment_thigh_pouch',(side*.24,.015,.78),(.12,.16,.22),olive)
 for v in bag.data.vertices:
  if v.co.z>.88:v.co.x=side*.24+(v.co.x-side*.24)*.74
  v.co.y+=.008*math.sin(v.co.z*25)
 band('Equipment_thigh_strap',.74,.108,.105,.030,brown,x=side*.135)
 # Broad shield with a raised center and bevel, following knee curvature.
 outline=[(-.054,.10),(.054,.10),(.081,.06),(.075,-.068),(.040,-.10),(-.040,-.10),(-.075,-.068),(-.081,.06)]
 verts=[(side*.15+x*1.12,.092,.51+z*1.08) for x,z in outline]+[(side*.15+x*.70,.139,.51+z*.70) for x,z in outline]
 faces=[(j,(j+1)%8,(j+1)%8+8,j+8) for j in range(8)]+[tuple(range(8,16))];mesh('Equipment_knee_shield',verts,faces,shield)
 for z in [.445,.565]:band('Equipment_knee_strap',z,.087,.081,.025,brown,x=side*.15)
# Head: helmet dome, wraparound mask/goggles, ear protection, folded NVG tubes.
verts=[];faces=[];n=16
for z,rx,ry in [(1.655,.123,.13),(1.72,.125,.133),(1.77,.085,.098),(1.805,.029,.036)]:
 for j in range(n):a=j*math.tau/n;verts.append((rx*math.cos(a),ry*1.08*math.sin(a)-.009,z))
for row in range(3):
 for j in range(n):a=row*n+j;b=row*n+(j+1)%n;faces.append((a,b,b+n,a+n))
faces.append(tuple(3*n+j for j in range(n)));mesh('Equipment_helmet',verts,faces,tan)
shell('Equipment_mask',[(1.525,.079,.105,.075),(1.565,.107,.145,.105),(1.665,.116,.145,.11)],dark)
shell('Equipment_helmet_brow',[(1.675,.13,.157,.12),(1.695,.13,.155,.12)],brown)
goggle=[(-.118,.078,1.68),(-.102,.16,1.68),(.102,.16,1.68),(.118,.078,1.68),(-.118,.078,1.625),(-.086,.161,1.635),(.086,.161,1.635),(.118,.078,1.625),(0,.16,1.652)]
mesh('Equipment_visor',goggle,[(0,1,5,4),(1,2,6,8,5),(2,3,7,6)],glass)
for side in [-1,1]:
 pouch('Equipment_earcup',(side*.123,-.012,1.635),(.038,.094,.105),shield)
 bpy.ops.mesh.primitive_cylinder_add(vertices=10,radius=.016,depth=.115,location=(side*.029,.105,1.815),rotation=(-.23,0,0));o=bpy.context.object;o.name='Equipment_NVG';o.data.materials.append(shield)
pouch('Equipment_NVG_mount',(0,.125,1.744),(.042,.040,.067),dark)
band('Equipment_carrier_lower_binding',1.065,.166,.14,.025,brown)
shell('Equipment_upper_chest_plate',[(1.32,.174,.178,.08),(1.405,.152,.154,.08)],tan)
# Raised cloth collar and cheek planes close the reference's layered neck/head profile.
shell('Equipment_collar',[(1.43,.115,.087,.077),(1.485,.077,.079,.069),(1.50,.073,.068,.065)],tan)
for side in [-1,1]:
 ribbon('Equipment_collar_fold',[(side*.04,.083,1.463),(side*.10,.097,1.443),(side*.15,.11,1.42)],.026,.017,brown)
 mesh('Equipment_mask_cheek',[(side*.038,.148,1.615),(side*.096,.123,1.63),(side*.11,.090,1.575),(side*.063,.141,1.55),(side*.034,.159,1.576)],[(0,1,2,4),(2,3,4)],shield)
 mesh('Equipment_mask_chin',[(-.063,.141,1.55),(.063,.141,1.55),(.04,.131,1.531),(-.04,.131,1.531)],[(0,1,2,3)],shield)
for side in [-1,1]:
 ribbon('Equipment_goggle_rim',[(side*.109,.098,1.672),(side*.085,.166,1.676),(side*.016,.17,1.675)],.011,.011,brown)
 ribbon('Equipment_goggle_lower_rim',[(side*.10,.113,1.632),(side*.075,.166,1.626),(side*.017,.167,1.642)],.010,.009,shield)
# Gloves and boots are offset covers from THIS accepted fresh body's surface.
def fitted_cover(name,predicate,m,offset):
 polygons=[p for p in body.data.polygons if predicate(p.center)];ids=sorted(set(i for p in polygons for i in p.vertices));remap={old:i for i,old in enumerate(ids)}
 return mesh(name,[body.data.vertices[i].co+body.data.vertices[i].normal*offset for i in ids],[tuple(remap[i] for i in p.vertices) for p in polygons],m)
fitted_cover('Equipment_gloves',lambda p:abs(p.x)>.77,dark,.004)
fitted_cover('Equipment_boots',lambda p:p.z<.19,brown,.005)
fitted_cover('Equipment_boot_soles',lambda p:p.z<.042,dark,.008)
for side in [-1,1]:
 verts=[];faces=[]
 for z,rx,ry in [(.17,.070,.068),(.19,.093,.081),(.22,.066,.066)]:
  for i in range(16):a=i*math.tau/16;verts.append((side*.15+rx*math.cos(a),ry*math.sin(a),z))
 for row in range(2):
  for i in range(16):a=row*16+i;b=row*16+(i+1)%16;faces.append((a,b,b+16,a+16))
mesh('Equipment_ankle_cuff',verts,faces,tan)
# Textile closure layers follow the bags instead of adding disconnected boxes.
for side in [-1,1]:
 ribbon('Equipment_thigh_bag_binding',[(side*.24,.118,.868),(side*.24,.133,.805),(side*.24,.121,.735)],.066,.013,brown)
 pouch('Equipment_thigh_bag_flap',(side*.24,.11,.835),(.101,.024,.060),olive)
 pouch('Equipment_thigh_bag_buckle',(side*.24,.132,.798),(.021,.017,.026),dark)
 ribbon('Equipment_pack_webbing',[(side*.10,-.282,1.46),(side*.10,-.31,1.35),(side*.10,-.312,1.12)],.021,.013,brown)
 # Forearm and glove cuffs: cross sections around horizontal arm axis.
 verts=[];faces=[]
 for xx,ry,rz in [(.752,.056,.047),(.775,.063,.049),(.794,.058,.044)]:
  for j in range(12):a=j*math.tau/12;verts.append((side*xx,ry*math.cos(a),1.40+rz*math.sin(a)))
 for row in range(2):
  for j in range(12):a=row*12+j;b=row*12+(j+1)%12;faces.append((a,b,b+12,a+12))
 mesh('Equipment_glove_cuff',verts,faces,brown)
 # Shield rim follows all eight edges and wraps back around the knee.
 verts=[(side*.15+x*1.18,.071,.51+z*1.13) for x,z in outline]+[(side*.15+x*1.12,.093,.51+z*1.08) for x,z in outline]
 mesh('Equipment_knee_rim',verts,[(j,(j+1)%8,(j+1)%8+8,j+8) for j in range(8)],brown)
# Convex irregular facets on load-bearing textile bags and carrier front panels.
for o in list(bpy.context.scene.objects):
 if o.type!='MESH' or not o.name.startswith(('Equipment_thigh_pouch','Equipment_plate_carrier','Equipment_backpack')):continue
 verts=[v.co.copy() for v in o.data.vertices];faces=[];indices=[]
 for p in o.data.polygons:
  if len(p.vertices)==4 and (p.center.y>.03 if 'backpack' not in o.name else p.center.y<-.30):
   center=p.center.copy();center.y+=(.014 if 'thigh' in o.name else .005) if 'backpack' not in o.name else -.008;index=len(verts);verts.append(center)
   for i in range(4):faces.append((p.vertices[i],p.vertices[(i+1)%4],index));indices.append(p.material_index)
  else:faces.append(tuple(p.vertices));indices.append(p.material_index)
 old=o.data;data=bpy.data.meshes.new(o.name+' faceted');data.from_pydata(verts,[],faces);data.update()
 for m in old.materials:data.materials.append(m)
 o.data=data
 for p,i in zip(data.polygons,indices):p.material_index=i
# Match the newly approved depth correction without changing front silhouettes.
for o in list(bpy.context.scene.objects):
 if o.type!='MESH' or not o.name.startswith('Equipment_'):continue
 if o.name.startswith(('Equipment_gloves','Equipment_boot')):continue
 if o.name.startswith(('Equipment_backpack','Equipment_pack_compartment')):
  for v in o.data.vertices:v.co.y-=.022
 elif o.name.startswith(('Equipment_helmet','Equipment_mask','Equipment_visor','Equipment_goggle','Equipment_earcup')):
  for v in o.data.vertices:v.co.y*=1.16
 elif o.name.startswith('Equipment_NVG'):o.location.y*=1.16
 else:
  for v in o.data.vertices:v.co.y*=1.20
assert digest()==before,'Accepted underlying body changed'
scene=bpy.context.scene;camera=scene.camera;center=Vector((0,0,.89))
view_bounds={}
for label,direction in {'front':(0,12,0),'side':(-12,0,0),'back':(0,-12,0),'top':(0,0,12),'top_3quarter':(-8,14,3)}.items():
 camera.location=center+Vector(direction);camera.rotation_euler=(center-camera.location).to_track_quat('-Z','Y').to_euler();scene.render.filepath=os.path.join(OUT,f'soldier_scratch_equipped_r{REV}_'+label+'.png');bpy.ops.render.render(write_still=True)
 if label in ['front','side','top_3quarter']:
  points=[world_to_camera_view(scene,camera,o.matrix_world@v.co) for o in scene.objects if o.type=='MESH' for v in o.data.vertices];view_bounds[label]={'top':(1-max(p.y for p in points))*640,'bottom':(1-min(p.y for p in points))*640}
  scene.render.film_transparent=True;scene.render.filepath=os.path.join(OUT,f'soldier_scratch_equipped_r{REV}_'+label+'_alpha.png');bpy.ops.render.render(write_still=True);scene.render.film_transparent=False
triangles=0
for o in scene.objects:
 if o.type=='MESH':o.data.calc_loop_triangles();triangles+=len(o.data.loop_triangles)
bpy.ops.wm.save_as_mainfile(filepath=os.path.join(OUT,'soldier_scratch_equipped.blend'))
with open(os.path.join(OUT,'soldier_scratch_equipped_stats.json'),'w') as f:json.dump({'triangles':triangles,'body_unchanged':digest()==before,'body_vertex_hash':before,'rigged':False,'view_bounds':view_bounds,'inputs':['soldier_scratch_body.blend','three generated turnaround images']},f,indent=2)



