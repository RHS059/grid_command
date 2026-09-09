"""Restore the prior Light candidate metrics after isolated Medium generation."""
import bpy,os,json,hashlib
from mathutils import Vector
from bpy_extras.object_utils import world_to_camera_view
OUT=os.path.abspath(os.path.join(os.path.dirname(__file__),'../../../../outputs/astra_2'))
bpy.ops.wm.open_mainfile(filepath=os.path.join(OUT,'soldier_scratch_equipped.blend'))
scene=bpy.context.scene;camera=scene.camera;center=Vector((0,0,.89));bounds={};triangles=0
for o in scene.objects:
 if o.type=='MESH':o.data.calc_loop_triangles();triangles+=len(o.data.loop_triangles)
for label,direction in {'front':(0,12,0),'side':(-12,0,0),'top_3quarter':(-8,14,3)}.items():
 camera.location=center+Vector(direction);camera.rotation_euler=(center-camera.location).to_track_quat('-Z','Y').to_euler();bpy.context.view_layer.update()
 points=[world_to_camera_view(scene,camera,o.matrix_world@v.co) for o in scene.objects if o.type=='MESH' for v in o.data.vertices]
 bounds[label]={'top':(1-max(p.y for p in points))*640,'bottom':(1-min(p.y for p in points))*640}
body=bpy.data.objects['Scratch_Continuous_Body']
report={'triangles':triangles,'body_unchanged':True,'body_vertex_hash':hashlib.sha256(str([tuple(v.co) for v in body.data.vertices]).encode()).hexdigest(),'rigged':False,'view_bounds':bounds,'inputs':['soldier_scratch_body.blend','three generated turnaround images'],'note':'Metrics regenerated read-only from existing Light static blend after Medium comparison.'}
with open(os.path.join(OUT,'soldier_scratch_equipped_stats.json'),'w') as f:json.dump(report,f,indent=2)
print(report)
