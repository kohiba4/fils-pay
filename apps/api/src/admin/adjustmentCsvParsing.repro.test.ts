/**
 * Phase-1 repro for AUD-012 (CSV import reads BD with 2 decimals). Written to
 * FAIL on the current code and pass once `parseAdjustmentAmountFils` uses
 * `parseBhdToFils` (ADR-0001: whole fils, <= 3 decimals, no junk).
 */
import assert from "node:assert/strict";
import { test } from "node:test";
import { parseAdjustmentAmountFils } from "./adjustmentCsvParsing.js";

test("AUD-012: 4.75 BD is 4750 fils (not 475)", () => {
  assert.equal(parseAdjustmentAmountFils("4.75"), 4_750);
});

test("AUD-012: 4.755 BD keeps its third decimal (4755 fils)", () => {
  assert.equal(parseAdjustmentAmountFils("4.755"), 4_755);
});

test("AUD-012: whole BD and negatives scale by 1000", () => {
  assert.equal(parseAdjustmentAmountFils("12"), 12_000);
  assert.equal(parseAdjustmentAmountFils(" -4.750 "), -4_750);
  assert.equal(parseAdjustmentAmountFils("0.005"), 5);
});

test("AUD-012: more than 3 decimals is rejected, not silently truncated", () => {
  assert.throws(() => parseAdjustmentAmountFils("4.7555"), /could not parse amount/);
});

test("AUD-012: thousands separators and locale commas are rejected", () => {
  assert.throws(() => parseAdjustmentAmountFils("1,234.500"), /could not parse amount/);
  assert.throws(() => parseAdjustmentAmountFils("4,75"), /could not parse amount/);
});
