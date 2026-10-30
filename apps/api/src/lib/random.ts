import { randomInt } from "node:crypto";

/** Generates a string of `n` random decimal digits (e.g. "042817").
 *  AUD-023: `crypto.randomInt`, never `Math.random()` — V8's Math.random is a
 *  predictable xorshift stream whose state can be recovered from outputs. */
export function randomDigits(n: number): string {
  let out = "";
  for (let i = 0; i < n; i++) out += String(randomInt(0, 10));
  return out;
}

/** Generates a string of `n` characters drawn uniformly from `alphabet`. */
export function randomFromAlphabet(alphabet: string, n: number): string {
  let out = "";
  for (let i = 0; i < n; i++) {
    // AUD-055: payment-link tokens are bearer identifiers; use a CSPRNG.
    out += alphabet[randomInt(0, alphabet.length)];
  }
  return out;
}

/** Short display-only reference for receipts and logs (e.g. "FP-A7K2M3"). */
export function displayReference(): string {
  return `FP-${randomFromAlphabet("ABCDEFGHJKLMNPQRSTUVWXYZ23456789", 6)}`;
}
