import { describe, test, expect } from "vitest";
import {
  formatValue,
  formatRatio,
  buildEmbedFields,
  buildStatCells,
  renderStatTable,
} from "./statsFormatter";
import type { StatField } from "../storage/types";

describe("formatValue", () => {
  test("blank or null becomes an em dash", () => {
    expect(formatValue("", "text")).toBe("—");
    expect(formatValue(null, "number")).toBe("—");
    expect(formatValue(undefined, "percent")).toBe("—");
  });

  test("number adds thousands separators", () => {
    expect(formatValue(1234567, "number")).toBe("1,234,567");
  });

  test("percent shows a fraction as a whole percentage", () => {
    expect(formatValue(0.85, "percent")).toBe("85%");
  });

  test("percent leaves a whole number as a percentage", () => {
    expect(formatValue(85, "percent")).toBe("85%");
  });

  test("text passes through", () => {
    expect(formatValue("Sergeant", "text")).toBe("Sergeant");
  });

  test("non-numeric number falls back to the raw string", () => {
    expect(formatValue("N/A", "number")).toBe("N/A");
  });
});

describe("formatRatio", () => {
  test("computes two-decimal ratio", () => {
    expect(formatRatio(512, 218)).toBe("2.35");
  });

  test("zero denominator is an em dash", () => {
    expect(formatRatio(5, 0)).toBe("—");
  });

  test("non-numeric input is an em dash", () => {
    expect(formatRatio("x", 2)).toBe("—");
  });
});

describe("buildEmbedFields", () => {
  test("builds value and ratio fields", () => {
    const fields: StatField[] = [
      { kind: "value", header: "Rank", label: "Rank", format: "text", inline: true },
      { kind: "value", header: "Kills", label: "Kills", format: "number", inline: true },
      { kind: "ratio", numeratorHeader: "Kills", denominatorHeader: "Deaths", label: "K/D", inline: true },
    ];
    const row = { Rank: "Sergeant", Kills: 512, Deaths: 218 };
    expect(buildEmbedFields(fields, row)).toEqual([
      { name: "Rank", value: "Sergeant", inline: true },
      { name: "Kills", value: "512", inline: true },
      { name: "K/D", value: "2.35", inline: true },
    ]);
  });

  test("blank cells show an em dash", () => {
    const fields: StatField[] = [
      { kind: "value", header: "Notes", label: "Notes", format: "text", inline: false },
    ];
    expect(buildEmbedFields(fields, {})).toEqual([{ name: "Notes", value: "—", inline: false }]);
  });

  test("caps at 25 fields", () => {
    const fields: StatField[] = Array.from({ length: 30 }, (_, i) => ({
      kind: "value" as const,
      header: `h${i}`,
      label: `L${i}`,
      format: "text" as const,
      inline: true,
    }));
    expect(buildEmbedFields(fields, {})).toHaveLength(25);
  });

  test("truncates long values to 1024 characters", () => {
    const fields: StatField[] = [
      { kind: "value", header: "Bio", label: "Bio", format: "text", inline: false },
    ];
    const long = "x".repeat(2000);
    const built = buildEmbedFields(fields, { Bio: long });
    expect(built[0].value.length).toBeLessThanOrEqual(1024);
  });
});

describe("buildStatCells", () => {
  test("produces one label/value cell per field", () => {
    const fields: StatField[] = [
      { kind: "value", header: "Kills", label: "Kills", format: "number", inline: true },
      { kind: "ratio", numeratorHeader: "Kills", denominatorHeader: "Deaths", label: "K/D", inline: true },
    ];
    expect(buildStatCells(fields, { Kills: 512, Deaths: 218 })).toEqual([
      { label: "Kills", value: "512" },
      { label: "K/D", value: "2.35" },
    ]);
  });

  test("blank cell shows an em dash", () => {
    const fields: StatField[] = [
      { kind: "value", header: "Notes", label: "Notes", format: "text", inline: false },
    ];
    expect(buildStatCells(fields, {})).toEqual([{ label: "Notes", value: "—" }]);
  });
});

describe("renderStatTable", () => {
  test("returns empty string for no cells", () => {
    expect(renderStatTable([])).toBe("");
  });

  test("aligns header and data rows in a code block", () => {
    const table = renderStatTable([
      { label: "Kills", value: "512" },
      { label: "KD", value: "2.35" },
    ]);
    expect(table.startsWith("```\n")).toBe(true);
    expect(table.endsWith("\n```")).toBe(true);
    // Strip the fences and read the two content lines (header = labels, data = values).
    const lines = table.replace(/```/g, "").replace(/^\n/, "").replace(/\n$/, "").split("\n");
    // Column widths: "Kills"=5 vs "512"=3 -> 5; "KD"=2 vs "2.35"=4 -> 4.
    expect(lines[0]).toBe("Kills  KD  ");
    expect(lines[1]).toBe("512    2.35");
  });

  test("stays within the embed field value limit", () => {
    const cells = Array.from({ length: 25 }, (_, i) => ({
      label: `L${i}`,
      value: "x".repeat(100),
    }));
    expect(renderStatTable(cells).length).toBeLessThanOrEqual(1024);
  });
});
