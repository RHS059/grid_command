# Grid Command — Godot native prototype

This Godot 4.7.2 project tests a native desktop version of Grid Command with the production vehicle assets and a small playable tactical slice.

## Controls

- Left-click: select a unit.
- Right-click: issue a move order.
- Middle-drag or WASD: pan.
- Right-drag or Q/E: orbit.
- Mouse wheel: zoom.
- Space: pause or resume.
- 1, 2, 4: set simulation speed.
- Escape: clear selection.

## Download the Windows build

1. Open the repository's **Actions** tab.
2. Select **Build Godot Windows**.
3. Open a successful run.
4. Download `GridCommand-Windows-x86_64` from **Artifacts**.
5. Extract the ZIP and run `GridCommand.exe`.

The workflow uses a free standard GitHub runner. It downloads the official Godot 4.7.2 editor and export templates for each build. No local Godot installation is required to play the result.

## Local development

Open `project.godot` with Godot 4.7.2. Imported files and builds stay outside source control.

See [docs/PORT_PLAN.md](docs/PORT_PLAN.md) for the staged port plan.

The game code and assets remain the property of their repository owner. No additional license is granted by this prototype.
