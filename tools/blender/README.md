# Vehicle variants and articulated animation

Seven Blender-authored assets now feed the existing scene-data/Babylon bridge and Model Preview. Sources and review sheets are delivered separately under outputs/vehicle_models; this repository contains deterministic Blender generators, native geometry/rig metadata, and animated GLBs.

| Role | Asset | Preview actions |
| --- | --- | --- |
| TANK | tank | Drive, shoot/recoil, turret traverse |
| TROOP_TRUCK | troop_transport | Drive; eight full-size occupants, with individual board/exit actions for six forward seats and two transverse rear seats |
| APC | apc | Drive, shoot, traverse, ramp open/close |
| HEAVY_LIFT_HELI | vtol_cargo | Fly, rotors, nacelle tilt, cargo door open/close |
| ATTACK_HELI | vtol_attack | Fly, rotors, nacelle tilt, cannon fire |
| CAS_FIGHTER | cas | Fly, propeller, paired cowl-cannon muzzle flashes, gear retract/deploy; fuel pods remain fixed |
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

## Canonical troop carrier crew

The troop carrier uses `Seat_<id>` cushion-contact empties and matching JSON metadata from `vehicle_seating.py`. The first six anchors face +Y; the rear pair face inward across the vehicle. Seat anchors are distinct from the soldier armature root. `carrier-soldier.glb` is derived from the canonical Astra 2 Rigify source at scale 1; its mount, dismount, and seated actions contain vehicle-space root transforms. Model Preview shows all eight occupants and exposes each of the sixteen board/exit clips. Gameplay crew visibility remains driven by the existing transport state; simulation events do not yet play these board/exit clips automatically.

To regenerate the crew, set `GC_SOLDIER_SOURCE` to the canonical rigified `.blend` and `GC_OUTPUT_DIR` to the directory containing the generated `troop_transport.blend`, then run Blender with `--background --python tools/blender/build_carrier_boarding.py`. It writes the derived authoring source and copies the crew GLB into `public/models`. The canonical source is opened read-only by this workflow and never saved. Every animation frame is keyed, quaternion signs remain continuous, and static armature-root channels are retained so seated clones cannot inherit the driver anchor or a preceding clip's endpoint.

Run `node --import tsx tools/blender/verify_carrier_runtime.ts` against the shipped GLB. It checks 24 actions, 1,360 native pose samples, foot/handhold targets, reverse/scrub determinism, seated endpoints, and eight simultaneous independent crew instances. `verify_carrier_fit.py` measures and renders all eight actual seated clips against the final vehicle; `verify_carrier_boarding.py` renders representative side and rear boarding stages. The actual seated fit has no occupant-envelope overlaps, boots on the floor, and 82 mm minimum helmet clearance. These checks do not constitute a complete mesh-intersection sweep of every transition, and a connected browser is still required for live visual inspection of the viewer.
