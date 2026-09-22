# Ground vehicle style status

Target: diffuse-led military art with 2004-era readability. Current HEMTT remains
the surface benchmark. This pass establishes common faction paint; it is not a
claim that every atlas has received a finished hand-painted weathering pass.

## Live model inventory and work status

| Asset | Live path | This pass | Remaining art work |
|---|---|---|---|
| Tank | `assets/models/tank.glb`; `scripts/tank_material.gd` overrides albedo with `tank_albedo_ps2.png` | Existing detailed diffuse retained; selective FDE / pine palette and restrained specular added | Reduce all-over mottling on small islands; localize edge dodge; review under gameplay lighting |
| APC | `assets/models/apc.glb` | Existing atlas values/seams preserved; FDE / pine palette added | Authored cavities, exposed-edge wear and broad-panel grunge |
| Cannon APC | `assets/models/cannon_apc.glb` | Same Stryker atlas and palette adapter as APC | Same repaint, then turret-specific review |
| IFV | `scripts/browser_armored_models.gd` | Body, upper planes and recesses now share HEMTT faction palette; armor metallic response removed | Authored diffuse/face detail; currently vertex-colored construction |
| M977 supply, fuel, troop, medical, recovery, FOB HEMTT | `scripts/browser_support_models.gd` | Existing benchmark preserved | Recheck small-part cleanliness against the guide; full deployment review |
| Forklift / UAV jammer | `scripts/browser_support_models.gd` | Already use HEMTT atlas and team material factory; preserved | Vehicle-specific close-up and RTS approval |
| Troop truck / troop transport | Expected `assets/models/troop_transport.glb` | No source GLB exists in this checkout | Restore/author source before repaint; existing gameplay fallback unchanged |
| Amphibious APC | Expected `assets/models/amphibious_apc.glb` | No source GLB exists in this checkout | Restore/author source before repaint; existing gameplay fallback unchanged |

## Contracts preserved

- Tank albedo and ORM sheets are 1024 x 1024, 8-bit RGB. The PS2 override remains
  separate from `tank_albedo.png` and `tank_tank_albedo.png`.
- Stryker albedo/ORM sheets are 1024 x 1024, 8-bit RGB. Albedo aliases
  `stryker_albedo.png`, `apc_stryker_albedo.png`, `apc_lod1_stryker_albedo.png`,
  `cannon_apc_stryker_albedo.png`, `cannon_apc_lod1_stryker_albedo.png` have matching
  SHA-256 hashes at audit. None were rewritten.
- HEMTT atlas is 512 x 512, 8-bit grayscale; tire sheet is 512 x 512,
  grayscale plus alpha (rim mask). Palette ramp shaders interpret these as
  data, not authored sRGB paint. Those files and shaders are unchanged.
- Imported albedo uses sRGB sampling. ORM files and normal contracts are untouched.
  The runtime palette material deliberately uses roughness 0.9, metallic 0 and
  specular 0.15 rather than restoring a modern metallic response from ORM.
- UVs, texture names, imported GLBs, meshes, deployment structures, and gameplay
  mappings are unchanged. No guessed panel borders or world-space noise added.

## Adapter and review

`ground_vehicle_material.gd.apply(model, team, kind)` supports `tank`, `apc` and
`cannon_apc` only. Run after the tank albedo override and before adding separate
stowage. It selectively remaps warm/olive paint while preserving authored value
detail and cool/neutral/color-signal materials. The color classifier is a
transitional mechanism: explicit authored paint masks are preferable when the
Stryker atlas is repainted. Retest any new colored markings against it.

`tools/render_ground_style.gd` renders both factions without changing source
assets. The default batch renders tank/APC/IFV; pass `CANNON_APC CANNON_APC:red`
to inspect the cannon variant. Outputs are under `build/ground-style-review/`.
Front three-quarter renders were inspected for both factions: paint separates,
black running gear and blue glass retain their identity. Tank has strong
existing painted detail; APC and IFV are visibly awaiting the detail pass.

Godot 4.7.2 headless editor import completed. The OpenGL Compatibility render
batch completed without GDScript or shader compilation failures. The sandbox
reported existing user-directory/log/certificate/update-cache errors; rendering
still wrote the PNGs successfully.

