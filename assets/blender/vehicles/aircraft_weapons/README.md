# Standard aircraft weapons

`aircraft_weapons.blend` and `public/models/aircraft_weapons.glb` contain three reusable receivers: `bomb`, `rocket_pod`, and `rocket`. Each uses the shared `aircraft_weapons_albedo.png` atlas (1024 × 1024, sRGB). No receiver uses the Fury atlas.

The local origin is the attachment centre. +Y points forward. +Z points up. The bomb receiver comes from the approved Fury reference build. The pod has eight recessed bores. The small rocket is a separate projectile. Dimensions and hidden structure are inferred from the reference photographs.

The Fury owns its two pylons and twin racks. `lib/game/aircraft-loadout.ts` places two independent bombs on the left rack and two pods on the right rack. Each pod has eight rounds. A firing command consumes one round; it never releases the pod. A bomb command releases one bomb. Rearm at the airfield restores the loadout when ammunition service reaches 100 percent.

`lib/game/aircraft-weapons.ts` attaches the receivers, samples the preview clips, and applies the game ammunition state. Other aircraft can reuse the same assets by adding their attachment datums to `AIRCRAFT_HARDPOINTS`. Their weapon mesh and texture do not need to be copied into the aircraft asset.

Build with `separate_fq44_weapons.py` after the R4 aircraft texture pass. The canonical `build_fq44.py` runs this step. `source_with_stores.blend` is a local extraction checkpoint; the normal build regenerates it. Keep it out of the game package.

Checks: 1,338 exported vertices; 628 source vertices; 1,216 triangles. All source components have zero degenerate faces and zero nonmanifold edges. Rays through all eight bores reach the recessed floor at Y = 0.75, behind the front face at Y = 0.85. The aircraft retains 8,983 exported vertices and one separate 1024 × 1024 atlas.
