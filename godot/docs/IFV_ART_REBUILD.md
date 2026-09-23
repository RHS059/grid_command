# IFV visual rebuild

The IFV keeps its existing role, footprint, forward axis, factory entry and separate `turret` pivot. It now uses a Bradley-inspired component layout. This is an RTS interpretation, not a measured replica of a specific Bradley variant.

## References and construction

- [BAE Systems Bradley page and manufacturer data sheets](https://www.baesystems.com/en-uk/product/bradley-fighting-vehicle).
- [U.S. Army photograph: M2A3 vehicles at MK Air Base](https://www.dvidshub.net/image/6775085/iron-rangers-off-load-military-vehicles-mk-air-base). This front view establishes the glacis, service covers, lamp guards, side skirts and running gear.

The model has six road wheels per side, separate front sprockets and rear idlers, open track loops with 56 shoes per side, segmented side armor, sloped nose service covers, tow eyes, a rear ramp, engine grilles and roof hatches. The turret has a single left-side twin launcher, main gun, coaxial gun, two smoke banks, sight housings, a cupola, a rear basket and two small secured canvas packs. The packs stay under the turret pivot.

Hard plate boundaries use hard normals. Round wheels, hubs and barrels use smooth normals. The old random per-triangle color variation is removed. Broad atlas variation, face-local cavity darkening and restrained edge lift supply the painted depth. Small fittings and lamps stay clean. The body uses FDE for BLUFOR and pine green for REDFOR; rubber, hardware, glass and team marks keep their own colors.

## Asset and runtime contract

`browser_armored_models.gd` remains the IFV factory. The 512-square `hemtt_atlas.png` is reused without editing its pixels, import options, or other users. No new texture is required. The IFV does not use the pneumatic HEMTT tire on tracked road wheels.

| Mesh metric | Previous IFV | Rebuilt IFV |
| --- | ---: | ---: |
| Triangles | 4,380 | 16,384 |
| Stored vertices | 13,140 | 21,491 |
| Meshes / surfaces | 2 / 2 | 2 / 2 |

The added geometry supplies track shoes, round running gear, connected lamp guards, a complete rear ramp and the reference component layout. Mesh indexing reduces repeated vertex storage. The hull and turret geometry is cached per faction, so new units reuse mesh resources instead of rebuilding the geometry. There are still two main draw calls, before shadow passes. No new rigid bodies or simulation work is added.

## Evidence

`tools/render_ground_style.gd -- IFV IFV:red` renders the live factory in Godot 4.7.2, OpenGL Compatibility, with the same neutral light for both teams. Final images are in `build/ground-style-review/`: front-left, rear-right, side, top, close, running-gear, RTS and far views. The final render completed with `GRID_COMMAND_GROUND_STYLE_RENDER_OK`.

`tools/measure_ifv_geometry.gd` reports the mesh totals. If the local archived pre-rebuild script is present under `build/ifv_before_metric.gd`, it also reports the old totals. The archived comparison script restores its original cylinder-wheel helper so the concurrent shared-tire change cannot inflate the baseline.

Visual approval remains with the user. The close view is the strongest gallery view for this asset.
