import { describe, test, expect } from "vitest";
import { addValueField, addRatioField, removeField, moveField } from "./statsFields";
import type { StatField } from "../storage/types";

const base: StatField[] = [
  { kind: "value", header: "Rank", label: "Rank", format: "text", inline: true },
  { kind: "value", header: "Kills", label: "Kills", format: "number", inline: true },
];

describe("addValueField", () => {
  test("adds a valid field", () => {
    const result = addValueField(base, "Deaths", "Deaths", "number", true);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.fields).toHaveLength(3);
    }
  });

  test("rejects an invalid format", () => {
    const result = addValueField(base, "X", "X", "banana", true);
    expect(result.ok).toBe(false);
  });

  test("rejects a duplicate label", () => {
    const result = addValueField(base, "K", "Kills", "number", true);
    expect(result.ok).toBe(false);
  });
});

describe("addRatioField", () => {
  test("adds a ratio field", () => {
    const result = addRatioField(base, "Kills", "Deaths", "K/D", true);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.fields[2]).toMatchObject({ kind: "ratio", label: "K/D" });
    }
  });

  test("rejects a duplicate label", () => {
    const result = addRatioField(base, "Kills", "Deaths", "Rank", true);
    expect(result.ok).toBe(false);
  });
});

describe("removeField", () => {
  test("removes an existing field", () => {
    const result = removeField(base, "Kills");
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.fields.map((f) => f.label)).toEqual(["Rank"]);
    }
  });

  test("errors for a missing field", () => {
    expect(removeField(base, "Nope").ok).toBe(false);
  });
});

describe("moveField", () => {
  test("moves a field to a new position", () => {
    const result = moveField(base, "Kills", 1);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.fields.map((f) => f.label)).toEqual(["Kills", "Rank"]);
    }
  });

  test("rejects an out-of-range position", () => {
    expect(moveField(base, "Kills", 5).ok).toBe(false);
  });

  test("errors for a missing field", () => {
    expect(moveField(base, "Nope", 1).ok).toBe(false);
  });
});
