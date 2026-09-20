# Release packages

Compatible live updates export **changed resources only** with Godot's
`--export-patch "Delta Patch"`. The preset uses the previous release's exact
`GridCommand.pck` as its base and inherits the full build's import/export filters.
`--export-pack` does not apply that patch comparison and must not be used here.

After export, `tools/release_packages.py` partitions the actual PCK contents into
three independent payloads with stable filenames:

| File | Contents |
| --- | --- |
| `update-models.pck` | Model geometry, imported model scenes, model resource metadata |
| `update-textures.pck` | Texture images and their imported texture resources and metadata, including images stored under `assets/models` |
| `update-gameplay.pck` | Scripts, gameplay scenes, shaders, audio, fonts, runtime data, and shared engine metadata |

The exported archives are split after Godot resolves dependencies, so a model's
external textures do not get duplicated into the model or gameplay package.
Embedded content remains part of its containing resource. Exported scene remaps
are resolved using the full build so changed binary scenes retain their source
category even when the unchanged `.remap` file is absent from the patch.
All resource paths and bytes are preserved. Live category packs omit
`project.binary` and `project.godot`; startup configuration changes require the
full-build path instead. Empty categories are valid small PCKs, preserving the
three-file contract for every update.

Each live manifest edge contains a `packages` array with category, URL, SHA-256,
size in bytes, and exported `res://` file paths. Every package also has a `.sha256`
sidecar. The combined `update.pck` and its existing manifest fields remain
available for older clients. A compatible new client downloads the three
category payloads, preserving verified categories across retries.

Releases that change the updater, startup configuration, or native files keep
the `GridCommand-Windows-x86_64.zip` bootstrap path. Its manifest includes both
`download_sha256` and `download_size_bytes`. Such releases also publish full
category archives under `bootstrap_packages` for inspection and future tooling;
these archives do not replace the executable/bootstrap installation. The full
ZIP retains its original `GridCommand.pck` layout.

Run packaging tests with:

```sh
GODOT=/path/to/godot python3 -m unittest discover -s tools -p 'test_release*.py' -v
```

The integration test exports a baseline, changes a model, texture and script,
exports a real patch, verifies that unchanged data is absent, then mounts the
three packages in Godot and compares every resource's bytes to the export.
Without `GODOT`, the pure Python planner/archive/manifest tests still run.
