import bpy, math, os, json, sys, base64, struct
sys.path.insert(0,os.path.dirname(__file__))
import vehicle_rigging
from mathutils import Vector
BASE=os.path.abspath(os.path.join(os.path.dirname(__file__),'../..'))
REPO=os.environ.get('GC_REPO',BASE if os.path.exists(os.path.join(BASE,'package.json')) else os.path.join(BASE,'work/grid_command'))
OUT=os.environ.get('GC_OUTPUT_DIR',os.path.join(BASE,'assets/blender/vehicles') if REPO==BASE else os.path.join(BASE,'outputs/vehicle_models'))
os.makedirs(OUT,exist_ok=True)
REV=int(os.environ.get('GC_REV','1'))
M={}; PART='hull'
def mat(n,c):
 m=bpy.data.materials.new(n);m.diffuse_color=(*c,1);m.use_nodes=True
 p=m.node_tree.nodes.get('Principled BSDF');p.inputs['Base Color'].default_value=(*c,1);p.inputs['Roughness'].default_value=.82
 M[n]=m
def finish(o,n,m):
 o.name=n;o.data.materials.append(M[m]);o['part']=PART
 return o
def box(n,loc,dim,m='paint',bev=0):
 bpy.ops.mesh.primitive_cube_add(size=1,location=loc);o=bpy.context.object;o.dimensions=dim;bpy.ops.object.transform_apply(location=False,rotation=False,scale=True)
 if bev:
  mod=o.modifiers.new('single_chamfer','BEVEL');mod.width=bev;mod.segments=1;bpy.ops.object.modifier_apply(modifier=mod.name)
 return finish(o,n,m)
def mesh(n,vs,fs,m='paint'):
 d=bpy.data.meshes.new(n);d.from_pydata(vs,[],fs);d.update();o=bpy.data.objects.new(n,d);bpy.context.collection.objects.link(o);return finish(o,n,m)
def rod(n,a,b,r,m='steel',v=8,r2=None):
 a,b=Vector(a),Vector(b);bpy.ops.mesh.primitive_cone_add(vertices=v,radius1=r,radius2=r if r2 is None else r2,depth=(b-a).length,location=(a+b)/2);o=bpy.context.object;o.rotation_euler=(b-a).to_track_quat('Z','Y').to_euler();return finish(o,n,m)
def shell(n,rings,m='paint'):
 # rings: z, width, length, longitudinal center. Eight corner chamfers.
 vs=[]
 for z,w,d,y in rings:
  for x,yy in [(-.38,-.5),(.38,-.5),(.5,-.38),(.5,.38),(.38,.5),(-.38,.5),(-.5,.38),(-.5,-.38)]:vs.append((x*w,yy*d+y,z))
 fs=[tuple(reversed(range(8))),tuple(range((len(rings)-1)*8,len(rings)*8))]
 for j in range(len(rings)-1):
  for i in range(8):a=j*8+i;b=j*8+(i+1)%8;fs.append((a,b,b+8,a+8))
 return mesh(n,vs,fs,m)
def fus(n,rings,m='paint',x=0):
 # y, halfwidth, halfheight, z center: elliptical faceted cross sections
 vs=[];N=12
 for y,w,h,z in rings:
  for i in range(N):t=2*math.pi*i/N;vs.append((x+math.cos(t)*w,y,z+math.sin(t)*h))
 fs=[tuple(reversed(range(N))),tuple(range((len(rings)-1)*N,len(rings)*N))]
 for j in range(len(rings)-1):
  for i in range(N):a=j*N+i;b=j*N+(i+1)%N;fs.append((a,a+N,b+N,b))
 return mesh(n,vs,fs,m)
def plate(n,points,z,t=.08,m='paint'):
 N=len(points);vs=[(x,y,z+dz) for dz in [-t/2,t/2] for x,y in points];fs=[tuple(reversed(range(N))),tuple(range(N,2*N))]+[(i,(i+1)%N,(i+1)%N+N,i+N) for i in range(N)];return mesh(n,vs,fs,m)
def fin(n,points,x,t=.08,m='paint'):
 N=len(points);vs=[(x+dx,y,z) for dx in [-t/2,t/2] for y,z in points];fs=[tuple(reversed(range(N))),tuple(range(N,2*N))]+[(i,(i+1)%N,(i+1)%N+N,i+N) for i in range(N)];return mesh(n,vs,fs,m)
def wheel(x,y,z,r=.5,w=.3,tread=False):
 rod('tire',(x-w/2,y,z),(x+w/2,y,z),r,'rubber',16)
 for s in [-1,1]:
  xx=x+s*(w/2+.012);rod('wheel_rim',(xx,y,z),(xx+s*.025,y,z),r*.66,'shade',12);rod('hub',(xx,y,z),(xx+s*.055,y,z),r*.21,'steel',8)
 if tread:
  for i in range(20):
   a=i*math.tau/20;o=box('tire_lug',(x,y+math.sin(a)*r,z+math.cos(a)*r),(w*1.05,.12,.045),'rubber');o.rotation_euler.x=-a
def tracks(w=3.55,length=6.8):
 for s in [-1,1]:
  x=s*(w/2-.35)
  for y in [-2.35,-1.57,-.79,0,.79,1.57,2.35]:wheel(x,y,.69,.52,.58)
  # Capsule track loop, actual links, continuous inner belt side silhouette.
  for side in [-1,1]:
   xx=x+side*.31
   pts=[]
   for cy,a0 in [(2.5,-math.pi/2),(-2.5,math.pi/2)]:
    for i in range(9):a=a0+i*math.pi/8;pts.append((cy+math.cos(a)*.67,.72+math.sin(a)*.67))
   # side annulus explicitly uses matching outer/inner contour
   vs=[(xx,y,z) for y,z in pts]+[(xx,y*.985,.72+(z-.72)*.82) for y,z in pts];N=len(pts)
   mesh('track_belt',vs,[(i,(i+1)%N,(i+1)%N+N,i+N) for i in range(N)],'rubber')
  for y in [i*.25 for i in range(-10,11)]:
   for z in [.07,1.37]:box('track_shoe',(x,y,z),(.68,.21,.09),'steel')
  for yy,sign in [(-2.5,-1),(2.5,1)]:
   for i in range(1,8):
    a=-math.pi/2+i*math.pi/8;y=yy+sign*math.cos(a)*.66;z=.72+math.sin(a)*.66;o=box('track_end_shoe',(x,y,z),(.68,.22,.1),'steel');o.rotation_euler.x=sign*(math.pi/2-a)
def railbox(x,y,z,w,d,h):
 for zz in [z,z+h]:
  rod('basket_rail',(x-w/2,y-d/2,zz),(x+w/2,y-d/2,zz),.024)
  for s in [-1,1]:rod('basket_side',(x+s*w/2,y-d/2,zz),(x+s*w/2,y+d/2,zz),.024)
 for xx in [x-w/2,x,x+w/2]:rod('basket_post',(xx,y-d/2,z),(xx,y-d/2,z+h),.025)
def hatch(x,y,z,r=.32):
 rod('hatch_coaming',(x,y,z),(x,y,z+.07),r,'shade',16);rod('hatch_lid',(x,y,z+.07),(x,y,z+.11),r*.88,'paint',16);rod('hatch_handle',(x-.1,y,z+.15),(x+.1,y,z+.15),.025)
def tank():
 global PART
 tracks();shell('lower_hull',[(.5,2.75,6.4,0),(1.3,3.35,7,0)])
 shell('sloped_upper_hull',[(1.25,3.6,7.2,0),(1.67,3.35,6.2,-.23)])
 for s in [-1,1]:
  for i in range(7):box('side_skirt_panel',(s*1.78,-2.65+i*.86,1.18),(.13,.82,.76),'paint',.025)
  for y in [-2.5,2.65]:box('fender_access',(s*1.3,y,1.735),(.7,.68,.055),'light',.018)
  box('headlight',(s*1.35,3.35,1.36),(.24,.09,.16),'lamp')
  rod('tow_lug',(s*.95,3.48,1),(s*.95,3.64,1),.11,'shade')
 for i in range(12):box('engine_grille',(0,-2.56+i*.09,1.704),(1.75,.045,.035),'rubber')
 PART='turret';rod('turret_ring',(0,-.25,1.64),(0,-.25,1.82),1.18,'shade',24)
 shell('turret_faceted',[(1.8,2.55,3.6,-.34),(2.12,3.02,3.7,-.42),(2.66,2.38,2.95,-.6)])
 box('mantlet',(0,1.25,2.19),(.74,.57,.55),'shade',.09)
 rod('gun_base',(0,1.35,2.21),(0,2.52,2.21),.16,'paint',12);rod('gun_tube',(0,2.5,2.21),(0,5.05,2.21),.089,'paint',12)
 rod('fume_extractor',(0,2.55,2.21),(0,3.2,2.21),.135,'light',12);rod('muzzle',(0,5,2.21),(0,5.22,2.21),.115,'shade',12);rod('bore',(0,5.222,2.21),(0,5.226,2.21),.074,'rubber',12)
 hatch(-.55,-.18,2.64,.36);hatch(.57,-.55,2.64,.31)
 box('commander_sight',(-.68,.3,2.88),(.31,.32,.4),'shade',.035);box('sight_glass',(-.68,.467,2.91),(.24,.02,.12),'glass')
 rod('mg_pedestal',(.55,-.45,2.73),(.55,-.45,3.05),.07);box('machine_gun',(.55,-.13,3.07),(.12,.5,.14),'rubber');rod('mg_barrel',(.55,.08,3.09),(.55,.8,3.09),.027,'rubber')
 railbox(0,-1.75,2.37,2.65,.7,.52)
 for s in [-1,1]:
  rod('antenna',(s*1,-1.35,2.62),(s*1,-1.35,3.85),.012,'rubber')
  for i in range(4):rod('smoke_launcher',(s*1.36,.12-i*.17,2.28),(s*1.48,.24-i*.17,2.45),.055,'shade')
 PART='hull'
def buggy():
 box('chassis',(0,0,.58),(1.75,3.65,.2),'rubber');box('floor',(0,-.3,.85),(1.87,2.75,.12),'paint')
 for s in [-1,1]:
  for y in [-1.32,1.4]:
   wheel(s*.99,y,.56,.55,.33,True);rod('axle',(0,y,.55),(s*.92,y,.55),.09)
   box('fender',(s*.92,y,1.15),(.48,.92,.12),'paint',.06)
  box('rock_slider',(s*.92,-.35,.86),(.12,2.5,.18),'shade')
  for y in [-1.4,-.25,.78]:rod('roll_cage_upright',(s*.84,y,.93),(s*.82,y-.23,2.08),.038,'paint')
  rod('roof_longitudinal',(s*.82,-1.7,2.08),(s*.82,.55,2.08),.045,'paint')
  rod('rear_diagonal',(s*.83,-1.58,.98),(s*.82,-.35,2.08),.033,'shade')
 for y in [-1.65,-.48,.55]:rod('roof_crossbar',(-.82,y,2.08),(.82,y,2.08),.04,'paint')
 shell('angular_hood',[(1,1.9,1.12,1.26),(1.43,1.72,1.08,1.2)],'paint')
 box('grille',(0,1.833,1.13),(1.15,.04,.27),'rubber')
 for i in range(6):box('grille_slat',(0,1.86,1.02+i*.045),(1.12,.025,.016),'steel')
 box('front_bumper',(0,1.99,.85),(2,.15,.18),'shade',.025)
 for s in [-1,1]:
  box('headlight',(s*.69,1.79,1.3),(.29,.055,.085),'lamp');box('tail_lamp',(s*.74,-1.82,1.07),(.13,.045,.1),'red')
  for y in [.3,-.48,-1.15]:
   box('seat_cushion',(s*.43,y,1.02),(.57,.55,.15),'rubber',.07);o=box('seat_back',(s*.43,y-.24,1.43),(.54,.14,.7),'shade',.09);o.rotation_euler.x=.1
   box('seat_harness',(s*.43,y-.152,1.47),(.06,.02,.55),'steel')
  box('rear_stowage',(s*.58,-1.63,1.46),(.46,.33,.36),'canvas',.055)
 rod('steering_column',(-.43,.63,1.22),(-.43,.43,1.58),.035)
 bpy.ops.mesh.primitive_torus_add(major_segments=12,minor_segments=4,location=(-.43,.42,1.59),major_radius=.17,minor_radius=.02,rotation=(.55,0,0));finish(bpy.context.object,'steering_wheel','rubber')
 box('half_windscreen',(0,.625,1.62),(1.5,.035,.32),'glass');box('dashboard',(0,.75,1.37),(1.62,.25,.15),'shade')
def apc():
 global PART
 tracks();shell('boat_hull',[(.45,2.6,6,0),(1.3,3.35,6.6,0),(2.35,3.1,5.6,-.25),(2.52,2.8,5.3,-.3)])
 for s in [-1,1]:
  for i in range(7):
   y=-2.55+i*.76;box('modular_armor',(s*1.69,y,1.98),(.2,.72,1.12),'paint',.025)
   for zz in [1.5,2.38]:rod('panel_fastener',(s*1.795,y-.24,zz),(s*1.81,y-.24,zz),.035,'steel',6)
  # open slat armor at bow and rear corners
  for y in [-3.4,3.34]:
   for i in range(7):rod('slat_horizontal',(s*.6,y,1.05+i*.19),(s*1.9,y,1.05+i*.19),.023,'shade')
   for x in [s*.6,s*1.25,s*1.9]:rod('slat_vertical',(x,y,1.02),(x,y,2.35),.03,'shade')
  for i in range(4):box('driver_periscope',(s*(.35+i*.22),2.58,2.37),(.16,.065,.095),'glass')
  box('headlamp',(s*1.23,3.12,1.92),(.2,.09,.17),'lamp')
 box('rear_ramp',(0,-3.31,1.58),(1.95,.11,1.65),'shade',.06);box('ramp_inner',(0,-3.375,1.59),(1.62,.025,1.36),'paint',.03)
 for z in [.95,1.25,1.55]:rod('ramp_step',(-.5,-3.41,z),(.5,-3.41,z),.026)
 for y in [-1.7,-.6]:hatch(0,y,2.52,.48)
 for i in range(9):box('roof_vent',(-.83,-1.2+i*.12,2.54),(.58,.055,.025),'rubber')
 rod('radio_whip',(-1,-2.2,2.5),(-1,-2.2,3.78),.012,'rubber')
 PART='turret';hatch(.25,.6,2.52,.45);rod('weapon_mount',(.25,.6,2.6),(.25,.6,3),.09)
 box('remote_weapon',(.25,.72,3.02),(.22,.57,.23),'steel');rod('gun_barrel',(.25,.96,3.04),(.25,1.75,3.04),.035,'rubber')
 for s in [-1,1]:box('gun_shield',(.25+s*.42,.61,2.99),(.055,.72,.58),'paint',.025)
 box('optic',(-.01,.99,3.15),(.17,.17,.21),'shade');box('optic_lens',(-.01,1.081,3.15),(.11,.02,.11),'glass');PART='hull'
def propeller(x,y,z,r,blades=3,vertical=False):
 global PART
 old=PART;PART='rotor_L' if x<0 else 'rotor_R' if x>0 else 'propeller'
 for i in range(blades):
  a=i*math.tau/blades
  pts=[(-.09,.2),(.12,.22),(.2,r*.8),(.1,r),(-.11,r*.97),(-.17,r*.45)]
  v=[]
  for dz in [-.022,.022]:
   for u,vv in pts:
    xx=u*math.cos(a)-vv*math.sin(a);zz=u*math.sin(a)+vv*math.cos(a)
    v.append((x+xx,y+zz,z+dz) if vertical else (x+xx,y+dz,z+zz))
  N=len(pts);mesh('rotor_blade',v,[tuple(reversed(range(N))),tuple(range(N,2*N))]+[(j,(j+1)%N,(j+1)%N+N,j+N) for j in range(N)],'rubber')
 if vertical:rod('rotor_hub',(x,y,z-.1),(x,y,z+.26),.2,'shade',12,.08)
 else:rod('prop_spinner',(x,y-.15,z),(x,y+.38,z),.24,'shade',12,.015)
 PART=old
def vtol():
 # Planar cargo walls with bevel shoulders; a chisel bow replaces the previous oval balloon section.
 rings=[(-5.0,.15,.18,2.07),(-3.45,.39,.3,2.02),(-2.0,.83,.57,1.69),(-1.25,1.04,.7,1.6),(1.35,1.04,.7,1.6),(2.6,.87,.63,1.63),(3.36,.48,.47,1.7),(3.53,.43,.33,1.81)]
 vs=[]
 for y,w,h,z in rings:
  for x,zz in [(1,-.65),(1,.63),(.67,1),(-.67,1),(-1,.63),(-1,-.65),(-.66,-1),(.66,-1)]:vs.append((x*w,y,z+zz*h))
 fs=[tuple(reversed(range(8))),tuple(range(56,64))]+[(j*8+i,j*8+(i+1)%8,(j+1)*8+(i+1)%8,(j+1)*8+i) for j in range(7) for i in range(8)]
 mesh('cargo_fuselage',vs,fs)
 for s in [-1,1]:
  plate('high_wing',[(s*.7,-.45),(s*1.55,.35),(s*4.15,2.05),(s*4.25,.65),(s*1.5,-1.15),(s*.65,-1.85)],2.34,.22)
  fus('tilt_nacelle',[(-1.8,.19,.22,2.46),(-1.2,.38,.34,2.46),(-.3,.42,.37,2.46),(.75,.38,.35,2.46),(1.08,.22,.25,2.46)],'paint',s*4.1)
  propeller(s*4.1,1.1,2.46,2.02,3)
  # V-tail is genuinely canted, solid thickness
  f=fin('canted_tail',[(-3.35,2.11),(-5.0,2.12),(-5.23,3.54),(-4.65,3.64)],s*.23,.09)
  for v in f.data.vertices:v.co.x+=s*(v.co.z-2.17)*.65
  box('cargo_door',(s*1.045,-.1,1.56),(.035,2.3,1.22),'shade',.04);box('door_inset',(s*1.069,-.1,1.56),(.02,2.13,1.07),'paint',.025)
  box('door_handle',(s*1.09,.68,1.57),(.03,.18,.045),'steel')
  box('navigation_light',(s*4.25,-.45,2.72),(.09,.1,.07),'red' if s<0 else 'lamp')
  rod('skid_leg',(s*.72,-1.3,.8),(s*.8,-1.3,.38),.06);rod('skid',(s*.8,-2,.32),(s*.8,1.7,.32),.075,'rubber')
 box('sensor_face',(0,3.57,1.76),(.43,.06,.34),'glass');rod('chin_sensor',(0,2.35,.83),(0,2.35,.96),.22,'steel',12)
 box('sensor_lens',(0,2.565,.7),(.18,.03,.12),'glass')
 for i in range(7):box('engine_vent',(0,-1.3+i*.13,2.62),(.8,.06,.03),'rubber')
def cas():
 fus('fuselage',[(-4.8,.12,.2,1.35),(-3.65,.27,.36,1.42),(-1.8,.46,.51,1.5),(.4,.66,.68,1.6),(2.3,.59,.64,1.6),(3.35,.45,.48,1.63),(3.63,.29,.31,1.64)])
 fus('tandem_canopy',[(-1.2,.29,.1,2.08),(-.8,.44,.52,2.11),(.45,.46,.58,2.13),(1.48,.35,.39,2.09),(1.8,.15,.07,2.08)],'glass')
 for y,w,h in [(-.78,.45,.5),(.35,.47,.58),(1.4,.35,.38)]:
  for i in range(6):
   a=i*math.pi/6;b=(i+1)*math.pi/6;rod('canopy_frame',(math.cos(a)*w,y,2.1+math.sin(a)*h),(math.cos(b)*w,y,2.1+math.sin(b)*h),.025,'paint')
 for s in [-1,1]:
  plate('straight_tapered_wing',[(s*.36,.65),(s*5.3,-.3),(s*5.45,-1),(s*.35,-1.28)],1.3,.12)
  plate('elevator',[(s*.16,-3.43),(s*1.9,-3.8),(s*2,-4.3),(s*.15,-4.27)],1.56,.08)
  rod('exhaust',(s*.49,2.3,1.85),(s*.75,2.05,1.83),.13,'rubber',10)
  for x in [1.6,3.05]:
   box('weapon_pylon',(s*x,-.4,1.07),(.12,.62,.45),'shade')
   fus('underwing_store',[(-1.4,.02,.02,.72),(-1.05,.2,.2,.72),(.2,.2,.2,.72),(.62,.03,.03,.72)],'shade',s*x)
  rod('gear_strut',(s*1.22,-.65,1.22),(s*1.22,-.65,.31),.06,'steel');wheel(s*1.22,-.65,.28,.28,.15)
 fin('vertical_tail',[(-2.98,1.62),(-4.56,1.51),(-4.37,3.14),(-3.82,3.26)],0,.1)
 rod('nose_gear',(0,2.6,1.12),(0,2.6,.25),.055);wheel(0,2.6,.24,.24,.13);propeller(0,3.66,1.64,1.55,5)
def fighter():
 fus('blended_fuselage',[(-6.18,.7,.35,1.8),(-5.6,.8,.55,1.83),(-3.3,1.18,.66,1.86),(-.9,1.08,.68,1.9),(1.1,.88,.61,1.97),(3.7,.57,.5,2.05),(5.8,.29,.29,2.01),(6.8,.015,.025,1.99)])
 fus('radome',[(4.48,.45,.42,2.03),(5.8,.29,.29,2.01),(6.83,.013,.02,1.99)],'rubber')
 fus('tandem_canopy',[(-.7,.27,.06,2.43),(-.1,.49,.53,2.48),(1.2,.48,.62,2.46),(2.8,.34,.39,2.45),(3.2,.12,.03,2.45)],'glass')
 for y,w,h in [(0,.49,.53),(1.26,.47,.58),(2.65,.35,.37)]:
  for i in range(6):
   a=i*math.pi/6;b=(i+1)*math.pi/6;rod('canopy_bow',(math.cos(a)*w,y,2.46+math.sin(a)*h),(math.cos(b)*w,y,2.46+math.sin(b)*h),.025,'light')
 for s in [-1,1]:
  plate('cranked_delta_wing',[(s*.55,2.6),(s*2.1,.1),(s*5.5,-3.95),(s*5.25,-4.75),(s*1.12,-3.55)],1.83,.12)
  plate('tailplane',[(s*.55,-4.5),(s*2.6,-5.35),(s*2.8,-6.25),(s*.44,-5.91)],1.69,.09)
  shell('intake_cheek',[(1.4,.68,2.8,.1),(2.13,.7,2.55,.18)],'shade').location.x=s*.96
  box('intake_shadow',(s*.96,1.56,1.77),(.52,.025,.48),'rubber');box('intake_splitter',(s*.69,1.54,1.78),(.045,.46,.55),'light')
  rod('engine_nozzle',(s*.47,-5.8,1.8),(s*.47,-6.53,1.8),.34,'steel',12,.39);rod('exhaust_black',(s*.47,-6.536,1.8),(s*.47,-6.54,1.8),.29,'rubber',12)
  for x in [2.1,3.4]:
   box('missile_pylon',(s*x,-2.15,1.55),(.13,.68,.38),'shade');fus('missile',[(-3.6,.03,.03,1.27),(-3.4,.11,.11,1.27),(-1.2,.11,.11,1.27),(-.8,.01,.01,1.27)],'light',s*x)
   plate('missile_fins',[(s*x-.28,-3.2),(s*x+.28,-3.2),(s*x+.1,-2.85),(s*x-.1,-2.85)],1.27,.035,'shade')
 fin('swept_single_tail',[(-3.66,2.24),(-6.46,2.05),(-6.19,4.15),(-5.63,4.23)],0,.13)
 rod('nose_probe',(0,6.8,1.99),(0,7.25,1.99),.014,'steel')
def refine(name):
 global PART
 if name=='tank':
  PART='turret'
  for s in [-1,1]:
   box('bustle_stowage',(s*.7,-1.79,2.68),(.94,.45,.28),'canvas',.055)
   for y in [-1.6,-.9]:rod('roof_weld',(s*.83,y,2.674),(s*.22,y,2.674),.011,'shade')
  PART='hull'
  for i in range(10):box('rear_exhaust_louver',(0,-3.54,1.12+i*.045),(1.48,.06,.02),'steel')
  for s in [-1,1]:
   box('rear_light',(s*1.1,-3.5,1.41),(.15,.05,.11),'red')
   for y in [-2.55,-1.69,-.83,.03,.89,1.75,2.61]:box('skirt_hinge',(s*1.865,y,1.5),(.025,.13,.08),'shade')
 elif name=='troop_transport':
  # Six longitudinal seats plus two inward-facing transverse rear seats = eight.
  for o in list(bpy.context.scene.objects):
   if o.name.startswith(('rear_stowage','rear_cargo_rail','roof_pack','cargo_tie')):bpy.data.objects.remove(o,do_unlink=True)
   elif o.name.startswith('tail_lamp'):o.location.y=-2.4
  box('eight_seat_rear_floor',(0,-1.94,.85),(1.87,.93,.12),'paint')
  box('extended_rear_bumper',(0,-2.4,.78),(1.94,.12,.14),'shade')
  for s in [-1,1]:
   box('transverse_rear_seat_cushion',(s*.5,-2.04,1.02),(.6,.53,.15),'rubber',.06)
   box('transverse_rear_seat_back',(s*.82,-2.04,1.4),(.14,.53,.66),'shade',.07)
   box('transverse_rear_harness',(s*.737,-2.04,1.43),(.018,.055,.53),'steel')
   rod('extended_rear_cage',(s*.84,-2.29,.93),(s*.82,-2.29,2.08),.04,'paint')
   rod('rear_roof_extension',(s*.82,-2.29,2.08),(s*.82,-1.65,2.08),.045,'paint')
  rod('rear_roof_crossbar',(-.82,-2.29,2.08),(.82,-2.29,2.08),.04,'paint')
  for s in [-1,1]:
   for y in [-1.32,1.4]:
    for i in range(6):
     a=i*math.tau/6;rod('wheel_bolt',(s*1.174,y+math.sin(a)*.23,.56+math.cos(a)*.23),(s*1.19,y+math.sin(a)*.23,.56+math.cos(a)*.23),.025,'light',6)
   rod('mirror_stalk',(s*.83,.61,1.72),(s*1.07,.58,1.81),.018)
   box('mirror',(s*1.07,.57,1.84),(.14,.06,.18),'shade',.02)
   rod('front_tow_eye',(s*.68,2.065,.82),(s*.68,2.13,.82),.075,'steel',8)
  box('rear_cargo_rail',(0,-1.77,1.26),(1.8,.08,.09),'paint')
 elif name=='apc':
  for s in [-1,1]:
   rod('upper_side_rail',(s*1.55,-2.5,2.67),(s*1.55,1.8,2.67),.025,'shade')
   for y in [-2.5,-1.4,-.3,.8,1.8]:rod('rail_stanchion',(s*1.55,y,2.42),(s*1.55,y,2.67),.025,'shade')
   box('rear_marker',(s*1.19,-3.41,2.08),(.14,.04,.13),'red')
  for i in range(7):rod('center_bow_slat',(-.6,3.34,1.05+i*.19),(.6,3.34,1.05+i*.19),.023,'shade')
  for x in [-.55,.55]:rod('bow_tow_mount',(x,3.18,.85),(x,3.4,.85),.09,'steel')
 elif name=='vtol':
  for s in [-1,1]:
   plate('wing_control_surface',[(s*1.75,-.86),(s*3.7,.43),(s*3.75,.61),(s*1.75,-.66)],2.465,.025,'shade')
   box('nacelle_intake',(s*4.1,-.75,2.75),(.32,.27,.035),'rubber')
   box('cargo_door_latch',(s*1.094,-.9,1.4),(.028,.06,.23),'light')
   box('door_warning_stripe',(s*1.095,.78,1.25),(.025,.06,.42),'light')
  box('belly_payload',(0,-.4,.54),(1.3,1.8,.23),'shade',.06)
 elif name=='cas':
  for s in [-1,1]:
   plate('aileron',[(s*3.25,-.97),(s*5.22,-.85),(s*5.25,-1.02),(s*3.25,-1.13)],1.374,.025,'shade')
   plate('wing_identification_band',[(s*4.3,-.12),(s*4.55,-.16),(s*4.61,-1.07),(s*4.36,-1.09)],1.386,.02,'light')
   box('cowl_service_panel',(s*.582,2.0,1.65),(.025,.44,.29),'shade',.025)
   rod('wing_gun',(s*1.05,.42,1.36),(s*1.05,1.09,1.36),.035,'steel')
  box('anti_glare_panel',(0,2.23,2.23),(.49,.8,.028),'rubber')
 elif name=='fighter':
  for s in [-1,1]:
   plate('delta_control_surface',[(s*2.45,-3.35),(s*4.9,-4.41),(s*5.02,-4.57),(s*2.55,-3.7)],1.904,.02,'shade')
   plate('wing_break_panel',[(s*1.2,.9),(s*2.1,-.1),(s*3.4,-2.2),(s*2.3,-1.4)],1.908,.018,'shade')
   for i in range(5):box('intake_vent',(s*.98,.1-i*.16,2.157),(.4,.055,.022),'rubber')
   box('tail_identification',(s*.079,-5.55,3.6),(.018,.55,.11),'light')
  rod('dorsal_aerial',(0,-1.8,2.54),(0,-2.01,2.93),.027,'shade')
def scene_setup():
 bpy.ops.object.select_all(action='SELECT');bpy.ops.object.delete(use_global=False)
 M.clear()
 for n,c in {'paint':(.31,.36,.29),'light':(.48,.52,.43),'shade':(.21,.25,.21),'rubber':(.045,.058,.057),'steel':(.19,.23,.22),'glass':(.055,.14,.17),'lamp':(.72,.85,.73),'red':(.52,.09,.055),'canvas':(.3,.32,.21)}.items():mat(n,c)
def ring(n,center,r,minor=.025,m='steel',axis='X',segments=16):
 rot=(0,math.pi/2,0) if axis=='X' else (math.pi/2,0,0) if axis=='Y' else (0,0,0)
 bpy.ops.mesh.primitive_torus_add(major_segments=segments,minor_segments=4,location=center,major_radius=r,minor_radius=minor,rotation=rot);return finish(bpy.context.object,n,m)
def detail_pass(name):
 global PART
 if name in ['tank','apc']:
  for s in [-1,1]:
   x=s*1.73
   for y in [-2.35,-1.57,-.79,0,.79,1.57,2.35]:
    ring('roadwheel_rim_bead',(x,y,.69),.32,.025,'shade')
    for i in range(6):
     a=i*math.tau/6;rod('roadwheel_bolt',(x,y+math.sin(a)*.22,.69+math.cos(a)*.22),(x+s*.055,y+math.sin(a)*.22,.69+math.cos(a)*.22),.027,'steel',6)
   for y in [i*.25 for i in range(-10,11)]:
    box('track_rubber_pad',(s*1.425,y,.012),(.44,.155,.024),'rubber')
   for y in [-2.25,2.1]:
    rod('lifting_eye_base',(s*1.15,y,1.68 if name=='tank' else 2.52),(s*1.15,y,1.76 if name=='tank' else 2.6),.07,'steel')
    ring('lifting_eye',(s*1.15,y,1.8 if name=='tank' else 2.64),.075,.02,'steel','Y',12)
  if name=='apc':
   for s in [-1,1]:
    for i in range(7):
     y=-2.55+i*.76
     for yy in [y-.24,y+.24]:
      for z in [1.57,2.31]:rod('armor_bolt',(s*1.798,yy,z),(s*1.83,yy,z),.025,'light',6)
    for y in [-2.3,-1.7,-1.1,-.5,.1,.7,1.3]:rod('armor_cross_seam',(s*1.802,y,1.95),(s*1.802,y+.32,1.95),.007,'shade',4)
  else:
   PART='turret'
   for s in [-1,1]:
    for y in [-1.7,-1.45,-1.2,-.95,-.7]:rod('basket_floor',(s*1.05,y,2.4),(s*1.35,y,2.4),.018,'steel')
    box('turret_side_bin',(s*1.25,-1.1,2.33),(.2,1.0,.29),'shade',.04)
    for yy in [-1.38,-.82]:box('bin_latch',(s*1.36,yy,2.34),(.028,.09,.12),'steel')
   PART='hull'
 elif name=='troop_transport':
  for s in [-1,1]:
   for y in [-1.32,1.4]:
    for dx in [-.09,.09]:
     for i in range(24):
      a=i*math.tau/24;o=box('chevron_tread',(s*.99+dx,y+math.sin(a)*.558,.56+math.cos(a)*.558),(.14,.09,.055),'rubber');o.rotation_euler=( -a,0,.25 if dx>0 else -.25)
    ring('beadlock',(s*1.2,y,.56),.35,.025,'steel')
    rod('wishbone_upper',(s*.25,y-.2,.64),(s*.89,y,.75),.03);rod('wishbone_lower',(s*.25,y+.22,.45),(s*.89,y,.56),.035)
    rod('shock',(s*.61,y,.55),(s*.64,y,.99),.045,'steel')
    for zz in [.61,.67,.73,.79,.85,.91]:ring('coil_spring',(s*.64,y,zz),.065,.014,'light','Z',8)
   for y in [-.9,-.4,.1]:
    ring('seatbelt_anchor',(s*.73,y,1.03),.038,.01,'steel','X',8)
   box('side_equipment_case',(s*.95,-.75,1.13),(.12,.4,.28),'canvas',.03)
  for x in [-.6,-.2,.2,.6]:box('dashboard_dial',(x,.597,1.44),(.1,.016,.06),'glass')
  box('winch',(0,1.99,.98),(.52,.23,.2),'rubber',.035);rod('winch_drum',(-.2,2.06,1.02),(.2,2.06,1.02),.09,'steel',12)
 elif name in ['cas','fighter']:
  # Exposed compression struts, torque links, brake hubs, and wheel-well doors.
  gear=[(-1.22,-.65,.28),(1.22,-.65,.28),(0,2.6,.24)] if name=='cas' else [(-1.35,-2.7,.32),(1.35,-2.7,.32),(0,3.15,.28)]
  for x,y,r in gear:
   if name=='fighter':wheel(x,y,r,r,.2);rod('gear_oleo',(x,y,r),(x,y,1.52),.065,'steel',12)
   ring('tire_sidewall',(x+.12,y,r),r*.82,.018,'rubber')
   ring('brake_disc',(x+.13,y,r),r*.52,.023,'steel')
   rod('torque_link',(x,y,r+.1),(x+.12,y-.19,r+.42),.025,'light');rod('torque_link',(x+.12,y-.19,r+.42),(x,y,r+.6),.025,'light')
   box('gear_door',(x+.17,y,1.04),(.035,.52,.57),'paint',.025)
   for i in range(8):
    a=i*math.tau/8;rod('wheel_brake_bolt',(x+.14,y+math.sin(a)*r*.4,r+math.cos(a)*r*.4),(x+.17,y+math.sin(a)*r*.4,r+math.cos(a)*r*.4),.014,'light',6)
  for s in [-1,1]:
   # Recessed inspection covers, fasteners and hinge blocks on broad wings.
   for x in [1.4,2.2,3.0,3.8,4.6]:
    y=-.55 if name=='cas' else -.6-x*.6;z=1.385 if name=='cas' else 1.915
    box('wing_inspection_panel',(s*x,y,z),(.43,.26,.016),'shade',.025)
    for xx in [-.16,.16]:
     for yy in [-.085,.085]:rod('panel_screw',(s*x+xx,y+yy,z+.009),(s*x+xx,y+yy,z+.022),.012,'light',6)
   for x in ([1.6,3.05] if name=='cas' else [2.1,3.4]):
    y=-1.0 if name=='cas' else -3.25;z=.72 if name=='cas' else 1.27
    fin('store_vertical_fin',[(y-.25,z),(y+.13,z+.24),(y+.2,z)],s*x,.025,'light')
    plate('store_horizontal_fin',[(s*x-.3,y-.2),(s*x+.3,y-.2),(s*x+.12,y+.2),(s*x-.12,y+.2)],z,.025,'light')
   for y in ([-2.6,-1.8,1.9,2.55] if name=='cas' else [-4.4,-3.6,-2.8]):
    x=.35 if name=='cas' else .68;z=1.71 if name=='cas' else 2.13
    ring('service_port',(s*x,y,z),.11,.017,'shade','X',12)
  if name=='fighter':
   for s in [-1,1]:
    for i in range(16):
     a=i*math.tau/16;rod('exhaust_petals',(s*.47+math.cos(a)*.35,-5.88,1.8+math.sin(a)*.35),(s*.47+math.cos(a)*.38,-6.48,1.8+math.sin(a)*.38),.022,'shade',6)
    ring('exhaust_lip',(s*.47,-6.52,1.8),.35,.025,'steel','Y',24)
    for i in range(9):box('intake_grille',(s*.96,1.58,1.57+i*.048),(.44,.025,.013),'steel')
    box('speed_brake',(s*.65,-4.22,2.21),(.55,.65,.04),'shade',.03)
  else:
   for s in [-1,1]:
    ring('exhaust_lip',(s*.74,2.04,1.83),.105,.026,'steel','X',16)
    for y in [.5,1,1.5,2,2.5]:
     for z in [1.4,1.8]:rod('cowl_rivet',(s*.62,y,z),(s*.64,y,z),.016,'steel',6)
 elif name=='vtol':
  # Open cargo recess is modeled as an inset box outside the closed pressure shell.
  for o in list(bpy.context.scene.objects):
   if o.name.startswith(('cargo_door','door_inset','door_handle','door_warning','cargo_door_latch')) and o.location.x>0:bpy.data.objects.remove(o,do_unlink=True)
  box('open_cargo_shadow',(1.071,-.1,1.55),(.032,2.25,1.18),'rubber')
  for y in [-1.23,1.03]:box('cargo_jamb',(1.14,y,1.55),(.18,.065,1.22),'steel')
  for z in [.95,2.16]:box('cargo_sill',(1.14,-.1,z),(.18,2.28,.065),'steel')
  for y in [-.82,-.18,.46]:
   box('supply_case',(1.16,y,1.28),(.3,.5,.5),'canvas',.04)
   for yy in [y-.16,y+.16]:box('case_rib',(1.32,yy,1.28),(.04,.05,.47),'shade')
   box('case_lid',(1.17,y,1.56),(.33,.53,.05),'shade',.015)
   box('case_handle',(1.35,y,1.37),(.025,.16,.06),'rubber')
  for s in [-1,1]:
   # engine accessory bulges, exhaust louvers and pitch link hub mechanics
   fus('nacelle_accessory',[(-.9,.2,.2,2.77),(-.2,.27,.22,2.8),(.35,.22,.18,2.78)],'shade',s*4.1)
   ring('nacelle_collar',(s*4.1,.71,2.46),.39,.045,'steel','Y',24)
   ring('rotor_pitch_ring',(s*4.1,1.075,2.46),.23,.035,'steel','Y',16)
   for i in range(12):
    a=i*math.tau/12;rod('nacelle_fastener',(s*4.1+math.cos(a)*.4,.74,2.46+math.sin(a)*.4),(s*4.1+math.cos(a)*.4,.78,2.46+math.sin(a)*.4),.025,'light',6)
   for i in range(3):
    a=i*math.tau/3;rod('rotor_pitch_link',(s*4.1+math.cos(a)*.14,.92,2.46+math.sin(a)*.14),(s*4.1+math.cos(a)*.34,1.08,2.46+math.sin(a)*.34),.035,'steel',8)
   for i in range(9):box('nacelle_cooling_louver',(s*4.1,-.82+i*.095,2.92),(.27,.035,.025),'rubber')
   for y in [-.85,.0,.8]:
    for z in [1.08,1.96]:rod('doorframe_bolt',(s*1.1,y,z),(s*1.135,y,z),.019,'light',6)
   for y in [-1.4,1.2]:
    rod('landing_oleo',(s*.79,y,.36),(s*.88,y,.85),.065,'steel',12);ring('strut_collar',(s*.84,y,.56),.08,.02,'shade','Z',12)
    rod('skid_brace',(s*.8,y,.38),(s*.65,y-.36,.8),.035,'steel')
   for x in [1.4,2.2,3]:
    box('wing_access_hatch',(s*x,-.08,2.465),(.45,.38,.022),'shade',.04)
    for xx in [-.15,.15]:
     for yy in [-.12,.12]:rod('wing_hatch_screw',(s*x+xx,-.08+yy,2.48),(s*x+xx,-.08+yy,2.493),.015,'light',6)
  # Chin turret's sensor gimbal and gun for the common attack/supply airframe.
  ring('sensor_gimbal',(0,2.35,.72),.24,.04,'shade','Z',16)
  rod('chin_gimbal_stem',(0,2.35,.68),(0,2.35,.92),.12,'shade',12)
  box('chin_weapon',(0,2.36,.65),(.22,.43,.16),'steel',.025)
  rod('chin_barrel',(0,2.55,.67),(0,3.29,.67),.042,'rubber',12)
  for y in [2.65,2.88,3.12]:ring('barrel_collar',(0,y,.67),.052,.012,'steel','Y',12)
  # Reference 6: the nacelles sit forward of the shoulder roots, not abreast of them.
  for o in bpy.context.scene.objects:
   if o.type!='MESH':continue
   if o.get('part','').startswith('rotor_') or o.name.startswith(('tilt_nacelle','nacelle_','navigation_light','rotor_pitch')):o.location.y+=2.0
   elif o.name.startswith(('wing_access_hatch','wing_hatch_screw')):
    center=o.matrix_world@ (sum((v.co for v in o.data.vertices),Vector())/len(o.data.vertices))
    o.location.y+=-1.1+(abs(center.x)-.7)*.8
def interiors(name):
 if name not in ['apc','vtol']:return
 hull=bpy.data.objects.get('boat_hull' if name=='apc' else 'cargo_fuselage')
 if name=='apc':
  cutter=box('opening_cutter',(0,-2.88,1.55),(1.64,1.9,1.4),'rubber')
 else:cutter=box('opening_cutter',(0,-.1,1.55),(2.8,2.18,1.13),'rubber')
 bpy.context.view_layer.objects.active=hull;mod=hull.modifiers.new('Open_interior_recess','BOOLEAN');mod.operation='DIFFERENCE';mod.object=cutter;bpy.ops.object.modifier_apply(modifier=mod.name);bpy.data.objects.remove(cutter,do_unlink=True)
 if name=='apc':
  for o in list(bpy.context.scene.objects):
   if o.name.startswith(('rear_ramp','ramp_inner','ramp_step')):bpy.data.objects.remove(o,do_unlink=True)
  ramp=box('open_rear_ramp',(0,-3.92,.46),(1.94,1.55,.1),'shade',.025);ramp.rotation_euler.x=.57
  box('interior_backwall',(0,-2.02,1.55),(1.6,.045,1.36),'shade')
  box('interior_floor',(0,-2.68,.87),(1.6,1.3,.06),'steel')
  for s in [-1,1]:
   box('interior_bench',(s*.56,-2.61,1.05),(.34,1.15,.15),'canvas',.02)
   box('interior_bench_back',(s*.74,-2.61,1.36),(.08,1.15,.48),'shade',.025)
  for y in [-3.4,-3.65,-3.9,-4.15]:box('ramp_grip',(0,y,.52+(y+3.92)*math.tan(.57)),(1.5,.045,.025),'steel')
  for x in [-.55,0,.55]:box('interior_bulkhead_rib',(x,-2.06,1.56),(.035,.035,1.25),'steel')
  for y in [-2.2,-2.5,-2.8,-3.1]:box('interior_floor_strip',(0,y,.915),(1.4,.04,.02),'shade')
 else:
  for o in list(bpy.context.scene.objects):
   if o.name.startswith('open_cargo_shadow'):bpy.data.objects.remove(o,do_unlink=True)
  box('cargo_depth_backwall',(.44,-.1,1.55),(.035,2.15,1.1),'rubber')
  box('cargo_depth_floor',(.78,-.1,1.0),(.65,2.15,.04),'steel')
  for y in [-.95,-.45,.05,.55]:box('cargo_wall_rib',(.48,y,1.58),(.045,.035,.9),'shade')
def export(name):
 objs=[o for o in bpy.context.scene.objects if o.type=='MESH'];bpy.context.view_layer.update()
 rig=vehicle_rigging.assign(name,objs)
 # Recalculate outward normals before flat shaded triangulation.
 for o in objs:
  import bmesh
  bm=bmesh.new();bm.from_mesh(o.data);bmesh.ops.recalc_face_normals(bm,faces=bm.faces);bm.to_mesh(o.data);bm.free()
  bpy.context.view_layer.objects.active=o;o.select_set(True);bpy.ops.object.transform_apply(location=False,rotation=False,scale=True);o.select_set(False)
  for p in o.data.polygons:p.use_smooth=False
 # Center each mesh at its attachment point and link exact repeated modules.
 root=bpy.data.objects.new('GC_'+name.upper(),None);bpy.context.collection.objects.link(root);root['forward_axis']='+Y';root['up_axis']='+Z'
 groups={};cache={};linked=0;counts={}
 for part,node in rig['nodes'].items():
  group=bpy.data.objects.new('Assembly_'+part,None);bpy.context.collection.objects.link(group);groups[part]=group;group.location=node['pivot']
 for part,node in rig['nodes'].items():
  group=groups[part];group.parent=groups.get(node.get('parent'),root)
  if node.get('parent'):group.location=Vector(node['pivot'])-Vector(rig['nodes'][node['parent']]['pivot'])
 bpy.context.view_layer.update()
 for o in objs:
  part=o.get('part','hull')
  if part not in groups:
   group=bpy.data.objects.new('Assembly_'+part,None);bpy.context.collection.objects.link(group);group.parent=root;groups[part]=group
  localcenter=sum((v.co for v in o.data.vertices),Vector())/max(1,len(o.data.vertices))
  for v in o.data.vertices:v.co-=localcenter
  o.location+=o.rotation_euler.to_matrix()@localcenter
  key=(tuple(tuple(round(c,5) for c in v.co) for v in o.data.vertices),tuple(tuple(p.vertices) for p in o.data.polygons),tuple(m.name for m in o.data.materials))
  if key in cache:o.data=cache[key];linked+=1
  else:cache[key]=o.data
  stem=o.name.split('.')[0];counts[stem]=counts.get(stem,0)+1;ident=f'{stem}_{counts[stem]:03d}'
  mount=bpy.data.objects.new('Mount_'+ident,None);bpy.context.collection.objects.link(mount);mount.parent=groups[part];mount.location=o.location-Vector(rig['nodes'][part]['pivot']);mount.rotation_euler=o.rotation_euler.copy();mount.empty_display_type='PLAIN_AXES';mount.empty_display_size=.08;mount['module_type']=stem
  o.parent=mount;o.location=(0,0,0);o.rotation_euler=(0,0,0);o.name=ident;o.data.name='Module_'+stem if o.data.users==1 else o.data.name
 bpy.context.view_layer.update()
 bpy.ops.object.select_all(action='SELECT')
 import shutil
 # Native scene-data consumes Z-up positions; preserve semantic parts for aimed turrets and rotors.
 data={};tri=0
 for o in objs:
  o.data.calc_loop_triangles();key=o.get('part','hull');a=data.setdefault(key,{'p':[],'c':[]});color=o.data.materials[0].diffuse_color[:3]
  for t in o.data.loop_triangles:
   tri+=1
   for vi in t.vertices:a['p'] += [round(v,4) for v in o.matrix_world@o.data.vertices[vi].co];a['c'] += [round(v,4) for v in color]
 native=os.path.join(REPO,'lib/game/generated');os.makedirs(native,exist_ok=True)
 compact={}
 for key,part in data.items():
  scale=max(max((abs(v) for v in part['p']),default=0)/16380,1e-6)
  quantized=[max(-16384,min(16383,round(v/scale))) for v in part['p']]
  palette=[];indices=[]
  for i in range(0,len(part['c']),3):
   color=tuple(part['c'][i:i+3])
   if color not in palette:palette.append(color)
   indices.append(palette.index(color))
  packed_indices=bytes((indices[i] | ((indices[i+1] if i+1<len(indices) else 0)<<4)) for i in range(0,len(indices),2))
  packed=bytearray();buffer=bits=0
  for value in quantized:
   buffer|=(value&0x7fff)<<bits;bits+=15
   while bits>=8:packed.append(buffer&255);buffer>>=8;bits-=8
  if bits:packed.append(buffer&255)
  compact[key]={'q':base64.b64encode(packed).decode(),'n':len(quantized),'s':scale,'i':base64.b64encode(packed_indices).decode(),'palette':palette}
 with open(os.path.join(native,name+'.json'),'w') as f:json.dump(compact,f,separators=(',',':'))
 with open(os.path.join(native,name+'_rig.json'),'w') as f:json.dump(rig,f,separators=(',',':'))
 vehicle_rigging.animations(root,groups,rig)
 bpy.ops.export_scene.gltf(filepath=os.path.join(OUT,name+'.glb'),export_format='GLB',use_selection=True,export_yup=False,export_extras=True,export_animation_mode='NLA_TRACKS',export_frame_range=False)
 vehicle_rigging.repair_glb_pose(os.path.join(OUT,name+'.glb'),rig)
 # Exporter evaluates NLA tracks; restore the assembled pose explicitly before review.
 for part,group in groups.items():
  if group.animation_data:
   group.animation_data.action=None
   for track in group.animation_data.nla_tracks:track.mute=True
  node=rig['nodes'][part];group.location=Vector(node['pivot'])-(Vector(rig['nodes'][node['parent']]['pivot']) if node.get('parent') else Vector())
  group.rotation_euler=(0,0,0)
 bpy.context.view_layer.update()
 shutil.copy2(os.path.join(OUT,name+'.glb'),os.path.join(REPO,'public/models',name+'.glb'))
 with open(os.path.join(OUT,name+'_stats.json'),'w') as f:json.dump({'triangles':tri,'mesh_objects':len(objs),'unique_mesh_datablocks':len(cache),'linked_mesh_instances':linked,'mount_empties':len(objs),'parts':list(data),'axis':'+Y forward, +Z up','seats':8 if name=='troop_transport' else None,'revision':REV},f,indent=2)
 print('ASSET_EXPORT',name,tri,'triangles',len(objs),'objects')
 return objs
def studio(name,objs):
 scene=bpy.context.scene
 scene.render.engine='BLENDER_EEVEE_NEXT';scene.render.film_transparent=False
 scene.render.resolution_x=720;scene.render.resolution_y=540;scene.render.resolution_percentage=100
 scene.world.color=(.15,.15,.15);scene.view_settings.view_transform='Standard';scene.view_settings.look='Medium High Contrast'
 scene.render.image_settings.file_format='PNG';scene.render.film_transparent=False
 # World node gives neutral bright ambient.
 world=bpy.data.worlds.new('StudioWorld');world.use_nodes=True;world.node_tree.nodes['Background'].inputs[0].default_value=(.17,.195,.22,1);world.node_tree.nodes['Background'].inputs[1].default_value=.7;scene.world=world
 coords=[o.matrix_world@Vector(c) for o in objs for c in o.bound_box];lo=Vector(tuple(min(v[i] for v in coords) for i in range(3)));hi=Vector(tuple(max(v[i] for v in coords) for i in range(3)));center=(lo+hi)/2
 for loc,power,size in [((7,9,13),1800,8),((-8,3,7),1200,7),((0,-9,9),1500,6)]:
  bpy.ops.object.light_add(type='AREA',location=loc);o=bpy.context.object;o.data.energy=power;o.data.shape='DISK';o.data.size=size;o.rotation_euler=(center-o.location).to_track_quat('-Z','Y').to_euler();o.name='Studio_Light'
 bpy.ops.object.camera_add();cam=bpy.context.object;cam.name='Review_Camera';cam.data.type='ORTHO';scene.camera=cam
 views={'front':(0,20,0),'side':(20,0,0),'rear':(0,-20,0),'top':(0,0,20),'three_quarter':(13,18,12)}
 if name=='apc':views['three_quarter']=(13,-18,12)
 for label,direction in views.items():
  cam.location=center+Vector(direction);cam.rotation_euler=(center-cam.location).to_track_quat('-Z','Y').to_euler();bpy.context.view_layer.update()
  inv=cam.matrix_world.inverted();cc=[inv@p for p in coords];width=max(p.x for p in cc)-min(p.x for p in cc);height=max(p.y for p in cc)-min(p.y for p in cc);cam.data.ortho_scale=max(width,height*720/540)*1.2
  offset=Vector(((max(p.x for p in cc)+min(p.x for p in cc))/2,(max(p.y for p in cc)+min(p.y for p in cc))/2,0));cam.location+=cam.rotation_euler.to_matrix()@offset
  scene.render.filepath=os.path.join(OUT,f'{name}_r{REV}_{label}.png');bpy.ops.render.render(write_still=True)
 scene['asset_name']=name;scene['forward_axis']='+Y';scene['up_axis']='+Z';scene['revision']=REV
 bpy.ops.wm.save_as_mainfile(filepath=os.path.join(OUT,name+'.blend'))
 print('ASSET_COMPLETE',name)
names={'tank':tank,'troop_transport':buggy,'apc':apc,'vtol_cargo':vtol,'vtol_attack':vtol,'cas':cas,'fighter':fighter}
args=sys.argv[sys.argv.index('--')+1:] if '--' in sys.argv else list(names)
for name in args:
 scene_setup()
 if name=='tank':M['paint'].diffuse_color=(.52,.45,.31,1);M['paint'].node_tree.nodes.get('Principled BSDF').inputs['Base Color'].default_value=(.52,.45,.31,1)
 if name in ['vtol_cargo','vtol_attack','cas','fighter']:
  c=(.20,.26,.27) if name!='cas' else (.28,.34,.32);M['paint'].diffuse_color=(*c,1);M['paint'].node_tree.nodes.get('Principled BSDF').inputs['Base Color'].default_value=(*c,1)
 base='vtol' if name.startswith('vtol_') else name
 names[name]();refine(base);detail_pass(base)
 if name!='vtol_attack':interiors(base)
 vehicle_rigging.variants(name,box);objs=export(name);studio(name,objs)

