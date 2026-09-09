"""Measure and render all eight actual seated clips against the final vehicle geometry."""
import bpy, os, json, sys, math
from mathutils import Vector, Matrix
sys.path.insert(0, os.path.dirname(__file__))
from vehicle_seating import SEATS

OUT = os.environ['GC_OUTPUT_DIR']
bpy.ops.wm.open_mainfile(filepath=os.path.join(OUT, 'carrier_boarding.blend'))
scene = bpy.context.scene
rig = bpy.data.objects['Astra_Rigify_Rig']
chars = [o for o in scene.objects if o.type == 'MESH' and o.get('component')]
for track in rig.animation_data.nla_tracks:
    track.mute = True

def extrema(points):
    return {'min': [min(p[i] for p in points) for i in range(3)],
            'max': [max(p[i] for p in points) for i in range(3)]}

occupants = []
report = {'source': 'carrier_boarding.blend', 'scale': 1, 'seats': [], 'overlaps': []}
for seat in SEATS:
    rig.animation_data.action = bpy.data.actions['seat_' + seat['id']]
    scene.frame_set(1)
    bpy.context.view_layer.update()
    depsgraph = bpy.context.evaluated_depsgraph_get()
    points, vertices, faces, materials, material_indices = [], [], [], [], []
    parts = {}
    cushion_gap = None
    for obj in chars:
        evaluated = obj.evaluated_get(depsgraph)
        mesh = evaluated.to_mesh()
        world = [obj.matrix_world @ v.co for v in mesh.vertices]
        parts[obj.name] = extrema(world)
        if obj.name == 'Uniform_continuous_body':
            inverse_yaw = Matrix.Rotation(-math.pi - seat['yaw'], 4, 'Z')
            local = [inverse_yaw @ (point - Vector(seat['position'])) for point in world]
            # Measure the garment under the central pelvis, excluding knees and boots.
            support = [point.z for point in local if abs(point.x) < .2 and abs(point.y) < .1 and -.2 < point.z < .3]
            cushion_gap = min(support)
        offset = len(vertices)
        vertices.extend(world)
        remap = []
        for material in mesh.materials:
            original = material.original
            if original not in materials:
                materials.append(original)
            remap.append(materials.index(original))
        for polygon in mesh.polygons:
            faces.append(tuple(offset + i for i in polygon.vertices))
            material_indices.append(remap[polygon.material_index])
        evaluated.to_mesh_clear()
    mesh = bpy.data.meshes.new('Seated_clip_' + seat['id'])
    mesh.from_pydata(vertices, [], faces)
    for material in materials:
        mesh.materials.append(material)
    for polygon, index in zip(mesh.polygons, material_indices):
        polygon.material_index = index
    obj = bpy.data.objects.new('Actual_occupant_' + seat['id'], mesh)
    scene.collection.objects.link(obj)
    occupants.append(obj)
    report['seats'].append({'id': seat['id'], 'bounds': extrema(vertices), 'cushion_contact_gap': cushion_gap, 'parts': parts})

for obj in [*chars, rig]:
    bpy.data.objects.remove(obj, do_unlink=True)
with bpy.data.libraries.load(os.path.join(OUT, 'troop_transport.blend'), link=False) as (source, target):
    target.objects = [name for name in source.objects if not name.startswith(('Studio', 'Review'))]
for obj in target.objects:
    if obj and obj.type not in ['CAMERA', 'LIGHT']:
        scene.collection.objects.link(obj)
        if obj.animation_data:
            obj.animation_data.action = None
            for track in obj.animation_data.nla_tracks:
                track.mute = True
bpy.context.view_layer.update()
for i, first in enumerate(report['seats']):
    for second in report['seats'][:i]:
        a, b = first['bounds'], second['bounds']
        depth = [min(a['max'][k], b['max'][k]) - max(a['min'][k], b['min'][k]) for k in range(3)]
        if min(depth) > 0:
            report['overlaps'].append({'a': first['id'], 'b': second['id'], 'depth': depth})
report['minimum_floor_clearance'] = min(s['bounds']['min'][2] - .91 for s in report['seats'])
report['minimum_roof_clearance'] = min(2.50 - s['bounds']['max'][2] for s in report['seats'])
report['maximum_cushion_contact_gap'] = max(abs(s['cushion_contact_gap']) for s in report['seats'])
json.dump(report, open(os.path.join(OUT, 'actual_seated_fit_verification.json'), 'w'), indent=2)
print('ACTUAL_SEATED_FIT', json.dumps({k: v for k, v in report.items() if k != 'seats'}), flush=True)
assert not report['overlaps'], 'Actual seated occupants overlap'
assert report['minimum_floor_clearance'] > -.005, 'Boots penetrate the floor'
assert report['minimum_roof_clearance'] > .05, 'Head clearance is insufficient'
assert report['maximum_cushion_contact_gap'] < .005, 'Pelvis misses the cushion contact'
print('ACTUAL_SEATED_FIT_PASS', flush=True)
if os.environ.get('GC_FIT_MEASURE_ONLY') == '1':
    raise SystemExit(0)

scene.render.engine = 'BLENDER_EEVEE_NEXT'
scene.render.resolution_x, scene.render.resolution_y = 1400, 1050
scene.render.resolution_percentage = 100
scene.render.image_settings.file_format = 'PNG'
scene.render.film_transparent = False
scene.use_nodes = False
scene.view_settings.view_transform = 'Standard'
scene.view_settings.look = 'Medium High Contrast'
world = bpy.data.worlds.new('Actual_clip_fit_world')
world.use_nodes = True
world.node_tree.nodes['Background'].inputs[0].default_value = (.17, .195, .22, 1)
world.node_tree.nodes['Background'].inputs[1].default_value = .7
scene.world = world
meshes = [obj for obj in scene.objects if obj.type == 'MESH']
points = [obj.matrix_world @ Vector(corner) for obj in meshes for corner in obj.bound_box]
box = extrema(points)
center = (Vector(box['min']) + Vector(box['max'])) * .5
for location in [(7, 9, 13), (-8, 3, 7), (0, -9, 9)]:
    bpy.ops.object.light_add(type='AREA', location=location)
    light = bpy.context.object
    light.data.energy, light.data.size = 1500, 7
    light.rotation_euler = (center - light.location).to_track_quat('-Z', 'Y').to_euler()
bpy.ops.object.camera_add()
camera = bpy.context.object
camera.data.type = 'ORTHO'
scene.camera = camera
for label, angle in {'front': (0, 16, 0), 'rear': (0, -16, 0), 'side': (16, 0, 0), 'top': (0, 0, 16), 'three_quarter': (10, 14, 10)}.items():
    camera.location = center + Vector(angle)
    camera.rotation_euler = (center - camera.location).to_track_quat('-Z', 'Y').to_euler()
    bpy.context.view_layer.update()
    projected = [camera.matrix_world.inverted() @ point for point in points]
    view = extrema(projected)
    camera.data.ortho_scale = max(view['max'][0] - view['min'][0], (view['max'][1] - view['min'][1]) * 1400 / 1050) * 1.13
    scene.render.filepath = os.path.join(OUT, 'actual_seated_' + label + '.png')
    bpy.ops.render.render(write_still=True)
bpy.ops.wm.save_as_mainfile(filepath=os.path.join(OUT, 'actual_seated_fit.blend'))
print('ACTUAL_SEATED_RENDERS_COMPLETE')
