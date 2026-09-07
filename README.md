# Grid Command

## GitHub Pages

In Settings → Pages, select **GitHub Actions** as the publishing source. The
Deploy game to GitHub Pages workflow builds and deploys every push to main;
it can also be started manually from Actions.

Published URL: https://rhs059.github.io/grid_command/

The Pages build exports static files with the /grid_command base path.
Next.js server headers are retained for normal hosting and omitted from the
static export because GitHub Pages controls response headers.

## Local development

```sh
pnpm install --frozen-lockfile
pnpm dev
```

Open http://localhost:3000.

To build the Pages export locally, set GITHUB_PAGES=true and run pnpm build.
The generated site is in out/ and must be served under /grid_command/.

## Performance mode

Open **Graphics & settings** and enable **Performance mode**. It defaults to off.
The mode caps pixel density at 1×, hides 3D city buildings, shading, labels, routes,
grid and minimap, and limits detailed unit models to the visible area within 1 km
of the map's view center. The selected unit remains available to the chase camera.
Terrain stays enabled unless you turn it off separately.

Off-screen units continue all movement, combat, logistics and collision simulation;
their visual interpolation and model animation are skipped. This is view-frustum
culling, not building-occlusion culling. Turning the mode off restores the normal
graphics choices without restarting the battle.

Runtime FPS and visual confirmation for this change are left to manual review.
