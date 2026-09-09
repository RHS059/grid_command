---
name: ps2-character-weapon-modeling
description: Build and revise Grid Command low-poly soldier and weapon assets from supplied Blender examples and aligned orthographic references, including mirrored quad cages, rig fit, comparison renders, and export validation. Use for character or weapon modelling in this project.
---

# PS2 character and weapon modelling

Preserve the supplied design language while adding modest PS2 / early Xbox surface detail and grit. Judge silhouette and proportion before decoration. This skill supports the current modelling assignment; it does not authorize unrelated character, vehicle, game-code, release, or settings changes.

## Geometry authority after the rejected rifle

The user rejected rifle r2. It is failed evidence, not a base for further family assets. Rebuild the representative rifle from the supplied source Blend and its exact side/front/top silhouettes; lock scale, origin and cameras and inspect overlays before detail. Pose references from games, reusable animation libraries, or AI images guide only the soldier's pose. They must never override the supplied weapon geometry or proportions. Do not reshape the weapon to accommodate an incorrect hand pose. Verify any downloaded animation's license and skeleton mapping before retargeting, record its source, and preserve the canonical soldier in a separate fit proof.

`PROJECT` is the `grid_command` directory three levels above this skill directory. `SESSION` is `PROJECT/../..`. Resolve the following paths against those roots; existing scripts currently contain this session's absolute paths, so inspect their constants before reuse elsewhere.

## Start from the current evidence

- Weapon examples: `PROJECT/model_refs/Blends`. The user's earlier `grid/_command/model/_refs` spelling refers to this actual directory. The September 2026 inventory contains 55 Blender files; 38 relevant rifle, bullpup, SMG, sniper, and accessory files have side and three-quarter renders.
- Inventory and render helper: [inventory_refs.py](../../../../astra_2_weapons/inventory_refs.py). Its JSON records counts, bounds, materials, and exact source paths. Inspect the three source contact sheets in `SESSION/outputs/astra_2_weapons` before choosing a family. Pistols and shotguns were inventoried but not rendered because they are outside the requested set.
- Weapon shape and legacy attachment contract: [weapon-design.md](../../../weapon-design.md). Its older lower geometry budgets are superseded by the task's budgets below; its orientation warning remains relevant.
- Legacy helper: [build_weapons.py](../../../../astra_2_weapons/build_weapons.py). Its rifle design was rejected. Do not reuse that geometry or its family branches. Generic rendering/export utilities may be reused only without importing the rejected shape assumptions.
- Current source-derived reconstruction: `SESSION/work/astra_2_weapons/rebuild_source_cages.py`, `refine_r3.py`, and `validate_r3.py`. These reconstruct 18 source components into fresh meshes, retain exact source coordinates, join eligible coplanar triangles, and add UV/packed grit without changing shape. This is source-derived surface reconstruction, not hand-retopology. Native/export assets are `SESSION/outputs/astra_2_weapons/models/rifle_r3_refined.blend` and `.glb`. Locked comparisons and validation are in `SESSION/outputs/astra_2_weapons/r3`. Existing source open edges are recorded, not falsely called watertight.
- Current rifle and exact unfinished work: [paused_handoff.md](../../../../../outputs/astra_2_weapons/paused_handoff.md). Read this when resuming; do not regenerate already completed source renders without a reason.
- Canonical soldier and rig evidence: [rig_release_handoff.md](../../../../../outputs/astra_2_xhigh/rig_release_handoff.md). The editable source is `SESSION/outputs/astra_2_xhigh/astra_2_xhigh_rigified.blend`.

## Reference generation and alignment

When AI turnarounds are requested, use the available built-in image generator through the imagegen skill. Inspect supplied source renders first and pass them as the design reference. Ask for a coherent neutral-gray sheet of the same design: left/right/front/back/top/bottom plus elevated three-quarter as useful, with more subtle wear and small surface details while retaining broad low-poly planes. Maintain proportions across views. Do not treat a pretty perspective image as an orthographic measurement.

The image tool rejected two fictional rifle-sheet requests in this session at output moderation. Record tool rejection accurately; do not claim a generated sheet exists, repeatedly resubmit equivalent blocked prompts, or silently switch to an API fallback. Continue authorized modelling with **exact Blender source orthographic renders** where possible, identifying that fallback to the user. A later user-approved generated reference can replace it without discarding editable cages. Never label a Blender render as AI-generated. New classes absent from the library need an explicitly identified design reference rather than a false claim of an exact source match.

Lock a shared origin, axis, pixel scale, and principal dimensions for each comparison. Side/front/top must agree on receiver length, thickness, barrel centerline, stock heel, grip location, magazine stations, and sight height. For the body use neck/shoulder/chest/waist/crotch/knee/ankle landmarks; for boots use ankle datum, sole length, heel, and toe break. Do not independently resize reference and candidate bounding boxes and then report the result as a proportion match.

Use the soldier's fixed-camera comparison approach in [compare_body_locked.py](../../../../../outputs/astra_2_xhigh/compare_body_locked.py) and equivalent `compare_boot_locked.py` / `compare_vest_locked.py`. The older normalized `body_landmarks.py` images are rough diagnostics; their independent height normalization can hide scale errors. Thumbnail contact sheets are review aids, not quantitative fit proof.

## Editable shape and surface decisions

Trace side/front/top outlines into one coordinated cage. Extrude the silhouette in quads, use axial ring stations and loop cuts for changes of section, and compare again before triangulation. Keep the editable cage and triangulate evaluated geometry at export. Broad beveled boxes are suitable for small hardware; they do not substitute for the weapon stock/grip/receiver silhouette or the body's connected form.

Retain Mirror for symmetric structural parts. For the soldier, the symmetry plane is X=0; for the current +X-forward weapon authoring helper it is Y=0. Mirror precedes Armature. Keep intentionally asymmetric controls separate; do not duplicate an ejection detail onto both sides merely to simplify mirroring. Correct face normals and inspect thin caps and seams after extrusion. Count evaluated visible geometry, excluding rig widgets, reference meshes, hidden variants, and cameras.

Character lessons: keep the uniform body continuous and manifold, maintain the horizontal T-pose and limb proportions, and fit gear to its surface. Keep rigid plates, pouches, and equipment separate; use rigid bone attachments for rigid gear and surface-following bindings for flexible straps. See the existing `outline_body.py`, `fill_body_outline.py`, `cloth_detail_body.py`, `outline_boot.py`, `boot_quad_sole.py`, `outline_vest.py`, and `finish_vest_straps.py` under `SESSION/outputs/astra_2_xhigh` only for the component being edited. These are staged construction scripts, not a single safe batch to rerun over the finished soldier.

Weapon landmarks: stepped stock and receiver, thin barrel with staged muzzle, usable tapered grip, real trigger-guard opening, curved or tapered magazine, readable sight and handguard rhythm. Differentiate class silhouettes through stock/barrel/receiver dimensions and supports, not only a longer barrel or a renamed file. LSW/LMG need distinguishable ammunition and support hardware; rockets and emplacements need purpose-specific forms.

Use restrained graphite, gray metal/polymer, muted olive, and tiny dark lenses. Add shallow seams, inset panels, fasteners, edge catches, pixel-scale roughness, and sparse wear. Avoid smooth capsule forms, uniformly bright edge outlines, or noise that destroys material grouping. The current helper packs small nearest-filtered grit textures and uses single-segment chamfers; check the Eevee render because viewport material colors do not show texture quality.

| Asset class | Approximate evaluated triangle budget |
| --- | --- |
| Handheld rifle, SMG, marksman/sniper, LSW/LMG, controller/tool | 2,000–6,000 |
| Larger AT/AA launcher | 5,000–9,000 |
| Static HMG / AA / AT emplacement | 7,500–15,000 |

Spend triangles on silhouette or visible construction, not filler. The existing canonical soldier has 14,876 character triangles; a weapon task does not authorize retopologizing it to a new budget.

## Orientation, grip fit, and moving parts

The canonical Extra High soldier is **1.919 m tall, forward -Y, up +Z, anatomical left +X**. Its `weapon_grip.L/R` bones follow local hand axes and remain provisional until fitted. The old live soldier system uses a **+Y-forward weapon and receiver datum**, not a grip origin. These contracts differ; do not attach a new asset to the old datum with an unexplained corrective rotation.

The weapon helper currently authors **+X forward, +Z up, Y width**. Its standalone GLB applies glTF Y-up conversion but does not perform the legacy +Y-forward / receiver-datum conversion or the Extra High hand-fit transform. Inspect final exported node transforms and muzzle direction rather than assuming a filename makes it compatible. Preserve the canonical soldier file; author fit poses in a separate proof file unless edits are requested.

Place and name primary grip, support grip, muzzle, stock/shoulder, optic/attachment, magazine, and ejection sockets where useful. Match the firing hand to the grip, support hand to a reachable surface, and stock to the shoulder; check front, side, and three-quarter in the actual rig pose. Position the hands with appropriate IK/finger controls when the canonical pose is provisional. Fit must not be inferred merely from nearby socket coordinates.

Keep magazines, bolts, charging handles, triggers, selectors, grenade-launcher barrels, rocket/cap elements, bipods, and emplacement traverse/elevation components separable where their animation needs them. Locate their pivots at the actual visible hinges/slides and record local axes. A named empty at the world origin does **not** establish a usable pivot: the current rifle's separate parts still need pivot placement and motion proofs.

Retain character rig lessons from `bind_rigify.py`, `proof_rigify.py`, and `verify_rig_final.py`: normalized weights, no unweighted vertices, at most four influences; upper aim/recoil actions must preserve the lower body and use a shared neutral. The full 723-bone authoring rig is not the runtime skeleton. Bake required deform/attachment bones and convert additive poses only as part of authorized integration.

## Compare, validate, and hand off

Use Eevee or Workbench/viewport rendering. After each meaningful shape pass save front/side/top plus reverse/end and elevated views when they expose errors. Check the same locked views against reference before advancing to another family. Share completed sheets during the loop. [make_model_sheets.py](../../../../astra_2_weapons/make_model_sheets.py) assembles the weapon views; [contact_sheets.py](../../../../astra_2_weapons/contact_sheets.py) assembles source inventories.

For the next proof, verify the actual saved file can reopen; measure evaluated visible triangles and dimensions; check normals, unexpected boundary/nonmanifold geometry, Mirror symmetry, UV/material presence, socket transforms, and articulation. Verify the GLB's meshes/material textures, hierarchy, coordinates, and any authored animation channels. Reopen/import the export to compare it with the source. A successful exporter message alone does not establish runtime compatibility.

For character changes use existing rig binding/pose/final validators and inspect affected deformation renders. For weapon-only outputs, run asset checks appropriate to the change; run app tests and a live preview only when runtime files are integrated. Include exact changed files, counts, screenshots, tests, remaining limitations, concise changelog bullets, and a version recommendation reconciled with the release owner's current app version. Do not claim model completion, AI references, fitted grip, animated mechanisms, or live integration without corresponding evidence.
