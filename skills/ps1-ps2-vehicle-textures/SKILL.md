---
name: ps1-ps2-vehicle-textures
description: Repaint existing low-poly vehicle UV atlases with readable late-PS1 or early-PS2 surface detail and reusable stowage greebles while preserving UV, material, and engine-import contracts. Use for chunky military or industrial vehicles; do not use for geometry remodeling or modern photoreal PBR authoring.
---

# PS1-PS2 Vehicle Textures

Preserve the production contract first: texture filenames, dimensions, color mode, UV-island placement and padding, material slots, channel meanings, and duplicated import companions must remain compatible with the model.

## Surface language

- Make detail readable at gameplay distance with broad 8-32 texel clusters, restrained palette steps, crisp material separation, and limited intentional asymmetry.
- Use low-frequency hand-painted mottling, dark panel seams, localized edge wear, dusty recesses, and a few deliberate stains. Avoid uniform photographic noise.
- Zone wear by exposure: keep barrels and upward armor planes cleaner and slightly brighter; darken under-turret areas, crevices, lower hull faces, running gear, and exhaust-adjacent panels.
- Separate armor, rubber, tracks, grilles, glass, lamps, and bare metal through value and hue before adding wear.
- Keep albedo free of strong directional light, cast shadows, glossy highlights, and modern high-frequency microdetail. Ambient cavity darkening and subtle edge lift are acceptable.
- Prefer 4-8 major tones. Reserve near-black for gaps, tracks, rubber, and apertures; preserve existing lamp, sensor, and team colors.
- Do not paint across UV padding or boundaries. Treat mirrored and stacked islands consistently.

## Reusable stowage greebles

Use separate reusable objects for packs, duffels, rolled tarps, crates, ammunition boxes, jerry cans, and utility boxes. Do not merge them into the vehicle mesh or atlas, and do not add personnel. Keep the library low-poly, silhouette-readable, independently tintable, and suitable for attachment to other vehicles.

Place greebles where crews plausibly secure them, clear of weapons, hatches, optics, exhausts, and moving joints. Attach turret stowage to turret motion and hull stowage to the hull. Add restrained procedural jostle from vehicle movement and turret yaw; vary phase and amplitude per object without rigid-body simulation. Motion must settle when the vehicle stops.

## Workflow

1. Inventory the live model and every texture it resolves. Record canvas size, mode, aliases, material slots, color space, and ORM/normal conventions.
2. Inspect an in-engine view to map atlas regions to hull, turret, barrel, running gear, glass, and hardware.
3. Repaint the existing albedo. With image generation, provide the atlas as the edit target and the desired render as style-only. Lock canvas, UV positions, boundaries, padding, and semantic groups.
4. Normalize with `scripts/normalize_atlas.py`. It matches the contract dimensions and mode, strips metadata, and can optionally limit the palette.
5. Copy the normalized result to every filename used by engine imports or embedded-material extraction. Leave data maps unchanged unless requested.
6. Add stowage as separate engine-native nodes or reusable scenes. Keep attachment and cheap animation outside model import files.
7. Validate PNG decoding, dimensions, mode, alias hashes, model/material references, and attachment clearance. Inspect the textured model when practical; the atlas alone cannot prove UV alignment.

## Image-generation prompt frame

State that the source atlas is the exact edit target and the vehicle render is style-only. Request broad hand-painted variation, chunky mottling, dark seams, dusty cavities, localized wear, clean bright upper planes, and darker crevices/lower zones. Require the exact canvas and UV layout. Prohibit rendered perspective, new islands, text, cross-island marks, fine photo grain, and baked world lighting.

