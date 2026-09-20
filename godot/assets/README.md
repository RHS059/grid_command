# Grid Command runtime assets

These are existing committed runtime assets from
[RHS059/grid_command](https://github.com/RHS059/grid_command/tree/a64ac714f5c9e7f5630c69b3c55caa0ec5b81833/public),
revision `a64ac714f5c9e7f5630c69b3c55caa0ec5b81833`, copied for the project owner's
Godot migration. No assets were downloaded from another project. Blender work
files, photographic references, intermediate renders and review evidence are
excluded. GLB and PNG bytes are unchanged. JSON uses the committed LF bytes,
independent of Windows checkout line endings.

`provenance.json` records each source path, Git blob, SHA-256, size and structural
validation metadata. `catalog.json` records Godot resource paths, orientation,
companion textures, LODs and collision meshes. The source repository root does
not contain a standalone license grant; this copy does not introduce a new
license or grant rights beyond those held by the project owner.

| Model | Primary GLB | Included companions |
| --- | --- | --- |
| FQ-44 Fury | `models/fighter.glb` | Albedo, normal, ORM, roughness, metalness |
| Tank | `models/tank.glb` | Albedo, ORM |
| APC | `models/apc.glb` | LOD1, shared Stryker albedo and ORM |
| Cannon APC | `models/cannon_apc.glb` | LOD1, shared Stryker albedo and ORM |
| Aircraft carrier | `models/aircraft_carrier.glb` | LOD1, collision mesh, albedo, source rig and geometry JSON |
| Missile cruiser | `models/missile_cruiser.glb` | LOD1, collision mesh, albedo; source gameplay role is `FRIGATE` |
| CAS aircraft | `models/cas.glb` | Albedo, ORM |
| Reconnaissance UAV | `models/recon_uav.glb` | Albedo, ORM |
| Patrol boat | `models/patrol_boat.glb` | LOD1, LOD2, collision mesh, albedo |
| Landing craft | `models/landing_craft.glb` | LOD1, LOD2, collision mesh, albedo |
| Aircraft stores | `models/aircraft_weapons.glb` | Albedo; bomb, rocket and rocket-pod assemblies |
| Aircraft fuel tank | `models/aircraft_fuel_tank.glb` | Albedo, ORM |

The shared `textures/vehicle_destroyed_mask.png` is also included. Its source
README describes an ImageGen-derived grayscale scorch mask, tiled with mirrored
borders and projected on local axes by the original game's destroyed material.
It does not require rewriting vehicle UVs.

## Import contract

- Preserve the GLB's authored scale and named part hierarchy. GLBs include their
  material images; standalone texture copies allow explicit Godot materials.
- `fighter.glb` and `aircraft_weapons.glb` retain Z-up, +Y-forward coordinates.
  Rotate an outer visual wrapper by -90 degrees around X to obtain Godot Y-up,
  -Z-forward coordinates. The other selected GLBs already use Y-up coordinates.
  Leave the imported scenes unchanged so hashes and source pivots remain stable.
- Use albedo as color data. ORM and normal maps are data textures. ORM channels
  are R=ambient occlusion, G=roughness, B=metallic. The FQ-44 normal map uses the
  OpenGL +Y convention, as documented by the source fighter PBR manifest.
- LOD and collision companions are separate GLBs. Their presence does not
  automatically configure runtime LOD switching or Godot physics shapes.
- Carrier JSON preserves the original renderer's companion data. Godot can load
  the GLB without using the original packed-geometry JSON or its rig metadata.
- The catalog supplies asset metadata, not gameplay balance, capacities or
  unit definitions.

## Reproduce and validate

Python 3.10 or newer is required; the tool uses only the standard library.
Validation works in a standalone Godot checkout without Git or the source repo:

```sh
python tools/sync_assets.py validate --report tools/asset_validation_report.json
```

To reproduce the copy from an existing Grid Command checkout:

```sh
python tools/sync_assets.py sync --source-root ../grid_command --report tools/asset_validation_report.json
```

Sync checks the origin repository, pinned revision and each committed source Git
blob before writing any asset. It rejects changed binaries and substantive JSON
edits. It only writes the explicit selection, provenance and catalog; it does not
delete other assets or touch source files. `--source-commit` permits an intentional
revision update; review resulting manifest/hash changes before committing.

Validation checks copied byte counts and hashes against provenance; GLB version,
chunk bounds, JSON, buffers, views, accessor bounds and mesh/node references;
and external plus GLB-embedded PNG signatures, chunk CRCs, zlib payloads, scanline
lengths and filters. It also checks both companion JSON files parse. Output is
deterministic: no machine paths or timestamps are included in the report.
This is a scoped structural check, not the full Khronos conformance validator or
a visual/import test in Godot.

The initial report passes for **47 files / 28,910,264 bytes**: **24 GLBs, 21 PNGs,
2 JSON files**. Per-file sizes and SHA-256 values are in
`../tools/asset_validation_report.json` and `provenance.json`.
