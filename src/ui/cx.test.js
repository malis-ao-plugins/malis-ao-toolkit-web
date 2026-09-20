import { cx } from "./cx";

describe("cx", () => {
  it("joins the class names that are there", () => {
    expect(cx("a", "b")).toBe("a b");
  });

  it("drops every falsy branch, which is the whole point", () => {
    expect(cx("a", false && "b", null, undefined, "", "c")).toBe("a c");
  });

  it("is empty rather than undefined when nothing survives", () => {
    expect(cx(false, null)).toBe("");
  });
});
