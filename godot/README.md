# Grid Command — Godot native port

This Godot 4.7.2 build presents the browser game's current San Diego command theater on a global OpenStreetMap/OpenFreeMap vector map. San Diego defines the bases and objectives; it does not define the map boundary. Pan anywhere, or use **GRID COMMAND → Map** to jump to a longitude and latitude. The renderer rebases distant locations near the camera, streams roads, water and 3D buildings, and caches visited tiles.

The operation starts with two command elements, neutral objectives A–J, tier-1 MOBs and airfields, 2,000 supply points, and the first supply flight at 00:30. Both commanders assemble forces automatically. Inspect either force with the BLU/RED switch; open **GRID COMMAND → Command center** for Forces, Logistics and Staff. Observer requisitions are available in Logistics.

The fixed 0.05-second simulation supports selection, group orders, combat, readiness and supply updates, requisitions, A–J capture, and all-objective victory. Version 0.2.0 preserves the updater, session restoration, export setup, and shared production assets.

## Controls

- Left-click: select a unit.
- Right-click: issue a move order.
- WASD/arrows or Shift + middle-drag: pan.
- Middle-drag: orbit.
- Mouse wheel: zoom.
- Space: pause or resume.
- 1, 2, 4, 8: set simulation speed; the HUD also offers 16×.
- Step: pause and advance one 0.05-second tick.
- O: overview. F: focus selection. Tab: next unit.
- G: grid. F9: routes. Ctrl + R: new operation.
- Escape: clear selection.

## Download the Windows build

1. Open the repository's **Actions** tab.
2. Select **Build Godot Windows**.
3. Open a successful run.
4. Download `GridCommand-Windows-x86_64` from **Artifacts**.
5. Extract the ZIP and run `GridCommand.exe`.

The workflow uses a free standard GitHub runner. It downloads the official Godot 4.7.2 editor and export templates for each build. No local Godot installation is required to play the result.

## Updates

Use **GRID COMMAND → Graphics & settings → Check for updates**. Normal content releases download only changed scripts, scenes, shaders, textures, and models as a Godot resource pack from the fixed GitHub release origin, verified with SHA-256. The game mounts the pack and reloads the mission in the same process while keeping compatible unit state, objectives, orders, selection, camera position, pause state, and simulation speed. The new shared simulation uses session schema 2; a session from the earlier prototype starts a new operation.

Changes to the executable, engine, extensions, updater, or startup configuration cannot be replaced safely inside a running process. The same screen opens the new Windows build for those releases, and the replacement takes effect on the next launch.

## Local development

From the repository root, run `python3 godot/tools/sync_browser_assets.py --source public/models --destination godot/assets/models`, then open `godot/project.godot` with Godot 4.7.2. Imported files and builds stay outside source control. GitHub Actions runs the same verified copy before every native build.

See [docs/PORT_PARITY.md](docs/PORT_PARITY.md) for browser-source references, implementation status, and explicit gaps.

The game code and assets remain the property of their repository owner. No additional license is granted by this prototype.
