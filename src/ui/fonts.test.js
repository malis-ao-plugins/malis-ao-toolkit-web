import {
  DEFAULT_FAMILY,
  currentFamily,
  families,
  fitToWidth,
  fontFor,
  lineHeight,
  measure,
  onFamilyChange,
  setFamily,
  wrapToWidth,
} from "./fonts";

/**
 * These run against the real atlases in src/pixelfont, which is a junction to
 * the shared aowebui folder. They assert relationships rather than exact
 * pixel counts wherever a number would just be re-stating whatever Verdana
 * happens to measure — except where the number is the point.
 */

describe("fontFor", () => {
  it("returns a usable face for the sizes the kit asks for", () => {
    for (const size of [12, 13, 16, 20, 24]) {
      const font = fontFor(size);
      expect(font).toBeTruthy();
      expect(font.height).toBeGreaterThan(0);
    }
  });

  it("resolves a requested size to the nearest atlas that exists", () => {
    // The kit asks for 12 and 24; the atlases are 13, 16 and 20.
    expect(fontFor(12).size).toBe(13);
    expect(fontFor(13).size).toBe(13);
    expect(fontFor(16).size).toBe(16);
    expect(fontFor(24, 700).size).toBe(20);
  });

  it("matches weight before size, so bold stays bold", () => {
    expect(fontFor(13, 700).atlas.bold).toBe(true);
    expect(fontFor(13, 400).atlas.bold).toBe(false);
    expect(fontFor(16, 700).atlas.bold).toBe(true);
  });

  it("treats anything at 600 or above as bold", () => {
    expect(fontFor(13, 600).atlas.bold).toBe(true);
    expect(fontFor(13, 500).atlas.bold).toBe(false);
  });
});

describe("measure", () => {
  it("is zero for an empty string", () => {
    expect(measure("", 13)).toBe(0);
  });

  it("is the sum of advances, so it is additive", () => {
    expect(measure("ab", 13)).toBe(measure("a", 13) + measure("b", 13));
  });

  it("is proportional, not a character count", () => {
    // The whole reason the kit stopped measuring in characters.
    expect(measure("i", 13)).toBeLessThan(measure("W", 13));
  });

  it("grows with the size step", () => {
    expect(measure("Hello", 16)).toBeGreaterThan(measure("Hello", 13));
  });

  it("does not throw on a character the atlas lacks", () => {
    expect(() => measure("—…", 13)).not.toThrow();
  });
});

describe("lineHeight", () => {
  it("is the atlas cell height", () => {
    expect(lineHeight(13)).toBe(13);
    expect(lineHeight(16)).toBe(16);
  });
});

describe("fitToWidth", () => {
  it("leaves a string that already fits", () => {
    const text = "Kevlar Vest";
    expect(fitToWidth(text, measure(text, 13) + 10, 13)).toBe(text);
  });

  it("leaves a string when no budget is given", () => {
    expect(fitToWidth("anything", null, 13)).toBe("anything");
  });

  it("truncates to the budget and marks it with an ellipsis", () => {
    const text = "Notum-Laced Targeting Chip";
    const out = fitToWidth(text, 60, 13);

    expect(out).not.toBe(text);
    expect(out.endsWith("...")).toBe(true);
    expect(measure(out, 13)).toBeLessThanOrEqual(60);
  });

  it("uses an ellipsis the atlas can actually draw", () => {
    // "…" is not in a latin1 atlas and would draw nothing at all, so the
    // truncation would be invisible.
    const out = fitToWidth("a very long label indeed", 40, 13);
    expect(out).not.toContain("…");
  });

  it("degrades to the ellipsis alone rather than an empty string", () => {
    expect(fitToWidth("anything", 1, 13)).toBe("...");
  });

  it("never returns something wider than the budget", () => {
    const text = "Scorched Bio-Comm Device";
    for (const budget of [20, 40, 80, 160]) {
      expect(measure(fitToWidth(text, budget, 13), 13)).toBeLessThanOrEqual(budget);
    }
  });

  it("copes with an empty string", () => {
    expect(fitToWidth("", 40, 13)).toBe("");
  });
});

describe("wrapToWidth", () => {
  const text = "Omni-Pol wants this one quiet. No witnesses, no report.";

  it("keeps a short line whole", () => {
    expect(wrapToWidth("Two words", 400, 13)).toEqual(["Two words"]);
  });

  it("splits on whitespace, not on the letter s", () => {
    // A regex that lost its backslash would split "this one" into fragments.
    expect(wrapToWidth("this is so", 400, 13)).toEqual(["this is so"]);
  });

  it("breaks into lines that each fit", () => {
    const lines = wrapToWidth(text, 120, 13);
    expect(lines.length).toBeGreaterThan(1);
    for (const line of lines) expect(measure(line, 13)).toBeLessThanOrEqual(120);
  });

  it("loses no words", () => {
    expect(wrapToWidth(text, 120, 13).join(" ")).toBe(text);
  });

  it("is empty for empty text", () => {
    expect(wrapToWidth("", 120, 13)).toEqual([]);
    expect(wrapToWidth(null, 120, 13)).toEqual([]);
  });

  it("lets a single over-long word overrun rather than cutting it", () => {
    expect(wrapToWidth("supercalifragilistic", 20, 13)).toEqual([
      "supercalifragilistic",
    ]);
  });
});

describe("families", () => {
  it("offers every family the shared folder has exported", () => {
    expect(families()).toEqual(
      expect.arrayContaining(["verdana", "tahoma", "Lucida Console"]),
    );
  });

  it("starts on the one with a range of sizes", () => {
    expect(DEFAULT_FAMILY).toBe("verdana");
    expect(currentFamily()).toBe("verdana");
  });

  it("draws with the chosen family", () => {
    setFamily("Lucida Console");
    expect(fontFor(13).atlas.face).toBe("Lucida Console");
    setFamily("verdana");
    expect(fontFor(13).atlas.face).toBe("verdana");
  });

  it("falls back to the nearest size a family actually has", () => {
    setFamily("tahoma");
    // Tahoma is exported at 14 only, so every step resolves to it.
    expect(fontFor(13).size).toBe(14);
    expect(fontFor(20).size).toBe(14);
    setFamily("verdana");
  });

  it("ignores a family that does not exist", () => {
    setFamily("comic sans");
    expect(currentFamily()).toBe("verdana");
  });

  it("tells subscribers when the family changes", () => {
    const seen = [];
    const stop = onFamilyChange(() => seen.push(currentFamily()));

    setFamily("tahoma");
    setFamily("tahoma"); // no change, no call
    setFamily("verdana");
    stop();
    setFamily("tahoma");
    setFamily("verdana");

    expect(seen).toEqual(["tahoma", "verdana"]);
  });

  it("measures differently once the family changes", () => {
    const verdana = measure("Hello", 13);
    setFamily("Lucida Console");
    const lucida = measure("Hello", 13);
    setFamily("verdana");

    expect(lucida).not.toBe(verdana);
    expect(measure("Hello", 13)).toBe(verdana);
  });
});
