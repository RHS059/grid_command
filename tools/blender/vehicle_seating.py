"""Vehicle-space seat anchors and full-size troop carrier clearance fit."""
import bpy, math
from mathutils import Vector

SEATS=[{'id':f'{row*2+i+1:02d}_'+('driver' if row==0 and i==0 else f'row{row+1}_{side}'),'position':[x,y,1.28],'yaw':0.} for row,y in enumerate([.5,-.55,-1.6]) for i,(side,x) in enumerate([('L',-.6),('R',.6)])]+[
 {'id':'07_rear_L','position':[-.75,-2.95,1.28],'yaw':-math.pi/2},
 {'id':'08_rear_R','position':[.75,-2.95,1.28],'yaw':math.pi/2}]

def stretch_y(y):
 points=[(-2.4,-3.5),(-1.7,-2.6),(-.55,-.85),(.65,1.15),(2.13,2.53)]
 for (a,b),(c,d) in zip(points,points[1:]):
  if y<=c:return b+(y-a)*(d-b)/(c-a)
 a,b=points[-2];c,d=points[-1];return b+(y-a)*(d-b)/(c-a)

def fit_troop_transport(box,rod):
 remove=('seat_','seatbelt_','transverse_rear_','roll_cage_','roof_','rear_diagonal','extended_rear_cage','rear_roof_','steering_','dashboard','half_windscreen','rear_cargo_rail','wheel_bolt')
 keep_round=('wheel','tire','hub','beadlock','chevron','brake','torque')
 for o in list(bpy.context.scene.objects):
  if o.type!='MESH':continue
  if o.name.startswith(remove):bpy.data.objects.remove(o,do_unlink=True);continue
  pts=[o.matrix_world@v.co for v in o.data.vertices];center=sum(pts,Vector())/len(pts)
  round_part=o.name.startswith(keep_round)
  for v,p in zip(o.data.vertices,pts):
   if round_part:p+=Vector((center.x*.25,stretch_y(center.y)-center.y,0))
   else:
    p.x*=1.25;p.y=stretch_y(p.y)
    if o.name.startswith(('floor','eight_seat_rear_floor')):p.x*=2.5/(1.87*1.25)
   v.co=p
  o.location=(0,0,0);o.rotation_euler=(0,0,0);o.scale=(1,1,1)
 # Full-size bodies retain their backpack: seatbacks sit behind the gear envelope.
 for seat in SEATS:
  x,y,z=seat['position'];yaw=seat['yaw'];c=math.cos(yaw);s=math.sin(yaw)
  cushion=box('seat_cushion_'+seat['id'],(x,y,z-.075),(.7,.7,.15),'rubber',.055);cushion.rotation_euler.z=yaw
  back=box('seat_back_'+seat['id'],(x+s*.425,y-c*.425,z+.34),(.7,.14,.68),'shade',.06);back.rotation_euler.z=yaw
  harness=box('seat_harness_'+seat['id'],(x+s*.349,y-c*.349,z+.36),(.055,.02,.53),'steel');harness.rotation_euler.z=yaw
  for local_x in [-.28,.28]:
   xx=x+c*local_x;yy=y+s*local_x;rod('seat_leg_'+seat['id'],(xx,yy,.9),(xx,yy,z-.15),.028,'steel',4)
 for sign in [-1,1]:
  x=sign*1.28
  for y in [1.15,-.05,-1.15,-2.2,-3.45]:rod('roll_cage_upright_fit',(x,y,.91),(x,y,2.54),.04,'paint',6)
  rod('roof_longitudinal_fit',(x,-3.45,2.54),(x,1.15,2.54),.045,'paint',6)
  rod('rear_diagonal_fit',(x,-3.45,.94),(x,-2.2,2.54),.033,'shade',6)
  rod('side_step_fit',(sign*1.34,-2.15,.46),(sign*1.34,1.15,.46),.065,'shade',6)
  rod('rear_step_fit',(sign*.25,-3.63,.46),(sign*1.1,-3.63,.46),.065,'shade',6)
 for y in [1.15,-1.15,-3.45]:rod('roof_crossbar_fit',(-1.28,y,2.54),(1.28,y,2.54),.04,'paint',6)
 rod('rear_center_handhold_fit',(0,-3.45,.91),(0,-3.45,2.54),.035,'paint',6)
 box('dashboard_fit',(0,1.4,1.58),(2.1,.25,.16),'shade')
 box('half_windscreen_fit',(0,1.37,1.91),(2.08,.035,.38),'glass')
 rod('steering_column_fit',(-.6,1.35,1.48),(-.6,.97,1.77),.035,'steel')
 bpy.ops.mesh.primitive_torus_add(major_segments=12,minor_segments=4,location=(-.6,.97,1.77),major_radius=.17,minor_radius=.02,rotation=(.55,0,0));o=bpy.context.object;o.name='steering_wheel_fit';o['part']='hull'
 o.data.materials.append(bpy.data.materials['rubber'])

def seat_contract(name):
 if name!='troop_transport':return []
 return [{'name':'Seat_'+s['id'],**s,'anchor':'cushion_contact','forward_axis':'+Y','canonical_soldier_yaw':math.pi+s['yaw']} for s in SEATS]

def boarding_clips(name):
 if name!='troop_transport':return []
 return [{'id':mode+'_'+seat['id'],'label':('Board ' if mode=='mount' else 'Exit ')+('driver seat' if seat['id']=='01_driver' else 'seat '+seat['id'][:2]),'duration':80/24,'loop':False} for seat in SEATS for mode in ['mount','dismount']]

def markers(name,root):
 for seat in seat_contract(name):
  o=bpy.data.objects.new(seat['name'],None);bpy.context.collection.objects.link(o);o.parent=root;o.location=seat['position'];o.rotation_euler.z=seat['yaw'];o.empty_display_type='ARROWS';o.empty_display_size=.22
  for k in ['id','anchor','forward_axis','canonical_soldier_yaw']:o[k]=seat[k]
