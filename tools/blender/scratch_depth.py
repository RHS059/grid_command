"""Authorized side-depth correction, preserving accepted x/z and exact symmetry."""
import bpy,os,json
OUT=os.path.abspath(os.path.join(os.path.dirname(__file__),'../../../../outputs/astra_2'))
bpy.ops.wm.open_mainfile(filepath=os.path.join(OUT,'soldier_scratch_body.blend'))
body=bpy.data.objects['Scratch_Continuous_Body']
assert not bpy.context.scene.get('depth_revision'),'Depth correction already applied'
before=[tuple(v.co) for v in body.data.vertices]
def interp(z,points):
 for (a,b),(c,d) in zip(points,points[1:]):
  if a<=z<=c:return b+(d-b)*(z-a)/(c-a)
 return points[0][1] if z<points[0][0] else points[-1][1]
for v in body.data.vertices:
 x,y,z=v.co
 if abs(x)>.24 and z>1.24:
  scale=interp(abs(x),[(.24,1.18),(.34,1.34),(.50,1.24),(.64,1.38),(.77,1.25),(1,1.25)])
 else:scale=interp(z,[(0,1.15),(.17,1.20),(.30,1.28),(.40,1.30),(.52,1.14),(.72,1.27),(.88,1.28),(1.02,1.16),(1.20,1.22),(1.35,1.25),(1.44,1.12),(1.50,1.05),(1.80,1.16)])
 v.co.y=y*scale
body.data.update()
coords={tuple(round(n,6) for n in v.co) for v in body.data.vertices}
unpaired=[p for p in coords if (-p[0],p[1],p[2]) not in coords]
assert not unpaired
assert all(v.co.x==p[0] and v.co.z==p[2] for v,p in zip(body.data.vertices,before))
bpy.context.scene['depth_revision']=1
bpy.ops.wm.save_as_mainfile(filepath=os.path.join(OUT,'soldier_scratch_body.blend'))
with open(os.path.join(OUT,'soldier_scratch_depth_verification.json'),'w') as f:json.dump({'front_xz_unchanged':True,'topology_unchanged':True,'mirror_unpaired_vertices':0,'depth_scale_range':[1.05,1.38],'rigged':False},f,indent=2)
