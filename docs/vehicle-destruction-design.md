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
