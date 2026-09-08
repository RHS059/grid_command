import bpy
from mathutils import Vector

def select_vehicle_clip(clip='idle',time=0):
 """Run in Blender Text Editor, then call select_vehicle_clip('drive', .5)."""
 scene=bpy.context.scene
 for obj in scene.objects:
  if obj.animation_data:
   obj.animation_data.action=None
   for track in obj.animation_data.nla_tracks:track.mute=track.name!=clip
 scene.frame_set(1+int(time*scene.render.fps))
 for obj in scene.objects:
  if 'rig_pivot' not in obj:continue
  active=obj.animation_data and any(not t.mute for t in obj.animation_data.nla_tracks)
  if not active:
   obj.location=Vector(obj['rig_pivot'])-Vector(obj.parent.get('rig_pivot',[0,0,0]));obj.rotation_euler=(0,0,0)
 bpy.context.view_layer.update()

if __name__=='__main__':select_vehicle_clip()
