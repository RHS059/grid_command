"""Shared mesh, UV-atlas and indexed-export tools for the FQ-44 asset.
No aircraft body station table or revision-specific assembly is defined here.
"""
import bpy,bmesh,math,os,sys,json,struct,base64,shutil
import numpy as np
from mathutils import Vector,Matrix,Quaternion
HERE=os.path.dirname(os.path.abspath(__file__))
REPO=os.path.abspath(os.path.join(HERE,"../../.."))
sys.path.insert(0,os.path.join(REPO,"tools/blender"))
import vehicle_rigging
OUT=os.path.join(HERE,"fighter_r4")
OBJS=[]
TEXT_CACHE={}
GLYPHS={'Y':['101','101','010','010','010'],'F':['111','100','110','100','100'],'Q':['111','101','101','111','001'],'4':['101','101','111','001','001'],'A':['010','101','111','101','101'],'I':['111','010','010','010','111'],'0':['111','101','101','101','111'],'3':['111','001','111','001','111'],'-':['000','000','111','000','000']}

def mesh(name,verts,faces,role='paint',part='hull',smooth=True):
    data=bpy.data.meshes.new(name);data.from_pydata(verts,[],faces);data.update()
    obj=bpy.data.objects.new(name+'_astra_r_4',data);bpy.context.collection.objects.link(obj)
    obj['part']=part;obj['finish']=role;obj['AAA_base_form']='SWEPT';obj['AAA_production_roles']='SILHOUETTE'
    bm=bmesh.new();bm.from_mesh(data);bmesh.ops.recalc_face_normals(bm,faces=bm.faces);bm.to_mesh(data);bm.free()
    for p in data.polygons:p.use_smooth=smooth
    OBJS.append(obj);return obj

def revolve(name,rings,n=48,role='paint',axis='Y',center=(0,0,0),part='hull',caps=True):
    # Stations contain axis coordinate, width radius, height radius, vertical offset.
    vs=[]
    for a,w,h,z in rings:
        for i in range(n):
            t=math.tau*i/n
            co=(w*math.cos(t),a,z+h*math.sin(t))
            if axis=='X':co=(a,w*math.cos(t),z+h*math.sin(t))
            vs.append(tuple(co[j]+center[j] for j in range(3)))
    fs=[(j*n+i,j*n+(i+1)%n,(j+1)*n+(i+1)%n,(j+1)*n+i) for j in range(len(rings)-1) for i in range(n)]
    if caps:fs += [tuple(reversed(range(n))),tuple(range((len(rings)-1)*n,len(rings)*n))]
    o=mesh(name,vs,fs,role,part)
    # Longitudinal seam and separate planar cap charts.
    for e in o.data.edges:
        a,b=e.vertices
        if (a%n==0 and b%n==0) or (a//n==b//n and a//n in [0,len(rings)-1]):e.use_seam=True
    if caps:
        o.data.polygons[-1].use_smooth=False;o.data.polygons[-2].use_smooth=False
    return o

def rod(name,a,b,r,role='metal',n=16,r2=None,part='hull'):
    a,b=Vector(a),Vector(b);d=(b-a).length
    # Small pins and braces have a low screen size. Use six sides here so the
    # required 30-degree normal splits do not consume the silhouette budget.
    if r<=.04:n=min(n,6)
    o=revolve(name,[(-d/2,r,r,0),(d/2,r if r2 is None else r2,r if r2 is None else r2,0)],n,role,part=part)
    rotation=(b-a).to_track_quat('Y','Z').to_matrix()
    for v in o.data.vertices:v.co=rotation@v.co+(a+b)/2
    return o

def box(name,c,d,role='paint',part='hull',bevel=.015):
    bpy.ops.mesh.primitive_cube_add(size=1,location=c);o=bpy.context.object;o.name=name+'_astra_r_4';o.dimensions=d
    bpy.ops.object.transform_apply(location=True,rotation=False,scale=True)
    if bevel:
        mod=o.modifiers.new('Manufactured edge radius','BEVEL');mod.width=bevel;mod.segments=1
        bpy.ops.object.modifier_apply(modifier=mod.name)
    o['part']=part;o['finish']=role;o['AAA_base_form']='PRISMATIC';OBJS.append(o)
    for e in o.data.edges:e.use_seam=True
    return o

def foil(name,root,tip,root_chord,tip_chord,thickness=.065,n=40,stations=9,vertical=False,part='hull'):
    # Cosine spacing resolves the curved leading edge and thin trailing edge.
    vs=[]
    for j in range(stations):
        s=j/(stations-1);x=root[0]*(1-s)+tip[0]*s;y=root[1]*(1-s)+tip[1]*s;z=root[2]*(1-s)+tip[2]*s
        chord=root_chord*(1-s)+tip_chord*s
        for i in range(n):
            t=math.tau*i/n;u=(1-math.cos(t))/2
            thick=5*thickness*chord*(.2969*math.sqrt(max(u,0))-.126*u-.3516*u*u+.2843*u**3-.1036*u**4)
            thick=math.copysign(max(abs(thick),.0025),math.sin(t) if math.sin(t)!=0 else 1)
            vs.append((x+thick,y-u*chord,z) if vertical else (x,y-u*chord,z+thick))
    fs=[(j*n+i,j*n+(i+1)%n,(j+1)*n+(i+1)%n,(j+1)*n+i) for j in range(stations-1) for i in range(n)]
    fs += [tuple(reversed(range(n))),tuple(range((stations-1)*n,stations*n))]
    o=mesh(name,vs,fs,'paint',part)
    for e in o.data.edges:
        a,b=e.vertices
        if (a%n==n//2 and b%n==n//2) or (a//n==b//n and a//n in [0,stations-1]):e.use_seam=True
    o.data.polygons[-1].use_smooth=False;o.data.polygons[-2].use_smooth=False
    return o

def cut_bay(body,name,center,size):
    """Cut the outer shell. The resulting walls and ceiling are real recesses."""
    bpy.ops.mesh.primitive_cube_add(size=1,location=center)
    tool=bpy.context.object;tool.name=name+'_cutter';tool.dimensions=size
    bpy.ops.object.transform_apply(location=False,rotation=False,scale=True)
    bevel=tool.modifiers.new('Bay corner radius','BEVEL');bevel.width=.035;bevel.segments=1
    bpy.context.view_layer.objects.active=tool;bpy.ops.object.modifier_apply(modifier=bevel.name)
    bpy.context.view_layer.objects.active=body
    mod=body.modifiers.new(name,'BOOLEAN');mod.operation='DIFFERENCE';mod.solver='EXACT';mod.object=tool
    bpy.ops.object.modifier_apply(modifier=mod.name)
    bpy.data.objects.remove(tool,do_unlink=True)

def wing_surface(name,stations,us=(0,.012,.045,.10,.21,.38,.57,.775),part='hull',vertical=False):
    """A manufactured airfoil, with span stations at each change in the outline.
    Stations: span, leading edge, trailing edge, base height, full thickness.
    The upper and lower surfaces share their boundary. No overlapping flap shell.
    """
    vs=[];path=[(u,1) for u in us]+[(u,-1) for u in reversed(us)];n=len(path)
    for span,le,te,height,thick in stations:
        for u,side in path:
            shape=5*(.2969*math.sqrt(max(u,0))-.126*u-.3516*u*u+.2843*u**3-.1036*u**4)
            half=max(.0018,shape*thick)
            camber=.018*(le-te)*math.sin(math.pi*u)
            co=(span,le+(te-le)*u,height+camber+side*half)
            if vertical:co=(camber*.12+side*half,le+(te-le)*u,span)
            vs.append(co)
    fs=[(j*n+i,j*n+(i+1)%n,(j+1)*n+(i+1)%n,(j+1)*n+i) for j in range(len(stations)-1) for i in range(n)]
    fs.extend([tuple(reversed(range(n))),tuple(range((len(stations)-1)*n,len(stations)*n))])
    o=mesh(name,vs,fs,'paint',part)
    for p in o.data.polygons[-2:]:p.use_smooth=False
    for e in o.data.edges:
        a,b=e.vertices
        if a//n==b//n and a//n in [0,len(stations)-1]:e.use_seam=True
        if a%n==b%n and a%n in [len(us)-1,n-1]:e.use_seam=True;e.use_edge_sharp=True
    return o

def interp_station(stations,x):
    out=[x]
    for k in range(1,5):out.append(float(np.interp(x,[s[0] for s in stations],[s[k] for s in stations])))
    return tuple(out)

def cheek_plate(name,points,thickness=.025,part='hull',role='paint'):
    # Thin formed panel with a physical edge. Points wind on its broad face.
    v=[Vector(p) for p in points];normal=(v[1]-v[0]).cross(v[2]-v[0]).normalized()
    vs=[tuple(p-normal*thickness/2) for p in v]+[tuple(p+normal*thickness/2) for p in v];n=len(v)
    fs=[tuple(reversed(range(n))),tuple(range(n,2*n))]+[(i,(i+1)%n,(i+1)%n+n,i+n) for i in range(n)]
    o=mesh(name,vs,fs,role,part,False)
    for e in o.data.edges:e.use_seam=True
    return o

def text_mask(u,v,text):
    path=os.path.join(OUT,'markings',text+'.png')
    if os.path.exists(path):
        if text not in TEXT_CACHE:
            im=bpy.data.images.load(path,check_existing=True);TEXT_CACHE[text]=np.array(im.pixels[:]).reshape((im.size[1],im.size[0],4))[:,:,0]
        mask=TEXT_CACHE[text];h,w=mask.shape;xx=np.clip((u*w).astype(int),0,w-1);yy=np.clip((v*h).astype(int),0,h-1)
        return (mask[yy,xx]>.4)&(u>=0)&(u<1)&(v>=0)&(v<1)
    col=np.floor(u*len(text)*4).astype(int);row=np.floor((1-v)*5).astype(int)
    mask=np.zeros(u.shape,dtype=bool)
    for j,char in enumerate(text):
        for yy,line in enumerate(GLYPHS.get(char,GLYPHS['-'])):
            for xx,val in enumerate(line):
                if val=='1':mask|=(col==j*4+xx)&(row==yy)
    return mask&(u>=0)&(u<1)&(v>=0)&(v<1)

def polygon_mask(u,v,points):
    inside=np.zeros(u.shape,dtype=bool)
    for i,(a,b) in enumerate(points):
        c,d=points[(i+1)%len(points)]
        inside^=((b>v)!=(d>v))&(u<(c-a)*(v-b)/(d-b+1e-20)+a)
    return inside

def atlas():
    # Area-bearing unwrap. Unique charts are packed together with 6 px clearance.
    bpy.ops.object.select_all(action='DESELECT')
    for o in OBJS:o.select_set(True)
    bpy.context.view_layer.objects.active=OBJS[0]
    bpy.ops.object.mode_set(mode='EDIT');bpy.ops.mesh.select_all(action='SELECT')
    bpy.ops.uv.unwrap(method='ANGLE_BASED',margin=.003)
    bpy.ops.uv.select_all(action='SELECT')
    bpy.ops.uv.average_islands_scale();bpy.ops.uv.pack_islands(rotate=True,margin=.006)
    bpy.ops.object.mode_set(mode='OBJECT')
    pixels=np.zeros((1024,1024,4),dtype=np.float32);pixels[:,:,:3]=.4;pixels[:,:,3]=1
    coverage=np.zeros((1024,1024),dtype=bool);zero_uv=0;areas=[]
    for o in OBJS:
        o.data.calc_loop_triangles();uv=o.data.uv_layers.active.data
        for t in o.data.loop_triangles:
            points=np.array([tuple(o.data.vertices[v].co) for v in t.vertices]);tex=np.array([tuple(uv[i].uv) for i in t.loops])*1024
            lo=np.maximum(np.floor(tex.min(axis=0)).astype(int),0);hi=np.minimum(np.ceil(tex.max(axis=0)).astype(int),1023)
            area=np.cross(tex[1]-tex[0],tex[2]-tex[0]);areas.append(abs(float(area))/2/1024**2)
            if abs(area)<1e-8:zero_uv+=1;continue
            xx,yy=np.meshgrid(np.arange(lo[0],hi[0]+1)+.5,np.arange(lo[1],hi[1]+1)+.5)
            dx,dy=xx-tex[0,0],yy-tex[0,1]
            b=((tex[2,1]-tex[0,1])*dx-(tex[2,0]-tex[0,0])*dy)/area
            c=(-(tex[1,1]-tex[0,1])*dx+(tex[1,0]-tex[0,0])*dy)/area;a=1-b-c
            inside=(a>=-1e-5)&(b>=-1e-5)&(c>=-1e-5)
            p=a[...,None]*points[0]+b[...,None]*points[1]+c[...,None]*points[2]
            block=pixels[lo[1]:hi[1]+1,lo[0]:hi[0]+1,:3];block[inside]=color_at(p,o['finish'],o.name)[inside]
            coverage[lo[1]:hi[1]+1,lo[0]:hi[0]+1]|=inside
    occupied=float(coverage.mean());valid=coverage.copy()
    for _ in range(6):
        for axis,shift in [(0,1),(0,-1),(1,1),(1,-1)]:
            mask=np.roll(valid,shift,axis)&~valid;pixels[mask]=np.roll(pixels,shift,axis)[mask];valid|=mask
    im=bpy.data.images.new('FQ44_1024_BaseColor',width=1024,height=1024,alpha=False)
    im.pixels.foreach_set(pixels.ravel());im.filepath_raw=os.path.join(OUT,'fighter_albedo.png');im.file_format='PNG';im.save();im.pack()
    material=bpy.data.materials.new('FQ44_Single_Atlas');material.use_nodes=True
    bs=material.node_tree.nodes.get('Principled BSDF');bs.inputs['Roughness'].default_value=.72;bs.inputs['Metallic'].default_value=.12
    image=material.node_tree.nodes.new('ShaderNodeTexImage');image.image=im;image.interpolation='Linear';image.extension='EXTEND'
    material.node_tree.links.new(image.outputs['Color'],bs.inputs['Base Color'])
    for o in OBJS:o.data.materials.clear();o.data.materials.append(material)
    # Keep the asset staged until its reference and export checks pass.
    return {'uv_zero_area_triangles':zero_uv,'uv_occupied_fraction':occupied,'uv_triangle_area_sum':sum(areas),'texture_dimensions':[1024,1024],'texture_count':1,'material_count':1}

def native_and_report(rig,qa):
    raw=open(os.path.join(OUT,'fighter.glb'),'rb').read();size=struct.unpack_from('<I',raw,12)[0];doc=json.loads(raw[20:20+size]);blob=raw[28+size:]
    def accessor(index):
        a=doc['accessors'][index];v=doc['bufferViews'][a['bufferView']];dtype={5126:'<f4',5125:'<u4',5123:'<u2',5121:'u1'}[a['componentType']];n={'VEC3':3,'VEC2':2,'SCALAR':1,'VEC4':4}[a['type']]
        return np.frombuffer(blob,dtype=dtype,count=a['count']*n,offset=v.get('byteOffset',0)+a.get('byteOffset',0)).reshape((-1,n))
    result={};verts=tris=0;ledger=[]
    def walk(i,parent,part='hull'):
        nonlocal verts,tris
        node=doc['nodes'][i];name=node.get('name','')
        if name.startswith('Assembly_'):part=name[9:]
        mat=Matrix.LocRotScale(Vector(node.get('translation',[0,0,0])),Quaternion((node.get('rotation',[0,0,0,1])[3],*node.get('rotation',[0,0,0,1])[:3])),Vector(node.get('scale',[1,1,1])))
        world=parent@mat
        if 'mesh' in node:
            for primitive in doc['meshes'][node['mesh']]['primitives']:
                attr=primitive['attributes'];pos=accessor(attr['POSITION']);norm=accessor(attr['NORMAL']);uv=accessor(attr['TEXCOORD_0']);idx=accessor(primitive['indices']).ravel()
                group=result.setdefault(part,{'p':[],'uv':[],'normals':[],'indices':[]});offset=len(group['p'])//3
                for p,n in zip(pos,norm):group['p'].extend(world@Vector(p));group['normals'].extend(world.to_3x3()@Vector(n))
                # glTF V is flipped relative to Blender. Babylon texture invertY=false uses this convention.
                group['uv'].extend(uv.ravel().tolist());group['indices'].extend((idx+offset).tolist());verts+=len(pos);tris+=len(idx)//3
                ledger.append({'name':name,'part':part,'exported_vertices':len(pos),'triangles':len(idx)//3,'source_vertices':len(bpy.data.objects[name].data.vertices) if name in bpy.data.objects else None})
        for child in node.get('children',[]):walk(child,world,part)
    for i in doc['scenes'][doc.get('scene',0)]['nodes']:walk(i,Matrix.Identity(4))
    for part,g in result.items():
        p=g.pop('p');scale=max(max(abs(v) for v in p)/16380,1e-6);q=[max(-16384,min(16383,round(v/scale))) for v in p]
        packed=bytearray();buffer=bits=0
        for v in q:
            buffer|=(v&0x7fff)<<bits;bits+=15
            while bits>=8:packed.append(buffer&255);buffer>>=8;bits-=8
        if bits:packed.append(buffer&255)
        g.update(q=base64.b64encode(packed).decode(),n=len(q),s=scale,i=base64.b64encode(bytes((len(p)//3+1)//2)).decode(),palette=[[1,1,1]],texture='/models/fighter_albedo.png')
        g['uv']=[round(v,6) for v in g['uv']];g['normals']=[round(v,6) for v in g['normals']]
    with open(os.path.join(OUT,'fighter.json'),'w') as f:json.dump(result,f,separators=(',',':'))
    qa.update(export_stored_vertices=verts,runtime_indexed_vertices=verts,triangles=tris,blender_mesh_vertices=sum(len(o.data.vertices) for o in OBJS),mesh_objects=len(OBJS),gltf_material_count=len(doc.get('materials',[])),gltf_image_count=len(doc.get('images',[])),gltf_texture_count=len(doc.get('textures',[])),animations=[a['name'] for a in doc.get('animations',[])],axis='+Y forward, +Z up',reference_inference='Dimensions and hidden structure are inferred from five perspective photographs.',source='build_fq44_r3.py',budget_pass=7500<=verts<=10000,representation='Separate manufactured closed shells. Gear bays are cut into the body. One base-color image; scalar roughness and metalness. The nozzle and sensor window are open surfaces.',parts=list(result),vertex_budget=ledger)
    with open(os.path.join(OUT,'fighter_vertex_budget.json'),'w') as f:json.dump(ledger,f,indent=2)
    return qa
