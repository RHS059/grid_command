# Ground vehicle style status

Target: diffuse-led military art with 2004-era readability. Current HEMTT remains
the surface benchmark. Tank and Stryker atlases now have an authored repaint;
IFV now has a masked painted-surface pass. All four have rendered evidence,
but final scene-wide acceptance and moving-camera review remain separate gates.

## Live model inventory and work status

| Asset | Live path | This pass | Remaining art work |
|---|---|---|---|
| Tank | `assets/models/tank.glb`; `scripts/tank_material.gd` overrides albedo with `tank_albedo_ps2.png` | Repaint reduces dense mottling, cleans small islands, retains broad lower-panel aging and local edge wear; both factions rendered close/RTS | Final in-game comparison and moving-camera acceptance; lower-panel weathering remains intentionally stronger |
| APC | `assets/models/apc.glb` | Repaint adds seam burn, raised-edge dodge and large-panel grunge; black tires and blue glass preserved; both factions rendered close/RTS | Final in-game comparison and moving-camera acceptance |
| Cannon APC | `assets/models/cannon_apc.glb` | Shares repainted Stryker atlas including LOD; turret and both factions rendered close/RTS | Final in-game comparison and moving-camera acceptance |
| IFV | `scripts/browser_armored_models.gd` | Large-part-only broad variation, face cavity/edge bands, HEMTT tire details and track joints; fittings stay clean; both factions rendered close/RTS | Base silhouette/running gear remain simpler than HEMTT; final in-game comparison and moving-camera acceptance |
| M977 supply, fuel, troop, medical, recovery, FOB HEMTT | `scripts/browser_support_models.gd` | Existing benchmark preserved | Recheck small-part cleanliness against the guide; full deployment review |
| Forklift / UAV jammer | `scripts/browser_support_models.gd` | Already use HEMTT atlas and team material factory; preserved | Vehicle-specific close-up and RTS approval |
| Troop truck / troop transport | Expected `assets/models/troop_transport.glb` | No source GLB exists in this checkout | Restore/author source before repaint; existing gameplay fallback unchanged |
| Amphibious APC | Expected `assets/models/amphibious_apc.glb` | No source GLB exists in this checkout | Restore/author source before repaint; existing gameplay fallback unchanged |

## Contracts preserved

- Tank albedo and ORM sheets are 1024 x 1024, 8-bit RGB. All three albedo names
  (`tank_albedo_ps2.png`, `tank_albedo.png`, `tank_tank_albedo.png`) now match.
- Stryker albedo/ORM sheets are 1024 x 1024, 8-bit RGB. Albedo aliases
  `stryker_albedo.png`, `apc_stryker_albedo.png`, `apc_lod1_stryker_albedo.png`,
  `cannon_apc_stryker_albedo.png`, `cannon_apc_lod1_stryker_albedo.png` have matching
  SHA-256 hashes after the repaint. All five aliases were synchronized.
- HEMTT atlas is 512 x 512, 8-bit grayscale; tire sheet is 512 x 512,
  grayscale plus alpha (rim mask). Palette ramp shaders interpret these as
  data, not authored sRGB paint. Ground work only reads these existing files.
- Imported albedo uses sRGB sampling. ORM files and normal contracts are untouched.
  The runtime palette material deliberately uses roughness 0.9, metallic 0 and
  specular 0.15 rather than restoring a modern metallic response from ORM.
- Imported UVs, texture names, meshes, deployment structures, and gameplay
  mappings are unchanged. `tools/embed_ground_albedos.cjs` replaces only embedded
  base-color image buffer views in tank/APC/cannon APC and their existing LODs.
  All non-image binary views remain identical. IFV merges to one hull surface
  and one turret surface, carrying face coordinates and material masks in UVs;
  no triangles are added. Its texture variation is model-local, not world-space.

Final SHA-256:

- Tank aliases: `9F2F5EA335D3C6B9374D03015AD7C516BA41DCCE25A8005C4FA39DD80404130C`
- Stryker aliases: `B0111CA7E886293FAAF835EF98EAEB441EA99E4DCA690D376CA9D7548E3CAACF`

## Adapter and review

`ground_vehicle_material.gd.apply(model, team, kind)` supports `tank`, `apc` and
`cannon_apc` only. Run after the tank albedo override and before adding separate
stowage. It selectively remaps warm/olive paint while preserving authored value
detail and cool/neutral/color-signal materials. The color classifier is a
transitional mechanism: explicit authored paint masks remain preferable for
future new markings. Retest any new colored markings against it.

`tools/render_ground_style.gd` renders both factions without changing source
assets. The default batch renders tank/APC/IFV; pass `CANNON_APC CANNON_APC:red`
to inspect the cannon variant. Outputs are under `build/ground-style-review/`.
The final batch covers all four vehicles, both factions, front/rear/side/top,
close primary structure, running gear, RTS and farther distance. Close and RTS
renders were inspected: faction paint separates; black running gear and blue
glass retain their identity. Tank is less noisy, Stryker panels now show depth,
and IFV wheel faces/track joints now read. IFV remains the simplest model.

Godot 4.7.2 headless editor import completed. The OpenGL Compatibility render
batch completed without GDScript or shader compilation failures. The sandbox
reported existing user-directory/log/certificate/update-cache errors; rendering
still wrote the PNGs successfully.

## Authorship record

Built-in image generation edited the exact tank and Stryker source atlases.
Both were normalized with the vehicle-texture skill's `normalize_atlas.py` to
1024-square RGB, then inspected on the live imported vehicles. Prompt intent:
preserve UV islands/semantic regions, reduce tank fine mottling, keep small parts
clean, add restrained large-panel dirt, narrow cavity burn and selected edge
dodge; retain rubber, glass, grilles and signal colors. Generated concept images
are not the implementation evidence: `build/ground-style-review/*_close.png`
and `*_rts.png` are actual Godot renders of the production assets/materials.

