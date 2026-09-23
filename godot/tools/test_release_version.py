"""Regression checks for commits that keep the previous source version."""

from __future__ import annotations

import json
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path

from select_release_version import REQUIRED_ASSETS, choose_release


TOOLS = Path(__file__).resolve().parent
OLD_SHA = "2" * 40
NEW_SHA = "6" * 40


def release(version: str, sha: str = OLD_SHA, **extra: object) -> dict:
    return {"tag_name": f"godot-v{version}", "target_commitish": sha,
            "assets": [{"name": name} for name in REQUIRED_ASSETS], **extra}


class ReleaseVersionTest(unittest.TestCase):
    def test_changed_commit_without_version_bump_publishes_new_update(self) -> None:
        result = choose_release("0.2.20", [release("0.2.20")], NEW_SHA)
        self.assertEqual(result, {"version": "0.2.21", "tag": "godot-v0.2.21", "exists": "false",
                                  "previous_tag": "godot-v0.2.20", "previous_version": "0.2.20"})

    def test_repeated_commit_is_idempotent_only_after_assets_publish(self) -> None:
        result = choose_release("0.2.20", [release("0.2.21", NEW_SHA)], NEW_SHA)
        self.assertEqual(result["version"], "0.2.21")
        self.assertEqual(result["exists"], "true")
        incomplete = release("0.2.21", NEW_SHA, assets=[])
        result = choose_release("0.2.20", [release("0.2.20"), incomplete], NEW_SHA)
        self.assertEqual(result["exists"], "false")
        self.assertEqual(result["version"], "0.2.22")
        self.assertEqual(result["previous_version"], "0.2.20")

    def test_manual_bump_and_first_release_are_preserved(self) -> None:
        self.assertEqual(choose_release("0.3.0", [release("0.2.20")], NEW_SHA)["version"], "0.3.0")
        result = choose_release("0.2.20", [], NEW_SHA)
        self.assertEqual(result["version"], "0.2.20")
        self.assertEqual(result["previous_tag"], "")

    def test_versions_are_sorted_numerically_not_by_release_creation_order(self) -> None:
        result = choose_release("0.2.8", [release("0.2.9"), release("0.2.20"), release("0.2.11")], NEW_SHA)
        self.assertEqual(result["version"], "0.2.21")
        self.assertEqual(result["previous_version"], "0.2.20")

    def test_draft_versions_are_reserved_but_not_used_as_installed_baseline(self) -> None:
        result = choose_release("0.2.20", [release("0.2.20"), release("0.2.21", draft=True)], NEW_SHA)
        self.assertEqual(result["version"], "0.2.22")
        self.assertEqual(result["previous_version"], "0.2.20")

    def test_stamp_updates_runtime_version_and_handles_paginated_api_output(self) -> None:
        with tempfile.TemporaryDirectory() as temp:
            root = Path(temp)
            project = root / "project.godot"
            project.write_text('config_version=5\n[application]\nconfig/version="0.2.20"\n')
            releases = root / "releases.json"
            releases.write_text(json.dumps([[release("0.2.20")], [release("0.2.9")]]))
            output = root / "github-output.txt"
            subprocess.run([sys.executable, str(TOOLS / "select_release_version.py"), "--project", temp,
                            "--releases", str(releases), "--source-sha", NEW_SHA, "--github-output", str(output)],
                           check=True, capture_output=True)
            self.assertIn('config/version="0.2.21"', project.read_text())
            self.assertIn("exists=false\n", output.read_text())

    def test_delta_uses_published_version_when_tagged_source_version_is_older(self) -> None:
        with tempfile.TemporaryDirectory() as temp:
            root = Path(temp)
            project = root / "godot"
            (project / "scripts").mkdir(parents=True)
            (project / "project.godot").write_text('config_version=5\n[application]\nconfig/version="0.2.20"\n')
            (project / "scripts/main.gd").write_text("extends Node\n")
            (project / "export_presets.cfg").write_text('[preset.0]\nname="Windows Desktop"\nrunnable=true\nexport_path="build/windows/GridCommand.exe"\npatches=PackedStringArray()\n[preset.0.options]\n')

            def git(*args: str) -> str:
                return subprocess.check_output(["git", "-C", temp, *args], text=True, stderr=subprocess.DEVNULL).strip()

            git("init")
            git("config", "user.name", "Release test")
            git("config", "user.email", "test@example.invalid")
            git("config", "commit.gpgsign", "false")
            git("add", ".")
            git("commit", "-m", "old source stamped as 0.2.21 by CI")
            previous = git("rev-parse", "HEAD")
            (project / "scripts/main.gd").write_text("extends Node\nconst UPDATED = true\n")
            git("add", ".")
            git("commit", "-m", "new content without source version bump")
            (project / "project.godot").write_text('config_version=5\n[application]\nconfig/version="0.2.22"\n')
            base = root / "base.pck"
            base.write_bytes(b"base")
            plan_path = root / "plan.json"
            subprocess.run([sys.executable, str(TOOLS / "prepare_release.py"), "--repo", temp, "--project", str(project),
                            "--previous-ref", previous, "--previous-version", "0.2.21", "--base-pack", str(base),
                            "--output", str(plan_path)], check=True, capture_output=True)
            plan = json.loads(plan_path.read_text())
            self.assertTrue(plan["live_patch"])
            self.assertEqual(plan["previous_version"], "0.2.21")
            self.assertEqual(plan["version"], "0.2.22")
            self.assertEqual(plan["source_commit"], git("rev-parse", "HEAD"))


if __name__ == "__main__":
    unittest.main()

