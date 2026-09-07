"""Export the hand-authored soldier and build its separate weapon library.

Run with Blender 4.5 LTS:
  blender --background assets/blender/soldier.blend --python tools/blender/build_soldier.py
"""
import math
import os
import re
import bpy
import mathutils

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


def tube_x(name, location, radius, length, material, radius2=None, vertices=8):
    bpy.ops.mesh.primitive_cone_add(
        vertices=vertices, radius1=radius, radius2=radius if radius2 is None else radius2,
        depth=length, location=location, rotation=(0, math.pi / 2, 0))
    obj = bpy.context.object
    obj.name = name
    obj.data.materials.append(material)
    return obj


def beam(name, start, end, width, material):
    start, end = mathutils.Vector(start), mathutils.Vector(end)
    middle = (start + end) / 2
    direction = end - start
    bpy.ops.mesh.primitive_cylinder_add(vertices=6, radius=width, depth=direction.length,
                                        location=middle)
    obj = bpy.context.object
    obj.name = name
    obj.rotation_mode = 'QUATERNION'
    obj.rotation_quaternion = direction.to_track_quat('Z', 'Y')
    obj.data.materials.append(material)
    return obj


def add_rail(parts, prefix, x0, x1, y, z, material, teeth=12):
    parts.append(box(f'{prefix} rail bed', ((x0 + x1) / 2, y, z - .012),
                     (x1 - x0, .055, .025), material, bevel=.004))
    step = (x1 - x0) / teeth
    for index in range(teeth):
        parts.append(box(f'{prefix} tooth {index:02}',
                         (x0 + step * (index + .5), y, z + .006),
                         (step * .58, .062, .035), material, bevel=.003))


def add_trigger_guard(parts, prefix, x, z, material):
    parts.extend([
        box(f'{prefix} trigger front', (x + .055, 0, z), (.018, .032, .105), material,
            (0, -.36, 0), bevel=.003),
        box(f'{prefix} trigger rear', (x - .055, 0, z), (.018, .032, .105), material,
            (0, .36, 0), bevel=.003),
        box(f'{prefix} trigger base', (x, 0, z - .045), (.12, .032, .018), material,
            bevel=.003),
        box(f'{prefix} trigger', (x + .015, 0, z + .005), (.012, .018, .06), material,
            (0, -.25, 0), bevel=.002),
    ])


def add_curved_magazine(parts, prefix, x, material, trim):
    segments = [
        (x + .018, -.055, .105, .155, -.08),
        (x + .002, -.155, .095, .145, -.15),
        (x - .028, -.245, .082, .125, -.23),
    ]
    for index, (px, pz, width, height, angle) in enumerate(segments):
        parts.append(box(f'{prefix} magazine {index}', (px, 0, pz),
                         (width, .075, height), material, (0, angle, 0), bevel=.008))
    parts.append(box(f'{prefix} magazine floor', (x - .05, 0, -.31),
                     (.105, .086, .03), trim, (0, -.2, 0), bevel=.006))


def add_frame_stock(parts, prefix, rear_x, z, material, trim):
    parts.extend([
        tube_x(f'{prefix} buffer', ((rear_x + .03) / 2, 0, z), .025,
               abs(.03 - rear_x), trim, vertices=8),
        beam(f'{prefix} stock top', (rear_x, 0, z + .02), (-.12, 0, z + .055),
             .027, material),
        beam(f'{prefix} stock lower', (rear_x, 0, z - .13), (-.12, 0, z + .015),
             .025, material),
        box(f'{prefix} butt', (rear_x - .015, 0, z - .045),
            (.055, .105, .24), trim, (0, -.05, 0), bevel=.012),
        box(f'{prefix} cheek', ((rear_x - .12) / 2, 0, z + .06),
            (abs(rear_x + .12), .09, .065), material, bevel=.008),
    ])


def join(name, parts):
    bpy.ops.object.select_all(action='DESELECT')
    for part in parts:
        part.select_set(True)
    bpy.context.view_layer.objects.active = parts[0]
    bpy.ops.object.join()
    weapon = bpy.context.object
    weapon.name = name
    bpy.ops.object.transform_apply(location=False, rotation=True, scale=True)
    bpy.context.scene.cursor.location = (0, 0, 0)
    bpy.ops.object.origin_set(type='ORIGIN_CURSOR')
    weapon['weapon_role'] = name.removeprefix('Weapon_')
    return weapon


def fit_weapon(weapon, target_length):
    """Set physical length while retaining the references' thin side profile."""
    x_values = [vertex.co.x for vertex in weapon.data.vertices]
    scale = target_length / (max(x_values) - min(x_values))
    weapon.scale = (scale, scale * .70, scale)
    bpy.context.view_layer.objects.active = weapon
    weapon.select_set(True)
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)


def orient_for_rig(weapon, forward_offset, up_offset=-.10):
    """Convert reference +X-forward geometry to the armature's +Y-forward datum."""
    weapon.rotation_euler.z = math.pi / 2
    bpy.context.view_layer.objects.active = weapon
    weapon.select_set(True)
    bpy.ops.object.transform_apply(location=False, rotation=True, scale=False)
    offset = mathutils.Vector((0, forward_offset, up_offset))
    for vertex in weapon.data.vertices:
        vertex.co += offset


def build_weapons():
    bpy.ops.wm.read_factory_settings(use_empty=True)
    main = mat('Main military polymer', (.12, .15, .105))
    main_dark = mat('Main dark', (.035, .045, .04))
    main_light = mat('Main edge', (.25, .285, .20))
    metal = mat('Dark metal', (.07, .08, .075), .38)
    steel = mat('Steel edges', (.18, .20, .19), .55)
    rubber = mat('Rubber', (.018, .022, .02))
    lens = mat('Desaturated lens', (.055, .16, .145), .18)

    rifle = []
    add_frame_stock(rifle, 'Rifle', -.54, .13, main, rubber)
    rifle.extend([
        box('Rifle lower receiver', (.055, 0, .075), (.37, .105, .19), main_dark,
            bevel=.012),
        box('Rifle upper receiver', (.08, 0, .19), (.43, .098, .085), metal,
            bevel=.009),
        box('Rifle receiver edge L', (.055, .058, .145), (.32, .012, .045),
            main_light, bevel=.003),
        box('Rifle receiver edge R', (.055, -.058, .145), (.32, .012, .045),
            main_light, bevel=.003),
        box('Rifle pistol grip', (-.035, 0, -.075), (.09, .09, .24), rubber,
            (0, .24, 0), bevel=.012),
        box('Rifle handguard core', (.43, 0, .175), (.34, .105, .13), main,
            bevel=.01),
        tube_x('Rifle barrel', (.76, 0, .17), .022, .36, metal, vertices=8),
        tube_x('Rifle gas block', (.61, 0, .17), .04, .06, steel, vertices=8),
        tube_x('Rifle muzzle body', (.955, 0, .17), .035, .11, steel, vertices=8),
        tube_x('Rifle muzzle tip', (1.025, 0, .17), .027, .05, metal, vertices=8),
        box('Rifle front sight L', (.61, .025, .245), (.024, .02, .14), metal,
            (0, -.18, 0), bevel=.003),
        box('Rifle front sight R', (.61, -.025, .245), (.024, .02, .14), metal,
            (0, -.18, 0), bevel=.003),
        box('Rifle front sight cap', (.61, 0, .305), (.045, .07, .025), metal,
            bevel=.003),
        box('Rifle rear sight', (-.07, 0, .275), (.055, .075, .065), metal,
            bevel=.006),
    ])
    add_trigger_guard(rifle, 'Rifle', .07, -.005, metal)
    add_curved_magazine(rifle, 'Rifle', .13, main_dark, steel)
    add_rail(rifle, 'Rifle receiver', -.1, .27, 0, .257, steel, 7)
    add_rail(rifle, 'Rifle handguard', .29, .58, 0, .262, metal, 6)
    for index in range(4):
        x = .31 + index * .043
        rifle.extend([
            box(f'Rifle handguard rib L {index}', (x, .061, .175),
                (.018, .018, .125), main_light, bevel=.002),
            box(f'Rifle handguard rib R {index}', (x, -.061, .175),
                (.018, .018, .125), main_light, bevel=.002),
        ])
    rifle_object = join('Weapon_RIFLE', rifle)
    fit_weapon(rifle_object, 1.05)
    orient_for_rig(rifle_object, -.165)

    mg = []
    add_frame_stock(mg, 'MG', -.62, .16, main, rubber)
    mg.extend([
        box('MG lower receiver', (.02, 0, .08), (.43, .13, .22), main_dark,
            bevel=.014),
        box('MG feed cover', (.08, 0, .225), (.48, .14, .09), metal,
            bevel=.012),
        box('MG cover edge L', (.08, .078, .225), (.39, .016, .045), steel,
            bevel=.003),
        box('MG cover edge R', (.08, -.078, .225), (.39, .016, .045), steel,
            bevel=.003),
        box('MG pistol grip', (-.055, 0, -.085), (.095, .095, .25), rubber,
            (0, .24, 0), bevel=.012),
        box('MG vented handguard', (.45, 0, .175), (.38, .135, .15), main,
            bevel=.012),
        tube_x('MG heavy barrel', (.80, 0, .18), .031, .40, metal, vertices=8),
        tube_x('MG barrel collar', (.64, 0, .18), .052, .075, steel, vertices=8),
        tube_x('MG flash hider', (1.025, 0, .18), .043, .11, steel,
               radius2=.03, vertices=8),
        box('MG belt box', (.08, -.115, -.075), (.25, .16, .25), main,
            (0, -.05, 0), bevel=.018),
        box('MG belt box lid', (.08, -.115, .058), (.27, .17, .035), main_light,
            bevel=.006),
        beam('MG carry front', (.15, 0, .27), (.24, 0, .40), .018, steel),
        beam('MG carry top', (.24, 0, .40), (-.02, 0, .40), .018, steel),
        beam('MG carry rear', (-.02, 0, .40), (-.08, 0, .28), .018, steel),
        beam('MG bipod L', (.66, .045, .15), (.60, .22, -.28), .018, steel),
        beam('MG bipod R', (.66, -.045, .15), (.60, -.22, -.28), .018, steel),
        box('MG bipod foot L', (.585, .22, -.29), (.11, .045, .025), rubber,
            bevel=.004),
        box('MG bipod foot R', (.585, -.22, -.29), (.11, .045, .025), rubber,
            bevel=.004),
    ])
    add_trigger_guard(mg, 'MG', .045, -.015, metal)
    add_rail(mg, 'MG', -.12, .32, 0, .30, steel, 12)
    for index in range(8):
        x = .29 + index * .046
        mg.extend([
            box(f'MG vent L {index}', (x, .073, .175), (.026, .014, .065),
                main_dark, (0, .18, 0), bevel=.002),
            box(f'MG vent R {index}', (x, -.073, .175), (.026, .014, .065),
                main_dark, (0, .18, 0), bevel=.002),
        ])
    mg_object = join('Weapon_MG', mg)
    fit_weapon(mg_object, 1.20)
    orient_for_rig(mg_object, -.15)

    at = [
        tube_x('AT rear venturi', (-.46, 0, .16), .12, .18, metal,
               radius2=.095, vertices=10),
        tube_x('AT rear collar', (-.32, 0, .16), .105, .10, steel, vertices=10),
        tube_x('AT main tube', (.12, 0, .16), .082, .82, main, vertices=10),
        tube_x('AT forward shroud', (.58, 0, .16), .105, .20, main_dark,
               radius2=.13, vertices=10),
        tube_x('AT muzzle ring', (.72, 0, .16), .14, .09, steel, vertices=10),
        box('AT shoulder pad', (-.22, 0, .035), (.22, .16, .13), rubber,
            (0, -.08, 0), bevel=.018),
        box('AT pistol grip', (-.02, 0, -.045), (.09, .09, .22), rubber,
            (0, .22, 0), bevel=.012),
        box('AT sight housing', (.16, -.115, .275), (.25, .11, .18), main_dark,
            bevel=.015),
        box('AT sight lens', (.19, -.174, .29), (.075, .012, .065), lens,
            bevel=.004),
        box('AT control panel', (-.06, -.105, .18), (.16, .07, .12), main_light,
            bevel=.008),
        box('AT front sling mount', (.49, 0, .03), (.025, .11, .13), steel,
            bevel=.004),
    ]
    add_trigger_guard(at, 'AT', .07, .0, metal)
    add_rail(at, 'AT', -.13, .40, 0, .266, steel, 13)
    for index in range(7):
        x = .29 + index * .05
        at.append(box(f'AT shroud rib {index}', (x, 0, .16),
                      (.018, .19, .19), main_light, bevel=.003))
    at_object = join('Weapon_AT', at)
    fit_weapon(at_object, 1.10)
    orient_for_rig(at_object, -.18)

    aa = [
        tube_x('AA rear battery', (-.47, 0, .16), .13, .24, main_dark,
               radius2=.105, vertices=10),
        tube_x('AA rear collar', (-.30, 0, .16), .12, .10, steel, vertices=10),
        tube_x('AA main tube', (.12, 0, .16), .09, .78, main, vertices=10),
        tube_x('AA seeker neck', (.56, 0, .16), .11, .16, metal,
               radius2=.14, vertices=10),
        tube_x('AA seeker head', (.72, 0, .16), .16, .20, main_dark,
               radius2=.095, vertices=10),
        tube_x('AA nose cap', (.85, 0, .16), .10, .08, steel,
               radius2=.055, vertices=10),
        box('AA shoulder rest', (-.17, 0, .025), (.30, .17, .14), rubber,
            (0, -.06, 0), bevel=.018),
        box('AA pistol grip', (-.015, 0, -.05), (.095, .095, .23), rubber,
            (0, .22, 0), bevel=.012),
        box('AA battery housing', (-.35, -.12, .0), (.26, .16, .22), main_dark,
            bevel=.018),
        box('AA battery edge', (-.35, -.205, .0), (.20, .02, .15), main_light,
            bevel=.004),
        box('AA folding sight arm', (.18, -.13, .27), (.035, .04, .24), steel,
            (0, -.42, 0), bevel=.004),
        box('AA sight housing', (.23, -.14, .36), (.18, .11, .13), main_dark,
            bevel=.012),
        box('AA sight lens', (.26, -.201, .37), (.065, .012, .055), lens,
            bevel=.003),
        box('AA control pad', (-.03, -.12, .17), (.16, .08, .12), main_light,
            bevel=.008),
    ]
    add_trigger_guard(aa, 'AA', .055, -.005, metal)
    add_rail(aa, 'AA', -.10, .35, 0, .27, steel, 11)
    for index in range(6):
        x = .27 + index * .052
        aa.extend([
            box(f'AA tube band top {index}', (x, 0, .253), (.017, .12, .025),
                main_light, bevel=.003),
            box(f'AA tube band bottom {index}', (x, 0, .067), (.017, .12, .025),
                main_light, bevel=.003),
        ])
    aa_object = join('Weapon_AA_TEAM', aa)
    fit_weapon(aa_object, 1.25)
    orient_for_rig(aa_object, -.185)
    bpy.ops.wm.save_as_mainfile(filepath=WEAPONS_BLEND, compress=True)
    bpy.ops.export_scene.gltf(
        filepath=WEAPONS_GLB, export_format='GLB', export_animations=False,
        export_morph=False)


prepare_soldier()
build_weapons()
print(f'Exported {SOLDIER_GLB}')
print(f'Created {WEAPONS_BLEND}')
print(f'Exported {WEAPONS_GLB}')
