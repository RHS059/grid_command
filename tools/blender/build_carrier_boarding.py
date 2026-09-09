"""Author seat-specific root motion and planted contact poses on a copy of the canonical rig."""
import bpy, os, sys, json, math
from mathutils import Vector, Matrix, Quaternion
sys.path.insert(0,os.path.dirname(__file__))
import vehicle_seating
OUT=os.environ['GC_OUTPUT_DIR'];SOURCE=os.environ['GC_SOLDIER_SOURCE'];REPO=os.path.abspath(os.path.join(os.path.dirname(__file__),'../..'))
bpy.ops.wm.open_mainfile(filepath=SOURCE)
scene=bpy.context.scene;rig=bpy.data.objects['Astra_Rigify_Rig'];chars=[o for o in scene.objects if o.type=='MESH' and o.get('component')]
rig.animation_data.action=None
for track in list(rig.animation_data.nla_tracks):rig.animation_data.nla_tracks.remove(track)
for o in list(scene.objects):
 if o not in chars and o!=rig:bpy.data.objects.remove(o,do_unlink=True)
rig.rotation_mode='QUATERNION';scene.render.fps=24
CONTACT=Vector((0,.03,.7814043760299683));DURATION=80/24
control_names=[f'{part}.{side}' for side in ['L','R'] for part in ['thigh_fk','shin_fk','foot_fk','hand_ik','upper_arm_parent']]
def reset():
 rig.animation_data.action=None;rig.location=(0,0,0);rig.rotation_quaternion=(1,0,0,0)
 for pb in rig.pose.bones:
  pb.rotation_mode='QUATERNION';pb.location=(0,0,0);pb.rotation_quaternion=(1,0,0,0);pb.scale=(1,1,1)
  if 'IK_FK' in pb:pb['IK_FK']=0. if pb.name.startswith('upper_arm_parent') else 1.;pb['IK_Stretch']=0.
 bpy.context.view_layer.update()
def bone_between(name,head,tail):
 pb=rig.pose.bones[name];rest=pb.bone.matrix_local;direction=pb.bone.tail_local-pb.bone.head_local
 q=direction.rotation_difference(tail-head);m=q.to_matrix().to_4x4()@rest;m.translation=head;pb.matrix=m;bpy.context.view_layer.update()
def solve_leg(side,sole_world):
 inverse=rig.matrix_world.inverted();ankle=inverse@(Vector(sole_world)+Vector((0,0,.174)))
 thigh=rig.pose.bones['thigh_fk.'+side];hip=thigh.bone.head_local.copy();a=thigh.bone.length;b=rig.pose.bones['shin_fk.'+side].bone.length
 direction=ankle-hip;distance=direction.length;error=max(0,distance-(a+b-.0005));distance=max(abs(a-b)+.001,min(a+b-.0005,distance));direction.normalize();ankle=hip+direction*distance
 bend=Vector((0,-1,0));bend-=direction*bend.dot(direction)
 if bend.length<.001:bend=Vector((0,0,1))
 bend.normalize();along=(a*a-b*b+distance*distance)/(2*distance);height=math.sqrt(max(0,a*a-along*along));knee=hip+direction*along+bend*height
 bone_between('thigh_fk.'+side,hip,knee);bone_between('shin_fk.'+side,knee,ankle)
 pb=rig.pose.bones['foot_fk.'+side];m=pb.bone.matrix_local.copy();m.translation=ankle;pb.matrix=m;bpy.context.view_layer.update()
 return error
def hand(side,world):
 pb=rig.pose.bones['hand_ik.'+side];q=Quaternion((0,0,1),-math.pi/2 if side=='L' else math.pi/2);m=q.to_matrix().to_4x4()@pb.bone.matrix_local;m.translation=rig.matrix_world.inverted()@Vector(world);pb.matrix=m;bpy.context.view_layer.update()
def lerp(a,b,t):return Vector(a).lerp(Vector(b),t)
def routes(seat):
 x,y,z=seat['position'];rear=seat['id'].startswith(('07','08'));sign=-1 if x<0 else 1;final_yaw=math.pi+seat['yaw'];entry_yaw=math.pi if rear else -sign*math.pi/2
 final_yaw=entry_yaw+(final_yaw-entry_yaw+math.pi)%(2*math.pi)-math.pi
 R=Matrix.Rotation(entry_yaw,4,'Z');F=Matrix.Rotation(final_yaw,4,'Z');final=Vector(seat['position'])-F@CONTACT
 start=Vector((x,-4.15,0)) if rear else Vector((sign*1.90,y-.075,0))
 lateral=R@Vector((1,0,0));initial={s:start+lateral*(.194 if s=='L' else -.194)+(R@Vector((0,.023,0))) for s in ['L','R']}
 step={s:Vector((x+(-.194 if s=='L' else .194),-3.63,.46)) if rear else Vector((sign*1.34,y-.075+(lateral.y*(.194 if s=='L' else -.194)),.46)) for s in ['L','R']}
 threshold={s:Vector((x+(-.194 if s=='L' else .194),-3.25,.91)) if rear else Vector((sign*1.03,step[s].y,.91)) for s in ['L','R']}
 end={s:Vector(seat['position'])+F@Vector((.194 if s=='L' else -.194,-.358,0)) for s in ['L','R']}
 for p in end.values():p.z=.91
 points=[start,Vector((x,-3.95,-.04)) if rear else Vector((sign*1.70,y-.075,-.04)),Vector((x,-3.72,.20)) if rear else Vector((sign*1.47,y-.075,.20)),Vector((x,-3.45,.32)) if rear else Vector((sign*1.20,y-.075,.32)),Vector((x,-3.20,.45)) if rear else Vector((sign*.96,y-.075,.45)),final,final]
 frames=[0,18,30,42,54,70,80]
 left=[initial['L'],step['L'],step['L'],threshold['L'],threshold['L'],end['L'],end['L']]
 right=[initial['R'],initial['R'],step['R'],step['R'],threshold['R'],end['R'],end['R']]
 yaw=[entry_yaw]*5+[final_yaw,final_yaw]
 hold=Vector((0,-3.45,1.7)) if rear else Vector((sign*1.28,(-.05 if y>.1 else -1.15 if y>-1 else -2.2),1.70))
 # Rear handhold uses the rear rail; side handhold is the nearest rear cage upright.
 grip='R' if sign<0 else 'L'
 return {'frames':frames,'root':[list(v) for v in points],'yaw':yaw,'left_sole':[list(v) for v in left],'right_sole':[list(v) for v in right],'handhold':list(hold),'grip_hand':grip,'final_root':list(final),'seat':seat,'duration':DURATION}
def sample(route,frame):
 j=next((i for i in range(len(route['frames'])-1) if frame<=route['frames'][i+1]),len(route['frames'])-2);t=(frame-route['frames'][j])/(route['frames'][j+1]-route['frames'][j]);t=max(0,min(1,t));ease=t*t*(3-2*t)
 position=lerp(route['root'][j],route['root'][j+1],ease);yaw=route['yaw'][j]+(route['yaw'][j+1]-route['yaw'][j])*ease
 feet=[]
 for key in ['left_sole','right_sole']:
  a=Vector(route[key][j]);b=Vector(route[key][j+1]);p=a.lerp(b,ease)
  if (a-b).length>.015 and j<4:p.z+=math.sin(math.pi*t)*.10
  feet.append(p)
 return position,yaw,feet
def pose(route,frame):
 position,yaw,feet=sample(route,frame);rig.location=position;rig.rotation_quaternion=Quaternion((0,0,1),yaw);bpy.context.view_layer.update();errors=[solve_leg(s,p) for s,p in zip(['L','R'],feet)]
 seat=route['seat'];blend=max(0,min(1,(frame-54)/16));rear=seat['id'].startswith(('07','08'));grip_amount=max(0,min(1,(frame-(18 if rear else 4))/(12 if rear else 14)))*(1-max(0,min(1,(frame-48)/16)))
 for side,sign in [('L',1),('R',-1)]:
  rest=rig.matrix_world@Vector((sign*.34,-.10,1.03))
  if seat['id']=='01_driver':target=Vector((-.6-sign*.13,.97,1.77))
  else:target=Vector(seat['position'])+Matrix.Rotation(math.pi+seat['yaw'],4,'Z')@Vector((sign*.20,-.34,.32))
  target=rest.lerp(target,blend)
  if side==route['grip_hand']:target=target.lerp(Vector(route['handhold']),grip_amount)
  hand(side,target)
 return max(errors)
previous_quaternions={}
def key(frame):
 # Matrix decomposition can flip quaternion signs at 180 degrees. Keep each keyed
 # sequence in one hemisphere so component interpolation cannot spin through zero.
 for name,o in [('object',rig)]+[(n,rig.pose.bones[n]) for n in control_names]:
  q=o.rotation_quaternion
  if name in previous_quaternions and q.dot(previous_quaternions[name])<0:q.negate()
  previous_quaternions[name]=q.copy()
 rig.keyframe_insert('location',frame=frame);rig.keyframe_insert('rotation_quaternion',frame=frame)
 for name in control_names:
  p=rig.pose.bones[name]
  for channel in ['location','rotation_quaternion','scale']:p.keyframe_insert(channel,frame=frame,group=name)
  if 'IK_FK' in p:p.keyframe_insert('["IK_FK"]',frame=frame,group=name)
all_routes=[];worst=0
for seat in vehicle_seating.SEATS:
 route=routes(seat);all_routes.append(route)
 for mode in ['mount','dismount','seat']:
  previous_quaternions.clear()
  reset();action=bpy.data.actions.new(mode+'_'+seat['id']);action.use_fake_user=True;rig.animation_data.action=action
  frames=[0,1] if mode=='seat' else list(range(0,81))
  for frame in frames:
   scene.frame_set(frame+1);worst=max(worst,pose(route,80 if mode=='seat' else 80-frame if mode=='dismount' else frame));key(frame+1)
  action['seat_id']=seat['id'];action['root_motion_space']='vehicle local +Y forward +Z up';action['contact_targets']='See carrier_boarding_routes.json';action['canonical_source_unchanged']=True
  for curve in action.fcurves:
   for point in curve.keyframe_points:point.interpolation='LINEAR'
  track=rig.animation_data.nla_tracks.new();track.name=action.name;strip=track.strips.new(action.name,1,action);strip.extrapolation='NOTHING';track.mute=True
  rig.animation_data.action=None
 print('AUTHORED_SEAT',seat['id'],flush=True)
reset();pose(all_routes[0],80);scene.frame_start=1;scene.frame_end=81
json.dump({'source':SOURCE,'duration':DURATION,'routes':all_routes,'max_leg_target_reach_error':worst,'contact_sampling_fps':24,'runtime_scale':1,'actions_per_seat':['mount','dismount','seat']},open(os.path.join(OUT,'carrier_boarding_routes.json'),'w'),indent=2)
bpy.ops.wm.save_as_mainfile(filepath=os.path.join(OUT,'carrier_boarding.blend'))
print('BOARDING_SOURCE_READY',worst,flush=True)
# Export only the derived character and deform hierarchy; retain canonical authoring source untouched.
bpy.ops.object.select_all(action='DESELECT');rig.select_set(True)
for o in chars:o.select_set(True)
for track in rig.animation_data.nla_tracks:track.mute=False
# Static seat actions still need root channels: omitting them leaves every clone
# at the exported driver's root, or at its previous boarding action's last frame.
bpy.ops.export_scene.gltf(filepath=os.path.join(OUT,'carrier-soldier.glb'),export_format='GLB',use_selection=True,export_yup=False,export_extras=True,export_animation_mode='NLA_TRACKS',export_frame_range=False,export_def_bones=True,export_force_sampling=True,export_optimize_animation_keep_anim_object=True)
# NLA preserves Blender's frame-one time offset; native playback begins at t=0.
import struct
glb_path=os.path.join(OUT,'carrier-soldier.glb');raw=bytearray(open(glb_path,'rb').read());json_length=struct.unpack_from('<I',raw,12)[0];doc=json.loads(raw[20:20+json_length]);binary_offset=28+json_length
for index in {s['input'] for animation in doc['animations'] for s in animation['samplers']}:
 accessor=doc['accessors'][index];view=doc['bufferViews'][accessor['bufferView']];offset=binary_offset+view.get('byteOffset',0)+accessor.get('byteOffset',0);first=struct.unpack_from('<f',raw,offset)[0]
 for i in range(accessor['count']):value=struct.unpack_from('<f',raw,offset+i*4)[0];struct.pack_into('<f',raw,offset+i*4,max(0,value-first))
 for key_name in ['min','max']:
  if key_name in accessor:accessor[key_name]=[max(0,accessor[key_name][0]-first)]
tail=raw[20+json_length:];data=json.dumps(doc,separators=(',',':')).encode();data+=b' '*((-len(data))%4)
open(glb_path,'wb').write(struct.pack('<III',0x46546c67,2,20+len(data)+len(tail))+struct.pack('<II',len(data),0x4e4f534a)+data+tail)
import shutil
shutil.copy2(os.path.join(OUT,'carrier-soldier.glb'),os.path.join(REPO,'public/models/carrier-soldier.glb'))
print('CARRIER_BOARDING_EXPORT_COMPLETE',flush=True)
