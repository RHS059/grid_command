# Geographic map

The native map uses the same OpenFreeMap vector source and palette as the browser. The map is global. The current theater is a configuration, not a map limit.

## Runtime integration

```gdscript
var geography = preload("res://scripts/geographic_streamer.gd").new()
add_child(geography)
var error = geography.setup({
    "theater_path": "res://data/theater.json",
    "frame_budget_usec": 2000,
    "max_cached_tiles": 112,
    "max_cache_bytes": 192 * 1024 * 1024,
})
geography.set_exclusion_rects(map.installation_rectangles())
geography.update_camera(camera)
```

The component then tracks that camera in `_process`. For explicit focus control, call `update_focus(world_position, tile_zoom)` and `process_streaming()` with automatic processing disabled. Scene coordinates are metres / 100, with +X east and -Z north. Do not mirror this node.

Show `get_attribution()` in the HUD. Hide the old schematic terrain and roads. Do not also draw the old catalog buildings unless `include_buildings` is false. Ground terrain stays at zero height, as in the browser default. DEM terrain and place labels are not implemented in this component.

Set `origin: [longitude, latitude]` in setup to override the theater file. Otherwise update `data/theater.json` to move the theater. Raw vector tiles work at any location without a build or code change. `project_point(longitude, latitude)` converts to the active scene coordinates. Camera limits and unit placement remain the caller's responsibility.

The runtime reads bundled mesh tiles first when their origin matches. Otherwise one cancellable worker downloads and validates OpenFreeMap MVT data, builds vector meshes, and writes raw tiles to `user://geography-v1`. TLS validation stays enabled. Windows uses the system Schannel curl transport and Windows trust store. Other systems use Godot HTTPS with the bundled Mozilla CA set. An explicit `tls_ca_bundle` uses Godot HTTPS with that bundle on any system. All transports enforce HTTPS redirects, host checks, size limits, cancellation, and a 30-second timeout. Disk cache limits default to 256 tiles and 128 MiB. RAM admission uses actual decoded mesh bytes and removes farthest candidates when estimates grow. Half the mesh cache remains available for the previous zoom. New zooms replace old zooms with complementary 4×4 Bayer masks. Tile nodes enter the scene only after all bounded mesh pieces are ready.

Use `set_origin([longitude, latitude]) -> Error` when the observer jumps to a distant city. It preserves runtime settings and raw tile cache, cancels old work, and reloads meshes around the new origin. Move the camera and other world objects to the same new frame; clear theater exclusions outside the active theater. Restore the theater origin and exclusions on return. Global meshes use tile-local vertex arrays, and longitude/Mercator subtraction uses scalar doubles.

## Build-time warm cache

From the mixed repository root (the directory with `package.json` and `lib/game`):

```sh
pnpm exec tsx godot/tools/geographic/build-catalog.ts --source . --theater godot/data/theater.json --output godot/data/generated/geographic --zooms 9,11,13
pnpm exec tsx --test godot/tools/geographic/format.test.ts
pnpm exec tsx godot/tools/geographic/fetch-fixtures.ts
```

The converter uses existing dependencies: `tsx`, `@mapbox/vector-tile`, `pbf`, `earcut`, and `@babylonjs/core`. It calls the actual browser geometry builder. Default bounds come from the theater's objectives, MOBs and airfields plus a 10 km margin. Use `--bounds west,south,east,north` and `--origin longitude,latitude` to override them. `--concurrency 4` is the default. Network errors retry four times; an incomplete catalog is not published. Keep generated output ignored.

Include `data/**/*.json,data/**/*.bin,data/**/*.pem,data/certificates/*.txt` in Godot's export include filter. The CA bundle source, checksum, and MPL-2.0 license are under `data/certificates`. Run conversion before the Godot import/export step. No raw map tile API key or engine install is required by players. In a Windows environment whose Node runtime needs system certificate roots, use `node --use-system-ca --import tsx` in place of `pnpm exec tsx`.

## Checks

```sh
godot --headless --path godot --script tests/geographic_smoke.gd
godot --headless --path godot --script tests/geographic_global_smoke.gd
godot --headless --path godot --script tests/geographic_budget_smoke.gd
godot --headless --path godot --script tests/geographic_global_smoke.gd -- --network
```

The first check needs the warm cache. The second checks malformed PBF, cancellation, exact polygon-hole area, distant-city precision, global coordinates, and any fetched Paris/Tokyo fixtures against Mapbox feature counts. The budget check supplies nine underestimated dense tiles and verifies nearest-first admission with actual mesh bytes. The network check uses a unique empty cache at a Paris origin and prints `GRID_COMMAND_GLOBAL_GEOGRAPHIC_LIVE_OK` only after one live tile loads with zero failures.
