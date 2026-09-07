"""Export the hand-authored soldier and build its separate weapon library.

Run with Blender 4.5 LTS:
  blender --background assets/blender/soldier.blend --python tools/blender/build_soldier.py
"""
import math
import os
import re
import bpy

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..'))
SOLDIER_BLEND = os.path.join(ROOT, 'assets', 'blender', 'soldier.blend')
SOLDIER_GLB = os.path.join(ROOT, 'public', 'models', 'soldier.glb')
WEAPONS_BLEND = os.path.join(ROOT, 'assets', 'blender', 'soldier-weapons.blend')
WEAPONS_GLB = os.path.join(ROOT, 'public', 'models', 'soldier-weapons.glb')
RIG_NAME = 'GC_Soldier_Rig'
WEAPON_ROLES = ('RIFLE', 'MG', 'AT', 'AA_TEAM')
REQUIRED_ACTIONS = {
    'idle_passive', 'idle_passive_mg', 'idle_passive_at', 'idle_ready',
    'ik_at', 'walk', 'fire', 'in_cover', 'in_cover_shoot', 'peek',
    'crouch', 'prone', 'throw', 'drag', 'downed', 'dead',
}
REQUIRED_BONES = {
    'root', 'pelvis', 'spine', 'head', 'weapon',
    'upper_arm.L', 'forearm.L', 'hand.L',
    'upper_arm.R', 'forearm.R', 'hand.R',
    'thigh.L', 'shin.L', 'foot.L',
    'thigh.R', 'shin.R', 'foot.R',
}


def curve_collections(action):
    for layer in action.layers:
        for strip in layer.strips:
            for bag in strip.channelbags:
                yield bag.fcurves


def repair_temporary_bone_names(rig):
    """Retarget curves left behind by Blender's temporary rename suffixes."""
    remap = {'forearm.L2': 'forearm.L', 'shin.L2': 'shin.L'}
    for action in bpy.data.actions:
        for curves in curve_collections(action):
            snapshot = list(curves)
            for curve in snapshot:
                match = re.search(r'pose\.bones\["([^"]+)"\]', curve.data_path)
                if not match or match.group(1) in rig.pose.bones:
                    continue
                target = remap.get(match.group(1))
                if not target or target not in rig.pose.bones:
                    raise RuntimeError(f'{action.name}: missing bone {match.group(1)}')
                path = curve.data_path.replace(
                    f'pose.bones["{match.group(1)}"]', f'pose.bones["{target}"]')
                duplicate = next((other for other in snapshot if other != curve and
                                  other.data_path == path and
                                  other.array_index == curve.array_index), None)
                if duplicate:
                    curves.remove(curve)
                else:
                    curve.data_path = path


def prepare_soldier():
    rig = bpy.data.objects.get(RIG_NAME)
    if not rig or rig.type != 'ARMATURE':
        raise RuntimeError(f'{RIG_NAME} armature is required')
    legacy = bpy.data.actions.get('idle_passive_rifle')
    if legacy and not bpy.data.actions.get('idle_passive'):
        legacy.name = 'idle_passive'
    cube_action = bpy.data.actions.get('CubeAction')
    if cube_action:
        bpy.data.actions.remove(cube_action)
    repair_temporary_bone_names(rig)
    missing = sorted(REQUIRED_ACTIONS - {action.name for action in bpy.data.actions})
    if missing:
        raise RuntimeError('Missing actions: ' + ', '.join(missing))
    missing_bones = sorted(REQUIRED_BONES - set(rig.pose.bones.keys()))
    if missing_bones:
        raise RuntimeError('Missing or incorrectly named bones: ' +
                           ', '.join(missing_bones))

    # Handheld models live only in soldier-weapons.blend/glb. Empty role nodes
    # preserve the existing role-equipment visibility contract.
    for role in WEAPON_ROLES:
        name = f'Gear_{role}'
        old = bpy.data.objects.get(name)
        if old:
            bpy.data.objects.remove(old, do_unlink=True)
        marker = bpy.data.objects.new(name, None)
        marker.empty_display_type = 'PLAIN_AXES'
        marker.empty_display_size = .08
        marker.parent = rig
        bpy.context.scene.collection.objects.link(marker)

    for action in bpy.data.actions:
        action.use_fake_user = True
    if rig.animation_data:
        rig.animation_data.action = None
    bpy.context.scene.frame_set(1)
    bpy.ops.wm.save_as_mainfile(filepath=SOLDIER_BLEND, compress=True)
    bpy.ops.export_scene.gltf(
        filepath=SOLDIER_GLB, export_format='GLB', export_animations=True,
        export_force_sampling=True, export_skins=True, export_morph=False)


def mat(name, color, metallic=0.0):
    value = bpy.data.materials.new(name)
    value.diffuse_color = (*color, 1)
    value.metallic = metallic
    value.roughness = .68 if metallic else .84
    return value


def box(name, location, size, material, rotation=(0, 0, 0), bevel=.008):
    bpy.ops.mesh.primitive_cube_add(location=location, rotation=rotation)
    obj = bpy.context.object
    obj.name = name
    obj.scale = tuple(v / 2 for v in size)
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    obj.data.materials.append(material)
    if bevel:
        modifier = obj.modifiers.new('Edge bevel', 'BEVEL')
        modifier.width = bevel
        modifier.segments = 1
        bpy.context.view_layer.objects.active = obj
        bpy.ops.object.modifier_apply(modifier=modifier.name)
    return obj


def tube(name, location, radius, length, material):
    bpy.ops.mesh.primitive_cylinder_add(
        vertices=8, radius=radius, depth=length, location=location,
        rotation=(math.pi / 2, 0, 0))
    obj = bpy.context.object
    obj.name = name
    obj.data.materials.append(material)
    return obj


def join(name, parts):
    bpy.ops.object.select_all(action='DESELECT')
    for part in parts:
        part.select_set(True)
    bpy.context.view_layer.objects.active = parts[0]
    bpy.ops.object.join()
    weapon = bpy.context.object
    weapon.name = name
    bpy.context.scene.cursor.location = (0, 0, 0)
    bpy.ops.object.origin_set(type='ORIGIN_CURSOR')
    weapon['weapon_role'] = name.removeprefix('Weapon_')


def build_weapons():
    bpy.ops.wm.read_factory_settings(use_empty=True)
    metal = mat('Weapon metal', (.115, .13, .12), .32)
    polymer = mat('Weapon polymer', (.055, .07, .06))
    olive = mat('Launcher olive', (.24, .28, .16))
    optic = mat('Optic glass', (.06, .18, .18), .15)

    # Compact angular service rifle, using the supplied AssaultRifle2 family as
    # the style reference while keeping a small in-game vertex budget.
    join('Weapon_RIFLE', [
        box('Rifle stock', (0, -.34, 0), (.13, .30, .14), polymer),
        box('Rifle receiver', (0, -.08, .005), (.13, .28, .13), metal),
        box('Rifle handguard', (0, .19, .01), (.10, .30, .10), polymer),
        tube('Rifle barrel', (0, .43, .01), .024, .30, metal),
        box('Rifle grip', (0, -.08, -.12), (.075, .11, .20), polymer,
            (math.radians(-12), 0, 0)),
        box('Rifle magazine', (0, .035, -.14), (.08, .13, .22), metal,
            (math.radians(-8), 0, 0)),
        box('Rifle optic', (0, -.02, .105), (.065, .12, .065), optic),
        box('Rifle muzzle', (0, .60, .01), (.05, .08, .05), metal),
    ])
    join('Weapon_MG', [
        box('MG stock', (0, -.38, 0), (.15, .30, .16), polymer),
        box('MG receiver', (0, -.08, .01), (.16, .34, .16), metal),
        box('MG handguard', (0, .22, .015), (.12, .30, .12), polymer),
        tube('MG barrel', (0, .52, .015), .03, .42, metal),
        box('MG grip', (0, -.09, -.14), (.08, .11, .22), polymer,
            (math.radians(-12), 0, 0)),
        tube('MG drum', (.105, .01, -.12), .12, .08, polymer),
        box('MG bipod L', (.075, .45, -.16), (.025, .06, .34), metal,
            (0, math.radians(-18), 0)),
        box('MG bipod R', (-.075, .45, -.16), (.025, .06, .34), metal,
            (0, math.radians(18), 0)),
    ])
    join('Weapon_AT', [
        tube('AT tube', (0, .02, .02), .085, 1.10, olive),
        tube('AT muzzle', (0, .59, .02), .105, .08, metal),
        tube('AT rear', (0, -.55, .02), .11, .10, metal),
        box('AT grip', (0, -.08, -.13), (.07, .12, .22), polymer),
        box('AT sight', (.105, .08, .10), (.09, .16, .10), optic),
    ])
    join('Weapon_AA_TEAM', [
        tube('AA tube', (0, .04, .02), .09, 1.25, olive),
        tube('AA muzzle', (0, .69, .02), .11, .10, metal),
        tube('AA rear', (0, -.60, .02), .12, .12, metal),
        box('AA grip', (0, -.02, -.14), (.08, .14, .24), polymer),
        box('AA sight', (.12, .13, .11), (.10, .20, .12), optic),
        box('AA battery', (0, -.32, -.12), (.15, .18, .16), polymer),
    ])
    bpy.ops.wm.save_as_mainfile(filepath=WEAPONS_BLEND, compress=True)
    bpy.ops.export_scene.gltf(
        filepath=WEAPONS_GLB, export_format='GLB', export_animations=False,
        export_morph=False)


prepare_soldier()
build_weapons()
print(f'Exported {SOLDIER_GLB}')
print(f'Created {WEAPONS_BLEND}')
print(f'Exported {WEAPONS_GLB}')
