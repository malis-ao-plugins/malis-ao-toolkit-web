#!/usr/bin/env python3
"""
Build sprite atlases from Terminus' bitmap strikes, for @pixel-text.

Why a sprite sheet and not just the font
----------------------------------------
Chromium on Windows antialiases text from the system font-smoothing setting
(ui/gfx/font_render_params_win.cc reads SPI_GETFONTSMOOTHING and there is no
command-line override). No CSS property, font table or Chrome flag can turn
that off, so any glyph the browser rasterises will be filtered.

Images are not text. `image-rendering: pixelated` is nearest-neighbour by
specification, so a glyph that arrives as pixels stays as pixels. Drawing text
from an atlas sidesteps the rasteriser entirely and is therefore exact on any
engine and any machine, with nothing for the user to configure.

Output, into src/packages/pixel-text/atlas/:

    terminus-<size>-<weight>.png    white glyphs on transparent, one per cell
    terminus-<size>-<weight>.json   { size, weight, cellW, cellH, cols,
                                      ascent, descent, chars }

The glyph for `chars[i]` lives at column i % cols, row i // cols. Cells are the
full character cell — advance wide, ascent+descent tall — so drawing a string
is just `dx = i * cellW`, with no per-glyph bearings to apply at runtime.

Usage:  python tools/build-pixel-atlas.py
"""

import json
import os
import sys

from PIL import Image

from terminus_strikes import load_strike

HERE = os.path.dirname(os.path.abspath(__file__))
OUT_DIR = os.path.join(HERE, "..", "src", "packages", "pixel-text", "atlas")

SIZES = [12, 16, 24]
WEIGHTS = [400, 700]

COLS = 32

# Coverage.
#
# The first pass shipped printable ASCII plus a dozen symbols, and item names
# turned out to contain an em dash — which pushed every one of them onto the
# DOM fallback and straight back into the antialiased path. A gap in this set
# is invisible until someone notices a soft label, so it is now generous:
# anything in these ranges that the strike actually carries is included. The
# sheets stay a few KB regardless.
RANGES = [
    (0x0020, 0x007E),  # printable ASCII
    (0x00A0, 0x00FF),  # Latin-1 supplement
    (0x0100, 0x017F),  # Latin extended-A
    (0x0192, 0x0192),  # florin
    (0x2010, 0x2027),  # dashes, quotes, ellipsis
    (0x2030, 0x205E),  # per-mille, primes, brackets
    (0x20A0, 0x20BF),  # currency
    (0x2122, 0x2122),  # trade mark
    (0x2190, 0x21FF),  # arrows
    (0x2200, 0x22FF),  # maths operators
    (0x2500, 0x257F),  # box drawing
    (0x2580, 0x259F),  # block elements
    (0x25A0, 0x25FF),  # geometric shapes
    (0x2600, 0x26FF),  # misc symbols
]

CHARS = "".join(
    chr(cp) for lo, hi in RANGES for cp in range(lo, hi + 1)
)

def build(size, weight):
    font, strike, cells, size_table = load_strike(weight, size)
    cmap = font.getBestCmap()

    ascent = size_table.hori.ascender
    descent = -size_table.hori.descender  # positive pixels below the baseline
    cell_h = ascent + descent

    # Fixed pitch, so any present glyph gives us the advance.
    advance = next(c.advance for c in cells.values() if c.advance)
    cell_w = advance

    usable = []
    for ch in CHARS:
        name = cmap.get(ord(ch))
        if not name or name not in strike or name not in cells:
            continue
        usable.append(ch)

    rows = (len(usable) + COLS - 1) // COLS
    img = Image.new("RGBA", (COLS * cell_w, rows * cell_h), (0, 0, 0, 0))

    for i, ch in enumerate(usable):
        name = cmap[ord(ch)]
        cell = cells[name]
        bitmap = strike[name]
        if not hasattr(bitmap, "getRow") or not cell.width or not cell.height:
            continue

        ox = (i % COLS) * cell_w + cell.bearing_x
        oy = (i // COLS) * cell_h + (ascent - cell.bearing_y)

        from terminus_strikes import read_bitmap

        for y, row in enumerate(read_bitmap(bitmap, cell)):
            for x, on in enumerate(row):
                if not on:
                    continue
                px, py = ox + x, oy + y
                if 0 <= px < img.width and 0 <= py < img.height:
                    # White, so the runtime can tint it to any colour.
                    img.putpixel((px, py), (255, 255, 255, 255))

    os.makedirs(OUT_DIR, exist_ok=True)
    stem = f"terminus-{size}-{weight}"
    img.save(os.path.join(OUT_DIR, stem + ".png"), optimize=True)

    meta = {
        "size": size,
        "weight": weight,
        "cellW": cell_w,
        "cellH": cell_h,
        "cols": COLS,
        "ascent": ascent,
        "descent": descent,
        "chars": "".join(usable),
    }
    with open(os.path.join(OUT_DIR, stem + ".json"), "w", encoding="utf-8") as fh:
        json.dump(meta, fh, separators=(",", ":"))

    png_bytes = os.path.getsize(os.path.join(OUT_DIR, stem + ".png"))
    print(
        f"  {stem}  cell {cell_w}x{cell_h}  glyphs {len(usable):>3}  "
        f"sheet {img.width}x{img.height}  {png_bytes / 1024:6.1f} KB"
    )


def main():
    if not os.path.isdir(os.path.join(HERE, "..", "src", "ui", "fonts")):
        sys.exit("run this from the repository root")
    for size in SIZES:
        for weight in WEIGHTS:
            build(size, weight)


if __name__ == "__main__":
    main()
