# GRID COMMAND
## Master AI Handoff / Current Build Specification
### Current executable baseline: v37 `grid-command-performance-v37.zip`
### Original design baseline preserved in Appendix A: `commander_gpts_version.md`
### Updated: 2026-09-05

This document is intended to be pasted into a new AI conversation so development can continue without losing the original Grid Command design or the accumulated implementation changes.

---

# 0. READ THIS FIRST: SOURCE OF TRUTH AND PRECEDENCE

There are three layers in this document:

1. **The actual v37 source code is the highest authority for what the current application does.**
2. **Sections 1–24 of this document describe the current v37 implementation and override conflicting legacy text.**
3. **Appendix A preserves the original supplied `COMMANDER.md` design document in full.** It remains the long-term design target where it does not conflict with current implementation decisions.

When a statement in Appendix A conflicts with Sections 1–24, the current-build section wins.

Do not silently revert a later implementation decision merely because the original design says something different.

Examples of intentional supersession:
- Cedar River / Cedar Rapids is obsolete. The current AO is **San Diego, California**.
- CARTO Voyager is obsolete. The current map uses **OpenFreeMap Liberty** with real vector buildings/water plus AWS Terrarium DEM.
- The old 50 m navigation assumption is obsolete for current pathfinding. The current world navigation cell size is **25 m**.
- The old 50 m objective radius is obsolete. Current objective radius is **100 m** (200 m diameter).
- The old 8–18 second commander review cadence is obsolete. Current commander planning cadence is **30 simulated seconds**.
- The old 20 minute hard stop is obsolete. **There is no match time limit.**
- The old rubble-mesh replacement behavior is obsolete. A fully destroyed building is represented by **sinking/lowering the original MapLibre extrusion**, not by spawning a separate rubble pile.
- The old local-terrain-datum subtraction in the Three.js overlay is obsolete. Current grounding uses **absolute Terrarium DEM altitude** to match MapLibre custom-layer altitude semantics.
- The app is currently **AI vs AI only**. Observer, BLU-perspective, and RED-perspective views exist; there is no live human commander control mode in v37.
- There is **no external LLM/API commander integration in v37**. The current commander is a deterministic local JavaScript Web Worker.

---

# 1. DEVELOPMENT HANDOFF RULES

When continuing development:

- Always use the **latest generated ZIP** as the patch base.
- When the user asks for a game change, **patch the ZIP and return a new downloadable ZIP**. Do not respond with a plan only.
- Preserve the real **MapLibre geographic map**, real terrain, real vector buildings/water, and Three.js battlefield overlay.
- Do not replace the map with a fake canvas, abstract board, screenshot, or non-geographic approximation.
- Preserve the MapLibre/Three.js projection and terrain-grounding system unless fixing it directly.
- Be explicit about validation:
  - `node --check` or similar is only a **syntax/static check**.
  - ZIP integrity is only an archive check.
  - Do not claim the game was browser-tested unless it was actually run in a browser.
- Prefer browser performance over expensive decorative simulation. The game should remain readable and tactical rather than physically exhaustive.
- Keep patch notes in the project so later AIs can reconstruct why a behavior changed.
- Do not resurrect removed rubble geometry.
- Supply Points and physical inventories are separate systems.
- Commander orders remain high level; local unit/squad execution remains local.
- The current app is meant to run through the included local PowerShell server via `START_WINDOWS.bat`.

Current primary patch ownership:
- `src/models.js`: Three.js models, unit animation, overlay projection/grounding, rendering, building FX.
- `src/ui.js`: command UI, selection/debug controls, supply cards.
- `src/sim.js`: simulation state, combat, logistics, construction, purchases, capture, aircraft cycles.
- `src/planner.js`: hierarchical commander/subcommand/squad planning.
- `src/world.js`: terrain, real building/water physics, pathfinding/nav masks, bad areas.
- `src/map.js`: MapLibre map/style, real building extrusion, tactical layers, map-side damage sync.
- `src/audio.js`: radio/TTS and procedural world audio.
- `serve.ps1`: local server, bad-area persistence, SFX bank support.

---

# 2. CURRENT RUNTIME AND ARCHITECTURE

## 2.1 Browser/runtime

Current v37 is a browser application launched with:

```text
START_WINDOWS.bat
```

The included PowerShell server serves the project and exposes local persistence endpoints used by navigation and SFX tools.

The application does not require a Node/Vite build to run the shipped version.

External runtime dependencies are loaded from the network:
- MapLibre GL JS **4.7.1**
- OpenFreeMap Liberty vector style
- AWS/Mapzen Terrarium elevation tiles
- Three.js **0.169.0**, attempted from unpkg first, jsDelivr second
- Kokoro TTS assets only when neural voice is actually enabled

MapLibre 4.7.1 is intentionally pinned in the current code because later MapLibre custom-3D-layer behavior had caused Firefox visibility problems during development.

## 2.2 Boot order and renderer isolation

Boot order is deliberately fault tolerant:

1. MapLibre starts.
2. Terrain/elevation loads.
3. persistent bad navigation areas load.
4. real OSM/OpenFreeMap building and water geometry is imported into simulation physics.
5. simulation and UI start.
6. Three.js is dynamically imported after the map/simulation are already live.

If Three.js fails to load, the map, simulation, and HUD can remain active and the status line reports the overlay failure.

## 2.3 Simulation/render separation

Simulation:
```text
DT = 0.05 s
tick rate = 20 Hz
```

Rendering is independent.

Current update frequencies:
- movement/local simulation: fixed 20 Hz when CPU budget permits
- sensing: 2 Hz
- shooting and structure combat: 5 Hz
- construction/facility support/deployable checks/fire spread: 1 Hz
- logistics update: 1 Hz
- cargo flight launch opportunity: every 60 simulated seconds
- airport economy: every 5 simulated seconds
- HUD / MapLibre building damage sync: ~4 Hz
- Three.js battlefield visual updates: ~30 Hz
- full building FX discovery scan: 4 Hz
- commander package: every 30 simulated seconds

High time compression can intentionally shed stale simulation backlog rather than freeze the browser.

---

# 3. CURRENT MAP: SAN DIEGO, CALIFORNIA

## 3.1 Geographic constants

Current center:
```text
[-117.1300, 32.7350]
```

Approximate local simulation area:
```text
W = 3600 m
H = 2200 m
navigation CELL = 25 m
```

Map bounds:
```text
SW = [-117.170, 32.705]
NE = [-117.090, 32.765]
```

The AO is intentionally positioned inland enough that the north-south objective chain does not cross San Diego Bay/ocean.

## 3.2 Real map stack

Current stack:
- MapLibre GL JS 4.7.1
- OpenFreeMap `liberty` style
- real vector building footprints from the map source
- real vector water where available
- AWS Terrarium `raster-dem`
- MapLibre terrain exaggeration = 1
- tactical recoloring layered over the real map

Current palette:
- ground/background: near-black navy
- water: saturated blue
- roads: gray
- paths/trails: brown
- vegetation/parks: dark blue-green
- intact buildings: blue to brighter blue based on height
- BLUE: saturated blue
- RED: saturated red
- contested: purple

The stock Liberty/OpenFreeMap building extrusion layers are hidden so Grid Command renders one state-aware real-building extrusion pass instead of duplicating 3D buildings.

## 3.3 Real water

The old synthetic river through the battlefield is disabled.

Water is imported from the real vector map when available. Real water replaces stale synthetic-water cells in the navigation data.

Dry-placement safeguards relocate:
- A–E
- MOBs
- airbases
- LRPs
- spawned groups
- trucks
- structures

to a nearby dry/passable location when their requested position is invalid.

---

# 4. OBJECTIVES, CAPTURE, AND MATCH END

## 4.1 A–E layout

Objectives A–E are arranged vertically **north to south** in the San Diego AO.

Base world positions before dry/passable relocation:

```text
A: x=0, y= 900
B: x=0, y= 450
C: x=0, y=   0
D: x=0, y=-450
E: x=0, y=-900
```

The system relocates them to nearby dry/passable points as needed.

Clicking the A–E objective strip in the UI focuses the camera on that objective.

## 4.2 Objective control area

Current:
```text
OBJECTIVE_RADIUS = 100 m
diameter = 200 m
CAPTURE_MIN = 6 active bodies
```

Objective-zone buildings are treated as part of the objective area:
- their footprints do not block movement inside the objective zone,
- they are excluded from the hidden building nav mask for objective access,
- water still remains impassable.

The tactical map draws a subtle objective-radius zone around each marker.

## 4.3 Capture timing

For normal objectives:
```text
exclusive capture time = 8 s
```

For airbases:
```text
exclusive capture time = 12 s
```

Both sides present means contested.

A side must have at least `CAPTURE_MIN` active bodies before the capture timer can progress.

## 4.4 Victory

Current match rules:

1. **Commander death is immediate defeat.**
2. Territorial victory occurs only when one side owns **A–E simultaneously and none is contested for 60 uninterrupted seconds**.
3. Any contested A–E objective resets that side's secure-hold timer immediately.
4. **There is no match time limit.**
5. If both commanders die in the same resolution, result is a mutual-command-loss draw.

This overrides the original 20-minute hard stop.

---

# 5. CURRENT COMMANDER AI

## 5.1 Three-level hierarchy

The live planner is a three-level deterministic battlefield engine.

### Level 1: force commander
The commander selects a strategic macro-action and target using adversarial look-ahead.

Current strategic action set:
```text
SEIZE
FLANK
PROBE
FORTIFY
MASS
ECONOMY_OF_FORCE
RESUPPLY
RAID
DEFEND_MOB
HOLD_RESERVE
```

### Level 2: dynamic subcommands
Subcommands are created dynamically every planning cycle.

There is no fixed ALPHA/BRAVO ceiling.

The planner evaluates:
- span of control
- spatial cohesion
- role diversity
- specialization
- headquarters overhead

and creates appropriate:
- maneuver formations
- fires formations
- logistics formations
- air formations
- base-defense formations

Membership returned by the worker is applied directly to live groups and displayed in Current Force cards.

### Level 3: squad/group leaders
Every group evaluates legal local actions and the worker returns a concrete order.

`sim.js` executes the returned squad order rather than translating one vague force-level action through a separate hard-coded mission allocator.

## 5.2 Strategic search

Current force-level planner:
- deterministic adversarial search
- alpha-beta pruning
- move ordering
- transposition cache
- 4-ply strategic search
- up to roughly 18 ordered strategic candidates before pruning
- enemy receives a modeled best response rather than a random penalty

The event log reports evaluated score and number of cached/searched states.

This is local JavaScript in a Web Worker, not an external LLM.

## 5.3 Imperfect information

The commander is not supposed to read omniscient enemy ground truth.

The planning snapshot contains:
- friendly state
- contact reports
- objective state
- own logistics/economy
- current force losses/progress
- facilities
- airbase state
- recent negative navigation reports

Enemy contacts are generated by sensing/reporting rather than giving the planner the enemy entity array directly.

Observer mode may visually see everything; that does not change planner knowledge.

## 5.4 Current commander cadence

Current v37 behavior:

```text
COMMAND_INTERVAL_SECONDS = 30
COMMAND_INTERVAL_TICKS = 600
```

Both sides use the same due tick.

When both commanders are due:
1. both snapshots are submitted to the worker before either plan is applied,
2. simulation waits for all matching planner results,
3. both plans are then applied in deterministic side order.

This is a deliberate fairness change.

**Important:** the older v19 note that BLUE plans immediately and RED is staggered by 15 seconds is no longer the current behavior.

Tactical movement, combat, capture, aircraft, construction, and logistics continue between commander packages.

---

# 6. TEMPO

Each commander has:
```text
baseTempo ≈ random 0.42–0.80
tempo = dynamic 0.0–1.0
HUD display = approximately 0–100 pressure
```

Tempo rises based on:
- being behind in objective ownership
- repeated commander cycles with no strategic progress
- combat losses
- low active force size

Tempo affects strategic search itself, not just purchase scoring.

Higher tempo:
- values initiative more
- penalizes delay more
- values reserve less
- prefers SEIZE/MASS/FLANK more strongly
- is more tolerant of losses/risk
- assigns more assault groups to an objective
- lowers spending reserve
- increases likelihood of expedition/urgent purchasing

Tempo was added specifically to prevent both sides from sitting indefinitely with small forces and no effort to win.

---

# 7. CURRENT ACTION SEMANTICS

Strategic labels must become executable squad tasks.

## 7.1 SEIZE and MASS

Assault-capable groups receive actual:
```text
CAPTURE
```
orders onto the frontier objective.

They do not merely move near the objective and stop.

## 7.2 FLANK

**FLANK is an approach method, not a terminal mission.**

Current semantics:
1. choose the current frontier objective,
2. assign multiple assault-capable groups to `CAPTURE`,
3. route the selected assault group through an offset approach lane,
4. then continue onto the objective,
5. if the flank path is invalid, keep/fall back to the direct `CAPTURE` route.

The v37 flank lane is approximately offset hundreds of meters laterally from the objective before joining the final capture leg.

A flanking unit must still ultimately occupy/capture the objective.

## 7.3 PROBE

PROBE is reconnaissance in force.

Scouts may recon, but when the target is enemy-owned or neutral, at least an assault-capable element is still pushed onto the objective so the front can advance.

## 7.4 SUPPORT

Non-logistics support/fire elements use support-by-fire positions near the target.

Logistics support can remain oriented on the LRP/sustainment route.

## 7.5 Multiple assault groups

The planner deliberately assigns multiple assault groups to the same unowned objective.

Desired assault-group count:
```text
roughly 2–4 groups, scaled by tempo
```

This was added because a single squad often could not meet the aggregate body requirement inside the objective control area.

---

# 8. FORCE REPLACEMENT AND PURCHASE DOCTRINE

Supply Points are the only strategic requisition currency. There is no hidden second commander currency.

The commander:
- replaces sustained losses,
- spends when force size falls,
- escalates when stalled,
- escalates when behind on objectives,
- counts already queued kits to avoid duplicate spam,
- can build a larger wartime force instead of stopping at a tiny peacetime roster.

Current queue behavior:
```text
queue target ceiling used by planner = 18
```

The command panel shows the last purchase decision and the reason.

Current purchase reasoning roughly prioritizes:

1. replace rifle squads when active combat strength is low
2. add MG support if the force is very small
3. add more rifle squads when stalled/behind at sufficient tempo
4. add logistics to staff a guarded airport
5. add logistics to recover a damaged airport
6. buy supply packages when distributed ammo/supply is low
7. buy `RECON_UAV` when blind/stalled/behind/high tempo
8. add AT against known armor
9. restore scout capability if none exists
10. maintain baseline rifle strength
11. replace sustained personnel losses
12. add MG when stalled
13. add mortar when stalled
14. add transport/logistics lift when stalled
15. escalate to APC/IFV when depots and SP permit
16. escalate to tank when stalled with SP surplus
17. acquire transport for MASS
18. ensure at least one mortar

Purchase reserve is lowered during urgent losses/stalls/high tempo.

Urgent purchases may request **Expedite**.

---

# 9. EXPEDITE AND FACILITY GATES

Expedite:
```text
cost = ceil(base cost × 1.20)
```

It immediately creates the purchased unit at the correct facility.

Current source behavior intentionally treats Expedite as premium theater procurement:
- it bypasses the normal cargo-kit and local inventory assembly pipeline,
- it does **not** require the destination's physical stock to contain the normal manpower/ammo/fuel kit before spawning,
- it still requires the proper operational facility.

This is a source-level correction to the older v31 wording that implied inventory must already be present.

Current facility rules:

| Asset | Expedite location / facility |
|---|---|
| infantry and ordinary support | MOB/base |
| `RECON_UAV` and other fixed-wing air role using `air:true` | airbase |
| `TANK`, `APC`, `IFV` | operational `LARGE_VEHICLE_DEPOT` |
| `TRUCK`, `TROOP_TRANSPORT`, `LOGISTICS` | operational `LIGHT_VEHICLE_DEPOT` |
| helicopters | operational `HELIPAD` |

Normal non-expedited purchases still enter the theater requisition/cargo pipeline.

---

# 10. CURRENT UNIT CATALOG

These values come from current `src/sim.js`.

| Role | Members | Speed | Range | Power | Ammo / Load | Cost SP | Notes |
|---|---:|---:|---:|---:|---|---:|---|
| RIFLE | 6 | 3.8 | 280 | 6 | AMMO_SMALL / 540 | 200 | primary assault |
| SCOUT | 4 | 4.5 | 280 | 3 | AMMO_SMALL / 360 | 150 | recon |
| MG | 4 | 3.2 | 380 | 7 | AMMO_MG / 700 | 250 | deployable |
| AT | 4 | 3.4 | 410 | 7 | AMMO_SMALL / 360 + AT missiles | 350 | deployable |
| MEDIC | 3 | 3.8 | 150 | 1 | AMMO_SMALL / 180 | 250 | support |
| ENGINEER | 4 | 3.4 | 150 | 1 | AMMO_SMALL / 240 | 300 | support |
| COMMAND | 1 | 0 | 220 | 1 | AMMO_SMALL / 120 | 0 | commander |
| PILOT | 2 | 3.8 | 120 | 1 | AMMO_SMALL / 120 | 200 | airbase role |
| RECON_UAV | 1 | 24 | 950 | 0 | none | 500 | air, recon |
| LOGISTICS | 4 | 3.6 | 160 | 2 | AMMO_SMALL / 240 | 300 | support/airport staffing |
| MORTAR | 4 | 2.7 | 1200 | 8 | AMMO_MORTAR / 40 | 450 | indirect, deployable |
| TANK | 3 | 9 | 600 | 22 | AMMO_HEAVY / 35 | 1500 | vehicle, large depot |
| APC | 3 | 10 | 420 | 11 | AMMO_MG / 650 | 950 | vehicle, large depot |
| IFV | 3 | 9.5 | 520 | 16 | AMMO_HEAVY / 28 | 1250 | vehicle, large depot |
| TROOP_TRANSPORT | 2 | 11 | 340 | 5 | AMMO_MG / 360 | 650 | MRAP/Humvee-style, light depot |
| TRANSPORT_HELO | 2 | 20 | 0 | 0 | no combat load | 1200 | helicopter, helipad |
| ATTACK_HELO | 2 | 18 | 620 | 18 | AVIATION_ORDNANCE / 18 | 1800 | helicopter, helipad |
| TRUCK | 1 | 12 | 0 | 0 | no combat load | 350 | supply transport, light depot |

The shared model gallery contains additional aircraft/prop constructors that are not necessarily live purchase roles. Do not assume every gallery model is an active simulation unit.

---

# 11. CURRENT STARTING FORCE

Each side currently starts with:

```text
3 × RIFLE
1 × SCOUT
1 × MG
1 × AT
1 × MORTAR
1 × ENGINEER
1 × MEDIC
1 × LOGISTICS
1 × TANK
1 × PILOT group
1 × COMMAND
2 × TRUCK logistics haulers
```

One rifle group is initially assigned airbase security.

The commander stays at the MOB.

The pilot group starts at the airbase.

The two logistics trucks are assigned physical routes:
```text
AIRBASE -> MOB
MOB -> LRP
```

Initial forces and physical stocks are scenario allocations rather than being charged against the 2000 starting SP.

---

# 12. SUPPLY POINTS AND PHYSICAL INVENTORY

## 12.1 Strategic Supply Points

Each side begins with:
```text
SP = 2000
```

SP is requisition authority/currency.

It is separate from physical:
- fuel
- ammunition
- manpower
- construction material
- medical supplies
- repair parts
- aviation fuel
- aviation ordnance

## 12.2 Physical supply classes

Current classes:
```text
FUEL
AMMO_SMALL
AMMO_MG
AMMO_AT
AMMO_HEAVY
AMMO_MORTAR
CONSTRUCTION
MEDICAL
REPAIR_PARTS
MANPOWER
AVIATION_FUEL
AVIATION_ORDNANCE
```

MOBs, airbases, LRPs, and objectives have explicit capacities/inventories.

## 12.3 Airport-generated economy

The old flat unconditional income model has evolved into an airport economy.

Every 5 simulated seconds, each owned airbase:
- produces physical supplies into its local inventory,
- generates SP according to airport state,
- may subtract upkeep from expensive live assets.

Base physical production per economy pulse before state multiplier:

```text
FUEL                30
AMMO_SMALL          45
AMMO_MG             20
AMMO_AT              1.2
AMMO_HEAVY           0.8
AMMO_MORTAR          0.8
CONSTRUCTION         4
MEDICAL              2
REPAIR_PARTS         2
MANPOWER             0.3
AVIATION_FUEL       38
AVIATION_ORDNANCE    3
```

---

# 13. AIRPORT STATES AND INFRASTRUCTURE

Airports have five economic states:

| State | Production multiplier | Base SP / 5 s |
|---|---:|---:|
| DESTROYED | 0.00 | 0 |
| DAMAGED | 0.25 | 3 |
| REGULAR | 1.00 | 10 |
| GUARDED | 1.35 | 14 |
| MANNED | 1.35 + staffing bonus | 14 + staffing bonus |

## 13.1 Guarded

To become `GUARDED`, the current system requires around the airbase:
- at least 2 operational guard towers
- at least 8 HESCO coverage units
- at least 2 defending combat squads

## 13.2 Manned

`MANNED` additionally requires logistics squads physically stationed at the airfield.

Manning is capped at 3 logistics squads.

Each real logistics squad:
- increases production multiplier by `+0.18`
- increases SP income by `+3` per 5-second economy pulse

## 13.3 Airport infrastructure progression

Current storage/runway progression:

```text
DESTROYED: 0 runways, 15% nominal storage
DAMAGED:   1 runway, 25% nominal storage
REGULAR:   1 runway, 35% nominal storage
GUARDED:   2 runways, 70% nominal storage
MANNED:    2–3 runways depending staffing,
           storage scales upward toward full capacity
```

With at least 2 manning squads, airport infrastructure reaches tier 3 and 3 runways.

Cargo aircraft reserve a runway for their visible cycle, so more runways increase concurrent theater throughput.

## 13.4 Airport damage and repair

Heavy explosive effects can damage airports.

Captured airports can enter service damaged.

Logistics personnel can consume `REPAIR_PARTS` to restore airport health.

If an airbase becomes invalid/contested during cargo service, undelivered requisitions are returned to the queue.

---

# 14. NORMAL REQUISITION AND CARGO AIRCRAFT

Non-expedited unit orders are queued.

Every 60 simulated seconds, an operational uncontested airbase can launch cargo flights for queued orders, limited by available runways.

Each flight takes up to 4 queued requisitions in its manifest.

Current visible cargo-aircraft cycle:

```text
APPROACH
TOUCHDOWN
ROLLOUT
TAXI_IN
SERVICE
TAXI_OUT
TAKEOFF_ROLL
CLIMB
```

Key current behavior:
- aircraft land on an assigned runway,
- roll out,
- exit toward a **remote cargo stand** away from the terminal/building cluster,
- stop at that apron/stand,
- forklifts animate during servicing,
- manifest is transferred to airbase inventory,
- aircraft taxis to a runway hold point,
- performs takeoff roll,
- rotates,
- climbs out,
- does not intentionally drive through the airbase building.

Service time is finite and has a failsafe to prevent aircraft from remaining in `SERVICE` forever.

The remote-stand/taxi-out behavior is the current fix for planes previously entering buildings and never departing.

---

# 15. LOGISTICS DISTRIBUTION

Current logistics includes real inventory transfer.

Default physical chain:
```text
AIRBASE -> MOB -> LRP
```

Supply trucks physically drive those routes.

Normal purchased unit kits delivered by cargo aircraft include:
- manpower
- required weapon ammunition
- AT missiles where relevant
- vehicle fuel where relevant

Once kits/stocks reach the appropriate assembly destination, normal unit assembly can occur.

This is separate from Expedite, which bypasses normal kit/assembly stock requirements at a 20% SP premium.

---

# 16. CONSTRUCTION AND FACILITIES

Construction is not instant.

Current build times:

| Structure | Build time |
|---|---:|
| REPAIR_BAY | 90 s |
| MEDICAL_BAY | 75 s |
| HELIPAD | 60 s |
| LIGHT_VEHICLE_DEPOT | 85 s |
| LARGE_VEHICLE_DEPOT | 125 s |
| GUARD_TOWER | 45 s |
| HESCO | 25 s |
| ENTRENCHED_MG | 50 s |
| ENTRENCHED_AT | 60 s |
| MORTAR_PIT | 70 s |
| FOB_TOWER model/state | 80 s |

Structures remain non-operational until the build timer completes.

The commander automatically develops the MOB with:
- vehicle repair bay
- medical bay
- helipad
- light vehicle depot
- large vehicle depot
- guard tower(s)
- HESCO
- entrenched MG
- entrenched AT
- mortar pit

The commander also fortifies the airport to improve its economy/state.

HESCO construction supports variable:
- segment length: 1–5 cells
- height: 1–3 cells
- position
- heading

Placement is AI/personality/seed driven, not a manual player construction editor.

---

# 17. DEPLOYABLE AND SUPPORT BEHAVIOR

## 17.1 Mortar

Mortar teams deploy/undeploy using timed actions.

When deployed:
- self-observation is intentionally short range (~100 m),
- commander-reported contacts can be engaged out to ~1200 m.

When threatened:
- mortar crew can abandon the tube,
- fight as infantry,
- later return to recover/redeploy when safe.

## 17.2 MG / AT

MG and AT teams can deploy into fixed sectors.

Deployed range increases substantially, approximately up to 1000 m class ranges in the deployment logic.

If the target leaves the covered sector, the team must undeploy/redeploy rather than magically rotate a fixed emplacement through every direction.

## 17.3 Repair

Damaged vehicles can path to the real repair-bay structure and undergo a timed repair action.

Vehicle state includes:
- hull
- mobility
- weapon effectiveness

## 17.4 Medical / medevac

Medics can stabilize serious casualties.

When an operational helipad and medical bay exist, a serious stabilized casualty can trigger a medevac flight.

Current medevac cycle:
```text
OUTBOUND
PICKUP
RETURN
LAND
TREAT
DONE
```

The casualty is delivered to the actual medical-bay position.

## 17.5 Timed-action UI

Timed actions display a rounded progress bar over the group/structure.

Examples:
- deployment
- undeployment
- garrison action
- medical action
- vehicle repair
- dismounting
- construction

---

# 18. RECON UAV

`RECON_UAV` is a live purchasable role.

Current behavior:
- cost: 500 SP
- airbase facility
- high movement speed
- rendered at air altitude above ground obstacles
- ignores ground LOS for its UAV sensing path
- alternates high-priority recon between:
  - enemy MOB
  - enemy airbase

The alternation is tied to commander-cycle-scale time.

The UAV reports enemy base/airfield contacts when in sensor range.

Purchase doctrine prefers a UAV when:
- contacts are stale/weak,
- the force is behind,
- the force is stalled,
- tempo is elevated,
- or there are too few useful contacts.

The UAV placeholder member is not rendered as a dismounted infantryman.

---

# 19. NAVIGATION, STUCK UNITS, AND BAD AREAS

## 19.1 Hidden navigation masks

The world precomputes hidden walkability masks from:
- imported real OSM/OpenFreeMap building polygons
- imported real water polygons
- terrain/passability data

Clearance:
```text
infantry building clearance ≈ 1.5 m
vehicle building clearance  ≈ 4 m
```

Runtime movement uses role-aware passability consistent with pathfinding.

Path edges are validated so routes cannot simply cut through blocked cells between path nodes.

APC, IFV, troop transport, and other vehicle-class movement use vehicle clearance rules.

## 19.2 Start-segment validation

Navigation validates the exact segment from the unit's live position to the first nominal grid/path node.

If the normal start node cannot be reached directly, the pathfinder searches for the nearest reachable legal anchor.

This fixes units that begin inside or too close to imported real building footprints.

## 19.3 Repath failure and negative reporting

Squad path failures are not debug-only.

Failures such as:
```text
NoPath
RepathNoPath
Stuck
NoEscapePath
```

generate a negative tactical report.

Recent negative reports are included in the next commander snapshot so the planner can:
- redirect that squad,
- assign a different unit,
- avoid immediately sending the same squad back into the same failed task.

## 19.4 Bad areas

Units maintain a rolling history of valid movement positions.

After repeated route-rebuild failure:
1. mark the current area as bad,
2. merge a bad-area region into navigation avoidance,
3. cancel the unreachable task,
4. back out toward a previously valid position,
5. send a negative report to command.

Current bad area radius on failure is approximately:
```text
75 m
```

Future A* and direct-route validation avoid persisted bad areas.

Persistence:
- preferred: local server endpoint `/__nav/bad_areas` -> `bad_areas.json`
- fallback: browser `localStorage`

Writes use persistent/keepalive behavior in the current server implementation.

F10 shows bad areas in magenta.

---

# 20. FOG / RENDER CULLING

Current screen-centered render cull:
```text
FOG_RADIUS_M = 1000
```

Anything beyond 1 km from current MapLibre screen center is culled from the tactical rendering path.

Applies to:
- Three.js battlefield assets
- tactical group/contact/node marker generation

Does **not** remove units from:
- simulation
- combat
- pathfinding
- capture
- logistics
- commander state

Objectives remain visible for orientation.

The selected unit remains visible even when ordinary tactical markers would be culled.

This is render-side culling, not a true simulation removal system.

---

# 21. CAMERA, SELECTION, AND DEBUG

## 21.1 Camera

Current home view:
```text
zoom 14.8
pitch 48°
bearing -18°
```

Map:
```text
minZoom 13
maxZoom 20
maxPitch 75°
```

Camera follow:
- selecting a live unit enables follow,
- follow recenters the camera on the unit,
- follow does **not** overwrite the player's bearing, pitch, or zoom,
- the player can rotate, tilt, and zoom while following,
- clicking empty battlefield clears selection/follow,
- Overview disables follow.

Objective A–E and BLU/RED force UI focus controls can move the camera to their associated locations.

## 21.2 Selection

Units can be selected through:
- visible tactical marker
- enlarged invisible/transparent hit ring
- battlefield screen-space picking
- force list

Selected unit cards are highlighted.

A visible toast/selection ring makes selection obvious.

## 21.3 F9 movement debug

F9 displays:
- traversed trail: green
- remaining route: yellow
- final goal: cyan
- current waypoint: yellow
- rejected segment: red
- blocking building: orange
- recent blocked/stuck points: orange/purple

Selected unit debug includes:
- mission
- waypoint
- remaining route length
- stuck timer
- repath count
- last rejected segment
- blocking building ID

## 21.4 F10 nav debug

F10 is independently usable with a selected unit.

It shows:
- green: passable
- blue: road
- red: blocked
- orange: nearby building obstacle
- magenta: learned bad area
- white: selected/nav center

High-speed operation may thin/hide expensive nav debugging to preserve performance.

The UI also has clickable F9/F10 controls so function-key capture by the browser is not required.

---

# 22. THREE.JS BATTLEFIELD RENDERING

## 22.1 Current overlay architecture

MapLibre owns the geographic map canvas.

Three.js owns a separate transparent full-screen overlay canvas.

The overlay does **not** reconstruct MapLibre's camera approximately.

Instead:
1. a no-op MapLibre custom layer captures MapLibre's exact current render matrix,
2. Three.js applies that matrix,
3. it multiplies by the deterministic local-meter -> Mercator transform,
4. local battlefield geometry remains in world meters.

This preserves:
- exact camera perspective
- center
- zoom
- bearing
- pitch
- terrain alignment

## 22.2 Grounding

Current grounding:

```text
groundZ(x,y) = absolute Terrarium DEM elevation
```

Do **not** subtract an AO-center terrain datum.

MapLibre custom-layer altitude is absolute above sea level, and the Terrarium DEM is absolute, so Three.js units must use the same absolute elevation basis.

This v36 fix corrected units appearing below terrain.

## 22.3 Current model behavior

Live/shared model library includes:
- articulated infantry with segmented arms/legs
- role-specific weapons
- independent upper-body aim
- unique green-marked commander
- pilot
- squad leader/subcommander
- logistics soldier
- tank with independent turret
- trucks with wheels/glass/exhaust
- MRAP/troop transport with ring MG
- APC
- IFV
- recon UAV
- cargo aircraft
- transport/heavy-lift/medevac/attack helicopter constructors
- fighter/bomber/CAS/bomb-drone model constructors
- HESCO
- FOB tower
- supply boxes
- containers
- forklifts
- MOB/airbase supply-yard props

Not every model constructor is a currently purchasable/simulated unit.

## 22.4 v35 overlay repair

Current source includes a restored `createUnitModel(role, side)` factory.

Group-level models are created only for relevant vehicle/air assets.

`RECON_UAV` is supported in the live group-level model path.

Its placeholder simulation member is hidden from infantry rendering.

---

# 23. BUILDING DAMAGE AND DESTRUCTION

Real map buildings are tactical stateful objects.

Current states used by the live building system:
```text
INTACT
DAMAGED
COLLAPSED
RUBBLE
```

Buildings also track:
- health
- smoke
- fire/burning

Explosive damage is shared across effects such as:
- tank
- AT
- mortar
- artillery
- grenade/explosive
- jet
- helicopter

Fire can:
- damage a structure over time,
- spread deterministically to nearby real buildings based on distance/intensity/wind.

## 23.1 Damage visuals

For `DAMAGED` and `COLLAPSED`, Three.js may show:
- exact-footprint damage proxy
- alpha damage mask
- smoke
- fire
- sparks/flame effects

The intact/core building remains the MapLibre real footprint.

## 23.2 RUBBLE behavior: current final rule

**Do not spawn a separate rubble/debris pile.**

When a real building reaches `RUBBLE`:
- keep using the original MapLibre building footprint,
- reduce its extrusion height to a tiny remnant,
- push its extrusion base below ground,
- use dark/rubble styling,
- do not render the old multi-part rubble geometry.

This was specifically changed for:
- correct footprint replacement
- avoiding rubble appearing beside the original building
- FPS reduction

`COLLAPSED` may retain a shortened damaged extrusion.

The older v28 separate rubble-patch behavior is superseded by v32/current source.

## 23.3 MOB exclusion

OSM buildings close to MOBs are excluded/hidden from collision and tactical extrusion so spawned units are not trapped inside real imported structures.

---

# 24. AUDIO, RADIO, UI, AND PERFORMANCE

## 24.1 Radio hierarchy

Radio traffic is event-driven from the actual hierarchy:
- commander plan
- subcommand tasking
- squad acknowledgment
- contact report

Available monitoring modes include:
- BLU all
- BLU command
- RED all
- RED command
- local/focus
- radio off

Generated wording follows U.S. tactical radio conventions:
- called station first
- `THIS IS`
- `OVER` only when response is expected
- `OUT` when exchange is finished
- never “OVER AND OUT”
- `WILCO` not paired with redundant `ROGER`
- `SAY AGAIN` for retransmission
- contact calls use concise Description / Direction / Distance logic

## 24.2 TTS

Preferred:
```text
Kokoro neural TTS
```

Loaded client-side on first use and cached by browser.

Fallback:
```text
system SpeechSynthesis
```

Voice mode OFF is a hard gate:
- does not initialize Kokoro,
- does not synthesize muted speech,
- consumes/advances event sequence IDs without queuing speech,
- switching away from Kokoro terminates its worker/rejects outstanding generation.

## 24.3 Procedural SFX

World SFX use Web Audio synthesis rather than a required sample pack.

Implemented families:
- rifle
- MG
- AT / tank cannon
- mortar launch
- explosion
- vehicle/tank engine loops
- aircraft/helicopter engine/rotor loops
- infantry footsteps

SFX are spatialized relative to current map view.

## 24.4 SFX Lab / root bank

The local server scans the project root for files ending:
```text
_sfx.json
```

Banks are merged in filename order and can override browser-saved presets.

The SFX Lab `Save All Sounds` path writes:
```text
grid_command_sfx.json
```
into the install root when the local server is being used.

## 24.5 Current v37 performance pass

v37 preserves simulation rules while reducing render-thread waste.

Current performance changes:
- MapLibre is no longer forced to repaint every animation frame.
- Three.js battlefield rendering is capped to ~30 Hz.
- Three.js mesh frustum culling is enabled inside the 1 km screen-center cull.
- MapLibre MSAA disabled.
- Three.js MSAA disabled.
- Three.js device-pixel ratio capped at 1.5.
- duplicate OpenFreeMap building extrusion passes are hidden.
- full imported-building damage/FX discovery runs at 4 Hz instead of every visual frame.
- only active building effects animate each Three.js update.
- rendered-object DEM ground height is cached until the object moves more than 1 meter.
- objective flag and muzzle-flash model references are cached instead of repeatedly traversing scene trees.
- high time compression has a per-frame simulation CPU budget.
- 8× and 16× can discard stale catch-up backlog rather than freezing the browser.
- F10/nav debug is reduced/hidden at extreme speed because it is intentionally expensive.

This preserves:
- real MapLibre map
- real terrain
- real OSM building extrusion
- Three.js projection
- unit grounding
- simulation rules

## 24.6 Current validation status

The latest repair/performance iterations were statically syntax-checked and ZIP integrity checked.

That is **not equivalent to a browser runtime test**.

A future AI should not say “tested in browser” unless it has actually executed the current build in a browser environment.

---

# 25. IMPORTANT CURRENT-v37 CORRECTIONS TO OLDER NOTES

This section exists because the project contains historical patch notes that can mislead a new AI if read without source precedence.

## 25.1 Commander staggering

Historical v19 note:
```text
BLUE immediate, RED staggered 15 s
```

Current v37 source:
```text
both sides share due ticks
both snapshots are submitted before either result is applied
```

Current source wins.

## 25.2 Expedite inventory requirement

Historical v31 note implied:
```text
immediate at facility when inventory is present
```

Current v37 source explicitly states:
```text
20% premium bypasses cargo-kit and local inventory assembly
facility gate still applies
```

Current source wins.

## 25.3 Rubble

Historical v28:
```text
separate rubble replacement effect
```

v32/current:
```text
no separate rubble pile
sink/lower original MapLibre extrusion
```

Current source wins.

## 25.4 Terrain datum

Old README/patch text described local terrain relief / center-datum subtraction.

v36/current source:
```text
absolute Terrarium DEM elevation
```

Current source wins.

## 25.5 Map stack

Original design described:
```text
Cedar River / CARTO Voyager / same-context Three.js custom layer
```

Current:
```text
San Diego
OpenFreeMap Liberty vector map
AWS Terrarium terrain
independent Three.js overlay canvas
exact MapLibre matrix captured through a no-op custom layer
```

Current source wins.

## 25.6 Match timer

Original:
```text
20 minute hard stop
```

Current:
```text
no time limit
commander death immediate
A-E secure 60 s
```

Current source wins.

## 25.7 Objective size

Original:
```text
50 m radius
```

Current:
```text
100 m radius
```

Current source wins.

---

# 26. CURRENT KNOWN DESIGN/IMPLEMENTATION BOUNDARY

The original COMMANDER.md below contains many long-term systems that are still valid design goals, but a new AI must **not assume they are fully implemented merely because they appear in the original specification**.

Unless current v37 source/Sections 1–24 explicitly say otherwise, treat advanced original-design features as targets rather than guaranteed live systems.

Examples that remain incomplete, simplified, or not represented as full original-spec systems include:
- full weather/night/rain/fog gameplay
- complete electronic warfare and radio-relay graph
- full road traffic/capacity/convoy queue simulation
- mature CURRENT/NEXT/FUTURE operation objects and decision-point staff workflow
- full PIR management system
- complete mines/breaching/bridge engineering doctrine
- full indirect-fire observer/counterfire lifecycle
- fully realized FOB level 1/2/3 economy and command network
- full casualty collection/ambulance/recovery chain beyond implemented medic/medevac behavior
- full vehicle recovery/towing and subsystem maintenance model
- full garrison interiors/room navmesh for every real OSM structure
- complete tactical cover-slot allocation against every wall/corner
- literal HTN/MCTS implementation exactly as the original proposal described

Current planning is instead the v37 deterministic alpha-beta hierarchical worker described above.

---

# 27. PATCH HISTORY INCLUDED IN CURRENT BUILD

The current ZIP contains historical documentation for these implemented transitions:

- `AUDIO_AND_COMMAND.md`
  - dynamic subcommands, hierarchical radio, Kokoro/system TTS, procedural SFX
- `MOVEMENT_FIX_V13.md`
  - hard TTS-off behavior, start-segment path validation, vehicle clearance
- `MOVEMENT_DEBUG_V14.md`
  - F9/F10 movement diagnostics
- `PERFORMANCE_V16.md`
  - high-speed simulation CPU budgets and backlog shedding
- `NAV_MASK_V17.md`
  - precomputed building/water nav masks
- `SELECTION_DEBUG_V18.md`
  - reliable unit selection and clickable debug controls
- `COMMAND_CADENCE_V19.md`
  - 30-second commander cadence concept; later fairness scheduling superseded its stagger detail
- v20 fair-planner build
  - current source submits same-tick due snapshots together
- `ACTION_SEMANTICS_V21.md`
  - SEIZE/MASS/FLANK/PROBE/SUPPORT semantics become concrete executable orders
- `FOG_OF_WAR_V22.md`
  - 1 km screen-centered render cull
- `FOLLOW_AND_NAV_DEBUG_V23.md`
  - blank deselect and independent F10
- v24 follow-camera fix
  - follow preserves user yaw/pitch/zoom
- `OBJECTIVE_WATER_FIX_V25.md`
  - 100 m objective radius, dry placement, objective-building nav exception
- v26 fog runtime hotfix
  - defined missing render-fog helpers
- `SAN_DIEGO_V27.md`
  - current San Diego AO and real-water-only scenario
- `RUBBLE_REPLACE_V28.md`
  - transitional rubble replacement; later superseded
- `FORCE_REPLACEMENT_FEEDBACK_V29.md`
  - loss replacement, escalation, negative route feedback
- `BAD_AREAS_V30.md`
  - learned bad areas, backout, persistence
- `EXPEDITE_DEPOTS_BAD_AREAS_V31.md`
  - Expedite and vehicle depot gates
- `SUNK_BUILDINGS_V32.md`
  - remove rubble mesh, sink original building
- `TEMPO_AIRFIELD_V33.md`
  - dynamic tempo and corrected cargo-airfield cycle
- `FLANK_UAV_TEMPO_V34.md`
  - FLANK-as-CAPTURE approach, multiple assault groups, RECON_UAV, tempo in strategic search
- `THREE_OVERLAY_FIX_V35.md`
  - restored `createUnitModel`, correct UAV live rendering
- `TERRAIN_GROUNDING_FIX_V36.md`
  - absolute DEM altitude grounding
- `PERFORMANCE_V37.md`
  - current render/performance pass

---

# 28. NEXT-AI CONTINUATION CONTEXT

At the moment this handoff was generated, the latest executable ZIP is:

```text
grid-command-performance-v37.zip
```

The immediately preceding user concern was extremely poor FPS.

v37 is the first pass specifically targeting current render-thread waste.

The next likely performance target, if v37 remains too slow, is the **soldier/vehicle draw-call structure**:
- shared geometry
- `InstancedMesh`
- distance-based LOD
- fewer separate per-soldier primitive meshes
- more aggressive update throttling for distant/non-engaged entities

Do not assume that target has already been implemented.

A separate discussion considered using an external LLM only for the high-level commander at approximately one call per side every 30 seconds. That is **not present in v37** and should not be introduced unless explicitly requested.

---

# APPENDIX A — ORIGINAL SUPPLIED GRID COMMAND DOCUMENT

The following is preserved from the user-supplied `commander_gpts_version.md`.

It is included in full so none of the original design intent is lost.

**Precedence reminder:** where this legacy/original text conflicts with Sections 1–28 above or with the v37 source, current v37 behavior wins.

---

# COMMANDER.md
## Grid Command — realistic command & logistics specification v2

This file is the source of truth for the current build. It intentionally condenses the prior `HAL_TOPDOWN_SIM_DESIGN.md`, the HAL 1.22 commander concepts, and the latest direction. When they conflict, **this file wins**.

The goal is a real-time, low-poly, top-down 3D military tactics simulation where each side is run by a field commander AI. The commander issues missions to squads/groups, not individual movement or weapon commands. The battlefield should look alive at soldier and vehicle level while the strategic AI remains HAL-like: observe, assess, decide, issue orders, repeat.

---

## 1. Non-negotiable game rules

- Two sides: `BLUE` and `RED`.
- AI vs AI is required. Human commander control may replace one AI.
- Simulation tick: 20 Hz. Rendering is independent.
- Commander decisions are deterministic from match seed + personality + known information.
- Commanders **must not be omniscient**. They only know:
  - their own forces,
  - owned/captured positions,
  - enemy contacts reported by friendly units, drones, or other sensors,
  - last-known enemy positions until those reports expire.
- Commanders issue missions to **groups/squads**. Squad leaders handle member placement and local movement.
- Core objectives remain five capture points, A–E, between the two MOBs.
- Default win: own A–E simultaneously for 60 continuous seconds.
- Additional win condition: kill the enemy commander/staff.
- 20 minute hard stop: most objectives wins, then living combat power, then draw.
- Each side starts with **2000 strategic supply points (SP)**.
- Strategic supply points are purchasing authority, **not physical materiel**.
- Each side gains **+10 SP every 5 simulation seconds** by default (`SUPPLY_CREDIT_TICK = 5s`). This number is configurable for scenario pacing.
- Spending SP places an order into the theater supply pipeline. The purchased fuel, ammunition, personnel, parts, construction material, vehicles, or other materiel must physically enter the battlefield through a friendly operational airbase and then be transported forward.
- Units, construction, repairs, FOB upgrades, artillery/air support, replacement personnel, ammunition, fuel, and resupply all consume either SP, physical stocks, or both.
- Enemy information is delayed by reporting. Seeing a unit locally does not instantly reveal it to the commander.

---

## 2. Map and rendering stack

Use:

- **MapLibre GL JS**
- **CARTO Voyager raster** basemap
- **AWS Terrarium / Mapzen DEM** as `raster-dem`
- MapLibre terrain + hillshade
- Three.js entities rendered as a **MapLibre custom layer in the same WebGL context**
- Use the DEM as the simulation heightfield so visual terrain and unit elevation agree.

If full OSM/Overpass geometry is unavailable, keep the game functional by deriving/synthesizing approximate buildings, roads, water, and wooded areas from available map tiles/data. Record all fallbacks in `DEVIATIONS.md`.

### Visual palette

- Ground: near-black navy.
- Roads: neutral grey.
- Water: saturated light blue.
- Buildings: smooth blue → dark-blue vertical gradient with a bright saturated blue outline.
- BLUE units: blue accents and blue tracers.
- RED units: red accents and red tracers.
- Commander: visually larger than ordinary infantry, with a green command marking and blue/red side identification.
- Capture points and FOBs must be readable from the default top-down camera.

Do not replace the real map with a flat abstract board. Terrain elevation, roads, structures, water, and vegetation must affect movement, visibility, and tactics.

---

## 3. World/navigation

- World units are meters.
- Keep the existing real-world Cedar River style battlefield and five-point corridor logic unless a map is explicitly changed.
- Commander reasoning grid: 50 m × 50 m cells.
- Terrain classes: `OPEN`, `URBAN`, `FOREST`, `WATER`.
- Infantry can traverse most land.
- Wheeled vehicles strongly prefer roads and avoid steep slopes.
- Tracked vehicles can move off-road more effectively.
- Water is impassable to ground units except bridges/fords.
- Armor should avoid dense urban/forest terrain unless tactically necessary.
- Roads should matter enough that ambushes, bridges, chokepoints, and logistics routes emerge naturally.

---

## 4. Unit presentation and animation

### Soldiers

Soldiers are recognizable low-poly people, not capsules/icons.

Required visual features:

- helmet,
- plate carrier,
- weapon matching role,
- team marking,
- articulated legs,
- independently rotating upper torso.

Required states:

- idle,
- walk/run with leg motion,
- aim with torso rotation independent of legs,
- crouch,
- prone,
- fire with visible recoil,
- suppressed/flinch,
- wounded,
- dead.

Wounded soldiers who are incapacitated lie on their back and visibly breathe. Dead soldiers become completely still and leave a small red blood splat underneath them.

Different roles must visibly carry different weapons/equipment:
- Rifleman: rifle.
- MG: machine gun.
- AT: launcher + rifle.
- Scout: light rifle/carbine + light kit.
- Logistics/engineer: SMG + construction gear.
- Medic: medical kit.
- Squad leader: rifle/carbine + radio/leadership marking.
- Commander: larger silhouette + green command identification.

### Vehicles

Vehicles remain low-poly but must read as vehicles at a glance.

Required details:

- wheels/tracks,
- windshield where applicable,
- exhaust while engine is running,
- headlights/marker details where cheap,
- visible weapon mount,
- independent turret rotation for turreted vehicles,
- hull and turret aim separately.

Destroyed vehicles should burn/smoke briefly, then remain as wrecks.

---

## 5. Combat feedback

- Small-arms fire uses glowing team-colored tracers:
  - BLUE = blue,
  - RED = red.
- Do not make every bullet a tracer. Use enough to communicate fire direction.
- Muzzle flash, recoil, impact sparks/dust, explosions, smoke, and suppression effects should make combat legible from top-down view.
- Infantry use stance intelligently:
  - crouch when holding/aiming in partial cover,
  - prone under strong fire or when defending open ground,
  - stand/run while relocating.
- Upper bodies track targets independently while legs continue movement when appropriate.

---

## 6. Damage model

### Infantry

- Hits reduce HP.
- Wounded/incapacitated soldiers stop fighting and enter the breathing-on-back state.
- Medics may stabilize/heal wounded infantry.
- Dead soldiers remain still with blood splat.

### Vehicles

Vehicle damage has two levels:

1. **Disabled**
   - Sustained ordinary fire can damage optics, weapons, wheels/tracks, or engine enough to disable mobility.
   - A disabled vehicle is not necessarily destroyed.
   - If mobility is lost, crew/driver dismount one-by-one and continue as infantry if alive.

2. **Destroyed**
   - Only dedicated anti-vehicle weapons such as AT, tank cannon, heavy air attack, bombs, or equivalent can fully destroy an armored vehicle.
   - Small arms may disable a vehicle after enough sustained fire but cannot reduce an armored vehicle to a catastrophic kill.

Turrets can remain operational on an immobilized vehicle unless specifically damaged.

---

## 7. Transport behavior

Embark/disembark must be physical and sequential.

- Transport moves to the passenger squad.
- Soldiers path to doors/loading points.
- They enter **one by one**.
- Mounted soldiers are hidden/attached to seats.
- Vehicle travels to destination or dismount point.
- Soldiers exit **one by one**.
- Squad reforms before continuing.

Unarmed transports avoid delivering troops directly into a known enemy position. They should dismount early if a contact is reported along the final approach.

Helicopters use the same concept, but land/hover at an LZ and load/unload sequentially.

---

## 8. Supply and logistics

### Global economy

- Starting strategic supply points: `2000` per side.
- Strategic credit generation: `+10 SP every 5 s` by default.
- SP is generated off-map. It does **not** appear magically at the MOB or front.
- Spending SP creates a physical requisition at the off-map theater depot.
- Requisitions enter the map on scheduled cargo aircraft at a friendly operational airbase.
- Cargo is unloaded into the airbase stockpile, then moved by truck/helicopter through the logistics network to MOBs, FOBs, logistics release points, and units.
- Capture points and FOBs do **not** create materiel from nothing. Their value is terrain, protection, storage, communications, staging, and shortening the distribution network.
- If no friendly operational airbase is available, SP may continue accumulating and orders may queue off-map, but no new physical materiel can enter the battlefield until an airbase is restored or captured.
- Logistics deliveries physically move inventories between nodes.

Suggested costs, tune only for balance while preserving relative value:

| Item | Supply |
|---|---:|
| Scout section | 150 |
| Rifle squad | 200 |
| MG team | 250 |
| Logistics/Engineer team | 300 |
| AT team | 350 |
| Medic team | 250 |
| Transport truck | 350 |
| Recon jeep | 400 |
| Repair/resupply truck | 500 |
| Mortar section | 700 |
| APC | 700 |
| IFV | 1000 |
| MBT | 1500 |
| Drone sortie | 1000 |
| Transport helicopter | 1800 |
| Attack helicopter | 3500 |
| Jet bombing run | 10000 |

Do not let AI spend itself to zero without retaining enough supply for emergency infantry/AT unless the commander personality is extremely reckless.

### Logistics unit

Logistics/engineer teams are weak combat troops with SMGs but are the primary builders.

They can construct:

- garrisons,
- HESCO walls,
- sandbags,
- roadblocks,
- fighting positions,
- ammo/supply crates,
- repair points,
- FOB structures.

They should autonomously fortify:
- the MOB,
- captured bases,
- FOBs,
- ambush/chokepoint locations selected by the commander.

Regular infantry can assist construction but build much more slowly.

---

## 9. Squad leaders

Every infantry squad has a squad leader.

The **commander orders the squad**.  
The **squad leader orders members**.

Squad leader responsibilities:

- choose formation,
- assign local cover positions,
- place MG/AT members,
- order crouch/prone,
- control short tactical bounds,
- choose assault/hold/withdraw positions inside the commander mission area,
- keep the squad reasonably together,
- mount/dismount transport.

The commander never micromanages those individual positions.

### FOB request

Squad leaders may request an FOB at a tactically useful location. The commander approves only if:

- location is sufficiently far from MOB,
- area is not currently under strong enemy fire,
- route or air access exists,
- enough supply/logistics support exists,
- another FOB is not already serving the same area.

---

## 10. FOB system

FOB = non-capturable forward operating base. It can only change hands by destruction and rebuilding.

A FOB has a central command/radio tower. Destroying that tower destroys/disables the FOB.

### Level 1

- Large garrison / defensive hub.
- Accepts supply drops.
- Acts as medic/repair/rest destination.
- Infantry can stage from it.
- Basic HESCO/sandbag defenses.

### Level 2

Includes Level 1 plus:

- commander can spawn eligible ground vehicles directly at the FOB,
- larger supply storage,
- stronger defenses.

### Level 3

Includes Level 2 plus:

- commander can deploy infantry to the FOB faster via helicopter shuttle from MOB,
- improved sensor/radio range,
- strongest tower/defenses.

FOBs require logistics units to build and upgrade. Build time and supply cost increase by level.

---

## 11. Air

Air is enabled.

### Drone

- Recon only.
- Reveals contacts to commander while observing them.
- High altitude, wide vision, low direct combat value.
- Enemy AA can threaten it if AA is implemented.

### Transport helicopter

- Moves infantry and/or supplies between MOB, FOB, and safe LZs.
- Avoids known AA.
- Uses sequential loading/unloading.

### Attack helicopter

- Expensive.
- Used against armor, concentrations, or to rescue a failing front.
- Avoids known AA zones.

### Jet bombing run

- Commander ability, not a persistent loitering unit.
- Cost: **10000 supply**.
- Requires a confirmed/recent target.
- Dangerous to friendlies, so reject strikes too close to friendly forces.
- Extremely powerful but rare.

Add lightweight AA logic so air has a counter. At minimum, AT/AA-capable units create threat zones the commander tries to avoid.

---

## 12. Information, spotting, and radio

No instant commander omniscience.

Local units may see enemies immediately, but the commander receives a report after a radio delay.

Each enemy report creates a `ContactToken`:

```text
group_id
side
tags_snapshot
last_known_position
cell
estimated_strength
estimated_combat_power
time_seen
time_reported
confidence
```

Suggested behavior:

- Normal infantry radio delay: 1.5–4 s.
- Scout/squad leader: 0.5–1.5 s.
- Drone: ~0.25 s.
- Broken/suppressed units may report more slowly.
- Contact expires after ~30 s without refresh.
- Confidence decays with age.
- Commander plans only from valid contact tokens.

A commander should not initially know whether an unseen contact is riflemen, AT, armor, artillery, etc. Classification becomes more accurate after observation/reporting.

---

## 13. Commander personality and morale

Each commander rolls:

```text
recklessness
circumspection
activity
consistency
```

- Recklessness: willingness to attack through risk.
- Circumspection: recon/avoidance preference.
- Activity: how often plans are reconsidered.
- Consistency: tendency to stick with an existing plan instead of retasking.

Commander cycle interval should vary roughly 8–18 seconds.

Morale starts at 0 and falls toward -50.

Morale falls from:
- group destruction,
- recent casualties,
- lost capture points,
- enemy strength appearing superior,
- commander under direct threat.

Morale rises from:
- taking objectives,
- destroying important enemy units,
- periods without losses while own known strength is superior.

Low morale + enemy superiority pushes the commander into defense/withdrawal. Personality changes probabilities and thresholds, not the basic rules.

---

## 14. HAL-style commander cycle

Run independently per side. Do not issue both commanders' orders on the same tick.

### PHASE 1 — SENSE: “What is going on?”

- Rebuild friendly group lists by role/tag.
- Process new radio reports.
- Expire stale contact tokens.
- Estimate own combat power.
- Estimate **known** enemy combat power.
- Update morale.
- Classify A–E:
  - owned self,
  - owned enemy,
  - contested,
  - neutral/visible,
  - fogged.
- Assess routes, terrain, known AT/AA zones, damaged units, supply state, FOBs, and transport availability.

### PHASE 2 — DECIDE: “What should we do?”

Decision priority:

1. **Emergency**
   - protect commander/MOB if directly threatened,
   - rescue/withdraw combat-ineffective groups,
   - dispatch medics/repair/resupply.

2. **Defensive stance**
   - if morale is low or known enemy power is decisively stronger:
     - form a defensive perimeter between threat and commander/nearest important owned point,
     - prefer reverse slopes, buildings, chokepoints, bridges, and prepared HESCO,
     - place MG/AT/armor in strong positions,
     - keep a reserve,
     - scouts observe forward,
     - logistics/support remain behind the line.
   - reserves reinforce whichever owned position becomes most threatened.

3. **Recon**
   - if no useful enemy contact exists or an objective is fogged, send scouts/drone first.
   - recon avoids unnecessary combat.

4. **Counter known threats**
   - attack enemy contacts that are under-covered.
   - assemble enough appropriate power, generally seeking local superiority.
   - prefer AT against armor.
   - prefer armor against infantry in open terrain.
   - avoid sending armor into urban/forest areas containing known AT unless necessary or commander is reckless.
   - avoid sending air into known AA zones.

5. **Capture**
   - current objective is the first not-owned point toward the enemy.
   - send infantry to capture once adequately reconned.
   - attach transport when distance is long.
   - after capture, leave a garrison and move the strategic focus forward.

6. **Flank / encircle**
   - use reserves for wide flank when enemy line is broad, fixed, or overcommitted.
   - route around known enemy observation where possible.
   - hit sides/rear, then rejoin main effort.

7. **Garrison / fortify**
   - captured positions should not remain empty.
   - assign infantry garrison.
   - assign logistics to improve defenses.
   - create ambushes at likely enemy approaches.

8. **FOB**
   - if front has moved far from MOB and logistics permit it, approve/build an FOB.
   - favor protected locations near roads, terrain cover, and the active front but not inside direct fire.

9. **Special forces**
   - use SF against high-value confirmed targets such as artillery, air-defense, logistics, or enemy commander.
   - wide approach, short attack, withdraw.

10. **Fire support / air**
    - mortars engage valid targets with friendly-fire safety.
    - drones fill information gaps.
    - helicopters solve transport or urgent combat problems.
    - bombing run only for extremely high-value opportunity and sufficient supply.

11. **Idle/reserve**
    - unused effective groups patrol/guard useful locations and remain instantly retaskable.

12. **Purchase/build**
    - buy at most one major unit/group per decision cycle unless replacing catastrophic losses.
    - prioritize missing capability over raw numbers:
      1. recon if blind,
      2. AT if enemy armor is known,
      3. infantry if objectives/garrisons are understrength,
      4. transport if troops cannot reach front efficiently,
      5. logistics if fortifications/FOBs/supply are bottlenecked,
      6. mortar/fire support if enemy is concentrated,
      7. armor for open-terrain breakthrough,
      8. air only when economy and threat picture justify it.

### PHASE 3 — ISSUE: “Yes sir.”

- Issue complete missions/waypoints to groups.
- Do not wait for missions to finish before ending the cycle.
- Existing missions continue until completed, invalidated, or deliberately replaced.
- Consistent commanders avoid needless retasking.
- If a group is stuck, re-path or change mission next cycle.

---

## 15. Missions

Every group has exactly one high-level mission:

- `RECON`
- `ATTACK`
- `CAPTURE`
- `FLANK`
- `DEFEND`
- `DEF_RESERVE`
- `GARRISON`
- `SUPPORT`
- `CARGO_HAUL`
- `REST`
- `IDLE`
- `SF_RAID`
- `FIRE_MISSION`
- `FORTIFY`
- `BUILD_FOB`
- `SUPPLY_RUN`
- `AIR_RECON`
- `AIR_TRANSPORT`
- `AIR_ATTACK`
- `BOMBING_RUN`
- `HOLD_MOB`

Mission replacement cancels remaining waypoints from the old mission.

### Mission behavior summary

- **RECON:** observe objective/route, avoid combat unless attacked.
- **ATTACK:** approach from front/flank based on terrain, engage known contact.
- **CAPTURE:** enter capture area and hold until ownership flips and area is secure.
- **FLANK:** multi-waypoint arc around enemy line, attack side/rear.
- **DEFEND:** occupy prepared terrain/cover and hold.
- **DEF_RESERVE:** stay behind line and reinforce threatened sector.
- **GARRISON:** occupy captured building/defensive positions, only leave for nearby threats.
- **SUPPORT:** medic/repair/resupply a needy group without driving into obvious danger.
- **CARGO_HAUL:** pick up, transport, sequentially unload.
- **REST:** withdraw ineffective group to safe support area.
- **IDLE:** local patrol/guard, instantly interruptible.
- **SF_RAID:** strike confirmed high-value target and withdraw.
- **FIRE_MISSION:** mortar/indirect fire at confirmed safe target.
- **FORTIFY:** logistics build defenses.
- **BUILD_FOB:** establish or upgrade FOB.
- **SUPPLY_RUN:** move supply between MOB/FOB/front.
- **AIR_*:** appropriate air task.
- **HOLD_MOB:** commander/staff remain at MOB unless emergency relocation is later implemented.

---

## 16. Capture points and garrisons

- Five points: A, B, C, D, E.
- 50 m capture radius.
- Both sides present = contested.
- One side exclusively present for 8 s = capture.
- Support-only units do not capture.
- On capture:
  - morale increases,
  - flag/banner changes,
  - commander is notified after normal command/report delay,
  - commander should assign a garrison and consider fortification.
- Losing a point lowers morale and makes recapture a high priority.

---

## 17. Support systems

Retain the useful HAL concepts:

- combat-ineffective groups withdraw to rest/support rather than fighting to the last man,
- medics move toward wounded infantry,
- repair/resupply vehicles move toward damaged/low-ammo units,
- support assets prefer positions behind the front,
- support avoids known enemy positions unless saving the last viable combat force,
- reserves remain available for reinforcement,
- SF targets high-value assets,
- mortar/artillery missions respect friendly-fire safety.

Surrender/panic may be added later but is not required for the current build.

---

## 18. Commander death

The commander/staff is a high-value “king” unit.

- Commander is larger and visually distinct.
- Commander normally remains at MOB.
- If all commander staff die:
  - that side immediately loses under the current latest win rule,
  - all remaining units may finish their current local actions for visual continuity,
  - no new commander missions or purchases occur.

This rule overrides the older design where commander death alone did not end the match.

---

## 19. Camera and UI

Camera:
- top-down oblique tactical view,
- free yaw,
- practical zoom from close enough to see soldier animations to high enough to read the full fight.

Required HUD/debug information:

- supply and supply income,
- owned A–E,
- commander alive/dead,
- morale,
- stance,
- personality values,
- living groups,
- current mission per group,
- known enemy contact markers only,
- FOB levels/status,
- active build/production queues,
- match timer and 5/5 hold timer,
- seed,
- map loading/DEM status.

Contact markers show **last known** data and fade as confidence expires.

---

## 20. Real logistics: strategic credits become physical materiel

The game uses two separate layers:

### 20.1 Strategic supply points

`SP` is an abstract theater-level procurement/allocation budget.

```text
STARTING_SP = 2000
SUPPLY_CREDIT_AMOUNT = 10
SUPPLY_CREDIT_TICK = 5.0 s
```

Every tick, each side receives `+10 SP`. Scenarios may change the cadence, but the default model must preserve the distinction between **budget** and **physical stock**.

SP can purchase:

- unit replacements,
- vehicles,
- ammunition,
- fuel,
- medical materiel,
- repair parts,
- construction material,
- aviation fuel/ammunition,
- artillery/mortar ammunition,
- air missions.

Spending SP does not teleport the item to a unit. It creates an off-map requisition.

### 20.2 Physical supply classes

Use these gameplay classes:

```text
FUEL
AMMO_SMALL
AMMO_MG
AMMO_AT
AMMO_HEAVY
AMMO_MORTAR
CONSTRUCTION
MEDICAL
REPAIR_PARTS
MANPOWER
AVIATION_FUEL
AVIATION_ORDNANCE
```

Do not simulate every real U.S. supply class separately. These classes are enough to produce realistic constraints without turning the game into warehouse software.

Each logistics node stores explicit quantities.

```text
SupplyNode:
  id
  owner
  type: AIRBASE | MOB | FOB | LRP | CACHE | UNIT
  capacity_by_class
  inventory_by_class
  throughput_per_second
  loading_points[]
  unloading_points[]
  operational
```

### 20.3 Consumption

Physical stocks are consumed continuously or on action:

- movement consumes fuel,
- off-road movement increases vehicle fuel use,
- firing consumes the matching ammunition,
- indirect fire consumes mortar/heavy ammunition,
- construction consumes construction stock,
- repairs consume repair parts,
- medical treatment consumes medical stock,
- replacement soldiers consume manpower,
- aircraft consume aviation fuel and ordnance,
- damaged equipment may consume extra repair parts/fuel.

A unit with no ammunition can still move and report but cannot use that weapon.
A vehicle with no fuel stops.
A unit short of medical/repair support recovers much more slowly.

### 20.4 Resupply state

Every unit tracks:

```text
fuel_fraction
ammo_fraction_by_weapon
medical_fraction
repair_parts_fraction
personnel_fraction
days_of_supply_score   // abstract commander estimate, not literal days in a short match
```

Commander and subcommanders reason about these values.

Suggested thresholds:

```text
GREEN   >= 0.70
AMBER   >= 0.40
RED     >= 0.15
BLACK   <  0.15
```

At `RED`, commanders should avoid launching a new major attack unless the mission is urgent.
At `BLACK`, affected units should seek resupply or withdraw.

---

## 21. Airbase and theater-entry logistics

### 21.1 Airbases are separate from the MOB

Each side begins with a rear-area airbase, for example:

```text
BLUE_AIRBASE
RED_AIRBASE
```

The airbase is geographically separate from the MOB.

The required flow is:

```text
OFF-MAP THEATER DEPOT
        ↓ cargo aircraft
      AIRBASE
        ↓ truck / helicopter
        MOB
        ↓ LOGPAC / convoy
      FOB / LRP
        ↓ local distribution
       UNIT
```

There must be a real route between airbase and MOB. The airbase-to-MOB connection is therefore a strategic vulnerability.

### 21.2 Cargo aircraft

Requisitions are grouped into manifests.

Default behavior:

```text
AIRLIFT_INTERVAL = 60 s
AIRLIFT_MIN_LOAD = 1 requisition
AIRLIFT_MAX_SP_EQUIVALENT = scenario configurable
```

When a flight is due:

1. Build a manifest from the oldest/highest-priority requisitions.
2. Spawn cargo aircraft off-map.
3. Fly an approach to the controlled airbase.
4. Land.
5. Taxi to cargo apron.
6. Unload pallets/vehicles/personnel into the airbase stockpile.
7. Depart after turnaround.

Do not require every crate to be an individual rigid-body object. A visible pallet/vehicle unloading sequence plus inventory transfer is sufficient.

If the runway is blocked, destroyed, contested, or enemy-controlled, the flight diverts or returns off-map and the requisition remains queued.

### 21.3 Capturing an airbase

Airbases are capturable strategic objectives even though they are not part of the five A-E victory points.

To capture:

- friendly combat troops must clear the airfield control zone,
- the control tower/operations building must be occupied,
- enemy combat troops cannot remain in the zone,
- capture timer completes.

On capture:

- current incoming enemy cargo flights abort/divert,
- old owner's local airbase stock becomes lootable/capturable,
- runway may require engineer inspection/repair,
- new owner needs a short reactivation period before accepting its own theater flights,
- ownership immediately changes strategic logistics planning.

The commander should dedicate security forces to the airbase because losing it can starve the entire force.

### 21.4 Runway damage

Runways use a simplified damage model:

```text
OPERATIONAL
DEGRADED
CLOSED
```

Bomb/crater damage may reduce capacity or close the runway.
Engineers can repair runway damage using `CONSTRUCTION` and `REPAIR_PARTS`.

---

## 22. Distribution network, MSRs, LOGPACs, and convoys

### 22.1 Routes

Each side maintains:

- `MSR` = Main Supply Route,
- zero or more `ASR` = Alternate Supply Routes.

Routes are chosen from the road graph based on:

```text
travel_time
road_capacity
bridge status
known enemy threat
known mine/obstacle threat
terrain
distance
```

A blocked MSR should trigger route replanning.

### 22.2 Logistics package

Do not send support vehicles individually to every needy unit.

Create `LOGPAC` objects:

```text
LOGPAC:
  destination
  requesting_subcommand
  fuel
  ammunition[]
  medical
  repair_parts
  construction
  manpower
  vehicles[]
  assigned_transport[]
  escort[]
  route
  departure_time
```

Subcommanders submit requests upward.
The logistics planner bundles compatible requests into a convoy.

### 22.3 Logistics release point

A `LOGISTICS_RELEASE_POINT (LRP)` is a temporary protected transfer location behind the front.

Choose LRPs:

- near roads,
- outside known direct-fire range,
- preferably terrain/building masked,
- near multiple requesting units,
- with room for vehicle circulation.

Convoy brings supply to LRP.
Subordinate logistics vehicles or units complete the last-mile movement.

### 22.4 Convoys

Convoys physically move.

Behavior:

- form up before departure,
- maintain spacing,
- slow for damaged roads/bridges,
- halt if lead vehicle identifies threat,
- attempt bypass if route blocked,
- request escort if threat score high,
- scatter or reverse if ambushed,
- report contact and losses.

The AI must understand that destroying enemy logistics can be more valuable than destroying another rifle squad.

High-value logistics targets include:

- fuel trucks,
- ammunition trucks,
- recovery vehicles,
- airbase cargo apron,
- bridges on an MSR,
- FOB supply dumps,
- logistics convoys.

---

## 23. Operational culmination and sustainment planning

A force must be able to **outrun its logistics**.

For every planned offensive, compute a rough sustainment forecast:

```text
projected_fuel_need
projected_ammo_need
projected_casualties
projected_repair_need
round_trip_convoy_time
available_transport_tonnage
route_threat
forward_storage
```

Calculate:

```text
SUSTAINMENT_MARGIN = projected_available_supply / projected_required_supply
```

Guidance:

```text
> 1.25  healthy
1.00-1.25 acceptable
0.75-1.00 risky
< 0.75 likely culmination
```

If the force approaches culmination, commander choices include:

- pause,
- establish FOB/LRP,
- move stock forward,
- shorten frontage,
- rotate tired units,
- repair damaged vehicles,
- request more trucks,
- switch to defense,
- continue anyway if personality/mission demands it.

An aggressive commander may knowingly accept a lower sustainment margin.

---

## 24. Command hierarchy and subcommanders

The command structure is now:

```text
THEATER / FORCE COMMANDER
        ↓
SUBCOMMANDERS
(company / task-force / sector commanders)
        ↓
PLATOON / SECTION LEADERS
        ↓
SQUAD LEADERS / VEHICLE COMMANDERS
        ↓
INDIVIDUAL SOLDIERS / CREW
```

### 24.1 Force commander

The top commander decides:

- commander's intent,
- main effort,
- supporting effort,
- reserve,
- broad objectives,
- boundaries,
- air/logistics priorities,
- major purchases,
- operational risk,
- which subcommand owns which mission/sector.

The top commander should **not** individually order every squad once subcommanders exist.

### 24.2 Subcommanders

A subcommander controls a set of groups, normally 3-8 tactical groups.

Examples:

```text
ALPHA_CO   infantry-heavy assault force
BRAVO_CO   defense/security force
ARMOR_TF   armored maneuver force
LOG_CMD    logistics/support force
AIR_CMD    aviation assets
```

Subcommanders receive:

```text
task
purpose
area/sector
priority
constraints
support allocation
termination conditions
```

Example:

```text
TASK: seize POINT_C
PURPOSE: open the route to POINT_D
BOUNDARY: north of Route X
PRIORITY: main effort
SUPPORT: mortar section 1
CONSTRAINT: preserve MBT platoon above 60% combat power
END_STATE: C owned, route east secure, company >= 50% combat effective
```

The subcommander decides:

- which platoon/squad attacks,
- which supports by fire,
- which flanks,
- local reserve,
- local casualty/resupply priorities,
- exact tactical route within its area.

### 24.3 Platoon and squad leadership

Platoon leaders coordinate multiple squads.
Squad leaders control individual soldiers.

Local leaders may exercise disciplined initiative when:

- communications are lost,
- the assigned method becomes impossible,
- enemy appears unexpectedly,
- a fleeting opportunity directly supports higher intent.

They may change **method**, but should not casually change the **purpose**.

### 24.4 C2 degradation

If a subcommander is killed or disconnected:

- subordinate groups keep executing current intent,
- reporting to higher command may degrade,
- highest surviving subordinate leader assumes temporary control after delay,
- higher commander may reattach those groups to another subcommand.

This creates useful resilience without magical perfect control.

---

## 25. Chess-master strategic planner

Do **not** embed Stockfish and try to encode this battlefield as a chessboard.

Stockfish is useful as an architectural inspiration because it separates:
- position evaluation,
- candidate move generation,
- deep search,
- pruning,
- cached/transposition results,
- principal variation,
- iterative deepening.

A military battle has continuous space, hidden information, simultaneous actions, logistics, and thousands of possible low-level actions, so literal chess alpha-beta search is the wrong state model.

### 25.1 Browser architecture

Use a hybrid planner:

```text
HTN doctrine layer
    ↓ generates legal operational courses of action (COAs)
MCTS / best-first strategic search
    ↓ compares COAs several steps into the future
evaluation function
    ↓ scores resulting approximate states
subcommand HTN
    ↓ turns chosen COA into missions
squad local AI
    ↓ executes physically
```

Run strategic planning in a **Web Worker** so it never blocks MapLibre/Three.js rendering.

### 25.2 HTN layer

The HTN decomposes goals such as:

```text
SEIZE_OBJECTIVE(C)
DEFEND_SECTOR(NORTH)
RESTORE_MSR
RELIEVE_ISOLATED_UNIT
ESTABLISH_FOB
DESTROY_ENEMY_ARMOR
SECURE_AIRBASE
```

Example:

```text
SEIZE_OBJECTIVE
  -> GAIN_INFORMATION
  -> ESTABLISH_LOCAL_SUPERIORITY
  -> ISOLATE_OR_SUPPRESS
  -> MANEUVER
  -> ASSAULT
  -> CONSOLIDATE
  -> RESUPPLY
```

Alternative methods are generated according to terrain, known enemy strength, personality, logistics, and available forces.

### 25.3 Search state

The strategic search never simulates every bullet.

Use a compact state:

```text
objective_ownership
friendly_force_by_sector
known_enemy_force_by_sector
contact_confidence
reserve_power
fuel/ammo posture
route_status
airbase_status
FOB status
morale
fatigue
C2 status
artillery/air availability
time
```

### 25.4 Candidate actions

A strategic "move" is a doctrinal macro-action, for example:

```text
MAIN_ATTACK_C
FEINT_B_ATTACK_C
DEFEND_C_COUNTERATTACK
FLANK_NORTH
INTERDICT_ENEMY_MSR
SECURE_OWN_AIRBASE
BUILD_FOB_NEAR_C
PAUSE_AND_RESUPPLY
WITHDRAW_TO_B
COMMIT_RESERVE
AIR_INTERDICT
```

Limit candidate count aggressively. The planner should consider perhaps 6-20 high-quality COAs, not thousands of squad waypoints.

### 25.5 Evaluation function

Score approximately:

```text
score =
  + objective_value
  + expected_combat_power_balance
  + reserve_quality
  + logistics_health
  + airbase_security
  + MSR_security
  + information_advantage
  + terrain_advantage
  + C2_health
  + force_preservation
  + initiative
  - projected_casualties
  - fuel/ammo deficit
  - route_exposure
  - isolation_risk
  - overextension
  - commander_threat
```

Weights are modified by commander personality.

### 25.6 Imperfect information

Search must use the commander's **belief state**, not ground truth.

Unknown enemy strength is represented as a distribution/range.

Example:

```text
POINT_C:
  observed: 1 rifle squad
  possible_hidden_AT_probability: 0.35
  possible_reserve_power: 0..12
```

During planning, sample plausible enemy states ("determinization") and score a COA across several samples.

This prevents the planner from cheating.

### 25.7 Iterative deepening

Planning budget:

```text
FAST_REPLAN:   15-30 ms
NORMAL_REPLAN: 50-150 ms
MAJOR_PLAN:    250-750 ms
```

Use iterative deepening until time budget expires.
Always retain the best complete plan found so far.

Cache approximate states with a transposition table keyed from:

```text
ownership + sector power bins + logistics bins + contact bins + route state
```

### 25.8 Recommended implementation

For the browser build:

- implement the runtime HTN + search in TypeScript,
- execute it in one or more Web Workers,
- keep the state representation immutable or copy-on-write,
- use deterministic seeded RNG,
- serialize only compact planning state between worker and simulation,
- never send full Three.js objects to the planner.

External planners such as SHOP/SHOP3 are useful references for HTN decomposition, but the runtime should remain browser-native and tailored to this game's state space.

---

## 26. Commander's intent, planning horizons, and decision points

Each force commander maintains:

```text
CURRENT_OPERATION
NEXT_OPERATION
FUTURE_OPERATION
```

Example:

```text
CURRENT: seize B
NEXT: secure B, move LOGPAC/LRP forward, recon C
FUTURE: seize C and establish FOB west of river
```

### 26.1 Intent

Every operation has:

```text
purpose
key_tasks[]
end_state
main_effort
supporting_efforts[]
reserve
constraints[]
risk_tolerance
```

### 26.2 Decision points

Plans should contain triggers rather than constant arbitrary retasking.

Examples:

```text
IF enemy armor appears north of C:
    commit AT reserve

IF BLUE_AIRBASE becomes contested:
    divert security company

IF main effort loses >35% combat power:
    break contact unless C capture is <10 s from completion

IF MSR is blocked:
    activate ASR and dispatch engineer/recon

IF projected sustainment margin <0.75:
    pause advance and push LOGPAC
```

This makes the commander look like it planned ahead.

---

## 27. Fatigue, rotation, reconstitution, and replacements

### 27.1 Fatigue

Infantry and crews accumulate fatigue from:

- movement,
- sprinting,
- combat,
- carrying heavy weapons,
- being suppressed,
- lack of rest,
- repeated night activity.

Fatigue reduces:

- movement speed,
- spotting,
- reaction time,
- accuracy,
- morale resistance.

### 27.2 Unit rotation

Subcommanders should rotate units:

```text
FRONTLINE -> RESERVE -> REST/REFIT -> FRONTLINE
```

Avoid keeping the same squad in combat indefinitely.

### 27.3 Reconstitution

A depleted group may:

- withdraw to MOB/FOB,
- receive replacement manpower,
- receive replacement weapons,
- repair vehicles,
- refill ammunition/fuel,
- combine with another badly depleted compatible group if scenario permits.

Replacements consume `MANPOWER` physical stock and SP requisition cost.

---

## 28. Casualty treatment and evacuation

Replace instant healing with a simplified evacuation chain:

```text
WOUNDED
  ↓ buddy aid / medic stabilization
CASUALTY_COLLECTION_POINT
  ↓ ambulance / helicopter
MOB / FOB TREATMENT
  ↓
RETURN_TO_DUTY or REMOVED
```

### 28.1 Casualty states

```text
LIGHT_WOUND
SERIOUS_WOUND
INCAPACITATED
KIA
```

- Light wound: soldier can fight with penalties.
- Serious wound: soldier should withdraw if possible.
- Incapacitated: cannot fight, breathing animation, needs evacuation.
- KIA: still body + blood marker.

Carrying a casualty removes at least one additional healthy soldier from normal combat activity.

### 28.2 CASEVAC/MEDEVAC

Ground ambulance:
- safer,
- slower,
- route dependent.

Helicopter:
- faster,
- expensive,
- vulnerable to AA,
- requires suitable LZ.

Subcommanders create casualty collection points behind the fighting.

---

## 29. Vehicle readiness, maintenance, and recovery

Replace simple vehicle HP-only logic with subsystem readiness.

```text
mobility
engine
running_gear
main_weapon
secondary_weapon
turret_drive
optics
radio
crew
fuel
ammo
overall_readiness
```

Overall readiness:

```text
FMC  = fully mission capable
PMC  = partially mission capable
NMC  = non-mission capable
```

Examples:

- damaged optics -> reduced spotting/accuracy,
- damaged turret drive -> slow/fixed turret,
- damaged tracks/wheels -> reduced or zero mobility,
- engine damage -> reduced speed/higher fuel consumption,
- weapon damage -> weapon unavailable,
- radio damage -> reporting/orders delayed or unavailable.

### 29.1 Recovery

Add a recovery vehicle/wrecker capability.

A disabled but repairable vehicle can be:

- repaired on site,
- towed to a repair collection point,
- evacuated to FOB/MOB,
- abandoned.

Recovery requires time, repair parts, and a safe route.

Enemy forces may capture abandoned vehicles if compatible gameplay rules allow it.

---

## 30. Suppression, cohesion, withdrawal, and delay

Suppression must often matter more than killing.

Group state includes:

```text
suppression
cohesion
morale_local
fatigue
leader_alive
```

Effects may include:

- stop exposed movement,
- seek nearest cover,
- crouch/prone,
- slower orders,
- degraded accuracy,
- reduced spotting,
- refusal to cross an exposed danger area,
- temporary pinning.

Add missions:

```text
BREAK_CONTACT
WITHDRAW
DELAY
SCREEN
GUARD
COVER
ROUTE_SECURITY
FLANK_SECURITY
```

### Delay

A delaying force:
- occupies successive positions,
- fires briefly,
- disengages before being fixed/destroyed,
- trades terrain for time.

Commanders should preserve forces rather than wait until they are nearly annihilated.

---

## 31. Buildings: realistic cover, garrison, fortification, and destruction

Buildings from the map are tactical objects, not decoration.

### 31.1 Cover geometry

For each building footprint generate:

```text
walls[]
corners[]
doors[]
windows / firing points[]
roof_edge[]
interior_garrison_slots[]
exterior_cover_slots[]
```

Units evaluate real geometry.

A soldier seeking cover should prefer a position where:

```text
building/wall lies between soldier and known threat
AND firing arc toward threat is useful
AND route to slot is reachable
```

This means soldiers visibly hug the correct side of a building instead of merely receiving a generic "urban cover bonus."

### 31.2 Exterior cover

Generate cover nodes approximately:

- near corners,
- along long walls,
- behind detached walls,
- behind HESCO/roadblocks,
- behind wrecks/rubble.

Each node has:

```text
position
normal
height
stance_supported
protected_arc
firing_arc
capacity
```

Squad leaders allocate soldiers to non-overlapping useful slots.

### 31.3 Garrison

Infantry can enter appropriate map buildings.

Simplified browser-friendly garrison model:

- no full indoor navmesh required for every room,
- generate interior slots from footprint edges/windows,
- soldiers move to an entrance,
- transition to interior slot,
- render at real window/roof/door position where possible,
- firing uses actual line of sight.

Garrisoned units gain cover but risk being trapped if the building collapses.

### 31.4 Fortifying buildings

Logistics/engineer teams may:

- sandbag windows,
- barricade doors,
- emplace firing positions,
- create interior strongpoints,
- add HESCO outside,
- place wire/obstacles,
- create protected ammo/medical cache,
- establish observation position.

Fortification costs construction material and time.

### 31.5 Roadblocks

Engineers can construct:

- HESCO roadblock,
- concrete barrier,
- vehicle obstacle,
- wire,
- sandbag checkpoint.

Roadblocks change the road graph and force pathfinding to:

- stop,
- bypass,
- breach,
- destroy,
- reroute.

### 31.6 Building damage state

Do not use expensive real-time structural physics.

Use staged destruction:

```text
INTACT
DAMAGED
BREACHED
HEAVILY_DAMAGED
COLLAPSED
RUBBLE
```

Damage sources:
- tank cannon,
- artillery/mortar,
- bombs,
- explosive engineer breach,
- fire over time.

Small arms should generally damage windows/light cover but not collapse substantial buildings.

### 31.7 Localized breach

Walls are divided into facade segments.

A heavy hit can mark one segment `BREACHED`, producing:

- visible hole/decal/mesh replacement,
- new infantry entry point,
- reduced cover on that arc,
- new line of sight through the wall.

### 31.8 Collapse

When structural damage exceeds threshold:

1. warn occupants if simulation permits,
2. kill/injure occupants according to location,
3. replace building mesh with low-poly rubble mesh,
4. invalidate interior slots,
5. create rubble cover nodes,
6. modify pathfinding,
7. possibly block adjacent road/sidewalk.

This gives tactically meaningful destruction without a voxel physics engine.

### 31.9 Fire and smoke

Destroyed/damaged buildings and vehicles may burn.

Smoke:
- blocks/reduces vision,
- drifts approximately with wind,
- has a lifetime,
- can conceal withdrawal or assault.

Avoid full fluid simulation. Use layered particles/billboards and a simple smoke-opacity field for sensing.

---

## 32. Engineers: mobility, countermobility, survivability

Engineers now support three broad functions.

### Mobility

- breach roadblocks,
- clear mines,
- repair roads,
- repair runways,
- create bypass,
- repair/light bridge,
- mark safe lanes.

### Countermobility

- minefields,
- wire,
- road craters,
- anti-vehicle obstacles,
- deliberate roadblocks,
- bridge demolition if scenario permits.

### Survivability

- HESCO,
- sandbags,
- fighting positions,
- hardened command/logistics positions,
- fortified buildings,
- protected supply caches.

Obstacles should be integrated with fires. The AI should prefer creating obstacles that channel an enemy toward friendly AT/MG firing arcs, not random walls.

---

## 33. Mines, obstacles, bridges, and breaches

Minefields are area objects:

```text
type: AP | AT | MIXED
density
owner
marked_for_owner
detected_by_enemy
breached_lanes[]
```

Friendly forces know their own marked mines.
Enemy forces require detection/recon.

Breaching:

```text
SUPPRESS
OBSCURE
SECURE
REDUCE
ASSAULT
```

Implement this as AI planning logic, not a tutorial label.

Bridge states:

```text
INTACT
DAMAGED
DESTROYED
TEMP_REPAIRED
```

Destroying a bridge modifies route planning.
Engineers may create limited temporary crossing capability when scenario assets allow.

---

## 34. Indirect fires and observers

Mortars/artillery require a valid observer or sufficiently recent sensor contact.

Fire mission lifecycle:

```text
REQUEST
APPROVE
LAY / SETUP
ADJUST
FIRE_FOR_EFFECT
ASSESS
DISPLACE
```

Available mission types:

```text
HE
SMOKE
ILLUMINATION
SUPPRESSION
```

Requirements:

- appropriate ammunition,
- valid range,
- friendly-fire check,
- observer/contact confidence,
- communications path.

Firing creates an approximate detectable origin signature.
Enemy sensors may create a low-confidence artillery contact, encouraging displacement/counterfire.

---

## 35. Reconnaissance, PIRs, and information requirements

The commander actively asks questions.

`Priority Intelligence Requirements (PIR)` examples:

```text
PIR1: Is enemy AT covering POINT_C?
PIR2: Is the north bridge usable?
PIR3: Where is the enemy armored reserve?
PIR4: Is enemy air defense active near AIRBASE?
PIR5: Which route supplies the enemy front?
```

Recon assets are tasked against PIRs rather than merely wandering into fog.

A completed PIR updates the operational belief state and may trigger a decision point.

---

## 36. Communications and electronic warfare

Every command relationship requires a communications path.

Model:

```text
radio_range
relay_range
terrain_masking
building_masking
jamming
radio_damage
network_load
```

Possible links:

- direct radio,
- subcommander relay,
- FOB relay,
- airbase relay,
- drone relay if supported.

Lost communications:

- unit still follows current mission and commander's intent,
- no new detailed orders,
- contact reports queue locally,
- artillery/air support requests may fail,
- subordinate leader exercises initiative.

### EW

Use simplified EW zones:

```text
COMMS_JAM
DRONE_JAM
EMITTER_DETECTION
```

EW never gives magical exact positions. Detection creates an approximate emitter contact with confidence/uncertainty.

---

## 37. Combined-arms effects

Do not model combined arms only as rock-paper-scissors counters.

Add tactical synergy.

Examples:

- armor alone in urban terrain: high close-AT vulnerability,
- armor + infantry screen: reduced close-AT vulnerability,
- infantry attacking prepared defense alone: poor odds,
- MG/mortar suppression + infantry assault: improved movement/survival,
- engineer breach + suppression + armor/infantry assault: strong obstacle penetration,
- scout/drone observation + indirect fire: improved fire effectiveness,
- air attack + SEAD/AA suppression: lower aircraft risk.

The planner should prefer balanced mission packages when available.

---

## 38. Control measures and operational graphics

The commander/subcommanders can create virtual control measures:

```text
PHASE_LINE
BOUNDARY
AXIS_OF_ADVANCE
ASSEMBLY_AREA
BATTLE_POSITION
ENGAGEMENT_AREA
SUPPORT_BY_FIRE_POSITION
ATTACK_BY_FIRE_POSITION
LRP
CCP
MSR
ASR
NO_FIRE_AREA
AIR_CORRIDOR
LZ
```

These are planning objects that constrain AI behavior and may be drawn as military-style overlays in the UI.

They allow the simulation to look like command and staff work instead of a set of RTS attack arrows.

---

## 39. Weather, light, terrain condition, and traffic

Environmental state:

```text
time_of_day
visibility
rain
fog
wind
ground_wetness
```

Effects:

- night/fog reduce visual detection,
- rain/fog may reduce aviation effectiveness,
- wet ground slows off-road vehicles,
- wind moves smoke approximately,
- poor conditions alter route preference.

### Traffic

Road edges have capacity.

Large columns:

- queue at bridges/intersections,
- cannot overlap unrealistically,
- create congestion,
- become attractive targets,
- may force commanders to use alternate routes/stagger movement.

---

## 40. Aviation sustainment and FARP

Aircraft track:

```text
fuel
ordnance
damage
crew
turnaround_timer
```

They do not sortie continuously.

Add `FARP`:

Forward Arming and Refueling Point.

A FARP:
- consumes construction/logistics effort,
- stores aviation fuel/ordnance,
- shortens helicopter turnaround,
- is highly vulnerable and high value,
- should be placed away from obvious enemy observation/fire.

---

## 41. Rear-area security

Rear areas are not automatically safe.

Commander assigns security to:

- airbase,
- MOB,
- FOBs,
- MSR bridges/chokepoints,
- logistics convoys,
- artillery,
- FARP,
- casualty/repair areas.

Enemy SF/recon may raid them.

This creates a real force-allocation dilemma: every squad guarding logistics is a squad not attacking the front.

---

## 42. Building destruction and browser performance policy

Because this runs in a browser, realism must come from **state changes and tactical consequences**, not expensive physics.

Use these rules:

### Required

- destructible building state machine,
- local wall breaches,
- bridge/runway/road damage,
- rubble that changes cover/pathing,
- smoke/fire fields,
- destructible HESCO/roadblocks,
- terrain craters only where tactically important,
- LOD/instancing for soldiers, vehicles, buildings, vegetation.

### Avoid

- per-brick rigid body simulation,
- voxel destruction of every structure,
- full CFD smoke,
- full interior navmesh for every OSM building,
- thousands of independent debris physics objects.

### Rendering/performance

- Three.js `InstancedMesh` for repeated low-poly props/vegetation/fortifications,
- aggressive distance LOD,
- pooled tracer/particle objects,
- pooled decals,
- spatial hash or quadtree for nearby-unit queries,
- broad-phase LOS tests before raycasts,
- cached building cover nodes,
- cached road/path results with invalidation when road/bridge state changes,
- strategic planner in Web Worker,
- optional lower-frequency simulation for distant/non-engaged entities.

Suggested simulation frequencies:

```text
movement/animation:        20 Hz
close combat targeting:    5-10 Hz
sensing/LOS:               2-5 Hz depending distance
logistics inventory:       1-2 Hz
commander planning:        event-driven + 8-18 s review
strategic search:          worker, time-budgeted
distant idle units:        1-2 Hz
```

---

## 43. New mission types

Add to the existing mission list:

```text
BREAK_CONTACT
WITHDRAW
DELAY
SCREEN
GUARD
COVER
ROUTE_SECURITY
FLANK_SECURITY
LOGPAC
CONVOY_ESCORT
SECURE_AIRBASE
REPAIR_RUNWAY
RECOVER_VEHICLE
CASEVAC
MEDEVAC
RECON_PIR
BREACH
CLEAR_MINES
EMPLACE_OBSTACLE
REPAIR_ROUTE
INTERDICT_MSR
SECURE_LRP
ROTATE
RECONSTITUTE
```

---

## 44. Updated commander decision hierarchy

At every major planning cycle:

```text
1. SURVIVE / C2
   commander, subcommanders, airbase, MOB

2. UNDERSTAND
   process reports, PIRs, confidence, route status

3. SUSTAIN
   fuel/ammo posture, casualties, repair, LOGPAC, MSR, culmination

4. PROTECT
   airbase, rear area, logistics, artillery, FARP

5. PRESERVE COMBAT POWER
   withdraw broken forces, recover vehicles, rotate fatigued units

6. CONTROL TERRAIN
   defend/capture A-E, bridges, chokepoints, airbase

7. DEFEAT KNOWN THREATS
   build combined-arms package against actual known enemy

8. SHAPE
   recon, fires, smoke, obstacles, deception, flank, interdiction

9. MANEUVER
   attack, capture, counterattack, delay, withdraw

10. CONSOLIDATE
    garrison, fortify buildings, establish LRP/FOB, clear routes

11. PREPARE NEXT OPERATION
    move supply, rotate units, set decision points, assign PIRs

12. PROCURE
    buy physical requirements with SP and place theater requisitions
```

The "best move" is not always attacking. A strong commander should often decide to resupply, reposition, recover, secure a route, or wait.

---

## 45. Deterministic browser simulation

All high-level AI decisions remain deterministic given:

```text
match_seed
initial map state
player inputs
event order
```

Use separate seeded child RNG streams:

```text
rng_strategy
rng_tactical
rng_combat
rng_damage
rng_weather
```

Do not let render frame timing affect simulation decisions.

For Web Workers:

- send tick/event sequence numbers,
- reject stale planner results,
- planner returns a plan plus the world-state revision it planned against,
- simulation applies only still-valid orders.

---

## 46. Source/design note for the "chess master" AI

The implementation should borrow **search architecture**, not chess rules.

Stockfish is a world-class open-source chess engine, but its legal-move generator and evaluation are fundamentally chess-specific. Reusing the binary would require turning the battlefield into chess positions, which would destroy the logistics, fog-of-war, simultaneous action, terrain, and hierarchy that make this simulator interesting.

Use:
- Stockfish-style time-budgeted iterative search, evaluation, caching, and principal-plan retention as inspiration.
- HTN planning for doctrine/task decomposition.
- MCTS or best-first search over a small set of operational COAs.
- Browser-native TypeScript implementation for runtime.
- Web Workers for planning.

This gives the desired "chess master thinks several moves ahead" behavior while remaining appropriate to military command.

---

## 47. Implementation quality bar


- Prefer readable simulation behavior over decorative complexity.
- Never fake commander knowledge by reading all enemy entities.
- Never let the commander micro individual soldiers.
- Local squad AI should make formations, stance, aiming, cover, loading, and dismounting look intentional.
- Vehicle turret orientation must be independent from chassis orientation.
- Units should not teleport into/out of transports or FOBs.
- Terrain must matter tactically.
- Logistics and supply must matter strategically.
- Commander personalities should produce noticeably different but still competent play.
- Use HAL’s core philosophy: high-level AI decides **what** groups should do; local AI decides **how** they execute it.
- Keep `DEVIATIONS.md` updated whenever source map data, API availability, performance limits, or implementation constraints force a fallback.

When uncertain, choose the behavior that best preserves:
1. fog of war and imperfect information,
2. command hierarchy and mission command,
3. realistic cover/terrain-aware tactics,
4. physical logistics and sustainment,
5. force preservation and combined arms,
6. readable low-poly battlefield behavior,
7. deterministic/replayable commander decisions,
8. browser performance.
