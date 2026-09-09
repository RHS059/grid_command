import bpy,os,json
OUT=os.path.abspath(os.path.join(os.path.dirname(__file__),'../../../../outputs/astra_2'))
bpy.ops.wm.open_mainfile(filepath=os.path.join(OUT,'soldier_scratch_equipped.blend'))
report={}
for label,prefix in [('body','Scratch_Continuous_Body'),('gloves','Equipment_gloves'),('boots','Equipment_boot'),('knee_shields','Equipment_knee_shield'),('shoulder_plates','Equipment_shoulder_plate'),('ankle_cuffs','Equipment_ankle_cuff')]:
 objects=[o for o in bpy.context.scene.objects if o.type=='MESH' and o.name.startswith(prefix)]
 points=set();faces=set()
 for o in objects:
  coords=[tuple(round(v,6) for v in o.matrix_world@vert.co) for vert in o.data.vertices];points.update(coords)
  faces.update(frozenset(coords[i] for i in p.vertices) for p in o.data.polygons)
 mirror=lambda p:(round(-p[0],6),p[1],p[2])
 unpaired_points=[p for p in points if mirror(p) not in points];unpaired_faces=[f for f in faces if frozenset(mirror(p) for p in f) not in faces]
 report[label]={'objects':len(objects),'unpaired_vertices':len(unpaired_points),'unpaired_faces':len(unpaired_faces),'pass':not unpaired_points and not unpaired_faces}
with open(os.path.join(OUT,'soldier_scratch_equipment_mirror_verification.json'),'w') as f:json.dump(report,f,indent=2)
print(report)
assert all(r['pass'] for r in report.values()),report
