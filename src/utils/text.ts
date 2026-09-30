// utils/text.ts
// Small string helpers shared across the bot.

// Shortens text to a maximum length, adding an ellipsis when it was cut.
export function truncate(text: string, maxLength: number): string {
  if (maxLength <= 0) {
    return "";
  }
  if (text.length <= maxLength) {
    return text;
  }
  if (maxLength <= 1) {
    return text.slice(0, maxLength);
  }
  return text.slice(0, maxLength - 1) + "…";
}

// Normalises a name for case- and space-insensitive comparison.
export function normaliseName(name: string): string {
  return name.trim().toLowerCase();
}
