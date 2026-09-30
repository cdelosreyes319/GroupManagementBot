import { describe, test, expect } from "vitest";
import { canBotAssign } from "./groupAccess";

describe("canBotAssign", () => {
  test("allows a valid change below the bot's rank", () => {
    expect(canBotAssign(100, 40, 50)).toEqual({ ok: true });
  });

  test("refuses the guest rank (0)", () => {
    const result = canBotAssign(100, 40, 0);
    expect(result.ok).toBe(false);
  });

  test("refuses the owner rank (255)", () => {
    const result = canBotAssign(100, 40, 255);
    expect(result.ok).toBe(false);
  });

  test("refuses a new rank at or above the bot", () => {
    expect(canBotAssign(100, 40, 100).ok).toBe(false);
    expect(canBotAssign(100, 40, 120).ok).toBe(false);
  });

  test("refuses when the target is not a member", () => {
    const result = canBotAssign(100, 0, 50);
    expect(result.ok).toBe(false);
  });

  test("refuses when the target is at or above the bot", () => {
    expect(canBotAssign(100, 100, 50).ok).toBe(false);
    expect(canBotAssign(100, 120, 50).ok).toBe(false);
  });
});
