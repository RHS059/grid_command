"""Round-trip the exact runtime GLBs and mount manifest into review renders."""
import bpy
import json
import math
from pathlib import Path
from mathutils import Vector

PROJECT = Path(__file__).resolve().parents[1]
OUTPUT = PROJECT / "build/stowage-review"
OUTPUT.mkdir(parents=True, exist_ok=True)
bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.gltf(filepath=str(PROJECT / "assets/models/tank.glb"))
for obj in bpy.data.objects:
    obj.animation_data_clear()
image = bpy.data.images.load(str(PROJECT / "assets/models/tank_albedo_ps2.png"))
for material in bpy.data.materials:
    if material.use_nodes:
        shader = material.node_tree.nodes.get('Principled BSDF')
        if shader:
            tex = material.node_tree.nodes.new('ShaderNodeTexImage')
            tex.image = image
            material.node_tree.links.new(tex.outputs['Color'], shader.inputs['Base Color'])

bpy.ops.import_scene.gltf(filepath=str(PROJECT / "assets/models/vehicle_greebles.glb"))
manifest = json.loads((PROJECT / "data/vehicles/tank_stowage.json").read_text())
mounted = []
for mount in manifest['mounts']:
    obj = bpy.data.objects[mount['asset']]
    parent = bpy.data.objects[mount['parent']]
    obj.parent = parent
    x, y, z = mount['position']
    obj.location = (x, -z, y)
    obj.rotation_mode = 'XYZ'
    obj.rotation_euler = (0, 0, math.radians(mount['yaw_degrees']))
    obj.scale = (1, 1, 1)
    obj.name = mount['name']
    mounted.append(obj)
bpy.context.view_layer.update()
report = []
for obj in mounted:
    points = [obj.matrix_world.inverted() @ child.matrix_world @ Vector(v)
              for child in obj.children_recursive if child.type == 'MESH' for v in child.bound_box]
    report.append({'name': obj.name, 'parent': obj.parent.name,
                   'dimensions_m': [round(max(v[i] for v in points)-min(v[i] for v in points),4) for i in range(3)],
                   'mesh_count': sum(child.type == 'MESH' for child in obj.children_recursive),
                   'triangles': sum(len(p.vertices)-2 for child in obj.children_recursive if child.type == 'MESH' for p in child.data.polygons)})

scene = bpy.context.scene
scene.render.engine = 'BLENDER_EEVEE_NEXT'
scene.render.resolution_x = 1600
scene.render.resolution_y = 1100
scene.render.resolution_percentage = 100
scene.render.image_settings.file_format = 'PNG'
scene.world = bpy.data.worlds.new('ReviewWorld')
scene.world.use_nodes = True
scene.world.node_tree.nodes['Background'].inputs['Color'].default_value = (0.12, 0.15, 0.19, 1)
scene.world.node_tree.nodes['Background'].inputs['Strength'].default_value = 0.35
scene.view_settings.view_transform = 'AgX'
bpy.ops.mesh.primitive_plane_add(size=200, location=(0,0,0))
floor = bpy.context.object
floor.name = 'REVIEW_Floor'
mat = bpy.data.materials.new('ReviewFloor')
mat.diffuse_color = (0.08,0.10,0.12,1)
floor.data.materials.append(mat)
for name, location, power, size in [('Key',(-4,-5,10),1800,8),('Fill',(6,1,6),1600,7),('Rim',(0,6,8),1400,6)]:
    bpy.ops.object.light_add(type='AREA', location=location)
    light = bpy.context.object
    light.name = name
    light.data.energy = power
    light.data.size = size
    light.rotation_euler = (Vector((0,0,1.5))-light.location).to_track_quat('-Z','Y').to_euler()
bpy.ops.object.camera_add()
camera = bpy.context.object
scene.camera = camera
camera.data.type = 'ORTHO'
for name, location, target, scale in [
    ('tank-stowage-rear',(-7,-10,7),(0,-0.5,1.5),9.8),
    ('tank-stowage-front',(-7,11,7),(0,0.3,1.5),10.5),
    ('tank-stowage-detail',(-5,-8,5),(0,-1.65,2.2),5.3),
]:
    camera.location = location
    camera.rotation_euler = (Vector(target)-camera.location).to_track_quat('-Z','Y').to_euler()
    camera.data.ortho_scale = scale
    scene.render.filepath = str(OUTPUT / (name+'.png'))
    bpy.ops.render.render(write_still=True)
bpy.ops.wm.save_as_mainfile(filepath=str(OUTPUT / 'tank_stowage_review.blend'))
(OUTPUT / 'asset_roundtrip.json').write_text(json.dumps(report,indent=2))
print(json.dumps({'output':str(OUTPUT),'assets':report},indent=2))
