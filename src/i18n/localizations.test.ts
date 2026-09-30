import { describe, test, expect } from "vitest";
import {
  commandDescriptionLocalizations,
  optionDescriptionLocalizations,
} from "./localizations";

describe("commandDescriptionLocalizations", () => {
  test("returns a zh-CN map for a known command", () => {
    const map = commandDescriptionLocalizations("ping");
    expect(map?.["zh-CN"]).toBeTruthy();
  });

  test("returns undefined for an unknown command (English fallback)", () => {
    expect(commandDescriptionLocalizations("does-not-exist")).toBeUndefined();
  });
});

describe("optionDescriptionLocalizations", () => {
  test("returns a zh-CN map for a known option", () => {
    const map = optionDescriptionLocalizations("rank", "group");
    expect(map?.["zh-CN"]).toBeTruthy();
  });

  test("returns undefined for an option with no translation", () => {
    expect(optionDescriptionLocalizations("rank", "no-such-option")).toBeUndefined();
  });

  test("never throws on an unknown command", () => {
    expect(() => optionDescriptionLocalizations("nope", "nope")).not.toThrow();
    expect(optionDescriptionLocalizations("nope", "nope")).toBeUndefined();
  });
});
