# Air and naval vehicle art status

Audit date: 2026-09-22. Target: diffuse-driven 2004 military game art, using the current HEMTT as the surface-quality benchmark. This is an initial normalization pass, not a completed fleet texture conversion.

## Completed

- Procedural cargo aircraft and transport helicopter now use BLUFOR FDE (`#a58d68`) and REDFOR pine-green (`#4b6046`) body paint. Rubber, glazing, metal and team markings remain separate materials. Glazing has restrained reflectivity.
- `scripts/air_naval_material.gd` clones supported air/naval materials per instance and sets metallic to zero, specular to 0.2 and roughness to at least 0.82. It preserves all texture/channel references, UV transforms, alpha settings, geometry, animation and gameplay dimensions. Unsupported kinds are a no-op.
- Imported atlas contracts inventoried. All listed albedos decode as 1024 x 1024 RGB PNGs. Every extracted and explicit LOD albedo alias matches its family's base file by SHA-256.
- Godot 4.7.2 headless editor import completed without script parse errors. Host emitted certificate-store and user-directory warnings. Visual approval is still required.

## Imported asset contracts

| Asset | Material slot | Base albedo SHA-256 prefix | Explicit LODs | Remaining art work |
|---|---|---|---|---|
| FQ-44 fighter | FQ44_Single_Atlas | 61688c8bf1b3 | None; generated import LODs | Paint-region faction masks; broad fuselage variation and cavities |
| CAS | cas_material | 7aac4ab7db0a | None | Same; retain packed metallic/roughness reference |
| Recon UAV | recon_uav_material | a465d06986b6 | None | Same; retain packed metallic/roughness reference |
| Aircraft carrier | aircraft_carrier_atlas | 28bd9f94d30f | LOD1, separate collision GLB | Large hull weathering, edge lift and faction paint regions |
| Missile cruiser/frigate | missile_cruiser_atlas | 7fd68081e866 | LOD1, separate collision GLB | Same; preserve deck and warning markings |
| Patrol boat | patrol_boat_atlas | 813a2a6c24e8 | LOD1/LOD2, separate collision GLB | Same |
| Landing craft | landing_craft_atlas | 6f2889d5e993 | LOD1/LOD2, separate collision GLB | Same |

Each imported model currently uses one mixed-material atlas, so whole-material faction tint would recolor glass, apertures, lights and markings. No whole-atlas tint or unvalidated repaint was applied. Base filenames are `<asset>_albedo.png`; aliases are `<asset>_<asset>_albedo.png` and, where present, `<asset>_lodN_<asset>_albedo.png`. Future edits must update every alias and the source/import contract together. Do not modify collision GLBs for appearance changes.

## Pending conversion and acceptance

1. Map paint regions against actual model UVs; approve BLUFOR and REDFOR variants while keeping small fittings clean and all material categories distinct.
2. Paint restrained dodge/burn cavity darkening and edge lift; add broad grunge only to large exposed hull/fuselage areas. Avoid directional cast shadows, photographic grain and uniform dirt across hardware.
3. Give procedural cargo/transport airframes UV-backed diffuse detail. Current changes establish palette and material response only; they do not add faux-cavity/grunge textures.
4. Supply authored attack/VTOL/heavy-lift models: `vtol_attack.glb`, `vtol_cargo.glb`, and `mec_lift.glb` are absent in this Godot asset directory, so those kinds currently use fallback geometry. They cannot pass HEMTT-quality silhouette or texture review yet.
5. Review each faction from front/rear three-quarter, close-up and gameplay distance, plus explicit LODs, under identical lighting. Inspect deck lettering, glass, rotor/propeller clearance and team-marker readability. No air/naval screenshot is claimed as final visual approval in this pass.

Infantry remains outside this pass.

