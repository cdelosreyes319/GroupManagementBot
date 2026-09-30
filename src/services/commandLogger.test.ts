import { describe, test, expect } from "vitest";
import { buildLogSummary, optionLine } from "./commandLogger";

const FIXED = Date.parse("2026-01-02T03:04:05.000Z");

describe("buildLogSummary", () => {
  test("includes command name, runner, channel and time", () => {
    const text = buildLogSummary({
      commandName: "ping",
      runnerId: "u1",
      channelId: "c1",
      detail: [],
      now: FIXED,
    });
    expect(text).toContain("**/ping**");
    expect(text).toContain("By: <@u1>");
    expect(text).toContain("In: <#c1>");
    expect(text).toContain("2026-01-02T03:04:05.000Z");
  });

  test("includes detail lines (e.g. a rank outcome)", () => {
    const text = buildLogSummary({
      commandName: "rank",
      runnerId: "officer",
      channelId: "c1",
      detail: ["Target: Dubois", "Empire Français: Sergent → Adjudant", "Discord role: updated"],
      now: FIXED,
    });
    expect(text).toContain("Target: Dubois");
    expect(text).toContain("Empire Français: Sergent → Adjudant");
    expect(text).toContain("Discord role: updated");
  });

  test("includes the full eventdm title and message for tracing", () => {
    const text = buildLogSummary({
      commandName: "eventdm",
      runnerId: "officer",
      channelId: "c1",
      detail: [
        "Role: @Members",
        "Recipients: 42",
        "Title: Muster tonight",
        "Message: Report to the parade ground at 8pm sharp.",
      ],
      now: FIXED,
    });
    expect(text).toContain("Title: Muster tonight");
    expect(text).toContain("Message: Report to the parade ground at 8pm sharp.");
    expect(text).toContain("Recipients: 42");
  });

  test("handles a command with no detail", () => {
    const text = buildLogSummary({
      commandName: "whois",
      runnerId: "u1",
      channelId: "c1",
      detail: [],
      now: FIXED,
    });
    expect(text).toContain("**/whois**");
    // Just the four base lines, no trailing detail.
    expect(text.split("\n")).toHaveLength(4);
  });

  test("truncates a very long summary within the embed limit", () => {
    const huge = Array.from({ length: 500 }, (_, i) => `line ${i} ${"x".repeat(50)}`);
    const text = buildLogSummary({
      commandName: "eventdm",
      runnerId: "u1",
      channelId: "c1",
      detail: huge,
      now: FIXED,
    });
    expect(text.length).toBeLessThanOrEqual(4000);
  });
});

describe("optionLine", () => {
  test("formats a name/value pair", () => {
    expect(optionLine("Role", "@Members")).toBe("Role: @Members");
  });

  test("truncates an overly long value", () => {
    expect(optionLine("Message", "x".repeat(1000)).length).toBeLessThanOrEqual(500 + "Message: ".length);
  });
});
