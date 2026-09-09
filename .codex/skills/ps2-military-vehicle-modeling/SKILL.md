---
name: ps2-military-vehicle-modeling
description: Build and revise Grid Command low-poly military vehicles from visual references, with modular Blender assemblies, canonical-soldier seating, articulated and boarding animations, comparison renders, and native GLB validation. Use for vehicle modeling in this project; character and weapon authoring have their own skill.
---

# PS2 military vehicle modeling

Preserve the supplied vehicle's recognizable silhouette and the project's angular PS2 / early Xbox military style. Continue the requested asset or variant; this skill does not authorize unrelated gameplay, character, release, or model-setting changes. Keep other contributors' changes intact.

`PROJECT` is the `grid_command` directory three levels above this skill directory; `SESSION` is `PROJECT/../..`. Resolve links relative to this file. Some generators and historical reports contain session-specific paths: inspect their output/source settings before reuse in another checkout.

## Resume from the strongest evidence

- Read [the vehicle pipeline](../../../tools/blender/README.md) for generators, exports, variants and preview integration. [model-design.md](../../../model-design.md) supplies legacy palette/construction context; current user references and the latest asset handoff take precedence over its older proportions or renderer descriptions.
- For the carrier, read [the Extra High release handoff](../../../../../outputs/astra_3/troop_transport_fit/release_handoff_xhigh.md). It records the final R18 geometry, actual-pose fit, static-root export correction, validation and remaining integration work.
- For CAS, read [its release handoff](../../../../../outputs/astra_3/cas/release_handoff.md), then inspect the paired cannon flashes and fixed fuel pods in the delivered images before editing.
- For reference interpretation and VTOL separation, consult [revision notes](../../../../../outputs/vehicle_models/revision_notes.md) and [the articulated-variant report](../../../../../outputs/vehicle_models/phase_two_report.md). These include superseded intermediate results; do not restore a rejected revision or repeat an old limitation as current fact.
- The canonical soldier is documented in [its rig handoff](../../../../../outputs/astra_2_xhigh/rig_release_handoff.md). Its current source is `SESSION/outputs/astra_2_xhigh/astra_2_xhigh_rigified.blend`.

## Reference shape before surface detail

Identify the family, major dimensions and the reference features that distinguish it: hull stations, nose/hood slope, wing root and tip positions, nacelle/rotor positions, canopy, tail cant, wheelbase, track profile, and occupied cabin volume. Resolve conflicting views through a coherent three-dimensional shape. Do not infer a unique engineering dimension or top planform from a perspective photograph.

Use side/front/top views at a shared origin and scale, plus rear and elevated views for occluded structure. Compare the same cameras after each meaningful shape revision; independently fitting each silhouette to its own image bounds can conceal proportion errors. Measure reference-sensitive angles from model landmarks, such as wing leading-edge endpoints, and label perspective-derived choices as interpretations. A VTOL sweep error required rebuilding the wing and moving the nacelles; more fittings would not have corrected it.

Build silhouette, structural sections, then readable fittings. Keep broad planes, modest chamfers, muted paint, dark tires/metal and restrained surface variation. Spend geometry on recognizable shape and useful hardware. The established vehicle budget is **under 15,000 evaluated vehicle triangles**, unless the user sets another target. Count the final visible variant after modifiers; report crew separately. Current examples are carrier R18 8,984, CAS 7,212, tank 12,168 and APC 14,348 triangles. These are reference points, not quotas to fill or permission to simplify the canonical soldier.

## Editable assemblies and variant contracts

Reuse [build_vehicles.py](../../../tools/blender/build_vehicles.py) and [vehicle_rigging.py](../../../tools/blender/vehicle_rigging.py). The assembly convention is `GC_ASSET -> Assembly_<part> -> Mount_<module>_<index> -> mesh`. Assembly nodes own actual articulated pivots. Repeated detachable hardware, armor panels, wheels, rails, fittings and fasteners should retain separately named mounts and linked mesh data when equivalent; a flattened export alone is insufficient as the editable source. Keep deliberate asymmetry. Verify children follow their intended pivot after export.

Vehicle authoring and runtime metadata use **+Y forward, +Z up**, meters, and the established ground datum. Current vehicle GLBs retain Z-up with `export_yup=False`; do not silently apply a second coordinate conversion. Keep rest transforms and named clip hierarchies consistent with [blender-vehicles.ts](../../../lib/game/blender-vehicles.ts) and [vehicle-animation.ts](../../../lib/game/vehicle-animation.ts).

Keep role variants distinct in both source geometry and runtime paths:

- Cargo VTOL has a recessed cargo opening, cargo contents and sliding door, with no attack cannon. Attack VTOL has closed panels and its cannon, with cargo boxes, recess, door and parallax panel removed. Preserve their deliberately different hull depth, sweep and rotor placement.
- APC and cargo VTOL reuse the existing `createInteriorWindowMaterial` / `InteriorRoomPlugin` storage-room family behind their opening. Use the existing implementation in [blender-vehicles.ts](../../../lib/game/blender-vehicles.ts); do not introduce a different interior convention without a reason. Blender review renders use shallow physical interior proxies. A parallax impression does not prove that real crew or cargo fit inside the vehicle.
- CAS cowl cannon flashes sit behind the propeller and belong to their cannon assemblies. Fuel pods and their fins remain attached throughout every clip. Reuse [verify_cas_attack.py](../../../tools/blender/verify_cas_attack.py) and the CAS assertions in [vehicle-animation.test.ts](../../../tests/vehicle-animation.test.ts). Its emissive geometry is portable; the surrounding bloom depends on renderer settings.

## Measure canonical occupants, then size the cabin

The current canonical Rigify soldier is 1.919 m tall, forward **-Y**, up **+Z**, anatomical left **+X**. Preserve it at scale 1 with helmet, backpack and equipment. Author fit and vehicle actions in a derived file; do not shrink soldiers or save over the canonical source to make a cabin pass.

Use [audit_vehicle_seating.py](../../../tools/blender/audit_vehicle_seating.py) and, for procedural vehicles, [audit_support_geometry.ts](../../../tools/blender/audit_support_geometry.ts) to measure evaluated posed geometry. Check boots/floor, helmet/cage, torso/backpack/seatback, thighs, elbows, neighboring occupants, controls and entry routes. Named seats, an occupant count, or a dark interior do not establish fit. If the canonical body or rig changes, remeasure the contact reference and sole-to-ankle offset used by the boarding generator; its current constants are specific to this soldier.

The accepted eight-occupant carrier layout is **driver plus seven passengers**: six forward-facing seats in three rows and two inward-facing transverse rear seats. [vehicle_seating.py](../../../tools/blender/vehicle_seating.py) is the shared seat contract:

- Forward anchors: x +/-0.6 m, y 0.5 / -0.55 / -1.6 m, z 1.28 m, yaw 0.
- Rear anchors: x +/-0.75 m, y -2.95 m, z 1.28 m; left yaw -pi/2, right +pi/2.
- `Seat_<id>` empties mark **cushion contact**, not the armature root. Runtime seat metadata records name, ID, position, yaw, anchor convention and forward axis. Canonical soldier yaw is `pi + seat.yaw`.

Preserve this layout when editing its details unless the user changes the requirement. For another vehicle, derive its own plausible layout rather than transplanting these coordinates. Reconcile passenger capacity with the transport owner: eight total occupants is not eight passengers plus a driver.

[prove_troop_seating.py](../../../tools/blender/prove_troop_seating.py) gives the historical before/after envelope comparison. [verify_carrier_fit.py](../../../tools/blender/verify_carrier_fit.py) is the final proof using **actual seated actions** against the final vehicle. The verified R18 result has no occupant-envelope overlaps, about 82 mm helmet clearance, boots on the floor and a 0.545 mm central pelvis/cushion gap. Recompute after changes; do not substitute the older generic seated pose for the final animation pose. An apparent garment gap should be measured before moving the root and breaking the foot contacts.

## Boarding, export and native playback

Use [build_carrier_boarding.py](../../../tools/blender/build_carrier_boarding.py) as the proven implementation. It creates `mount_<seatid>`, `dismount_<seatid>` and `seat_<seatid>` actions on a derived canonical Rigify character. Side seats enter from their own side; the rear pair enter from the rear. Stage ground, step, floor and seated contacts; keep a support foot planted during the climb and a reachable hand on a real rail. Root motion is already vehicle-local inside the character clip, so runtime crew groups stay at identity. Do not apply a seat transform a second time.

The current mount/exit duration is 80/24 seconds. If timing changes, update the action data, metadata, viewer and verification together. Dismount may be an independently named reversed mount when that motion is suitable, but verify the complete reverse pose. Keep idle seat poses identical to boarding endpoints.

Preserve these export safeguards for independently placed skinned occupants:

- Key every frame at the export rate (currently 24 fps). The earlier 12 fps control sampling produced 13.86 mm intermediate foot-target error even though stage endpoints passed.
- Keep keyed quaternion sequences in one hemisphere. A sign flip around a 180-degree root turn previously interpolated through identity and displaced feet by 0.756 m.
- Retain static object/root channels with `export_optimize_animation_keep_anim_object=True`. Blender otherwise omitted the idle seat root transforms: all clones could inherit the driver's exported anchor or the previous animation's endpoint. Bone channels alone did not fix it.
- Align GLB input time zero with native clip time zero. The current NLA export postprocess subtracts the frame-one offset from each unique sampler input and updates accessor bounds. Recheck actual exported times if the export mode changes.
- Export the required deform hierarchy and materials; keep canonical authoring controls in the source. A successful export log is not native playback evidence.

Run [verify_carrier_runtime.ts](../../../tools/blender/verify_carrier_runtime.ts) against **the shipped GLB**, with its matching route JSON. It exercises 24 actions and 1,360 pose samples: every-frame foot/hand contacts, forward/reverse matrices, arbitrary scrubbing, idle endpoints, and eight simultaneous independent skinned clones using the renderer's instantiation convention. Check that playing one occupant's action leaves the others seated. Root-only or endpoint-only tests miss important failures. Preserve the explicit Babylon `Animations/animatable` registration required by this pipeline.

## Render, expose, validate and hand off

Use **Eevee (`BLENDER_EEVEE_NEXT`) or viewport/Workbench renders** for this project. Keep useful fixed-camera front/side/rear/top/elevated proofs, inspect them, and share progress when a comparison resolves a design choice. Do not regenerate unchanged archival reference sheets without a reason. [verify_carrier_boarding.py](../../../tools/blender/verify_carrier_boarding.py) renders representative side/rear boarding stages; [select_animation.py](../../../tools/blender/select_animation.py) helps inspect the correct source NLA track.

Expose new actions through rig metadata and the existing [ModelViewport](../../../components/game/model-viewport.tsx), including selection, play/pause, restart, looping and scrubbing. For carrier occupants, maintain the per-seat action selection in [carrier-occupants.ts](../../../lib/game/carrier-occupants.ts). Inspect the controls and visible poses in a connected browser when available; a 200 response or a clip name is not live interaction proof.

Set `GC_OUTPUT_DIR`, `GC_REPO` and `GC_REV` deliberately for vehicle generation; set `GC_SOLDIER_SOURCE` for derived crew. Check generator destinations before running because they can replace `public/models` and generated JSON. Reopen the saved source, verify evaluated triangles, finite transforms/normals, expected linked modules and pivots, then verify source/export agreement. Relevant commands from `PROJECT` are:

```text
node --import tsx --test tests/models.test.ts tests/vehicle-animation.test.ts
node --import tsx tools/blender/verify_carrier_runtime.ts
node node_modules/typescript/bin/tsc --noEmit
```

Use the fit, boarding and CAS Blender verifiers only for the changed assets. Report unrelated concurrent failures accurately instead of overwriting their owners' code. The final handoff should identify source/export paths, revision and triangle count, seat/clip contracts, screenshots, verification results, matching deployed-file hashes and outstanding integration work. Read the actual release state rather than copying a version from an old handoff.

Separate demonstrated behavior from unfinished integration: previewed animations do not imply gameplay embark/disembark or firing events trigger them; seat metadata does not imply simulation capacity is reconciled; envelope/contact checks are not a complete triangle-intersection sweep; and Blender screenshots are not browser screenshots. Recheck these facts in the current code before carrying historical limitations forward. Preserve validated assets and avoid commit/push unless the current task authorizes them.
