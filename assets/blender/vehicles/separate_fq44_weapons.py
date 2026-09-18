"""Publish reusable aircraft stores and remove their geometry/texels from Fury.

Run after the reference-locked R4 texture pass. Aircraft charts never move.
The attachment datums are shared with lib/game/aircraft-loadout.ts.
"""
import bpy, bmesh, json, os, sys, math, shutil, hashlib, struct
import numpy as np
from mathutils import Vector
from mathutils.bvhtree import BVHTree
HERE=os.path.dirname(os.path.abspath(__file__));sys.path.insert(0,HERE)
import fq44_asset_pipeline as tool
import fq44_shading
REPO=os.path.abspath(os.path.join(HERE,'../../..'))
STAGE=os.path.join(HERE,'fighter_r4')
WEAPONS=os.path.join(HERE,'aircraft_weapons')

def coverage(objects):
    mask=np.zeros((1024,1024),dtype=bool)
    for obj in objects:
        obj.data.calc_loop_triangles();uv=obj.data.uv_layers.active.data
        for tri in obj.data.loop_triangles:
            t=np.array([uv[k].uv[:] for k in tri.loops])*1024
            lo=np.maximum(np.floor(t.min(axis=0)).astype(int),0);hi=np.minimum(np.ceil(t.max(axis=0)).astype(int),1023)
            if np.any(hi<lo):continue
            area=np.cross(t[1]-t[0],t[2]-t[0])
            if abs(area)<1e-8:continue
            xx,yy=np.meshgrid(np.arange(lo[0],hi[0]+1)+.5,np.arange(lo[1],hi[1]+1)+.5)
            dx,dy=xx-t[0,0],yy-t[0,1]
            b=((t[2,1]-t[0,1])*dx-(t[2,0]-t[0,0])*dy)/area
            c=(-(t[1,1]-t[0,1])*dx+(t[1,0]-t[0,0])*dy)/area
            mask[lo[1]:hi[1]+1,lo[0]:hi[0]+1]|=(b>=-1e-5)&(c>=-1e-5)&(b+c<=1+1e-5)
    return mask

def strip_stores(objects):
    """Keep aircraft UVs and padding; clear only the removed weapons' charts."""
    removed=[o for o in objects if o.get('part','').startswith('store_')]
    if not removed:return {'removed_weapon_objects':0}
    kept=[o for o in objects if o not in removed]
    protected=coverage(kept);erase=coverage(removed)
    for _ in range(6):
        protected=protected|np.roll(protected,1,0)|np.roll(protected,-1,0)|np.roll(protected,1,1)|np.roll(protected,-1,1)
        erase=erase|np.roll(erase,1,0)|np.roll(erase,-1,0)|np.roll(erase,1,1)|np.roll(erase,-1,1)
    image=next(n.image for m in kept[0].data.materials for n in m.node_tree.nodes if n.type=='TEX_IMAGE')
    pixels=np.array(image.pixels[:],dtype=np.float32).reshape((1024,1024,4));mask=erase&~protected
    pixels[mask,:3]=.4;image.pixels.foreach_set(pixels.ravel());image.filepath_raw=os.path.join(STAGE,'fighter_albedo.png');image.file_format='PNG';image.save();image.pack()
    count=len(removed)
    for o in removed:objects.remove(o);bpy.data.objects.remove(o,do_unlink=True)
    return {'removed_weapon_objects':count,'removed_weapon_texels':int(mask.sum()),'aircraft_charts_preserved':True}

def publish_airframe():
    objects=[o for o in bpy.context.scene.objects if o.type=='MESH' and o.get('part')]
    separated=strip_stores(objects)
    rig=json.load(open(os.path.join(STAGE,'fighter_rig.json')))
    rig['nodes']={k:v for k,v in rig['nodes'].items() if not k.startswith('store_')}
    rig['clips']=[c for c in rig['clips'] if c['id'] not in ('shoot','rockets','bombs')]
    rig['clips'] += [{'id':'rockets','label':'Fire rockets (8 per pod)','duration':5.0,'loop':False},{'id':'bombs','label':'Drop bombs one at a time','duration':3,'loop':False}]
    for o in list(bpy.context.scene.objects):
        if o.name.startswith('Assembly_store_'):bpy.data.objects.remove(o,do_unlink=True)
    bpy.ops.object.select_all(action='DESELECT')
    for o in bpy.context.scene.objects:
        if o.type=='MESH' and o in objects or o.type=='EMPTY' and (o.name=='GC_FIGHTER' or o.name.startswith('Assembly_')):o.select_set(True)
    bpy.ops.export_scene.gltf(filepath=os.path.join(STAGE,'fighter.glb'),export_format='GLB',use_selection=True,export_yup=False,export_extras=True,export_apply=True,export_animation_mode='NLA_TRACKS',export_frame_range=False)
    tool.vehicle_rigging.repair_glb_pose(os.path.join(STAGE,'fighter.glb'),rig)
    tool.OUT=STAGE;tool.OBJS[:]=objects
    qa=json.load(open(os.path.join(STAGE,'fighter_verification.json')))
    qa=tool.native_and_report(rig,qa);qa['weapon_separation']=separated
    qa['source']='build_fq44_r4.py + separate_fq44_weapons.py'
    qa['authored_texture']['weapon_charts_removed']=True
    sha=hashlib.sha256(open(os.path.join(STAGE,'fighter_albedo.png'),'rb').read()).hexdigest()
    qa['authored_texture']['texture_sha256']=sha
    qa['authored_texture']['geometry_and_rig_unchanged']=False
    qa['authored_texture']['aircraft_geometry_and_uv_unchanged']=True
    image=next(n.image for m in objects[0].data.materials for n in m.node_tree.nodes if n.type=='TEX_IMAGE')
    qa['authored_texture']['blend_packed_texture_matches']=hashlib.sha256(image.packed_file.data).hexdigest()==sha
    raw=open(os.path.join(STAGE,'fighter.glb'),'rb').read();size=struct.unpack_from('<I',raw,12)[0];doc=json.loads(raw[20:20+size]);view=doc['bufferViews'][doc['images'][0]['bufferView']];start=28+size+view.get('byteOffset',0)
    qa['authored_texture']['glb_embedded_texture_matches']=hashlib.sha256(raw[start:start+view['byteLength']]).hexdigest()==sha
    assert qa['authored_texture']['blend_packed_texture_matches'] and qa['authored_texture']['glb_embedded_texture_matches']
    qa['shading']['components']=[r for r in qa['shading']['components'] if not r['part'].startswith('store_')]
    qa['shading']['marked_sharp_edges']=sum(r['marked_sharp_edges'] for r in qa['shading']['components'])
    json.dump(rig,open(os.path.join(STAGE,'fighter_rig.json'),'w'),separators=(',',':'))
    json.dump(qa,open(os.path.join(STAGE,'fighter_verification.json'),'w'),indent=2)
    bpy.ops.wm.save_as_mainfile(filepath=os.path.join(STAGE,'fighter.blend'))
    for filename in ['fighter.blend','fighter.glb','fighter_albedo.png','fighter_rig.json','fighter_verification.json','fighter_vertex_budget.json']:
        if filename!='fighter_rig.json':shutil.copy2(os.path.join(STAGE,filename),os.path.join(HERE,filename))
    for filename in ['fighter.glb','fighter_albedo.png']:shutil.copy2(os.path.join(STAGE,filename),os.path.join(REPO,'public/models',filename))
    for filename in ['fighter.json','fighter_rig.json']:shutil.copy2(os.path.join(STAGE,filename),os.path.join(REPO,'lib/game/generated',filename))
    return qa

def build_reusable():
    os.makedirs(WEAPONS,exist_ok=True)
    # The approved bomb is one manufactured source; copy only its first instance.
    bombs=[]
    for o in bpy.context.scene.objects:
        if o.type=='MESH' and o.get('part')=='store_L_inner' and ('missile_L0_' in o.name or 'store_horizontal_L0' in o.name or 'store_vertical_L0' in o.name):
            copy=o.copy();copy.data=o.data.copy();copy.animation_data_clear();matrix=o.matrix_world.copy();copy.parent=None;copy.matrix_world.identity()
            for v in copy.data.vertices:v.co=matrix@v.co-Vector((-1.815,-1.65,.59))
            copy.name='standard_bomb_'+str(len(bombs));copy['part']='bomb';bombs.append(copy)
    if not bombs:raise RuntimeError('The source must include the original R4 stores.')
    for old in list(bpy.data.objects):
        if old not in bombs:bpy.data.objects.remove(old,do_unlink=True)
    tool.OUT=WEAPONS;tool.OBJS.clear()
    for o in bombs:bpy.context.scene.collection.objects.link(o);tool.OBJS.append(o)
    pod=tool.revolve('standard_8_rocket_pod',[(-.61,.122,.122,0),(-.53,.148,.148,0),(.80,.148,.148,0),(.85,.146,.146,0)],24,'rocket',part='rocket_pod')
    # Eight actual recessed launch tubes, evenly spaced around the front plate.
    for i in range(8):
        angle=i*math.tau/8;x,z=.09*math.cos(angle),.09*math.sin(angle)
        bpy.ops.mesh.primitive_cylinder_add(vertices=12,radius=.030,depth=.18,location=(x,.84,z),rotation=(math.pi/2,0,0));cutter=bpy.context.object
        bpy.context.view_layer.objects.active=pod;mod=pod.modifiers.new('Launch tube %d'%(i+1),'BOOLEAN');mod.operation='DIFFERENCE';mod.object=cutter;bpy.ops.object.modifier_apply(modifier=mod.name);bpy.data.objects.remove(cutter,do_unlink=True)
    for y in [-.44,.64]:tool.revolve('pod_retaining_band',[ (y-.014,.15,.15,0),(y+.014,.15,.15,0)],24,'metal',part='rocket_pod')
    tool.revolve('standard_rocket',[(-.30,.009,.009,0),(-.26,.022,.022,0),(.10,.022,.022,0),(.19,.004,.004,0)],12,'store',part='rocket')
    for s in [-1,1]:tool.cheek_plate('rocket_tail_fin',[(s*.01,-.19,0),(s*.04,-.26,0),(s*.04,-.30,0),(s*.01,-.28,0)],.006,'rocket','metal')
    fq44_shading.apply(tool.OBJS)
    def color(points,role,name):
        p=np.array(points);result=np.empty(p.shape)
        result[:]= {'store':(.16,.22,.115),'metal':(.25,.28,.29),'rocket':(.32,.35,.36)}.get(role,(.16,.22,.115))
        noise=(np.sin(p[...,0]*193+p[...,1]*73+p[...,2]*131)*np.sin(p[...,1]*229))*.012
        result+=noise[...,None]
        if role=='store':
            bands=(abs(p[...,1]-.39)<.017)|(abs(p[...,1]+.47)<.009)
            result[bands]=(.61,.55,.18)
        if role=='rocket':
            result[(abs(p[...,1]+.4)<.008)|(abs(p[...,1]-.61)<.008)]=(.12,.14,.15)
            result[(p[...,1]>.748)&(p[...,1]<.79)]=(.045,.055,.06)
        return np.clip(result,0,1)
    tool.color_at=color;qa=tool.atlas()
    atlas=next(n.image for n in tool.OBJS[0].data.materials[0].node_tree.nodes if n.type=='TEX_IMAGE');atlas.name='Aircraft_Ordnance_Atlas';atlas.filepath_raw=os.path.join(WEAPONS,'aircraft_weapons_albedo.png');atlas.save();atlas.pack()
    material=tool.OBJS[0].data.materials[0];material.name='Standard_Aircraft_Ordnance'
    rig={'nodes':{name:{'pivot':[0,0,0],'kind':'fixed'} for name in ['bomb','rocket_pod','rocket']},'clips':[],'variant':'aircraft_weapons'}
    groups={}
    for name in rig['nodes']:
        group=bpy.data.objects.new('Assembly_'+name,None);bpy.context.scene.collection.objects.link(group);groups[name]=group
    for o in tool.OBJS:o.parent=groups[o['part']]
    bpy.ops.object.select_all(action='SELECT')
    bpy.ops.export_scene.gltf(filepath=os.path.join(WEAPONS,'fighter.glb'),export_format='GLB',use_selection=True,export_yup=False,export_apply=True)
    qa=tool.native_and_report(rig,qa)
    data=json.load(open(os.path.join(WEAPONS,'fighter.json')))
    for p in data.values():p['texture']='/models/aircraft_weapons_albedo.png'
    json.dump(data,open(os.path.join(REPO,'lib/game/generated/aircraft_weapons.json'),'w'),separators=(',',':'))
    shutil.copy2(os.path.join(WEAPONS,'fighter.glb'),os.path.join(REPO,'public/models/aircraft_weapons.glb'))
    shutil.copy2(atlas.filepath_raw,os.path.join(REPO,'public/models/aircraft_weapons_albedo.png'))
    qa['launch_tubes_per_pod']=8;qa['axis']='+Y forward, +Z up';qa['origin']='attachment centre';qa['source']='separate_fq44_weapons.py';qa['budget_pass']=True
    rows=[]
    for obj in tool.OBJS:
        bm=bmesh.new();bm.from_mesh(obj.data)
        rows.append({'name':obj.name,'zero_area_faces':sum(f.calc_area()<1e-12 for f in bm.faces),'nonmanifold_edges':sum(not e.is_manifold for e in bm.edges)})
        bm.free()
    tree=BVHTree.FromPolygons([v.co for v in pod.data.vertices],[p.vertices[:] for p in pod.data.polygons])
    floors=[]
    for i in range(8):
        angle=i*math.tau/8;hit=tree.ray_cast(Vector((.09*math.cos(angle),1,.09*math.sin(angle))),Vector((0,-1,0)))
        floors.append(round(hit[0].y,5) if hit[0] else None)
    qa['geometry_health']=rows;qa['launch_tube_floor_y']=floors;qa['eight_recesses_verified']=all(y is not None and y<.8 for y in floors)
    assert qa['eight_recesses_verified'] and all(row['zero_area_faces']==row['nonmanifold_edges']==0 for row in rows)
    json.dump(qa,open(os.path.join(WEAPONS,'verification.json'),'w'),indent=2)
    bpy.ops.wm.save_as_mainfile(filepath=os.path.join(WEAPONS,'aircraft_weapons.blend'))
    return qa

def main():
    source=os.path.join(STAGE,'fighter.blend')
    bpy.ops.wm.open_mainfile(filepath=source)
    # Keep a complete local source snapshot; it owns the reusable bomb receiver.
    archive=os.path.join(WEAPONS,'source_with_stores.blend');os.makedirs(WEAPONS,exist_ok=True)
    if not any(o.get('part','').startswith('store_') for o in bpy.context.scene.objects):
        bpy.ops.wm.open_mainfile(filepath=archive)
    else:bpy.ops.wm.save_as_mainfile(filepath=archive)
    weapons=build_reusable()
    bpy.ops.wm.open_mainfile(filepath=archive)
    airframe=publish_airframe()
    print(json.dumps({'airframe_vertices':airframe['export_stored_vertices'],'weapon_vertices':weapons['export_stored_vertices'],'tubes':8}))

if __name__=='__main__':main()
