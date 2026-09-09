"""Render canonical CAS views and attack proof; assert exported fuel attachments are static."""
import bpy, os, sys, json, struct
from mathutils import Vector
sys.path.insert(0,os.path.dirname(__file__))
import vehicle_rigging

repo=os.path.abspath(os.path.join(os.path.dirname(__file__),'../..'))
out=os.environ['GC_OUTPUT_DIR']
bpy.ops.wm.open_mainfile(filepath=os.path.join(out,'cas.blend'))
rig=json.load(open(os.path.join(repo,'lib/game/generated/cas_rig.json')))
scene=bpy.context.scene
scene.render.resolution_x=960;scene.render.resolution_y=720
scene.use_nodes=True
tree=scene.node_tree;tree.nodes.clear()
layers=tree.nodes.new('CompositorNodeRLayers');glow=tree.nodes.new('CompositorNodeGlare');glow.glare_type='FOG_GLOW';glow.quality='HIGH';glow.threshold=1.5
composite=tree.nodes.new('CompositorNodeComposite');tree.links.new(layers.outputs['Image'],glow.inputs['Image']);tree.links.new(glow.outputs['Image'],composite.inputs['Image'])
groups={key:bpy.data.objects['Assembly_'+key] for key in rig['nodes']}
fuel={key:o.matrix_world.copy() for key,o in groups.items() if key.startswith('fuel_pod_')}
assert len(fuel)==4
def pose(t):
 for key,o in groups.items():
  node=rig['nodes'][key];move,rot=vehicle_rigging.sample(node['kind'],'shoot',t,1.2,node)
  o.location=Vector(node['pivot'])-(Vector(rig['nodes'][node['parent']]['pivot']) if node.get('parent') else Vector())+Vector(move);o.rotation_euler=rot
  o.scale=(vehicle_rigging.flash_scale('shoot',t),)*3 if node['kind']=='muzzle_flash' else (1,1,1)
 bpy.context.view_layer.update()
 for key,matrix in fuel.items():assert all(abs(a-b)<1e-7 for row_a,row_b in zip(matrix,groups[key].matrix_world) for a,b in zip(row_a,row_b)),key
for i in range(121):pose(i/100)
# Verify actual GLB shoot channels cannot move any fuel assembly or its descendants.
raw=open(os.path.join(repo,'public/models/cas.glb'),'rb').read();size=struct.unpack_from('<I',raw,12)[0];doc=json.loads(raw[20:20+size])
protected=set()
def protect(i):
 protected.add(i)
 for child in doc['nodes'][i].get('children',[]):protect(child)
for i,node in enumerate(doc['nodes']):
 if node.get('name','').startswith('Assembly_fuel_pod_'):protect(i)
shoot=next(a for a in doc['animations'] if a['name']=='shoot')
assert all(c['target']['node'] not in protected for animation in doc['animations'] for c in animation['channels'])
flashes=[i for i,n in enumerate(doc['nodes']) if n.get('name','').startswith('Assembly_muzzle_flash_')]
assert len(flashes)==2
assert all(any(c['target']=={'node':i,'path':'scale'} for c in shoot['channels']) for i in flashes)
assert all(shoot['samplers'][c['sampler']]['interpolation']=='STEP' for c in shoot['channels'] if c['target']['node'] in flashes and c['target']['path']=='scale')
for label,t,direction in [('start',0,(13,18,12)),('burst',.1,(13,18,12)),('gap',.19,(13,18,12)),('second_burst',.28,(13,18,12)),('end',1.2,(13,18,12)),('burst_front',.1,(0,20,0)),('burst_side',.1,(20,0,0)),('burst_top',.1,(0,0,20))]:
 pose(t);center=Vector((0,.15,1.7));cam=scene.camera;cam.location=center+Vector(direction);cam.rotation_euler=(center-cam.location).to_track_quat('-Z','Y').to_euler();cam.data.ortho_scale=15 if label=='burst_top' else 13.5
 scene.render.filepath=os.path.join(out,'cas_attack_'+label+'.png');bpy.ops.render.render(write_still=True)
pose(0)
json.dump({'fuel_pods':4,'fuel_pose_samples':121,'glb_fuel_animation_channels':0,'animated_cannon_flashes':2,'proof_times':[0,.1,.19,.28,1.2]},open(os.path.join(out,'cas_attack_verification.json'),'w'),indent=2)
print('CAS_ATTACK_VERIFIED')
