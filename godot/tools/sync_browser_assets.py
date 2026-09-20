#!/usr/bin/env python3
"""Copy shared browser vehicle assets into the Godot project before import."""

from __future__ import annotations

import argparse
import hashlib
import shutil
import json
import struct
import zlib
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


def validate_native_tank(directory: Path) -> None:
    """Reject damaged binary uploads before Godot can silently skip imports."""
    atlas = (directory / "tank_albedo_ps2.png").read_bytes()
    for name in ("tank_albedo.png", "tank_tank_albedo.png", "tank_albedo_ps2.png"):
        data = (directory / name).read_bytes()
        if data != atlas or data[:8] != b"\x89PNG\r\n\x1a\n":
            raise SystemExit(f"Invalid or mismatched native tank atlas: {name}")
        offset, payload, complete = 8, bytearray(), False
        while offset + 12 <= len(data):
            length = struct.unpack_from(">I", data, offset)[0]
            end = offset + 12 + length
            if end > len(data):
                raise SystemExit(f"Truncated PNG chunk: {name}")
            kind = data[offset + 4:offset + 8]
            chunk = data[offset + 8:offset + 8 + length]
            checksum = struct.unpack_from(">I", data, end - 4)[0]
            if zlib.crc32(kind + chunk) & 0xffffffff != checksum:
                raise SystemExit(f"PNG checksum failure: {name} {kind!r}")
            if kind == b"IDAT":
                payload.extend(chunk)
            offset = end
            if kind == b"IEND":
                complete = offset == len(data)
                break
        if not complete or not zlib.decompress(payload):
            raise SystemExit(f"Incomplete PNG: {name}")
    glb = (directory / "tank.glb").read_bytes()
    if len(glb) < 28 or glb[:4] != b"glTF" or struct.unpack_from("<I", glb, 8)[0] != len(glb):
        raise SystemExit("Native tank GLB length/header is corrupt")
    json_length = struct.unpack_from("<I", glb, 12)[0]
    document = json.loads(glb[20:20 + json_length])
    binary_offset = 28 + json_length
    binary_length = struct.unpack_from("<I", glb, 20 + json_length)[0]
    if binary_offset + binary_length != len(glb):
        raise SystemExit("Native tank GLB binary chunk is incomplete")
    texture = document["materials"][0]["pbrMetallicRoughness"]["baseColorTexture"]["index"]
    image = document["images"][document["textures"][texture]["source"]]
    view = document["bufferViews"][image["bufferView"]]
    start = binary_offset + view.get("byteOffset", 0)
    if glb[start:start + view["byteLength"]] != atlas:
        raise SystemExit("Native tank GLB does not embed the approved atlas")
    print(f"NATIVE_TANK_BINARY_OK {digest(directory / 'tank.glb')} {digest(directory / 'tank_albedo_ps2.png')}")


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--source", type=Path, required=True)
    parser.add_argument("--destination", type=Path, required=True)
    args = parser.parse_args()
    args.destination.mkdir(parents=True, exist_ok=True)
    validate_native_tank(args.destination)
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
