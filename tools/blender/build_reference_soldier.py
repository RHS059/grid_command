"""Primary reference silhouette rebuild; continuous body with fitted equipment."""
import bpy, math, os, sys, random
from mathutils import Vector
sys.path.insert(0,os.path.dirname(__file__))
import build_mec_soldier as core
import cohesive_soldier
core.REV=17
bpy.ops.wm.open_mainfile(filepath=os.path.join(core.ROOT,'assets/blender/soldier_base.blend'))
rig=bpy.data.objects['GC_Soldier_Rig'];rig.animation_data.action=None
for t in rig.animation_data.nla_tracks:t.mute=True
for b in rig.pose.bones:b.matrix_basis.identity()
bpy.context.scene.frame_set(1)
for o in list(bpy.context.scene.objects):
 if o.type=='MESH' and not o.name.startswith('Gear_'):bpy.data.objects.remove(o,do_unlink=True)
tan=core.mat('uniform warm khaki',(.32,.285,.205));sage=core.mat('webbing sage',(.31,.34,.18));brown=core.mat('fitted armor coyote',(.15,.12,.065));black=core.mat('rubber charcoal',(.025,.027,.023));visor=core.mat('smoked visor',(.009,.012,.010));pad=core.mat('kneepad graphite',(.08,.09,.09))
def attach(o,bone):
 vg=o.vertex_groups.new(name=bone);vg.add(list(range(len(o.data.vertices))),1,'REPLACE');mod=o.modifiers.new('Skin','ARMATURE');mod.object=rig;o.parent=rig;return o
def form(n,p,scale,bone,material,sub=2):
 bpy.ops.mesh.primitive_ico_sphere_add(subdivisions=sub,radius=1,location=p);o=bpy.context.object;o.name=n;o.scale=scale;bpy.ops.object.transform_apply(location=False,rotation=False,scale=True);o.data.materials.append(material);attach(o,bone);return o
def rings(n,levels,material,bone,segments=12,axis='Z'):
 verts=[];faces=[]
 for center,rx,ry in levels:
  for j in range(segments):
   a=math.tau*j/segments+(math.pi/8 if n.startswith('boot') else 0);v=Vector((math.cos(a)*rx,math.sin(a)*ry,0))
   if axis=='X':v=Vector((0,v.y,v.x))
   verts.append(Vector(center)+v)
 for i in range(len(levels)-1):
  for j in range(segments):a=i*segments+j;b=i*segments+(j+1)%segments;c=b+segments;d=a+segments;faces.append((a,b,c,d))
 faces.append(tuple(reversed(range(segments))));faces.append(tuple((len(levels)-1)*segments+j for j in range(segments)))
 mesh=bpy.data.meshes.new(n);mesh.from_pydata(verts,[],faces);mesh.update();o=bpy.data.objects.new(n,mesh);bpy.context.collection.objects.link(o);mesh.materials.append(material);attach(o,bone);return o
form('Body_head',(0,0,1.605),(.108,.108,.153),'head',tan,3)
rings('Body_torso',[((0,0,z),x,y) for z,x,y in [(.94,.185,.12),(1.02,.18,.12),(1.10,.19,.13),(1.25,.225,.145),(1.35,.235,.14),(1.42,.19,.115),(1.48,.085,.08)]],tan,'spine')
form('Body_pelvis',(0,0,.89),(.21,.14,.14),'pelvis',tan,3)
for side,s in [('L',-1),('R',1)]:
 for name,radii in [('upper_arm',(.10,.095,.077)),('forearm',(.083,.085,.058)),('thigh',(.12,.105,.080)),('shin',(.075,.088,.055))]:
  b=rig.data.bones[name+'.'+side];a,c=b.head_local,b.tail_local;mid=(a+c)/2;d=(c-a).normalized();levels=[]
  for t,r in zip([-.06,.35,.70,1.04],[radii[0],radii[0]*1.035,radii[1],radii[2]]):
   point=a+(c-a)*t
   if name=='upper_arm':point.z-=max(0,t)*.027
   if name=='forearm':point.z-=max(0,1-t)*.027
   if 'arm' in name:point.x*=.94
   levels.append((point,r,r*.90))
  o=rings('Body_'+name+'.'+side,levels,tan,name+'.'+side,12,'X' if 'arm' in name else 'Z')
 # Hands with thumb and finger silhouette, fitted elongated boots.
 hand=rig.data.bones['hand.'+side];p=(hand.head_local+hand.tail_local)/2
 form('glove.'+side,p,(.108,.061,.041),'hand.'+side,black,2)
 for offset in [-.025,0,.025]:form('glove_finger.'+side,p+Vector((s*.073,offset,0)),(.038,.012,.014),'hand.'+side,black,2)
 form('glove_thumb.'+side,p+Vector((-s*.025,.045,-.018)),(.045,.025,.023),'hand.'+side,black,2)
 for x,z,radius,width,bone in [(s*.754,1.32,.060,.032,'forearm.'+side),(s*.512,1.333,.081,.025,'forearm.'+side)]:
  rings('sleeve cuff',[((x-s*width/2,0,z),radius,radius),((x+s*width/2,0,z),radius,radius)],brown,bone,10,'X')
 for z,radius in [(.185,.074),(.72,.114)]:rings('trouser cuff',[((s*.13,0,z-.015),radius,radius*.95),((s*.13,0,z+.015),radius,radius*.95)],tan,'shin.'+side if z<.3 else 'thigh.'+side,10)
 rings('boot.'+side,[((s*.13,.065,.02),.083,.145),((s*.13,.065,.07),.091,.18),((s*.13,.00,.15),.054,.070),((s*.13,0,.20),.053,.055)],brown,'foot.'+side,8)
 rings('boot_sole.'+side,[((s*.13,.067,.01),.093,.182),((s*.13,.067,.035),.093,.182)],black,'foot.'+side,8)
# Build one connected body; reduce bridge volumes to match the reference.
cohesive_soldier.REFERENCE_PROPORTIONS=True
body=cohesive_soldier.rebuild(rig,form,[tan,core.mat('uniform light',(.35,.31,.23)),core.mat('uniform shade',(.28,.25,.18))],tan,core.OUT)
# Fitted armor follows the chest, rather than enclosing it in a cube.
rings('plate_carrier',[((0,.025,z),x,y) for z,x,y in [(.98,.18,.145),(1.10,.19,.151),(1.29,.202,.158),(1.40,.17,.142)]],brown,'spine',10)
rings('helmet',[((0,-.009,z),x,y) for z,x,y in [(1.655,.125,.121),(1.72,.124,.12),(1.78,.083,.083),(1.80,.025,.025)]],tan,'head',12)
rings('balaclava',[((0,.015,z),x,y) for z,x,y in [(1.51,.075,.072),(1.54,.091,.084),(1.59,.104,.095),(1.635,.11,.103)]],black,'head',10)
rings('hood_collar',[((0,0,z),x,y) for z,x,y in [(1.445,.17,.12),(1.475,.12,.10),(1.51,.082,.08)]],tan,'head',10)
attach(core.box('visor_frame',(0,.111,1.665),(.225,.049,.097),black,.026),'head')
attach(core.box('visor_glass',(0,.139,1.665),(.195,.027,.067),visor,.020),'head')
attach(core.box('mask_nose',(0,.115,1.61),(.052,.039,.047),black,.017),'head')
for s,side in [(-1,'L'),(1,'R')]:
 attach(core.box('ear_protection',(s*.125,0,1.63),(.04,.10,.115),pad,.020),'head')
 for z in [1.33,1.40]:attach(core.box('shoulder_webbing',(s*.17,.20,z),(.065,.046,.09),sage,.014),'spine')
 attach(core.box('shoulder_pad',(s*.30,0,1.44),(.14,.17,.038),sage,.016),'upper_arm.'+side)
 # Convex eight-sided wraparound knee shield, not a rectangular pad.
 outline=[(-.055,.108),(.055,.108),(.085,.063),(.08,-.067),(.042,-.105),(-.042,-.105),(-.08,-.067),(-.085,.063)]
 vertices=[(s*.13+x,y,.51+z) for y,scale in [(.080,1),(.13,.84)] for x,z in [(x*scale,z*scale) for x,z in outline]]
 faces=[tuple(range(8,16)),tuple(reversed(range(8)))]+[(i,(i+1)%8,(i+1)%8+8,i+8) for i in range(8)]
 mesh=bpy.data.meshes.new('knee shield');mesh.from_pydata(vertices,[],faces);mesh.update();o=bpy.data.objects.new('knee shield',mesh);bpy.context.collection.objects.link(o);mesh.materials.append(pad);attach(o,'shin.'+side)
 for z in [.44,.57]:rings('knee strap',[((s*.13,0,z-.012),.087,.083),((s*.13,0,z+.012),.087,.083)],brown,'shin.'+side,10)
 attach(core.box('thigh_pouch',(s*.225,.005,.72),(.13,.12,.19),sage,.025),'thigh.'+side)
 attach(core.box('thigh_flap',(s*.225,.066,.77),(.10,.027,.052),sage,.010),'thigh.'+side)
 attach(core.box('thigh_strap',(s*.13,.073,.72),(.16,.020,.032),brown,.005),'thigh.'+side)
 nvg=core.cyl('NVG_tube',(s*.031,.095,1.795),.019,.11,black,v=8);nvg.rotation_euler.x=-.25;attach(nvg,'head')
 attach(core.box('NVG_mount',(0,.109,1.747),(.043,.036,.073),black,.008),'head')
for x in [-.02,-.10,-.18]:
 attach(core.box('belt_magazine',(x,.15,.93),(.074,.080,.15),sage,.012),'pelvis')
 attach(core.box('magazine_flap',(x,.196,.974),(.070,.012,.052),sage,.007),'pelvis')
attach(core.box('belt',(0,.015,.94),(.345,.25,.047),brown,.02),'pelvis')
attach(core.box('backpack',(0,-.23,1.20),(.28,.22,.40),sage,.045),'spine')
for z in [1.07,1.26]:attach(core.box('backpack_compartment',(0,-.35,z),(.23,.055,.14),sage,.022),'spine')
for s in [-1,1]:
 attach(core.box('carrier_side_pouch',(s*.19,0,1.10),(.065,.13,.14),sage,.018),'spine')
 attach(core.box('carrier_shoulder_strap',(s*.17,.212,1.30),(.063,.028,.22),sage,.012),'spine')
for z in [1.10,1.18,1.26]:attach(core.box('carrier_seam',(0,.153,z),(.30,.012,.013),brown,.002),'spine')
verts=[]
for z,width,depth in [(1.03,.16,.17),(1.12,.175,.18),(1.29,.20,.183),(1.40,.16,.165)]:
 for x in [-width,0,width]:verts.append((x,depth+( .006 if x==0 else 0),z))
faces=[]
for row in range(3):
 for col in range(2):
  i=row*3+col;faces.extend([(i,i+1,i+3),(i+1,i+4,i+3)])
mesh=bpy.data.meshes.new('fitted carrier front');mesh.from_pydata(verts,[],faces);mesh.update();o=bpy.data.objects.new('fitted carrier front',mesh);bpy.context.collection.objects.link(o)
for c in [(.17,.14,.083),(.20,.17,.10),(.13,.105,.062)]:mesh.materials.append(core.mat('armor angular panel',c))
for p in mesh.polygons:p.material_index=p.index%3
attach(o,'spine')
for o in core.meshes():
 if o.name=='balaclava':
  for v in o.data.vertices:v.co.x*=1.10;v.co.y*=1.12
 if o.name=='helmet':
  for v in o.data.vertices:v.co.y*=1.12
 if o.name.startswith(('boot.','boot_sole.')):
  side=-1 if '.L' in o.name else 1
  for v in o.data.vertices:
   x=v.co.x-side*.13;y=v.co.y;angle=-side*.12;v.co.x=side*.13+x*math.cos(angle)-y*math.sin(angle);v.co.y=x*math.sin(angle)+y*math.cos(angle)
 if o.name.startswith(('belt_magazine','thigh_pouch','backpack','plate_carrier')):
  tri=o.modifiers.new('Equipment facets','TRIANGULATE');bpy.context.view_layer.objects.active=o;bpy.ops.object.modifier_apply(modifier=tri.name)
  shade=core.mat('equipment facet '+o.name,tuple(c*.80 for c in o.data.materials[0].diffuse_color[:3]));o.data.materials.append(shade)
  for p in o.data.polygons:p.material_index=1 if p.index%5==0 else 0
core.export('soldier')
for o in core.meshes():
 if o.name.startswith('Gear_'):o.hide_render=True
core.render('soldier')





