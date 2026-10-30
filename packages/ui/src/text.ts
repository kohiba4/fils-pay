/** Joins truthy class-name fragments. */
export function cx(...parts: Array<string | false | null | undefined>): string {
  return parts.filter(Boolean).join(" ");
}

/**
 * A backend enum value as a sentence-case label: `partially_captured` →
 * `Partially captured`. Display only — filters and requests keep sending the
 * raw value.
 */
export function humanize(value: string): string {
  const spaced = value.replace(/[_-]+/g, " ").trim();
  if (spaced === "") return value;
  return spaced[0]!.toUpperCase() + spaced.slice(1);
}

/** First visible character of a name, for avatar tiles. */
export function initial(value: string | null | undefined): string {
  const trimmed = (value ?? "").trim();
  return trimmed === "" ? "?" : [...trimmed][0]!.toUpperCase();
}

/**
 * Splits a formatted amount such as `"1234.567 BHD"` into its number and
 * unit so the unit can be styled smaller. Never parses or re-formats the
 * number: the text comes from the shared money formatter and is kept as-is.
 */
export function splitAmount(formatted: string): { amount: string; unit: string } {
  const space = formatted.lastIndexOf(" ");
  if (space <= 0) return { amount: formatted, unit: "" };
  return { amount: formatted.slice(0, space), unit: formatted.slice(space + 1) };
}
