# Grid Command native port

This repository starts with a measurable vertical slice. It does not attempt to copy every browser feature before native performance is proven.

## First slice

- Stylized 3D tactical terrain and water.
- RTS pan, orbit, and zoom controls.
- Selectable blue and red land, air, and naval units.
- Move orders, simulation pause, and time controls.
- Existing production GLB models and textures.
- Unit-only contour lighting and basic vehicle effects.
- Frame-time and object-count display.

## Next port stages

1. Record CPU, GPU, draw-call, and frame-time baselines on the Windows build.
2. Move deterministic battle state into a fixed-timestep simulation service.
3. Port objectives, capture rules, visibility, weapons, damage, logistics, and service behavior.
4. Add MultiMesh batches and distance LODs where measurements show a benefit.
5. Port the command, radio, procurement, and model-viewer interfaces.
6. Add save files, replay data, sound, and distribution packaging.

The TypeScript game remains the behavior reference until each native subsystem has a deterministic test fixture.

