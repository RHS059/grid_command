"""Render one requested animation pose from an exported PBR vehicle authoring Blend."""

from __future__ import annotations

import json
import math
import sys
from pathlib import Path

import bpy
from mathutils import Vector


def bounds():
    points = []
    for obj in bpy.context.scene.objects:
        if obj.type == "MESH" and not obj.name.startswith("PROOF_ONLY_"):
            points.extend(obj.matrix_world @ Vector(corner) for corner in obj.bound_box)
    return (
        Vector(min(p[i] for p in points) for i in range(3)),
        Vector(max(p[i] for p in points) for i in range(3)),
    )


def activate_clip(clip: str, seconds: float):
    targets = []
    for obj in bpy.data.objects:
        if not obj.animation_data:
            continue
        obj.animation_data.action = None
        for track in obj.animation_data.nla_tracks:
            track.mute = True
            if track.name == clip and track.strips:
                obj.animation_data.action = track.strips[0].action
                targets.append(obj.name)
    if not targets:
        raise RuntimeError(f"No action tracks found for clip {clip!r}")
    frame = 1 + round(seconds * bpy.context.scene.render.fps)
    bpy.context.scene.frame_set(frame)
    bpy.context.view_layer.update()
    return frame, sorted(targets)


def setup(camera_view: str):
    scene = bpy.context.scene
    scene.render.engine = "BLENDER_EEVEE_NEXT"
    scene.render.resolution_x = 640
    scene.render.resolution_y = 480
    scene.render.resolution_percentage = 100
    scene.render.image_settings.file_format = "PNG"
    scene.render.film_transparent = False
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
    key.data.shape = "DISK"
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
    mn, mx = bounds()
    center = (mn + mx) * 0.5
    size = max(mx - mn)
    if camera_view == "rear3q":
        offset = Vector((-size * 0.9, -size * 1.15, size * 0.68))
    elif camera_view == "front_close":
        offset = Vector((size * 0.63, size * 0.80, size * 0.48))
    else:
        offset = Vector((size * 0.9, size * 1.15, size * 0.72))
    camera.location = center + offset
    camera.rotation_euler = (center - camera.location).to_track_quat("-Z", "Y").to_euler()


def main():
    args = sys.argv[sys.argv.index("--") + 1 :]
    if len(args) != 5:
        raise SystemExit("Expected: -- asset clip seconds camera_view output_png")
    asset, clip, seconds_text, camera_view, output_text = args
    seconds = float(seconds_text)
    frame, targets = activate_clip(clip, seconds)
    setup(camera_view)
    output = Path(output_text)
    output.parent.mkdir(parents=True, exist_ok=True)
    bpy.context.scene.render.filepath = str(output)
    bpy.ops.render.render(write_still=True)
    result = {
        "asset": asset,
        "clip": clip,
        "sampleSeconds": seconds,
        "sampleFrame": frame,
        "camera": camera_view,
        "actionTargets": targets,
        "image": output.name,
        "sourceBlend": Path(bpy.data.filepath).name,
        "usesSavedActionTracks": True,
    }
    output.with_suffix(".proof.json").write_text(json.dumps(result, indent=2) + "\n", encoding="utf-8")
    print("GC_ANIMATION_PROOF=" + json.dumps(result, separators=(",", ":")))
    return result


if __name__ == "__main__":
    main()
