#!/usr/bin/env python3
"""Normalize a repainted atlas to an existing texture's image contract."""

from __future__ import annotations

import argparse
from pathlib import Path

from PIL import Image


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser()
    parser.add_argument("--contract", required=True, type=Path, help="Original production atlas")
    parser.add_argument("--candidate", required=True, type=Path, help="Repainted candidate")
    parser.add_argument("--output", required=True, type=Path, help="Normalized PNG path")
    parser.add_argument("--colors", type=int, default=0, help="Optional 2-256 color palette limit")
    return parser.parse_args()


def main() -> None:
    args = parse_args()
    if args.colors and not 2 <= args.colors <= 256:
        raise SystemExit("--colors must be 0 or an integer from 2 through 256")

    with Image.open(args.contract) as contract_image, Image.open(args.candidate) as candidate_image:
        size = contract_image.size
        mode = contract_image.mode
        candidate = candidate_image.convert(mode)
        if candidate.size != size:
            candidate = candidate.resize(size, Image.Resampling.LANCZOS)
        if args.colors:
            candidate = candidate.convert("RGB").quantize(
                colors=args.colors, method=Image.Quantize.MEDIANCUT
            ).convert(mode)
        args.output.parent.mkdir(parents=True, exist_ok=True)
        candidate.save(args.output, format="PNG", optimize=True)

    with Image.open(args.output) as result:
        if result.size != size or result.mode != mode:
            raise SystemExit("normalized atlas does not match contract")
        result.verify()
    print(f"normalized {args.output} as {mode} {size[0]}x{size[1]}")


if __name__ == "__main__":
    main()
