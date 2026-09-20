"""Focused geometry, stream parsing, provenance and reproducibility checks."""

import copy
import hashlib
import io
import json
import math
from pathlib import Path
import tempfile
import unittest

import build_catalog as catalog


def record(key="test", x=0, y=0, rotation=0):
    return {"key": key, "x": x, "y": y, "elevation": 13.25, "rotation": rotation,
            "preset": {"id": key, "name": key, "type": "government", "width": 4, "depth": 2,
                       "floors": 3, "seed": "0011223344556677", "roof": "auto"}}


class CatalogTests(unittest.TestCase):
    def test_rectangle_units_rotation_and_style(self):
        row, count, _, _ = catalog.convert_record(record(x=-1, y=2, rotation=math.pi / 2))
        self.assertEqual(row[1:4], [-1, 2, 13.25])
        self.assertEqual(row[5:9], [4, 2, 3, 9.6])
        self.assertEqual(row[11:14], ["0011223344556677", 1, [-2, -1, 2, -1, 2, 1, -2, 1]])
        self.assertEqual(row[10][1:3], ("#b8b3a8", "#697274"))
        self.assertEqual(count, 4)
        for actual, expected in zip(row[14], [-5, -6, 3, 10]):
            self.assertLessEqual(abs(actual - expected), .000002)
        self.assertEqual(catalog.owner_for(row), (-1, 0))

    def test_shape_preserves_large_outline_without_editor_caps(self):
        source = record()
        points = ([{"x": x, "y": 0} for x in range(121)] + [{"x": 120, "y": 2}]
                  + [{"x": x, "y": 3} for x in range(120, -1, -1)] + [{"x": 0, "y": 1}])
        source["preset"].update(width=120, footprint=points, footprintMode="shape", slopedWalls=True)
        row, count, error, _ = catalog.convert_record(source)
        self.assertEqual(count, 244)
        self.assertEqual(row[5], 120)
        self.assertEqual(row[13], [-60, -1.5, 60, -1.5, 60, 1.5, -60, 1.5])
        self.assertEqual(row[12], 0)
        self.assertEqual(error, 0)
        self.assertEqual(row[14], [-240, -6, 240, 6])

    def test_reversed_shape_has_canonical_winding(self):
        source = record()
        shape = [{"x": 0, "y": 0}, {"x": 0, "y": 3}, {"x": 2, "y": 3}, {"x": 2, "y": 0}]
        source["preset"].update(footprint=shape, footprintMode="shape", slopedWalls=True)
        a = catalog.convert_record(source)[0]
        source["preset"]["footprint"] = list(reversed(shape))
        b = catalog.convert_record(source)[0]
        self.assertEqual(a, b)
        self.assertEqual(a[13], [-1, -1.5, 1, -1.5, 1, 1.5, -1, 1.5])

    def test_collinear_reversal_and_concavity_survive(self):
        points = [(0, 0), (1, 0), (2, 0), (1, 0), (1, 1), (0, 1)]
        self.assertEqual(catalog.remove_collinear(points), [(0, 0), (2, 0), (1, 0), (1, 1), (0, 1)])

    def test_numeric_stream_chunk_boundaries(self):
        stream = catalog.JSONStream(io.StringIO('[12345.678,-1.234e-8,"abc",true,null]'), chunk_size=2)
        stream.expect("[")
        for i, expected in enumerate([12345.678, -1.234e-8, "abc", True, None]):
            if i:
                stream.expect(",")
            self.assertEqual(stream.value(), expected)
        stream.expect("]")
        self.assertEqual(stream.peek(), "")

    def test_invalid_geometry_and_seed_rejected(self):
        for key, value in [("x", math.nan), ("elevation", True), ("rotation", math.inf)]:
            source = record()
            source[key] = value
            with self.assertRaises(ValueError):
                catalog.convert_record(source)
        source = record()
        source["preset"]["seed"] = "123"
        with self.assertRaises(ValueError):
            catalog.convert_record(source)
        source["preset"].update(seed="1234567890123456", footprintMode="shape",
                                footprint=[{"x": 0, "y": 0}, {"x": 1, "y": 0}, {"x": 2, "y": 0}])
        with self.assertRaises(ValueError):
            catalog.convert_record(source)

    def fixture(self, root, records):
        source, presets = root / "source.json", root / "presets.json"
        source.write_text(json.dumps({"schema": 1, "region": "san-diego-theater", "complete": True,
                                      "records": records}), encoding="utf-8")
        presets.write_text(json.dumps([record()["preset"]]), encoding="utf-8")
        return source, presets

    def test_boundary_references_hashes_and_byte_rebuild(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            source, presets = self.fixture(root, [record("east", x=1999), record("negative", x=-1)])
            artifacts, report = catalog.build(source, presets)
            self.assertEqual(report["building_count"], 2)
            sector = json.loads(artifacts["sectors/1_0.json"])
            self.assertEqual(sector["records"], [])
            self.assertEqual(sector["overlap_owners"], [[0, 0]])
            manifest = json.loads(artifacts["manifest.json"])
            for entry in manifest["sectors"]:
                self.assertEqual(entry["sha256"], hashlib.sha256(artifacts[entry["file"]]).hexdigest())
            output = root / "generated"
            catalog.publish(artifacts, output)
            rebuilt, _ = catalog.build(source, presets)
            self.assertEqual(artifacts, rebuilt)
            catalog.publish(rebuilt, output, check=True)
            (output / "manifest.json").write_text("{}", encoding="utf-8")
            with self.assertRaises(ValueError):
                catalog.publish(rebuilt, output, check=True)

    def test_record_order_does_not_change_sector_payload(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            records = [record("zeta"), record("alpha")]
            source, presets = self.fixture(root, records)
            a, _ = catalog.build(source, presets)
            self.fixture(root, list(reversed(records)))
            b, _ = catalog.build(source, presets)
            for path in a:
                if path.startswith("sectors/") or path == "presets.json":
                    self.assertEqual(a[path], b[path])

    def test_duplicate_keys_and_incomplete_source_rejected(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            source, presets = self.fixture(root, [record(), copy.deepcopy(record())])
            with self.assertRaisesRegex(ValueError, "duplicate building"):
                catalog.build(source, presets)
            source, presets = self.fixture(root, [record()])
            source.write_text(source.read_text().replace('"complete": true', '"complete": false'))
            with self.assertRaisesRegex(ValueError, "complete schema-1"):
                catalog.build(source, presets)


if __name__ == "__main__":
    unittest.main()
