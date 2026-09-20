# Reusable tank equipment

The tank uses five named object roots from `assets/models/vehicle_greebles.glb`.
The editable Blender source, reproducible builder, and generated orthographic
reference sheet are retained alongside the export. The reference is a design aid,
not measured equipment documentation. These are deliberately compact strategy-view
props with material colors and modeled straps/hardware; no close-view PBR bake or
separate prop collision is claimed.

| Item | Mount | Nominal width | Visible support |
| --- | --- | ---: | --- |
| Transit case | Turret rear bustle | 0.64 m | Rack floor |
| Rolled tarp | Turret rear bustle | 0.592 m | Rack floor and straps |
| Duffel | Turret rear bustle | 0.685 m | Rack floor and straps |
| Field rucksack | Left turret side | 0.65 m | Back contacts the stowage box |
| Jerry can | Right rear hull fender | 0.39 m including carrier | Carrier tray, retaining band |

`data/vehicles/tank_stowage.json` is the shared placement source for Godot and
Blender review renders. Positions use meters in the imported assembly's local
Y-up coordinates. The tank's hull is approximately 3.64 by 7.2 meters and the
turret pivot is `(0, 1.8, 0.25)` in Godot. Blender maps `(x,y,z)` to `(x,z,-y)`.
Equipment is attached before the combat or model-preview normalization, so both
entry points preserve its physical proportion. Four item roots are direct children
of `Assembly_turret`; the can is a direct child of `Assembly_hull`.

The library's presentation-row root offsets are discarded when mounting. Static
components are consolidated by material inside each item for 13 exported meshes;
the saved Blender source retains separate editable parts. `assets/blender/.gdignore`
keeps source blends out of Godot's automatic Blender importer.

Secondary motion samples actual turret rotation and the vehicle drive state.
Turret movement affects only turret equipment. Lift is limited to 3 mm for fabric
and 1 mm for hard cases, with less than one degree of sway. Motion decays to the
exact rest pose when stopped. Preview camera orbit alone does not animate cargo.

## Rebuild and validate

Run the following from the project directory with Blender and Godot available:

```text
blender --background --python tools/build_vehicle_greebles_blender.py
godot --headless --path . --editor --import --quit
godot --headless --path . --script tests/vehicle_stowage_smoke.gd
blender --background --python tools/render_tank_stowage_blender.py
godot --path . --script tools/render_tank_stowage.gd
```

The focused Godot test checks imported geometry, asset count, meter scale, direct
parenting, 90-degree turret slew, hull independence, secondary motion bounds,
and complete idle settling. CombatUnit and NativeWorkspaces parse checks and the
project's main smoke check also passed under Godot 4.7.2. This sandbox reports
user-log/cache-directory and certificate-store errors; they did not prevent
the smoke checks or OpenGL renders.

The review scripts read the actual exported GLBs. They write rear, front, detail,
and Godot rear/slewed images into `build/stowage-review/`, along with a Blender
round-trip dimension/triangle report and review blend. The Godot slewed view uses
a 65-degree turret rotation to expose parenting mistakes. Rendered review showed
the bustle equipment seated in the existing rack and the can staying on its hull
fender while the turret moved. Generated previews are local evidence, not runtime
resources.
