// services/statsFormatter.ts
// Pure functions that turn a sheet row plus field config into Discord embed
// fields, applying number/percent/ratio formatting and Discord length limits.
import type { StatField, StatFormat } from "../storage/types";
import { truncate } from "../utils/text";

const EMPTY = "—";
const MAX_FIELDS = 25;
const MAX_NAME = 256;
const MAX_VALUE = 1024;

// Formats a single value by its declared format. Blank/null becomes "—".
export function formatValue(raw: unknown, format: StatFormat): string {
  if (raw === null || raw === undefined || raw === "") {
    return EMPTY;
  }
  if (format === "number") {
    const n = Number(raw);
    return Number.isNaN(n) ? String(raw) : n.toLocaleString("en-US");
  }
  if (format === "percent") {
    const n = Number(raw);
    if (Number.isNaN(n)) {
      return String(raw);
    }
    // A fraction like 0.85 is shown as 85%; a whole number like 85 stays 85%.
    const percent = n > 0 && n <= 1 ? n * 100 : n;
    return `${Math.round(percent)}%`;
  }
  return String(raw);
}

// Formats a ratio of two values to two decimals. "—" if the denominator is 0
// or either value is not a number.
export function formatRatio(numerator: unknown, denominator: unknown): string {
  const num = Number(numerator);
  const den = Number(denominator);
  if (Number.isNaN(num) || Number.isNaN(den) || den === 0) {
    return EMPTY;
  }
  return (num / den).toFixed(2);
}

// One column of a stats table: the field's label and the player's formatted value.
export type StatCell = { label: string; value: string };

// Builds the ordered label/value cells for a player's row (one per field).
export function buildStatCells(fields: StatField[], row: Record<string, unknown>): StatCell[] {
  return fields.slice(0, MAX_FIELDS).map((field) => {
    const value =
      field.kind === "ratio"
        ? formatRatio(row[field.numeratorHeader], row[field.denominatorHeader])
        : formatValue(row[field.header], field.format);
    return { label: field.label, value: value || EMPTY };
  });
}

// Renders cells as a two-line monospace table (header row + data row) with each
// column padded to the wider of its label and value so the columns line up.
// Returns a fenced code block; empty when there are no cells.
export function renderStatTable(cells: StatCell[]): string {
  if (cells.length === 0) {
    return "";
  }
  const widths = cells.map((c) => Math.max(c.label.length, c.value.length));
  const header = cells.map((c, i) => c.label.padEnd(widths[i])).join("  ");
  const data = cells.map((c, i) => c.value.padEnd(widths[i])).join("  ");
  const block = `${header}\n${data}`;
  // Keep the whole table within a Discord embed field value (1024 chars),
  // leaving room for the code fence.
  return "```\n" + truncate(block, MAX_VALUE - 8) + "\n```";
}

// Builds embed fields from the configured fields and a sheet row, applying
// Discord's field-count and length limits.
export function buildEmbedFields(
  fields: StatField[],
  row: Record<string, unknown>,
): { name: string; value: string; inline: boolean }[] {
  const result: { name: string; value: string; inline: boolean }[] = [];
  for (const field of fields.slice(0, MAX_FIELDS)) {
    const value =
      field.kind === "ratio"
        ? formatRatio(row[field.numeratorHeader], row[field.denominatorHeader])
        : formatValue(row[field.header], field.format);
    result.push({
      name: truncate(field.label, MAX_NAME),
      value: truncate(value || EMPTY, MAX_VALUE),
      inline: field.inline,
    });
  }
  return result;
}
