// interactions/customId.ts
// Builds and parses Discord custom IDs of the form "feature:action:id[:extra]".
// Custom IDs are limited to 100 characters by Discord, so building guards that.

const SEPARATOR = ":";
const MAX_LENGTH = 100;

// A parsed custom ID.
export type ParsedCustomId = {
  feature: string;
  action: string;
  id: string;
  extra?: string;
};

// Builds a custom ID, throwing if it would exceed Discord's 100-char limit.
export function buildCustomId(
  feature: string,
  action: string,
  id: string,
  extra?: string,
): string {
  const parts = extra === undefined ? [feature, action, id] : [feature, action, id, extra];
  const customId = parts.join(SEPARATOR);
  if (customId.length > MAX_LENGTH) {
    throw new Error(`Custom ID exceeds ${MAX_LENGTH} characters: ${customId}`);
  }
  return customId;
}

// Parses a custom ID, returning null when it does not match the expected shape.
export function parseCustomId(customId: string): ParsedCustomId | null {
  const parts = customId.split(SEPARATOR);
  if (parts.length < 3 || parts.length > 4) {
    return null;
  }
  const [feature, action, id, extra] = parts;
  if (!feature || !action || !id) {
    return null;
  }
  return extra === undefined
    ? { feature, action, id }
    : { feature, action, id, extra };
}
