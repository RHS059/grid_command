# Vehicle variants and articulated animation

Seven Blender-authored assets now feed the existing scene-data/Babylon bridge and Model Preview. Sources and review sheets are delivered separately under outputs/vehicle_models; this repository contains deterministic Blender generators, native geometry/rig metadata, and animated GLBs.

| Role | Asset | Preview actions |
| --- | --- | --- |
| TANK | tank | Drive, shoot/recoil, turret traverse |
| TROOP_TRUCK | troop_transport | Drive; eight seats including two transverse rear seats |
| APC | apc | Drive, shoot, traverse, ramp open/close |
| HEAVY_LIFT_HELI | vtol_cargo | Fly, rotors, nacelle tilt, cargo door open/close |
| ATTACK_HELI | vtol_attack | Fly, rotors, nacelle tilt, cannon fire |
| CAS_FIGHTER | cas | Fly, propeller, stores release, gear retract/deploy |
| JET | fighter | Fly/control surfaces, stores release, gear retract/deploy |

All expose a static rest pose. Animated GLB tracks omit static rest channels. Model Preview offers individual selection, play/pause, restart, loop, and a scrub timeline. Gameplay uses movement-driven tracks/wheels, propellers, and aimed turrets; weapon/door/gear demonstration clips are selected in the preview, not automatically tied to simulation events.

The cargo variant has a recessed right cargo aperture and animated left sliding door, no cannon, and the existing createInteriorWindowMaterial / InteriorRoomPlugin storage-room family. APC retains the same parallax interface behind its rear ramp. Attack has closed side panels, no cargo geometry or parallax panel, and a chin cannon. Blender renders use physical shallow interior boxes as the shader's compatible source proxy.

The shared body is 9.81 m long. Central hull depth is 1.26 m cargo / 0.91 m attack. Forward leading-edge sweep is 39.8 degrees cargo / 48.6 degrees attack; attack rotor hubs are 0.69 m farther forward and 0.378 m lower. These are model dimensions, not claimed engineering measurements of perspective reference photos.

Blender hierarchy: GC_ASSET -> Assembly_part (articulated pivot) -> Mount_module_number -> linked mesh. Repeated modules remain assembled and editable. No runtime spawning added. Native scene-data batches geometry by articulated group for the existing engine bridge; GLBs retain full module mounts. Coordinates remain +Y forward, +Z up. Source assemblies use rigid-object rigs and NLA tracks, not skinning.

Regenerate from the repository with Blender 4.5:

    blender --background --python tools/blender/build_vehicles.py -- tank troop_transport apc vtol_cargo vtol_attack cas fighter

Set GC_OUTPUT_DIR for source/render destination, GC_REPO for checkout destination, and GC_REV for review suffix. Renders use BLENDER_EEVEE_NEXT. Source NLA tracks are muted by default to preserve the assembled review pose; enable one named track on all relevant assemblies to inspect it. The supplied select_animation.py helper selects matching tracks.

Validation: TypeScript no-emit check; models.test.ts and vehicle-animation.test.ts; seven headless Blender reopen/render passes; seven GLB structural/channel checks; /lab HTTP 200 with animation controls present. Browser runtime had no connected browsers, so live pointer interaction was not exercised. Playback and articulation were exercised through the same deterministic functions used by ModelViewport. The headless renders were visually inspected.

Tradeoffs: track paths are simplified capsule loops; rigid control/gear groups are suitable for strategy-scale viewing, not mechanical engineering simulation. Source and GLB are fully modular; game geometry is grouped per moving part. Stylized source geometry intentionally preserves faceted shading.
