"""Derive the FQ-44 real-time PBR maps from its locked 1024 color atlas.

The color atlas remains the source of truth.  This script creates subtle tangent
normal detail, separate roughness and metalness maps, and an engine-ready packed
ORM map (R=ambient occlusion, G=roughness, B=metalness).
"""

from __future__ import annotations

import hashlib
import json
from pathlib import Path

import numpy as np
from PIL import Image, ImageFilter


ROOT = Path(__file__).resolve().parents[3]
SOURCE = ROOT / "public" / "models" / "fighter_albedo.png"
OUTPUTS = {
    "normal": ROOT / "public" / "models" / "fighter_normal.png",
    "roughness": ROOT / "public" / "models" / "fighter_roughness.png",
    "metalness": ROOT / "public" / "models" / "fighter_metalness.png",
    "orm": ROOT / "public" / "models" / "fighter_orm.png",
}
MANIFEST = ROOT / "assets" / "blender" / "vehicles" / "fighter_pbr_manifest.json"


def smooth(array: np.ndarray, radius: float) -> np.ndarray:
    image = Image.fromarray(np.uint8(np.clip(array, 0, 1) * 255), "L")
    return np.asarray(image.filter(ImageFilter.GaussianBlur(radius)), dtype=np.float32) / 255.0


def save_gray(path: Path, data: np.ndarray) -> None:
    Image.fromarray(np.uint8(np.clip(data, 0, 1) * 255), "L").save(path, optimize=True)


def digest(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def main() -> None:
    rgb = np.asarray(Image.open(SOURCE).convert("RGB"), dtype=np.float32) / 255.0
    if rgb.shape[:2] != (1024, 1024):
        raise ValueError(f"Expected a 1024x1024 atlas, got {rgb.shape[1]}x{rgb.shape[0]}")

    # Work in linear luminance so paint changes do not emboss the surface heavily.
    linear = np.where(rgb <= 0.04045, rgb / 12.92, ((rgb + 0.055) / 1.055) ** 2.4)
    luma = linear @ np.array([0.2126, 0.7152, 0.0722], dtype=np.float32)
    broad = smooth(luma, 2.2)
    fine = smooth(luma, 0.55)
    height = np.clip(0.5 + (fine - broad) * 0.34, 0.35, 0.65)
    gy, gx = np.gradient(height)
    strength = 18.0
    nx, ny = -gx * strength, -gy * strength
    nz = np.ones_like(nx)
    length = np.sqrt(nx * nx + ny * ny + nz * nz)
    normal = np.stack((nx / length, -ny / length, nz / length), axis=-1) * 0.5 + 0.5
    Image.fromarray(np.uint8(np.clip(normal, 0, 1) * 255), "RGB").save(OUTPUTS["normal"], optimize=True)

    local_variation = np.clip(np.abs(fine - broad) * 4.5, 0, 1)
    saturation = rgb.max(axis=-1) - rgb.min(axis=-1)
    near_black = luma < 0.035
    bright_detail = luma > 0.60
    roughness = np.clip(0.68 + local_variation * 0.16 - luma * 0.12, 0.42, 0.91)
    roughness = np.where(near_black, 0.36, roughness)
    roughness = np.where(bright_detail, np.minimum(roughness, 0.52), roughness)
    save_gray(OUTPUTS["roughness"], roughness)

    gray_metal = (saturation < 0.14) & (luma > 0.045)
    metalness = np.where(gray_metal, 0.72, 0.08)
    metalness = np.where(bright_detail & (saturation < 0.08), 0.48, metalness)
    metalness = np.where(near_black, 0.06, metalness)
    save_gray(OUTPUTS["metalness"], metalness)

    orm = np.stack((np.ones_like(roughness), roughness, metalness), axis=-1)
    Image.fromarray(np.uint8(np.clip(orm, 0, 1) * 255), "RGB").save(OUTPUTS["orm"], optimize=True)

    manifest = {
        "asset": "FQ-44 Fury",
        "source": str(SOURCE.relative_to(ROOT)).replace("\\", "/"),
        "resolution": [1024, 1024],
        "maps": {
            name: {
                "path": str(path.relative_to(ROOT)).replace("\\", "/"),
                "sha256": digest(path),
                "color_space": "non-color",
            }
            for name, path in OUTPUTS.items()
        },
        "orm_channels": {"r": "ambient_occlusion", "g": "roughness", "b": "metalness"},
        "normal_convention": "OpenGL +Y",
        "method": "Deterministic local-frequency derivation from the locked FQ-44 color atlas.",
    }
    MANIFEST.write_text(json.dumps(manifest, indent=2) + "\n", encoding="utf-8")


if __name__ == "__main__":
    main()
