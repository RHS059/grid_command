# Air and naval vehicle art status

Audit date: 2026-09-22. Target: diffuse-driven 2004 military game art, using the current HEMTT as the surface-quality benchmark. This is an initial normalization pass, not a completed fleet texture conversion.

## Completed

- Procedural cargo aircraft and transport helicopter now use BLUFOR FDE (`#a58d68`) and REDFOR pine-green (`#4b6046`) body paint. Large shells use the HEMTT diffuse atlas through its model-space shader; small parts, rubber, glazing, metal and team markings remain separate clean materials. Glazing has restrained reflectivity.
- FQ-44, CAS and recon UAV have six faction-specific 1024 x 1024 RGB diffuse variants in `assets/textures/vehicles/aircraft`. Image-generated source paints were normalized against original paint-color regions, retaining original boundaries, seams and markings. Generated surface variation is limited to connected paint regions of at least 1800 texels; small regions receive clean palette paint. Variation is bounded to avoid noisy weathering or generated border drift.
- `scripts/air_naval_material.gd` clones supported air/naval materials per instance and sets metallic to zero, specular to 0.2 and roughness to at least 0.82. Aircraft receive the corresponding faction albedo; data-map references, UV transforms, alpha settings, geometry, animation and gameplay dimensions are preserved. Unsupported kinds are a no-op. Named FQ-44 sensors, exhaust, navigation lights and landing gear retain original albedo pixels.
- Imported atlas contracts inventoried. All listed albedos decode as 1024 x 1024 RGB PNGs. Every extracted and explicit LOD albedo alias matches its family's base file by SHA-256.
- Godot 4.7.2 headless editor import completed without script parse errors. Host emitted certificate-store and user-directory warnings. Visual approval is still required.

## Imported asset contracts

| Asset | Material slot | Base albedo SHA-256 prefix | Explicit LODs | Remaining art work |
|---|---|---|---|---|
| FQ-44 fighter | FQ44_Single_Atlas | 61688c8bf1b3 | None; generated import LODs | Faction diffuse variants complete; visual acceptance pending |
| CAS | cas_material | 7aac4ab7db0a | None | Faction variants complete; packed metallic/roughness reference retained |
| Recon UAV | recon_uav_material | a465d06986b6 | None | Faction variants complete; packed metallic/roughness reference retained |
| Aircraft carrier | aircraft_carrier_atlas | 28bd9f94d30f | LOD1, separate collision GLB | Large hull weathering, edge lift and faction paint regions |
| Missile cruiser/frigate | missile_cruiser_atlas | 7fd68081e866 | LOD1, separate collision GLB | Same; preserve deck and warning markings |
| Patrol boat | patrol_boat_atlas | 813a2a6c24e8 | LOD1/LOD2, separate collision GLB | Same |
| Landing craft | landing_craft_atlas | 6f2889d5e993 | LOD1/LOD2, separate collision GLB | Same |

Each imported model currently uses one mixed-material atlas, so whole-material faction tint would recolor glass, apertures, lights and markings. No whole-atlas tint or unvalidated repaint was applied. Base filenames are `<asset>_albedo.png`; aliases are `<asset>_<asset>_albedo.png` and, where present, `<asset>_lodN_<asset>_albedo.png`. Future edits must update every alias and the source/import contract together. Do not modify collision GLBs for appearance changes.

## Pending conversion and acceptance

1. Map paint regions against actual model UVs; approve BLUFOR and REDFOR variants while keeping small fittings clean and all material categories distinct.
2. Paint restrained dodge/burn cavity darkening and edge lift; add broad grunge only to large exposed hull/fuselage areas. Avoid directional cast shadows, photographic grain and uniform dirt across hardware.
3. Improve procedural cargo/transport geometry and add face-local UV2 edge coordinates if further HEMTT-level edge dodge is needed. Broad atlas variation is present; a projected texture alone cannot add missing modeled panels or silhouette detail.
4. Supply authored attack/VTOL/heavy-lift models: `vtol_attack.glb`, `vtol_cargo.glb`, and `mec_lift.glb` are absent in this Godot asset directory, so those kinds currently use fallback geometry. They cannot pass HEMTT-quality silhouette or texture review yet.
5. Review each faction from front/rear three-quarter, close-up and gameplay distance, plus explicit LODs, under identical lighting. Inspect deck lettering, glass, rotor/propeller clearance and team-marker readability. No air/naval screenshot is claimed as final visual approval in this pass.

Infantry remains outside this pass.

## Aircraft evidence

`tools/normalize_aircraft_atlases.gd` is the reproducible contract-normalization step; generated originals remain under `assets/textures/vehicles/aircraft/source/`. Existing model files, base atlases, extracted aliases, ORM and normal files are unchanged. A pixel comparison verified **zero changed protected pixels** in all six variants, and confirmed RGB mode and 1024-square dimensions. FQ-44 GLB UV inspection located the optical window near (987,343)-(994,352) and nozzle near (466,973)-(588,1017); named submesh protection also covers the scattered exhaust-recess islands.

Godot 4.7.2 Compatibility renderer completed `tools/render_aircraft_style.gd`, producing 30 images under `build/aircraft-style-review/`: each of five aircraft in both factions, close front, rear and RTS distance. Reviewed examples: `fighter_blue_close.png`, `fighter_red_rts.png`, `cas_red_close.png`, `recon_uav_red_close.png`, `transport_heli_blue_close.png`, and `cargo_plane_red_close.png`. Glass, white markings, navigation colors and dark mechanical parts remain distinct. The first fighter review had excessive camouflage contrast; normalization was adjusted and all captures regenerated. Procedural aircraft remain visibly simpler than the authored aircraft and HEMTT benchmark.

Reproduce: run the normalizer headless, then an editor import, then `--rendering-method gl_compatibility --script tools/render_aircraft_style.gd`. The capture log ends `AIRCRAFT_STYLE_RENDER_OK`; this host also reports pre-existing user-directory, certificate-store and updater JSON errors.

