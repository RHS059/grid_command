"""Keep the photo contour trace next to the inferred manufactured planform."""
import bpy,os,sys,json
from mathutils import Vector
HERE=os.path.dirname(os.path.abspath(__file__));sys.path.insert(0,HERE)
import build_fq44_r4_blockout as guide
OUT=os.path.join(HERE,'fighter_r4')
bpy.ops.wm.read_factory_settings(use_empty=True);scene=bpy.context.scene
scene.name='R4 planform photo trace';scene.render.engine='CYCLES';scene.cycles.samples=4
scene.render.resolution_percentage=100;scene.render.image_settings.file_format='PNG';scene.view_settings.view_transform='Standard'
path=os.path.abspath(os.path.join(HERE,'../../../../fq44-references/reference-4.png'))
im=bpy.data.images.load(path);w,h=im.size;scale=.01
# The original banked view is a perspective guide. Its reference plane is
# separate from the manufactured wing. No orthographic accuracy is asserted.
v=[(0,0,0),(0,w*scale,0),(0,w*scale,h*scale),(0,0,h*scale)]
plane=guide.image_plane('PHOTO_4_PLANFORM_REFERENCE',path,v)
def p(x,y):return (.005,x*scale,(h-y)*scale)
curves={
    'main_wing_visible_upper':[(522,305),(624,30),(665,28),(752,305)],
    'main_wing_visible_lower':[(513,441),(419,694),(461,691),(695,448)],
    'tailplane_visible_lower':[(230,426),(188,543),(228,547),(335,432)]}
cyan=guide.material('Photo contour',(.0,.7,.9),True)
for name,points in curves.items():
    obj=guide.connected_curve(name,[p(x,y) for x,y in points],cyan,.012,True)
    obj['source']='Original photo 4';obj['projection']='Perspective. Occluded root positions are inferred.'
    obj['landmark_start']='wing_leading_root' if name.startswith('main') else 'tailplane_root'
    obj['landmark_end']='wing_trailing_root' if name.startswith('main') else 'exhaust_plane'
scene['root_alignment']='Side-traced wing roots lock Y to +0.1662 and -3.2752. Front-traced width locks span. Photo contours constrain sweep, taper and tip shape.'
cam=guide.camera('Photo trace camera',(20,w*scale/2,h*scale/2),(0,w*scale/2,h*scale/2),w*scale)
guide.render(scene,cam,'planform_photo_4_contours',1280,720)
bpy.ops.wm.save_as_mainfile(filepath=os.path.join(OUT,'04_planform_photo_contours.blend'))
with open(os.path.join(OUT,'planform_photo_trace.json'),'w') as f:json.dump({'photo':'User reference 4','contours_pixels':curves,'root_alignment':scene['root_alignment'],'limits':'Perspective and occlusion prevent exact plan dimensions. Original photos 2 and 3 check the parked assembly. Generated hidden mechanisms are not construction evidence.'},f,indent=2)
