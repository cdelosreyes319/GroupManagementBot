import { describe, test, expect } from "vitest";
import { buildCustomId, parseCustomId } from "./customId";

describe("buildCustomId", () => {
  test("builds a three-part id", () => {
    expect(buildCustomId("eventdm", "confirm", "ab12cd34")).toBe("eventdm:confirm:ab12cd34");
  });

  test("builds a four-part id with extra", () => {
    expect(buildCustomId("eventdm", "rsvp", "ab12cd34", "yes")).toBe("eventdm:rsvp:ab12cd34:yes");
  });

  test("throws when the id exceeds 100 characters", () => {
    const longId = "x".repeat(120);
    expect(() => buildCustomId("eventdm", "rsvp", longId)).toThrow(/exceeds 100/);
  });
});

describe("parseCustomId", () => {
  test("parses a three-part id", () => {
    expect(parseCustomId("eventdm:confirm:ab12cd34")).toEqual({
      feature: "eventdm",
      action: "confirm",
      id: "ab12cd34",
    });
  });

  test("parses a four-part id with extra", () => {
    expect(parseCustomId("eventdm:rsvp:ab12cd34:yes")).toEqual({
      feature: "eventdm",
      action: "rsvp",
      id: "ab12cd34",
      extra: "yes",
    });
  });

  test("returns null for too few parts", () => {
    expect(parseCustomId("eventdm:confirm")).toBeNull();
  });

  test("returns null for too many parts", () => {
    expect(parseCustomId("a:b:c:d:e")).toBeNull();
  });

  test("returns null for empty segments", () => {
    expect(parseCustomId("eventdm::ab12")).toBeNull();
  });
});
