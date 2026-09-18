# FQ-44 Fury

This asset replaces the `JET` strike fighter. The five supplied photographs define its shape and paint. Dimensions hidden by perspective are estimates.

The game uses `lib/game/generated/fighter.json` and its rig file. `public/models/fighter.glb` is the interchange export. Both use indexed vertices, texture coordinates and authored normals. One 1024 × 1024 color texture supplies the paint, markings and surface detail. Aligned 1024 normal, roughness and metalness maps add the PBR response. The runtime combines ambient occlusion, roughness and metalness in one ORM texture.

The model uses +Y forward and +Z up to match Grid Command. The landing gear retracts during the flight clip. The tailplanes and ailerons have separate pivots. The right rack carries two reusable eight-round rocket pods. The left rack carries two reusable bombs. Rocket commands consume individual rounds while each pod stays attached. Bomb commands release one bomb at a time. The game uses separate rocket and bomb combat values, tracks the rounds at each attachment, and reloads the weapons at the airfield. Destroyed aircraft keep the remaining loadout at the time of loss.

## Reference workflow

The work used these sources:

- [astra_skills](https://github.com/RHS059/astra_skills): hard-surface construction and game-asset checks.
- [TheOrcDev skills](https://github.com/TheOrcDev/skills): game-model cleanup and independent export checks.
- [Blender MCP](https://github.com/bpy-dev/blender-mcp): saved-file execution and inspection.

R4 starts with the side and front guides in `reference_guides`. In Blender, each guide has an image plane and one closed, connected vertex contour. The side contour defines the body length and height. The front contour defines the flat belly, lower chines and upper section. Shared crown and belly datums align the two views. The plan widths are added after both contours are saved.

The body is lofted from those contours. The nose gear stays at 0.6602 of body length from the exhaust. Its bay, trunnion and braces connect to the body. The lower body has a continuous flat run and an angular rise toward the nose. The false step in the generated guide was removed after comparison with the photographs.

The wing and tail contours use the original side and banked views. Perspective hides some root edges. Those dimensions are inferred. `fighter_r4/04_planform_photo_contours.blend` and its render retain the photo trace. The wings have thickness, an integrated root transition, a beveled tip and separate control edges.

Generated guides can invent shapes and mechanisms. Use them as aids, not measured drawings. `fq44-reference-orthos.png` also has unsupported printed dimensions and scale. The original photographs take priority. Hidden mechanisms are inferred and are not claimed as exact aircraft construction.

R1, R2 and R3 remain in local working archives. R4 does not reuse their body mesh or station tables. The saved R4 contour stages remain in `fighter_r4`.

## Checks

Use `fighter_verification.json` for the final mesh and texture counts. Inspect the render views and reimported export as well as the numerical report. Numerical checks do not establish reference fidelity.

Run `pnpm exec tsx --test tests/fury-model.test.ts tests/aircraft-weapons.test.ts tests/models.test.ts tests/vehicle-animation.test.ts` for the asset, texture bridge and animation checks.

The full game test run has 10 failures that also occur at the unchanged base commit `0b84acf`. They concern transport, fuel, sound updates, navigation, purchases and an existing asset assertion. The new model tests pass. The GitHub Pages production build passes.

## Rebuild

Use Blender 4.5. Run these commands from the repository root:

```sh
blender --background --factory-startup --python assets/blender/vehicles/build_fq44.py
blender --background --factory-startup --python assets/blender/vehicles/verify_fq44.py
blender --background assets/blender/vehicles/fighter.blend --python assets/blender/vehicles/audit_fq44_uv.py
```

The canonical build calls `build_fq44_r4_blockout.py`, then `build_fq44_r4.py` and `separate_fq44_weapons.py`. The last step extracts the standard weapon receivers, removes the baked stores from the aircraft, and clears their unused texture regions without moving aircraft UV charts. It runs the source, export, UV, contact and gear checks before it copies the files to the game. Shared mesh, atlas and export functions are in `fq44_asset_pipeline.py`. The build uses the three stored marking masks in `fighter_r2/markings`. No font download is required. The optional mask tool accepts `--font` with a local font path.

The final color texture adds panel seams, access covers and restrained wear to the reference-based gray fields. `fighter_r4/fighter_albedo_imagegen_detail.png` is the authored texture source. The build first recreates the UV layout, then applies this image and packs it into the Blender file and GLB. `fighter_texture_manifest.json` locks the UV layout, geometry and rig with file checksums. A layout change stops the build before this texture is applied. This texture pass does not change the silhouette, normals, rig or vertex count.

Run `generate_fighter_pbr_maps.py` after the color atlas changes. It deterministically derives the tangent normal, roughness, metalness and packed ORM maps from the locked atlas. `fighter_pbr_manifest.json` records their resolution, channel convention and checksums. The separate roughness and metalness files support inspection and other engines; Grid Command samples the packed ORM map to reduce texture reads.

The final R4 airframe export contains 8,983 indexed vertices and 7,824 triangles. The Blender source has 4,126 mesh vertices. The body uses 1,118 source vertices and 2,604 exported vertices. UV seams and normal boundaries increase the export count. `fighter_vertex_budget.json` lists every part. The airframe export has one material and one 1024 × 1024 image. The reusable bomb, rocket pod and rocket use a separate shared 1024 × 1024 atlas. Their source, attachment contract and checks are in `aircraft_weapons/README.md`. The game attaches them from `AIRCRAFT_HARDPOINTS`; they are not part of the airframe mesh or texture.

All 96 airframe mesh objects use the Blender 4.5 Smooth by Angle modifier at 30 degrees. The source has 3,773 edges marked sharp. The modifier keeps those marks. It is stored in the file and does not need an external node library. The marks cover the body chines, belly transitions, bay lips, intake edges, exhaust steps, wing and tail edges, control boundaries and formed doors. The roof and airfoil curves retain smooth normals. Small pins, wheel parts and the exhaust rim use fewer segments to keep the export within the vertex limit. The body, wing and tail contours did not change during this step.

The imported GLB preserves every tested source corner normal. The normal check covers 3,695 edges with split normals and found no mismatched corners. `fighter_verification.json` records the 30-degree setting, sharp-edge count for every component, and the import comparison.

The source and imported GLB have no zero-area faces. Closed shells have positive volume. The sensor window, exhaust ring and intake back face have intentional open boundaries. The exact UV audit found no overlaps. Geometry contact checks cover the gear trunnions, wing roots, tailplanes and fin root. In the flight pose, all gear vertices, edge midpoints and triangle centers are inside the outer body envelope. The smallest measured clearance is 0.052 model units. The bay openings remain visible. The retraction path and hidden mechanism are inferred for the game. Game checks are reported separately from these asset checks.
