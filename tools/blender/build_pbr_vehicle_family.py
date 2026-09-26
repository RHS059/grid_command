"""Normalize, rigid-rig, animate, render, and export the approved PBR HEMTT/APC family.

Run by opening one of the approved source .blend files and setting sys.argv after ``--``
to one asset id. Outputs are written beneath ``GC_PBR_OUTPUT`` when set, otherwise to
``<repo>/../upload``. All exports preserve Blender-native +Y forward, +Z up coordinates.
"""

from __future__ import annotations

import json
import math
import os
import struct
import sys
from pathlib import Path

import bpy
from mathutils import Matrix, Vector


FPS = 24
HEMTT_AXLES = (3.45, 1.45, -1.60, -3.65)
APC_AXLES = (2.52, 0.84, -0.84, -2.52)
ASSET_IDS = (
    "hemtt_base_pbr", "hemtt_ammo_pbr", "hemtt_fob_pbr", "hemtt_fuel_pbr",
    "hemtt_medical_pbr", "hemtt_repair_pbr", "hemtt_supply_pbr", "hemtt_troop_pbr",
    "apc_base_pbr", "apc_30mm_pbr", "apc_aa_pbr", "apc_mg_pbr", "apc_tankkiller_pbr",
)


def repo_root() -> Path:
    return Path(__file__).resolve().parents[2]


def output_root() -> Path:
    return Path(os.environ.get("GC_PBR_OUTPUT", str(repo_root().parent / "upload"))).resolve()


def argv_asset() -> str:
    args = sys.argv[sys.argv.index("--") + 1 :] if "--" in sys.argv else []
    if not args or args[0] not in ASSET_IDS:
        raise SystemExit(f"Expected one asset id after --; got {args!r}")
    return args[0]


def rs_matrix(scale: float) -> Matrix:
    # Sources are X-long, nose -X. Rz(-90 degrees) maps nose to +Y.
    return Matrix.Rotation(-math.pi / 2, 4, "Z") @ Matrix.Scale(scale, 4)


def transformed_mesh(src: bpy.types.Object, linear: Matrix, name: str) -> bpy.types.Mesh:
    mesh = src.data.copy()
    mesh.name = name
    mesh.transform(linear)
    mesh.update()
    return mesh


def empty(name: str, parent=None, location=(0, 0, 0)):
    obj = bpy.data.objects.new(name, None)
    bpy.context.scene.collection.objects.link(obj)
    obj.empty_display_type = "PLAIN_AXES"
    obj.empty_display_size = 0.18
    obj.location = location
    if parent:
        obj.parent = parent
    return obj


def mesh_object(name: str, mesh, parent, location=(0, 0, 0)):
    obj = bpy.data.objects.new(name, mesh)
    bpy.context.scene.collection.objects.link(obj)
    obj.parent = parent
    obj.location = location
    return obj


def assembly(root, key: str, kind: str, location=(0, 0, 0), parent=None):
    obj = empty(f"Assembly_{key}", parent or root, location)
    obj["rig_kind"] = kind
    obj["rig_pivot"] = [round(float(v), 6) for v in location]
    return obj


def mount(assembly_obj, name: str):
    return empty(f"Mount_{name}_0", assembly_obj)


def source(name: str):
    obj = bpy.data.objects.get(name)
    if obj is None:
        raise RuntimeError(f"Missing source object: {name}")
    return obj


def scene_bounds(objects=None):
    points = []
    for obj in objects or bpy.context.scene.objects:
        if obj.type != "MESH" or obj.hide_render:
            continue
        points.extend(obj.matrix_world @ Vector(corner) for corner in obj.bound_box)
    if not points:
        return Vector((0, 0, 0)), Vector((0, 0, 0))
    return (
        Vector(min(p[i] for p in points) for i in range(3)),
        Vector(max(p[i] for p in points) for i in range(3)),
    )


def ground_assemblies(root):
    bpy.context.view_layer.update()
    mn, _ = scene_bounds()
    for child in root.children:
        child.location.z -= mn.z
    bpy.context.view_layer.update()


def remove_source_objects():
    for obj in list(bpy.data.objects):
        bpy.data.objects.remove(obj, do_unlink=True)


def key(obj, path, frame):
    obj.keyframe_insert(path, frame=frame)


def add_action(obj, clip: str, duration: float, poses):
    obj.animation_data_create()
    obj.animation_data.action = None
    base_loc = obj.location.copy()
    base_rot = obj.rotation_euler.copy()
    for frac, loc_delta, rot_delta in poses:
        obj.location = base_loc + Vector(loc_delta)
        obj.rotation_euler = (
            base_rot.x + rot_delta[0], base_rot.y + rot_delta[1], base_rot.z + rot_delta[2]
        )
        frame = 1 + round(duration * FPS * frac)
        key(obj, "location", frame)
        key(obj, "rotation_euler", frame)
    action = obj.animation_data.action
    action.name = f"{clip}__{obj.name.removeprefix('Assembly_')}"
    action.use_fake_user = True
    for curve in action.fcurves:
        for point in curve.keyframe_points:
            point.interpolation = "LINEAR"
    track = obj.animation_data.nla_tracks.new()
    track.name = clip
    strip = track.strips.new(clip, 1, action)
    strip.extrapolation = "NOTHING"
    track.mute = True
    obj.animation_data.action = None
    obj.location = base_loc
    obj.rotation_euler = base_rot


def build_actions(root, groups, armed: bool, ramp: bool, weapon_style: str | None):
    clips = [
        {"id": "idle", "label": "Rest pose", "duration": 2.0, "loop": True},
        {"id": "drive", "label": "Wheel drive", "duration": 2.0, "loop": True},
        {"id": "steer", "label": "Steering sweep", "duration": 2.0, "loop": True},
    ]
    add_action(root, "idle", 2.0, [(0, (0, 0, 0), (0, 0, 0)), (1, (0, 0, 0), (0, 0, 0))])
    for name, obj in groups.items():
        if name.startswith("wheel_"):
            add_action(obj, "drive", 2.0, [(0, (0, 0, 0), (0, 0, 0)), (1, (0, 0, 0), (-math.tau * 4, 0, 0))])
            if name.endswith("_0") or name.endswith("_1"):
                add_action(obj, "steer", 2.0, [
                    (0, (0, 0, 0), (0, 0, 0.0)),
                    (0.25, (0, 0, 0), (0, 0, 0.42)),
                    (0.75, (0, 0, 0), (0, 0, -0.42)),
                    (1, (0, 0, 0), (0, 0, 0.0)),
                ])
    if ramp:
        clips += [
            {"id": "open", "label": "Open rear ramp", "duration": 2.0, "loop": False},
            {"id": "close", "label": "Close rear ramp", "duration": 2.0, "loop": False},
        ]
        obj = groups["ramp"]
        add_action(obj, "open", 2.0, [(0, (0, 0, 0), (0, 0, 0)), (1, (0, 0, 0), (1.34, 0, 0))])
        add_action(obj, "close", 2.0, [(0, (0, 0, 0), (1.34, 0, 0)), (1, (0, 0, 0), (0, 0, 0))])
    if armed:
        clips += [
            {"id": "aim", "label": "Turret traverse and weapon elevation", "duration": 4.0, "loop": True},
            {"id": "shoot", "label": "Weapon recoil", "duration": 1.2, "loop": False},
        ]
        add_action(groups["turret"], "aim", 4.0, [
            (0, (0, 0, 0), (0, 0, 0)), (0.25, (0, 0, 0), (0, 0, 0.72)),
            (0.75, (0, 0, 0), (0, 0, -0.72)), (1, (0, 0, 0), (0, 0, 0)),
        ])
        elevate = {"aa": -0.62, "tankkiller": -0.28, "30mm": -0.20, "mg": -0.28}.get(weapon_style, -0.2)
        add_action(groups["gun"], "aim", 4.0, [
            (0, (0, 0, 0), (0, 0, 0)), (0.25, (0, 0, 0), (elevate, 0, 0)),
            (0.75, (0, 0, 0), (-elevate * 0.35, 0, 0)), (1, (0, 0, 0), (0, 0, 0)),
        ])
        recoil = 0.26 if weapon_style == "tankkiller" else 0.16
        add_action(groups["gun"], "shoot", 1.2, [
            (0, (0, 0, 0), (0, 0, 0)), (0.1, (0, -recoil, 0), (0, 0, 0)),
            (0.3, (0, 0, 0), (0, 0, 0)), (1, (0, 0, 0), (0, 0, 0)),
        ])
    root["animation_clips"] = [c["id"] for c in clips]
    return clips


def copy_mount_mesh(src, linear, parent, name, local=(0, 0, 0)):
    data = transformed_mesh(src, linear, f"{name}_Mesh")
    return mesh_object(name, data, mount(parent, name), local)


def build_hemtt(asset_id: str):
    suffix = asset_id.removeprefix("hemtt_").removesuffix("_pbr")
    is_base = suffix == "base"
    source_label = {"fob": "FOB"}.get(suffix, suffix.capitalize())
    prefix = "LP_HEMTT_hd" if is_base else f"HEMTT_{source_label}"
    body_src = source(f"{prefix}_body")
    wheel_src = source(f"{prefix}_wheels")
    module_src = None if is_base else source(f"MOD_{suffix}")
    spare_src = bpy.data.objects.get("HEMTT_Repair_spare_wheel") if suffix == "repair" else None
    scale = 10.2 / 2.01800000667572
    linear = rs_matrix(scale)
    body_data = transformed_mesh(body_src, linear, f"{asset_id}_BodyMesh")
    wheel_data = transformed_mesh(wheel_src, linear, f"{asset_id}_CanonicalWheelMesh")
    module_data = transformed_mesh(module_src, linear, f"{asset_id}_ModuleMesh") if module_src else None
    spare_data = None
    if spare_src:
        spare_data = spare_src.data.copy()
        spare_data.name = f"{asset_id}_SpareWheelMesh"
        spare_data.transform(linear @ spare_src.matrix_local)
        spare_data.update()
    source_center = linear @ wheel_src.location
    remove_source_objects()
    root = empty("GC_ASSET")
    root["asset_id"] = asset_id
    root["axis_convention"] = "+Y forward, +Z up"
    root["source_orientation"] = "nose -X, +Z up"
    root["normalization_rotation_z_degrees"] = -90.0
    root["normalization_scale"] = scale
    groups = {}
    hull = assembly(root, "hull", "fixed")
    groups["hull"] = hull
    mesh_object(f"{asset_id}_body", body_data, mount(hull, "hull"))
    if module_data:
        module = assembly(root, "module", "fixed")
        groups["module"] = module
        mesh_object(f"{asset_id}_module", module_data, mount(module, "module"))
    # Source wheel center gives exact transverse position and height after normalization.
    side_x = abs(source_center.x)
    wheel_z = source_center.z
    for side, x in (("L", -side_x), ("R", side_x)):
        for axle, y in enumerate(HEMTT_AXLES):
            key_name = f"wheel_{side}_{axle}"
            wheel = assembly(root, key_name, "wheel", (x, y, wheel_z))
            groups[key_name] = wheel
            wheel_mesh = mesh_object(f"Wheel_{side}_{axle}", wheel_data, mount(wheel, f"wheel_{side}_{axle}"))
            if side == "L":
                wheel_mesh.rotation_euler.z = math.pi
    if spare_data:
        spare = assembly(root, "spare_wheel", "fixed")
        groups["spare_wheel"] = spare
        mesh_object("Spare_Wheel", spare_data, mount(spare, "spare_wheel"))
    ground_assemblies(root)
    rear_mount = assembly(root, "rear_module", "module_mount", (0.0, -1.5, hull.location.z))
    empty("Mount_rear_module", rear_mount)
    groups["rear_module"] = rear_mount
    clips = build_actions(root, groups, armed=False, ramp=False, weapon_style=None)
    return root, groups, clips, scale


def build_apc(asset_id: str):
    variant = asset_id.removeprefix("apc_").removesuffix("_pbr")
    is_base = variant == "base"
    tag = {"base": "APC", "30mm": "APC_30mm", "aa": "APC_AA", "mg": "APC_MG", "tankkiller": "APC_TankKiller"}[variant]
    hull_src = source(f"{tag}_hull")
    wheel_src = source(f"{tag}_wheels")
    ramp_src = source(f"{tag}_ramp")
    ramp_door_src = source(f"{tag}_ramp_door")
    turret_src = None if is_base else source(f"{tag}_turret")
    gun_src = None if is_base else source(f"{tag}_gun")
    scale = 7.8 / 1.4509999752044678
    linear = rs_matrix(scale)
    hull_data = transformed_mesh(hull_src, linear, f"{asset_id}_HullMesh")
    wheel_data = transformed_mesh(wheel_src, linear, f"{asset_id}_CanonicalWheelMesh")
    ramp_data = transformed_mesh(ramp_src, linear, f"{asset_id}_RampMesh")
    ramp_door_data = transformed_mesh(ramp_door_src, linear, f"{asset_id}_RampDoorMesh")
    turret_data = transformed_mesh(turret_src, linear, f"{asset_id}_TurretMesh") if turret_src else None
    gun_data = transformed_mesh(gun_src, linear, f"{asset_id}_GunMesh") if gun_src else None
    wheel_local = linear @ wheel_src.location
    ramp_local = linear @ ramp_src.location
    ramp_door_local = linear @ ramp_door_src.location
    turret_local = linear @ turret_src.location if turret_src else None
    gun_local = linear @ gun_src.location if gun_src else None
    remove_source_objects()
    root = empty("GC_ASSET")
    root["asset_id"] = asset_id
    root["axis_convention"] = "+Y forward, +Z up"
    root["source_orientation"] = "nose -X, +Z up"
    root["normalization_rotation_z_degrees"] = -90.0
    root["normalization_scale"] = scale
    groups = {}
    hull = assembly(root, "hull", "fixed")
    groups["hull"] = hull
    mesh_object(f"{asset_id}_hull", hull_data, mount(hull, "hull"))
    ramp = assembly(root, "ramp", "ramp", ramp_local)
    groups["ramp"] = ramp
    mesh_object(f"{asset_id}_ramp", ramp_data, mount(ramp, "ramp"))
    mesh_object(f"{asset_id}_ramp_door", ramp_door_data, mount(ramp, "ramp_door"), ramp_door_local)
    side_x = abs(wheel_local.x)
    wheel_z = wheel_local.z
    for side, x in (("L", -side_x), ("R", side_x)):
        for axle, y in enumerate(APC_AXLES):
            key_name = f"wheel_{side}_{axle}"
            wheel = assembly(root, key_name, "wheel", (x, y, wheel_z))
            groups[key_name] = wheel
            wheel_mesh = mesh_object(f"Wheel_{side}_{axle}", wheel_data, mount(wheel, f"wheel_{side}_{axle}"))
            if side == "L":
                wheel_mesh.rotation_euler.z = math.pi
    if turret_data:
        turret = assembly(root, "turret", "turret", turret_local)
        groups["turret"] = turret
        mesh_object(f"{asset_id}_turret", turret_data, mount(turret, "turret"))
        gun = assembly(root, "gun", "weapon", gun_local, parent=turret)
        groups["gun"] = gun
        mesh_object(f"{asset_id}_gun", gun_data, mount(gun, "gun"))
    ground_assemblies(root)
    clips = build_actions(root, groups, armed=not is_base, ramp=True, weapon_style=None if is_base else variant)
    return root, groups, clips, scale


def triangle_count():
    depsgraph = bpy.context.evaluated_depsgraph_get()
    total = 0
    for obj in bpy.context.scene.objects:
        if obj.type != "MESH" or obj.hide_render:
            continue
        evaluated = obj.evaluated_get(depsgraph)
        mesh = evaluated.to_mesh()
        total += sum(max(0, len(p.vertices) - 2) for p in mesh.polygons)
        evaluated.to_mesh_clear()
    return total


def material_audit():
    materials = sorted({m.name for o in bpy.context.scene.objects if o.type == "MESH" for m in o.data.materials if m})
    images = []
    for image in bpy.data.images:
        if image.type != "IMAGE":
            continue
        images.append({"name": image.name, "size": list(image.size), "packed": bool(image.packed_file)})
    return materials, sorted(images, key=lambda item: item["name"])


def setup_render():
    scene = bpy.context.scene
    scene.render.engine = "BLENDER_EEVEE_NEXT"
    scene.render.resolution_x = 640
    scene.render.resolution_y = 480
    scene.render.resolution_percentage = 100
    scene.render.image_settings.file_format = "PNG"
    scene.render.film_transparent = False
    if scene.world is None:
        scene.world = bpy.data.worlds.new("ReviewWorld")
    scene.world.color = (0.035, 0.035, 0.035)
    floor_mat = bpy.data.materials.new("ReviewFloor")
    floor_mat.diffuse_color = (0.08, 0.08, 0.08, 1)
    bpy.ops.mesh.primitive_plane_add(size=80, location=(0, 0, -0.01))
    floor = bpy.context.object
    floor.name = "REVIEW_ONLY_Ground"
    floor.data.materials.append(floor_mat)
    bpy.ops.object.light_add(type="AREA", location=(5, 6, 9))
    key_light = bpy.context.object
    key_light.name = "REVIEW_ONLY_Key"
    key_light.data.energy = 1500
    key_light.data.shape = "DISK"
    key_light.data.size = 6
    bpy.ops.object.light_add(type="AREA", location=(-5, 1, 5))
    fill = bpy.context.object
    fill.name = "REVIEW_ONLY_Fill"
    fill.data.energy = 900
    fill.data.size = 5
    bpy.ops.object.camera_add()
    camera = bpy.context.object
    camera.name = "REVIEW_ONLY_Camera"
    camera.data.lens = 55
    scene.camera = camera
    return floor, key_light, fill, camera


def render_views(asset_id: str, review_dir: Path):
    review_dir.mkdir(parents=True, exist_ok=True)
    floor, key_light, fill, camera = setup_render()
    mn, mx = scene_bounds([o for o in bpy.context.scene.objects if not o.name.startswith("REVIEW_ONLY_")])
    center = (mn + mx) * 0.5
    size = max(mx - mn)
    views = {"front3q": (size * 0.9, size * 1.15, size * 0.72), "rear3q": (-size * 0.9, -size * 1.15, size * 0.68)}
    for label, offset in views.items():
        camera.location = center + Vector(offset)
        camera.rotation_euler = (center - camera.location).to_track_quat("-Z", "Y").to_euler()
        bpy.context.scene.render.filepath = str(review_dir / f"{asset_id}_{label}.png")
        bpy.ops.render.render(write_still=True)
    for obj in (floor, key_light, fill, camera):
        bpy.data.objects.remove(obj, do_unlink=True)


def select_asset(root):
    bpy.ops.object.select_all(action="DESELECT")
    stack = [root]
    while stack:
        obj = stack.pop()
        obj.select_set(True)
        stack.extend(obj.children)
    bpy.context.view_layer.objects.active = root


def glb_animation_names(path: Path):
    raw = path.read_bytes()
    json_len = struct.unpack_from("<I", raw, 12)[0]
    doc = json.loads(raw[20 : 20 + json_len])
    return [animation.get("name", "") for animation in doc.get("animations", [])], doc


def export(asset_id: str, root, groups, clips, scale, original_source: str):
    out = output_root()
    model_dir = out / "public" / "models" / "vehicles"
    source_dir = out / "assets" / "vehicles" / "rigged"
    review_dir = out / "assets" / "vehicles" / "rigged" / "previews"
    for directory in (model_dir, source_dir, review_dir):
        directory.mkdir(parents=True, exist_ok=True)
    for image in bpy.data.images:
        if image.type == "IMAGE" and image.has_data and not image.packed_file:
            image.pack()
    materials, images = material_audit()
    bpy.context.scene.render.fps = FPS
    bpy.context.scene.unit_settings.system = "METRIC"
    bpy.context.scene.unit_settings.scale_length = 1.0
    bpy.context.scene.frame_start = 1
    bpy.context.scene.frame_end = 1 + 4 * FPS
    bpy.context.scene.frame_set(1)
    blend_path = source_dir / f"{asset_id}_rigged.blend"
    bpy.context.preferences.filepaths.save_version = 0
    bpy.ops.wm.save_as_mainfile(filepath=str(blend_path))
    render_views(asset_id, review_dir)
    # Save again without review-only objects, keeping packed texture data and editable actions.
    bpy.ops.wm.save_as_mainfile(filepath=str(blend_path))
    select_asset(root)
    glb_path = model_dir / f"{asset_id}.glb"
    bpy.ops.export_scene.gltf(
        filepath=str(glb_path), export_format="GLB", use_selection=True,
        export_extras=True, export_yup=False, export_animations=True,
        export_animation_mode="NLA_TRACKS", export_frame_range=False,
        export_apply=False, export_optimize_animation_keep_anim_object=True,
    )
    animation_names, glb_doc = glb_animation_names(glb_path)
    mn, mx = scene_bounds()
    triangles = triangle_count()
    mesh_ids = {}
    for obj in bpy.context.scene.objects:
        if obj.type == "MESH" and obj.name.startswith("Wheel_"):
            mesh_ids[obj.name] = obj.data.name
    rig = {
        "asset": asset_id,
        "source": Path(original_source).name,
        "revision": "approved-pbr-rig-v1",
        "axisConvention": "+Y forward, +Z up",
        "units": "meters",
        "groundDatum": 0.0,
        "normalization": {"sourceNose": "-X", "rotationZDegrees": -90.0, "uniformScale": scale},
        "bounds": {"min": [round(v, 6) for v in mn], "max": [round(v, 6) for v in mx]},
        "dimensions": [round(mx[i] - mn[i], 6) for i in range(3)],
        "triangles": triangles,
        "materials": materials,
        "images": images,
        "clips": clips,
        "exportedAnimations": animation_names,
        "nodes": {
            name: {"object": obj.name, "kind": obj.get("rig_kind", "fixed"), "pivot": [round(v, 6) for v in obj.location]}
            for name, obj in sorted(groups.items())
        },
        "canonicalWheelMesh": sorted(set(mesh_ids.values())),
        "allWheelInstancesLinked": len(set(mesh_ids.values())) == 1,
        "glb": f"public/models/vehicles/{asset_id}.glb",
        "blend": f"assets/vehicles/rigged/{asset_id}_rigged.blend",
        "limitations": [
            "Rigid-object animation only; no deformation armature is introduced.",
            "Steering is a authored preview/state clip; runtime steering blend must be driven by gameplay.",
            "Weapon and ramp clips are authored but require gameplay event binding by integration code.",
        ],
    }
    rig_path = model_dir / f"{asset_id}.rig.json"
    rig_path.write_text(json.dumps(rig, indent=2) + "\n", encoding="utf-8")
    return rig


def main():
    asset_id = argv_asset()
    original_source = bpy.data.filepath
    if asset_id.startswith("hemtt_"):
        root, groups, clips, scale = build_hemtt(asset_id)
    else:
        root, groups, clips, scale = build_apc(asset_id)
    rig = export(asset_id, root, groups, clips, scale, original_source)
    rig["originalSource"] = original_source
    print("GC_PBR_RESULT=" + json.dumps({
        "asset": asset_id, "triangles": rig["triangles"], "clips": [c["id"] for c in clips],
        "bounds": rig["bounds"], "animations": rig["exportedAnimations"],
        "linkedWheels": rig["allWheelInstancesLinked"],
    }, separators=(",", ":")))


if __name__ == "__main__":
    main()
