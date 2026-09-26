"""Extract one unique HEMTT rear module from a normalized full-variant review Blend."""

from __future__ import annotations

import json
import os
import sys
from pathlib import Path

import bpy
from mathutils import Matrix, Vector


MOUNT = Vector((0.0, -1.5, 1.396894))


def empty(name, parent=None, location=(0, 0, 0)):
    obj = bpy.data.objects.new(name, None)
    bpy.context.scene.collection.objects.link(obj)
    obj.empty_display_type = "PLAIN_AXES"
    obj.location = location
    if parent:
        obj.parent = parent
    return obj


def bounds():
    pts = []
    for obj in bpy.context.scene.objects:
        if obj.type == "MESH":
            pts.extend(obj.matrix_world @ Vector(c) for c in obj.bound_box)
    return Vector(min(p[i] for p in pts) for i in range(3)), Vector(max(p[i] for p in pts) for i in range(3))


def main():
    args = sys.argv[sys.argv.index("--") + 1 :]
    if len(args) != 2:
        raise SystemExit("Expected -- role output_root")
    role, output_text = args
    source_name = f"hemtt_{role}_module_pbr"
    primary = bpy.data.objects.get(f"hemtt_{role}_pbr_module")
    if primary is None:
        raise RuntimeError(f"Missing normalized module mesh for {role}")
    sources = [primary]
    if role == "repair":
        spare = bpy.data.objects.get("Spare_Wheel")
        if spare is None:
            raise RuntimeError("Repair module is missing its unique spare wheel")
        sources.append(spare)
    extracted = []
    for index, src in enumerate(sources):
        data = src.data.copy()
        data.name = f"{source_name}_{'Mesh' if index == 0 else 'SpareWheelMesh'}"
        data.transform(Matrix.Translation(-MOUNT) @ src.matrix_world)
        data.update()
        extracted.append(data)
    for obj in list(bpy.data.objects):
        bpy.data.objects.remove(obj, do_unlink=True)
    root = empty("GC_MODULE")
    root["module_id"] = source_name
    root["attach_mount"] = "Mount_rear_module"
    root["axis_convention"] = "+Y forward, +Z up"
    assembly = empty("Assembly_module", root)
    assembly["rig_kind"] = "fixed_module"
    mount = empty("Mount_module_payload_0", assembly)
    for index, data in enumerate(extracted):
        object_name = source_name if index == 0 else f"{source_name}_spare_wheel"
        mesh_obj = bpy.data.objects.new(object_name, data)
        bpy.context.scene.collection.objects.link(mesh_obj)
        mesh_obj.parent = mount
    bpy.data.orphans_purge(do_recursive=True)
    bpy.context.scene.unit_settings.system = "METRIC"
    bpy.context.scene.unit_settings.scale_length = 1.0
    for image in bpy.data.images:
        if image.type == "IMAGE" and image.has_data and not image.packed_file:
            image.pack()
    output = Path(output_text)
    model_dir = output / "public/models/vehicles"
    source_dir = output / "assets/vehicles/rigged/modules"
    model_dir.mkdir(parents=True, exist_ok=True)
    source_dir.mkdir(parents=True, exist_ok=True)
    bpy.context.preferences.filepaths.save_version = 0
    blend_path = source_dir / f"{source_name}.blend"
    bpy.ops.wm.save_as_mainfile(filepath=str(blend_path))
    bpy.ops.object.select_all(action="SELECT")
    glb_path = model_dir / f"{source_name}.glb"
    bpy.ops.export_scene.gltf(
        filepath=str(glb_path), export_format="GLB", use_selection=True,
        export_extras=True, export_yup=False, export_animations=False,
    )
    mn, mx = bounds()
    composed_min = mn + MOUNT
    composed_max = mx + MOUNT
    tris = sum(sum(len(p.vertices) - 2 for p in obj.data.polygons) for obj in bpy.data.objects if obj.type == "MESH")
    materials = sorted({m.name for obj in bpy.data.objects if obj.type == "MESH" for m in obj.data.materials if m})
    images = sorted(
        ({"name": i.name, "size": list(i.size), "packed": bool(i.packed_file)} for i in bpy.data.images if i.type == "IMAGE"),
        key=lambda item: item["name"],
    )
    rig = {
        "asset": source_name,
        "role": role,
        "classification": "runtime-rear-module",
        "containsBaseTruck": False,
        "attachMount": "Mount_rear_module",
        "mountTransform": {"position": list(MOUNT), "rotationQuaternion": [0, 0, 0, 1], "scale": [1, 1, 1]},
        "attachLocalTransform": {"position": [0, 0, 0], "rotationQuaternion": [0, 0, 0, 1], "scale": [1, 1, 1]},
        "axisConvention": "+Y forward, +Z up",
        "units": "meters",
        "triangles": tris,
        "bounds": {"min": [round(v, 6) for v in mn], "max": [round(v, 6) for v in mx]},
        "composedBounds": {"min": [round(v, 6) for v in composed_min], "max": [round(v, 6) for v in composed_max]},
        "materials": materials,
        "images": images,
        "glb": f"public/models/vehicles/{source_name}.glb",
        "blend": f"assets/vehicles/rigged/modules/{source_name}.blend",
    }
    (model_dir / f"{source_name}.rig.json").write_text(json.dumps(rig, indent=2) + "\n", encoding="utf-8")
    print("GC_MODULE_RESULT=" + json.dumps({"asset": source_name, "triangles": tris, "composedBounds": rig["composedBounds"]}, separators=(",", ":")))


if __name__ == "__main__":
    main()
