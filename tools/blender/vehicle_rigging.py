import bpy,math
from mathutils import Vector

def variants(name,box):
 if not name.startswith('vtol_'):return
 cargo=name=='vtol_cargo'
 for o in list(bpy.context.scene.objects):
  if o.type!='MESH':continue
  n=o.name
  remove=(n.startswith(('chin_weapon','chin_barrel','barrel_collar','chin_gimbal_stem')) if cargo else n.startswith(('supply_case','case_','cargo_depth','open_cargo','cargo_jamb','cargo_sill','cargo_wall','cargo_door','door_','belly_payload')))
  if remove:bpy.data.objects.remove(o,do_unlink=True);continue
  if not cargo:
   rotor=o.get('part','').startswith('rotor_')
   for v in o.data.vertices:
    p=o.matrix_world@v.co
    if rotor:p.z-=.42
    else:p.z=.25+(p.z-.25)*.72
    if n.startswith(('high_wing','wing_')):p.y+=.26*abs(p.x)-.53
    if rotor or n.startswith(('tilt_nacelle','nacelle_','navigation_light','rotor_pitch')):p.y+=.6
    v.co=p
   o.location=(0,0,0);o.rotation_euler=(0,0,0);o.scale=(1,1,1)
 if not cargo:
  for s in [-1,1]:
   box('attack_closed_side_panel',(s*1.054,-.1,1.18),(.035,2.2,.75),'shade',.035)
   box('attack_panel_inset',(s*1.077,-.1,1.18),(.02,1.96,.58),'paint',.025)
   for y in [-.85,.7]:box('attack_service_latch',(s*1.092,y,1.17),(.02,.1,.09),'steel')
 # New close-up references: lengthen the shared boat hull and flatten its shoulder section.
 for o in bpy.context.scene.objects:
  if o.type!='MESH':continue
  rotor=o.get('part','').startswith('rotor_')
  for v in o.data.vertices:
   p=o.matrix_world@v.co;p.y*=1.15
   p.z=(p.z-.246 if cargo else p.z-.204) if rotor else p.z*.9
   v.co=p
  o.location=(0,0,0);o.rotation_euler=(0,0,0);o.scale=(1,1,1)
 box('chisel_nose_panel',(0,4.10,1.55 if cargo else 1.18),(.57,.065,.68 if cargo else .5),'rubber',.035)


def assign(name,objs):
 meta={'hull':{'pivot':[0,0,0],'kind':'fixed'}}
 air=name in ['cas','fighter','vtol_cargo','vtol_attack']
 wheel_y=[-2.35,-1.57,-.79,0,.79,1.57,2.35] if name in ['tank','apc'] else [-1.32,1.4]
 for o in objs:
  stem=o.name.split('.')[0];p=o.matrix_world@(sum((v.co for v in o.data.vertices),Vector())/len(o.data.vertices));s='L' if p.x<0 else 'R';key=o.get('part','hull');kind='fixed';pivot=[0,0,0];parent=None;extra={}
  if key=='turret':kind='turret';pivot=[0,0,2.5] if name=='apc' else [0,-.25,1.8]
  if key.startswith('rotor_'):
   kind='rotor';pivot=[-4.1 if s=='L' else 4.1,3.7 if name=='vtol_attack' else 3.1,2.04 if name=='vtol_attack' else 2.46];parent='nacelle_'+s
  elif key=='propeller':kind='rotor';pivot=[0,3.66,1.64]
  elif name.startswith('vtol_') and stem.startswith(('tilt_nacelle','nacelle_','rotor_pitch','navigation_light')):
   key='nacelle_'+s;kind='nacelle';pivot=[-4.1 if s=='L' else 4.1,1.5 if name=='vtol_attack' else .9,2.04 if name=='vtol_attack' else 2.46]
  elif stem.startswith(('gun_base','gun_tube','fume_extractor','muzzle','bore','chin_weapon','chin_barrel','barrel_collar')):
   key='cannon';kind='recoil';pivot=[0,1.25,2.21] if name=='tank' else [0,2.36,.55];parent='turret' if name=='tank' else None
  elif name=='apc' and stem=='gun_barrel':key='cannon';kind='recoil';pivot=[.25,.96,3.04];parent='turret'
  elif name=='apc' and stem.startswith(('open_rear_ramp','ramp_grip')):key='ramp';kind='ramp';pivot=[0,-3.28,.87];extra={'closed':-2.14}
  elif name=='vtol_cargo' and stem.startswith(('cargo_door','door_inset','door_handle','door_warning')) and p.x<0:key='cargo_door';kind='door';pivot=[-1.065,-.1,1.55]
  elif not air and stem.startswith(('wheel','tire','hub','roadwheel','beadlock','chevron')):
   y=min(wheel_y,key=lambda y:abs(p.y-y));i=wheel_y.index(y);key=f'wheel_{s}_{i}';kind='wheel';pivot=[(-1 if s=='L' else 1)*(1.425 if name!='troop_transport' else .99),y,.69 if name!='troop_transport' else .56]
  elif name in ['tank','apc'] and stem.startswith(('track_shoe','track_end_shoe','track_rubber_pad')):
   key='track_'+s+'_'+str(sum(1 for k in meta if k.startswith('track_'+s)));kind='track';pivot=list(p)
   if abs(p.y)<=2.51:phase=p.y+2.5 if p.z>.7 else 5+math.pi*.66+2.5-p.y
   elif p.y>0:phase=5+.66*(math.pi/2-math.atan2(p.z-.72,p.y-2.5))
   else:
    a=math.atan2(p.z-.72,p.y+2.5);a=a-math.tau if a>0 else a;phase=10+math.pi*.66+.66*(-math.pi/2-a)
   extra={'phase':phase,'start':list(p)}
  elif air and stem.startswith(('gear','nose_gear','wheel','tire','hub','brake','torque','landing_oleo','strut_collar')):
   if name.startswith('vtol_'):key='skid_'+s;kind='gear';pivot=[(-.8 if s=='L' else .8),0,.9]
   else:key='gear_N' if abs(p.x)<.5 else 'gear_'+s;kind='gear';pivot=[0,2.6 if name=='cas' else 3.15,1.15] if abs(p.x)<.5 else [(-1 if s=='L' else 1)*(1.22 if name=='cas' else 1.35),-.65 if name=='cas' else -2.7,1.3]
  elif air and stem.startswith(('aileron','delta_control','wing_control','elevator')):key='control_'+s;kind='control';pivot=list(p)
  elif name in ['cas','fighter'] and stem.startswith(('underwing_store','missile','store_vertical','store_horizontal')):
   key='store_'+s+('_outer' if abs(p.x)>2.5 else '_inner');kind='store';pivot=[(-1 if s=='L' else 1)*(3.05 if name=='cas' else 3.4) if abs(p.x)>2.5 else (-1 if s=='L' else 1)*(1.6 if name=='cas' else 2.1),-.4 if name=='cas' else -2.1,.72 if name=='cas' else 1.27]
  if key not in meta:meta[key]={'pivot':[round(v,5) for v in pivot],'kind':kind,**({'parent':parent} if parent else {}),**extra}
  o['part']=key
 for key,m in list(meta.items()):
  if m.get('parent') and m['parent'] not in meta:meta[m['parent']]={'pivot':[m['pivot'][0],m['pivot'][1]-2.2,m['pivot'][2]],'kind':'nacelle'}
 clips=[{'id':'idle','label':'Rest pose','duration':2,'loop':True}]
 def clip(i,label,d,loop=False):clips.append({'id':i,'label':label,'duration':d,'loop':loop})
 if not air:clip('drive','Driving',2,True)
 if name in ['tank','apc','vtol_attack','cas','fighter']:clip('shoot','Shooting / weapon release',1.2)
 if name in ['tank','apc']:clip('aim','Turret traverse',4,True)
 if name in ['apc','vtol_cargo']:clip('open','Open ramp / cargo door',2);clip('close','Close ramp / cargo door',2)
 if air:clip('fly','Flying / control surfaces',4,True)
 if name!='fighter' and air:clip('rotors','Rotor / propeller operation',2,True)
 if name.startswith('vtol_'):clip('tilt','VTOL / cruise transition',3)
 if name in ['cas','fighter']:clip('gear','Landing gear retract',2);clip('gear_down','Landing gear deploy',2)
 if name.startswith('vtol_'):
  for m in meta.values():
   if m['kind'] in ['rotor','nacelle','door','recoil','gear']:m['pivot'][1]*=1.15;m['pivot'][2]*=.9
 return {'nodes':meta,'clips':clips,'variant':name}

def sample(kind,clip,t,duration,node):
 q=max(0,min(1,t/duration));rot=[0.,0.,0.];move=[0.,0.,0.]
 if kind=='ramp':rot[0]=node.get('closed',0)
 if clip=='drive':
  if kind=='wheel':rot[0]=-t*math.pi*4
  if kind=='track':
   def path(u):
    r=.66;u%=10+math.tau*r
    if u<5:return (-2.5+u,1.38,0)
    if u<5+math.pi*r:a=math.pi/2-(u-5)/r;return(2.5+r*math.cos(a),.72+r*math.sin(a),math.pi/2-a)
    if u<10+math.pi*r:return(2.5-(u-5-math.pi*r),.06,math.pi)
    a=-math.pi/2-(u-10-math.pi*r)/r;return(-2.5+r*math.cos(a),.72+r*math.sin(a),math.pi/2-a)
   y,z,a=path(node['phase']+t*(10+math.tau*.66)/duration);y0,z0,a0=path(node['phase']);move[1]=y-y0;move[2]=z-z0;rot[0]=a-a0
 if clip=='aim' and kind=='turret':rot[2]=math.sin(q*math.tau)*.7
 if clip=='shoot':
  if kind=='recoil':move[1]=-.24*max(0,1-abs(t-.12)/.12)
  if kind=='store':move[1]=max(0,t-.2)*7;move[2]=-max(0,t-.2)*.5
 if clip in ['open','close']:
  amount=q if clip=='open' else 1-q
  if kind=='ramp':rot[0]=node.get('closed',0)*(1-amount)
  if kind=='door':move[1]=-amount*2.2
 if clip in ['fly','rotors'] and kind=='rotor':rot[1]=t*math.tau*4
 if clip=='fly' and kind=='control':rot[0]=math.sin(q*math.tau)*.2
 if clip=='tilt' and kind=='nacelle':rot[0]=q*math.pi/2
 if clip in ['gear','gear_down'] and kind=='gear':
  amount=(q if clip=='gear' else 1-q)*math.pi/2
  if abs(node['pivot'][0])<.5:rot[0]=-amount
  else:rot[1]=amount*(1 if node['pivot'][0]>0 else -1)
 return move,rot

def animations(root,groups,rig):
 scene=bpy.context.scene;scene.render.fps=24
 for key,o in groups.items():
  node=rig['nodes'][key];base=o.location.copy();o['rig_kind']=node['kind'];o['rig_pivot']=node['pivot']
  if node['kind']=='fixed' and key!='hull':continue
  o.animation_data_create()
  for clip in rig['clips']:
   allowed={'fixed':['idle'],'wheel':['drive'],'track':['drive'],'turret':['aim'],'recoil':['shoot'],'door':['open','close'],'ramp':['open','close'],'rotor':['rotors','fly'],'nacelle':['tilt'],'control':['fly'],'store':['shoot'],'gear':['gear','gear_down']}
   if clip['id'] not in allowed.get(node['kind'],[]):continue
   o.animation_data.action=None
   for i in range(25):
    t=i*clip['duration']/24;move,rot=sample(node['kind'],clip['id'],t,clip['duration'],node);o.location=base+Vector(move);o.rotation_euler=rot;o.keyframe_insert('location',frame=1+t*24);o.keyframe_insert('rotation_euler',frame=1+t*24)
   action=o.animation_data.action;action.name=clip['id']+'__'+key;action.use_fake_user=True
   track=o.animation_data.nla_tracks.new();track.name=clip['id'];strip=track.strips.new(clip['id'],1,action);strip.extrapolation='NOTHING'
  o.animation_data.action=None;o.location=base;o.rotation_euler=(0,0,0)
 root['animation_clips']=[c['id'] for c in rig['clips']]
 scene.frame_set(0)


def repair_glb_pose(path,rig):
 # NLA export clears static defaults on animated empties at frame zero. Preserve the authored assembly.
 import struct,json
 raw=open(path,'rb').read();length=struct.unpack_from('<I',raw,12)[0];doc=json.loads(raw[20:20+length]);tail=raw[20+length:]
 for node in doc['nodes']:
  key=node.get('name','').removeprefix('Assembly_')
  if not node.get('name','').startswith('Assembly_') or key not in rig['nodes']:continue
  m=rig['nodes'][key];parent=rig['nodes'][m['parent']]['pivot'] if m.get('parent') else [0,0,0]
  node.pop('matrix',None);node['translation']=[m['pivot'][i]-parent[i] for i in range(3)];node['rotation']=[0,0,0,1];node['scale']=[1,1,1]
 data=json.dumps(doc,separators=(',',':')).encode();data+=b' '*((-len(data))%4)
 open(path,'wb').write(struct.pack('<III',0x46546c67,2,20+len(data)+len(tail))+struct.pack('<II',len(data),0x4e4f534a)+data+tail)
