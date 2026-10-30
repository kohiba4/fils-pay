import { formatBhd, toFils } from "@filspay/money";

/**
 * The console's display helpers — one copy, replacing the identical `bhd()`
 * each page used to carry. Money goes through `@filspay/money`'s
 * `formatBhd` (three decimals, never rounded); never `/1000`, never
 * `toFixed` on fils.
 */
export function bhd(fils: number): string {
  // Negative amounts are legitimate here: balance corrections, fee
  // differences, refund-heavy batches.
  return `${formatBhd(toFils(fils, { allowNegative: true }))} BHD`;
}

/** A basis-points rate as a percentage, e.g. 275 → "2.75%". A rate, not money. */
export function percentFromBps(bps: number): string {
  return `${(bps / 100).toFixed(2)}%`;
}

/** Browser-local date and time, `—` when absent. */
export function dateTime(iso: string | null | undefined): string {
  return iso ? new Date(iso).toLocaleString() : "—";
}

/** Browser-local date, `—` when absent. */
export function dateOnly(iso: string | null | undefined): string {
  return iso ? new Date(iso).toLocaleDateString() : "—";
}

/** A long identifier shortened for dense tables, keeping both ends
 *  (`9972daab…3280`). The full value goes in a `title` and on detail pages. */
export function shortId(id: string): string {
  return id.length > 14 ? `${id.slice(0, 8)}…${id.slice(-4)}` : id;
}
