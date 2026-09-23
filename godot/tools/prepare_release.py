#!/usr/bin/env python3
"""Plan a Godot release and configure the base pack for --export-patch."""

from __future__ import annotations

import argparse
import json
import re
import subprocess
from pathlib import Path

from release_packages import CATEGORIES, category_for_path


RUNTIME_SUFFIXES = {
    ".bin", ".gd", ".gdshader", ".glb", ".gltf", ".jpg", ".jpeg", ".json", ".pem",
    ".material", ".mesh", ".ogg", ".png", ".res", ".scn", ".svg",
    ".tres", ".tscn", ".wav", ".webp",
}
RESTART_PATHS = {"scripts/update_service.gd", "scripts/geographic_http.gd", "tools/sync_browser_assets.py"}
CATALOG_SOURCE_PATHS = {"public/san-diego-buildings.json", "public/_buildings.json"}
SHARED_ASSET_SOURCE_PATH = "public/models"
GEOGRAPHIC_SOURCE_PATHS = {
    "lib/game/geography.ts",
    "lib/game/geo-tile-geometry.ts",
    "lib/game/installation-footprints.ts",
    "lib/game/theater.ts",
    "package.json",
    "pnpm-lock.yaml",
    "pnpm-workspace.yaml",
}
GEOGRAPHIC_PROJECT_INPUT_PATHS = {
    "data/certificates/mozilla-ca.pem",
    "data/certificates/mozilla-ca-source.json",
    "data/theater.json",
    "tools/geographic/build-catalog.ts",
    "tools/geographic/format.ts",
}


def run(*args: str) -> str:
    return subprocess.check_output(args, text=True).strip()


def project_without_version(text: str) -> str:
    # git show output is stripped by run(); compare both sides consistently so
    # a normal trailing newline never turns a version-only change into a restart.
    return re.sub(r'^config/version=.*$', 'config/version="<release>"', text.strip(), flags=re.MULTILINE)


def append_patch_preset(project: Path, base_pack: Path) -> None:
    """Use identical import/export settings for full builds and their patches."""
    path = project / "export_presets.cfg"
    text = path.read_text(encoding="utf-8")
    general = re.search(r"\[preset\.0\]\s*\n(.*?)(?=\n\[)", text, re.DOTALL)
    options = re.search(r"\[preset\.0\.options\]\s*\n(.*?)(?=\n\[preset\.|\Z)", text, re.DOTALL)
    if not general or not options:
        raise ValueError("Windows export preset 0 is missing")
    index = max(int(value) for value in re.findall(r"\[preset\.(\d+)\]", text)) + 1
    settings = general.group(1)
    for key, value in {
        "name": '"Delta Patch"', "runnable": "false",
        "export_path": '"build/release/update.pck"',
        "patches": f"PackedStringArray({json.dumps(base_pack.resolve().as_posix())})",
    }.items():
        settings = re.sub(rf"^{key}=.*$", lambda _: f"{key}={value}", settings, flags=re.MULTILINE)
    with path.open("a", encoding="utf-8") as output:
        output.write(f"\n[preset.{index}]\n\n{settings.strip()}\n\n[preset.{index}.options]\n\n{options.group(1).strip()}\n")


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--repo", type=Path, required=True)
    parser.add_argument("--project", type=Path, required=True)
    parser.add_argument("--previous-ref", default="")
    parser.add_argument("--previous-version", default="", help="Published version; CI may stamp it without changing the tagged source")
    parser.add_argument("--base-pack", type=Path)
    parser.add_argument("--output", type=Path, required=True)
    args = parser.parse_args()
    repo = args.repo.resolve()
    project = args.project.resolve()
    project_prefix = project.relative_to(repo).as_posix().rstrip("/")
    source_prefix = "" if project_prefix == "." else project_prefix + "/"
    version_match = re.search(r'^config/version="([^"]+)"', (project / "project.godot").read_text(encoding="utf-8"), re.MULTILINE)
    if not version_match:
        raise SystemExit("project.godot has no config/version")
    version = version_match.group(1)
    changed: list[str] = []
    deleted: list[str] = []
    restart_reasons: list[str] = []
    previous_version = ""
    geographic_inputs_changed = False

    if not args.previous_ref:
        restart_reasons.append("This is the first updater-enabled release.")
    else:
        prior_project = run("git", "-C", str(repo), "show", f"{args.previous_ref}:{source_prefix}project.godot")
        prior_match = re.search(r'^config/version="([^"]+)"', prior_project, re.MULTILINE)
        previous_version = args.previous_version or (prior_match.group(1) if prior_match else "")
        lines = run("git", "-C", str(repo), "diff", "--name-status", args.previous_ref, "HEAD", "--", project_prefix).splitlines()
        for line in lines:
            fields = line.split("\t")
            status, repo_path = fields[0], fields[-1]
            relative = repo_path.removeprefix(source_prefix)
            if status.startswith("D"):
                deleted.append(relative)
                continue
            if relative == "project.godot":
                current_project = (project / "project.godot").read_text(encoding="utf-8")
                if project_without_version(prior_project) != project_without_version(current_project):
                    restart_reasons.append("Startup configuration changed.")
                continue
            if relative in GEOGRAPHIC_PROJECT_INPUT_PATHS:
                geographic_inputs_changed = True
            if relative in RESTART_PATHS or Path(relative).suffix.lower() in {".dll", ".exe", ".gdextension", ".so", ".dylib"}:
                restart_reasons.append(f"Startup or native file changed: {relative}")
            if Path(relative).suffix.lower() in RUNTIME_SUFFIXES:
                changed.append("res://" + relative)
        input_lines = run(
            "git", "-C", str(repo), "diff", "--name-only", args.previous_ref, "HEAD", "--",
            *sorted(CATALOG_SOURCE_PATHS | GEOGRAPHIC_SOURCE_PATHS),
        ).splitlines()
        shared_asset_lines = run(
            "git", "-C", str(repo), "diff", "--name-only", args.previous_ref, "HEAD", "--",
            SHARED_ASSET_SOURCE_PATH,
        ).splitlines()
        if any(path in CATALOG_SOURCE_PATHS for path in input_lines):
            restart_reasons.append("The generated San Diego building catalog changed.")
        if any(path in GEOGRAPHIC_SOURCE_PATHS for path in input_lines):
            geographic_inputs_changed = True
        if shared_asset_lines:
            restart_reasons.append("Shared browser vehicle assets changed and were resynchronized into the native build.")
        if geographic_inputs_changed:
            restart_reasons.append("The generated global geographic warm cache changed.")
        if deleted:
            restart_reasons.append("Resources were deleted and cannot be removed by an overlay pack.")

    live_patch = bool(args.previous_ref and previous_version and changed and not restart_reasons and args.base_pack and args.base_pack.is_file())
    plan = {
        "version": version,
        "source_commit": run("git", "-C", str(repo), "rev-parse", "HEAD"),
        "previous_version": previous_version,
        "live_patch": live_patch,
        "requires_restart": not live_patch,
        "files": sorted(set(changed)),
        "deleted": sorted(deleted),
        "restart_reasons": restart_reasons,
        "packages": [{"category": category, "filename": f"update-{category}.pck", "files": sorted(path for path in set(changed) if category_for_path(path) == category)} for category in CATEGORIES],
    }
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(json.dumps(plan, indent=2) + "\n", encoding="utf-8")

    if live_patch:
        append_patch_preset(project, args.base_pack)


if __name__ == "__main__":
    main()

