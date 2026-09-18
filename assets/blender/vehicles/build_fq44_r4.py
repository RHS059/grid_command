"""FQ-44 R4 assembly built on the approved, traced R4 body.

The shared pipeline supplies mesh, atlas and export utilities. The R4 body
is loaded from its locked contour loft. Earlier body builds are not loaded.
"""
import bpy,bmesh,os,sys,json,math,shutil
import numpy as np
from mathutils import Vector
HERE=os.path.dirname(os.path.abspath(__file__));sys.path.insert(0,HERE)
import fq44_asset_pipeline as tool
import build_fq44_r4_blockout as guide
import fq44_shading
import fq44_texture
OUT=os.path.join(HERE,'fighter_r4');os.makedirs(OUT,exist_ok=True)
tool.OUT=OUT;tool.OBJS.clear();OBJS=tool.OBJS
mesh,rod,revolve,plate,wing=tool.mesh,tool.rod,tool.revolve,tool.cheek_plate,tool.wing_surface
NOSE_Y=guide.longitudinal(1205);MAIN_Y=guide.longitudinal(651)

def crown(y):return guide.elevation(guide.lerp_table(guide.BASE_UPPER,(y+5.4)/guide.SCALE+111))

def build():
    bpy.ops.wm.read_factory_settings(use_empty=True);scene=bpy.context.scene;scene.name='FQ44_Fury_astra_r_4'
    body_path=os.path.join(OUT,'03_body_loft_blockout.blend')
    with bpy.data.libraries.load(body_path,link=False) as (source,destination):destination.objects=['FURY_R4_NEW_CONTOUR_LOFT']
    body=destination.objects[0];scene.collection.objects.link(body);body.name='fury_chined_fuselage_astra_r_4';body['part']='hull';body['finish']='paint';OBJS.append(body)
    body.data.materials.clear();bpy.context.view_layer.update()
    # Open the lower shell. The hole has side walls and a ceiling inside the body.
    tool.cut_bay(body,'Nose gear bay',(0,NOSE_Y,.68),(.40,.90,.64))
    for s in [-1,1]:tool.cut_bay(body,'Main gear bay',(s*.55,MAIN_Y,.68),(.47,.90,.84))
    for e in body.data.edges:
        a,b=[body.data.vertices[i].co for i in e.vertices]
        if a.z<1.12 and b.z<1.12:e.use_seam=True
    # A seam at each hard lower chine. Quiet upper surfaces keep coherent charts.
    bm=bmesh.new();bm.from_mesh(body.data)
    for e in bm.edges:
        if len(e.link_faces)==2 and e.calc_face_angle()>math.radians(30):e.seam=True;e.smooth=False
    # The tight aft belly transition needs separate charts. A joined chart
    # folds over adjacent faces here, despite all faces having nonzero area.
    for face in bm.faces:
        if face.calc_center_median().y<-4.60 and face.normal.z<-.25:
            for edge in face.edges:edge.seam=True
    # Freeze the concave Boolean bay faces before unwrap. The export must use
    # the same diagonals as the atlas receiver.
    bmesh.ops.triangulate(bm,faces=[f for f in bm.faces if len(f.verts)>4],quad_method='BEAUTY',ngon_method='BEAUTY')
    bm.to_mesh(body.data);bm.free()
    # The nose probe sits on the traced tip. The sensor rise is already in the body.
    rod('nose_probe',(0,5.40,1.238),(0,6.13,1.238),.014,'metal',10,.004)
    rod('probe_vane',(0,5.75,1.238),(0,5.75,1.30),.006,'metal',6)
    mesh('sensor_dark_window',[(-.066,3.55,1.88),(.066,3.55,1.88),(.055,3.64,1.817),(-.055,3.64,1.817)],[(0,1,2,3)],'sensor',smooth=False)
    build_wings();build_gear();build_stores();build_tail();build_intake()
    for y in [-1.45,.26]:
        z=crown(y)
        plate('dorsal_antenna',[(0,y+.07,z-.01),(0,y-.12,z-.01),(0,y-.12,z+.17),(0,y+.005,z+.18)],.016)
    # A low rear exhaust collar seats against the traced aft face.
    center=guide.elevation(394)
    revolve('single_exhaust_nozzle',[(-5.35,.38,.255,center),(-5.43,.38,.255,center),(-5.60,.355,.238,center),(-5.62,.312,.205,center),(-5.41,.286,.183,center)],24,'nozzle',caps=False)
    revolve('exhaust_recess',[(-5.405,.284,.181,center),(-5.30,.24,.15,center)],24,'dark')
    # All parts receive explicit role names. No source helpers enter the export.
    for o in OBJS:o.name=o.name.replace('_astra_r_3','_astra_r_4');o['revision']='R4';o['source_body']='R4 traced contour loft'
    bpy.context.view_layer.update();return scene

def build_wings():
    # Root length is locked to side landmarks. Span/outline comes from photo 4.
    # The first three sections form one continuous thick wing-root transition.
    plan=[(.79,.167,-3.275,1.20,.24),(.94,.13,-3.27,1.215,.22),(1.13,.01,-3.20,1.20,.18),
          (1.52,-.23,-3.04,1.19,.145),(2.18,-.60,-2.78,1.19,.105),(2.82,-1.01,-2.53,1.19,.071),
          (3.20,-1.30,-2.34,1.195,.040),(3.26,-1.40,-2.27,1.195,.016)]
    for s in [-1,1]:
        side='L' if s<0 else 'R';reflect=lambda seq:[(s*x,le,te,z,t) for x,le,te,z,t in seq]
        wing('main_wing_'+side,reflect(plan),(0,.009,.025,.055,.11,.20,.34,.52,.68,.79))
        section=lambda xs:reflect([tool.interp_station(plan,x) for x in xs])
        wing('main_wing_root_trailing_'+side,section([.79,.94,1.13,1.34]),(.79,.86,.94,1))
        wing('main_wing_flap_'+side,section([1.36,1.60,1.92,2.17]),(.804,.86,.94,1))
        wing('aileron_'+side,section([2.20,2.50,2.82,3.16]),(.804,.86,.94,1),'control_'+side)
        wing('main_wing_tip_trailing_'+side,section([3.18,3.20,3.26]),(.79,.86,.94,1))
        for x in [1.65,2.58]:
            row=tool.interp_station(plan,x);y=row[1]+(row[2]-row[1])*.805;z=row[3]-.029
            revolve('wing_hinge_fairing_'+side+str(x),[(y-.25,.006,.007,z),(y-.14,.035,.030,z),(y+.07,.028,.020,z),(y+.13,.006,.006,z)],12,center=(s*x,0,0))
        rod('wingtip_navigation_'+side,(s*3.19,-1.88,1.216),(s*3.19,-1.96,1.216),.023,'red' if s<0 else 'green',10)
    traces={'main_wing_right_plan':[[x,le,z] for x,le,te,z,t in plan]+[[x,te,z] for x,le,te,z,t in reversed(plan)]}
    with open(os.path.join(OUT,'planform_contours.json'),'w') as f:json.dump({'source':'Photo 4 wing silhouette and photos 2/3 root locations. Perspective dimensions are inferred.','root_landmarks':['wing_leading_root','wing_trailing_root'],'traces':traces},f,indent=2)

def build_tail():
    plan=[(.39,-3.288,-5.18,1.46,.12),(.59,-3.36,-5.20,1.475,.11),(.90,-3.66,-5.24,1.49,.082),(1.28,-4.12,-5.29,1.515,.044),(1.43,-4.35,-5.25,1.52,.020)]
    for s in [-1,1]:
        wing('elevator_'+('L' if s<0 else 'R'),[(s*x,le,te,z,t) for x,le,te,z,t in plan],(0,.016,.045,.10,.22,.44,.67,.83,1),'tail_'+('L' if s<0 else 'R'))
    # The side contour fixes the fin base and tip. Seat every base vertex in the roof.
    fin=wing('single_vertical_tail',[(1.92,-2.96,-4.32,0,.13),(2.11,-3.07,-4.33,0,.115),(2.42,-3.27,-4.35,0,.088),(2.78,-3.52,-4.38,0,.068),(3.18,-3.80,-4.42,0,.038),(3.235,-3.85,-4.43,0,.018)],(0,.014,.05,.13,.28,.49,.70,.88,1),vertical=True)
    for v in list(fin.data.vertices)[:18]:v.co.z=crown(v.co.y)-.022
    # A small rear fillet follows the crown, with contact along the full root.
    rows=[]
    for y,r,h in [(-4.46,.025,.016),(-4.30,.11,.055),(-3.83,.15,.065),(-3.10,.07,.04),(-2.81,.01,.01)]:rows.append((y,r,h,crown(y)-.015))
    revolve('tail_root_fairing',rows,12)

def build_gear():
    for side in [-1,0,1]:
        nose=side==0;key='N' if nose else 'L' if side<0 else 'R';part='gear_'+key
        r=.202 if nose else .225
        center=Vector((0,NOSE_Y,r)) if nose else Vector((side*.98,MAIN_Y-.04,r))
        pivot=Vector((0,NOSE_Y,.89)) if nose else Vector((side*.55,MAIN_Y,1.0))
        profile=[(-.088,r*.71,r*.71,0),(-.084,r*.87,r*.87,0),(-.066,r*.97,r*.97,0),(-.036,r,r,0),(.036,r,r,0),(.066,r*.97,r*.97,0),(.084,r*.87,r*.87,0),(.088,r*.71,r*.71,0)]
        revolve('tire_'+key,profile,20,'rubber','X',tuple(center),part)
        for s in [-1,1]:
            # Dished rim and separate axle end. Its centre joins the fork.
            revolve('wheel_rim_'+key+str(s),[(s*.089,r*.59,r*.59,0),(s*.096,r*.56,r*.56,0),(s*.101,r*.34,r*.34,0),(s*.116,r*.27,r*.27,0)],14,'light','X',tuple(center),part)
            rod('wheel_axle_'+key+str(s),center+Vector((s*.102,0,0)),center+Vector((s*.141,0,0)),r*.17,'metal',12,part=part)
        trunnion=.235 if nose else .30
        rod('fixed_trunnion_'+key,pivot+Vector((-trunnion,0,0)),pivot+Vector((trunnion,0,0)),.059,'metal',12)
        lower=center+Vector((0,-.025,r*.90));sleeve=lower*.35+pivot*.65
        rod('landing_oleo_'+key,lower,pivot,.043,'metal',14,part=part)
        rod('strut_collar_'+key,sleeve,pivot,.066,'light',14,part=part)
        for s in [-1,1]:rod('fork_'+key+str(s),center+Vector((s*.123,0,0)),lower+Vector((s*.074,0,.022)),.030,'light',10,part=part)
        rod('fork_bridge_'+key,lower+Vector((-.079,0,.022)),lower+Vector((.079,0,.022)),.035,'metal',10,part=part)
        rear=pivot+Vector((0,-.29,.006));joint=rear*.47+lower*.53+Vector((0,-.05,0))
        rod('drag_brace_upper_'+key,rear,joint,.032,'light',10,part=part)
        rod('drag_brace_lower_'+key,joint,lower+Vector((0,0,.085)),.025,'metal',10,part=part)
        rod('drag_link_pin_'+key,joint+Vector((-.045,0,0)),joint+Vector((.045,0,0)),.042,'metal',10,part=part)
        if nose:
            for s in [-1,1]:
                plate('gear_door_N'+str(s),[(s*.202,NOSE_Y-.40,.692),(s*.202,NOSE_Y+.38,.692),(s*.265,NOSE_Y+.32,.475),(s*.265,NOSE_Y-.35,.475)],.017,part)
                rod('door_hinge_N'+str(s),(s*.205,NOSE_Y-.37,.703),(s*.205,NOSE_Y+.34,.703),.015,'metal',8,part=part)
        else:
            # The top door edge meets the exterior bay edge on the angled cheek.
            plate('gear_door_'+key,[(side*.79,MAIN_Y-.40,1.024),(side*.79,MAIN_Y+.38,1.024),(side*1.01,MAIN_Y+.31,.49),(side*1.01,MAIN_Y-.31,.49)],.022,part)
            rod('door_hinge_'+key,(side*.79,MAIN_Y-.38,1.03),(side*.79,MAIN_Y+.36,1.03),.019,'metal',8,part=part)
            rod('door_link_'+key,lower+Vector((0,0,.15)),(side*.91,MAIN_Y+.10,.70),.024,'metal',8,part=part)
            rod('side_brace_'+key,(side*.30,MAIN_Y+.22,.95),lower+Vector((-side*.10,0,.17)),.035,'light',10,part=part)

def build_stores():
    for s in [-1,1]:
        x=s*1.63;label='L' if s<0 else 'R';part='store_'+label+'_inner'
        plate('weapon_pylon_'+label,[(x,-1.14,1.24),(x,-1.99,1.23),(x,-2.00,.79),(x,-1.37,.79)],.105,role='shade')
        tool.box('paired_store_rack_'+label,(x,-1.65,.775),(.60,.53,.10),'shade',bevel=.016)
        for j,dx in enumerate([-.185,.185]):
            xx=x+dx
            for yy in [-1.44,-1.90]:rod('rack_clamp_'+label+str(j)+str(yy),(xx,yy,.67),(xx,yy,.83),.039,'metal',10)
            if s>0:
                revolve('rocket_'+str(j),[(-2.26,.122,.122,.59),(-2.18,.148,.148,.59),(-.83,.148,.148,.59),(-.80,.146,.146,.59)],24,'rocket',center=(xx,0,0),part=part)
            else:
                revolve('missile_'+label+str(j),[(-2.51,.027,.027,.59),(-2.36,.108,.108,.59),(-2.16,.126,.126,.59),(-1.17,.126,.126,.59),(-.95,.10,.10,.59),(-.72,.024,.024,.59)],24,'store',center=(xx,0,0),part=part)
                for s2 in [-1,1]:plate('store_horizontal_'+label+str(j)+str(s2),[(xx+s2*.08,-2.01,.59),(xx+s2*.235,-2.25,.59),(xx+s2*.235,-2.44,.59),(xx+s2*.08,-2.36,.59)],.012,part,'store')
                plate('store_vertical_'+label+str(j),[(xx,-1.99,.67),(xx,-2.22,.84),(xx,-2.43,.84),(xx,-2.34,.67)],.012,part,'store')

def build_intake():
    # The front lip is below the flat belly and ends ahead of the main gear.
    v=[(-.42,1.10,.70),(.42,1.10,.70),(.33,1.10,.45),(-.33,1.10,.45),(-.34,-.25,.69),(.34,-.25,.69),(.28,-.25,.63),(-.28,-.25,.63),(-.365,1.10,.654),(.365,1.10,.654),(.29,1.10,.493),(-.29,1.10,.493)]
    f=[(0,1,9,8),(1,2,10,9),(2,3,11,10),(3,0,8,11),(0,4,5,1),(1,5,6,2),(2,6,7,3),(3,7,4,0),(8,9,5,4),(9,10,6,5),(10,11,7,6),(11,8,4,7)]
    o=mesh('ventral_intake_lip',v,f,smooth=False)
    for e in o.data.edges:e.use_seam=True
    mesh('ventral_intake_depth',[v[i] for i in [4,5,6,7]],[(0,1,2,3)],'dark',smooth=False)

def color_at(p,role,name):
    x,y,z=p[...,0],p[...,1],p[...,2];a=np.abs(x);s=(y+5.4)/10.8
    base={'paint':(.39,.415,.435),'light':(.60,.62,.63),'shade':(.15,.175,.19),'metal':(.30,.33,.35),'rubber':(.027,.033,.038),'nozzle':(.15,.17,.18),'dark':(.009,.014,.018),'sensor':(.012,.023,.033),'store':(.16,.22,.115),'rocket':(.31,.34,.35),'red':(.68,.045,.025),'green':(.035,.58,.22)}
    c=np.empty(p.shape);c[:]=base[role]
    if role=='paint':
        if 'fuselage' in name:
            # The dark spine has long angular shoulder blocks, as in photos 2/3.
            blocks=[(.035,.19),(.10,.27),(.135,.51),(.225,.51),(.255,.68),(.31,.68),(.335,.46),(.39,.46),(.415,.66),(.49,.66),(.515,.42),(.57,.42),(.595,.61),(.65,.61),(.677,.35),(.73,.35),(.762,.21),(.802,.12)]
            polygon=[(b,-w) for b,w in blocks]+[(b,w) for b,w in reversed(blocks)]
            dark=tool.polygon_mask(s,x,polygon)&(z>1.64)
            side=tool.polygon_mask(s,z,[(.105,1.76),(.145,1.94),(.225,1.94),(.24,1.47),(.375,1.47),(.395,1.72),(.475,1.72),(.50,1.87),(.56,1.85),(.58,1.65),(.645,1.65),(.665,1.83),(.72,1.84),(.765,1.87),(.795,1.85),(.78,2.18),(.08,2.18)])&(a>.39)
            c[dark|side]=(.092,.115,.133)
            c[s>.826+.022*a]=(.17,.20,.225)
            # Sparse access seams and exact image labels, within one shared atlas.
            for lo,hi,bot,top in [(.64,.735,1.34,1.73),(.075,.13,1.15,1.60)]:
                line=((np.abs(s-lo)<.001)|(np.abs(s-hi)<.001))&(z>bot)&(z<top)
                line|=((np.abs(z-bot)<.008)|(np.abs(z-top)<.008))&(s>lo)&(s<hi)
                c[line&(a>.36)]*=.65
            text=tool.text_mask(np.where(x>0,(s-.245)/.135,(.380-s)/.135),(z-1.51)/.19,'YFQ-44A')&(a>.58)
            c[text]=(.80,.81,.81)
            stripe=(s>.69)&(s<.732)&(z>1.23)&(z<1.255)&(a>.35);c[stripe]=(.75,.78,.29)
            bay=((a<.205)&(np.abs(y-NOSE_Y)<.456)&(z<1.015))|((np.abs(a-.55)<.242)&(np.abs(y-MAIN_Y)<.456)&(z<1.11))
            c[bay]=(.06,.073,.082)
        elif 'wing' in name or 'aileron' in name:
            dark=tool.polygon_mask(a,y,[(.90,.05),(1.35,-.26),(1.50,-.52),(2.02,-.80),(2.14,-1.06),(2.66,-1.22),(2.92,-1.54),(3.06,-2.13),(2.58,-2.26),(1.54,-2.76),(.92,-2.95)])
            c[dark]=(.11,.135,.15)
            line=(np.abs(y+1.75)<.008)&(a>1.2)&(a<2.75);c[line]*=.68
            c[(a>2.72)&(a<3.07)&(y>-2.36)&(y<-2.33)]=(.73,.76,.27)
        elif 'vertical_tail' in name:
            c[:]=(.13,.155,.175)
            label=tool.text_mask(np.where(x>0,(y+4.21)/.35,(-y-3.86)/.35),(z-2.55)/.18,'AI')|tool.text_mask(np.where(x>0,(y+4.21)/.44,(-y-3.77)/.44),(z-2.31)/.12,'0043')
            c[label]=(.67,.70,.71)
            c[(np.abs(y+4.29)<.008)&(z>2.20)]*=.65
        elif 'elevator' in name:
            c[(a>.60)&(y<-3.85)]=(.13,.155,.17)
    if role=='rocket':
        cx=1.445 if 'rocket_0' in name else 1.815
        holes=(x-cx)**2+(z-.59)**2<.035**2
        for i in range(6):
            t=math.tau*i/6;holes|=(x-cx-.084*math.cos(t))**2+(z-.59-.084*math.sin(t))**2<.035**2
        c[holes&(y>-.811)]=(.009,.012,.015)
    if role=='store':
        c[((y>-1.20)&(y<-1.15))|((y>-2.21)&(y<-2.16))]=(.61,.63,.57)
        c[y>-.99]=(.025,.034,.027)
    if role=='nozzle':c*=np.where((np.floor(np.arctan2(z-guide.elevation(394),x)*18/math.tau)%2==0)[...,None],.78,1)
    return c

def export():
    parts={o.name:o['part'] for o in OBJS}
    rig=tool.vehicle_rigging.assign('fighter',OBJS);rig['seats']=[]
    for o in OBJS:o['part']=parts[o.name]
    used={o['part'] for o in OBJS}
    rig['nodes']={k:v for k,v in rig['nodes'].items() if k in used or k=='hull'}
    for side in ['L','R']:rig['nodes']['tail_'+side]={'kind':'control','pivot':[-.45 if side=='L' else .45,-4.10,1.48]}
    for key,node in rig['nodes'].items():
        if key.startswith('gear_'):
            node['kind']='gear'
            node['pivot']=[0,NOSE_Y,.89] if key=='gear_N' else [-.55 if key=='gear_L' else .55,MAIN_Y,1.0]
            node['retractLift']=.22 if key=='gear_N' else .45
        if key.startswith('store_'):node['kind']='store';node['pivot']=[-1.63 if '_L_' in key else 1.63,-1.65,.59]
    groups={};root=bpy.data.objects.new('GC_FIGHTER',None);bpy.context.collection.objects.link(root)
    root['forward_axis']='+Y';root['up_axis']='+Z';root['display_name']='FQ-44 Fury'
    for part,node in rig['nodes'].items():
        group=bpy.data.objects.new('Assembly_'+part,None);bpy.context.collection.objects.link(group);group.parent=root;group.location=node['pivot'];groups[part]=group
    for o in OBJS:
        part=o['part'];o.parent=groups[part]
        for v in o.data.vertices:v.co-=Vector(rig['nodes'][part]['pivot'])
    tool.vehicle_rigging.animations(root,groups,rig)
    for part,g in groups.items():
        node=rig['nodes'][part]
        if node['kind']!='gear':continue
        for track in g.animation_data.nla_tracks:
            if track.name not in ['gear','gear_down']:continue
            for curve in track.strips[0].action.fcurves:
                if curve.data_path!='location' or curve.array_index!=2:continue
                for point in curve.keyframe_points:
                    q=max(0,min(1,(point.co[0]-1)/48))
                    point.co[1]+=(q if track.name=='gear' else 1-q)*node['retractLift']
        g.animation_data.action=None
        move,rotation=tool.vehicle_rigging.sample('gear','gear',2,2,node)
        for frame in [1,97]:
            g.rotation_euler=rotation;g.keyframe_insert('rotation_euler',frame=frame)
            g.location=Vector(node['pivot'])+Vector((0,0,node['retractLift']));g.keyframe_insert('location',frame=frame)
        action=g.animation_data.action;action.name='fly__'+part;action.use_fake_user=True
        track=g.animation_data.nla_tracks.new();track.name='fly';track.strips.new('fly',1,action)
        g.animation_data.action=None;g.location=node['pivot'];g.rotation_euler=(0,0,0)
    bpy.context.scene.frame_set(0);bpy.ops.object.select_all(action='DESELECT');root.select_set(True)
    for o in OBJS+list(groups.values()):o.select_set(True)
    path=os.path.join(OUT,'fighter.glb')
    bpy.ops.export_scene.gltf(filepath=path,export_format='GLB',use_selection=True,use_active_scene=True,export_yup=False,export_extras=True,export_apply=True,export_animation_mode='NLA_TRACKS',export_frame_range=False)
    tool.vehicle_rigging.repair_glb_pose(path,rig)
    for key,g in groups.items():
        if g.animation_data:
            g.animation_data.action=None
            for track in g.animation_data.nla_tracks:track.mute=True
        g.location=rig['nodes'][key]['pivot'];g.rotation_euler=(0,0,0)
    bpy.context.view_layer.update()
    with open(os.path.join(OUT,'fighter_rig.json'),'w') as f:json.dump(rig,f,separators=(',',':'))
    return rig

def render(scene,qa):
    scene.render.engine='CYCLES';scene.cycles.samples=24;scene.render.resolution_x=1400;scene.render.resolution_y=950;scene.render.resolution_percentage=100;scene.render.image_settings.file_format='PNG';scene.view_settings.view_transform='AgX'
    world=bpy.data.worlds.new('R4 studio');world.use_nodes=True;world.node_tree.nodes['Background'].inputs[0].default_value=(.16,.18,.22,1);world.node_tree.nodes['Background'].inputs[1].default_value=.5;scene.world=world
    target=Vector((0,0,1.4))
    for loc,power,size in [((3,5,9),1900,6),((-5,1,6),1600,5),((2,-8,7),1900,5),((0,4,-3),500,6)]:
        bpy.ops.object.light_add(type='AREA',location=loc);o=bpy.context.object;o.data.energy=power;o.data.size=size;o.rotation_euler=(target-o.location).to_track_quat('-Z','Y').to_euler()
    bpy.ops.object.camera_add();cam=bpy.context.object;cam.data.type='ORTHO';scene.camera=cam
    coords=[o.matrix_world@v.co for o in OBJS for v in o.data.vertices]
    views={'front':(0,20,1),'side':(20,0,0),'rear':(0,-20,1),'top':(0,0,20),'three_quarter':(12,18,10),'reference_2':(-15,20,12),'low_angle':(-12,18,-5)}
    if '--draft' in sys.argv:scene.cycles.samples=12;views={k:views[k] for k in ['front','side','reference_2','low_angle']}
    for label,vector in views.items():
        cam.location=target+Vector(vector);cam.rotation_euler=(target-cam.location).to_track_quat('-Z','Y').to_euler();bpy.context.view_layer.update();vv=[cam.matrix_world.inverted()@p for p in coords]
        low=Vector((min(p.x for p in vv),min(p.y for p in vv),0));high=Vector((max(p.x for p in vv),max(p.y for p in vv),0));cam.data.ortho_scale=max(high.x-low.x,(high.y-low.y)*1400/950)*1.1;cam.location+=cam.rotation_euler.to_matrix()@((low+high)/2)
        scene.render.filepath=os.path.join(OUT,'fighter_'+label+'.png');bpy.ops.render.render(write_still=True)
    for label,center,vector,scale in [('gear_attachment',Vector((.4,MAIN_Y,.7)),Vector((5,6,-2)),3.1),('nose_attachment',Vector((0,NOSE_Y,.65)),Vector((5,5,-2)),2.2)]:
        cam.location=center+vector;cam.rotation_euler=(center-cam.location).to_track_quat('-Z','Y').to_euler();cam.data.ortho_scale=scale
        scene.render.filepath=os.path.join(OUT,'fighter_'+label+'.png');bpy.ops.render.render(write_still=True)
    bpy.ops.wm.save_as_mainfile(filepath=os.path.join(OUT,'fighter.blend'))

def main():
    os.makedirs(os.path.join(OUT,'markings'),exist_ok=True)
    for name in ['YFQ-44A','AI','0043']:shutil.copy2(os.path.join(HERE,'fighter_r2','markings',name+'.png'),os.path.join(OUT,'markings',name+'.png'))
    scene=build();shading=fq44_shading.apply(OBJS);tool.color_at=color_at;qa=tool.atlas();texture=fq44_texture.apply(OBJS)
    rig=export();qa=tool.native_and_report(rig,qa);qa['source']='build_fq44_r4.py';qa['reference_body']='03_body_loft_blockout.blend';qa['nose_gear_normalized_station']=(NOSE_Y+5.4)/10.8;qa['shading']=shading;qa['authored_texture']=texture
    qa['authored_texture'].update(fq44_texture.check_export())
    with open(os.path.join(OUT,'fighter_verification.json'),'w') as f:json.dump(qa,f,indent=2)
    print('R4_QA',json.dumps({k:v for k,v in qa.items() if k!='vertex_budget'}));render(scene,qa)

if __name__=='__main__':main()
