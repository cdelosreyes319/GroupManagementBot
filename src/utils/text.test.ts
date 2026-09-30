import { describe, test, expect } from "vitest";
import { truncate, normaliseName } from "./text";

describe("truncate", () => {
  test("leaves short text unchanged", () => {
    expect(truncate("hello", 10)).toBe("hello");
  });

  test("leaves text of exactly the max length unchanged", () => {
    expect(truncate("hello", 5)).toBe("hello");
  });

  test("cuts long text and adds an ellipsis", () => {
    expect(truncate("hello world", 5)).toBe("hell…");
  });

  test("returns empty string for a non-positive max length", () => {
    expect(truncate("hello", 0)).toBe("");
    expect(truncate("hello", -3)).toBe("");
  });

  test("handles a max length of 1 without an ellipsis", () => {
    expect(truncate("hello", 1)).toBe("h");
  });
});

describe("normaliseName", () => {
  test("lowercases the name", () => {
    expect(normaliseName("SergentDubois")).toBe("sergentdubois");
  });

  test("trims surrounding spaces", () => {
    expect(normaliseName("  Dubois  ")).toBe("dubois");
  });

  test("combines case and space handling", () => {
    expect(normaliseName("  OldName1 ")).toBe("oldname1");
  });
});
