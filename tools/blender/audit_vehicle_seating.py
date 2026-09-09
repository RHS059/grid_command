import bpy, os, json, math
from mathutils import Vector, Matrix, Quaternion
OUT=os.environ['GC_SEAT_AUDIT_OUT']
os.makedirs(OUT,exist_ok=True)
SOURCE=os.environ['GC_SOLDIER_SOURCE']
bpy.ops.wm.open_mainfile(filepath=SOURCE)
def bounds(o):
 pts=[o.matrix_world@Vector(v) for v in o.bound_box]
 return {'min':[min(p[i] for p in pts) for i in range(3)],'max':[max(p[i] for p in pts) for i in range(3)]}
meshes={o.name:bounds(o) for o in bpy.context.scene.objects if o.type=='MESH' and not o.hide_render and not o.name.startswith('WGT')}
rigs={o.name:{'scale':list(o.scale),'location':list(o.location),'bones':{b.name:{'head':list(b.head_local),'tail':list(b.tail_local),'parent':b.parent.name if b.parent else None,'properties':{k:bpy.data.objects[o.name].pose.bones[b.name][k] for k in bpy.data.objects[o.name].pose.bones[b.name].keys() if k!='_RNA_UI'}} for b in o.data.bones}} for o in bpy.context.scene.objects if o.type=='ARMATURE'}
json.dump({'meshes':meshes,'rigs':rigs},open(os.path.join(OUT,'soldier_measurements.json'),'w'),indent=2,default=str)
print('SOLDIER_AUDIT',len(meshes),'meshes',flush=True)

rig=bpy.data.objects['Astra_Rigify_Rig'];scene=bpy.context.scene
chars=[o for o in scene.objects if o.type=='MESH' and o.get('component')]
rig.animation_data.action=None
for track in rig.animation_data.nla_tracks:track.mute=True
scene.frame_set(1)
for pb in rig.pose.bones:
 pb.rotation_mode='QUATERNION';pb.location=(0,0,0);pb.rotation_quaternion=(1,0,0,0);pb.scale=(1,1,1)
 if 'IK_FK' in pb:pb['IK_FK']=1.;pb['IK_Stretch']=0.
bpy.context.view_layer.update()
def snapshot(name):
 dg=bpy.context.evaluated_depsgraph_get();verts=[];faces=[];materials=[];indices=[]
 for o in chars:
  me=o.evaluated_get(dg).data;start=len(verts);verts.extend(o.matrix_world@v.co for v in me.vertices)
  remap=[]
  for evaluated_material in me.materials:
   m=evaluated_material.original
   if m not in materials:materials.append(m)
   remap.append(materials.index(m))
  for p in me.polygons:faces.append(tuple(start+i for i in p.vertices));indices.append(remap[p.material_index] if remap else 0)
 mesh=bpy.data.meshes.new(name);mesh.from_pydata(verts,[],faces);mesh.update()
 for m in materials:mesh.materials.append(m)
 for p,i in zip(mesh.polygons,indices):p.material_index=i
 return mesh
standing=snapshot('Canonical_soldier_standing_1_to_1')
def rotate(name,axis,degrees):
 pb=rig.pose.bones[name];m=pb.matrix.copy();r=Quaternion(Vector(axis),math.radians(degrees)).to_matrix().to_4x4()@m;r.translation=m.translation;pb.matrix=r;bpy.context.view_layer.update()
for side,sign in [('L',1),('R',-1)]:
 rotate('thigh_fk.'+side,(1,0,0),-90);rotate('shin_fk.'+side,(1,0,0),90)
 rotate('upper_arm_fk.'+side,(0,1,0),sign*78);rotate('forearm_fk.'+side,(1,0,0),-82)
seated=snapshot('Canonical_soldier_seated_1_to_1')
def extrema(points):return {'min':[min(v[i] for v in points) for i in range(3)],'max':[max(v[i] for v in points) for i in range(3)]}
seated_points=[v.co for v in seated.vertices]
body=bpy.data.objects['Uniform_continuous_body'];body_eval=body.evaluated_get(bpy.context.evaluated_depsgraph_get()).data
pelvis_points=[body.matrix_world@v.co for v in body_eval.vertices if abs(v.co.x)<.24 and -.08<v.co.y<.16 and .7<v.co.z<1.05]
contact_z=min(v.z for v in pelvis_points)
contact=Vector((0,.03,contact_z))
seated_bounds=extrema(seated_points)
metrics={'source':SOURCE,'units':'meters','canonical_forward':'-Y','vehicle_forward':'+Y','standing':extrema([v.co for v in standing.vertices]),'seated':seated_bounds,'cushion_contact_reference':list(contact),'seated_height_above_cushion':seated_bounds['max'][2]-contact_z,'boot_drop_below_cushion':contact_z-seated_bounds['min'][2],'seated_width':seated_bounds['max'][0]-seated_bounds['min'][0],'forward_extent_from_contact':contact.y-seated_bounds['min'][1],'back_extent_from_contact':seated_bounds['max'][1]-contact.y,'pose_note':'Review-only FK sit: thighs -90deg, shins +90deg, arms lowered, forearms toward lap. Full backpack and helmet retained; no source geometry or scale changes.'}
json.dump(metrics,open(os.path.join(OUT,'canonical_seated_metrics.json'),'w'),indent=2)
print('SEATED_METRICS',json.dumps(metrics),flush=True)
# Keep evaluated, unscaled snapshots and discard authoring scene from this review copy.
for o in list(scene.objects):bpy.data.objects.remove(o,do_unlink=True)
standing.use_fake_user=True;seated.use_fake_user=True
VEHICLE_DIR=os.path.abspath(os.path.join(OUT,'../../vehicle_models'))
results={}
def clear():
 for o in list(scene.objects):bpy.data.objects.remove(o,do_unlink=True)
def load_vehicle(name):
 if name in ['troop_transport','apc','tank']:
  with bpy.data.libraries.load(os.path.join(VEHICLE_DIR,name+'.blend'),link=False) as (src,dst):dst.objects=[n for n in src.objects if n.startswith(('GC_','Assembly_','Mount_')) or not n.startswith(('Studio','Review'))]
  for o in dst.objects:
   if o and o.type not in ['CAMERA','LIGHT']:scene.collection.objects.link(o)
  for o in list(scene.objects):
   if o.animation_data:
    o.animation_data.action=None
    for track in o.animation_data.nla_tracks:track.mute=True
 else:
  for item in json.load(open(os.path.join(OUT,name+'_geometry.json'))):
   p=item['positions'];me=bpy.data.meshes.new(item['name']);me.from_pydata([p[i:i+3] for i in range(0,len(p),3)],[],[(i,i+1,i+2) for i in range(0,len(p)//3,3)]);o=bpy.data.objects.new(item['name'],me);scene.collection.objects.link(o)
   m=bpy.data.materials.new(name+'_paint');m.diffuse_color=(*item['color'],1);m.use_nodes=True;m.node_tree.nodes['Principled BSDF'].inputs['Base Color'].default_value=(*item['color'],1);m.node_tree.nodes['Principled BSDF'].inputs['Roughness'].default_value=.85;me.materials.append(m)
 bpy.context.view_layer.update()
 return [o for o in scene.objects if o.type=='MESH']
def person(name,position,yaw=0,sitting=True):
 o=bpy.data.objects.new(name,seated if sitting else standing);scene.collection.objects.link(o)
 r=Matrix.Rotation(math.pi+yaw,4,'Z');anchor=contact if sitting else Vector((0,0,metrics['standing']['min'][2]))
 o.matrix_world=Matrix.Translation(Vector(position))@r@Matrix.Translation(-anchor)
 o['canonical_scale']=1.;o['review_only']=True
 return o
def marker(name,position,yaw=0):
 o=bpy.data.objects.new(name,None);scene.collection.objects.link(o);o.location=position;o.rotation_euler.z=yaw;o.empty_display_type='ARROWS';o.empty_display_size=.25;o['forward_axis']='+Y';o['anchor']='cushion contact';return o
def render(name,objects,views):
 scene.render.engine='BLENDER_EEVEE_NEXT';scene.render.resolution_x=1100;scene.render.resolution_y=850;scene.render.resolution_percentage=100
 scene.render.image_settings.file_format='PNG';scene.render.film_transparent=False;scene.use_nodes=False;scene.view_settings.view_transform='Standard';scene.view_settings.look='Medium High Contrast'
 world=bpy.data.worlds.new('Seat_audit_world');world.use_nodes=True;world.node_tree.nodes['Background'].inputs[0].default_value=(.16,.19,.22,1);world.node_tree.nodes['Background'].inputs[1].default_value=.7;scene.world=world
 points=[o.matrix_world@Vector(c) for o in objects for c in o.bound_box];box=extrema(points);center=(Vector(box['min'])+Vector(box['max']))*.5
 for loc in [(6,7,12),(-6,3,7),(0,-7,9)]:
  bpy.ops.object.light_add(type='AREA',location=loc);l=bpy.context.object;l.data.energy=1400;l.data.size=7;l.rotation_euler=(center-l.location).to_track_quat('-Z','Y').to_euler()
 bpy.ops.object.camera_add();cam=bpy.context.object;cam.data.type='ORTHO';scene.camera=cam
 for label,direction in views.items():
  cam.location=center+Vector(direction);cam.rotation_euler=(center-cam.location).to_track_quat('-Z','Y').to_euler();bpy.context.view_layer.update();inv=cam.matrix_world.inverted();p=[inv@v for v in points];b=extrema(p);cam.data.ortho_scale=max(b['max'][0]-b['min'][0],(b['max'][1]-b['min'][1])*1100/850)*1.14
  scene.render.filepath=os.path.join(OUT,name+'_'+label+'.png');bpy.ops.render.render(write_still=True)
 bpy.ops.wm.save_as_mainfile(filepath=os.path.join(OUT,name+'_audit.blend'))
for name in ['troop_transport','apc','tank','truck','forklift','uav_jammer']:
 clear();vehicle=load_vehicle(name);measurements={o.name:bounds(o) for o in vehicle};results[name]={'objects':measurements}
 placements=[]
 if name=='troop_transport':
  for row,y in enumerate([.3,-.48,-1.15]):
   for side,x in [('L',-.43),('R',.43)]:placements.append({'id':f'{row*2+(0 if side=="L" else 1):02d}_{side}','position':[x,y,1.095],'yaw':0})
  placements.extend([{'id':'06_rear_L','position':[-.5,-2.04,1.095],'yaw':-math.pi/2},{'id':'07_rear_R','position':[.5,-2.04,1.095],'yaw':math.pi/2}])
 elif name=='apc':
  for side,x in [('L',-.56),('R',.56)]:
   for row,y in enumerate([-2.34,-2.88]):placements.append({'id':f'rear_bench_{side}_{row}','position':[x,y,1.125],'yaw':-math.pi/2 if x<0 else math.pi/2})
 elif name=='forklift':placements=[{'id':'driver','position':[0,0,1.25],'yaw':0}]
 for seat in placements:
  marker('Seat_'+seat['id'],seat['position'],seat['yaw']);o=person('Occupant_'+seat['id'],seat['position'],seat['yaw']);seat['occupant_bounds']=bounds(o)
 results[name]['current_seat_markers']=placements
 if name in ['tank','truck','uav_jammer']:person('Standing_canonical_scale_reference',[-2.5,0,0],sitting=False)
 bpy.context.view_layer.update();all_meshes=[o for o in scene.objects if o.type=='MESH']
 render(name,all_meshes,{'side':(14,0,0),'top':(0,0,16),'three_quarter':(10,14,10)} if name in ['troop_transport','apc','forklift'] else {'side':(14,0,0),'three_quarter':(10,14,10)})
json.dump(results,open(os.path.join(OUT,'vehicle_clearance_measurements.json'),'w'),indent=2)
print('VEHICLE_SEATING_AUDIT_COMPLETE')
