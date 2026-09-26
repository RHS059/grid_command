"""Import a staged HEMTT module GLB, attach it to the saved base mount, and render proof."""

from __future__ import annotations

import json
import sys
from pathlib import Path

import bpy
from mathutils import Matrix, Vector


def scene_bounds():
    points = []
    for obj in bpy.context.scene.objects:
        if obj.type == "MESH" and not obj.name.startswith("PROOF_ONLY_"):
            points.extend(obj.matrix_world @ Vector(c) for c in obj.bound_box)
    return Vector(min(p[i] for p in points) for i in range(3)), Vector(max(p[i] for p in points) for i in range(3))


def main():
    args = sys.argv[sys.argv.index("--") + 1 :]
    if len(args) != 3:
        raise SystemExit("Expected -- role module_glb output_png")
    role, glb_text, output_text = args
    mount = bpy.data.objects.get("Mount_rear_module")
    if mount is None:
        raise RuntimeError("Base source lacks Mount_rear_module")
    before = set(bpy.data.objects)
    bpy.ops.import_scene.gltf(filepath=glb_text)
    imported = [obj for obj in bpy.data.objects if obj not in before]
    roots = [obj for obj in imported if obj.parent is None]
    module_root = next((obj for obj in roots if obj.name.startswith("GC_MODULE")), None)
    if module_root is None:
        raise RuntimeError(f"Imported module has no GC_MODULE root: {[o.name for o in roots]}")
    module_root.parent = mount
    module_root.matrix_parent_inverse = Matrix.Identity(4)
    module_root.location = (0, 0, 0)
    module_root.rotation_euler = (0, 0, 0)
    module_root.scale = (1, 1, 1)
    bpy.context.view_layer.update()
    scene = bpy.context.scene
    scene.render.engine = "BLENDER_EEVEE_NEXT"
    scene.render.resolution_x = 640
    scene.render.resolution_y = 480
    scene.render.resolution_percentage = 100
    scene.render.image_settings.file_format = "PNG"
    if scene.world is None:
        scene.world = bpy.data.worlds.new("ProofWorld")
    scene.world.color = (0.035, 0.035, 0.035)
    floor_mat = bpy.data.materials.new("ProofFloor")
    floor_mat.diffuse_color = (0.08, 0.08, 0.08, 1)
    bpy.ops.mesh.primitive_plane_add(size=80, location=(0, 0, -0.01))
    floor = bpy.context.object
    floor.name = "PROOF_ONLY_Ground"
    floor.data.materials.append(floor_mat)
    bpy.ops.object.light_add(type="AREA", location=(5, 6, 9))
    key = bpy.context.object
    key.name = "PROOF_ONLY_Key"
    key.data.energy = 1550
    key.data.size = 6
    bpy.ops.object.light_add(type="AREA", location=(-5, -1, 5))
    fill = bpy.context.object
    fill.name = "PROOF_ONLY_Fill"
    fill.data.energy = 950
    fill.data.size = 5
    bpy.ops.object.camera_add()
    camera = bpy.context.object
    camera.name = "PROOF_ONLY_Camera"
    camera.data.lens = 54
    scene.camera = camera
    mn, mx = scene_bounds()
    center = (mn + mx) * 0.5
    size = max(mx - mn)
    camera.location = center + Vector((size * 0.9, size * 1.15, size * 0.72))
    camera.rotation_euler = (center - camera.location).to_track_quat("-Z", "Y").to_euler()
    output = Path(output_text)
    output.parent.mkdir(parents=True, exist_ok=True)
    scene.render.filepath = str(output)
    bpy.ops.render.render(write_still=True)
    result = {
        "base": "hemtt_base_pbr",
        "module": f"hemtt_{role}_module_pbr",
        "importedGlb": Path(glb_text).name,
        "parentMount": "Mount_rear_module",
        "attachLocalTransform": {"position": [0, 0, 0], "rotationQuaternion": [0, 0, 0, 1], "scale": [1, 1, 1]},
        "mountWorldPosition": [round(v, 6) for v in mount.matrix_world.translation],
        "image": output.name,
        "usesStagedModuleGlb": True,
    }
    output.with_suffix(".proof.json").write_text(json.dumps(result, indent=2) + "\n", encoding="utf-8")
    print("GC_MODULE_PROOF=" + json.dumps(result, separators=(",", ":")))


if __name__ == "__main__":
    main()
