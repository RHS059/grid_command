#!/usr/bin/env python3
"""Independently audit the generated rows against the full source geometry.

Only the streaming JSON reader is shared with build_catalog; geometry comparisons
and artifact hashes below do not reuse the converter's transformation functions.

Runtime integration contract (also machine-readable in manifest.json):
1. Read the small manifest once. Each sector is 2000 source metres / 20 Godot units.
2. Convert camera/view x,z to source metres (*100), then select intersecting sector
   keys using floor(metres / 2000), including negative coordinates.
3. Queue each selected sector and its manifest entry's overlap_owners once. Do not
   recursively follow owners. A building is stored in exactly one owner sector;
   neighboring references include buildings whose AABB crosses a sector boundary.
4. Read/JSON-parse sector files incrementally or on worker threads. Build meshes on
   the main thread under a per-frame vertex/record budget; never parse all sectors
   at startup. Keep a bounded LRU of sector resources, unload outside a padded view,
   and deduplicate buildings by row[0] if querying multiple neighbor sectors.
5. Position = Vector3(row[1], row[3], row[2]) / 100; yaw = -row[4]. Footprint row[13]
   is flat x/y pairs in centered 4-metre modules, so local x/z = pair * .04.
   Extrude by row[8] / 100; it is floor height, excluding decorative roof rise.
6. Use shared manifest.styles[row[10]]: family, wall/roof/window/trim/accent colors.
   The type name is manifest.types[row[9]]. Seed row[11] stays a string (leading
   zeros matter). Runtime can decode the retained seed for detailed close geometry.
7. Rows carry world AABBs at row[14] for cheap culling/navigation; filter neighbors
   by those bounds. Combine nearby building geometry into per-sector material
   batches instead of creating a separate node/material for every building.
"""

import argparse
import hashlib
import json
import math
from pathlib import Path
import sys

sys.dont_write_bytecode = True
from build_catalog import OUTPUT, PUBLIC, source_records


def require(condition, message):
    if not condition:
        raise ValueError(message)


def area(points):
    return sum(points[i][0] * points[(i + 1) % len(points)][1]
               - points[(i + 1) % len(points)][0] * points[i][1] for i in range(len(points))) / 2


def audit(source_path, root):
    manifest = json.loads((root / "manifest.json").read_bytes())
    report = json.loads((root / "validation.json").read_bytes())
    rows = {}
    sectors = {tuple(entry["key"]): entry for entry in manifest["sectors"]}
    for entry in manifest["sectors"]:
        payload = (root / entry["file"]).read_bytes()
        require(hashlib.sha256(payload).hexdigest() == entry["sha256"], "sector hash mismatch")
        require(len(payload) == entry["bytes"], "sector byte size mismatch")
        sector = json.loads(payload)
        require(sector["sector"] == entry["key"], "sector key mismatch")
        require(len(sector["records"]) == entry["count"], "sector record count mismatch")
        for row in sector["records"]:
            require(row[0] not in rows, "duplicate output building")
            require([math.floor(row[1] / 2000), math.floor(row[2] / 2000)] == entry["key"], "wrong owner sector")
            require(len(row) == 16 and len(row[13]) % 2 == 0 and len(row[13]) >= 6, "malformed record")
            rows[row[0]] = row
        require([r[0] for r in sector["records"]] == sorted(r[0] for r in sector["records"]), "record order mismatch")
    max_area_error = max_bound_error = 0
    checked = 0
    for source in source_records(source_path, {}):
        row = rows[source["key"]]
        preset = source["preset"]
        require([row[5], row[6], row[7], row[11]] == [preset["width"], preset["depth"], preset["floors"], preset["seed"]], "preset fields changed")
        require(row[4] == source["rotation"] and manifest["types"][row[9]] == preset["type"], "rotation/type changed")
        require(abs(row[8] - preset["floors"] * 3.2) < 1e-6, "height changed")
        require(all(abs(row[i] - source[key]) <= 1e-6 for i, key in ((1, "x"), (2, "y"), (3, "elevation"))), "placement changed")
        # This source is already a shape catalog; fail if its contract changes.
        require(preset.get("footprintMode") == "shape" and preset.get("slopedWalls") is True, "source footprint contract changed")
        original = [(point["x"], point["y"]) for point in preset["footprint"]]
        output = list(zip(row[13][::2], row[13][1::2]))
        error = abs(abs(area(original)) - area(output)) * 16
        max_area_error = max(max_area_error, error)
        require(error < .00001, f"footprint area changed: {source['key']}")
        mx = (min(x for x, y in original) + max(x for x, y in original)) / 2
        my = (min(y for x, y in original) + max(y for x, y in original)) / 2
        c, s = math.cos(source["rotation"]), math.sin(source["rotation"])
        world = [(source["x"] + 4 * ((x - mx) * c - (y - my) * s),
                  source["y"] + 4 * ((x - mx) * s + (y - my) * c)) for x, y in original]
        expected = [min(x for x, y in world), min(y for x, y in world), max(x for x, y in world), max(y for x, y in world)]
        max_bound_error = max(max_bound_error, max(abs(a - b) for a, b in zip(expected, row[14])))
        require(all(abs(a - b) < .000002 for a, b in zip(expected, row[14])), "world bounds changed")
        owner = (math.floor(row[1] / 2000), math.floor(row[2] / 2000))
        bounds = row[14]
        for sx in range(math.floor(bounds[0] / 2000), math.floor(bounds[2] / 2000) + 1):
            for sy in range(math.floor(bounds[1] / 2000), math.floor(bounds[3] / 2000) + 1):
                require((sx, sy) in sectors, "missing covered sector")
                if (sx, sy) != owner:
                    require(list(owner) in sectors[(sx, sy)]["overlap_owners"], "missing boundary reference")
        checked += 1
    require(checked == len(rows) == manifest["building_count"] == report["building_count"], "source/output count mismatch")
    tree = hashlib.sha256()
    files = sorted((p for p in root.rglob("*.json") if p.name != "validation.json"),
                   key=lambda p: p.relative_to(root).as_posix())
    for path in files:
        tree.update(path.relative_to(root).as_posix().encode() + b"\0" + path.read_bytes())
    require(tree.hexdigest() == report["runtime_sha256"], "runtime tree hash mismatch")
    return {"independent_audit": "passed", "buildings_checked": checked, "files_hashed": len(files),
            "max_area_difference_m2": max_area_error, "max_aabb_difference_m": max_bound_error,
            "runtime_sha256": tree.hexdigest()}


def main():
    parser = argparse.ArgumentParser(description="Independently check the generated San Diego building catalog")
    parser.add_argument("--source", type=Path, default=PUBLIC / "san-diego-buildings.json")
    parser.add_argument("--output", type=Path, default=OUTPUT)
    args = parser.parse_args()
    try:
        print(json.dumps(audit(args.source, args.output), sort_keys=True))
    except (ValueError, OSError, KeyError, TypeError) as error:
        print(f"Audit failed: {error}", file=sys.stderr)
        return 1
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
