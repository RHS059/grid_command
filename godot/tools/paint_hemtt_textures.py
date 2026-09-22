"""Paints the PS2-era HEMTT textures: a 512 atlas (body, chassis, metal,
canvas tiles, all seamless) and a
512 tire sheet laid out for Godot's CylinderMesh UVs (tread band on top, two wheel faces below).
Both sheets are palette-free: the atlas stores grey detail where 128 is each
tile's base colour, and the tire stores grey with a rim mask in alpha.
Team palettes (Street Fighter style swaps) are applied in the shaders.
Deterministic: python3 tools/paint_hemtt_textures.py"""
import numpy as np
from PIL import Image

OUT = "assets/textures/vehicles/"

def noise(size, scale, seed):
    # Seamless value noise: band-limited white noise via FFT.
    r = np.random.default_rng(seed).standard_normal((size, size))
    f = np.fft.fftfreq(size)
    k = np.sqrt(f[:, None] ** 2 + f[None, :] ** 2)
    spec = np.fft.fft2(r) * np.exp(-(k * scale) ** 2)
    n = np.real(np.fft.ifft2(spec))
    return (n - n.mean()) / (n.std() + 1e-9)

def hexrgb(h):
    return np.array([int(h[i:i + 2], 16) for i in (1, 3, 5)], float)

def tile(base, seed, streak=0.0, seams=True, weave=False, wear=0.0):
    s = 256
    col = np.zeros((s, s, 3)) + hexrgb(base)
    mottle = noise(s, 18, seed) * 0.04 + noise(s, 5, seed + 1) * 0.025
    col *= (1 + mottle)[..., None]
    if streak:
        # Vertical rain/grime streaks, seamless in y.
        cols = np.random.default_rng(seed + 2).random(s)
        streaks = np.convolve(np.tile(cols, 3), np.ones(5) / 5, "same")[s:2 * s]
        runs = noise(s, 30, seed + 3)
        k = np.clip((streaks[None, :] - 0.55) * 3, 0, 1) * np.clip(runs * 0.5 + 0.6, 0, 1)
        col *= (1 - streak * k)[..., None]
    if weave:
        y, x = np.mgrid[0:s, 0:s]
        col *= (1 + 0.05 * np.sign(np.sin(x * np.pi / 2)) * np.sign(np.sin(y * np.pi / 2)))[..., None]
        folds = noise(s, 40, seed + 4)
        col *= (1 + 0.12 * np.clip(folds, -1.5, 1.5) / 1.5)[..., None]
    if seams:
        # Panel seams with a highlight edge and rivet rows.
        for y0 in (40, 168):
            col[y0] *= 0.55
            col[y0 + 1] *= 1.18
            for x in range(6, s, 16):
                col[y0 - 4:y0 - 2, x:x + 2] *= 1.3
                col[y0 - 2, x:x + 2] *= 0.6
        for x0 in (96,):
            col[:, x0] *= 0.6
            col[:, x0 + 1] *= 1.15
    if wear:
        # Chipped paint: bright speckles where edges have worn.
        chips = noise(s, 3, seed + 5) > 2.1
        col[chips] = col[chips] * 0.55 + hexrgb("#8a8a78") * 0.45 * wear * 2
    return np.clip(col, 0, 255)

atlas = np.zeros((512, 512, 3))
atlas[:256, :256] = tile("#73765a", 10, streak=0.26, wear=0.5)          # body paint
atlas[:256, 256:] = tile("#262c29", 20, streak=0.12, seams=False)        # chassis / rubber-dark
atlas[256:, :256] = tile("#565f51", 30, streak=0.2, wear=0.6)          # metal
atlas[256:, 256:] = tile("#66654a", 40, seams=False, weave=True)         # canvas
def to_grey(rgb, base):
    # Luminance relative to the tile's base colour; 128 maps to the palette's mid.
    lum = rgb @ np.array([.299, .587, .114])
    return np.clip(lum / (hexrgb(base) @ np.array([.299, .587, .114])) * 128, 0, 255)

grey = np.zeros((512, 512))
for (ys, xs), base in (((slice(0, 256), slice(0, 256)), "#73765a"), ((slice(0, 256), slice(256, 512)), "#262c29"),
                       ((slice(256, 512), slice(0, 256)), "#565f51"), ((slice(256, 512), slice(256, 512)), "#66654a")):
    grey[ys, xs] = to_grey(atlas[ys, xs], base)
Image.fromarray((np.round(grey / 6) * 6).clip(0, 255).astype(np.uint8), "L").save(OUT + "hemtt_atlas.png", optimize=True)

# Tire sheet. Top half: tread band (u = around, v = across width).
tire = np.zeros((512, 512, 3)) + hexrgb("#262a27")
band = np.zeros((256, 512))
y, x = np.mgrid[0:256, 0:512]
for i in range(22):
    cx = (i + .5) * 512 / 22
    for lane, off in ((-1, 0.0), (1, 0.5)):
        c = (cx + off * 512 / 22) % 512
        vy = 128 + lane * 64
        dx = (x - c + 256) % 512 - 256
        d = np.abs(dx - lane * (y - vy) * 0.35)
        block = (d < 7) & (np.abs(y - vy) < 52)
        band[block] = 1
tread = np.where(band[..., None] > 0, hexrgb("#383d38"), hexrgb("#15181a"))
dust = np.tile(noise(256, 10, 70), (1, 2))
tread *= (1 + 0.08 * dust)[..., None]
tread += (np.clip(np.tile(noise(256, 4, 71), (1, 2)) - 1.2, 0, 2) * 14)[..., None] * hexrgb("#8a7a5a") / 128
tire[:256] = tread

def face(cx, cy):
    yy, xx = np.mgrid[0:512, 0:512]
    r = np.hypot(xx - cx, yy - cy) / 128.0     # 1.0 = cap edge
    a = np.arctan2(yy - cy, xx - cx)
    m = r <= 1.0
    out = np.zeros((512, 512, 3))
    side = hexrgb("#24282a") * (1 + 0.06 * np.sin(r * 40))[..., None]
    side += ((np.abs(np.sin(a * 12)) > .96) & (r > .78) & (r < .9))[..., None] * 18   # raised marks
    rim = hexrgb("#5f6249") * (1 - 0.25 * np.clip((r - .5) / .15, 0, 1))[..., None]
    rim *= (1 + 0.07 * np.cos(a * 3))[..., None]
    rim[(r > .6) & (r < .645)] = hexrgb("#3a3e33")            # bead lock ring
    for k in range(8):                                         # bolt ring
        bx = cx + np.cos(k * np.pi / 4) * .36 * 128
        by = cy + np.sin(k * np.pi / 4) * .36 * 128
        d = np.hypot(xx - bx, yy - by)
        rim[d < 4.5] = hexrgb("#505444")
        rim[(d >= 4.5) & (d < 6)] *= 0.6
    for k in range(6):                                         # rim vents
        vx = cx + np.cos(k * np.pi / 3 + .3) * .5 * 128
        vy = cy + np.sin(k * np.pi / 3 + .3) * .5 * 128
        rim[np.hypot(xx - vx, yy - vy) < 7] = hexrgb("#1c1f1c")
    col = np.where((r < .645)[..., None], rim, side)
    rim_mask[m & (r < .645)] = 255
    grime = np.clip(noise(512, 6, 80 + cx), -2, 2)
    col *= (1 + 0.07 * grime)[..., None]
    col += (np.clip(r - .8, 0, .2) * 5 * np.clip(grime + 1, 0, 2) * 10)[..., None] * hexrgb("#8a7a5a") / 128
    out[m] = col[m]
    return out, m

rim_mask = np.zeros((512, 512))
for cx in (128, 384):
    f, m = face(cx, 384)
    tire[m] = f[m]
# Rubber greys are relative to #24282a, rim greys to the rim paint #5f6249.
tire_grey = np.where(rim_mask > 0, to_grey(tire, "#5f6249"), to_grey(tire, "#24282a"))
sheet = np.stack([(np.round(tire_grey / 8) * 8).clip(0, 255), rim_mask], -1).astype(np.uint8)
Image.fromarray(sheet, "LA").save(OUT + "hemtt_tire.png", optimize=True)
print("painted", OUT)
