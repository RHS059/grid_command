# Shared vehicle tires

`scripts/shared_vehicle_wheel.gd` is the canonical HEMTT wheel: the existing
textured carcass, staggered chevron tread blocks, projecting hub and CTIS cap.
All instances share a cached mesh with three surfaces. Cylinder UVs and the
existing `hemtt_tire.png` / `ps2_tire.gdshader` contract are retained. Rubber stays
neutral; only the hub paint is selected by the caller.

`create(radius, width, hub_color)` returns a centered Node3D with its axle along
local X. Width describes the carcass; caps extend beyond it. Aircraft batching
must skip nodes carrying `shared_vehicle_wheel` metadata because they are already
batched, retain UVs, and contain three distinct material surfaces.

Covered in this change:

- APC and cannon APC, including authored LOD1: eight tires each, existing wheel
  assembly pivots retained; width fitted to the original total bounds.
- Supply, fuel, troop, medical, repair and FOB HEMTT procedural models.
- Forklift tires through the same support-model wheel function.

Cargo aircraft and transport helicopter integration is owned by the aircraft
model pass; use the component contract above for their landing gear.

IFV and MBT running gear is tracked: their road rollers remain track-specific.
Other imported landing gear needs an explicit hierarchy mapping before safe tire
replacement; embedded tire geometry must not be removed by a broad name match.

Validation: `tests/shared_vehicle_wheel_smoke.gd` verifies 32 APC/LOD wheels,
seven support families, intact UVs, unchanged assembly transforms, and safe
repeated application. Ground/support render harnesses provide inspection images
in `build/ground-style-review` and `build/support-model-review`.
