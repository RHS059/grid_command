#!/usr/bin/env python3
"""Partition an exported Godot PCK without re-exporting its dependencies.

Godot's selected-resource exports include dependencies, which would duplicate
textures in model and gameplay packs. Splitting the final archive keeps every
exported resource in exactly one package, including its import/remap metadata.
The unencrypted standalone V2/V3/V4 PCK layout is documented by Godot's
core/io/file_access_pack.cpp. Write V2 archives, supported by our 4.7 runtime.
"""

from __future__ import annotations

import hashlib
import re
import struct
from dataclasses import dataclass
from pathlib import Path
from typing import BinaryIO


CATEGORIES = ("models", "textures", "gameplay")
TEXTURE_SUFFIXES = {".png", ".jpg", ".jpeg", ".webp", ".svg", ".bmp", ".tga", ".exr", ".hdr", ".ctex", ".ctexarray", ".ccube", ".ccubearray", ".material"}
MODEL_SUFFIXES = {".glb", ".gltf", ".obj", ".fbx", ".blend", ".mesh"}


def category_for_path(path: str) -> str:
    name = path.removeprefix("res://").lower()
    while Path(name).suffix in {".import", ".remap", ".uid"}:
        name = name.rsplit(".", 1)[0]
    if name.startswith(".godot/imported/"):
        # Imported names retain the source extension before the source-path hash.
        name = re.sub(r"-[0-9a-f]{32}(?:\..*)?$", "", name)
    suffix = Path(name).suffix
    if suffix in TEXTURE_SUFFIXES or name.startswith("assets/textures/"):
        return "textures"
    if suffix in MODEL_SUFFIXES or name.startswith("assets/models/"):
        return "models"
    # Scripts, scenes, shaders, fonts, audio, data, and engine metadata travel
    # together with gameplay. Cross-category references keep their res:// paths.
    return "gameplay"


@dataclass(frozen=True)
class PackedFile:
    path: str
    offset: int
    size: int
    md5: bytes


def _read(source: BinaryIO, size: int) -> bytes:
    data = source.read(size)
    if len(data) != size:
        raise ValueError("Truncated PCK file")
    return data


def read_pck(path: Path) -> tuple[tuple[int, int, int], list[PackedFile]]:
    """Read only the directory; large payloads are streamed when copied."""
    total_size = path.stat().st_size
    with path.open("rb") as source:
        magic, version, major, minor, patch, flags, file_base = struct.unpack("<4sIIIIIQ", _read(source, 32))
        if magic != b"GDPC" or version not in (2, 3, 4):
            raise ValueError("Expected a standalone Godot V2/V3/V4 PCK")
        if flags & ~2:
            raise ValueError("Encrypted or sparse PCKs cannot be split")
        if version >= 3:
            directory_offset = struct.unpack("<Q", _read(source, 8))[0]
            if directory_offset >= total_size:
                raise ValueError("Invalid PCK directory offset")
            source.seek(directory_offset)
        else:
            _read(source, 64)
        count = struct.unpack("<I", _read(source, 4))[0]
        if count > total_size // 40:
            raise ValueError("Invalid PCK file count")
        entries = []
        seen = set()
        for _ in range(count):
            length = struct.unpack("<I", _read(source, 4))[0]
            if length > 65536:
                raise ValueError("Invalid PCK path length")
            name = _read(source, length).rstrip(b"\0").decode("utf-8")
            offset, size, md5, entry_flags = struct.unpack("<QQ16sI", _read(source, 36))
            if entry_flags:
                raise ValueError(f"Encrypted, deleted or binary-delta resource is unsupported: {name}")
            if name in seen or offset + file_base + size > total_size:
                raise ValueError(f"Duplicate or out-of-bounds PCK resource: {name}")
            seen.add(name)
            entries.append(PackedFile(name, file_base + offset, size, md5))
    return (major, minor, patch), entries


def write_pck(destination: Path, source_path: Path, engine: tuple[int, int, int], entries: list[PackedFile]) -> None:
    """Copy original resource bytes and verify their exported MD5 checksums."""
    entries = sorted(entries, key=lambda entry: entry.path)
    names = [entry.path.encode("utf-8") for entry in entries]
    names = [name + b"\0" * (-len(name) % 4) for name in names]
    directory_size = 100 + sum(40 + len(name) for name in names)
    file_base = directory_size + (-directory_size % 16)
    with destination.open("wb") as output, source_path.open("rb") as source:
        output.write(struct.pack("<4sIIIIIQ", b"GDPC", 2, *engine, 2, file_base))
        output.write(b"\0" * 64)
        output.write(struct.pack("<I", len(entries)))
        offset = 0
        for entry, name in zip(entries, names):
            output.write(struct.pack("<I", len(name)) + name)
            output.write(struct.pack("<QQ16sI", offset, entry.size, entry.md5, 0))
            offset += entry.size + (-entry.size % 16)
        output.write(b"\0" * (file_base - output.tell()))
        for entry in entries:
            source.seek(entry.offset)
            remaining = entry.size
            digest = hashlib.md5()
            while remaining:
                block = _read(source, min(remaining, 1024 * 1024))
                output.write(block)
                digest.update(block)
                remaining -= len(block)
            if digest.digest() != entry.md5:
                raise ValueError(f"PCK resource checksum mismatch: {entry.path}")
            output.write(b"\0" * (-entry.size % 16))


def artifact_metadata(path: Path, base_url: str) -> dict:
    with path.open("rb") as source:
        digest = hashlib.file_digest(source, "sha256").hexdigest()
    path.with_suffix(path.suffix + ".sha256").write_text(f"{digest}  {path.name}\n", encoding="ascii")
    return {"url": f"{base_url}/{path.name}", "sha256": digest, "sha256_url": f"{base_url}/{path.name}.sha256", "size_bytes": path.stat().st_size}


def remapped_categories(pack_path: Path) -> dict[str, str]:
    """Resolve exported scene names whose hashed paths lose their source folder."""
    _, entries = read_pck(pack_path)
    categories = {}
    with pack_path.open("rb") as source:
        for entry in entries:
            if not entry.path.endswith((".import", ".remap")):
                continue
            source.seek(entry.offset)
            metadata = _read(source, entry.size).decode("utf-8")
            for target in re.findall(r'^path(?:\.[^=]+)?="([^"]+)"', metadata, re.MULTILINE):
                categories[target.removeprefix("res://")] = category_for_path(entry.path)
    return categories


def split_packages(source_path: Path, output_dir: Path, base_url: str, full_pack: Path | None = None, *, live_patch: bool = False) -> list[dict]:
    engine, entries = read_pck(source_path)
    if live_patch:
        # Version bumps regenerate project.binary. Startup configuration is
        # already guarded by the planner and cannot change during a hot update.
        entries = [entry for entry in entries if entry.path.removeprefix("res://") not in {"project.binary", "project.godot"}]
    # Unchanged .remap sidecars can be absent from a patch. The full build's
    # directory provides the source category for those exported binary scenes.
    remaps = remapped_categories(full_pack or source_path)
    output_dir.mkdir(parents=True, exist_ok=True)
    packages = []
    for category in CATEGORIES:
        selected = [entry for entry in entries if remaps.get(entry.path.removeprefix("res://"), category_for_path(entry.path)) == category]
        output = output_dir / f"update-{category}.pck"
        write_pck(output, source_path, engine, selected)
        packages.append({"category": category, **artifact_metadata(output, base_url), "files": sorted("res://" + entry.path.removeprefix("res://") for entry in selected)})
    return packages
