#!/usr/bin/env python3
"""Copy shared browser vehicle assets into the Godot project before import."""

from __future__ import annotations

import argparse
import hashlib
import shutil
from pathlib import Path


ASSETS = (
    "amphibious_apc.glb",
    "amphibious_apc_lod1.glb",
    "amphibious_apc_albedo.png",
    "amphibious_apc_orm.png",
    "mec_lift.glb",
    "soldier.glb",
    "troop_transport.glb",
    "vtol_attack.glb",
    "vtol_cargo.glb",
)

# These native assets contain the approved PS2 repaint. The browser copies
# still contain the older flat atlas and must not overwrite them during CI.
NATIVE_AUTHORED_ASSETS = frozenset({
    "tank.glb", "tank_albedo.png", "tank_tank_albedo.png", "tank_albedo_ps2.png",
})


def digest(path: Path) -> str:
    result = hashlib.sha256()
    with path.open("rb") as stream:
        for chunk in iter(lambda: stream.read(1024 * 1024), b""):
            result.update(chunk)
    return result.hexdigest()


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--source", type=Path, required=True)
    parser.add_argument("--destination", type=Path, required=True)
    args = parser.parse_args()
    args.destination.mkdir(parents=True, exist_ok=True)
    for name in sorted(set(ASSETS) | {p.name for p in args.source.iterdir() if p.is_file() and p.suffix.lower() in {".glb", ".gltf", ".bin", ".png", ".jpg", ".jpeg", ".webp", ".json"}}):
        source = args.source / name
        destination = args.destination / name
        if name in NATIVE_AUTHORED_ASSETS:
            if not destination.is_file():
                raise SystemExit(f"Missing native-authored vehicle asset: {destination}")
            print(f"NATIVE_ASSET_PRESERVED {name} {digest(destination)}")
            continue
        if not source.is_file():
            raise SystemExit(f"Missing shared vehicle asset: {source}")
        if not destination.is_file() or digest(source) != digest(destination):
            shutil.copy2(source, destination)
        if digest(source) != digest(destination):
            raise SystemExit(f"Vehicle asset copy failed verification: {name}")
        print(f"SHARED_ASSET_OK {name} {digest(destination)}")


if __name__ == "__main__":
    main()
