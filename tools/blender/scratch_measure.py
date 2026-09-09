"""Read-only static silhouette diagnostics; reference mask uses color separation."""
import bpy,os,json,statistics
from mathutils import Vector
OUT=os.path.abspath(os.path.join(os.path.dirname(__file__),'../../../../outputs/astra_2'))
bpy.ops.wm.open_mainfile(filepath=os.path.join(OUT,'soldier_scratch_equipped.blend'))
scene=bpy.context.scene;cam=scene.camera;center=Vector((0,0,.89));cam.location=center+Vector((0,12,0));cam.rotation_euler=(center-cam.location).to_track_quat('-Z','Y').to_euler();scene.render.film_transparent=True
path=os.path.join(OUT,'soldier_scratch_equipped_front_alpha.png');scene.render.filepath=path;bpy.ops.render.render(write_still=True)
reference=bpy.data.images.load(os.path.join(OUT,'soldier_tpose_reference.png'),check_existing=False);model=bpy.data.images.load(path,check_existing=False)
def profile(image,alpha):
 w,h=image.size;pixels=list(image.pixels);rows={}
 for y in range(h):
  xs=[]
  for x in range(w):
   i=((h-y-1)*w+x)*4;r,g,b,a=pixels[i:i+4]
   if (a>.5 if alpha else max(r,g,b)-min(r,g,b)>.040 and 25<y<1158):xs.append(x)
  if xs:rows[y]=(min(xs),max(xs))
 return rows
rp=profile(reference,False);mp=profile(model,True);top=min(mp);bottom=max(mp);height=bottom-top
result={'method':'Model alpha mask; approximate reference color-separation mask. Widths normalized by NVG-to-sole height. Reference threshold may miss dark neutral boundary pixels.','model_bounds':{'top':top,'bottom':bottom},'reference_bounds':{'top':30,'bottom':1155},'bands':{}}
for label,t in [('head',.09),('arm_span',.24),('chest',.34),('waist',.43),('pelvis',.53),('knee',.70),('ankle',.90)]:
 my=round(top+t*height);ry=round(30+t*1125)
 mw=statistics.median([mp[y][1]-mp[y][0] for y in range(my-2,my+3) if y in mp])/height
 rw=statistics.median([rp[y][1]-rp[y][0] for y in range(ry-3,ry+4) if y in rp])/1125
 result['bands'][label]={'reference_width_per_height':round(rw,4),'model_width_per_height':round(mw,4),'relative_difference_percent':round((mw/rw-1)*100,1)}
with open(os.path.join(OUT,'soldier_scratch_silhouette_metrics.json'),'w') as f:json.dump(result,f,indent=2)
print(result)

