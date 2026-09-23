# Windows builds

[Download the latest stable Windows ZIP](https://github.com/RHS059/grid_command/releases/latest/download/GridCommand-Windows-x86_64.zip).

Each successful **Build Godot Windows** run also publishes a permanent ZIP named
`gridcomand-windows-x86_64_<action-build-id>.zip` in
[GitHub Releases](https://github.com/RHS059/grid_command/releases).
Open the release named **Grid Command Windows build <action-build-id>** to get
that exact build. The build's Actions summary includes the direct download link.

Extract the ZIP and run `windows/GridCommand.exe`. Keep the other extracted
files beside the executable.

Build ZIPs are hosted as release assets because complete game builds can exceed
GitHub's 100 MiB limit for a file in Git. This folder contains the download
instructions instead of an outdated embedded ZIP. The in-game updater uses the
separate stable Godot release channel; per-run build releases do not replace it.


