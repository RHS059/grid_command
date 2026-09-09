import bpy, json, os, math
ROOT=os.path.abspath(os.path.join(os.path.dirname(__file__),'../..'))
OUT=os.path.abspath(os.path.join(ROOT,'../../outputs/astra_2'))
result={}
for asset in ['mec_lift','soldier']:
 bpy.ops.wm.open_mainfile(filepath=os.path.join(OUT,asset+'.blend'))
 checked=[]
 if asset=='soldier':
  rig=bpy.data.objects['GC_Soldier_Rig']
  for action in bpy.data.actions:
   rig.animation_data.action=action
   for frame in [1,12,24]:
    bpy.context.scene.frame_set(frame);bpy.context.view_layer.update()
    for bone in rig.pose.bones:
     assert all(math.isfinite(v) for row in bone.matrix for v in row)
    body=bpy.data.objects.get('GC_Soldier_Body')
    if body:
     evaluated=body.evaluated_get(bpy.context.evaluated_depsgraph_get())
     assert all(math.isfinite(c) and abs(c)<4 for vertex in evaluated.data.vertices for c in vertex.co)
   checked.append(action.name)
  for pose in ['idle_ready','walk','crouch','prone']:
   rig.animation_data.action=bpy.data.actions[pose];bpy.context.scene.frame_set(12)
   bpy.context.scene.render.filepath=os.path.join(OUT,'soldier_'+pose+'.png');bpy.ops.render.render(write_still=True)
 else:
  nodes=[o for o in bpy.context.scene.objects if o.animation_data]
  for node in nodes:
   for track in node.animation_data.nla_tracks:
    track.mute=False
    bpy.context.scene.frame_set(24);bpy.context.view_layer.update()
    assert all(math.isfinite(v) for row in node.matrix_world for v in row)
    checked.append(track.name);track.mute=True
 result[asset]={'sampled_actions':sorted(set(checked)),'finite_transform_check':'pass'}
with open(os.path.join(OUT,'pose_verification.json'),'w') as f:json.dump(result,f,indent=2)
print(result)
