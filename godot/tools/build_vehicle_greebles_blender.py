import bpy
import bmesh
import math
from pathlib import Path
from mathutils import Vector

PROJECT = Path(__file__).resolve().parents[1]
OUT_BLEND = str(PROJECT / "assets/blender/vehicle_greebles.blend")
OUT_GLB = str(PROJECT / "assets/models/vehicle_greebles.glb")
PREVIEW = str(PROJECT / "vehicle-greebles-preview.png")

for block in (bpy.data.objects, bpy.data.meshes, bpy.data.curves, bpy.data.materials, bpy.data.cameras, bpy.data.lights):
    for item in list(block):
        block.remove(item, do_unlink=True)

scene = bpy.context.scene
scene.unit_settings.system = 'METRIC'
scene.unit_settings.scale_length = 1.0
scene.render.engine = 'BLENDER_EEVEE_NEXT'

def material(name, color, roughness=0.86, metallic=0.0):
    mat = bpy.data.materials.new(name)
    mat.diffuse_color = (*color, 1.0)
    mat.use_nodes = True
    principled = mat.node_tree.nodes.get('Principled BSDF')
    principled.inputs['Base Color'].default_value = (*color, 1.0)
    principled.inputs['Roughness'].default_value = roughness
    principled.inputs['Metallic'].default_value = metallic
    return mat

OLIVE = material('Canvas_Olive', (0.25, 0.28, 0.17), 0.94)
OLIVE_DARK = material('Canvas_Shadow', (0.12, 0.14, 0.09), 0.97)
CASE = material('Case_Dark_Olive', (0.20, 0.22, 0.14), 0.82)
METAL = material('Hardware_Blackened_Steel', (0.08, 0.09, 0.075), 0.54, 0.45)
STRAP = material('Webbing', (0.16, 0.15, 0.09), 0.96)

def activate(obj):
    bpy.ops.object.select_all(action='DESELECT')
    obj.select_set(True)
    bpy.context.view_layer.objects.active = obj

def finish_mesh(obj):
    activate(obj)
    if obj.scale != Vector((1.0, 1.0, 1.0)):
        bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    for poly in obj.data.polygons:
        poly.use_smooth = True
    bm = bmesh.new()
    bm.from_mesh(obj.data)
    for edge in bm.edges:
        if len(edge.link_faces) != 2 or edge.calc_face_angle(0.0) >= math.radians(30.0):
            edge.smooth = False
    bm.to_mesh(obj.data)
    bm.free()
    obj.data.update()
    obj['smooth_angle_degrees'] = 30
    return obj

def root(name, offset):
    obj = bpy.data.objects.new(name, None)
    scene.collection.objects.link(obj)
    obj.location = offset
    obj['asset_role'] = 'reusable_vehicle_stowage'
    return obj

def box(parent, name, size, loc, mat=CASE, bevel=0.018, rotation=(0,0,0)):
    bpy.ops.mesh.primitive_cube_add(location=(0,0,0))
    obj = bpy.context.object
    obj.name = name
    obj.parent = parent
    obj.location = loc
    obj.rotation_euler = rotation
    obj.dimensions = size
    activate(obj)
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    if bevel > 0:
        mod = obj.modifiers.new('Manufactured edge radius', 'BEVEL')
        mod.width = bevel
        mod.segments = 1
        mod.limit_method = 'ANGLE'
        bpy.ops.object.modifier_apply(modifier=mod.name)
    obj.data.materials.append(mat)
    return finish_mesh(obj)

def cylinder(parent, name, radius, depth, loc, mat, rotation=(0,0,0), vertices=12):
    bpy.ops.mesh.primitive_cylinder_add(vertices=vertices, radius=radius, depth=depth, location=(0,0,0))
    obj = bpy.context.object
    obj.name = name
    obj.parent = parent
    obj.location = loc
    obj.rotation_euler = rotation
    obj.data.materials.append(mat)
    return finish_mesh(obj)

def curve_tube(parent, name, points, radius, mat, cyclic=False):
    curve = bpy.data.curves.new(name, 'CURVE')
    curve.dimensions = '3D'
    curve.resolution_u = 1
    curve.bevel_depth = radius
    curve.bevel_resolution = 0
    curve.resolution_u = 1
    poly = curve.splines.new('POLY')
    poly.points.add(len(points)-1)
    for point, coord in zip(poly.points, points):
        point.co = (*coord, 1.0)
    poly.use_cyclic_u = cyclic
    obj = bpy.data.objects.new(name, curve)
    scene.collection.objects.link(obj)
    obj.parent = parent
    obj.data.materials.append(mat)
    activate(obj)
    bpy.ops.object.convert(target='MESH')
    return finish_mesh(obj)

def buckle(parent, name, loc, scale=1.0):
    x,y,z = loc
    box(parent, name+'_top', (0.055*scale,0.012*scale,0.012*scale), (x,y,z+0.027*scale), METAL, 0.003)
    box(parent, name+'_bottom', (0.055*scale,0.012*scale,0.012*scale), (x,y,z-0.027*scale), METAL, 0.003)
    box(parent, name+'_left', (0.012*scale,0.012*scale,0.065*scale), (x-0.022*scale,y,z), METAL, 0.003)
    box(parent, name+'_right', (0.012*scale,0.012*scale,0.065*scale), (x+0.022*scale,y,z), METAL, 0.003)

def case_asset():
    r = root('Greeble_TransitCase', (-1.7,0,0.18))
    box(r,'CaseBody',(0.62,0.34,0.24),(0,0,0),CASE,0.035)
    box(r,'CaseLid',(0.64,0.36,0.065),(0,0,0.145),CASE,0.025)
    for sx in (-1,1):
        for sy in (-1,1):
            box(r,f'Corner_{sx}_{sy}',(0.065,0.065,0.27),(sx*0.285,sy*0.145,0.015),CASE,0.014)
    for x in (-0.18,0.18):
        box(r,'LatchPlate',(0.055,0.018,0.09),(x,-0.183,0.105),METAL,0.006)
        box(r,'LatchLever',(0.026,0.024,0.12),(x,-0.195,0.08),METAL,0.004)
    curve_tube(r,'SideHandle',[(-0.09,0.19,0.03),(-0.09,0.24,0.03),(0.09,0.24,0.03),(0.09,0.19,0.03)],0.012,METAL)
    return r

def tarp_asset():
    r = root('Greeble_RolledTarp', (-0.85,0,0.16))
    cylinder(r,'TarpRoll',0.155,0.58,(0,0,0),OLIVE,(0,math.pi/2,0),12)
    for x in (-0.19,0.19):
        cylinder(r,'TarpStrap',0.162,0.035,(x,0,0),STRAP,(0,math.pi/2,0),12)
        buckle(r,'TarpBuckle',(x,-0.16,0.025),0.58)
    cylinder(r,'RolledEnd',0.118,0.012,(-0.296,0,0),OLIVE_DARK,(0,math.pi/2,0),12)
    return r

def duffel_asset():
    r = root('Greeble_Duffel', (0,0,0.17))
    bpy.ops.mesh.primitive_ico_sphere_add(subdivisions=2, radius=1.0, location=(0,0,0))
    body=bpy.context.object; body.name='DuffelBody'; body.parent=r; body.scale=(0.36,0.16,0.16)
    body.data.materials.append(OLIVE); finish_mesh(body)
    for x in (-0.16,0.16):
        cylinder(r,'DuffelStrap',0.168,0.026,(x,0,0),STRAP,(0,math.pi/2,0),12)
    curve_tube(r,'DuffelHandle',[(-0.12,0,0.14),(-0.12,0,0.23),(0.12,0,0.23),(0.12,0,0.14)],0.012,STRAP)
    return r

def rucksack_asset():
    r = root('Greeble_FieldRucksack', (0.88,0,0.29))
    box(r,'RuckBody',(0.40,0.24,0.48),(0,0,0),OLIVE,0.065)
    box(r,'RuckFlap',(0.42,0.255,0.16),(0,-0.005,0.20),OLIVE,0.055,(-0.12,0,0))
    box(r,'FrontPocket',(0.25,0.10,0.20),(0,-0.155,-0.08),OLIVE,0.035)
    for x in (-0.25,0.25):
        box(r,'SidePouch',(0.15,0.20,0.25),(x,0,-0.05),OLIVE,0.045)
    for x in (-0.105,0.105):
        box(r,'VerticalWebbing',(0.025,0.265,0.51),(x,-0.005,0),STRAP,0.006)
        buckle(r,'RuckBuckle',(x,-0.145,0.08),0.48)
    curve_tube(r,'TopCarryHandle',[(-0.10,0,0.26),(-0.10,0,0.34),(0.10,0,0.34),(0.10,0,0.26)],0.012,STRAP)
    return r

def jerry_asset():
    r = root('Greeble_JerryCan', (1.62,0,0.26))
    box(r,'CanBody',(0.34,0.18,0.46),(0,0,0),CASE,0.035)
    # Pressed X is modeled as four shallow structural ribs.
    for i,(a,b) in enumerate([((-0.12,-0.105,-0.15),(0, -0.105,0)),((0,-0.105,0),(0.12,-0.105,0.15)),((-0.12,-0.105,0.15),(0,-0.105,0)),((0,-0.105,0),(0.12,-0.105,-0.15))]):
        mid=(Vector(a)+Vector(b))*0.5; length=(Vector(b)-Vector(a)).length
        angle=math.atan2(b[2]-a[2],b[0]-a[0])
        box(r,f'PressedRib_{i}',(length,0.018,0.025),mid,METAL,0.004,(0,-angle,0))
    for y in (-0.055,0,0.055):
        curve_tube(r,'Handle',[(-0.11,y,0.22),(-0.11,y,0.34),(0.11,y,0.34),(0.11,y,0.22)],0.014,METAL)
    cylinder(r,'Cap',0.048,0.045,(0.12,0,0.265),METAL,vertices=12)
    # A shallow carrier and retaining band visibly secure the can to a deck.
    box(r,'CarrierTray',(0.39,0.28,0.025),(0,0,-0.243),METAL,0.004)
    box(r,'CarrierBack',(0.30,0.022,0.37),(0,0.112,-0.045),METAL,0.004)
    box(r,'CarrierFrontLip',(0.39,0.022,0.08),(0,-0.129,-0.19),METAL,0.004)
    for y in (-0.105,0.105):
        box(r,'RetainingBand',(0.356,0.014,0.032),(0,y,0.01),METAL,0.003)
    for x in (-0.177,0.177):
        box(r,'RetainingBandSide',(0.014,0.22,0.032),(x,0,0.01),METAL,0.003)
    return r

roots=[case_asset(),tarp_asset(),duffel_asset(),rucksack_asset(),jerry_asset()]

# Grounded preview setup.
bpy.ops.mesh.primitive_plane_add(size=6, location=(0,0,-0.17))
floor=bpy.context.object; floor.name='PREVIEW_Floor'; floor.data.materials.append(material('PreviewFloor',(0.06,0.075,0.09),0.92))
bpy.ops.object.camera_add(location=(3.4,-5.8,3.5))
camera=bpy.context.object; scene.camera=camera
direction=Vector((0,0,0.25))-camera.location; camera.rotation_euler=direction.to_track_quat('-Z','Y').to_euler()
bpy.ops.object.light_add(type='AREA', location=(-2.5,-3.2,5.0)); key=bpy.context.object; key.data.energy=1000; key.data.shape='DISK'; key.data.size=5
bpy.ops.object.light_add(type='AREA', location=(4,1,2.8)); fill=bpy.context.object; fill.data.energy=600; fill.data.size=4
scene.render.resolution_x=1400; scene.render.resolution_y=700; scene.render.resolution_percentage=100
scene.render.image_settings.file_format='PNG'; scene.render.filepath=PREVIEW
scene.world.color=(0.025,0.03,0.04)
bpy.ops.wm.save_as_mainfile(filepath=OUT_BLEND)
bpy.ops.render.render(write_still=True)

# Keep the editable source parts in the saved blend. For export, consolidate
# static children by material within each reusable root to limit draw calls.
for root_obj in roots:
    groups = {}
    for child in list(root_obj.children_recursive):
        if child.type == 'MESH':
            groups.setdefault(child.data.materials[0].name, []).append(child)
    for material_name, members in groups.items():
        bpy.ops.object.select_all(action='DESELECT')
        for member in members:
            member.select_set(True)
        bpy.context.view_layer.objects.active = members[0]
        if len(members) > 1:
            bpy.ops.object.join()
        members[0].name = root_obj.name + '_' + material_name

# Export reusable object roots only. Preview objects remain in the .blend but not GLB.
bpy.ops.object.select_all(action='DESELECT')
for root_obj in roots:
    root_obj.select_set(True)
    for child in root_obj.children_recursive:
        child.select_set(True)
bpy.ops.export_scene.gltf(filepath=OUT_GLB, export_format='GLB', use_selection=True, export_apply=True, export_yup=True, export_materials='EXPORT')

result = {
    'blend': OUT_BLEND,
    'glb': OUT_GLB,
    'preview': PREVIEW,
    'roots': [r.name for r in roots],
    'mesh_objects': sum(1 for r in roots for o in r.children_recursive if o.type == 'MESH'),
    'triangles': sum(sum(len(p.vertices)-2 for p in o.data.polygons) for r in roots for o in r.children_recursive if o.type == 'MESH'),
}
