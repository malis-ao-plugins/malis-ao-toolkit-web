#!/usr/bin/env python3
"""
Build true pixel fonts from Terminus' embedded bitmap strikes.

Why this exists
---------------
TerminusTTF ships both outlines and monochrome bitmap strikes (EBDT/EBLC).
Chromium on Windows rasterises through DirectWrite, which ignores monochrome
embedded bitmaps, so it draws the *outlines* — and those are not grid-aligned:
unitsPerEm is 1000 while the strikes are 12/14/16/18/20/22/24/28/32 ppem, and
the outline coordinates have a GCD of 1. At every size except 20px a glyph edge
lands mid-pixel, ClearType smears it across the RGB subpixels, and you get the
blue/orange fringing.

`-webkit-font-smoothing: none` does not help: it is a macOS-only property in
Blink and is ignored on Windows.

So instead of asking a rasteriser to reproduce a bitmap, this turns the bitmap
into geometry. Each lit pixel of a strike becomes a rectangle in a font whose
unitsPerEm is an exact multiple of that strike's ppem (ppem x 64). Rendered at
its native CSS size, every edge falls exactly on a device pixel boundary, so
antialiasing has nothing to blend — the coverage of each pixel is 0 or 1
whatever the rasteriser, whatever ClearType is set to.

The result is only correct at the size it was built for, and integer multiples
of it. That constraint is the point: it is what the type scale in ui.css is
built around.

Usage:  python tools/build-pixel-font.py
"""

import os
import sys

from fontTools.fontBuilder import FontBuilder
from fontTools.pens.ttGlyphPen import TTGlyphPen
from fontTools.ttLib import TTFont, newTable

# gasp behaviour flags.
GASP_GRIDFIT = 0x0001
GASP_DOGRAY = 0x0002

HERE = os.path.dirname(os.path.abspath(__file__))
FONT_DIR = os.path.join(HERE, "..", "src", "ui", "fonts")

SOURCES = [
    ("TerminusTTFWindows-4.49.3.ttf", "Regular", 400),
    ("TerminusTTFWindows-Bold-4.49.3.ttf", "Bold", 700),
]

# Strikes to emit. Each becomes its own family, usable at that size and any
# whole multiple of it.
SIZES = [12, 16, 24]

# Font units per bitmap pixel. Any integer works; 64 keeps coordinates small
# and unitsPerEm within the range TrueType implementations like.
PX = 64

VERSION = "4.49.3"


class Cell:
    """Bitmap placement in pixels, normalised across the EBDT metric flavours."""

    __slots__ = ("width", "height", "advance", "bearing_x", "bearing_y")

    def __init__(self, width, height, advance, bearing_x, bearing_y):
        self.width = width
        self.height = height
        self.advance = advance
        self.bearing_x = bearing_x
        self.bearing_y = bearing_y


def resolve_metrics(eblc_strike, strike_data):
    """
    Map every glyph in a strike to a Cell.

    Terminus stores most glyphs as EBDT format 5, which carries no metrics of
    its own — the covering EBLC index subtable holds one BigGlyphMetrics for
    the whole run, which is how a fixed-pitch font avoids repeating identical
    metrics 1343 times. The handful of format 2 glyphs carry their own
    SmallGlyphMetrics instead.
    """
    cells = {}

    for ist in eblc_strike.indexSubTables:
        shared = getattr(ist, "metrics", None)
        for name in ist.names:
            if shared is not None:
                cells[name] = Cell(
                    shared.width,
                    shared.height,
                    shared.horiAdvance,
                    shared.horiBearingX,
                    shared.horiBearingY,
                )
            else:
                m = getattr(strike_data.get(name), "metrics", None)
                if m is not None:
                    cells[name] = Cell(
                        m.width, m.height, m.Advance, m.BearingX, m.BearingY
                    )

    return cells


def read_bitmap(glyph, cell):
    """Return the glyph as a list of rows of booleans, top row first."""
    shim = type(
        "M", (), {"width": cell.width, "height": cell.height}
    )()
    rows = []
    for y in range(cell.height):
        raw = glyph.getRow(y, bitDepth=1, metrics=shim, reverseBytes=False)
        rows.append(
            [bool(raw[x >> 3] & (0x80 >> (x & 7))) for x in range(cell.width)]
        )
    return rows


def to_rects(rows):
    """
    Greedy rectangle decomposition of the lit pixels.

    One rectangle per pixel would work but bloats the file and gives the
    rasteriser thousands of coincident edges to sort. Growing each rectangle
    right then down typically covers a glyph in a handful of contours.
    """
    if not rows:
        return []

    h, w = len(rows), len(rows[0])
    used = [[False] * w for _ in range(h)]
    rects = []

    for y in range(h):
        for x in range(w):
            if not rows[y][x] or used[y][x]:
                continue

            # Extend right while the run continues.
            x2 = x
            while x2 + 1 < w and rows[y][x2 + 1] and not used[y][x2 + 1]:
                x2 += 1

            # Extend down while the whole run repeats.
            y2 = y
            while y2 + 1 < h and all(
                rows[y2 + 1][i] and not used[y2 + 1][i] for i in range(x, x2 + 1)
            ):
                y2 += 1

            for yy in range(y, y2 + 1):
                for xx in range(x, x2 + 1):
                    used[yy][xx] = True

            rects.append((x, y, x2 + 1, y2 + 1))

    return rects


def draw(pen, rects, bearing_x, bearing_y):
    """
    Emit each rectangle as a closed contour.

    Bitmap rows run downwards from BearingY (the distance from the baseline to
    the top of the bitmap); font coordinates run upwards from the baseline.
    """
    for x0, y0, x1, y1 in rects:
        left = (bearing_x + x0) * PX
        right = (bearing_x + x1) * PX
        top = (bearing_y - y0) * PX
        bottom = (bearing_y - y1) * PX

        pen.moveTo((left, bottom))
        pen.lineTo((left, top))
        pen.lineTo((right, top))
        pen.lineTo((right, bottom))
        pen.closePath()


def build(src_path, style, weight, ppem):
    src = TTFont(src_path, lazy=False)

    strike_index = next(
        (
            i
            for i, s in enumerate(src["EBLC"].strikes)
            if s.bitmapSizeTable.ppemY == ppem
        ),
        None,
    )
    if strike_index is None:
        raise SystemExit(f"{src_path}: no {ppem}px strike")

    eblc_strike = src["EBLC"].strikes[strike_index]
    size_table = eblc_strike.bitmapSizeTable
    strike = src["EBDT"].strikeData[strike_index]
    cells = resolve_metrics(eblc_strike, strike)
    cmap = src.getBestCmap()

    upem = ppem * PX
    glyphs, metrics = {}, {}
    skipped = 0

    order = [".notdef"] + sorted(n for n in strike if n != ".notdef")

    for name in order:
        cell = cells.get(name)
        bitmap = strike[name]

        # Format 8 composes a glyph from other bitmaps; Terminus uses it for a
        # handful of accented characters. They are dropped rather than
        # half-rendered, and fall back to whatever the next family supplies.
        if cell is None or not hasattr(bitmap, "getRow"):
            skipped += 1
            continue

        pen = TTGlyphPen(None)
        if cell.width and cell.height:
            draw(
                pen,
                to_rects(read_bitmap(bitmap, cell)),
                cell.bearing_x,
                cell.bearing_y,
            )
        glyphs[name] = pen.glyph()
        metrics[name] = (cell.advance * PX, cell.bearing_x * PX)

    order = [n for n in order if n in glyphs]

    family = f"TerminusPx{ppem}"
    full = f"{family} {style}"
    ps = f"{family}-{style}"

    fb = FontBuilder(upem, isTTF=True)
    fb.setupGlyphOrder(order)
    fb.setupCharacterMap({cp: g for cp, g in cmap.items() if g in glyphs})
    fb.setupGlyf(glyphs)
    fb.setupHorizontalMetrics(metrics)

    ascent = size_table.hori.ascender * PX
    descent = size_table.hori.descender * PX  # already negative

    fb.setupHorizontalHeader(ascent=ascent, descent=descent, lineGap=0)
    fb.setupNameTable(
        {
            "familyName": family,
            "styleName": style,
            "uniqueFontIdentifier": f"{ps};{VERSION}",
            "fullName": full,
            "psName": ps,
            "version": VERSION,
            "copyright": (
                "Generated from Terminus TTF bitmap strikes. "
                "Terminus Font is (c) Dimitar Zhekov, SIL Open Font License 1.1."
            ),
            "licenseDescription": "SIL Open Font License, Version 1.1",
        }
    )
    fb.setupOS2(
        sTypoAscender=ascent,
        sTypoDescender=descent,
        sTypoLineGap=0,
        usWinAscent=ascent,
        usWinDescent=-descent,
        usWeightClass=weight,
        panose=dict(
            bFamilyType=2,  # latin text
            bSerifStyle=11,  # normal sans
            bWeight=5 if weight < 600 else 8,
            bProportion=9,  # monospaced
            bContrast=2,  # none
            bStrokeVariation=2,  # no variation
            bArmStyle=2,
            bLetterForm=2,
            bMidline=2,
            bXHeight=4,
        ),
    )
    fb.setupPost(isFixedPitch=1)

    # Ask for grid-fitting and explicitly WITHOUT greyscale, at every size.
    #
    # Skia asks DirectWrite for a rendering mode via GetRecommendedRenderingMode,
    # and DirectWrite consults gasp to answer. With no gasp table (the default
    # from fontBuilder) it picks natural symmetric smoothing, which runs a
    # 3-tap filter over every edge — a one-pixel stem comes back as 93/228/93
    # across three pixels even when it is perfectly aligned. Omitting DOGRAY
    # asks for bi-level rendering instead, which is the whole point of a
    # bitmap-derived face.
    gasp = newTable("gasp")
    gasp.version = 0
    gasp.gaspRange = {0xFFFF: GASP_GRIDFIT}
    fb.font["gasp"] = gasp

    out = os.path.join(FONT_DIR, f"{ps}.ttf")
    fb.save(out)

    total_rects = sum(len(g.coordinates) // 4 for g in glyphs.values())
    print(
        f"  {ps}.ttf  upem {upem}  glyphs {len(order):>5}  "
        f"skipped {skipped:>2}  rects {total_rects:>6}  "
        f"{os.path.getsize(out) / 1024:7.1f} KB"
    )
    return out


def main():
    if not os.path.isdir(FONT_DIR):
        sys.exit(f"missing {FONT_DIR}")

    for filename, style, weight in SOURCES:
        path = os.path.join(FONT_DIR, filename)
        if not os.path.exists(path):
            sys.exit(f"missing source font {path}")
        print(filename)
        for ppem in SIZES:
            build(path, style, weight, ppem)


if __name__ == "__main__":
    main()
