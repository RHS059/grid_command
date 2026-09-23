#!/usr/bin/env python3
"""Stamp a unique published version without requiring a manual source bump."""

from __future__ import annotations

import argparse
import json
import os
import re
from pathlib import Path


VERSION = re.compile(r"^(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)$")
REQUIRED_ASSETS = {"godot-update.json", "GridCommand-Windows-x86_64.zip", "release-plan.json"} | {
    f"update-{category}.pck{suffix}"
    for category in ("models", "textures", "gameplay") for suffix in ("", ".sha256")
}


def version_key(value: str) -> tuple[int, int, int]:
    match = VERSION.fullmatch(value)
    if not match:
        raise ValueError(f"A stable three-part release version is required: {value}")
    return tuple(int(part) for part in match.groups())


def choose_release(requested: str, releases: list[dict], source_sha: str) -> dict:
    requested_key = version_key(requested)
    published = []
    for release in releases:
        tag = str(release.get("tag_name", ""))
        version = tag.removeprefix("godot-v")
        if not tag.startswith("godot-v") or not VERSION.fullmatch(version):
            continue
        # All tags reserve their version, including drafts and partial uploads.
        complete = (not release.get("draft", False) and not release.get("prerelease", False)
                    and REQUIRED_ASSETS.issubset({asset.get("name") for asset in release.get("assets", [])}))
        published.append((version_key(version), version, tag, release, complete))
    published.sort(key=lambda item: item[0], reverse=True)
    complete = [item for item in published if item[4]]
    # Only the same source commit with complete update assets is an idempotent rerun.
    for _, version, tag, release, _ in complete:
        if release.get("target_commitish") == source_sha:
            return {"version": version, "tag": tag, "exists": "true", "previous_tag": "", "previous_version": ""}
    selected = requested_key
    if published and selected <= published[0][0]:
        major, minor, patch = published[0][0]
        selected = (major, minor, patch + 1)
    version = ".".join(map(str, selected))
    previous = complete[0] if complete else None
    return {"version": version, "tag": f"godot-v{version}", "exists": "false",
            "previous_tag": previous[2] if previous else "",
            "previous_version": previous[1] if previous else ""}


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--project", type=Path, required=True)
    parser.add_argument("--releases", type=Path, required=True)
    parser.add_argument("--source-sha", required=True)
    parser.add_argument("--github-output", type=Path)
    args = parser.parse_args()
    if not re.fullmatch(r"[0-9a-f]{40}", args.source_sha):
        raise SystemExit("The source commit must be a full Git SHA.")
    path = args.project / "project.godot"
    text = path.read_text(encoding="utf-8")
    match = re.search(r'^config/version="([^"]+)"$', text, re.MULTILINE)
    if not match:
        raise SystemExit("project.godot has no config/version")
    releases = json.loads(args.releases.read_text(encoding="utf-8"))
    if not isinstance(releases, list):
        raise SystemExit("Expected the GitHub releases list.")
    # gh api --paginate --slurp returns a list of page arrays.
    if releases and isinstance(releases[0], list):
        releases = [release for page in releases for release in page]
    result = choose_release(match.group(1), releases, args.source_sha)
    text = text[:match.start(1)] + result["version"] + text[match.end(1):]
    path.write_text(text, encoding="utf-8", newline="\n")
    if args.github_output:
        with args.github_output.open("a", encoding="utf-8") as output:
            for key, value in result.items():
                output.write(f"{key}={value}\n")
    print(json.dumps({**result, "source_commit": args.source_sha}, indent=2))
    summary = os.environ.get("GITHUB_STEP_SUMMARY")
    if summary:
        with open(summary, "a", encoding="utf-8") as output:
            action = "Already published" if result["exists"] == "true" else "Publish"
            output.write(f"{action}: **{result['version']}**, source `{args.source_sha}`.\n")


if __name__ == "__main__":
    main()

