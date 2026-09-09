import bpy,os,json,math
from mathutils import Vector
OUT=os.environ['GC_OUTPUT_DIR'];bpy.ops.wm.open_mainfile(filepath=os.path.join(OUT,'carrier_boarding.blend'));scene=bpy.context.scene;rig=bpy.data.objects['Astra_Rigify_Rig']
for o in scene.objects:
 if o.animation_data:
  o.animation_data.action=None
  for track in o.animation_data.nla_tracks:track.mute=True
with bpy.data.libraries.load(os.path.join(OUT,'troop_transport.blend'),link=False) as (src,dst):dst.objects=[n for n in src.objects if not n.startswith(('Studio','Review'))]
for o in dst.objects:
 if o and o.type not in ['CAMERA','LIGHT']:scene.collection.objects.link(o)
scene.render.engine='BLENDER_EEVEE_NEXT';scene.render.resolution_x=1100;scene.render.resolution_y=850;scene.render.resolution_percentage=100;scene.render.film_transparent=False;scene.use_nodes=False;scene.render.image_settings.file_format='PNG';scene.view_settings.view_transform='Standard';scene.view_settings.look='Medium High Contrast'
world=bpy.data.worlds.new('Boarding_world');world.use_nodes=True;world.node_tree.nodes['Background'].inputs[0].default_value=(.17,.195,.22,1);world.node_tree.nodes['Background'].inputs[1].default_value=.7;scene.world=world
center=Vector((0,-.65,1.35))
for loc in [(7,9,13),(-8,3,7),(0,-9,9)]:
 bpy.ops.object.light_add(type='AREA',location=loc);o=bpy.context.object;o.data.energy=1500;o.data.size=7;o.rotation_euler=(center-o.location).to_track_quat('-Z','Y').to_euler()
bpy.ops.object.camera_add();cam=bpy.context.object;cam.data.type='ORTHO';cam.data.ortho_scale=8.5;scene.camera=cam
reports={}
for seat in ['01_driver','02_row1_R','07_rear_L','08_rear_R']:
 rig.animation_data.action=bpy.data.actions['mount_'+seat]
 side=-1 if seat in ['01_driver','07_rear_L'] else 1;angle=Vector((side*10,-14 if seat.startswith(('07','08')) else 14,10));cam.location=center+angle;cam.rotation_euler=(center-cam.location).to_track_quat('-Z','Y').to_euler()
 for frame in [1,19,43,55,71,81]:
  scene.frame_set(frame);bpy.context.view_layer.update();scene.render.filepath=os.path.join(OUT,f'mount_{seat}_frame_{frame:02d}.png');bpy.ops.render.render(write_still=True)
 reports[seat]={'start_root':list(bpy.data.actions['mount_'+seat].frame_range),'seat_frame':81}
json.dump(reports,open(os.path.join(OUT,'boarding_render_frames.json'),'w'),indent=2)
print('BOARDING_RENDER_PROOF_COMPLETE')
