#!/usr/bin/env python3
"""Build the public update manifest after export artifacts exist."""

from __future__ import annotations

import argparse
import hashlib
import json
from pathlib import Path

from release_packages import artifact_metadata, split_packages


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--plan", type=Path, required=True)
    parser.add_argument("--patch", type=Path, required=True)
    parser.add_argument("--full-pack", type=Path, help="Full build PCK; split into category artifacts for bootstrap releases")
    parser.add_argument("--previous-manifest", type=Path)
    parser.add_argument("--output", type=Path, required=True)
    args = parser.parse_args()
    plan = json.loads(args.plan.read_text(encoding="utf-8"))
    old_patches = []
    if args.previous_manifest and args.previous_manifest.exists():
        try:
            previous = json.loads(args.previous_manifest.read_text(encoding="utf-8"))
            if previous.get("app_id") == "grid-command-godot" and isinstance(previous.get("patches"), list):
                old_patches = previous["patches"]
        except (OSError, json.JSONDecodeError):
            pass
    patches = old_patches
    tag = f"godot-v{plan['version']}"
    base = f"https://github.com/RHS059/grid_command/releases/download/{tag}"
    packages = []
    if plan["live_patch"]:
        packages = split_packages(args.patch, args.output.parent, base, args.full_pack, live_patch=True)
        patches = [p for p in patches if not (p.get("from_version") == plan["previous_version"] and p.get("to_version") == plan["version"])]
        patches.append({
            "from_version": plan["previous_version"],
            "to_version": plan["version"],
            "content_mode": "changed-files-only",
            **artifact_metadata(args.patch, base),
            "files": plan["files"],
            "packages": packages,
        })
    elif args.full_pack:
        packages = split_packages(args.full_pack, args.output.parent, base)
    manifest = {
        "schema": 1,
        "app_id": "grid-command-godot",
        "version": plan["version"],
        "min_runtime_version": "4.7.2",
        "requires_restart": plan["requires_restart"],
        "download_url": f"https://github.com/RHS059/grid_command/releases/download/godot-v{plan['version']}/GridCommand-Windows-x86_64.zip",
        "patches": patches,
    }
    if not plan["live_patch"] and packages:
        # Informational full-content artifacts. Existing clients must still use
        # download_url to replace startup scripts and the executable together.
        manifest["bootstrap_packages"] = packages
    native_zip = args.output.parent / "GridCommand-Windows-x86_64.zip"
    if native_zip.is_file():
        with native_zip.open("rb") as source:
            manifest["download_sha256"] = hashlib.file_digest(source, "sha256").hexdigest()
        manifest["download_size_bytes"] = native_zip.stat().st_size
    args.output.write_text(json.dumps(manifest, indent=2) + "\n", encoding="utf-8")


if __name__ == "__main__":
    main()
