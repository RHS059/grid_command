# Naval art conversion status

Status: all four naval families have repainted structural atlases and faction materials. Static model and import checks pass. Live-game and moving-LOD acceptance remain open.

## Live asset contract

`AIRCRAFT_CARRIER` resolves to `aircraft_carrier`. `FRIGATE` resolves to `missile_cruiser`. `PATROL_BOAT` and `LANDING_CRAFT` use the matching lowercase names.

All four families use 1024 × 1024 RGB albedo atlases. Each GLB contains an embedded PNG and one atlas material. Extracted material images and canonical albedos are byte-identical. The read-only audit records UV accessor IDs, mesh groups, material names, aliases, and embedded-image checks in `build/naval-style-review/contract.json`.

| Family | Authored LOD files | Verified image aliases |
| --- | --- | --- |
| Aircraft carrier | Base, LOD1 | Canonical, base extraction, LOD1 extraction |
| Missile cruiser | Base, LOD1 | Canonical, base extraction, LOD1 extraction |
| Patrol boat | Base, LOD1, LOD2 | Canonical, base extraction, LOD1 and LOD2 extraction |
| Landing craft | Base, LOD1, LOD2 | Canonical, base extraction, LOD1 and LOD2 extraction |

All four canonical atlases were repainted. The same PNG payload is installed in every extracted alias and embedded GLB, including authored LODs. Image modes and dimensions remain unchanged. A byte comparison against archived source GLBs verifies that geometry and UV buffer data remain unchanged. Nodes, accessors, meshes, textures, and original material contracts also remain unchanged.

## Material pass

`scripts/naval_material.gd` exposes `apply(model, kind, team)`. The helper selects structural mesh groups: hull, island, superstructure, hangar, and bow ramp. The shader changes neutral body paint to FDE or pine green. It retains the atlas value variation. A source-color mask protects near-black windows and waterline details, bright markings, and saturated lamps. Decks, weapons, radar, fittings, and aircraft remain outside the faction paint groups.

The shader uses diffuse lighting, zero metallic response, high roughness, and restrained specular response. It does not replace the authored atlas with procedural surface noise.

## Controlled atlas repaint

Built-in image generation supplied painted style assistance for each family. `tools/install_naval_repaint.py` extracts the structural UV coverage from the original GLB. It selects large connected UV regions and excludes dark, bright, and saturated source pixels. It keeps source color while blending a constrained luminance change from the generated paint. This protects layout and palette compatibility. Small UV regions, deck groups, weapon groups, glass, waterline colors, and functional markings retain the original pixels.

The installer normalizes to 1024-square RGB, preserves the original outside its recorded mask, copies all PNG aliases, and replaces only embedded image payloads in each GLB. Audit assertions verify unchanged pixels outside the mask and unchanged non-image buffer views. Original atlases, GLBs, masks, and generated assistance images are archived in `build/naval-style-review/source/`.

| Family | Structural paint mask pixels | Static review |
| --- | ---: | --- |
| Patrol boat | 378,360 | Both palettes, cabin detail, whole model, distant view pass |
| Landing craft | 366,996 | Both palettes, pilothouse detail, whole model, distant view pass |
| Missile cruiser | 168,303 | Both palettes, bridge detail, whole model, distant view pass |
| Aircraft carrier | 161,102 | Both palettes, island detail, whole model, distant view pass |

## Evidence

Run `tools/audit_naval_contract.py` with Python, Pillow, and NumPy. The audit returned `NAVAL_CONTRACT_OK 4 families` and verified all embedded PNGs and aliases.

Run Godot with `--rendering-method gl_compatibility --script tools/render_naval_style.gd`. The render tool returned `NAVAL_STYLE_RENDER_OK`. It produced 32 images at 1280 × 800 under neutral light: both factions, front, rear, top, and distant views for all four base models. Files are in `build/naval-style-review/`.

Representative evidence:

- `patrol_boat_blue_front.png`: FDE shell, dark glass, neutral weapons and deck.
- `missile_cruiser_red_front.png`: pine hull, preserved waterline and deck markings.
- `aircraft_carrier_blue_top.png`: deck paint, aircraft, and warning marks remain distinct.
- `landing_craft_red_rts.png`: faction body and cargo bay remain readable at reduced projected size.

The review tool uses the production GLB and the material helper. Runtime integration is a separate caller change. It frames each ship by its bounds. Its distant image is a relative-size review, not proof of the game's exact RTS camera scale.

## Open acceptance items

- Patrol boat LOD2 fails close visual acceptance: the hull shows stretched dark slivers at the bow and side. Geometry and UV bytes are unchanged from the source, so this is an existing LOD mapping defect exposed by the repaint. Do not mark this LOD complete.
- Inspect LOD transitions in motion. The authored LODs have static renders; these do not prove that transitions are free of popping.
- Render the ships in the live game at its actual camera distances after runtime integration.
- Compare the material close-ups with the accepted HEMTT under the same light.

Godot emitted existing local user-data/log/cache and certificate-store errors during the review run. Rendering completed. These errors do not establish gameplay or release validation.

