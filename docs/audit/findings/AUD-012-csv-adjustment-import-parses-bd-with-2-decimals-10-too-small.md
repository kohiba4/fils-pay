# AUD-012 — CSV adjustment import parses BD with 2 decimals (10× too small, 3rd decimal dropped)

| Field | Value |
|---|---|
| Owner | A |
| Severity | **High** |
| Category | money / parsing |
| Status | confirmed (trace) |
| Fix commit | — (not fixed; Phase 2) |

## Summary
CSV adjustment import parses BD with 2 decimals (10× too small, 3rd decimal dropped).

## Location
apps/api/src/lib/decimal.ts:4-19 (`parseDecimalMinor(raw, decimals = 2)`), apps/api/src/admin/adjustmentCsvParsing.ts:6

**Sibling locations checked:** `parseBhdToFils` in packages/money is correct; `parsePromotionalDiscountFils` (payments/discountAdjustment.ts:13) uses `parseFloat*100` (same class); admin UI `bhd()` copies to check.

## Root cause
Importer calls `parseDecimalMinor` with the default `decimals = 2`, i.e. cents. '4.75' → 475 fils (0.475 BD); '4.755' → 475 (third digit truncated).

## Reproduction / evidence
Trace. Finance: 4.75 → 0.475 (matches). Their '4.755 → 4.750' figure does not match this code path exactly (code gives 0.475) — to reproduce in Phase 1. Slack: sheet 4,141.90 vs screen 414,190 fils = 414.190 BD (10× low).

## Impact
Every adjustment posted to the ledger at 1/10th; August imports affected; March 4.75-ish gap may be one of these rows.

## Fix (proposed)
Use `parseBhdToFils` (rejects >3 decimals, junk, '1e3'); decide policy for thousands separators (reject).

## Re-attack notes
_To be filled after the fix (bypass via other route / tenant / retry / concurrency)._

## Related
AUD-036
