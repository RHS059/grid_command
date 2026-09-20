#!/usr/bin/env python3
"""Copy and validate the pinned Grid Command runtime asset selection (stdlib only)."""

import argparse
import hashlib
import json
from pathlib import Path
import struct
import subprocess
import sys
import zlib

PROJECT = Path(__file__).resolve().parents[1]
SOURCE_URL = "https://github.com/RHS059/grid_command"
SOURCE_COMMIT = "a64ac714f5c9e7f5630c69b3c55caa0ec5b81833"
MANIFEST = PROJECT / "assets/provenance.json"
PNG_SIGNATURE = b"\x89PNG\r\n\x1a\n"

# Explicit allowlist: no source work files, reference images or evidence exports.
GROUPS = [
    ("fighter", "FQ-44 Fury", "JET", -90, ["fighter.glb", "fighter_albedo.png", "fighter_normal.png", "fighter_orm.png", "fighter_roughness.png", "fighter_metalness.png"]),
    ("tank", "Tank", "TANK", 0, ["tank.glb", "tank_albedo.png", "tank_orm.png"]),
    ("apc", "APC", "APC", 0, ["apc.glb", "apc_lod1.glb", "stryker_albedo.png", "stryker_orm.png"]),
    ("cannon_apc", "Cannon APC", "CANNON_APC", 0, ["cannon_apc.glb", "cannon_apc_lod1.glb", "stryker_albedo.png", "stryker_orm.png"]),
    ("aircraft_carrier", "Aircraft carrier", "AIRCRAFT_CARRIER", 0, ["aircraft_carrier.glb", "aircraft_carrier_lod1.glb", "aircraft_carrier_collision.glb", "aircraft_carrier_albedo.png", "aircraft_carrier_rig.json", "aircraft_carrier.json"]),
    ("missile_cruiser", "Missile cruiser", "FRIGATE", 0, ["missile_cruiser.glb", "missile_cruiser_lod1.glb", "missile_cruiser_collision.glb", "missile_cruiser_albedo.png"]),
    ("cas", "CAS aircraft", "CAS_FIGHTER", 0, ["cas.glb", "cas_albedo.png", "cas_orm.png"]),
    ("recon_uav", "Reconnaissance UAV", "RECON_UAV", 0, ["recon_uav.glb", "recon_uav_albedo.png", "recon_uav_orm.png"]),
    ("patrol_boat", "Patrol boat", "PATROL_BOAT", 0, ["patrol_boat.glb", "patrol_boat_lod1.glb", "patrol_boat_lod2.glb", "patrol_boat_collision.glb", "patrol_boat_albedo.png"]),
    ("landing_craft", "Landing craft", "LANDING_CRAFT", 0, ["landing_craft.glb", "landing_craft_lod1.glb", "landing_craft_lod2.glb", "landing_craft_collision.glb", "landing_craft_albedo.png"]),
    ("aircraft_weapons", "Aircraft stores", "ATTACHMENT", -90, ["aircraft_weapons.glb", "aircraft_weapons_albedo.png"]),
    ("aircraft_fuel_tank", "Aircraft fuel tank", "ATTACHMENT", 0, ["aircraft_fuel_tank.glb", "aircraft_fuel_tank_albedo.png", "aircraft_fuel_tank_orm.png"]),
]
SELECTION = sorted({"models/" + name for group in GROUPS for name in group[4]} | {"textures/vehicle_destroyed_mask.png"})


def require(condition, message):
    if not condition:
        raise ValueError(message)


def write_json(path, value):
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(value, indent=2, ensure_ascii=True) + "\n", encoding="utf-8", newline="\n")


def validate_png(data):
    require(data.startswith(PNG_SIGNATURE), "invalid PNG signature")
    offset, chunks, idat, header = 8, [], bytearray(), None
    while offset < len(data):
        require(offset + 12 <= len(data), "truncated PNG chunk")
        length, kind = struct.unpack_from(">I4s", data, offset)
        end = offset + 12 + length
        require(end <= len(data), "PNG chunk exceeds file")
        payload = data[offset + 8:offset + 8 + length]
        crc = struct.unpack_from(">I", data, offset + 8 + length)[0]
        require(zlib.crc32(kind + payload) & 0xFFFFFFFF == crc, "PNG CRC mismatch")
        if not chunks:
            require(kind == b"IHDR" and length == 13, "PNG must begin with IHDR")
            header = struct.unpack(">IIBBBBB", payload)
        elif kind == b"IHDR":
            raise ValueError("duplicate PNG IHDR")
        chunks.append(kind)
        if kind == b"IDAT":
            idat.extend(payload)
        offset = end
        if kind == b"IEND":
            require(length == 0 and offset == len(data), "invalid PNG IEND or trailing bytes")
            break
    require(chunks and chunks[-1] == b"IEND" and idat, "PNG missing image data or IEND")
    width, height, depth, color, compression, filtering, interlace = header
    require(0 < width <= 16384 and 0 < height <= 16384, "unsupported PNG dimensions")
    allowed_depths = {0: (1, 2, 4, 8, 16), 2: (8, 16), 3: (1, 2, 4, 8), 4: (8, 16), 6: (8, 16)}
    require(color in allowed_depths and depth in allowed_depths[color], "invalid PNG color/depth")
    require(compression == 0 and filtering == 0 and interlace in (0, 1), "unsupported PNG encoding")
    require(color != 3 or b"PLTE" in chunks, "indexed PNG missing palette")
    channels = {0: 1, 2: 3, 3: 1, 4: 2, 6: 4}[color]
    passes = [(0, 0, 1, 1)] if interlace == 0 else [(0, 0, 8, 8), (4, 0, 8, 8), (0, 4, 4, 8), (2, 0, 4, 4), (0, 2, 2, 4), (1, 0, 2, 2), (0, 1, 1, 2)]
    rows = []
    for x, y, dx, dy in passes:
        w, h = max(0, (width - x + dx - 1) // dx), max(0, (height - y + dy - 1) // dy)
        if w and h:
            rows.extend([1 + (w * channels * depth + 7) // 8] * h)
    expected = sum(rows)
    require(expected <= 256 * 1024 * 1024, "PNG decode exceeds validation limit")
    decoder = zlib.decompressobj()
    raw = decoder.decompress(bytes(idat), expected + 1)
    require(decoder.eof and not decoder.unused_data and len(raw) == expected, "PNG image data length/zlib mismatch")
    offset = 0
    for row_size in rows:
        require(raw[offset] <= 4, "invalid PNG scanline filter")
        offset += row_size
    return {"format": "PNG", "width": width, "height": height, "bit_depth": depth, "color_type": color}


def validate_glb(data):
    require(len(data) >= 20, "truncated GLB header")
    magic, version, length = struct.unpack_from("<4sII", data)
    require(magic == b"glTF" and version == 2 and length == len(data), "invalid GLB header/version/length")
    chunks, offset = [], 12
    while offset < len(data):
        require(offset + 8 <= len(data), "truncated GLB chunk")
        size, kind = struct.unpack_from("<II", data, offset)
        require(size % 4 == 0 and offset + 8 + size <= len(data), "invalid GLB chunk extent/alignment")
        chunks.append((kind, data[offset + 8:offset + 8 + size]))
        offset += 8 + size
    require(chunks and chunks[0][0] == 0x4E4F534A, "GLB missing leading JSON")
    require(len(chunks) <= 2 and (len(chunks) == 1 or chunks[1][0] == 0x004E4942), "unexpected GLB chunks")
    doc = json.loads(chunks[0][1].decode("utf-8"))
    require(doc.get("asset", {}).get("version") == "2.0", "invalid glTF asset version")
    binary = chunks[1][1] if len(chunks) == 2 else b""
    buffers = doc.get("buffers", [])
    require(len(buffers) == 1 and "uri" not in buffers[0], "selection requires self-contained GLB buffers")
    buffer_length = buffers[0]["byteLength"]
    require(0 <= len(binary) - buffer_length <= 3, "GLB binary buffer length mismatch")
    views, accessors = doc.get("bufferViews", []), doc.get("accessors", [])
    for view in views:
        require(view.get("buffer", 0) == 0, "invalid bufferView buffer")
        start, size = view.get("byteOffset", 0), view["byteLength"]
        require(start >= 0 and size > 0 and start + size <= buffer_length, "bufferView exceeds binary buffer")
    component_sizes = {5120: 1, 5121: 1, 5122: 2, 5123: 2, 5125: 4, 5126: 4}
    component_counts = {"SCALAR": 1, "VEC2": 2, "VEC3": 3, "VEC4": 4, "MAT2": 4, "MAT3": 9, "MAT4": 16}
    for accessor in accessors:
        require("sparse" not in accessor, "sparse accessors are outside this asset selection")
        require(0 <= accessor.get("bufferView", -1) < len(views), "invalid accessor bufferView")
        require(accessor.get("componentType") in component_sizes and accessor.get("type") in component_counts, "invalid accessor type")
        view = views[accessor["bufferView"]]
        element = component_sizes[accessor["componentType"]] * component_counts[accessor["type"]]
        stride, count, start = view.get("byteStride", element), accessor["count"], accessor.get("byteOffset", 0)
        require(count > 0 and stride >= element and start >= 0, "invalid accessor stride/count/offset")
        require(start + (count - 1) * stride + element <= view["byteLength"], "accessor exceeds bufferView")
    embedded_images = []
    for picture in doc.get("images", []):
        require("uri" not in picture, "external GLB image is outside this self-contained selection")
        require(picture.get("mimeType") == "image/png", "unsupported embedded image format")
        require(0 <= picture.get("bufferView", -1) < len(views), "invalid image bufferView")
        view = views[picture["bufferView"]]
        start = view.get("byteOffset", 0)
        embedded_images.append(validate_png(binary[start:start + view["byteLength"]]))
    meshes, nodes = doc.get("meshes", []), doc.get("nodes", [])
    require(meshes and nodes, "GLB lacks mesh/node content")
    for mesh in meshes:
        for primitive in mesh.get("primitives", []):
            require("POSITION" in primitive.get("attributes", {}), "mesh primitive missing positions")
            for index in primitive["attributes"].values():
                require(0 <= index < len(accessors), "invalid attribute accessor")
            if "indices" in primitive:
                require(0 <= primitive["indices"] < len(accessors), "invalid index accessor")
            if "material" in primitive:
                require(0 <= primitive["material"] < len(doc.get("materials", [])), "invalid material index")
    for node in nodes:
        if "mesh" in node:
            require(0 <= node["mesh"] < len(meshes), "invalid node mesh index")
        for child in node.get("children", []):
            require(0 <= child < len(nodes), "invalid child node index")
    for scene in doc.get("scenes", []):
        for node in scene.get("nodes", []):
            require(0 <= node < len(nodes), "invalid scene node index")
    return {"format": "GLB", "version": version, "meshes": len(meshes), "nodes": len(nodes), "materials": len(doc.get("materials", [])), "embedded_pngs": len(embedded_images)}


def inspect(path, data):
    if path.suffix == ".png":
        return validate_png(data)
    if path.suffix == ".glb":
        return validate_glb(data)
    if path.suffix == ".json":
        json.loads(data)
        return {"format": "JSON"}
    raise ValueError("unapproved asset extension: " + path.suffix)


def git(source, *args):
    return subprocess.check_output(["git", "-c", "safe.directory=" + source.as_posix(), "-C", str(source), *args])


def sync(source, revision):
    source = source.resolve()
    remote = git(source, "remote", "get-url", "origin").decode().strip().removesuffix(".git")
    require(remote in (SOURCE_URL, "git@github.com:RHS059/grid_command"), "source must be RHS059/grid_command")
    commit = git(source, "rev-parse", revision + "^{commit}").decode().strip()
    require(git(source, "rev-parse", "--show-object-format").decode().strip() == "sha1", "source repository must use SHA-1 Git objects")
    tracked = {}
    for item in git(source, "ls-tree", "-rz", "--full-tree", commit, "--", "public/models", "public/textures").split(b"\0"):
        if item:
            metadata, name = item.split(b"\t", 1)
            mode, kind, blob = metadata.decode().split()
            if mode == "100644" and kind == "blob":
                tracked[name.decode()] = blob
    records, prepared = [], []
    for relative in SELECTION:
        source_path = "public/" + relative
        require(source_path in tracked, "asset is not a regular committed source file: " + source_path)
        path = source / source_path
        data = path.read_bytes()
        blob = hashlib.sha1(b"blob " + str(len(data)).encode() + b"\0" + data).hexdigest()
        if blob != tracked[source_path] and path.suffix == ".json":
            # Git may check text out with CRLF on Windows. Preserve the committed
            # LF version for deterministic copies while rejecting content edits.
            committed = git(source, "show", commit + ":" + source_path)
            require(data.replace(b"\r\n", b"\n") == committed, "source JSON differs from pinned commit: " + source_path)
            data = committed
            blob = hashlib.sha1(b"blob " + str(len(data)).encode() + b"\0" + data).hexdigest()
        require(blob == tracked[source_path], "source bytes differ from pinned commit: " + source_path)
        destination = "assets/" + relative
        details = inspect(path, data)
        records.append({"path": destination, "source_path": source_path, "source_git_blob": blob, "size_bytes": len(data), "sha256": hashlib.sha256(data).hexdigest(), "integrity": details})
        prepared.append((PROJECT / destination, data))
    # Complete source verification before any destination write; never alter source.
    for path, data in prepared:
        path.parent.mkdir(parents=True, exist_ok=True)
        if not path.exists() or path.read_bytes() != data:
            path.write_bytes(data)
    write_json(MANIFEST, {
        "schema_version": 1,
        "source_repository": SOURCE_URL,
        "source_commit": commit,
        "provenance": "Existing committed Grid Command runtime assets copied unchanged for the project owner's Godot migration. No third-party downloads or Blender work/evidence files are included.",
        "license_note": "No standalone license grant was found in the source repository root. This manifest records origin and byte identity; it does not grant additional redistribution rights or invent a license.",
        "file_count": len(records),
        "total_size_bytes": sum(record["size_bytes"] for record in records),
        "files": records,
    })
    catalog = []
    for key, label, role, rotation, files in GROUPS:
        catalog.append({
            "id": key, "label": label, "source_role": role,
            "scene": "res://assets/models/" + key + ".glb",
            "wrapper_rotation_degrees": [rotation, 0, 0],
            "lod_scenes": ["res://assets/models/" + name for name in files if "_lod" in name],
            "collision_scene": next(("res://assets/models/" + name for name in files if "_collision" in name), None),
            "textures": {name.removesuffix(".png").split("_")[-1]: "res://assets/models/" + name for name in files if name.endswith(".png")},
            "companion_data": ["res://assets/models/" + name for name in files if name.endswith(".json")],
        })
    write_json(PROJECT / "assets/catalog.json", {"schema_version": 1, "units": "source game units; preserve the GLB's authored scale", "godot_orientation": "Y up, -Z forward; apply wrapper_rotation_degrees outside the imported scene", "orm_channels": {"r": "ambient_occlusion", "g": "roughness", "b": "metallic"}, "normal_map_convention": "OpenGL +Y", "shared_damage_mask": "res://assets/textures/vehicle_destroyed_mask.png", "models": catalog})


def validate(report_path=None):
    manifest = json.loads(MANIFEST.read_text(encoding="utf-8"))
    require(manifest["source_repository"] == SOURCE_URL, "unexpected provenance repository")
    records, seen = [], set()
    for expected in manifest["files"]:
        relative = expected["path"]
        require(relative in {"assets/" + name for name in SELECTION} and relative not in seen, "unexpected or duplicate manifest asset")
        seen.add(relative)
        path = PROJECT / relative
        require(path.resolve().is_relative_to((PROJECT / "assets").resolve()), "asset escapes project assets")
        data = path.read_bytes()
        size, digest = len(data), hashlib.sha256(data).hexdigest()
        require(size == expected["size_bytes"] and digest == expected["sha256"], "size/hash mismatch: " + relative)
        blob = hashlib.sha1(b"blob " + str(size).encode() + b"\0" + data).hexdigest()
        require(blob == expected["source_git_blob"], "source Git blob mismatch: " + relative)
        details = inspect(path, data)
        require(details == expected["integrity"], "integrity metadata differs: " + relative)
        records.append({"path": relative, "size_bytes": size, "sha256": digest, "integrity": details})
    require(seen == {"assets/" + name for name in SELECTION}, "manifest selection is incomplete")
    total = sum(record["size_bytes"] for record in records)
    require(len(records) == manifest["file_count"] and total == manifest["total_size_bytes"], "manifest totals mismatch")
    report = {"status": "passed", "source_commit": manifest["source_commit"], "file_count": len(records), "total_size_bytes": total, "glb_count": sum(r["integrity"]["format"] == "GLB" for r in records), "png_count": sum(r["integrity"]["format"] == "PNG" for r in records), "json_count": sum(r["integrity"]["format"] == "JSON" for r in records), "files": records}
    if report_path:
        write_json(report_path, report)
    for record in records:
        print(f"{record['size_bytes']:>10}  {record['sha256']}  {record['path']}")
    print(f"PASS: {len(records)} files, {total:,} bytes; {report['glb_count']} GLB, {report['png_count']} PNG, {report['json_count']} JSON. Source {manifest['source_commit']}.")
    return report


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("action", choices=("sync", "validate"))
    parser.add_argument("--source-root", type=Path, default=PROJECT.parent / "grid_command")
    parser.add_argument("--source-commit", default=SOURCE_COMMIT)
    parser.add_argument("--report", type=Path, help="write a deterministic JSON validation report")
    args = parser.parse_args()
    try:
        if args.action == "sync":
            sync(args.source_root, args.source_commit)
        validate(args.report)
    except (ValueError, OSError, KeyError, IndexError, struct.error, zlib.error, subprocess.CalledProcessError) as error:
        print("FAIL: " + str(error), file=sys.stderr)
        return 1
    return 0


if __name__ == "__main__":
    sys.exit(main())
