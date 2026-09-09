"""Astra 2: reference-led MEC handler and modular soldier asset builder."""
import bpy, math, os, sys, json, random
from mathutils import Vector, Matrix
ROOT=os.path.abspath(os.path.join(os.path.dirname(__file__),'../..'))
OUT=os.path.abspath(os.path.join(ROOT,'../../outputs/astra_2'))
REV=int(os.environ.get('ASSET_REV','8'))
os.makedirs(OUT,exist_ok=True)
def mat(n,c):
 m=bpy.data.materials.new(n);m.diffuse_color=(*c,1);m.use_nodes=True;m.node_tree.nodes['Principled BSDF'].inputs['Base Color'].default_value=(*c,1);m.node_tree.nodes['Principled BSDF'].inputs['Roughness'].default_value=.82;return m
def box(n,p,s,m,b=.015):
 bpy.ops.mesh.primitive_cube_add(size=1,location=p);o=bpy.context.object;o.name=n;o.scale=s;bpy.ops.object.transform_apply(location=False,rotation=False,scale=True);o.data.materials.append(m)
 if b:
  mod=o.modifiers.new('single facet chamfer','BEVEL');mod.width=b;mod.segments=1;bpy.ops.object.modifier_apply(modifier=mod.name)
 return o
def cyl(n,p,r,d,m,axis='Z',v=16):
 bpy.ops.mesh.primitive_cylinder_add(vertices=v,radius=r,depth=d,location=p);o=bpy.context.object;o.name=n;o.data.materials.append(m)
 if axis=='X':o.rotation_euler.y=math.pi/2
 return o
def beam(n,a,b,w,m):
 a,b=Vector(a),Vector(b);o=box(n,(a+b)/2,(w,w,(b-a).length),m,w*.12);o.rotation_euler=(b-a).to_track_quat('Z','Y').to_euler();return o
def group(n,p,objects,parent=None):
 o=bpy.data.objects.new(n,None);bpy.context.collection.objects.link(o);o.location=p;bpy.context.view_layer.update()
 for c in objects:
  world=c.matrix_world.copy();c.parent=o;c.matrix_world=world
 if parent:
  world=o.matrix_world.copy();o.parent=parent;o.matrix_world=world
 return o
def meshes():return [o for o in bpy.context.scene.objects if o.type=='MESH']
def key_action(o,name,path,values):
 o.animation_data_create();o.animation_data.action=bpy.data.actions.new(name)
 rest=getattr(o,path).copy()
 for frame,value in values:
  setattr(o,path,value);o.keyframe_insert(data_path=path,frame=frame)
 action=o.animation_data.action;action.use_fake_user=True;track=o.animation_data.nla_tracks.new();track.name='drive' if name.startswith('drive_') else 'steer' if name.startswith('steer_') else name;track.strips.new(action.name,1,action);o.animation_data.action=None;setattr(o,path,rest)
def export(n):
 obs=meshes();tri=0
 for o in obs:o.data.calc_loop_triangles();tri+=len(o.data.loop_triangles)
 bpy.ops.object.select_all(action='DESELECT')
 for o in bpy.context.scene.objects:
  if o.type in ['MESH','EMPTY','ARMATURE']:o.select_set(True)
 bpy.ops.export_scene.gltf(filepath=os.path.join(ROOT,'public/models',n+'.glb'),export_format='GLB',use_selection=True,export_extras=True,export_yup=(n=='soldier'),export_animations=True,export_skins=True,export_animation_mode='NLA_TRACKS' if n=='mec_lift' else 'ACTIONS')
 if n=='mec_lift':
  for o in bpy.context.scene.objects:
   if o.animation_data:
    for t in o.animation_data.nla_tracks:t.mute=True
  bpy.context.scene.frame_set(1)
 with open(os.path.join(OUT,n+'_stats.json'),'w') as f:json.dump({'triangles':tri,'mesh_objects':len(obs),'revision':REV,'animations':[a.name for a in bpy.data.actions]},f,indent=2)
 print('ASSET_STATS',n,tri,flush=True)
def render(n):
 scene=bpy.context.scene;scene.render.engine='BLENDER_EEVEE_NEXT';scene.eevee.taa_render_samples=16;scene.render.resolution_x=640;scene.render.resolution_y=640;scene.render.resolution_percentage=100;scene.render.image_settings.file_format='PNG';scene.view_settings.view_transform='Standard'
 world=bpy.data.worlds.new('Review');world.use_nodes=True;world.node_tree.nodes['Background'].inputs[0].default_value=(.20,.23,.27,1);world.node_tree.nodes['Background'].inputs[1].default_value=.65;scene.world=world
 bpy.context.view_layer.update();coords=[o.matrix_world@Vector(c) for o in meshes() for c in o.bound_box];lo=Vector([min(c[i] for c in coords) for i in range(3)]);hi=Vector([max(c[i] for c in coords) for i in range(3)]);center=(lo+hi)/2
 for p,power in [((5,8,10),1400),((-6,3,6),1100),((0,-6,8),1500)]:
  bpy.ops.object.light_add(type='AREA',location=p);o=bpy.context.object;o.data.energy=power;o.data.shape='DISK';o.data.size=7;o.rotation_euler=(center-o.location).to_track_quat('-Z','Y').to_euler()
 bpy.ops.object.camera_add();cam=bpy.context.object;cam.data.type='ORTHO';scene.camera=cam
 for view,d in {'front':(0,15,0),'side':(15,0,0),'back':(0,-15,0),'top':(0,0,15),'top_3quarter':(10,14,12)}.items():
  cam.location=center+Vector(d);cam.rotation_euler=(center-cam.location).to_track_quat('-Z','Y').to_euler();bpy.context.view_layer.update();cc=[cam.matrix_world.inverted()@c for c in coords];cam.data.ortho_scale=max(max(v.x for v in cc)-min(v.x for v in cc),max(v.y for v in cc)-min(v.y for v in cc))*1.18;scene.render.filepath=os.path.join(OUT,f'{n}_r{REV}_{view}.png');bpy.ops.render.render(write_still=True)
 bpy.ops.wm.save_as_mainfile(filepath=os.path.join(OUT,n+'.blend'))
def mec():
 bpy.ops.wm.read_factory_settings(use_empty=True)
 olive=mat('NATO olive',(.25,.29,.19));dark=mat('tire rubber',(.037,.043,.037));steel=mat('hydraulic steel',(.24,.28,.28));glass=mat('armored blue glass',(.075,.19,.23));light=mat('lamp ivory',(.8,.79,.56));red=mat('rear lamps',(.5,.045,.025))
 box('low armored chassis',(0,-.25,.68),(2.12,3.9,.66),olive,.12);box('rear counterweight',(0,-1.7,1.16),(2.05,.9,.58),olive,.09)
 for s in [-1,1]:
  box('side sill',(s*1.02,-.25,.72),(.12,2.6,.62),olive,.035)
  for y in [-1.5,1.35]:
   parts=[cyl('pneumatic tire',(s*1.03,y,.66),.66,.46,dark,'X',24),cyl('rim dish',(s*1.28,y,.66),.37,.025,steel,'X',16),cyl('hub',(s*1.31,y,.66),.20,.05,olive,'X',16)]
   for j in range(24):
    a=j*math.tau/24;o=box('traction block',(s*1.03,y+math.sin(a)*.655,.66+math.cos(a)*.655),(.47,.14,.07),dark,.008);o.rotation_euler.x=-a;parts.append(o)
   for j in range(8):
    a=j*math.tau/8;parts.append(cyl('wheel bolt',(s*1.335,y+math.sin(a)*.27,.66+math.cos(a)*.27),.028,.026,steel,'X',6))
   steer=group(f'steer_{s}_{y}',(s*1.03,y,.66),[]);group(f'wheel_{s}_{y}',(s*1.03,y,.66),parts,steer);steer['axis']='Z';steer['limit_degrees']=32
   box('fender',(s*.98,y,1.29),(.62,1.3,.10),olive,.035)
 box('cab lower',(-.49,.42,1.18),(.94,1.25,.64),olive,.04)
 box('front glazing',(-.49,1.07,1.96),(.84,.035,.90),glass,.025);box('rear glazing',(-.49,-.22,1.96),(.84,.03,.9),glass,.02)
 for x in [-.97,-.01]:
  box('side glazing',(x,.43,1.96),(.03,1.18,.9),glass,.02)
  for y in [-.23,1.08]:beam('cab post',(x,y,1.4),(x,y,2.47),.065,olive)
  box('door waist',(x,.43,1.5),(.05,1.25,.06),olive);box('door handle',(x,.03,1.42),(.08,.18,.04),steel)
 box('cab roof',(-.49,.43,2.47),(1.05,1.46,.10),olive,.035)
 for s in [-1,1]:
  box('headlamp',(s*.84,1.81,1.35),(.22,.07,.16),light);box('tail lamp',(s*.80,-2.17,1.15),(.22,.055,.12),red)
  for j in range(8):box('engine louvre',(s*1.07,-1.28+j*.10,1.13),(.026,.04,.25),dark,.0)
  beam('hydraulic ram sleeve',(s*.60,-1.3,1.10),(s*.60,.05,2.05),.16,olive);beam('hydraulic chrome piston',(s*.60,.05,2.05),(s*.60,.60,2.45),.085,steel)
 a=Vector((.36,-1.60,1.60));b=Vector((.36,1.45,3.05));parts=[beam('outer telescopic boom',a,b,.43,olive)]
 pivot=group('boom_pivot',a,parts);pivot['axis']='X';pivot['range_degrees']=[-12,40]
 ext=group('telescope',(0,0,0),[beam('inner telescopic boom',b-Vector((0,.42,.20)),(.36,2.3,3.45),.29,steel)],pivot);ext['travel_vector']=[0,1.3,.62]
 carriage=group('fork_carriage',(0,2.34,3.25),[],ext)
 for x in [-.86,.86]:
  group('fork tine', (0,0,0),[box('fork upright',(x,2.35,2.96),(.15,.16,.92),steel),box('long fork',(x,3.1,2.53),(.17,1.65,.11),steel,.025)],carriage)
 for z in [2.72,3.40]:group('cross rail',(0,0,0),[box('carriage rail',(0,2.37,z),(2.25,.19,.16),steel)],carriage)
 carriage['tilt_axis']='X';carriage['lift_travel']=.65
 if REV>=2:
  for s in [-1,1]:
   for y in [-1.5,1.35]:
    for j in range(24):
     a=j*math.tau/24;o=box('tire shoulder lug',(s*1.255,y+math.sin(a)*.56,.66+math.cos(a)*.56),(.05,.105,.105),dark,.012);o.rotation_euler.x=-a;bpy.context.view_layer.update();world=o.matrix_world.copy();o.parent=bpy.data.objects[f'wheel_{s}_{y}'];o.matrix_world=world
   for y in [-.85,-.4,.05]:
    box('entry step',(s*1.13,y,.62),(.24,.24,.055),steel,.01)
   for j in range(7):
    cyl('chassis fastener',(s*1.095,-1.10+j*.34,.85),.026,.025,steel,'X',6)
  for z in [2.82,3.0,3.18]:group('load backrest bar',(0,0,0),[box('load guard',(0,2.40,z),(2.08,.07,.045),steel,.008)],carriage)
  for x in [-.48,0,.48]:group('load backrest upright',(0,0,0),[box('guard upright',(x,2.40,3.06),(.045,.07,.72),steel,.007)],carriage)
  cyl('boom pivot pin',(.36,-1.60,1.60),.18,.65,steel,'X',16)
  for y in [-1.90,-1.65,-1.4]:box('counterweight cooling slot',(0,y,1.47),(1.52,.09,.02),dark,.0)
  box('cab window mullion',(-.99,.43,1.96),(.055,.055,.90),olive)
  beam('windshield wiper',(-.80,1.105,1.57),(-.40,1.105,2.10),.025,dark)
  for x in [-1.06,.08]:beam('mirror stalk',(x,.82,2.25),(x*1.18,.98,2.34),.04,steel);box('mirror',(x*1.18,.98,2.34),(.07,.19,.22),dark)
 if REV>=3:
  for o in list(bpy.context.scene.objects):
   if o.name.startswith('wheel_'):key_action(o,'drive_'+o.name,'rotation_euler',[(1,(0,0,0)),(49,(math.tau,0,0))]);o['drive_axis']='X'
   if o.name.startswith('steer_'):key_action(o,'steer_'+o.name,'rotation_euler',[(1,(0,0,0)),(25,(0,0,.45)),(49,(0,0,0))])
  key_action(pivot,'boom_raise','rotation_euler',[(1,(0,0,0)),(49,(.35,0,0))])
  p=ext.location.copy();key_action(ext,'boom_extend','location',[(1,p),(49,p+Vector((0,1.3,.62)))])
  p=carriage.location.copy();key_action(carriage,'carriage_lift','location',[(1,p),(49,p+Vector((0,0,.65)))])
  key_action(carriage,'carriage_tilt','rotation_euler',[(1,(0,0,0)),(49,(-.18,0,0))])
  for s in [-1,1]:
   base=Vector((s*.60,-1.3,1.10));tip=Vector((s*.60,.60,2.45))
   for stem,is_rod in [('hydraulic ram sleeve',False),('hydraulic chrome piston',True)]:
    candidates=[o for o in meshes() if o.name.startswith(stem)];o=min(candidates,key=lambda o:abs(o.location.x-s*.60));rest=(o.location.copy(),o.rotation_euler.copy(),o.scale.copy());length=max(v.co.z for v in o.data.vertices)-min(v.co.z for v in o.data.vertices)
    o.animation_data_create();action=bpy.data.actions.new('hydraulics_'+o.name);o.animation_data.action=action
    for f in range(1,50,4):
     target=pivot.location+Matrix.Rotation(.35*(f-1)/48,3,'X')@(tip-pivot.location);direction=(target-base).normalized();start=base+direction*1.45 if is_rod else base;end=target if is_rod else base+direction*1.65
     o.location=(start+end)/2;o.rotation_euler=(end-start).to_track_quat('Z','Y').to_euler();o.scale.z=(end-start).length/length
     for path in ['location','rotation_euler','scale']:o.keyframe_insert(data_path=path,frame=f)
    track=o.animation_data.nla_tracks.new();track.name='boom_raise';track.strips.new(action.name,1,action);o.animation_data.action=None;o.location,o.rotation_euler,o.scale=rest
 export('mec_lift');render('mec_lift')
def soldier():
 bpy.ops.wm.open_mainfile(filepath=os.path.join(ROOT,'assets/blender/soldier_base.blend'))
 rig=bpy.data.objects['GC_Soldier_Rig'];rig.animation_data.action=None
 for t in rig.animation_data.nla_tracks:t.mute=True
 for b in rig.pose.bones:b.matrix_basis.identity()
 bpy.context.scene.frame_set(1)
 cloth=mat('sage gear',(.39,.44,.25));armor=mat('coyote armor',(.31,.29,.20));black=mat('graphite polymer',(.055,.061,.05));glass=mat('visor smoked',(.018,.032,.035))
 def attach(o,bone):
  vg=o.vertex_groups.new(name=bone);vg.add(list(range(len(o.data.vertices))),1,'REPLACE');mod=o.modifiers.new('GC modular skin','ARMATURE');mod.object=rig;o.parent=rig;o['module']=o.name
 if REV>=2:
  bpy.data.objects.remove(bpy.data.objects['GC_Soldier_Body'],do_unlink=True)
  camo=[mat('camo olive',(.27,.30,.18)),mat('camo khaki',(.43,.40,.28)),mat('camo deep',(.13,.16,.10))];skin=mat('face skin',(.42,.31,.22));random.seed(17)
  def form(n,p,scale,bone,material,sub=2):
   bpy.ops.mesh.primitive_ico_sphere_add(subdivisions=sub,radius=1,location=p);o=bpy.context.object;o.name=n;o.scale=scale;bpy.ops.object.transform_apply(location=False,rotation=False,scale=True);o.data.materials.append(material)
   if material==camo[0]:
    for m in camo[1:]:o.data.materials.append(m)
    for poly in o.data.polygons:
     p=poly.center;v=math.sin(p.x*37+p.z*24)*math.cos(p.y*31-p.z*21);poly.material_index=1 if v>.36 else 2 if v<-.50 else 0
   attach(o,bone);return o
  form('Body_torso',(0,0,1.20),(.255,.15,.28),'spine',camo[0],2)
  form('Body_pelvis',(0,0,.91),(.22,.14,.15),'pelvis',camo[0],2)
  form('Body_head',(0,0,1.61),(.135,.13,.17),'head',skin,2)
  form('Module_helmet',(0,-.015,1.71),(.166,.161,.119),'head',cloth,2)
  form('Module_balaclava',(0,.011,1.55),(.138,.136,.075),'head',black,2)
  for side in ['L','R']:
   for bone,width in [('upper_arm',.105),('forearm',.087),('thigh',.12),('shin',.097)]:
    b=rig.data.bones[bone+'.'+side];a,c=b.head_local,b.tail_local;length=(c-a).length*.55;o=form('Body_'+bone+'.'+side,(a+c)/2,(width,width,length),bone+'.'+side,camo[0],4 if bone in ['thigh','upper_arm'] else 3);o.rotation_euler=(c-a).to_track_quat('Z','Y').to_euler()
    if REV>=5:
     for v in o.data.vertices:
      z=v.co.z/length;factor=min(2.6,(.80+.10*z)/max(.2,math.sqrt(max(0,1-z*z))));v.co.x*=factor;v.co.y*=factor
   b=rig.data.bones['hand.'+side];form('Module_glove.'+side,(b.head_local+b.tail_local)/2,(.09,.072,.059),'hand.'+side,black,2)
   s=-1 if side=='L' else 1;attach(box('Module_boot.'+side,(s*.13,.06,.085),(.19,.32,.16),black,.03),'foot.'+side)
 if REV>=7:
  sys.path.insert(0,os.path.dirname(__file__))
  from cohesive_soldier import rebuild
  rebuild(rig,form,camo,skin,OUT)
 attach(box('Module_plate_carrier',(0,.145,1.24),(.40 if REV>=7 else .46,.10 if REV>=7 else .15,.32 if REV>=7 else .36),armor,.045),'spine')
 attach(box('Module_backpack',(0,-.20,1.22),(.39,.20,.41),cloth,.055),'spine')
 for s in [-1,1]:
  side='R' if s>0 else 'L'
  attach(box('Module_shoulder_'+side,(s*.29,0,1.405),(.15,.20,.07) if REV>=7 else (.19,.26,.14),cloth,.035),'upper_arm.'+side)
  attach(box('Module_kneepad_'+side,(s*.13,.10,.51),(.18,.09,.21),black,.035),'shin.'+side)
  attach(box('Module_thigh_pouch_'+side,(s*.23,.02,.78),(.13,.15,.18),cloth,.025),'thigh.'+side)
  attach(box('Module_strap_'+side,(s*.15,.18,1.4),(.065,.04,.19),cloth,.012),'spine')
 for i in [-1,0,1]:
  attach(box('Module_magazine_pouch_'+str(i),(i*.125,.235,1.14),(.105,.095,.17),cloth,.014),'spine')
  attach(box('pouch flap',(i*.125,.289,1.19),(.10,.014,.045),armor,.004),'spine')
 attach(box('Module_visor',(0,.158,1.64),(.27,.075,.105),glass,.025),'head')
 for s in [-1,1]:
  attach(box('Module_earcup',(s*.16,0,1.64),(.06,.12,.11),black,.018),'head')
  nvg=cyl('Module_NVG',(s*.055,.155,1.78),.029,.10,black,v=8);nvg.rotation_euler.x=math.pi/2;attach(nvg,'head')
 if REV>=5:
  for z in [1.12,1.29]:attach(box('Module_backpack_compartment',(0,-.315,z),(.31,.08,.13),cloth,.025),'spine')
  for s in [-1,1]:
   for z in [1.14,1.28]:attach(box('carrier_webbing',(s*.16,.225,z),(.06,.025,.025),black,.004),'spine')
  attach(box('NVG_mount',(0,.105,1.77),(.14,.10,.045),black,.012),'head')
 for o in meshes():
  for p in o.data.polygons:p.use_smooth=False
 export('soldier')
 for o in meshes():
  if o.name.startswith('Gear_'):o.hide_render=True
 render('soldier')
if __name__=='__main__':
 name=sys.argv[-1]
 if name=='mec':mec()
 else:soldier()







