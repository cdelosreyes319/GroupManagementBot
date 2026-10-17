import { describe, test, expect } from "vitest";
import { isAnswer } from "./types";

describe("isAnswer", () => {
  test("accepts the three poll answers", () => {
    expect(isAnswer("yes")).toBe(true);
    expect(isAnswer("maybe")).toBe(true);
    expect(isAnswer("no")).toBe(true);
  });

  test("rejects anything else", () => {
    expect(isAnswer("YES")).toBe(false);
    expect(isAnswer("")).toBe(false);
    expect(isAnswer(undefined)).toBe(false);
    expect(isAnswer(1)).toBe(false);
  });
});
