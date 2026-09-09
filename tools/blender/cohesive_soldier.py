"""Continuous watertight anatomical body, with smooth weights across joints."""
import bpy, math, json, os
from mathutils import Vector

def rebuild(rig, form, camo, skin, out):
 reference=globals().get('REFERENCE_PROPORTIONS',False)
 form('Body_neck',(0,0,1.465),(.083,.083,.11),'head',camo[0],3)
 form('Body_abdomen',(0,0,1.07),(.165,.12,.17) if reference else (.19,.135,.17),'spine',camo[0],3)
 for side,s in [('L',-1),('R',1)]:
  form('Body_deltoid.'+side,(s*.235,0,1.35),(.095,.078,.082) if reference else (.12,.113,.116),'upper_arm.'+side,camo[0],3)
  for stem,radius in [('forearm',.071 if reference else .086),('shin',.076 if reference else .090)]:
   p=rig.data.bones[stem+'.'+side].head_local
   form('Body_joint_'+stem+'.'+side,p,(radius,radius,radius),stem+'.'+side,camo[0],3)
 body_parts=[o for o in bpy.context.scene.objects if o.type=='MESH' and o.name.startswith('Body_')]
 bpy.ops.object.select_all(action='DESELECT')
 for o in body_parts:
  o.modifiers.clear();o.select_set(True)
 bpy.context.view_layer.objects.active=body_parts[0];bpy.ops.object.join();body=bpy.context.object;body.name='GC_Soldier_Body';body.parent=None
 bpy.ops.object.transform_apply(location=True,rotation=True,scale=True)
 remesh=body.modifiers.new('Continuous anatomical union','REMESH');remesh.mode='VOXEL';remesh.voxel_size=.012;remesh.use_smooth_shade=False;bpy.ops.object.modifier_apply(modifier=remesh.name)
 smooth=body.modifiers.new('Joint transition relaxation','SMOOTH');smooth.factor=.70;smooth.iterations=5;bpy.ops.object.modifier_apply(modifier=smooth.name)
 if reference:
  bpy.ops.object.quadriflow_remesh(target_faces=2400,use_mesh_symmetry=False)
 body.data.calc_loop_triangles();dec=body.modifiers.new('PS2 angular topology','DECIMATE');dec.ratio=min(1,(4700 if reference else 7100)/len(body.data.loop_triangles));bpy.ops.object.modifier_apply(modifier=dec.name)
 if reference:
  tri=body.modifiers.new('Angular triangular cloth faces','TRIANGULATE');bpy.ops.object.modifier_apply(modifier=tri.name)
 body.data.materials.clear()
 for m,c in zip(camo,[(.30,.255,.175),(.39,.335,.235),(.23,.195,.135)] if reference else [(.28,.31,.21),(.33,.35,.24),(.235,.265,.185)]):
  m.diffuse_color=(*c,1);m.node_tree.nodes['Principled BSDF'].inputs['Base Color'].default_value=(*c,1)
 for m in [*camo,skin]:body.data.materials.append(m)
 for p in body.data.polygons:
  co=p.center;v=math.sin((p.index+1)*12.9898) if reference else math.sin(co.x*28+co.z*21)*math.cos(co.y*27-co.z*13);p.material_index=3 if co.z>1.50 else 1 if v>.50 else 2 if v<-.65 else 0;p.use_smooth=False
 if reference:
  for v in body.data.vertices:
   amount=.0018*math.sin(v.index*16.731);v.co+=v.normal*amount
 body.vertex_groups.clear()
 bones=[b for b in rig.data.bones if b.name not in ['root','weapon']]
 groups={b.name:body.vertex_groups.new(name=b.name) for b in bones}
 def segment_distance(p,b):
  a,c=b.head_local,b.tail_local;d=c-a;t=max(0,min(1,(p-a).dot(d)/d.length_squared));return (p-(a+t*d)).length
 for v in body.data.vertices:
  p=v.co;candidates=[]
  for b in bones:
   if '.L' in b.name and p.x>.035:continue
   if '.R' in b.name and p.x<-.035:continue
   d=segment_distance(p,b)
   if b.name=='head' and p.z<1.38:d+=.15
   if b.name in ['pelvis','spine'] and abs(p.x)>.28:d+=.3
   candidates.append((d,b.name))
  nearest=sorted(candidates)[:3];weights=[1/max(.025,d)**5 for d,n in nearest];total=sum(weights)
  for (_,name),w in zip(nearest,weights):groups[name].add([v.index],w/total,'REPLACE')
 mod=body.modifiers.new('GC continuous body skin','ARMATURE');mod.object=rig;body.parent=rig
 adjacent=[[] for _ in body.data.vertices]
 for e in body.data.edges:a,b=e.vertices;adjacent[a].append(b);adjacent[b].append(a)
 unseen=set(range(len(adjacent)));components=[]
 while unseen:
  todo=[unseen.pop()];count=0
  while todo:
   a=todo.pop();count+=1
   for b in adjacent[a]:
    if b in unseen:unseen.remove(b);todo.append(b)
  components.append(count)
 body.data.calc_loop_triangles()
 result={'body_meshes':1,'connected_components':len(components),'component_vertices':components,'body_triangles':len(body.data.loop_triangles),'weighted_vertices':len(body.data.vertices)}
 with open(os.path.join(out,'continuous_body_verification.json'),'w') as f:json.dump(result,f,indent=2)
 assert len(components)==1, result
 print('CONTINUOUS_BODY',result,flush=True)
 return body
