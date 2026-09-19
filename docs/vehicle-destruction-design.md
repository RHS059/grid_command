# Vehicle destruction design

## Goal

Large vehicles must show progressive damage, break into readable sections, settle as wrecks, and keep a predictable frame cost. The render effect and physical breakup use separate systems because a fragment shader cannot create rigid bodies or change collision.

## Verified references

- PlatinumGames describes *Metal Gear Rising: Revengeance* as an arbitrary-cutting system with high memory use. The engine spread cutting work across several frames and completed it before the sword swing ended. This was an engine geometry system, not an alpha-only effect: <https://www.platinumgames.com/official-blog/article/4732>
- The official Halo Bulletin states that the *Halo 4* incineration effect started as the Knight death effect and was then used for Promethean weapon kills. Public primary material does not describe its exact shader or geometry implementation: <https://halo.bungie.org/halobulletins/68>
- Interior mapping raycasts virtual interior planes in the fragment shader. It can give a shallow impact cavity visible depth without extra cavity geometry: <https://www.proun-game.com/Oogst3D/CODING/InteriorMapping/InteriorMapping.pdf>
- Epic's Chaos guidance uses pre-fractured geometry, clustered rigid bodies, connection graphs, intact proxies, simple collision, debris removal, and active-body limits. These patterns apply to this engine even though it does not use Chaos: <https://dev.epicgames.com/documentation/unreal-engine/destruction-overview> and <https://dev.epicgames.com/documentation/unreal-engine/chaos-destruction-optimization?application_version=5.6>

## Render material

The material has two independent controls:

- `damage`: scorch, exposed metal, roughness, small normal detail, and soot.
- `destruction`: holes and removal. Zero keeps every surface pixel. One removes the complete render surface.

The destruction field stays fixed in object space. Increasing the threshold removes more of the field, so removed areas cannot return. A narrow band on the retained side of the threshold creates a charred rim. A second stable noise field selects a few rim regions for deep-red and orange emission.

Close impact cavities use a parallax-style recessed back wall. Large perforations use alpha test and a thin interior shell or capped pre-cut section. The visible pass, shadow pass, depth pass, and picking rules must use the same threshold.

## Physical breakup

Use this lifecycle:

`intact -> damaged -> sections detach -> explosion -> sections settle -> static wreck`

Author 8–20 meaningful sections for each large vehicle. Examples include wings, fins, engines, turret groups, road-wheel groups, and hull panels. Give each section a capped interior and one simple convex collision shape.

Only detached sections become physics bodies. Start with 4–12 nearby colliding bodies for one explosion and enforce a global active-body cap. Release sections across several frames. Carry the vehicle velocity into each section before adding an explosion impulse.

Use pooled GPU particles or analytic trajectories for 16–48 small shards, sparks, and dust. Small debris does not need rigid-body collision. Stop emission, release pooled effects, and disable expensive shadows by distance and screen size.

When a large section settles, allow physics sleep. Convert it to a static wreck transform when later interaction is unnecessary. Update vehicle collision when a section detaches; shader holes alone do not permit projectiles or units to pass through the old collider.

## Acceptance checks

- Destruction zero produces no holes.
- Destruction one renders no vehicle surface.
- Increasing destruction cannot restore removed pixels.
- Damage patterns stay fixed while the vehicle moves and rotates.
- Cavities retain apparent depth at normal viewing angles.
- Visible holes and shadows agree.
- Detached collision matches the remaining hull.
- Debris settles and returns to its pool.
- Several simultaneous large explosions remain within the CPU, GPU, memory, and physics budgets.

## Implemented physical budgets

`VehicleBreakupSystem` uses fixed 1/60-second integration steps and caps catch-up at six steps per update. Its collision is presentation physics with conservative rotating box bounds, terrain contacts, and bounded section contacts. It does not replace the simulation's unit or projectile collision rules.

| Resource or work | Default bound |
| --- | ---: |
| Live breakup events | 16 |
| Authored sections retained per event | 20 |
| Selected moving sections per event | 4–12; 8 by default |
| Active colliding sections across all events | 48 |
| Section releases per render update, including static overload fallback | 2 |
| Cosmetic shards requested per event | 16–48; 24 by default |
| Cosmetic shards across all events | 256 |
| Cosmetic shard lifetime | 2.5 simulated seconds |
| Quiet speed / quiet duration before sleep | 0.35 units/second / 0.6 seconds |
| Forced dynamic-to-static deadline | 12 simulated seconds |
| Wreck expiry | 45 simulated seconds |
| Retained body / cosmetic record pools | 320 / 256 |

Sections that cannot enter the active-body budget become static wreck sections. Cosmetic shards follow noncolliding analytic trajectories. Once an event starts releasing sections, its intact collider flag is disabled and the remaining section colliders are exposed individually. Reducing destruction cannot restore that intact collider or reattach a section. Zero destruction releases nothing; full destruction eventually leaves no attached section. Physical wreck visibility is separate from the material's zero-to-one removal control.

The two-release budget applies globally, so the worst-case queue of 16 events with 20 sections takes 160 render updates to drain (about 2.67 seconds at 60 updates/second). A frame hitch does not bypass this release limit. Returning records and visual trees to their pools intentionally retains bounded reusable storage rather than requiring heap usage to return to zero.

## Repeatable validation

Run the acceptance suite with:

```text
npx tsx --test tests/vehicle-breakup.test.ts tests/destroyed-vehicle.test.ts tests/vehicle-animation.test.ts tests/vehicle-effects.test.ts
```

The breakup tests cover seed-repeatable selection and motion, zero/full destruction, monotonic detachment, velocity inheritance, global body and shard caps, bounded release work, frame partitioning and hitch handling, terrain contacts, early sleep, forced settling, expiry, repeated overflow, and body/shard/visual pool reuse. Tests also play every TANK and JET animation clip after fracture and verify that the independent fracture transforms cannot be reset by live animation. Existing material tests cover exact destruction endpoints, local damage binding, and shared shadow clipping material.

Run the CPU-only profile with:

```text
node --expose-gc --import tsx tests/vehicle-breakup-profile.ts
```

Measured on 2026-09-18 using Windows x64, Node v24.19.0, and an Intel Core i9-12900K. Each scenario warms up three times, then measures seven 10-second simulations at 60 updates/second (4,200 measured updates). Every event requests 12 moving sections and 48 cosmetic shards from 20 authored sections. Cleanup is verified after the timed active window. Advisory controller targets are p95 below 1 ms and p99 below 2 ms on this host; timings are reported rather than used as fragile unit-test assertions.

| Simultaneous events | Begin mean | Update mean | Update p95 | Update p99 | Update max | Peak bodies / shards |
| ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| 1 | 0.1104 ms | 0.0059 ms | 0.0108 ms | 0.0444 ms | 0.9376 ms | 12 / 48 |
| 16 | 0.4453 ms | 0.3173 ms | 0.6106 ms | 0.8564 ms | 2.8634 ms | 48 / 256 |

Both scenarios expired all live events, colliders, and shards. Their retained pools contained respectively 20/48 and 320/256 body/shard records. These measurements cover the controller only: geometry preparation, scene synchronization, renderer allocations, draw calls, shadows, GPU time, and full-game frame time are excluded. Render performance and visual agreement of holes, shadows, and picking require a browser capture on representative hardware before claiming a whole-frame or GPU budget.
