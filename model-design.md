# Grid Command model design guide

## Purpose and authority

Use this guide when creating or revising game models so another developer or AI can continue the same visual style without the original reference images. It records the construction approach introduced in commit 19271c4. That art revision was submitted for the owner's manual review; this document is not a claim that its proportions or poses have been visually approved.

Read grid_command_v2.md for base game functionality. This guide governs visual construction, not weapon performance, unit capacity, movement, combat, or other gameplay rules. Record gameplay changes in grid_command_changelog.md: one bullet for an individual change, or indented bullets under a version bullet for a batch.

## The intended look

Make recognizable military equipment and soldiers with deliberately angular, low polygon geometry. Aim for the readability of detailed PS1 or N64 era models: broad flat faces, strong silhouettes, muted military colors, fitted equipment, and visible joints. Use modern clean rendering without requiring pixelated textures or screen effects.

The soldier should read as a person wearing a uniform and equipment. The weapon should have a recognizable receiver, stock, magazine, grip, and barrel. The vehicle should have shaped armor or bodywork with a clear front, rear, and running gear.

Build detail in three passes:

1. Establish the silhouette and relative proportions.
2. Add structural forms: clothing volume, armor plates, turret, wheel arches, stock, or passenger compartment.
3. Add a small number of readable fittings: pouches, optics, grille slats, handles, hinges, and antennas.

Spend geometry where it changes the outline or helps identify the object. Avoid dense tiny details, smooth inflated surfaces, oversized cartoon heads, featureless box bodies, and bright plastic finishes. When adapting a realistic reference, preserve its major proportions and identifying features, then simplify its surfaces into planes.

## Coordinates and construction

The current procedural models use Three.js, with Z up, positive Y forward, and X across the body. Dimensions are in the game's meter based scale. Weapon barrels point toward positive Y. Start from the existing role's dimensions and origin so replacing its appearance does not change its placement.

For a new grounded model, place the wheel, track, or foot contact plane at local ground height. Preserve the renderer's existing terrain placement conventions; do not compensate for map elevation by burying or lifting the geometry arbitrarily.

Use these construction methods in plain terms:

- **Stacked cross sections:** Draw several clipped rectangular outlines at different heights. Change their width, depth, and forward offset, then connect them with flat triangles. This creates tapered limbs, helmets, backpacks, sloping hoods, hulls, and turrets. The shared shell helper clips the corners by a default proportion of 0.2.
- **Extruded silhouettes:** Draw an object's side outline in the forward/up plane and give it thickness across X. Use this for rifle stocks, grips, magazines, and track outlines. Preserve concave notches and actual gaps.
- **Rods:** Connect two points with a polygonal cylinder. Use six sides for small rails and rods, eight for prominent barrels, and roughly twelve for armored wheels. Existing support wheels use sixteen.
- **Small boxes:** Use these for genuinely rectangular fittings such as pouches, grille slats, optics, and seat cushions.

Keep broad faces flat. Existing shell and profile helpers introduce restrained face color variation, approximately six and four percent above or below the base color respectively. Do not replace this with random high contrast triangles.

## Palette and surfaces

Use these current colors as starting points. New equipment can vary within the same muted palette.

| Use | Color |
| --- | --- |
| Infantry uniform and helmet | #68694c |
| Lighter cloth accents | #7b7b59 |
| Dark cloth, packs, and pouches | #505640 |
| Infantry armor | #30332d |
| Weapons, gloves, and boots | #222524 |
| Weapon steel | #454945 |
| Current exposed skin | #b6a084 |
| Armored vehicle base | #b29a70 |
| Armor highlights | #c4ad82 |
| Armor recesses | #897956 |
| Tracks and armored tires | #282c29 |
| Armored metal fittings | #54574d |
| Armored vision blocks | #384b49 |
| Utility vehicle body | #73765a |
| Utility dark surfaces | #262c29 |
| Utility metal | #565f51 |
| Utility glass | #293e4c |

Use small team colored patches or panels from SIDE_COLOR. Preserve the equipment's military color across both teams.

The model viewer uses vertex colors, flat shading, roughness 0.85, and metalness 0.08. Utility bodywork uses roughness 0.9; its metal fittings use low metalness around 0.15. Small glass surfaces can be smoother. These are material starting points, not a claim that every rendering path currently uses identical settings.

The style should work through geometry and color without texture maps. Do not depend on text, tiny decals, photographic camouflage, or reflective chrome to identify a model.

## Soldiers

Build the body as separate pelvis, torso, head, upper legs, lower legs, boots, upper arms, and forearms. Taper the waist, wrists, and ankles; widen the chest and shoulders. Give limbs a few changes of cross section so they resemble clothed limbs.

Current construction anchors, in local units:

| Feature | Approximate size |
| --- | --- |
| Torso | 0.44 high; width grows from 0.35 at waist to 0.47 near shoulders |
| Pelvis | 0.34 to 0.36 wide |
| Upper leg | 0.40 long |
| Lower leg | 0.37 long |
| Upper arm | 0.28 long |
| Forearm sleeve | 0.245 long, with glove extending farther |
| Helmet | Up to 0.36 wide and 0.37 deep |
| Boot | About 0.17 wide and 0.30 long |

Fit front and rear armor plates to the torso. Clip the upper corners of the front plate and leave a visible neck opening. Add shoulder straps, three front magazine pouches, a shaped backpack, belt, and a small side pouch. Keep equipment close to the body.

Shape the helmet with several narrowing sections toward the crown. Add simple goggles, side ear protection, and restrained straps or face covering. Keep the face minimal. Shape the boots with a projecting toe and a thin sole. Give the knees readable pads.

Distinguish roles through their equipment: radio and antenna, medic pack, engineer tools, supply pack, machine gun, or launcher. Reuse the common body and rig.

Preserve the existing joint origins. Limb geometry extends downward from its joint; a centered limb will shift when animated. Keep knees and elbows separate. Torso aim must remain independent of movement heading. Preserve the existing pose paths for idle, walking, crouching, prone, recoil, peeking, throwing, dragging, and falling. New art must fit these paths; their presence is not proof that every pose is already anatomically correct.

## Weapons

Construct the rifle around an M4-like silhouette approximately one meter long in the current model: a narrow receiver, angular adjustable stock, separate pistol grip, curved magazine, compact handguard, exposed barrel, muzzle device, front sight, top rail, and small optic.

Use extruded side outlines for the stock, receiver, grip, and magazine. Leave a visible opening around the trigger guard. Use a few raised rail segments and handguard slots rather than dense surface engraving.

The machine gun should be visibly longer and heavier, around 1.25 meters in the current model. Give it a larger receiver, longer barrel, distinct stock, side ammunition box, short visible belt, bipod, and carrying handle. Keep these identifying features readable.

Keep every weapon in the existing weapon node's coordinate frame. Preserve the grip relationship, forward direction, and recoil movement. New weapon appearance does not authorize changes to damage, range, rate of fire, ammunition, or projectile behavior.

## Armored vehicles

Build a narrow lower hull, wider middle section, and narrower upper deck shifted rearward. Connecting these sections creates the long sloped front armor and clipped corners. The present shared hull is roughly 6.25 meters long and 2.95 meters wide at its widest section.

Create the turret as a separate shaped assembly with a wider middle and narrower roof. Add a mantlet, stepped barrel thickness, hatch, vision blocks, storage, antennas, and a few smoke launchers. Preserve the renderer's turret rotation convention so the hull can move independently of aim.

Differentiate the roles:

- APC: eight wheels, rear access ramp, and compact machine gun station.
- Cannon APC: wheeled hull with a larger cannon turret.
- IFV: tracks, autocannon, and paired missile fittings.
- Tank: tracks, wider turret, and a visibly longer, heavier main gun.

For tracks, extrude an angular continuous side outline, add a small row of road wheels, then sparse tread bars and side skirts. Do not create hundreds of independent track links. The current model uses six visible road wheels per side.

Add restrained engine grilles, headlights, towing fittings, rear panels, and side team markings. Use detail placement to explain the vehicle's construction.

## Open troop carrier

Use four substantial wheels, an angular sloped hood, open sides, a low passenger floor, a narrow windshield, and a clearly visible roll cage. The chassis is about 2.15 meters wide and 4.6 meters long before projecting fittings.

Build the cage from thin polygonal rails with diagonal braces. Keep the cabin open between them. Add shaped fenders, grille slats, bumper, steering wheel, dashboard, low rear panel, and separate seat cushions and backs.

The current art has eight seats arranged in two columns and four rows. The role remains a six passenger carrier in the existing gameplay description. Visible seats must not silently change simulation capacity.

## Extending the style and keeping it fast

For a new aircraft, support vehicle, emplacement, or building, carry over the same palette, flat faces, clipped corners, and silhouette first approach. Preserve the subject's identifying structures rather than stretching a generic vehicle into every role. Existing aircraft and base models were not comprehensively redesigned in this art revision.

Bake stationary fittings into the parent geometry. Soldiers use shared instanced geometry for each part, not a full set of individual draw calls per soldier. Armored vehicles merge details into hull and turret geometry. The open carrier merges stationary meshes by material. Retain separate objects only where independent motion or visibility requires them, such as turrets, rotors, forks, or cargo.

Generate geometry once and reuse it. Keep geometry attributes compatible before merging, bake transforms, and dispose of temporary geometry. Do not add per-frame geometry construction. No measured triangle budget is established by this guide; preserve batching and keep new detail proportional to what is visible.

## Files and handoff

| File | Responsibility |
| --- | --- |
| lib/game/model-geometry.ts | Shared shells, extruded profiles, rods, and vertex color helpers |
| lib/game/unit-models.ts | Soldier parts, weapons, rig, poses, and vehicle geometry dispatch |
| lib/game/armored-models.ts | Armored hulls and turret assemblies |
| lib/game/support-models.ts | Utility vehicles, support equipment, and their animated groups |
| lib/game/aircraft-models.ts | Existing aircraft geometry |
| lib/game/base-models.ts | Existing base geometry |
| lib/game/model-catalog.ts | Model descriptions |
| components/game/model-viewport.tsx | Model viewer presentation |

When handing off a new model, describe its silhouette, palette, relative dimensions, separate moving parts, and the files changed. Update this guide if the owner changes the art direction.

The owner currently prefers changes committed to GitHub for manual visual confirmation. Do not delay delivery for an unsolicited rendering or testing cycle. Manual review should consider front, side, rear, and three-quarter silhouettes; ground contact; equipment intersections; relevant animated poses; and readability at game distance. State honestly what has and has not been checked.


## Aircraft and logistics reference update (v2.0.2)

The reference-driven aircraft now live in lib/game/reference-aircraft.ts and are selected through createAircraft. The cargo plane and reconnaissance UAV retain their existing constructors. Keep this mapping when continuing the art:

| Role | Reference and construction recipe |
| --- | --- |
| CAS_FIGHTER | First two images: a Super Tucano-like propeller attack aircraft. Build a slim olive fuselage tapering into a single tail, a raised two-seat canopy with transverse frames, low straight tapered wings, five nose propeller blades, wing guns, side exhausts, tricycle gear and external fuel tanks. Simplify the photographic surfaces into flat polygons. Fuel tanks are not missiles. |
| JET | Third image: gray twin-engine strike fighter. Use a long pointed nose, narrow tandem canopy, broad swept wings, paired rectangular intakes, two exhausts, twin vertical fins and separate rear stabilizers. Keep the surfaces visibly faceted. |
| TRANSPORT_HELI | Fourth image: conventional military transport helicopter. Use a broad angular cabin, segmented sloping windshield, sliding door outlines, dark side windows, two upper engine housings, four main rotor blades, long tapering tail boom, tail rotor and external side tanks. |
| TRUCK | Fifth image: eight-wheel cab-over container carrier. Put the short sloping cab ahead of four axles, use two large windshield panels, side mirrors and steps, and place a tall ribbed rectangular container behind the cab. Include fuel tanks, spare tire and restrained lights. Preserve independently visible cargo trailers. |
| HEAVY_LIFT_HELI | Sixth image: futuristic wingtip-rotor cargo aircraft. Build a pale angular cabin with a dark sloping nose, high transverse wing, a large nacelle and three-blade rotor at each wingtip, a low cargo bay and twin rear fins. These replace the earlier tandem fore-and-aft rotors. Retain the named sling-cargo group for existing logistics behavior. |
| ATTACK_HELI | Reuse the heavy-lift airframe and add a dark compact turret beneath the cockpit, with forward barrels and a small sensor face. Keep the chin-turret pivot separate so it can aim independently of heading. |

All new aircraft use longitudinal clipped cross sections, extruded wings and fins, polygonal rods, muted materials and merged stationary geometry. Preserve main-rotor, rear-rotor, tail-rotor, propeller and chin-turret group names where applicable. Wingtip rotors are currently modeled in vertical-lift orientation; no new tilt-transition flight simulation is introduced.

CAS is a separate gameplay role from JET. Its guns have no anti-tank missiles, target ground unit roles only, and apply a 0.1 damage multiplier specifically against TANK after normal range falloff. Other bullets retain the existing armor immunity rules. Art changes for the other aircraft and truck do not change their gameplay capacities or weapons. These models are submitted for manual confirmation, without an automated test or visual render pass.

## VTOL animation and visible carrier occupants (v2.0.3)

The earlier fixed wingtip-rotor orientation is superseded. Place each nacelle and rotor under its own named left-tilt or right-tilt group, pivoted at the wingtip. Keep rotor spin on the child main-rotor/rear-rotor groups. Project actual world displacement onto the aircraft's forward heading to obtain signed speed. Zero forward speed gives upright rotors; forward speed tilts toward positive local Y using negative X rotation; reverse speed tilts backward. Limit tilt to 81 degrees. Do not infer travel from engine state alone, because hovering engines also run.

Keep chin-turret separate. Its local Z rotation is aircraft heading minus world aim, matching the tank aiming convention. Update aim while acquiring a target, including between shots. The model viewer demonstrates turret traverse and forward/reverse nacelle motion when animation is enabled.

lib/game/carrier-occupants.ts reuses the soldier part geometry to bake two seated variants. The driver occupies the front left seat; six passenger positions occupy the three rear rows, leaving the front right seat unused. Bend thighs forward and shins down, and position the driver's hands on the steering wheel. Merge each seated figure, share passenger geometry and materials, and retain named occupant meshes for visibility updates. Show only actually boarded active soldiers, excluding troops already disembarked and squads merely reserved for pickup.

Below 30% health, a surviving driver exits onto valid nearby ground as one dismounted PILOT-role crew member. Evacuate passengers and release reservations. Mark the vehicle crewBailed, keep it immobile and abandoned, and leave it targetable without recreating crew through health-derived member counts. The six-passenger capacity is unchanged.
