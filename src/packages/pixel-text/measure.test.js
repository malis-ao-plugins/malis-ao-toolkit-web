import {
  cellHeight,
  cellWidth,
  charsThatFit,
  fit,
  fitToWidth,
  measure,
} from "./measure";

describe("cell metrics", () => {
  it("reports the generated atlas cell for each supported size", () => {
    expect([cellWidth(12), cellWidth(16), cellWidth(24)]).toEqual([6, 8, 12]);
    expect([cellHeight(12), cellHeight(16), cellHeight(24)]).toEqual([12, 16, 24]);
  });

  it("snaps an unsupported size to the nearest one it has", () => {
    expect(cellWidth(13)).toBe(cellWidth(12));
    expect(cellWidth(22)).toBe(cellWidth(24));
  });

  it("treats anything at 600 or above as bold", () => {
    expect(cellWidth(12, 700)).toBe(cellWidth(12, 600));
  });
});

describe("measure", () => {
  it("is exactly length times the cell, because the face is monospaced", () => {
    expect(measure("abcd", 12)).toBe(24);
    expect(measure("abcd", 12, 400, 2)).toBe(48);
    expect(measure("", 12)).toBe(0);
  });
});

describe("charsThatFit", () => {
  it("never reports a partial cell", () => {
    expect(charsThatFit(25, 12)).toBe(4);
    expect(charsThatFit(24, 12)).toBe(4);
    expect(charsThatFit(23, 12)).toBe(3);
  });

  it("never returns a negative count", () => {
    expect(charsThatFit(-10, 12)).toBe(0);
  });
});

describe("fit", () => {
  it("leaves a string that already fits", () => {
    expect(fit("abc", 3)).toBe("abc");
    expect(fit("abc", undefined)).toBe("abc");
  });

  it("spends the last cell on an ellipsis", () => {
    expect(fit("abcdef", 4)).toBe("abc…");
    expect(fit("abcdef", 4)).toHaveLength(4);
  });

  it("degrades to a bare ellipsis rather than an empty string", () => {
    expect(fit("abcdef", 1)).toBe("…");
  });

  it("truncates to a pixel width the same way", () => {
    expect(fitToWidth("abcdef", 24, 12)).toBe("abc…");
  });
});
