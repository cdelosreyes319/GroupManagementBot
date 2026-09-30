// services/statsFields.ts
// Pure helpers that validate, add, remove, and reorder the fields of a stats
// source. Returned as a new array so callers can persist the change.
import type { StatField, StatFormat } from "../storage/types";

// The result of a field operation: the new list or an error message.
export type FieldOpResult =
  | { ok: true; fields: StatField[] }
  | { ok: false; error: string };

// Valid single-value formats.
const FORMATS: StatFormat[] = ["text", "number", "percent"];

// Adds a value field, rejecting a duplicate label.
export function addValueField(
  fields: StatField[],
  header: string,
  label: string,
  format: string,
  inline: boolean,
): FieldOpResult {
  if (!FORMATS.includes(format as StatFormat)) {
    return { ok: false, error: `Format must be one of: ${FORMATS.join(", ")}.` };
  }
  if (labelExists(fields, label)) {
    return { ok: false, error: `A field labelled "${label}" already exists.` };
  }
  if (fields.length >= 25) {
    return { ok: false, error: "A source can have at most 25 fields." };
  }
  const field: StatField = { kind: "value", header, label, format: format as StatFormat, inline };
  return { ok: true, fields: [...fields, field] };
}

// Adds a ratio field (numerator ÷ denominator).
export function addRatioField(
  fields: StatField[],
  numeratorHeader: string,
  denominatorHeader: string,
  label: string,
  inline: boolean,
): FieldOpResult {
  if (labelExists(fields, label)) {
    return { ok: false, error: `A field labelled "${label}" already exists.` };
  }
  if (fields.length >= 25) {
    return { ok: false, error: "A source can have at most 25 fields." };
  }
  const field: StatField = { kind: "ratio", numeratorHeader, denominatorHeader, label, inline };
  return { ok: true, fields: [...fields, field] };
}

// Removes a field by label.
export function removeField(fields: StatField[], label: string): FieldOpResult {
  if (!labelExists(fields, label)) {
    return { ok: false, error: `No field labelled "${label}".` };
  }
  return { ok: true, fields: fields.filter((f) => f.label !== label) };
}

// Moves a field to a new 1-based position.
export function moveField(fields: StatField[], label: string, toPosition: number): FieldOpResult {
  const index = fields.findIndex((f) => f.label === label);
  if (index === -1) {
    return { ok: false, error: `No field labelled "${label}".` };
  }
  if (toPosition < 1 || toPosition > fields.length) {
    return { ok: false, error: `Position must be between 1 and ${fields.length}.` };
  }
  const copy = [...fields];
  const [moved] = copy.splice(index, 1);
  copy.splice(toPosition - 1, 0, moved);
  return { ok: true, fields: copy };
}

// True when a field with the given label already exists.
function labelExists(fields: StatField[], label: string): boolean {
  return fields.some((f) => f.label === label);
}
