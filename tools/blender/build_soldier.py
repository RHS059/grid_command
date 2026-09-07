import bpy
import math
import os
from mathutils import Vector

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..'))
BLEND_PATH = os.path.join(ROOT, 'assets', 'blender', 'soldier.blend')
GLB_PATH = os.path.join(ROOT, 'public', 'models', 'soldier.glb')

bpy.ops.wm.read_factory_settings(use_empty=True)
for path in (os.path.dirname(BLEND_PATH), os.path.dirname(GLB_PATH)):
    os.makedirs(path, exist_ok=True)


def material(name, color, metallic=0.0, roughness=0.82):
    mat = bpy.data.materials.new(name)
    mat.diffuse_color = (*color, 1.0)
    mat.metallic = metallic
    mat.roughness = roughness
    return mat


MATS = {
    'cloth': material('Cloth military green', (0.24, 0.29, 0.18)),
    'cloth_dark': material('Cloth shadow green', (0.12, 0.16, 0.10)),
    'armor': material('Armor charcoal', (0.08, 0.10, 0.08)),
    'skin': material('Skin', (0.48, 0.34, 0.24)),
    'boot': material('Boot rubber', (0.035, 0.045, 0.04)),
    'metal': material('Weapon steel', (0.07, 0.085, 0.08), 0.35, 0.55),
    'team': material('Team marking', (0.09, 0.42, 0.72)),
}


def create_armature():
    arm_data = bpy.data.armatures.new('GC_Soldier_Rig')
    arm = bpy.data.objects.new('GC_Soldier_Rig', arm_data)
    bpy.context.collection.objects.link(arm)
    arm.show_in_front = True
    bpy.context.view_layer.objects.active = arm
    arm.select_set(True)
    bpy.ops.object.mode_set(mode='EDIT')

    def bone(name, head, tail, parent=None):
        b = arm_data.edit_bones.new(name)
        b.head, b.tail = head, tail
        if parent:
            b.parent = arm_data.edit_bones[parent]
        return b

    bone('root', (0, 0, 0), (0, 0, .2))
    bone('pelvis', (0, 0, .82), (0, 0, 1.02), 'root')
    bone('spine', (0, 0, .98), (0, 0, 1.43), 'pelvis')
    bone('head', (0, 0, 1.42), (0, 0, 1.76), 'spine')
    for side, sign in [('L', 1), ('R', -1)]:
        bone(f'upper_arm.{side}', (sign*.26, 0, 1.36), (sign*.31, 0, 1.08), 'spine')
        bone(f'forearm.{side}', (sign*.31, 0, 1.08), (sign*.31, .02, .82), f'upper_arm.{side}')
        bone(f'hand.{side}', (sign*.31, .02, .82), (sign*.31, .08, .70), f'forearm.{side}')
        bone(f'thigh.{side}', (sign*.13, 0, .90), (sign*.13, 0, .52), 'pelvis')
        bone(f'shin.{side}', (sign*.13, 0, .52), (sign*.13, 0, .16), f'thigh.{side}')
        bone(f'foot.{side}', (sign*.13, 0, .16), (sign*.13, .22, .075), f'shin.{side}')
    bpy.ops.object.mode_set(mode='OBJECT')
    arm.select_set(False)
    return arm


ARMATURE = create_armature()


def assign(obj, mat_key, bone):
    obj.data.materials.append(MATS[mat_key])
    group = obj.vertex_groups.new(name=bone)
    group.add(range(len(obj.data.vertices)), 1.0, 'REPLACE')
    obj['gc_bone'] = bone
    return obj


def box(name, location, scale, mat_key, bone, bevel=.015, rotation=(0, 0, 0)):
    bpy.ops.mesh.primitive_cube_add(location=location, rotation=rotation)
    obj = bpy.context.object
    obj.name = name
    obj.scale = (scale[0]/2, scale[1]/2, scale[2]/2)
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    if bevel:
        mod = obj.modifiers.new('Low-poly bevel', 'BEVEL')
        mod.width = bevel
        mod.segments = 1
        bpy.context.view_layer.objects.active = obj
        bpy.ops.object.modifier_apply(modifier=mod.name)
    return assign(obj, mat_key, bone)


def ico(name, location, scale, mat_key, bone):
    bpy.ops.mesh.primitive_ico_sphere_add(subdivisions=2, radius=1, location=location)
    obj = bpy.context.object
    obj.name = name
    obj.scale = scale
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    return assign(obj, mat_key, bone)


BASE = []
BASE += [box('Pelvis', (0, 0, .91), (.34, .23, .22), 'cloth_dark', 'pelvis')]
BASE += [box('Torso', (0, 0, 1.20), (.48, .27, .46), 'cloth', 'spine', .025)]
BASE += [box('Vest front', (0, .155, 1.22), (.42, .075, .34), 'armor', 'spine', .018)]
BASE += [box('Vest back', (0, -.16, 1.22), (.40, .07, .32), 'armor', 'spine', .018)]
BASE += [box('Team patch', (.205, .195, 1.35), (.055, .012, .08), 'team', 'spine', .004)]
BASE += [ico('Head', (0, .015, 1.58), (.15, .135, .18), 'skin', 'head')]
BASE += [ico('Helmet', (0, -.005, 1.68), (.19, .17, .13), 'cloth_dark', 'head')]
BASE += [box('Helmet brim', (0, .12, 1.64), (.37, .12, .035), 'armor', 'head', .008)]
BASE += [box('Goggles', (0, .15, 1.60), (.25, .035, .07), 'armor', 'head', .006)]

for side, sign in [('L', 1), ('R', -1)]:
    BASE += [box(f'Upper arm {side}', (sign*.285, 0, 1.22), (.17, .18, .31), 'cloth', f'upper_arm.{side}', .025, (0, sign*.10, 0))]
    BASE += [box(f'Forearm {side}', (sign*.31, .01, .95), (.14, .15, .28), 'cloth_dark', f'forearm.{side}', .02)]
    BASE += [box(f'Hand {side}', (sign*.31, .04, .78), (.13, .13, .13), 'skin', f'hand.{side}', .025)]
    thumb_x = sign*.385
    BASE += [box(f'Thumb {side}', (thumb_x, .09, .76), (.035, .09, .035), 'skin', f'hand.{side}', .01, (sign*.25, 0, 0))]
    for finger in range(4):
        BASE += [box(f'Finger {side} {finger+1}', (sign*(.265 + finger*.028), .125, .73), (.022, .13, .026), 'skin', f'hand.{side}', .006)]
    BASE += [box(f'Thigh {side}', (sign*.13, 0, .70), (.20, .22, .40), 'cloth', f'thigh.{side}', .03)]
    BASE += [box(f'Knee pad {side}', (sign*.13, .13, .50), (.17, .06, .16), 'armor', f'shin.{side}', .018)]
    BASE += [box(f'Shin {side}', (sign*.13, 0, .34), (.16, .18, .36), 'cloth_dark', f'shin.{side}', .025)]
    BASE += [box(f'Boot {side}', (sign*.13, .07, .12), (.18, .34, .17), 'boot', f'foot.{side}', .025)]
    BASE += [box(f'Sole {side}', (sign*.13, .09, .045), (.19, .36, .045), 'armor', f'foot.{side}', .008)]


def join_skinned(objects, name):
    bpy.ops.object.select_all(action='DESELECT')
    for obj in objects:
        obj.select_set(True)
    bpy.context.view_layer.objects.active = objects[0]
    bpy.ops.object.join()
    obj = bpy.context.object
    obj.name = name
    modifier = obj.modifiers.new('GC armature', 'ARMATURE')
    modifier.object = ARMATURE
    obj.parent = ARMATURE
    return obj


BODY = join_skinned(BASE, 'GC_Soldier_Body')


def make_gear(name, role, parts):
    obj = join_skinned(parts, name)
    obj['gc_role'] = role
    return obj


GEAR = []
GEAR.append(make_gear('Gear_RIFLE', 'RIFLE', [
    box('Rifle receiver', (0, .31, 1.08), (.10, .55, .10), 'metal', 'spine', .01),
    box('Rifle barrel', (0, .62, 1.09), (.045, .38, .045), 'metal', 'spine', .006),
    box('Rifle stock', (0, .02, 1.06), (.10, .24, .13), 'armor', 'spine', .012),
]))
GEAR.append(make_gear('Gear_MG', 'MG', [
    box('MG receiver', (0, .32, 1.08), (.14, .58, .14), 'metal', 'spine', .012),
    box('MG barrel', (0, .70, 1.09), (.055, .48, .055), 'metal', 'spine', .006),
    box('Ammo box', (.15, .27, 1.0), (.18, .18, .22), 'cloth_dark', 'spine', .015),
]))
GEAR.append(make_gear('Gear_AT', 'AT', [box('AT launcher', (.05, .08, 1.36), (.16, .95, .16), 'armor', 'spine', .025, (math.radians(72), 0, 0))]))
GEAR.append(make_gear('Gear_MORTAR', 'MORTAR', [box('Mortar pack', (0, -.25, 1.22), (.38, .20, .55), 'armor', 'spine', .02)]))
GEAR.append(make_gear('Gear_ENGINEER', 'ENGINEER', [box('Engineer pack', (0, -.26, 1.18), (.42, .20, .48), 'cloth_dark', 'spine', .02), box('Tool', (.27, -.30, 1.08), (.05, .06, .72), 'metal', 'spine', .008)]))
GEAR.append(make_gear('Gear_MEDIC', 'MEDIC', [box('Medic pack', (0, -.27, 1.20), (.43, .22, .50), 'cloth', 'spine', .025), box('Medic mark H', (0, -.39, 1.23), (.20, .02, .055), 'team', 'spine', .003), box('Medic mark V', (0, -.39, 1.23), (.055, .02, .20), 'team', 'spine', .003)]))
GEAR.append(make_gear('Gear_LOGISTICS', 'LOGISTICS', [box('Supply pack', (0, -.28, 1.17), (.48, .24, .58), 'cloth', 'spine', .025)]))
GEAR.append(make_gear('Gear_SCOUT', 'SCOUT', [box('Scout radio', (.16, -.24, 1.22), (.18, .16, .38), 'armor', 'spine', .015), box('Antenna', (.20, -.25, 1.62), (.018, .018, .55), 'metal', 'spine', .002)]))
GEAR.append(make_gear('Gear_COMMAND', 'COMMAND', [box('Command radio', (0, -.25, 1.20), (.36, .18, .45), 'armor', 'spine', .02), box('Antenna', (.14, -.25, 1.62), (.018, .018, .65), 'metal', 'spine', .002)]))
GEAR.append(make_gear('Gear_AA_TEAM', 'AA_TEAM', [box('AA launcher', (.04, .02, 1.36), (.18, 1.10, .18), 'armor', 'spine', .025, (math.radians(72), 0, 0))]))
GEAR.append(make_gear('Gear_PILOT', 'PILOT', [box('Pilot visor', (0, .16, 1.60), (.27, .035, .08), 'metal', 'head', .006)]))


def pose_defaults():
    for bone in ARMATURE.pose.bones:
        bone.rotation_mode = 'XYZ'
        bone.rotation_euler = (0, 0, 0)
        bone.location = (0, 0, 0)


def key(bone, frame, rot=None, loc=None):
    p = ARMATURE.pose.bones[bone]
    if rot is not None:
        p.rotation_euler = tuple(math.radians(v) for v in rot)
        p.keyframe_insert('rotation_euler', frame=frame, group=bone)
    if loc is not None:
        p.location = loc
        p.keyframe_insert('location', frame=frame, group=bone)


def action(name, frames, setup):
    pose_defaults()
    act = bpy.data.actions.new(name)
    act.use_fake_user = True
    ARMATURE.animation_data_create()
    ARMATURE.animation_data.action = act
    setup(frames)
    act.frame_range = frames
    act['gc_loop'] = name not in {'downed', 'dead', 'throw'}
    return act


def idle(_):
    for frame, sway in [(1, -1.5), (20, 1.5), (40, -1.5)]:
        key('spine', frame, (-3, 0, sway))
        key('upper_arm.L', frame, (-52, 7, -20)); key('forearm.L', frame, (-48, 0, 9))
        key('upper_arm.R', frame, (-48, -6, 18)); key('forearm.R', frame, (-64, 0, -7))
action('idle', (1, 40), idle)


def walk(_):
    for frame, direction in [(1, 1), (10, -1), (20, 1), (30, -1), (40, 1)]:
        key('thigh.L', frame, (30*direction, 0, 0)); key('thigh.R', frame, (-30*direction, 0, 0))
        key('shin.L', frame, (-32*max(direction, 0), 0, 0)); key('shin.R', frame, (-32*max(-direction, 0), 0, 0))
        key('upper_arm.L', frame, (-18*direction, 0, 0)); key('upper_arm.R', frame, (18*direction, 0, 0))
        key('root', frame, loc=(0, 0, .018 if frame in (10, 30) else 0))
action('walk', (1, 40), walk)


def rifle_pose(frame, recoil=0):
    key('upper_arm.L', frame, (-67, 8, -24)); key('forearm.L', frame, (-54, 0, 10)); key('hand.L', frame, (-10, 0, 0))
    key('upper_arm.R', frame, (-59-recoil, -6, 20)); key('forearm.R', frame, (-72, 0, -8)); key('spine', frame, (-5, 0, 0))
def fire(_):
    rifle_pose(1, 0); rifle_pose(5, 8); rifle_pose(9, 0); rifle_pose(15, 7); rifle_pose(20, 0)
action('fire', (1, 20), fire)


def cover(_):
    for frame in (1, 30):
        key('pelvis', frame, (0, 0, 0), (0, 0, -.24)); key('thigh.L', frame, (52, 0, 0)); key('thigh.R', frame, (52, 0, 0)); key('shin.L', frame, (-85, 0, 0)); key('shin.R', frame, (-85, 0, 0)); rifle_pose(frame)
action('cover', (1, 30), cover)


def peek(_):
    for frame, lean in [(1, -8), (15, 14), (30, -8)]:
        rifle_pose(frame); key('spine', frame, (-4, lean, lean*.35)); key('head', frame, (0, -lean*.35, 0))
action('peek', (1, 30), peek)


def throw(_):
    for frame, arm in [(1, 35), (10, 120), (18, -65), (30, 5)]:
        key('upper_arm.R', frame, (arm, -15, 18)); key('forearm.R', frame, (-35 if frame < 18 else -10, 0, 0)); key('spine', frame, (-8, 0, -12 if frame < 18 else 10))
action('throw', (1, 30), throw)


def drag(_):
    for frame, sway in [(1, -5), (15, 5), (30, -5)]:
        key('spine', frame, (28, 0, sway)); key('upper_arm.L', frame, (20, 0, -25)); key('upper_arm.R', frame, (20, 0, 25)); key('forearm.L', frame, (-20, 0, 0)); key('forearm.R', frame, (-20, 0, 0)); key('thigh.L', frame, (12-sway, 0, 0)); key('thigh.R', frame, (12+sway, 0, 0))
action('drag', (1, 30), drag)


def crouch(_):
    for frame in (1, 30):
        key('pelvis', frame, loc=(0, 0, -.28)); key('thigh.L', frame, (58, 0, 0)); key('thigh.R', frame, (58, 0, 0)); key('shin.L', frame, (-92, 0, 0)); key('shin.R', frame, (-92, 0, 0)); key('foot.L', frame, (34, 0, 0)); key('foot.R', frame, (34, 0, 0)); rifle_pose(frame)
action('crouch', (1, 30), crouch)


def prone(_):
    for frame in (1, 30):
        key('root', frame, (82, 0, 0), (0, 0, .22)); rifle_pose(frame); key('thigh.L', frame, (4, 0, 5)); key('thigh.R', frame, (-4, 0, -5))
action('prone', (1, 30), prone)


def casualty(name, side):
    def setup(_):
        key('root', 1, (0, 0, 0)); key('root', 12, (76, side*18, side*12), (0, 0, .18)); key('root', 24, (91, side*8, side*20), (0, 0, .12)); key('upper_arm.L', 24, (15, 0, -35)); key('upper_arm.R', 24, (-20, 0, 42)); key('thigh.L', 24, (20, 0, 8)); key('thigh.R', 24, (-8, 0, -12)); key('shin.L', 24, (-28, 0, 0))
    action(name, (1, 24), setup)
casualty('downed', 1)
casualty('dead', -1)

ARMATURE.animation_data.action = None
pose_defaults()
bpy.context.scene.frame_set(1)
bpy.context.view_layer.update()
for act in bpy.data.actions:
    for curve in act.fcurves:
        for point in curve.keyframe_points:
            point.interpolation = 'LINEAR'

bpy.context.scene.render.engine = 'BLENDER_EEVEE_NEXT'
bpy.context.scene.frame_start = 1
bpy.context.scene.frame_end = 40
bpy.ops.wm.save_as_mainfile(filepath=BLEND_PATH)
bpy.ops.object.select_all(action='SELECT')
bpy.ops.export_scene.gltf(
    filepath=GLB_PATH,
    export_format='GLB',
    export_animations=True,
    export_animation_mode='ACTIONS',
    export_nla_strips=False,
    export_skins=True,
    export_morph=False,
    export_yup=True,
)
print(f'Wrote {BLEND_PATH}')
print(f'Wrote {GLB_PATH}')
