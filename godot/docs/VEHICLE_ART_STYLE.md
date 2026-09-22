# Vehicle art style

Status: production target. This document defines acceptance criteria. It does not state that all current assets pass them.

## 1. Scope and visual target

Make each vehicle look like a carefully authored real-time asset from 2003–2006. Use the vehicle language of Metal Gear Solid 3 and SOCOM 3. Treat the current textured HEMTT as the closest project reference. Preserve its clear silhouette, painted panel depth, tire detail, and restrained wear. Correct defects instead of copying them.

Use Tekken 4–6 and Soulcalibur II–III as references for the later character phase. Do not use their character proportions or material effects to define vehicles. The attached character document supplies the shared principle: use simple geometry and strong texture work to give a smooth, detailed result. The named games are visual references, not claims about their exact engine settings.

Complete vehicles before work starts on soldiers. Apply this guide to wheeled vehicles, tracked vehicles, support bodies, aircraft, ships, deployable vehicle modules, and their stowage.

The result must read at two distances:

- At normal RTS distance, show the vehicle class, main equipment, orientation, and faction.
- At close range, show modest texture resolution, simple contours, painted recesses, and deliberate material separation.

Do not make polygon facets the main style feature. Do not use modern photoreal materials, uniform noise, heavy outlines, or miniature-like glossy edges.

## 2. Order of importance

Use this order when detail conflicts with readability:

1. Correct silhouette and complete major forms.
2. Clear body, cab, weapon, wheel, and equipment separation.
3. Clear faction palette.
4. Painted panel depth and material identity.
5. Local wear and dirt.
6. Small labels, bolts, and scratches.

Remove detail that hides a higher-priority feature. Do not use extra texture contrast to conceal incomplete geometry.

## 3. Geometry and normals

Use geometry for the outer contour, major thickness, moving parts, and deep openings. Use texture detail for seams, shallow recesses, small bolts, grille slats, and minor wear.

- Keep cabs, hulls, tanks, wings, and cargo bodies complete. Do not leave visible gaps between panels that should join.
- Use smooth normals on curved tanks, tires, fenders, rounded cab corners, and aircraft surfaces.
- Use hard normals at actual plate corners and manufactured breaks. Do not smooth a sharp armor corner into a swollen shape.
- Spend triangles on recognizable contours. Keep large flat panels simple.
- Add enough radial segments to keep wheels and tanks smooth at the closest supported camera distance. Do not increase all mesh density to fix one contour.
- Keep turret, weapon, wheel, rotor, door, ramp, and deployed-module pivots intact.
- Keep reusable stowage separate. Clear all hatches, optics, weapons, exhausts, and moving parts.

Record triangle counts, material counts, and draw calls before conversion. A texture pass must not increase them. Document any later geometry increase with a close view that shows the defect it fixes. Do not impose one triangle budget on both a truck and an aircraft carrier.

## 4. Painted surface construction

The color texture must carry the main surface information. Simple neutral lighting must still show panels, seams, recesses, and material changes.

Build surfaces in this order:

1. Set the material base color.
2. Separate large planes with restrained value changes.
3. Burn the panel recesses, joints, overlaps, and sheltered zones.
4. Dodge selected raised edges and worn corners.
5. Add broad variation to large exposed areas.
6. Add a few placed stains and wear marks.
7. Add small functional marks only where they remain clear.

Use dodge and burn to create a false cavity effect. A dark recess can sit beside a narrow raised edge. Keep the edge lift weaker than a lamp or a team marker. Break the wear along selected contact edges. Do not draw a bright continuous line around every face.

Use warm, muted highlights and slightly cool shadows. Preserve local color in both. Reserve near-black for holes, gaps, deep grille recesses, and the darkest rubber. Reserve near-white for small functional marks and lamps.

Paint local depth, not a fixed sun direction. Do not paint a vehicle's cast shadow, a large mirror highlight, or a strong one-sided spotlight into its texture. Rotate the vehicle under the same light to check this rule.

Prefer 4–8 major tones per material family. Use broad clusters, commonly 8–32 texels at the authored working size. Adjust cluster size for the UV scale. Do not turn this guidance into mandatory posterization or visible pixel art.

## 5. Dirt and wear zones

Large areas have grunge. Small areas stay clean and readable. “Clean” means free of random mottling; it does not remove a useful seam shadow or contact mark.

| Surface | Required treatment | Reject |
| --- | --- | --- |
| Broad hull, cargo, wing, or tank panel | Low-contrast broad mottling; a few placed streaks | Dense speckle over the whole face |
| Small handle, hinge, barrel, antenna, or rim detail | Simple color; clear edge or recess | Scaled-down body noise |
| Upper surface | Slightly lighter; sparse dust and exposure wear | Uniform dark grime |
| Lower hull and running gear | Darker cavities; local road dust | Solid black loss of form |
| Panel seam and overlap | Narrow burn with restrained adjacent lift | Deep black outline around every panel |
| Exhaust zone | A localized dark stain | Soot on unrelated surfaces |
| Glass, lamp, sensor, and marking | Clear shape and controlled value | Body grunge that hides its purpose |
| Canvas | Broad painted folds and soft variation | Visible fine fibers or glittering weave |

Do not apply one global noise multiplier to every material. Do not repeat an obvious stain on each wheel or each adjacent panel.

## 6. Faction palettes

BLUFOR uses muted flat dark earth (FDE). REDFOR uses muted pine green with the general color character of Russian green vehicle paint. Faction names do not require blue or red body paint.

Use these existing HEMTT midtone anchors as the starting palette. These are project art colors, not military paint specifications.

| Material | BLUFOR | REDFOR |
| --- | --- | --- |
| Body paint | `#78725A` | `#5F6C50` |
| Chassis | `#2A2B26` | `#232B26` |
| Secondary painted metal | `#5A5C4E` | `#4F5A4C` |
| Canvas | `#6B6749` | `#5D6345` |

Keep FDE visibly brown or tan beside the pine palette under neutral light. Keep pine green out of bright lime and teal. Do not copy changing camouflage patterns from generated reference images. The initial standard is coherent faction paint. If camouflage is added, author one stable pattern per family and retain it across views, variants, and LODs.

Recolor painted surfaces and painted wheel rims. Keep rubber, bare metal, glass, exhaust, lamps, warning marks, medical marks, and team identifiers in their own material groups. Do not tint the entire rendered image to change faction. Preserve the same value hierarchy on both teams.

## 7. Materials and lighting

Use diffuse color plus restrained specular response. Godot can use roughness and metallic fields to implement this response, but the appearance must remain driven by painted color.

- Painted body: broad, weak specular response; no metallic flakes.
- Rubber: dark neutral color; very weak specular response; readable tread and sidewall.
- Canvas: matte response; painted major folds.
- Bare hardware: a small, controlled specular increase. Do not make it chrome.
- Glass: dark value, simple reflection or interior cue. Keep window borders clear. The HEMTT interior shader is a permitted exception.
- Lamps and indicators: small bright areas. Use emission only when the part must appear lit.
- Water-facing ships and aircraft can use distinct materials where function requires them. Keep the same diffuse-led level of detail.

Do not add micro-normal maps, layered clearcoat, screen-space reflection dependence, or dense roughness variation. Existing normal or ORM files are compatibility data until reviewed. Preserve their channel meanings and references. If they conflict with this style, change their use in a separate, documented material change.

Use simple light and ordinary scene shadows for review. Do not depend on heavy ambient occlusion, bloom, color grading, or contact shadows to make the asset pass. Avoid doubling a painted cavity with a second heavy darkening effect.

## 8. Texture and import contract

Before each conversion, record every live texture path, image size, image mode, UV layout, material slot, channel use, color space, and duplicated import texture. Update all aliases that represent the same image. Compare their hashes after the update.

For new assets, use these working targets:

| Asset | Default texture target |
| --- | --- |
| Shared support-vehicle surface library | 512 × 512 |
| Shared tire library | 512 × 512 |
| Small prop or stowage family | 128–256 square, or shared atlas space |
| Unique land vehicle or aircraft | 512–1024 square |
| Large ship with several distinct regions | 1024 square per justified region |

These are authoring targets, not permission to resize an existing atlas. Preserve current canvas dimensions and UV placement during a repaint. A larger existing canvas can retain broad, soft detail. Document any resolution exception. Do not add a 4K or 8K texture to achieve this style.

The current HEMTT contract uses a 512-square grayscale body atlas with four material tiles. Gray detail is mapped through team color ramps. Its 512-square tire sheet stores grayscale detail and a rim mask in alpha. Do not treat that alpha channel as transparency. Preserve the face coordinates used by the surface shader in UV2.

Preserve padding and mirrored-island consistency. Extrude appropriate edge colors into padding. Check seams on the rendered model, not only on the atlas.

## 9. Filtering, mipmaps, and LOD

- Generate mipmaps for vehicle textures. Use linear filtering with mipmaps. Do not use nearest filtering to force an older appearance.
- Check the first several mip levels for loss of seams and faction color. Keep functional details broad enough to survive reduction.
- Check tiled atlases for cross-tile color bleed. Preserve safe sampling insets and gradients. Do not assume base-level padding proves distant correctness.
- Use restrained anisotropic filtering where oblique surfaces need it. Judge the result in the supported renderer.
- Preserve silhouette, faction color, material grouping, and major equipment across LODs.
- Remove small geometry before major contour detail. Do not let wheels, turrets, or deployed modules jump at a transition.
- Do not switch to a different dirt pattern or camouflage layout at a LOD boundary.
- Inspect a moving camera. A still frame cannot prove the absence of shimmer or LOD popping.

## 10. Acceptance evidence

Render the actual live model through its production factory or import path. Record the asset role, faction, renderer, source revision, and material paths. Identify any uncommitted source changes. Do not use generated concept art as proof of implementation.

Use a consistent neutral ground, neutral light, fixed exposure, and no post-process grading. The existing `tools/render_support_model.gd` provides a useful HEMTT review setup at 1280 × 800. Render both factions with the same camera and light.

Required views:

1. Front three-quarter and rear three-quarter.
2. Side and top.
3. Cab or equivalent primary structure close-up.
4. Wheel, track, or equivalent material close-up.
5. Normal RTS distance and a more distant view.
6. Each deployed state where the asset has one.
7. One in-game view beside the accepted HEMTT.

For aircraft and ships, adjust camera framing to fit the asset. Retain a comparable projected size for the material comparison. Also render at the actual gameplay distance. Do not crop away a geometry defect.

An asset passes only when all items below pass:

- [ ] The runtime role resolves to the reviewed model and textures.
- [ ] The silhouette and major shells are complete.
- [ ] Curved parts appear smooth at the closest supported camera distance.
- [ ] The faction is clear without changing rubber, glass, or markings.
- [ ] Painted depth remains clear under neutral light.
- [ ] Grunge stays on broad areas; small parts remain readable.
- [ ] Surface detail does not overpower body and equipment separation.
- [ ] Both close and RTS views match the HEMTT's level of texture detail.
- [ ] No UV bleed, unexpected tint, mip shimmer, or LOD pop is visible.
- [ ] Texture aliases, masks, and import references remain correct.
- [ ] Moving and deployed parts retain clearance and function.
- [ ] Review images include both factions and the relevant states.

Keep failed items open. A successful import or build does not establish visual acceptance.

