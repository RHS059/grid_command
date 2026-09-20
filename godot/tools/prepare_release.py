#!/usr/bin/env python3
"""Plan a Godot release and create an explicit changed-resource export preset."""

from __future__ import annotations

import argparse
import json
import re
import subprocess
from pathlib import Path


RUNTIME_SUFFIXES = {
    ".gd", ".gdshader", ".glb", ".gltf", ".jpg", ".jpeg", ".json",
    ".material", ".mesh", ".ogg", ".png", ".res", ".scn", ".svg",
    ".tres", ".tscn", ".wav", ".webp",
}
RESTART_PATHS = {"scripts/update_service.gd"}


def run(*args: str) -> str:
    return subprocess.check_output(args, text=True).strip()


def project_without_version(text: str) -> str:
    return re.sub(r'^config/version=.*$', 'config/version="<release>"', text, flags=re.MULTILINE)


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--repo", type=Path, required=True)
    parser.add_argument("--project", type=Path, required=True)
    parser.add_argument("--previous-ref", default="")
    parser.add_argument("--base-pack", type=Path)
    parser.add_argument("--output", type=Path, required=True)
    args = parser.parse_args()
    repo = args.repo.resolve()
    project = args.project.resolve()
    project_prefix = project.relative_to(repo).as_posix().rstrip("/")
    version_match = re.search(r'^config/version="([^"]+)"', (project / "project.godot").read_text(encoding="utf-8"), re.MULTILINE)
    if not version_match:
        raise SystemExit("project.godot has no config/version")
    version = version_match.group(1)
    changed: list[str] = []
    deleted: list[str] = []
    restart_reasons: list[str] = []
    previous_version = ""

    if not args.previous_ref:
        restart_reasons.append("This is the first updater-enabled release.")
    else:
        prior_project = run("git", "-C", str(repo), "show", f"{args.previous_ref}:{project_prefix}/project.godot")
        prior_match = re.search(r'^config/version="([^"]+)"', prior_project, re.MULTILINE)
        previous_version = prior_match.group(1) if prior_match else ""
        lines = run("git", "-C", str(repo), "diff", "--name-status", args.previous_ref, "HEAD", "--", project_prefix).splitlines()
        for line in lines:
            fields = line.split("\t")
            status, repo_path = fields[0], fields[-1]
            relative = repo_path.removeprefix(project_prefix + "/")
            if status.startswith("D"):
                deleted.append(relative)
                continue
            if relative == "project.godot":
                current_project = (project / "project.godot").read_text(encoding="utf-8")
                if project_without_version(prior_project) != project_without_version(current_project):
                    restart_reasons.append("Startup configuration changed.")
                continue
            if relative in RESTART_PATHS or Path(relative).suffix.lower() in {".dll", ".exe", ".gdextension", ".so", ".dylib"}:
                restart_reasons.append(f"Startup or native file changed: {relative}")
            if Path(relative).suffix.lower() in RUNTIME_SUFFIXES:
                changed.append("res://" + relative)
        if deleted:
            restart_reasons.append("Resources were deleted and cannot be removed by an overlay pack.")

    live_patch = bool(args.previous_ref and previous_version and changed and not restart_reasons and args.base_pack and args.base_pack.is_file())
    plan = {
        "version": version,
        "previous_version": previous_version,
        "live_patch": live_patch,
        "requires_restart": not live_patch,
        "files": sorted(set(changed)),
        "deleted": sorted(deleted),
        "restart_reasons": restart_reasons,
    }
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(json.dumps(plan, indent=2) + "\n", encoding="utf-8")

    if live_patch:
        base_pack = args.base_pack.resolve().as_posix()
        with (project / "export_presets.cfg").open("a", encoding="utf-8") as preset:
            preset.write(f'''\n[preset.1]\n\nname="Delta Patch"\nplatform="Windows Desktop"\nrunnable=false\ncustom_features=""\nexport_filter="all_resources"\ninclude_filter=""\nexclude_filter=""\nexport_path="build/release/update.pck"\npatches=PackedStringArray("{base_pack}")\nencrypt_pck=false\nencrypt_directory=false\n\n[preset.1.options]\n\nbinary_format/embed_pck=false\ntexture_format/s3tc_bptc=true\ntexture_format/etc2_astc=false\nbinary_format/architecture="x86_64"\n''')


if __name__ == "__main__":
    main()
