"""Release contract tests, plus a real Godot export/mount test when GODOT is set."""

from __future__ import annotations

import hashlib
import json
import os
import struct
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path

from prepare_release import append_patch_preset
from release_packages import CATEGORIES, category_for_path, read_pck, split_packages


TOOLS = Path(__file__).resolve().parent
PRESET = (TOOLS.parent / "export_presets.cfg").read_text(encoding="utf-8").split("[preset.1]")[0]


def fixture_pack(path: Path, files: dict[str, bytes], version: int = 2) -> None:
    """Independent small PCK fixtures for both directory layouts."""
    file_base = 4096
    with path.open("wb") as output:
        output.write(struct.pack("<4sIIIIIQ", b"GDPC", version, 4, 7, 2, 2, file_base))
        if version >= 3:
            output.write(struct.pack("<Q", 128))
            output.write(b"\0" * (128 - output.tell()))
        else:
            output.write(b"\0" * 64)
        output.write(struct.pack("<I", len(files)))
        offset = 0
        for name, payload in files.items():
            encoded = name.encode()
            output.write(struct.pack("<I", len(encoded)) + encoded)
            output.write(struct.pack("<QQ16sI", offset, len(payload), hashlib.md5(payload).digest(), 0))
            offset += len(payload)
        output.write(b"\0" * (file_base - output.tell()))
        for payload in files.values():
            output.write(payload)


def unpack(path: Path) -> dict[str, bytes]:
    _, entries = read_pck(path)
    with path.open("rb") as source:
        result = {}
        for entry in entries:
            source.seek(entry.offset)
            result[entry.path] = source.read(entry.size)
        return result


class ReleasePackagesTest(unittest.TestCase):
    def setUp(self) -> None:
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.root = Path(self.temp.name)

    def test_categories_follow_asset_type_before_folder(self) -> None:
        cases = {
            "res://assets/models/tank.png.import": "textures",
            "res://.godot/imported/tank.png-" + "a" * 32 + ".s3tc.ctex": "textures",
            "res://.godot/imported/tank.glb-" + "b" * 32 + ".scn": "models",
            "res://assets/models/vehicle.mesh": "models",
            "res://assets/models/body.tscn.remap": "models",
            "res://scripts/main.gdc": "gameplay",
            "res://data/generated/geographic/tile.bin": "gameplay",
            "res://shaders/terrain.gdshader": "gameplay",
        }
        for path, category in cases.items():
            with self.subTest(path=path):
                self.assertEqual(category_for_path(path), category)

    def test_partition_is_disjoint_and_preserves_bytes_v2_v3_v4(self) -> None:
        files = {"assets/models/tank.glb": b"model", "assets/models/tank.png": b"texture", "scripts/main.gd": b"logic"}
        for version in (2, 3, 4):
            with self.subTest(version=version):
                source = self.root / f"combined-{version}.pck"
                fixture_pack(source, files, version)
                original = source.read_bytes()
                packages = split_packages(source, self.root, "https://example.test/release")
                self.assertEqual([p["category"] for p in packages], list(CATEGORIES))
                all_files = {}
                for package in packages:
                    output = self.root / f"update-{package['category']}.pck"
                    payload = output.read_bytes()
                    resources = unpack(output)
                    self.assertFalse(all_files.keys() & resources.keys())
                    all_files.update(resources)
                    self.assertEqual(package["files"], ["res://" + path for path in sorted(resources)])
                    self.assertEqual(package["size_bytes"], len(payload))
                    self.assertEqual(package["sha256"], hashlib.sha256(payload).hexdigest())
                    self.assertEqual(output.with_suffix(".pck.sha256").read_text().strip(), f"{package['sha256']}  {output.name}")
                self.assertEqual(all_files, files)
                self.assertEqual(source.read_bytes(), original)

    def test_empty_categories_remain_valid_and_bootstrap_metadata_is_omitted_live(self) -> None:
        source = self.root / "update.pck"
        fixture_pack(source, {"res://scripts/main.gd": b"new logic", "project.binary": b"version bump"})
        packages = split_packages(source, self.root, "https://example.test", live_patch=True)
        self.assertEqual(packages[0]["files"], [])
        self.assertEqual(packages[1]["files"], [])
        self.assertEqual(unpack(self.root / "update-models.pck"), {})
        self.assertEqual(packages[2]["files"], ["res://scripts/main.gd"])

    def test_unchanged_scene_remap_classifies_changed_binary_from_full_pack(self) -> None:
        full = self.root / "full.pck"
        patch = self.root / "patch.pck"
        target = ".godot/exported/123/export-abcd-vehicle.scn"
        fixture_pack(full, {"assets/models/vehicle.tscn.remap": f'[remap]\npath="res://{target}"\n'.encode(), target: b"scene"})
        fixture_pack(patch, {target: b"scene"})
        packages = split_packages(patch, self.root, "https://example.test", full)
        self.assertEqual(packages[0]["files"], ["res://" + target])
        self.assertEqual(packages[2]["files"], [])

    def test_corruption_and_unsupported_flags_stop_release(self) -> None:
        source = self.root / "bad.pck"
        fixture_pack(source, {"main.gd": b"good"})
        with source.open("r+b") as output:
            output.seek(4096)
            output.write(b"evil")
        with self.assertRaisesRegex(ValueError, "checksum"):
            split_packages(source, self.root, "https://example.test")
        for field_offset, value in ((20, 1), (4, 99)):
            fixture_pack(source, {})
            with source.open("r+b") as output:
                output.seek(field_offset)
                output.write(struct.pack("<I", value))
            with self.assertRaises(ValueError):
                read_pck(source)

    def test_patch_preset_preserves_full_build_filters(self) -> None:
        (self.root / "export_presets.cfg").write_text(PRESET)
        append_patch_preset(self.root, self.root / "prior.pck")
        text = (self.root / "export_presets.cfg").read_text()
        full, patch = text.split("[preset.1]")
        for line in full.splitlines():
            if line.startswith(("include_filter=", "exclude_filter=", "texture_format/", "script_export_mode=")):
                self.assertIn(line, patch)
        self.assertIn('name="Delta Patch"', patch)
        self.assertIn('patches=PackedStringArray("', patch)

    def test_planner_tracks_root_and_nested_projects_and_guards_startup_changes(self) -> None:
        for nested in (False, True):
            with self.subTest(nested=nested):
                repo = self.root / ("nested" if nested else "standalone")
                project = repo / "godot" if nested else repo
                (project / "scripts").mkdir(parents=True)
                (project / "assets/models").mkdir(parents=True)
                (project / "export_presets.cfg").write_text(PRESET)
                (project / "project.godot").write_text('config_version=5\n[application]\nconfig/version="1.0"\n')
                (project / "scripts/main.gd").write_text("extends Node\n")
                (project / "scripts/update_service.gd").write_text("extends Node\n")
                (project / "assets/models/unit.png").write_bytes(b"texture")
                (project / "assets/models/unit.glb").write_bytes(b"model")

                def git(*args: str) -> str:
                    return subprocess.check_output(["git", "-C", str(repo), *args], text=True, stderr=subprocess.DEVNULL).strip()

                git("init")
                git("config", "user.name", "Release test")
                git("config", "user.email", "release-test@example.invalid")
                git("config", "commit.gpgsign", "false")
                git("add", ".")
                git("commit", "-m", "baseline")
                previous = git("rev-parse", "HEAD")
                (project / "project.godot").write_text('config_version=5\n[application]\nconfig/version="1.1"\n')
                (project / "scripts/main.gd").write_text("extends Node\nconst VALUE = 2\n")
                (project / "assets/models/unit.png").write_bytes(b"new texture")
                (project / "assets/models/unit.glb").write_bytes(b"new model")
                git("add", ".")
                git("commit", "-m", "content update")
                base = self.root / "base.pck"
                base.write_bytes(b"base")
                output = self.root / "release-plan.json"
                command = [sys.executable, str(TOOLS / "prepare_release.py"), "--repo", str(repo), "--project", str(project), "--previous-ref", previous, "--base-pack", str(base), "--output", str(output)]
                subprocess.run(command, check=True, capture_output=True)
                plan = json.loads(output.read_text())
                self.assertTrue(plan["live_patch"])
                self.assertEqual(plan["previous_version"], "1.0")
                self.assertTrue(all(item["files"] for item in plan["packages"]))
                self.assertNotIn("res://project.godot", plan["files"])
                (project / "scripts/update_service.gd").write_text("extends Node\nconst UPDATED = true\n")
                git("add", "scripts/update_service.gd" if not nested else "godot/scripts/update_service.gd")
                git("commit", "-m", "startup update")
                subprocess.run(command, check=True, capture_output=True)
                plan = json.loads(output.read_text())
                self.assertFalse(plan["live_patch"])
                self.assertTrue(plan["requires_restart"])
                self.assertTrue(any("update_service.gd" in reason for reason in plan["restart_reasons"]))

    def test_finalize_legacy_edge_packages_hashes_and_native_size(self) -> None:
        patch = self.root / "update.pck"
        fixture_pack(patch, {"scripts/main.gd": b"updated", "project.binary": b"new version"})
        plan = {"version": "0.2.9", "previous_version": "0.2.8", "live_patch": True, "requires_restart": False, "files": ["res://scripts/main.gd"]}
        (self.root / "plan.json").write_text(json.dumps(plan))
        previous = {"app_id": "grid-command-godot", "patches": [{"from_version": "0.2.7", "to_version": "0.2.8", "url": "old"}]}
        (self.root / "previous.json").write_text(json.dumps(previous))
        (self.root / "GridCommand-Windows-x86_64.zip").write_bytes(b"native zip")
        subprocess.run([sys.executable, str(TOOLS / "finalize_release.py"), "--plan", str(self.root / "plan.json"), "--patch", str(patch), "--previous-manifest", str(self.root / "previous.json"), "--output", str(self.root / "godot-update.json")], check=True)
        manifest = json.loads((self.root / "godot-update.json").read_text())
        self.assertEqual(manifest["schema"], 1)
        self.assertEqual(manifest["patches"][0], previous["patches"][0])
        edge = manifest["patches"][-1]
        self.assertTrue(edge["url"].endswith("/update.pck"))
        self.assertEqual(edge["sha256"], hashlib.sha256(patch.read_bytes()).hexdigest())
        self.assertEqual(len(edge["packages"]), 3)
        self.assertEqual(manifest["download_size_bytes"], 10)
        self.assertFalse(manifest["requires_restart"])

    def test_bootstrap_keeps_native_download_and_publishes_full_category_artifacts(self) -> None:
        full = self.root / "GridCommand.pck"
        fixture_pack(full, {"project.binary": b"startup", "assets/models/unit.glb": b"model"})
        plan = {"version": "0.2.9", "live_patch": False, "requires_restart": True}
        (self.root / "plan.json").write_text(json.dumps(plan))
        subprocess.run([sys.executable, str(TOOLS / "finalize_release.py"), "--plan", str(self.root / "plan.json"), "--patch", str(self.root / "unused.pck"), "--full-pack", str(full), "--output", str(self.root / "godot-update.json")], check=True)
        manifest = json.loads((self.root / "godot-update.json").read_text())
        self.assertTrue(manifest["requires_restart"])
        self.assertEqual(manifest["patches"], [])
        self.assertEqual(len(manifest["bootstrap_packages"]), 3)
        self.assertTrue(manifest["download_url"].endswith("/GridCommand-Windows-x86_64.zip"))
        self.assertIn("project.binary", unpack(self.root / "update-gameplay.pck"))


@unittest.skipUnless(os.environ.get("GODOT"), "Set GODOT to test real patch export and package mounting")
class GodotExportIntegrationTest(unittest.TestCase):
    def test_changed_resources_only_and_mount_all_three_categories(self) -> None:
        with tempfile.TemporaryDirectory() as temp:
            root = Path(temp)
            project = root / "project"
            project.mkdir()
            (project / "assets/models").mkdir(parents=True)
            (project / "data").mkdir()
            (project / "project.godot").write_text('config_version=5\n[application]\nconfig/name="Package test"\nconfig/version="1.0"\n[rendering]\nrenderer/rendering_method="gl_compatibility"\n')
            (project / "export_presets.cfg").write_text(PRESET)
            (project / "data/stable.json").write_text(json.dumps({"unchanged": "x" * 100000}))
            logic = project / "logic.gd"
            logic.write_text('extends Node\nconst VALUE = 1\n')
            texture = project / "assets/models/unit.svg"
            texture.write_text('<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16"><rect width="16" height="16" fill="red"/></svg>')
            model = project / "assets/models/unit.tscn"
            model.write_text('[gd_scene load_steps=2 format=3]\n[ext_resource type="Texture2D" path="res://assets/models/unit.svg" id="1"]\n[node name="Unit" type="Sprite2D"]\ntexture = ExtResource("1")\nscale = Vector2(1, 1)\n')

            def godot(*args: str, path: Path = project) -> str:
                result = subprocess.run([os.environ["GODOT"], "--headless", "--path", str(path), *args], capture_output=True, text=True, timeout=90)
                self.assertEqual(result.returncode, 0, result.stdout + result.stderr)
                self.assertNotIn("SCRIPT ERROR", result.stdout + result.stderr)
                return result.stdout + result.stderr

            base = root / "base.pck"
            godot("--export-pack", "Windows Desktop", str(base))
            logic.write_text('extends Node\nconst VALUE = 2\n')
            texture.write_text(texture.read_text().replace('fill="red"', 'fill="blue"'))
            model.write_text(model.read_text().replace("Vector2(1, 1)", "Vector2(2, 2)"))
            append_patch_preset(project, base)
            full = root / "full.pck"
            patch = root / "update.pck"
            godot("--export-pack", "Windows Desktop", str(full))
            godot("--export-patch", "Delta Patch", str(patch))
            self.assertNotIn("res://data/stable.json", {"res://" + name.removeprefix("res://") for name in unpack(patch)})
            self.assertLess(patch.stat().st_size, full.stat().st_size / 2)
            packages = split_packages(patch, root, "https://example.test", full, live_patch=True)
            self.assertTrue(all(package["files"] for package in packages))
            expected = {}
            for category in CATEGORIES:
                _, entries = read_pck(root / f"update-{category}.pck")
                for entry in entries:
                    expected["res://" + entry.path.removeprefix("res://")] = entry.md5.hex()
            self.assertEqual(len(expected), sum(len(p["files"]) for p in packages))
            (root / "expected.json").write_text(json.dumps(expected))
            runner = root / "runner"
            runner.mkdir()
            (runner / "project.godot").write_text("config_version=5\n")
            (runner / "verify.gd").write_text('''extends SceneTree
func _initialize() -> void:
    var args := OS.get_cmdline_user_args()
    for pack in args.slice(1):
        if not ProjectSettings.load_resource_pack(pack):
            push_error("Cannot mount " + pack)
            quit(1)
            return
    var expected: Dictionary = JSON.parse_string(FileAccess.get_file_as_string(args[0]))
    for path in expected:
        if FileAccess.get_md5(path) != expected[path]:
            push_error("Resource bytes differ: " + path)
            quit(1)
            return
    print("GRID_COMMAND_RELEASE_PACKAGES_OK")
    quit(0)
''')
            output = godot("--script", str(runner / "verify.gd"), "--", str(root / "expected.json"), str(base), *(str(root / f"update-{category}.pck") for category in CATEGORIES), path=runner)
            self.assertIn("GRID_COMMAND_RELEASE_PACKAGES_OK", output)


if __name__ == "__main__":
    unittest.main()
