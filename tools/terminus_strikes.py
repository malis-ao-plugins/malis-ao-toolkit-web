"""
Shared reader for TerminusTTF's embedded bitmap strikes (EBDT/EBLC).

Both generators sit on top of this: build-pixel-font.py turns a strike into an
outline font, build-pixel-atlas.py turns the same strike into a sprite sheet.
"""

import os

from fontTools.ttLib import TTFont

FONT_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "src", "ui", "fonts")

SOURCES = {
    400: "TerminusTTFWindows-4.49.3.ttf",
    700: "TerminusTTFWindows-Bold-4.49.3.ttf",
}


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
    shim = type("M", (), {"width": cell.width, "height": cell.height})()
    rows = []
    for y in range(cell.height):
        raw = glyph.getRow(y, bitDepth=1, metrics=shim, reverseBytes=False)
        rows.append(
            [bool(raw[x >> 3] & (0x80 >> (x & 7))) for x in range(cell.width)]
        )
    return rows


def load_strike(weight, ppem):
    """
    Open a source face and return everything needed to draw one strike:
    (font, strike_data, cells, size_table).
    """
    path = os.path.join(FONT_DIR, SOURCES[weight])
    if not os.path.exists(path):
        raise SystemExit(f"missing source font {path}")

    font = TTFont(path, lazy=False)

    index = next(
        (
            i
            for i, s in enumerate(font["EBLC"].strikes)
            if s.bitmapSizeTable.ppemY == ppem
        ),
        None,
    )
    if index is None:
        raise SystemExit(f"{path}: no {ppem}px strike")

    eblc_strike = font["EBLC"].strikes[index]
    strike_data = font["EBDT"].strikeData[index]
    cells = resolve_metrics(eblc_strike, strike_data)

    return font, strike_data, cells, eblc_strike.bitmapSizeTable
