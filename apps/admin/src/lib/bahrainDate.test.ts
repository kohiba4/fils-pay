import assert from "node:assert/strict";
import test from "node:test";
import { bahrainYesterday } from "./bahrainDate.js";

/**
 * AUD-051: the default "re-run a daily batch" date must be the previous
 * Asia/Bahrain calendar day (fixed UTC+3), whatever timezone the browser is in.
 */

test("02:00 Bahrain on the 30th defaults to the 29th (was the 28th)", () => {
  // 02:00 +03:00 on 2026-10-30 is 23:00 UTC on the 29th
  assert.equal(bahrainYesterday(new Date("2026-10-29T23:00:00Z")), "2026-10-29");
});

test("just before and just after Bahrain midnight", () => {
  assert.equal(bahrainYesterday(new Date("2026-10-30T20:59:59Z")), "2026-10-29");
  assert.equal(bahrainYesterday(new Date("2026-10-30T21:00:00Z")), "2026-10-30");
});

test("midday Bahrain and month/year boundaries", () => {
  assert.equal(bahrainYesterday(new Date("2026-10-30T09:00:00Z")), "2026-10-29");
  assert.equal(bahrainYesterday(new Date("2026-03-01T10:00:00Z")), "2026-02-28");
  assert.equal(bahrainYesterday(new Date("2027-01-01T01:00:00Z")), "2026-12-31");
});
