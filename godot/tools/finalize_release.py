#!/usr/bin/env python3
"""Build the public update manifest after export artifacts exist."""

from __future__ import annotations

import argparse
import hashlib
import json
from pathlib import Path


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--plan", type=Path, required=True)
    parser.add_argument("--patch", type=Path, required=True)
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
    if plan["live_patch"]:
        payload = args.patch.read_bytes()
        digest = hashlib.sha256(payload).hexdigest()
        tag = f"godot-v{plan['version']}"
        base = f"https://github.com/RHS059/grid_command/releases/download/{tag}"
        patches = [p for p in patches if not (p.get("from_version") == plan["previous_version"] and p.get("to_version") == plan["version"])]
        patches.append({
            "from_version": plan["previous_version"],
            "to_version": plan["version"],
            "content_mode": "changed-files-only",
            "url": f"{base}/update.pck",
            "sha256": digest,
            "sha256_url": f"{base}/update.pck.sha256",
            "size_bytes": len(payload),
            "files": plan["files"],
        })
        args.patch.with_suffix(".pck.sha256").write_text(f"{digest}  update.pck\n", encoding="ascii")
    manifest = {
        "schema": 1,
        "app_id": "grid-command-godot",
        "version": plan["version"],
        "min_runtime_version": "4.7.2",
        "requires_restart": plan["requires_restart"],
        "download_url": "https://github.com/RHS059/grid_command/releases/latest",
        "patches": patches,
    }
    args.output.write_text(json.dumps(manifest, indent=2) + "\n", encoding="utf-8")


if __name__ == "__main__":
    main()
