#!/usr/bin/env python3
"""Build the San Diego streaming catalog, using only Python's standard library.

Run from any directory: python tools/theater/build_catalog.py
Use --check to reconstruct every artifact and fail on any byte difference.
The manifest documents the row layout, units, axis mapping and shared palettes.
Source records are decoded incrementally; the 73 MB input is never loaded whole.
"""

import argparse
from collections import Counter, defaultdict
import hashlib
import json
import math
from pathlib import Path
import re
import sys
import time


PROJECT = Path(__file__).resolve().parents[2]
PUBLIC = PROJECT.parent / "grid_command" / "public"
OUTPUT = PROJECT / "data" / "generated" / "san_diego"
MODULE = 4
FLOOR_HEIGHT = 3.2
SECTOR_SIZE = 2000
SCHEMA = 1
TYPES = sorted(("industrial", "commercial", "residential", "parking-garage",
                "government", "apartment", "residential-house", "power-station",
                "gas-station", "grocery-store", "department-store", "church"))
FIELDS = ["key", "x_m", "y_m", "elevation_m", "rotation_rad", "width_modules",
          "depth_modules", "floors", "height_m", "type", "style", "seed",
          "roof", "footprint_modules_xy", "aabb_m", "flags"]
STYLE_FIELDS = ["family", "wall_color", "roof_color", "window_color", "trim_color", "accent_color"]
PALETTES = {
    "industrial": {
        "walls": ["#798184", "#687477", "#8a8678", "#746f68"], "trim": "#c3b99d", "accent": "#414b4e",
        "windows": ["#24495b", "#33464d", "#31565a", "#5f5846"], "doors": ["#39464a", "#555b56"], "roofs": ["#545c5d", "#6a655e", "#445158"]},
    "commercial": {
        "walls": ["#c3b29a", "#adb8b9", "#9ca7ad", "#b59170"], "trim": "#e2ded1", "accent": "#526a74",
        "windows": ["#24566d", "#293b48", "#39686a", "#6c5b42"], "doors": ["#263f49", "#4e4740"], "roofs": ["#555f63", "#706b63", "#48545a"]},
    "residential": {
        "walls": ["#a9705e", "#b49a76", "#87959b", "#9f8068"], "trim": "#dfd4bc", "accent": "#514c45",
        "windows": ["#34596b", "#35434c", "#416766", "#655744"], "doors": ["#4b3830", "#3e4a48"], "roofs": ["#68504a", "#55595a", "#7a6551"]},
    "civic": {
        "walls": ["#b9b2a3", "#aaa28e", "#9ba5aa", "#c0a983"], "trim": "#e2dccb", "accent": "#555b5b",
        "windows": ["#2b5162", "#303e47", "#3c6262", "#675a45"], "doors": ["#473d36", "#38484b"], "roofs": ["#595553", "#626a6a", "#725d4b"]},
}


def require(condition, message):
    if not condition:
        raise ValueError(message)


def finite(value, label):
    require(type(value) in (int, float) and math.isfinite(value), f"{label}: expected finite number")
    return value


def positive_integer(value, label):
    finite(value, label)
    require(value > 0 and int(value) == value, f"{label}: expected positive integer")
    return int(value)


def compact(value):
    """Remove projection noise at six decimals of the value's metre/module unit."""
    result = round(value, 6)
    return int(result) if result == int(result) else result


def encode(value, pretty=False):
    return (json.dumps(value, sort_keys=True, ensure_ascii=True, allow_nan=False,
                       indent=2 if pretty else None, separators=None if pretty else (",", ":")) + "\n").encode("utf-8")


def file_info(path):
    digest = hashlib.sha256()
    with path.open("rb") as stream:
        for block in iter(lambda: stream.read(1024 * 1024), b""):
            digest.update(block)
    return {"file": path.name, "bytes": path.stat().st_size, "sha256": digest.hexdigest()}


class JSONStream:
    """Incremental JSON parser; only the current source record occupies memory."""

    def __init__(self, stream, chunk_size=262144):
        self.stream, self.chunk_size = stream, chunk_size
        self.buffer, self.offset, self.eof = "", 0, False
        self.decoder = json.JSONDecoder(parse_constant=lambda value: self.invalid_constant(value))

    @staticmethod
    def invalid_constant(value):
        raise ValueError(f"JSON contains nonfinite number {value}")

    def more(self):
        self.buffer = self.buffer[self.offset:]
        self.offset = 0
        block = self.stream.read(self.chunk_size)
        self.eof = not block
        self.buffer += block

    def peek(self):
        while True:
            while self.offset < len(self.buffer) and self.buffer[self.offset].isspace():
                self.offset += 1
            if self.offset < len(self.buffer):
                return self.buffer[self.offset]
            if self.eof:
                return ""
            self.more()

    def expect(self, token):
        require(self.peek() == token, f"invalid JSON: expected {token!r}")
        self.offset += 1

    def value(self):
        require(self.peek(), "unexpected JSON EOF")
        while True:
            try:
                value, end = self.decoder.raw_decode(self.buffer, self.offset)
                # A number can end at a chunk boundary before its remaining digits.
                incomplete = end == len(self.buffer) or self.buffer[end] not in " \t\r\n,:}]"
                if incomplete:
                    if not self.eof:
                        self.more()
                        continue
                    require(end == len(self.buffer), "invalid JSON token suffix")
                self.offset = end
                return value
            except json.JSONDecodeError:
                if self.eof:
                    raise
                self.more()


def source_records(path, header):
    with path.open("r", encoding="utf-8") as stream:
        reader = JSONStream(stream)
        reader.expect("{")
        fields = set()
        while reader.peek() != "}":
            name = reader.value()
            require(isinstance(name, str) and name not in fields, "duplicate/invalid catalog field")
            fields.add(name)
            reader.expect(":")
            if name == "records":
                reader.expect("[")
                while reader.peek() != "]":
                    yield reader.value()
                    if reader.peek() != "]":
                        reader.expect(",")
                        require(reader.peek() != "]", "trailing record comma")
                reader.expect("]")
            else:
                header[name] = reader.value()
            if reader.peek() != "}":
                reader.expect(",")
                require(reader.peek() != "}", "trailing catalog comma")
        reader.expect("}")
        require(not reader.peek(), "trailing catalog content")
        require("records" in fields, "catalog missing records")


def signed_area(points):
    return sum(a[0] * b[1] - b[0] * a[1] for a, b in zip(points, points[1:] + points[:1])) / 2


def remove_collinear(points):
    # Only remove a vertex between its neighbors, never a reversal or narrow notch.
    unique = [p for i, p in enumerate(points) if not i or p != points[i - 1]]
    if len(unique) > 1 and unique[0] == unique[-1]:
        unique.pop()
    result = []
    for i, point in enumerate(unique):
        previous, following = unique[i - 1], unique[(i + 1) % len(unique)]
        ax, ay = point[0] - previous[0], point[1] - previous[1]
        bx, by = following[0] - point[0], following[1] - point[1]
        if ax * by == ay * bx and ax * bx + ay * by > 0:
            continue
        result.append(point)
    return result


def family(kind):
    if kind in ("industrial", "power-station", "parking-garage"):
        return "industrial"
    if kind in ("commercial", "grocery-store", "department-store", "gas-station"):
        return "commercial"
    return "civic" if kind in ("government", "church") else "residential"


def style_for(kind, seed):
    name = family(kind)
    palette = PALETTES[name]
    pairs = [int(seed[i:i + 2]) for i in range(0, 16, 2)]
    return (name, "#b8b3a8" if kind == "government" else palette["walls"][pairs[1] % 4],
            "#697274" if kind == "government" else palette["roofs"][pairs[4] % 3],
            palette["windows"][pairs[3] % 4], palette["trim"], palette["accent"])


def normalize_footprint(preset, label):
    width = positive_integer(preset.get("width"), f"{label}.width")
    depth = positive_integer(preset.get("depth"), f"{label}.depth")
    raw = preset.get("footprint", [])
    shape = preset.get("footprintMode") == "shape"
    require(not shape or (isinstance(raw, list) and len(raw) >= 3), f"{label}: shape needs 3 vertices")
    points = [(finite(p.get("x"), label), finite(p.get("y"), label)) for p in raw] if shape else [(0, 0), (width, 0), (width, depth), (0, depth)]
    source_count = len(points)
    # Match geometry-loader.ts before simplification, without preset editor limits.
    points = [p for i, p in enumerate(points) if not i or math.dist(p, points[i - 1]) > .2]
    if not preset.get("slopedWalls", False):
        orthogonal = []
        for a, b in zip(points, points[1:] + points[:1]):
            orthogonal.append(a)
            if abs(b[0] - a[0]) > .2 and abs(b[1] - a[1]) > .2:
                orthogonal.append((b[0], a[1]))
        points = orthogonal
    require(len(points) >= 3, f"{label}: degenerate footprint")
    mid_x = (min(p[0] for p in points) + max(p[0] for p in points)) / 2
    mid_y = (min(p[1] for p in points) + max(p[1] for p in points)) / 2
    centered = [(p[0] - mid_x, p[1] - mid_y) for p in points]
    rounded = [(compact(p[0]), compact(p[1])) for p in centered]
    error = max(math.dist(a, b) * MODULE for a, b in zip(centered, rounded))
    points = remove_collinear(rounded)
    area = signed_area(points)
    require(len(points) >= 3 and area != 0, f"{label}: degenerate footprint after normalization")
    if area < 0:
        points.reverse()
    start = min(range(len(points)), key=points.__getitem__)
    points = points[start:] + points[:start]
    return points, source_count, error, width, depth, shape


def convert_record(record):
    require(isinstance(record, dict), "record must be an object")
    key, preset = record.get("key"), record.get("preset")
    require(isinstance(key, str) and key, "missing record key")
    require(isinstance(preset, dict), f"{key}: missing preset")
    points, source_count, footprint_error, width, depth, shape = normalize_footprint(preset, key)
    coordinates = [finite(record.get(field), f"{key}.{field}") for field in ("x", "y", "elevation")]
    x, y, elevation = map(compact, coordinates)
    rotation = finite(record.get("rotation"), f"{key}.rotation")
    # Rotation is retained exactly; tiny projection noise in coordinates is bounded.
    floors = positive_integer(preset.get("floors"), f"{key}.floors")
    kind, seed = preset.get("type"), preset.get("seed")
    require(kind in TYPES, f"{key}: unknown building type {kind!r}")
    require(isinstance(seed, str) and re.fullmatch(r"[0-9]{16}", seed), f"{key}: invalid style seed")
    roof = preset.get("roof", "auto")
    require(roof in ("auto", "flat", "gable"), f"{key}: unknown roof")
    if shape:
        roof = "flat"
    elif roof == "auto":
        roof = "gable" if kind in ("residential-house", "residential", "church", "government") else "flat"
    cosine, sine = math.cos(rotation), math.sin(rotation)
    world = [(x + MODULE * (px * cosine - py * sine), y + MODULE * (px * sine + py * cosine)) for px, py in points]
    # Conservative bounds avoid losing an edge on a sector boundary to rounding.
    bounds = [math.floor(min(p[0] for p in world) * 1e6) / 1e6,
              math.floor(min(p[1] for p in world) * 1e6) / 1e6,
              math.ceil(max(p[0] for p in world) * 1e6) / 1e6,
              math.ceil(max(p[1] for p in world) * 1e6) / 1e6]
    bounds = [compact(v) for v in bounds]
    style = style_for(kind, seed)
    row = [key, x, y, elevation, rotation, width, depth, floors, compact(floors * FLOOR_HEIGHT),
           TYPES.index(kind), style, seed, int(roof == "gable"), [n for p in points for n in p],
           bounds, int(bool(preset.get("slopedWalls"))) | (2 if shape else 0)]
    return row, source_count, footprint_error, max(abs(a - b) for a, b in zip(coordinates, (x, y, elevation)))


def owner_for(row):
    return (math.floor(row[1] / SECTOR_SIZE), math.floor(row[2] / SECTOR_SIZE))


def touched_sectors(bounds):
    return ((x, y) for x in range(math.floor(bounds[0] / SECTOR_SIZE), math.floor(bounds[2] / SECTOR_SIZE) + 1)
            for y in range(math.floor(bounds[1] / SECTOR_SIZE), math.floor(bounds[3] / SECTOR_SIZE) + 1))


def merged_bounds(rows):
    return [min(row[14][0] for row in rows), min(row[14][1] for row in rows),
            max(row[14][2] for row in rows), max(row[14][3] for row in rows)]


def build(source, presets_source):
    header, sectors, references, keys, styles = {}, defaultdict(list), defaultdict(set), set(), set()
    types, floors = Counter(), Counter()
    source_vertices = output_vertices = 0
    max_footprint_error = max_coordinate_error = 0
    for record in source_records(source, header):
        row, count, footprint_error, coordinate_error = convert_record(record)
        require(row[0] not in keys, f"duplicate building key: {row[0]}")
        keys.add(row[0])
        owner = owner_for(row)
        sectors[owner].append(row)
        for target in touched_sectors(row[14]):
            if target != owner:
                references[target].add(owner)
        styles.add(row[10])
        source_vertices += count
        output_vertices += len(row[13]) // 2
        max_footprint_error = max(max_footprint_error, footprint_error)
        max_coordinate_error = max(max_coordinate_error, coordinate_error)
        types[TYPES[row[9]]] += 1
        floors[row[7]] += 1
    require(header.get("schema") == 1 and header.get("region") == "san-diego-theater" and header.get("complete") is True,
            "source must be a complete schema-1 San Diego catalog")
    require(keys, "source catalog is empty")
    presets = json.loads(presets_source.read_text(encoding="utf-8"))
    require(isinstance(presets, list), "preset library must be an array")
    preset_rows, preset_names = [], []
    preset_ids = set()
    for preset in sorted(presets, key=lambda p: p["id"]):
        key = preset["id"]
        require(isinstance(key, str) and key not in preset_ids, "duplicate/invalid preset id")
        preset_ids.add(key)
        row, _, _, _ = convert_record({"key": key, "x": 0, "y": 0, "elevation": 0, "rotation": 0, "preset": preset})
        styles.add(row[10])
        preset_rows.append(row)
        preset_names.append(preset.get("name", key))
    style_table = sorted(styles)
    style_ids = {style: i for i, style in enumerate(style_table)}
    for rows in list(sectors.values()) + [preset_rows]:
        rows.sort(key=lambda row: row[0])
        for row in rows:
            row[10] = style_ids[row[10]]
    artifacts = {}
    entries = []
    for sector in sorted(set(sectors) | set(references)):
        rows = sectors.get(sector, [])
        path = f"sectors/{sector[0]}_{sector[1]}.json"
        overlaps = sorted(references.get(sector, set()))
        payload = {"schema": SCHEMA, "sector": sector, "records": rows, "overlap_owners": overlaps}
        data = encode(payload)
        artifacts[path] = data
        entries.append({"key": list(sector), "file": path, "count": len(rows),
                        "bounds_m": merged_bounds(rows) if rows else None, "overlap_owners": overlaps,
                        "bytes": len(data), "sha256": hashlib.sha256(data).hexdigest()})
    artifacts["presets.json"] = encode({"schema": SCHEMA, "records": preset_rows, "names": preset_names})
    all_rows = [row for rows in sectors.values() for row in rows]
    sources = [file_info(source), file_info(presets_source)]
    bounds = merged_bounds(all_rows)
    manifest = {
        "schema": SCHEMA, "region": header["region"], "complete": True,
        "source": header.get("source", "OpenFreeMap / OpenStreetMap"), "sources": sources,
        "building_count": len(keys), "sector_count": len(entries), "sector_size_m": SECTOR_SIZE,
        "module_m": MODULE, "floor_height_m": FLOOR_HEIGHT, "bounds_m": bounds,
        "origin_lng_lat": [-117.08, 32.82],
        "coordinates": {"projection": "local Web Mercator scaled at origin latitude", "source_axes": ["east", "north", "up"],
                        "godot_position": "Vector3(x_m, elevation_m, y_m) / 100.0", "godot_yaw": "-rotation_rad",
                        "godot_local_vertex": "Vector3(footprint_x * module_m, height_m, footprint_y * module_m) / 100.0",
                        "footprint_winding": "counterclockwise in source x/y; implicit closed ring", "aabb_order": ["min_x", "min_y", "max_x", "max_y"]},
        "record_fields": FIELDS, "types": TYPES, "style_fields": STYLE_FIELDS, "styles": style_table,
        "roof_types": ["flat", "gable"], "flags": {"sloped_walls": 1, "shape_footprint": 2},
        "height_semantics": "floors * 3.2 metres, excluding decorative/gable roof rise",
        "streaming": {"ownership": "one record in floor(x_m/2000),floor(y_m/2000)",
                      "ordering": "sectors by numeric x then y; buildings by key; styles lexicographic",
                      "overlap_owners": "To query a sector, also load the listed owner sectors and filter their AABBs; deduplicate by key. Do not recursively follow overlap_owners.",
                      "empty_sectors": "Sectors absent from this index contain no building AABBs."},
        "seed_semantics": {"format": "16 decimal digits retained as a string; split into eight two-digit fields",
                           "fields": ["wall material", "wall color", "window type", "window material/color", "roof material/color", "door position/color", "facade/rooms", "details"],
                           "wall_materials": ["stucco", "brick", "concrete", "metal-panel"],
                           "window_types": ["narrow", "square", "wide", "ribbon"],
                           "window_materials": ["clear-glass", "smoked-glass", "green-glass", "amber-glass"],
                           "roof_materials": ["standing-seam", "shingle", "membrane"],
                           "selection": "field modulo palette length; government wall material is cut-stone",
                           "palettes": PALETTES},
        "presets": {"file": "presets.json", "count": len(preset_rows), "bytes": len(artifacts["presets.json"]),
                    "sha256": hashlib.sha256(artifacts["presets.json"]).hexdigest()},
        "sectors": entries,
    }
    artifacts["manifest.json"] = encode(manifest)
    tree = hashlib.sha256()
    for path, data in sorted(artifacts.items()):
        tree.update(path.encode("utf-8") + b"\0" + data)
    report = {
        "schema": SCHEMA, "valid": True, "sources": sources, "building_count": len(keys),
        "preset_count": len(preset_rows), "occupied_owner_sectors": len(sectors), "sector_files": len(entries),
        "reference_only_sectors": len(set(references) - set(sectors)), "type_counts": dict(sorted(types.items())),
        "floor_counts": {str(k): v for k, v in sorted(floors.items())}, "bounds_m": bounds,
        "height_m": {"min": min(row[8] for row in all_rows), "max": max(row[8] for row in all_rows)},
        "elevation_m": {"min": min(row[3] for row in all_rows), "max": max(row[3] for row in all_rows)},
        "footprints": {"source_vertices": source_vertices, "output_vertices": output_vertices,
                       "removed_vertices": source_vertices - output_vertices,
                       "max_output_vertices_per_building": max(len(row[13]) // 2 for row in all_rows),
                       "max_coordinate_quantization_error_m": max_coordinate_error,
                       "max_local_vertex_quantization_error_m": max_footprint_error,
                       "method": "six decimals in source metres/modules; remove coincident/collinear interior vertices; no width/floor/vertex caps"},
        "sizes": {"input_bytes": sum(item["bytes"] for item in sources), "runtime_bytes": sum(map(len, artifacts.values())),
                  "manifest_bytes": len(artifacts["manifest.json"]), "sector_bytes": sum(item["bytes"] for item in entries),
                  "largest_sector_bytes": max(item["bytes"] for item in entries), "largest_sector_buildings": max(item["count"] for item in entries)},
        "runtime_sha256": tree.hexdigest(), "hash_method": "SHA-256 of sorted relative-path UTF-8 + NUL + exact file bytes; validation.json excluded",
        "manifest_sha256": hashlib.sha256(artifacts["manifest.json"]).hexdigest(),
        "checks": ["complete schema/region", "unique building/preset keys", "finite coordinates",
                   "positive module dimensions/floors", "valid 16-digit seeds/types/roofs", "nonzero counterclockwise footprints",
                   "full footprints without editor clamps", "conservative world AABBs", "cross-sector owner references", "deterministic sorted serialization"],
    }
    artifacts["validation.json"] = encode(report, pretty=True)
    return artifacts, report


def publish(artifacts, output, check=False):
    if check:
        for name, data in sorted(artifacts.items()):
            path = output / name
            require(path.is_file() and path.read_bytes() == data, f"artifact is missing/stale: {path}")
        actual = {p.relative_to(output).as_posix() for p in output.rglob("*.json")}
        require(actual == set(artifacts), "generated catalog contains unexpected/stale JSON files")
        return
    # Do not delete unrelated content; only remove stale sector artifacts from the prior manifest.
    previous = output / "manifest.json"
    obsolete = []
    if previous.is_file():
        for entry in json.loads(previous.read_text(encoding="utf-8")).get("sectors", []):
            name = entry.get("file", "")
            if re.fullmatch(r"sectors/-?[0-9]+_-?[0-9]+\.json", name) and name not in artifacts:
                path = (output / name).resolve()
                require(path.is_relative_to(output.resolve()), "obsolete sector escaped output directory")
                obsolete.append(path)
    for name, data in sorted(artifacts.items(), key=lambda item: (item[0] in ("manifest.json", "validation.json"), item[0])):
        path = output / name
        path.parent.mkdir(parents=True, exist_ok=True)
        if not path.is_file() or path.read_bytes() != data:
            temporary = path.with_suffix(path.suffix + ".tmp")
            temporary.write_bytes(data)
            temporary.replace(path)
    for path in obsolete:
        path.unlink(missing_ok=True)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--source", type=Path, default=PUBLIC / "san-diego-buildings.json")
    parser.add_argument("--presets", type=Path, default=PUBLIC / "_buildings.json")
    parser.add_argument("--output", type=Path, default=OUTPUT)
    parser.add_argument("--check", action="store_true", help="rebuild and byte-compare without writing")
    args = parser.parse_args()
    started = time.perf_counter()
    try:
        artifacts, report = build(args.source, args.presets)
        publish(artifacts, args.output, args.check)
    except (ValueError, OSError, KeyError, TypeError) as error:
        print(f"Catalog failed: {error}", file=sys.stderr)
        return 1
    print(json.dumps({"status": "verified" if args.check else "generated", "buildings": report["building_count"],
                      "sectors": report["sector_files"], "runtime_bytes": report["sizes"]["runtime_bytes"],
                      "runtime_sha256": report["runtime_sha256"],
                      "elapsed_seconds": round(time.perf_counter() - started, 3)}, sort_keys=True))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
