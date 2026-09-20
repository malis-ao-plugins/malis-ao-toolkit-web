import { fitToWidth, fontFor, lineHeight, measure } from "./fonts";

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
