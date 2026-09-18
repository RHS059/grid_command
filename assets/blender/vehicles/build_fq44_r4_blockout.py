"""Fury R4: trace the side and front guides before creating a body loft.

The supplied photographs are the authority. Generated guides only aid the trace.
R2 and R3 are not loaded. Their meshes and section values are not used.
Blender axes: +Y forward, +Z up. All dimensions are inferred.
"""
import bpy, bmesh, json, math, os
from mathutils import Vector
HERE=os.path.dirname(os.path.abspath(__file__))
OUT=os.path.join(HERE,'fighter_r4');os.makedirs(OUT,exist_ok=True)
GUIDES=os.path.join(HERE,'reference_guides')

# Trace coordinates use the 2048 x 728 displayed side guide. Each coordinate is
# converted through the same image-plane scale. This is an explicit contour,
# not an ellipse, capsule, revolved primitive, or an old body's station table.
SIDE_SIZE=(2048,728)
EXHAUST_PX=111.0;NOSE_PX=1768.0;GROUND_PX=630.0;LENGTH=10.8
SCALE=LENGTH/(NOSE_PX-EXHAUST_PX)
SIDE_UPPER=[(111,358),(134,350),(176,345),(276,333),(438,324),
    (570,319),(650,316),(740,313),(850,312),(1020,316),(1170,324),
    (1325,334),(1410,345),(1435,338),(1461,336),(1477,339),
    (1488,348),(1495,357),(1590,382),(1680,409),(1730,426),(1768,438)]
SIDE_LOWER=[(111,430),(192,459),(273,485),(337,502),(437,515),
    (540,523),(661,526),(760,526),(915,526),(992,526),(1080,526),
    (1205,526),(1260,510),(1395,465),(1560,461),(1660,453),(1768,442)]
# The fairing is traced in the upper contour. The base surface under it is a
# separate line so that its rise is local to the centre of the upper body.
BASE_UPPER=[p for p in SIDE_UPPER if not 1410<p[0]<1495]
FRONT_SIZE=(1672,941);FRONT_CENTER=835.0
FRONT_TOP=289.0;FRONT_BOTTOM=646.0
FRONT_RIGHT=[(835,289),(801,292),(767,303),(736,323),(700,354),
    (669,394),(640,435),(612,476),(584,518),(628,565),(668,611),
    (699,638),(757,646),(835,646)]
FRONT_TRACE=FRONT_RIGHT+[(2*FRONT_CENTER-x,z) for x,z in reversed(FRONT_RIGHT[1:-1])]

def lerp_table(table,x):
    if x<=table[0][0]:return table[0][1]
    for a,b in zip(table,table[1:]):
        if x<=b[0]:
            t=(x-a[0])/(b[0]-a[0]);return a[1]*(1-t)+b[1]*t
    return table[-1][1]

def longitudinal(px):return (px-EXHAUST_PX)*SCALE-LENGTH/2
def elevation(py):return (GROUND_PX-py)*SCALE
MAX_TOP=elevation(min(p[1] for p in SIDE_UPPER))
MIN_BELLY=elevation(max(p[1] for p in SIDE_LOWER))
FRONT_SCALE=(MAX_TOP-MIN_BELLY)/(FRONT_BOTTOM-FRONT_TOP)
MAX_HALF_WIDTH=(FRONT_CENTER-584)*FRONT_SCALE

def material(name,color,emission=False):
    m=bpy.data.materials.new(name);m.use_nodes=True;n=m.node_tree.nodes
    if emission:
        n.clear();s=n.new('ShaderNodeEmission');s.inputs[0].default_value=(*color,1)
        out=n.new('ShaderNodeOutputMaterial');m.node_tree.links.new(s.outputs[0],out.inputs[0])
    else:
        s=n.get('Principled BSDF');s.inputs['Base Color'].default_value=(*color,1);s.inputs['Roughness'].default_value=.65
    return m

def connected_curve(name,points,mat,radius=.009,closed=False):
    data=bpy.data.curves.new(name,'CURVE');data.dimensions='3D';data.bevel_depth=radius;data.bevel_resolution=0
    s=data.splines.new('POLY');s.points.add(len(points)-1)
    for p,v in zip(s.points,points):p.co=(*v,1)
    s.use_cyclic_u=closed
    o=bpy.data.objects.new(name,data);bpy.context.collection.objects.link(o);o.data.materials.append(mat);o['role']='REFERENCE_TRACE';return o

def mesh_object(name,vertices,faces):
    m=bpy.data.meshes.new(name);m.from_pydata(vertices,[],faces);m.update()
    o=bpy.data.objects.new(name,m);bpy.context.collection.objects.link(o);return o

def image_plane(name,path,vertices):
    o=mesh_object(name,vertices,[(0,1,2,3)]);uv=o.data.uv_layers.new(name='GuideUV')
    for l,v in zip(uv.data,[(0,0),(1,0),(1,1),(0,1)]):l.uv=v
    m=bpy.data.materials.new(name+'_image');m.use_nodes=True;n=m.node_tree.nodes;n.clear()
    im=bpy.data.images.load(path);im.pack();im.filepath='//../reference_guides/'+os.path.basename(path)
    tex=n.new('ShaderNodeTexImage');tex.image=im;tex.interpolation='Linear'
    em=n.new('ShaderNodeEmission');out=n.new('ShaderNodeOutputMaterial')
    m.node_tree.links.new(tex.outputs['Color'],em.inputs['Color']);m.node_tree.links.new(em.outputs[0],out.inputs[0])
    o.data.materials.append(m);o['role']='REFERENCE_PLANE';return o

def camera(name,position,target,ortho):
    data=bpy.data.cameras.new(name);data.type='ORTHO';data.ortho_scale=ortho
    o=bpy.data.objects.new(name,data);bpy.context.collection.objects.link(o);o.location=position
    o.rotation_euler=(Vector(target)-o.location).to_track_quat('-Z','Y').to_euler();return o

def render(scene,cam,name,width,height):
    scene.camera=cam;scene.render.resolution_x=width;scene.render.resolution_y=height
    scene.render.filepath=os.path.join(OUT,name+'.png');bpy.ops.render.render(write_still=True)

def marker(name,point):
    o=bpy.data.objects.new(name,None);bpy.context.collection.objects.link(o)
    o.location=point;o.empty_display_type='PLAIN_AXES';o.empty_display_size=.09;o['role']='LANDMARK';return o

def main():
    bpy.ops.wm.read_factory_settings(use_empty=True)
    scene=bpy.context.scene;scene.name='FQ44_R4_Contour_Blockout'
    scene.render.engine='CYCLES';scene.cycles.samples=16
    scene.render.resolution_percentage=100;scene.render.image_settings.file_format='PNG'
    scene.view_settings.view_transform='Standard'
    world=bpy.data.worlds.new('Blockout world');world.use_nodes=True
    world.node_tree.nodes['Background'].inputs[0].default_value=(.20,.22,.25,1)
    world.node_tree.nodes['Background'].inputs[1].default_value=.5;scene.world=world
    cyan=material('Contour cyan',(0,.60,.85),True);amber=material('Landmark amber',(1,.30,.02),True)
    wiremat=material('Body wire',(1,.38,.045),True);clay=material('Body clay',(.49,.54,.60))
    side_vertices=[(-.07,longitudinal(0),elevation(SIDE_SIZE[1])),(-.07,longitudinal(SIDE_SIZE[0]),elevation(SIDE_SIZE[1])),(-.07,longitudinal(SIDE_SIZE[0]),elevation(0)),(-.07,longitudinal(0),elevation(0))]
    side_plane=image_plane('SIDE_REFERENCE_PLANE',os.path.join(GUIDES,'fq44_side_ortho_generated.png'),side_vertices)
    side_points=[(0,longitudinal(x),elevation(z)) for x,z in SIDE_UPPER+list(reversed(SIDE_LOWER))]
    side_trace=connected_curve('SIDE_ONE_CONNECTED_CLOSED_CONTOUR',side_points,cyan,.012,True)
    # Store the editable contour as connected vertices and edges, as requested.
    edge_mesh=bpy.data.meshes.new('SIDE_TRACE_VERTEX_CHAIN');edge_mesh.from_pydata(side_points,[(i,(i+1)%len(side_points)) for i in range(len(side_points))],[])
    side_edit=bpy.data.objects.new('SIDE_TRACE_EDITABLE_VERTICES',edge_mesh);bpy.context.collection.objects.link(side_edit);side_edit.hide_render=True
    side_center=(0,longitudinal(SIDE_SIZE[0]/2),elevation(SIDE_SIZE[1]/2))
    side_cam=camera('Side trace camera',(20,side_center[1],side_center[2]),side_center,SIDE_SIZE[0]*SCALE)
    rows=[
      ('exhaust_plane',111,394,'rear opening centre'),('tailplane_root',435,405,'forward root of the tailplane'),
      ('wing_trailing_root',437,468,'trailing wing root'),('main_gear_station',651,523,'gear support at the lower body'),
      ('intake_end',760,525,'aft lower-body intake boundary, inferred'),('wing_leading_root',965,438,'leading wing root'),
      ('intake_start',1250,495,'forward lower-body intake boundary, inferred'),('nose_gear_station',1205,526,'nose gear support on the continuous flat belly'),
      ('sensor_canopy_peak',1461,336,'small unmanned sensor fairing'),('nose_tip',1768,440,'body nose and probe attachment'),
      ('probe_root',1768,435,'probe axis at the nose')]
    for name,x,z,note in rows:marker('LM_'+name,(0,longitudinal(x),elevation(z)))
    scene['phase']='Side contour traced and saved before front alignment.'
    bpy.ops.wm.save_as_mainfile(filepath=os.path.join(OUT,'01_side_contour.blend'))
    render(scene,side_cam,'body_side_contour_over_guide',1800,640)
    side_plane.hide_render=True;side_trace.hide_render=True
    # Align the front plane's body crown and flat belly to the side trace.
    def fp(x,z,y=0):return ((FRONT_CENTER-x)*FRONT_SCALE,y,MIN_BELLY+(FRONT_BOTTOM-z)*FRONT_SCALE)
    front_plane=image_plane('FRONT_REFERENCE_PLANE',os.path.join(GUIDES,'fq44_front_ortho_generated.png'),[fp(0,FRONT_SIZE[1],-.07),fp(FRONT_SIZE[0],FRONT_SIZE[1],-.07),fp(FRONT_SIZE[0],0,-.07),fp(0,0,-.07)])
    front_points=[fp(x,z) for x,z in FRONT_TRACE]
    front_trace=connected_curve('FRONT_ONE_CONNECTED_CLOSED_CONTOUR',front_points,cyan,.012,True)
    edge_mesh=bpy.data.meshes.new('FRONT_TRACE_VERTEX_CHAIN');edge_mesh.from_pydata(front_points,[(i,(i+1)%len(front_points)) for i in range(len(front_points))],[])
    front_edit=bpy.data.objects.new('FRONT_TRACE_EDITABLE_VERTICES',edge_mesh);bpy.context.collection.objects.link(front_edit);front_edit.hide_render=True
    front_center=fp(FRONT_SIZE[0]/2,FRONT_SIZE[1]/2)
    front_cam=camera('Front trace camera',(front_center[0],20,front_center[2]),front_center,FRONT_SIZE[0]*FRONT_SCALE)
    marker('LM_front_flat_belly',(0,0,MIN_BELLY));marker('LM_front_crown',(0,0,MAX_TOP))
    marker('LM_front_chine_R',fp(584,518));marker('LM_front_chine_L',fp(1086,518))
    scene['phase']='Side and front connected contours locked. No plan widths added yet.'
    scene['shared_datum_belly_z']=MIN_BELLY;scene['shared_datum_crown_z']=MAX_TOP
    bpy.ops.wm.save_as_mainfile(filepath=os.path.join(OUT,'02_side_front_contours_locked.blend'))
    render(scene,front_cam,'body_front_contour_over_guide',1500,844)
    front_plane.hide_render=True;front_trace.hide_render=True
    # Plan widths are now added. They are inferred from original photos 2--5.
    # Each value is a fraction of the measured front contour half width.
    widths=[(111,.375),(176,.51),(276,.66),(438,.85),(540,.94),(651,.985),
        (760,1.0),(915,.985),(965,.968),(1080,.92),(1205,.83),(1250,.78),
        (1325,.70),(1410,.605),(1461,.54),(1495,.48),(1590,.32),(1680,.165),(1730,.078),(1768,.004)]
    xs=sorted(set(x for x,_ in widths)|{x for x,_ in SIDE_UPPER}|{x for x,_ in SIDE_LOWER})
    # The front trace determines the section's curved roof and hard lower facets.
    profile=[((FRONT_CENTER-x)/(FRONT_CENTER-584),(FRONT_BOTTOM-z)/(FRONT_BOTTOM-FRONT_TOP)) for x,z in FRONT_TRACE]
    vertices=[]
    for px in xs:
        top=elevation(lerp_table(BASE_UPPER,px));fairing=elevation(lerp_table(SIDE_UPPER,px))-top
        bottom=elevation(lerp_table(SIDE_LOWER,px));width=lerp_table(widths,px)*MAX_HALF_WIDTH
        for u,v in profile:
            z=bottom+(top-bottom)*v+fairing*max(0,1-abs(u)/.29)*max(0,(v-.75)/.25)
            vertices.append((u*width,longitudinal(px),z))
    n=len(profile);faces=[(j*n+i,j*n+(i+1)%n,(j+1)*n+(i+1)%n,(j+1)*n+i) for j in range(len(xs)-1) for i in range(n)]
    faces.extend([tuple(reversed(range(n))),tuple(range((len(xs)-1)*n,len(xs)*n))])
    body=mesh_object('FURY_R4_NEW_CONTOUR_LOFT',vertices,faces);body.data.materials.append(clay)
    bm=bmesh.new();bm.from_mesh(body.data);bmesh.ops.recalc_face_normals(bm,faces=bm.faces);bm.to_mesh(body.data);bm.free()
    for p in body.data.polygons:
        section=p.index%n
        p.use_smooth=p.index<(len(xs)-1)*n and (section<8 or section>17)
    for edge in body.data.edges:
        a,b=edge.vertices
        if a%n==b%n and a%n in [8,11,12,14,15,18]:edge.use_edge_sharp=True
    body['construction']='Loft through an explicit traced front contour at side-contour landmarks.'
    body['previous_body_geometry_used']=False;body['stage']='Body blockout only. No wings, gear or detail.'
    table=[]
    for name,px,py,note in rows:
        half=lerp_table(widths,px)*MAX_HALF_WIDTH
        table.append({'landmark':name,'longitudinal_0_exhaust_1_nose':round((px-EXHAUST_PX)/(NOSE_PX-EXHAUST_PX),4),'height_over_body_length':round(elevation(py)/LENGTH,4),'half_width_over_body_length':round(half/LENGTH,4),'position_Y':round(longitudinal(px),4),'position_Z':round(elevation(py),4),'half_width_X':round(half,4),'guide_pixel':[px,py],'note':note})
        marker('WIDTH_'+name,(half,longitudinal(px),elevation(py)))
    report={'revision':'R4 body blockout','units':'Inferred model units. Body length is set to 10.8. These are not measured aircraft dimensions.','construction_order':['Side image plane and one connected vertex contour','Save side contour','Front image plane and one connected vertex contour','Align crown and belly datums; save both contours','Add plan widths from photos','Loft the new body'],
        'source_vertices':len(vertices),'source_faces':len(faces),'triangles':sum(len(f)-2 for f in faces),'section_count':len(xs),'vertices_per_section':n,'body_length':LENGTH,'body_max_half_width':MAX_HALF_WIDTH,'crown_z':MAX_TOP,'belly_z':MIN_BELLY,'landmarks':table,
        'reference_checks':['Photo 1: wide lower chines and a broad flat belly. The front guide is aligned to the side crown and belly.','Photos 2 and 3: long forward wedge and low sensor fairing; nose gear aft of the nose shoulder.','Photos 4 and 5: shallow forward belly followed by angular lower-body transitions.','No R2 or R3 body mesh or section values were read by this script.'],
        'limits':['The generated front guide includes perspective-like overlap. Width and hidden underside shape remain inferred.','The guide notch near the nose gear was removed after comparison with the original photos. The lower body has a continuous flat run and an angled rise.','This file contains only the new body blockout. It is not a final model or export.']}
    with open(os.path.join(OUT,'body_landmarks.json'),'w') as f:json.dump(report,f,indent=2)
    text=['# FQ-44 R4 body blockout','','The body was rebuilt from the side and front contours. R2 and R3 body data were not used.','','Coordinates use body length as the scale. Longitudinal position is 0 at the exhaust and 1 at the nose. Height and half width are divided by body length. These values are inferred.','','| Landmark | Length | Height | Half width |','|---|---:|---:|---:|']
    for row in table:text.append('| '+row['landmark'].replace('_',' ')+' | '+str(row['longitudinal_0_exhaust_1_nose'])+' | '+str(row['height_over_body_length'])+' | '+str(row['half_width_over_body_length'])+' |')
    text.extend(['','The nose gear station is at 0.6602 of body length. It is well aft of the R3 location.','','The front section has a flat lower face, hard lower chines and a curved roof. The contour includes the local sensor fairing rise.','',*report['limits']])
    with open(os.path.join(OUT,'body_landmarks.md'),'w') as f:f.write('\n'.join(text)+'\n')
    # Save the body before presentation objects are added.
    scene['phase']='Body blockout ready for reference review.'
    scene['report']=json.dumps(report)
    bpy.ops.wm.save_as_mainfile(filepath=os.path.join(OUT,'03_body_loft_blockout.blend'))
    center=Vector((0,0,1.35))
    for loc,power,size in [((4,5,8),1600,6),((-5,1,5),1250,5),((0,-6,6),1600,4),((0,3,-3),500,6)]:
        data=bpy.data.lights.new('Blockout light','AREA');data.energy=power;data.shape='DISK';data.size=size
        o=bpy.data.objects.new('Blockout light',data);bpy.context.collection.objects.link(o);o.location=loc;o.rotation_euler=(center-o.location).to_track_quat('-Z','Y').to_euler()
    scene.view_settings.view_transform='AgX'
    hero=camera('Clay low camera',(10,17,-4),center,12.0)
    render(scene,hero,'body_clay_low_three_quarter',1500,900)
    hero.location=(-11,17,9);hero.rotation_euler=(center-hero.location).to_track_quat('-Z','Y').to_euler()
    render(scene,hero,'body_clay_three_quarter',1500,900)
    # Every cage edge is rendered. The smooth roof does not hide the topology.
    wires=[]
    for i,e in enumerate(body.data.edges):wires.append(connected_curve('Cage_edge_'+str(i),[tuple(body.data.vertices[v].co) for v in e.vertices],wiremat,.0035))
    side_wire=camera('Side wire camera',(20,0,1.5),(0,0,1.5),11.65)
    render(scene,side_wire,'body_wireframe_side',1600,700)
    front_wire=camera('Front wire camera',(0,20,1.35),(0,0,1.35),3.1)
    render(scene,front_wire,'body_wireframe_front',1100,900)
    for w in wires:w.hide_render=True;w.hide_viewport=True
    scene.camera=hero
    bpy.ops.wm.save_as_mainfile(filepath=os.path.join(OUT,'03_body_loft_blockout.blend'))
    print('R4_BODY_BLOCKOUT',json.dumps({k:v for k,v in report.items() if k!='landmarks'}))

if __name__=='__main__':main()
