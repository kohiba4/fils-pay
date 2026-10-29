/**
 * Asia/Bahrain is a fixed UTC+3 (no DST), so its calendar date is plain
 * arithmetic on the UTC instant. Same technique as apps/reporting's
 * bahrainDate.ts; settlement days are Bahrain days, not browser-local or UTC.
 */
const BAHRAIN_OFFSET_MS = 3 * 60 * 60 * 1000;

/** The previous Asia/Bahrain calendar day as YYYY-MM-DD. */
export function bahrainYesterday(now: Date = new Date()): string {
  const shifted = new Date(now.getTime() + BAHRAIN_OFFSET_MS - 24 * 60 * 60 * 1000);
  return shifted.toISOString().slice(0, 10);
}
