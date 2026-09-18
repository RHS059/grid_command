import bpy,math,json,os,sys
def cross(a,b,c):return (b[0]-a[0])*(c[1]-a[1])-(b[1]-a[1])*(c[0]-a[0])
def clip(poly,a,b):
    out=[]
    for i,p in enumerate(poly):
        q=poly[(i+1)%len(poly)];cp=cross(a,b,p);cq=cross(a,b,q)
        if cp>=0:out.append(p)
        if (cp>0)!=(cq>0):
            t=cp/(cp-cq);out.append((p[0]+t*(q[0]-p[0]),p[1]+t*(q[1]-p[1])))
    return out
tri=[];bins={};bad=[]
for o in bpy.context.scene.objects:
    if o.type!='MESH' or not o.data.uv_layers.active:continue
    o.data.calc_loop_triangles();uv=o.data.uv_layers.active.data
    for t in o.data.loop_triangles:
        pts=[tuple(uv[i].uv) for i in t.loops]
        if cross(*pts)<0:pts.reverse()
        j=len(tri);tri.append((o.name,pts,t.index,t.polygon_index))
        lo=[max(0,int(min(p[a] for p in pts)*40)) for a in [0,1]];hi=[min(39,int(max(p[a] for p in pts)*40)) for a in [0,1]]
        for x in range(lo[0],hi[0]+1):
            for y in range(lo[1],hi[1]+1):bins.setdefault((x,y),[]).append(j)
seen=set()
for ids in bins.values():
    for j,a in enumerate(ids):
        for b in ids[j+1:]:
            key=(min(a,b),max(a,b))
            if key in seen:continue
            seen.add(key);pa=tri[a][1];pb=tri[b][1]
            if any(max(p[d] for p in pa)<=min(p[d] for p in pb) or max(p[d] for p in pb)<=min(p[d] for p in pa) for d in [0,1]):continue
            poly=pa
            for k in range(3):
                poly=clip(poly,pb[k],pb[(k+1)%3])
                if len(poly)<3:break
            area=abs(sum(poly[k][0]*poly[(k+1)%len(poly)][1]-poly[(k+1)%len(poly)][0]*poly[k][1] for k in range(len(poly))))/2 if len(poly)>=3 else 0
            if area>1e-10:bad.append({'objects':[tri[a][0],tri[b][0]],'triangles':[tri[a][2],tri[b][2]],'polygons':[tri[a][3],tri[b][3]],'area':area})
result={'uv_triangles':len(tri),'tested_pairs':len(seen),'overlap_pairs':len(bad),'overlap_area':sum(x['area'] for x in bad),'examples':bad[:30]}
print('UV_AUDIT',json.dumps(result))
if '--report-path' in sys.argv:
    report_path=sys.argv[sys.argv.index('--report-path')+1]
    with open(report_path,'w') as handle:json.dump(result,handle,indent=2)
