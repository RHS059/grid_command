import bpy, os, json, sys, math
from mathutils import Vector, Matrix
sys.path.insert(0,os.path.dirname(__file__))
import vehicle_seating
OUT=os.environ['GC_OUTPUT_DIR'];AUDIT=os.path.abspath(os.path.join(OUT,'../seating_audit'))
metrics=json.load(open(os.path.join(AUDIT,'canonical_seated_metrics.json')));contact=Vector(metrics['cushion_contact_reference'])
bpy.ops.wm.open_mainfile(filepath=os.path.join(AUDIT,'troop_transport_audit.blend'))
character=next(o.data for o in bpy.context.scene.objects if o.name.startswith('Occupant_'));character.use_fake_user=True
reports={}
for state in ['before','after']:
 for o in list(bpy.context.scene.objects):bpy.data.objects.remove(o,do_unlink=True)
 source=os.path.join(AUDIT,'../../vehicle_models/troop_transport.blend') if state=='before' else os.path.join(OUT,'troop_transport.blend')
 with bpy.data.libraries.load(source,link=False) as (src,dst):dst.objects=[n for n in src.objects if not n.startswith(('Studio','Review'))]
 scene=bpy.context.scene
 for o in dst.objects:
  if o and o.type not in ['CAMERA','LIGHT']:scene.collection.objects.link(o)
 for o in scene.objects:
  if o.animation_data:
   o.animation_data.action=None
   for track in o.animation_data.nla_tracks:track.mute=True
 seats=vehicle_seating.SEATS if state=='after' else [{'id':f'{row*2+i+1:02d}','position':[x,y,1.095],'yaw':0} for row,y in enumerate([.3,-.48,-1.15]) for i,x in enumerate([-.43,.43])]+[{'id':'07','position':[-.5,-2.04,1.095],'yaw':-math.pi/2},{'id':'08','position':[.5,-2.04,1.095],'yaw':math.pi/2}]
 occupants=[];bounds=[]
 for seat in seats:
  o=bpy.data.objects.new('Canonical_occupant_'+seat['id'],character);scene.collection.objects.link(o);o.matrix_world=Matrix.Translation(Vector(seat['position']))@Matrix.Rotation(math.pi+seat['yaw'],4,'Z')@Matrix.Translation(-contact);occupants.append(o)
  pts=[o.matrix_world@v.co for v in character.vertices];lo=Vector([min(p[i] for p in pts) for i in range(3)]);hi=Vector([max(p[i] for p in pts) for i in range(3)]);bounds.append((lo,hi))
 bpy.context.view_layer.update()
 roof=2.5 if state=='after' else 2.035;floor=.91
 overlaps=[]
 for i,(a,b) in enumerate(bounds):
  for j,(c,d) in enumerate(bounds[:i]):
   depth=[min(b[k],d[k])-max(a[k],c[k]) for k in range(3)]
   if min(depth)>0:overlaps.append({'a':seats[j]['id'],'b':seats[i]['id'],'overlap':[round(v,4) for v in depth]})
 report={'seat_count':len(seats),'canonical_scale':1,'floor_z':floor,'roof_underside_z':roof,'minimum_boot_floor_clearance':min(a.z-floor for a,b in bounds),'minimum_head_roof_clearance':min(roof-b.z for a,b in bounds),'occupant_envelope_overlaps':overlaps,'seats':[{**seat,'bounds':{'min':list(a),'max':list(b)}} for seat,(a,b) in zip(seats,bounds)]}
 reports[state]=report
 envelope_material=bpy.data.materials.new('Envelope_'+state);envelope_material.diffuse_color=(.08,.8,.35,1) if state=='after' else (1,.12,.05,1);envelope_material.use_nodes=True;p=envelope_material.node_tree.nodes['Principled BSDF'];p.inputs['Base Color'].default_value=envelope_material.diffuse_color;p.inputs['Emission Color'].default_value=envelope_material.diffuse_color;p.inputs['Emission Strength'].default_value=.5
 envelopes=[]
 for seat,(a,b) in zip(seats,bounds):
  bpy.ops.mesh.primitive_cube_add(size=1,location=(a+b)*.5);o=bpy.context.object;o.name='Clearance_envelope_'+seat['id'];o.dimensions=b-a;bpy.ops.object.transform_apply(location=False,rotation=False,scale=True);o.data.materials.append(envelope_material);wire=o.modifiers.new('Conservative envelope','WIREFRAME');wire.thickness=.009;envelopes.append(o)
 scene.render.engine='BLENDER_EEVEE_NEXT';scene.render.resolution_x=1100;scene.render.resolution_y=850;scene.render.resolution_percentage=100;scene.render.film_transparent=False;scene.use_nodes=False;scene.render.image_settings.file_format='PNG';scene.view_settings.view_transform='Standard';scene.view_settings.look='Medium High Contrast'
 world=bpy.data.worlds.new('Fit_world');world.use_nodes=True;world.node_tree.nodes['Background'].inputs[0].default_value=(.17,.195,.22,1);world.node_tree.nodes['Background'].inputs[1].default_value=.7;scene.world=world
 meshes=[o for o in scene.objects if o.type=='MESH' and o not in envelopes];pts=[o.matrix_world@Vector(v) for o in meshes for v in o.bound_box];lo=Vector([min(p[i] for p in pts) for i in range(3)]);hi=Vector([max(p[i] for p in pts) for i in range(3)]);center=(lo+hi)*.5
 for loc in [(7,9,13),(-8,3,7),(0,-9,9)]:
  bpy.ops.object.light_add(type='AREA',location=loc);o=bpy.context.object;o.data.energy=1500;o.data.size=7;o.rotation_euler=(center-o.location).to_track_quat('-Z','Y').to_euler()
 bpy.ops.object.camera_add();cam=bpy.context.object;cam.data.type='ORTHO';scene.camera=cam
 for label,angle in {'front':(0,16,0),'rear':(0,-16,0),'side':(16,0,0),'top':(0,0,16),'three_quarter':(10,14,10)}.items():
  cam.location=center+Vector(angle);cam.rotation_euler=(center-cam.location).to_track_quat('-Z','Y').to_euler();bpy.context.view_layer.update();camera_points=[cam.matrix_world.inverted()@p for p in pts];w=max(p.x for p in camera_points)-min(p.x for p in camera_points);h=max(p.y for p in camera_points)-min(p.y for p in camera_points);cam.data.ortho_scale=max(w,h*1100/850)*1.15
  for mode in ['envelopes','occupied']:
   for o in envelopes:o.hide_render=mode!='envelopes'
   scene.render.filepath=os.path.join(OUT,f'{state}_{mode}_{label}.png');bpy.ops.render.render(write_still=True)
 bpy.ops.wm.save_as_mainfile(filepath=os.path.join(OUT,state+'_seating_proof.blend'))
json.dump(reports,open(os.path.join(OUT,'seating_fit_verification.json'),'w'),indent=2)
assert reports['after']['minimum_boot_floor_clearance']>0
assert reports['after']['minimum_head_roof_clearance']>.05
assert not reports['after']['occupant_envelope_overlaps']
print('TROOP_SEATING_FIT_PASS',json.dumps({k:{a:b for a,b in v.items() if a!='seats'} for k,v in reports.items()}))
