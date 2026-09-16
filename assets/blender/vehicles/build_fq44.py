"""Build the FQ-44 Fury from the supplied five photographs. Blender 4.5.

Run: blender --background --python assets/blender/vehicles/build_fq44.py
All dimensions are inferred from photographs. +Y is forward. +Z is up.
"""
import bpy, bmesh, math, os, sys, json, struct, base64, shutil
import numpy as np
from mathutils import Vector, Matrix, Quaternion
HERE=os.path.dirname(os.path.abspath(__file__))
REPO=os.path.abspath(os.path.join(HERE,'../../..'))
sys.path.insert(0,os.path.join(REPO,'tools/blender'))
import vehicle_rigging
OUT=os.path.join(HERE,'fighter_r2')
os.makedirs(OUT,exist_ok=True)
OBJS=[]

def mesh(name,verts,faces,role='paint',part='hull',smooth=True):
    data=bpy.data.meshes.new(name);data.from_pydata(verts,[],faces);data.update()
    obj=bpy.data.objects.new(name+'_astra_r_2',data);bpy.context.collection.objects.link(obj)
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
    o=revolve(name,[(-d/2,r,r,0),(d/2,r if r2 is None else r2,r if r2 is None else r2,0)],n,role,part=part)
    rotation=(b-a).to_track_quat('Y','Z').to_matrix()
    for v in o.data.vertices:v.co=rotation@v.co+(a+b)/2
    return o

def box(name,c,d,role='paint',part='hull',bevel=.015):
    bpy.ops.mesh.primitive_cube_add(size=1,location=c);o=bpy.context.object;o.name=name+'_astra_r_1';o.dimensions=d
    bpy.ops.object.transform_apply(location=True,rotation=False,scale=True)
    if bevel:
        mod=o.modifiers.new('Manufactured edge radius','BEVEL');mod.width=bevel;mod.segments=2
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

def build():
    # A new scene protects any scene supplied to a running Blender session.
    scene=bpy.data.scenes.new('FQ44_Fury_astra_r_2');bpy.context.window.scene=scene
    # Smooth elliptical body stations retain the long wedge radome and full aft body.
    anchors=[(-5.45,.57,.54,1.88),(-4.95,.78,.65,1.91),(-3.8,1.10,.73,1.94),(-2,1.275,.76,1.95),(0,1.26,.74,1.95),(1.4,1.11,.66,1.93),(2.4,.90,.54,1.91),(3.35,.66,.42,1.87),(4.25,.36,.25,1.78),(5.55,.012,.015,1.65)]
    rings=[]
    # Cubic Hermite profiles add useful curvature between the silhouette landmarks.
    for j in range(len(anchors)-1):
        p0=np.array(anchors[max(0,j-1)]);p1=np.array(anchors[j]);p2=np.array(anchors[j+1]);p3=np.array(anchors[min(len(anchors)-1,j+2)])
        for k in range(3):
            t=k/3;v=.5*((2*p1)+(-p0+p2)*t+(2*p0-5*p1+4*p2-p3)*t*t+(-p0+3*p1-3*p2+p3)*t**3)
            rings.append(tuple(v))
    rings.append(anchors[-1])
    # A narrow curved roof joins broad shoulder planes and an angular lower chine.
    # The aft stations blend to the circular nozzle; the nose stays a diamond wedge.
    profile=[(0,1),(.20,.985),(.39,.935),(.55,.85),(.69,.72),(.81,.52),(.90,.28),(1,-.24),(.84,-.68),(.62,-.88),(.32,-.94),(0,-.94),(-.32,-.94),(-.62,-.88),(-.84,-.68),(-1,-.24),(-.90,.28),(-.81,.52),(-.69,.72),(-.55,.85),(-.39,.935),(-.20,.985)]
    vs=[];N=len(profile)
    for y,w,h,z in rings:
        roundness=max(0,min(1,(-y-3.8)/1.65))
        for i,(x,zz) in enumerate(profile):
            t=math.pi/2-i*math.tau/N
            px=x*(1-roundness)+math.cos(t)*roundness;pz=zz*(1-roundness)+math.sin(t)*roundness
            crown=.30*max(0,pz)*min(1,max(0,(y+5.4)/1.5))*min(1,max(0,(5.55-y)/2.8))
            vs.append((px*w,y,z+pz*h+crown))
    fs=[(j*N+i,j*N+(i+1)%N,(j+1)*N+(i+1)%N,(j+1)*N+i) for j in range(len(rings)-1) for i in range(N)]
    fs += [tuple(reversed(range(N))),tuple(range((len(rings)-1)*N,len(rings)*N))]
    body=mesh('fury_chined_fuselage',vs,fs)
    for edge in body.data.edges:
        a,b=edge.vertices
        if (a%N==11 and b%N==11) or (a//N==b//N and a//N in [0,len(rings)-1]):edge.use_seam=True
        if a%N==b%N and a%N in [6,7,9,13,15,16]:edge.use_edge_sharp=True
    body.data.polygons[-1].use_smooth=False;body.data.polygons[-2].use_smooth=False
    rod('nose_probe',(0,5.54,1.65),(0,6.10,1.65),.018,'metal',12,.008)
    rod('probe_tip',(0,6.10,1.65),(0,6.27,1.65),.007,'metal',8,.003)
    rod('probe_vane',(0,5.97,1.65),(0,5.97,1.73),.009,'metal',8)
    # Sensor fairing is low, unmanned, and has no canopy.
    revolve('dorsal_sensor_fairing',[(2.45,.20,.07,2.71),(2.65,.22,.14,2.68),(2.85,.15,.15,2.62),(3.02,.09,.04,2.54)],24)
    mesh('sensor_dark_window',[(-.078,2.837,2.76),(.078,2.837,2.76),(.055,2.975,2.63),(-.055,2.975,2.63)],[(0,1,2,3)],'sensor',smooth=False)
    # Reference wings have a broad trapezoid planform, not a cranked delta.
    for s in [-1,1]:
        label='L' if s<0 else 'R'
        foil('main_wing_'+label,(s*.97,.55,1.87),(s*4.40,-1.23,1.82),3.18,1.02,.055,32,8)
        foil('elevator_'+label,(s*.44,-4.02,1.87),(s*1.84,-4.95,1.87),1.46,.52,.06,24,6,part='control_'+label)
        # Separate aileron plates overlap the trailing edge by only a hinge width.
        foil('aileron_'+label,(s*2.65,-2.11,1.81),(s*4.27,-2.11,1.80),.37,.17,.065,20,4,part='control_'+label)
        rod('wingtip_navigation_'+label,(s*4.35,-1.73,1.88),(s*4.35,-1.80,1.88),.035,'red' if s<0 else 'green',12)
    tail=foil('single_vertical_tail',(0,-3.56,2.83),(0,-4.73,4.10),1.87,.65,.055,32,8,True)
    crown_y=[a[0] for a in rings]
    crown_z=[a[3]+a[2]+.30*min(1,max(0,(a[0]+5.4)/1.5))*min(1,max(0,(5.55-a[0])/2.8)) for a in rings]
    for v in list(tail.data.vertices)[:32]:v.co.z=min(v.co.z,float(np.interp(v.co.y,crown_y,crown_z))-.025)
    # Single deep nozzle: an open ring with an inner wall and a recessed dark core.
    revolve('single_exhaust_nozzle',[(-5.27,.59,.55,1.88),(-5.48,.58,.54,1.88),(-5.66,.54,.50,1.88),(-5.68,.48,.44,1.88),(-5.35,.42,.39,1.88)],48,'nozzle',caps=False)
    revolve('exhaust_recess',[(-5.34,.419,.389,1.88),(-5.03,.33,.31,1.88)],48,'dark')
    for i in range(20):
        t=i*math.tau/20
        rod('nozzle_petal',(.565*math.cos(t),-5.39,1.88+.525*math.sin(t)),(.526*math.cos(t),-5.64,1.88+.487*math.sin(t)),.011,'metal',6)
    # Bottom intake is a separate supported duct with a deep dark opening.
    # Integrated flattened belly scoop. The lip joins the belly at its upper rim.
    vs=[(-.57,2.12,1.37),(.57,2.12,1.37),(.45,2.12,1.08),(-.45,2.12,1.08),(-.50,1.22,1.31),(.50,1.22,1.31),(.39,1.22,1.13),(-.39,1.22,1.13),(-.49,2.12,1.32),(.49,2.12,1.32),(.40,2.12,1.14),(-.40,2.12,1.14)]
    fs=[(0,1,9,8),(1,2,10,9),(2,3,11,10),(3,0,8,11),(0,4,5,1),(1,5,6,2),(2,6,7,3),(3,7,4,0),(8,9,5,4),(9,10,6,5),(10,11,7,6),(11,8,4,7)]
    intake=mesh('ventral_rectangular_intake_lip',vs,fs,'paint',smooth=False)
    for e in intake.data.edges:e.use_seam=True
    mesh('ventral_intake_depth',[(-.50,1.22,1.31),(.50,1.22,1.31),(.39,1.22,1.13),(-.39,1.22,1.13)],[(0,1,2,3)],'dark',smooth=False)
    for y,z in [(-2.3,2.96),(-.65,2.91)]:
        foil('dorsal_antenna',(0,y,z),(0,y-.15,z+.22),.29,.08,.12,12,3,True)
    # Landing gear follows the game's existing three hinge datums.
    for x,y,r,pz in [(-1.35,-2.7,.32,1.3),(1.35,-2.7,.32,1.3),(0,3.15,.28,1.15)]:
        part='gear_N' if x==0 else 'gear_L' if x<0 else 'gear_R'
        # Sculpted tire shoulders and recessed sidewalls; no dense tread blocks.
        profile=[(-.125,r*.72,r*.72,0),(-.12,r*.89,r*.89,0),(-.095,r*.97,r*.97,0),(-.06,r,r,0),(.06,r,r,0),(.095,r*.97,r*.97,0),(.12,r*.89,r*.89,0),(.125,r*.72,r*.72,0)]
        revolve('tire_'+part,profile,32,'rubber','X',(x,y,r),part)
        for side in [-1,1]:
            rod('wheel_hub_'+part,(x+side*.126,y,r),(x+side*.15,y,r),r*.56,'metal',24,part=part)
            rod('wheel_axle_'+part,(x+side*.151,y,r),(x+side*.17,y,r),r*.18,'shade',16,part=part)
        rod('gear_oleo_'+part,(x,y,r),(x,y,pz),.055,'metal',20,part=part)
        rod('gear_sleeve_'+part,(x,y,.78),(x,y,pz),.08,'light',24,part=part)
        rod('gear_brace_'+part,(x,y,.49),(x+.10,y-.22,.75),.025,'metal',12,part=part)
        rod('gear_brace_'+part,(x+.10,y-.22,.75),(x,y,1.02),.025,'metal',12,part=part)
        box('gear_door_'+part,(x+.19,y,.98),(.035,.56,.53),'paint',part,.006)
        rod('gear_door_bracket_'+part,(x+.06,y,1.11),(x+.19,y,1.11),.025,'metal',8,part=part)
    # Two stores match the visible underwing installation. The port/right load may differ in photos.
    for s in [-1,1]:
        x=s*2.1;label='L' if s<0 else 'R';part='store_'+label+'_inner'
        box('weapon_pylon_'+label,(x,-1.85,1.45),(.14,.74,.82),'shade')
        rod('paired_store_rack_'+label,(x-.26,-1.8,1.10),(x+.26,-1.8,1.10),.06,'metal',12)
        for j,dx in enumerate([-.23,.23]):
            xx=x+dx
            if s>0:
                revolve('rocket_'+str(j),[(-2.76,.18,.18,.86),(-2.63,.205,.205,.86),(-1.02,.205,.205,.86),(-.99,.20,.20,.86)],32,'rocket',center=(xx,0,0),part=part)
            else:
                revolve('missile_'+label+str(j),[(-3.02,.04,.04,.86),(-2.88,.145,.145,.86),(-2.70,.16,.16,.86),(-1.45,.16,.16,.86),(-1.14,.135,.135,.86),(-.90,.02,.02,.86)],32,'store',center=(xx,0,0),part=part)
                for side in [-1,1]:
                    foil('store_horizontal_'+label+str(j),(xx+side*.09,-2.52,.86),(xx+side*.29,-2.85,.86),.43,.19,.07,12,3,part=part)
                foil('store_vertical_'+label+str(j),(xx,-2.51,.90),(xx,-2.85,1.15),.42,.19,.07,12,3,True,part)
    bpy.context.view_layer.update()
    return scene

TEXT_CACHE={}
GLYPHS={'Y':['101','101','010','010','010'],'F':['111','100','110','100','100'],'Q':['111','101','101','111','001'],'4':['101','101','111','001','001'],'A':['010','101','111','101','101'],'I':['111','010','010','010','111'],'0':['111','101','101','101','111'],'3':['111','001','111','001','111'],'-':['000','000','111','000','000']}
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

def color_at(p,role,name):
    x,y,z=p[...,0],p[...,1],p[...,2]
    bases={'paint':(.35,.38,.40),'light':(.59,.61,.62),'shade':(.18,.21,.23),'metal':(.30,.33,.35),'rubber':(.035,.041,.047),'nozzle':(.18,.20,.22),'dark':(.012,.017,.024),'sensor':(.015,.028,.042),'store':(.17,.23,.12),'rocket':(.28,.31,.32),'red':(.62,.06,.03),'green':(.04,.6,.28)}
    c=np.empty(p.shape);c[:]=bases[role]
    if role=='paint':
        # Angular, restrained two-tone camouflage. This is paint, not raised geometry.
        # Explicit nonperiodic shoulder blocks follow photographs 2/3 and the checked aid.
        spine=[(-4.86,.21),(-4.40,.28),(-4.23,.55),(-3.72,.55),(-3.53,.80),(-2.91,.80),(-2.65,.55),(-2.15,.55),(-1.93,.78),(-1.15,.78),(-.88,.50),(-.48,.50),(-.25,.71),(.55,.71),(.80,.43),(1.12,.43),(1.34,.66),(1.87,.66),(2.06,.35),(2.48,.22)]
        dorsal=[(a,-b) for a,b in spine]+[(a,b) for a,b in reversed(spine)]
        camo=polygon_mask(y,x,dorsal)&(z>2.28)
        side=polygon_mask(y,z,[(-4.83,2.52),(-4.28,2.62),(-3.94,2.59),(-3.83,2.43),(-3.16,2.45),(-3.07,2.14),(-1.39,2.14),(-1.13,2.36),(-.55,2.36),(-.32,2.50),(.20,2.48),(.32,2.28),(.85,2.28),(1.02,2.46),(1.56,2.46),(1.73,2.57),(2.25,2.59),(2.39,2.71),(-4.83,2.73)])
        camo|=side&(np.abs(x)>.44)
        if 'main_wing' in name or 'aileron' in name:
            camo=polygon_mask(np.abs(x),y,[(1.05,.22),(1.56,.11),(1.87,-.26),(2.35,-.29),(2.65,-.67),(3.30,-.88),(3.48,-1.20),(3.95,-1.25),(4.07,-1.90),(3.64,-2.02),(2.12,-2.32),(1.30,-2.40)])&(z>1.53)
        if 'vertical_tail' in name:camo=z>2.60
        c[camo]=(.09,.115,.135)
        if 'fury_chined_fuselage' in name:
            radome=y>3.13+.15*np.abs(x)
            c[radome]=(.17,.20,.23)
            # Unequal pale access covers break up the spine, as in photographs 2/3.
            covers=polygon_mask(y,x,[(-3.75,-.28),(-3.18,-.28),(-3.06,.13),(-3.36,.22),(-3.80,.14)])
            covers|=polygon_mask(y,x,[(-2.50,-.24),(-2.12,-.31),(-1.92,.26),(-2.42,.25)])
            covers|=polygon_mask(y,x,[(-.88,-.26),(-.32,-.22),(-.20,.26),(-.70,.33)])
            covers|=polygon_mask(y,x,[(.87,-.25),(1.27,-.30),(1.56,.22),(1.01,.28)])
            c[covers&(z>2.82)&(np.abs(x)<.075)]=(.125,.148,.165)
            notch=polygon_mask(y,z,[(-.36,2.30),(.19,2.26),(.51,2.68),(.17,2.83),(-.12,2.57)])&(np.abs(x)>.63)
            c[notch]=(.35,.38,.40)
            # Fine seam ink follows the radome and two access-cover rectangles.
            for ya,yb,za,zb in [(1.48,2.48,1.95,2.48),(-4.18,-3.58,1.62,2.13)]:
                panel=((np.abs(y-ya)<.010)|(np.abs(y-yb)<.010))&(z>za)&(z<zb)
                panel|=((np.abs(z-za)<.010)|(np.abs(z-zb)<.010))&(y>ya)&(y<yb)
                c[panel&(np.abs(x)>.55)]*=.68
        # Sparse panel lines follow actual stations and access panels.
        seam=(np.abs(y-3.30)<.011)|(np.abs(y+4.85)<.010)
        c[seam]*=.68
        label=(np.abs(x)>.8)&(z>2.16)&(z<2.41)&(y<-1.35)&(y>-3.04)
        text=text_mask(np.where(x>0,(y+3.02)/1.60,(-y-1.42)/1.60),(z-2.19)/.19,'YFQ-44A')&label
        c[text]=(.78,.80,.80)
        if 'vertical_tail' in name:
            text=text_mask(np.where(x>0,(y+4.80)/.40,(-y-4.40)/.40),(z-3.41)/.25,'AI')|text_mask(np.where(x>0,(y+4.88)/.56,(-y-4.32)/.56),(z-3.16)/.16,'0043')
            c[text]=(.63,.66,.68)
        # Small yellow position marks, kept readable at game scale.
        stripe=(np.abs(x)>.70)&(y>1.3)&(y<1.76)&(z>1.66)&(z<1.70)
        if 'wing' in name:stripe=(np.abs(x)>3.65)&(np.abs(x)<4.12)&(y>-2.10)&(y<-2.06)&(z>1.5)
        c[stripe]=(.75,.78,.30)
        if 'dorsal_sensor_fairing' in name:
            window=(np.abs(x)<.115)&(y>2.75)&(y<2.97)&(z>2.67)
            c[window]=(.035,.058,.072)
    if role=='rocket':
        cx=1.87 if 'rocket_0' in name else 2.33
        holes=(x-cx)**2+(z-.86)**2<.047**2
        for i in range(6):
            a=i*math.tau/6;holes|=(x-cx-.116*math.cos(a))**2+(z-.86-.116*math.sin(a))**2<.047**2
        c[holes&(y>-.995)]=(.008,.011,.012)
    if role=='store':
        c[((y>-1.49)&(y<-1.43))|((y>-2.65)&(y<-2.60))]=(.64,.65,.62)
        c[y>-1.22]=(.025,.035,.03)
    if role=='nozzle':c*=np.where((np.floor(np.arctan2(z-1.88,x)*20/math.tau)%2==0)[...,None],.8,1)
    return c

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
    # R2 remains staged until the reference-view review passes.
    return {'uv_zero_area_triangles':zero_uv,'uv_occupied_fraction':occupied,'uv_triangle_area_sum':sum(areas),'texture_dimensions':[1024,1024],'texture_count':1,'material_count':1}

def export():
    store_parts={o.name:o['part'] for o in OBJS if o['part'].startswith('store_')}
    rig=vehicle_rigging.assign('fighter',OBJS);rig['seats']=[]
    for o in OBJS:
        if o.name in store_parts:o['part']=store_parts[o.name]
    used_parts={o['part'] for o in OBJS}
    rig['nodes']={k:v for k,v in rig['nodes'].items() if k in used_parts or k=='hull'}
    for key,node in rig['nodes'].items():
        if node['kind']=='gear':node['retractLift']=.50 if key=='gear_N' else .25
    groups={};root=bpy.data.objects.new('GC_FIGHTER',None);bpy.context.collection.objects.link(root)
    root['forward_axis']='+Y';root['up_axis']='+Z';root['display_name']='FQ-44 Fury'
    for part,node in rig['nodes'].items():
        g=bpy.data.objects.new('Assembly_'+part,None);bpy.context.collection.objects.link(g);g.parent=root;g.location=node['pivot'];groups[part]=g
    for o in OBJS:
        part=o['part'];o.parent=groups[part]
        for v in o.data.vertices:v.co-=Vector(rig['nodes'][part]['pivot'])
    vehicle_rigging.animations(root,groups,rig)
    for part,g in groups.items():
        node=rig['nodes'][part]
        if node['kind']!='gear':continue
        for track in g.animation_data.nla_tracks:
            if track.name not in ['gear','gear_down']:continue
            action=track.strips[0].action
            for curve in action.fcurves:
                if curve.data_path!='location' or curve.array_index!=2:continue
                for point in curve.keyframe_points:
                    amount=max(0,min(1,(point.co[0]-1)/48))
                    if track.name=='gear_down':amount=1-amount
                    point.co[1]+=amount*node['retractLift']
    # Flying uses the fully retracted gear pose in both the GLB and runtime clip.
    for part,g in groups.items():
        node=rig['nodes'][part]
        if node['kind']!='gear':continue
        g.animation_data.action=None
        move,rotation=vehicle_rigging.sample('gear','gear',2,2,node)
        for frame in [1,97]:
            g.rotation_euler=rotation;g.keyframe_insert('rotation_euler',frame=frame)
            g.location=Vector(node['pivot'])+Vector((0,0,node['retractLift']));g.keyframe_insert('location',frame=frame)
        action=g.animation_data.action;action.name='fly__'+part;action.use_fake_user=True
        track=g.animation_data.nla_tracks.new();track.name='fly';track.strips.new('fly',1,action)
        g.animation_data.action=None;g.rotation_euler=(0,0,0);g.location=node['pivot']
    bpy.context.scene.frame_set(0)
    bpy.ops.object.select_all(action='DESELECT');root.select_set(True)
    for o in OBJS+list(groups.values()):o.select_set(True)
    path=os.path.join(OUT,'fighter.glb')
    bpy.ops.export_scene.gltf(filepath=path,export_format='GLB',use_selection=True,use_active_scene=True,export_yup=False,export_extras=True,export_animation_mode='NLA_TRACKS',export_frame_range=False)
    vehicle_rigging.repair_glb_pose(path,rig)
    for key,g in groups.items():
        if g.animation_data:
            g.animation_data.action=None
            for track in g.animation_data.nla_tracks:track.mute=True
        g.location=rig['nodes'][key]['pivot'];g.rotation_euler=(0,0,0)
    bpy.context.view_layer.update()
    with open(os.path.join(OUT,'fighter_rig.json'),'w') as f:json.dump(rig,f,separators=(',',':'))
    return rig

def native_and_report(rig,qa):
    raw=open(os.path.join(OUT,'fighter.glb'),'rb').read();size=struct.unpack_from('<I',raw,12)[0];doc=json.loads(raw[20:20+size]);blob=raw[28+size:]
    def accessor(index):
        a=doc['accessors'][index];v=doc['bufferViews'][a['bufferView']];dtype={5126:'<f4',5125:'<u4',5123:'<u2',5121:'u1'}[a['componentType']];n={'VEC3':3,'VEC2':2,'SCALAR':1,'VEC4':4}[a['type']]
        return np.frombuffer(blob,dtype=dtype,count=a['count']*n,offset=v.get('byteOffset',0)+a.get('byteOffset',0)).reshape((-1,n))
    result={};verts=tris=0
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
    qa.update(export_stored_vertices=verts,runtime_indexed_vertices=verts,triangles=tris,blender_mesh_vertices=sum(len(o.data.vertices) for o in OBJS),mesh_objects=len(OBJS),gltf_material_count=len(doc.get('materials',[])),gltf_image_count=len(doc.get('images',[])),gltf_texture_count=len(doc.get('textures',[])),animations=[a['name'] for a in doc.get('animations',[])],axis='+Y forward, +Z up',reference_inference='Dimensions and hidden intake structure are inferred from five perspective photographs.',source='build_fq44.py',budget_pass=7500<=verts<=10000,representation='Separate manufactured closed shells; nozzle and intake lips are intentional open annular surfaces. One base-color image; scalar roughness and metalness. No high-to-low normal bake requested.',parts=list(result))
    return qa

def render_and_save(scene,qa):
    scene.render.engine='CYCLES';scene.cycles.samples=24;scene.render.resolution_x=1200;scene.render.resolution_y=900;scene.render.resolution_percentage=100
    scene.render.image_settings.file_format='PNG';scene.view_settings.view_transform='AgX'
    world=bpy.data.worlds.new('Fury_studio');world.use_nodes=True;world.node_tree.nodes['Background'].inputs[0].default_value=(.16,.18,.22,1);world.node_tree.nodes['Background'].inputs[1].default_value=.45;scene.world=world
    center=Vector((0,.4,1.9))
    for loc,power,size in [((3,5,11),2100,7),((-6,2,6),1700,6),((2,-9,8),2400,5),((0,5,-3),450,8)]:
        bpy.ops.object.light_add(type='AREA',location=loc);l=bpy.context.object;l.data.energy=power;l.data.shape='DISK';l.data.size=size;l.rotation_euler=(center-l.location).to_track_quat('-Z','Y').to_euler()
    bpy.ops.object.camera_add();cam=bpy.context.object;cam.data.type='ORTHO';scene.camera=cam
    coords=[o.matrix_world@v.co for o in OBJS for v in o.data.vertices]
    for label,vec in {'front':(0,20,1),'side':(20,0,0),'rear':(0,-20,1),'top':(0,0,20),'three_quarter':(12,18,11)}.items():
        cam.location=center+Vector(vec);cam.rotation_euler=(center-cam.location).to_track_quat('-Z','Y').to_euler();bpy.context.view_layer.update();inv=cam.matrix_world.inverted();cc=[inv@p for p in coords]
        low=Vector((min(v.x for v in cc),min(v.y for v in cc),0));high=Vector((max(v.x for v in cc),max(v.y for v in cc),0));cam.data.ortho_scale=max(high.x-low.x,(high.y-low.y)*4/3)*1.12;cam.location+=cam.rotation_euler.to_matrix()@((low+high)/2)
        scene.render.filepath=os.path.join(OUT,'fighter_'+label+'.png');bpy.ops.render.render(write_still=True)
    scene['verification']=json.dumps(qa);bpy.ops.wm.save_as_mainfile(filepath=os.path.join(OUT,'fighter.blend'))
    with open(os.path.join(OUT,'fighter_verification.json'),'w') as f:json.dump(qa,f,indent=2)

def main():
    scene=build();qa=atlas();rig=export();qa=native_and_report(rig,qa)
    with open(os.path.join(OUT,'fighter_verification.json'),'w') as f:json.dump(qa,f,indent=2)
    print('FURY_QA',json.dumps(qa));render_and_save(scene,qa)
    # Publish only this fighter's outputs. Rejected R1 remains in its archive.
    for filename in ['fighter.glb','fighter_albedo.png']:
        shutil.copy2(os.path.join(OUT,filename),os.path.join(REPO,'public/models',filename))
    for filename in ['fighter.json','fighter_rig.json']:
        shutil.copy2(os.path.join(OUT,filename),os.path.join(REPO,'lib/game/generated',filename))
    for filename in ['fighter.blend','fighter.glb','fighter_albedo.png','fighter_verification.json','fighter_front.png','fighter_side.png','fighter_rear.png','fighter_top.png','fighter_three_quarter.png']:
        shutil.copy2(os.path.join(OUT,filename),os.path.join(HERE,filename))

if __name__=='__main__':main()
