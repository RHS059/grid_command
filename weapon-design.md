# Grid Command weapon design

This is the visual and attachment contract for handheld weapons. It is based on
the supplied Blender references in `assets/blender/Blends`, especially the five
`AssaultRifle` models, four `AssaultRifle2` models, three `Bullpup` models, and
their accessory library. The game weapons should share their visual language
without reproducing any one source model.

## Reference measurements

The twelve primary long-gun references contain 640–1,490 vertices and 561–1,160
faces, averaging 933 vertices. Their source dimensions use X as the long axis.
Average length-to-width ratio is 17.9:1 and average height is 37% of length;
the height comes from the stock, pistol grip, and magazine rather than a thick
receiver. Most variants use three to six material regions.

The `AssaultRifle` family uses `Black`, `DarkMetal`, `Metal`, `DarkWood`, and
`Wood`. The `AssaultRifle2` family uses `Main`, `MainDark`, `MainLight`,
`DarkMetal`, `Metal`, and occasional `DarkWood`. The `Bullpup` family is mostly
`Main`, `MainDark`, and `MainLight`, with black reserved for small components.
This makes the shapes readable through restrained value changes rather than
bright colors or realistic textures.

## Required visual language

- Build a clear side silhouette from several stepped volumes: stock, upper and
  lower receiver, handguard, barrel, muzzle device, grip, magazine, sights, and
  role-specific equipment must remain identifiable at game distance.
- Use broad planar faces with intentional diagonal cuts. Thin edge strips and
  shallow raised panels catch light around the receiver, stock, and handguard.
  Keep the low-poly facets visible; do not smooth the weapon into a toy-like
  capsule.
- Use repeated mechanical rhythm where it explains function: 10–16 top-rail
  teeth, 6–10 handguard ribs or ports, two or three muzzle steps, and distinct
  front/rear sight shapes. Repetition should follow the weapon's long axis.
- Stocks must have structure. Use an open triangular or framed adjustable stock,
  or a solid stock with an angled heel and a visible top/bottom break. The stock
  must never be a plain rectangular extension of the receiver.
- Pistol grips sweep rearward and taper toward the base. Include a visible
  trigger guard and negative space around the trigger area.
- Rifle magazines curve or use at least three tapered sections. Box magazines
  on other weapons must still taper and show a floor plate; no rectangular slab.
- Barrels use six- or eight-sided cylinders with a separate gas block/front
  sight and a multi-stage muzzle device. The barrel is visually thinner than the
  handguard and receiver.
- Materials use near-black metal, charcoal polymer, muted military green, and a
  small desaturated accent. Adjacent regions need enough value difference to
  expose the construction. Bright cyan is limited to a tiny lens face, never an
  entire optic block.
- The rifle should read as a compact modular service carbine. The MG extends the
  same language with a heavier receiver, vented handguard, belt box, carry
  handle, and functional bipod. AT and AA launchers use the same stepped panels,
  rails, controls, grips, and material hierarchy on a tubular silhouette.

## Geometry targets

| Asset | Target vertices | Required silhouette features |
| --- | ---: | --- |
| Rifle | 750–1,150 | Framed stock, stepped receiver, rail, ribbed handguard, curved magazine, trigger guard, sights, staged muzzle |
| MG | 900–1,400 | Framed stock, heavy receiver, feed cover, vented handguard, belt box, carry handle, bipod, staged barrel |
| AT launcher | 550–900 | Tapered tube, end collars, shoulder pad, grip and trigger guard, sight housing, rail, control box |
| AA launcher | 650–1,000 | Tapered launch tube, seeker head, rear battery/control assembly, folding sight, grip, shoulder rest |

## Rig and orientation contract

- The supplied references use +X toward the muzzle. The soldier armature uses
  local **+Y toward the muzzle**, local **+Z upward**, and local X for width.
  Candidate geometry is designed in the reference convention, then rotated 90°
  around Z and applied before export.
- The `weapon` bone is a receiver datum, not a grip pivot. In `idle_ready`, its
  measured firing hand is approximately `(0.03, -0.21, -0.12)` and its support
  hand is approximately `(-0.01, 0.14, -0.11)` in bone-local coordinates.
  Place the pistol grip around Y `-0.20`, and put a usable handguard surface
  around Y `0.10–0.25`. Offset the modeled vertical datum about Z `-0.10` so
  the barrel/receiver centerline follows the authored hands instead of the face.
- `Weapon_RIFLE`, `Weapon_MG`, `Weapon_AT`, and `Weapon_AA_TEAM` must have applied
  rotation and scale, origin `(0, 0, 0)`, and no corrective runtime rotation.
  They attach directly beneath the soldier armature's `weapon` bone.
- The firing hand must overlap the pistol grip; the support hand must meet the
  forward handguard or tube. Stocked weapons meet the shoulder without crossing
  the torso, and the barrel points away from the soldier.

## Do not do this — current game weapons

The first external set is the negative reference. Its rifle has only 184
vertices and 192 faces; the MG has 176 vertices and 176 faces; the AT and AA
launchers have only 96 and 120 vertices. These budgets are roughly one fifth to
one tenth of the supplied examples and remove the features that establish their
style.

- Do not copy the supplied +X-forward object transform directly into the game.
  The armature's authored poses require +Y-forward geometry with rotation
  applied before export.
- Do not center the geometry around the origin or place the pistol grip near
  Y `-0.08` as the first set did. The armature datum requires the firing grip
  near Y `-0.20`; otherwise both hands miss their intended contact points.
- Do not represent a rifle or MG as a chain of beveled boxes. The current rifle
  lacks a real stock, trigger guard, rail teeth, handguard rhythm, front sight,
  curved magazine, and readable muzzle assembly.
- Do not use a long rectangular block as both stock and receiver. It produces the
  dark featureless plank visible in the current soldier screenshot.
- Do not use straight sticks for bipods, slab magazines, or an unbroken cuboid
  MG receiver. These parts need taper, joints, and distinct functional volumes.
- Do not make launchers from one plain octagonal tube plus oversized collars.
  The current AT and AA silhouettes lack shoulder hardware, sight mechanics,
  controls, rails, and changes in tube diameter.
- Do not use a bright cyan rectangular optic as the primary accent. It draws more
  attention than the weapon silhouette and does not appear in the references.
- Do not rely on the procedural fallback weapons in `soldierParts` as a visual
  target. Their boxes and cylinders exist only as a distant/loading fallback.

## Review rubric

Sol compares standardized three-quarter renders of the supplied reference set
and the candidate weapons. A candidate passes at 80% or higher aesthetic
similarity based on: silhouette and proportions (30%), hard-surface shape
language (25%), functional detail density (20%), material/value grouping (15%),
and coherent low-poly finish (10%). Orientation is a separate pass/fail check
using soldier renders in `idle_ready`, `idle_passive`, `idle_passive_mg`, and
`idle_passive_at`.
