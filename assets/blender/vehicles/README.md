# FQ-44 Fury

This asset replaces the `JET` strike fighter. The five supplied photographs define its shape and paint. Dimensions hidden by perspective are estimates.

The game uses `lib/game/generated/fighter.json` and its rig file. `public/models/fighter.glb` is the interchange export. Both use indexed vertices, texture coordinates and authored normals. One 1024 × 1024 color texture supplies the paint, markings and surface detail. Roughness and metalness are scalar values.

The model uses +Y forward and +Z up to match Grid Command. The landing gear retracts during the flight clip. The original combat values are retained.

## Reference workflow

The work used these sources:

- [astra_skills](https://github.com/RHS059/astra_skills): hard-surface construction and game-asset checks.
- [TheOrcDev skills](https://github.com/TheOrcDev/skills): game-model cleanup and independent export checks.
- [Blender MCP](https://github.com/bpy-dev/blender-mcp): saved-file execution and inspection.

`fq44-reference-orthos.png` is an image-generated aid made from all five photographs. Its printed dimensions and scale are unsupported. Do not use them as measured values. The photographs take priority when the generated views disagree.

The rejected first version is kept in the local working archive. It is not the production asset.

## Checks

Use `fighter_verification.json` for the final mesh and texture counts. Inspect the render views and reimported export as well as the numerical report. Numerical checks do not establish reference fidelity.

Run `pnpm exec tsx --test tests/fury-model.test.ts tests/models.test.ts tests/vehicle-animation.test.ts` for the asset, texture bridge and animation checks.

The full game test run has 10 failures that also occur at the unchanged base commit `0b84acf`. They concern transport, fuel, sound updates, navigation, purchases and an existing asset assertion. The new model tests pass. The GitHub Pages production build passes.

## Rebuild

Use Blender 4.5. Run these commands from the repository root:

```sh
blender --background --factory-startup --python assets/blender/vehicles/build_fq44.py
blender --background --factory-startup --python assets/blender/vehicles/verify_fq44.py
blender --background assets/blender/vehicles/fighter.blend --python assets/blender/vehicles/audit_fq44_uv.py
```

The build uses the three stored marking masks in `fighter_r2/markings`. No font download is required. The optional mask tool accepts `--font` with a local font path.

The final export contains 9,375 indexed vertices and 10,732 triangles. The Blender source has 5,588 mesh vertices. UV seams and normal boundaries increase the export count. The export has one material and one 1024 × 1024 image.

The source and imported GLB have no zero-area faces. Closed shells have positive volume. The sensor window, exhaust ring and intake back face have intentional open boundaries. The exact UV audit found no overlaps. The final 14 model and animation tests and TypeScript check pass.
