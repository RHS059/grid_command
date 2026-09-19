# FQ-44 pre-cut breakup contract

This is a destroy-only companion to the approved R4 aircraft. The intact `fighter.glb`, its packed game geometry, rig and 1024 × 1024 color atlas are preserved byte-for-byte. The game consumes `lib/game/generated/fighter_breakup.json`; the editable Blender scene and GLB here retain every manufactured component under nine named section nodes.

| Section | Contents | Anchor | Approximate mass fraction | Detach threshold |
| --- | --- | --- | ---: | ---: |
| `nose` | Forward fuselage, probe and sensor window | center | 0.120 | 0.52 |
| `wing_L` | Left wing, control, pylon and rack | center | 0.105 | 0.42 |
| `wing_R` | Right wing, control, pylon and rack | center | 0.105 | 0.42 |
| `tail` | Fin, fairing and both elevators | engine | 0.080 | 0.36 |
| `engine` | Rear fuselage, exhaust collar and recess | center | 0.200 | 0.68 |
| `center` | Center fuselage, intake and antennas | root | 0.300 | 1.00 |
| `gear_N` | Nose wheel, strut, doors and fixed trunnion | center | 0.020 | 0.26 |
| `gear_L` | Left main gear and fixed trunnion | center | 0.035 | 0.30 |
| `gear_R` | Right main gear and fixed trunnion | center | 0.035 | 0.30 |

The body is cut at model-space Y=2.40 and Y=-3.15. Both sides of each cut have actual planar closure geometry. The cuts avoid the gear bays. Exterior UVs and interpolated source normals are retained. Existing wing, tail and gear solids already have closure faces. The nozzle ring, sensor window and intake back plate retain their declared open-surface construction.

The four new cap faces intentionally reuse a reserved 32 × 32 pixel gray region of the existing atlas, with at least eight pixels of separation from the conservative bounds of exterior UV triangles. This is a documented stack for low-detail interiors, not a new uniquely painted unwrap. It adds no texture or material. The caps represent structural closure; internal engine, avionics, torn edges and wiring are not modeled.

`sections.json` is the readable contract without packed geometry. Each section contains `id`, exported `node`, `anchorSection`, a bounds-center `pivot`, `massFraction`, `collider.halfExtents` and `collider.radius`, `detachThreshold`, and exact per-object vertex/index `ranges`. `geometry` in the game JSON follows the existing packed `Part` format (`q/n/s/i/palette/indices/uv/normals/texture`). Its positions remain aircraft-local coordinates, +Y forward and +Z up, in meters. A runtime object should use the section pivot as its origin and subtract it from decoded positions once. Ranges refer to the corresponding section's decoded geometry. `sourceTriangleRanges` in `verification.json` refers to zero-based triangles in each original GLB object.

Mass fractions total one. They, normalized detach thresholds, bounds-center pivots and box/sphere colliders are gameplay approximations, not engineering measurements. No physics constraints or authored explosion animation are embedded in the companion GLB.

Gear and controls are authored in the deployed/rest pose. When matching a live aircraft pose, apply the existing animation transform to the ranges whose `sourcePart` is `gear_*`, `control_*` or `tail_*`. Fixed trunnion ranges retain `sourcePart: hull` even though they are grouped with the detachable gear. They must stay at their hull attachment position until breakup. The separately mounted reusable weapons are not included in airframe geometry.

Rebuild and verify from the repository root with Blender 4.5:

```text
blender --background --factory-startup --python-exit-code 1 --python assets/blender/vehicles/build_fq44_breakup.py
blender --background --factory-startup --python-exit-code 1 --python assets/blender/vehicles/verify_fq44_breakup.py
```

The builder checks positive volumes and closed structural boundaries after diagnostic welding, zero degenerate faces, hull volume/exterior-area preservation, complete source-triangle coverage, exact embedded atlas hash, and source corner-normal preservation after a clean GLB import. `assembled.png` and `exploded.png` are rendered from that fresh import. The verifier compares every packed index, position, UV, normal and contiguous span against the saved GLB, including quantization error and collider coverage. These are asset checks; the runtime integration owns gameplay motion and browser validation.

Measured output: **9,465 indexed vertices, 8,256 triangles, 98 component meshes, nine section nodes, one material and one 1024 × 1024 color atlas**. The original airframe remains 8,983 indexed vertices. Full measurements and source hashes are in `verification.json`.
