# AUD-012 — CSV adjustment import parses BD with 2 decimals (10× too small, 3rd decimal dropped)

| Field | Value |
|---|---|
| Owner | A |
| Severity | **High** |
| Category | money / parsing |
| Status | **fixed** (branch `fix/AUD-012-csv-bd-parsing`, pending merge; historical data repair still needed) |
| Fix commit | see `git log fix/AUD-012-csv-bd-parsing` |

## Summary
CSV adjustment import parses BD with 2 decimals (10× too small, 3rd decimal dropped).

## Location
apps/api/src/lib/decimal.ts:4-19 (`parseDecimalMinor(raw, decimals = 2)`), apps/api/src/admin/adjustmentCsvParsing.ts:6

**Sibling locations checked:** `parseBhdToFils` in packages/money is correct; `parsePromotionalDiscountFils` (payments/discountAdjustment.ts:13) uses `parseFloat*100` (same class); admin UI `bhd()` copies to check.

## Root cause
Importer calls `parseDecimalMinor` with the default `decimals = 2`, i.e. cents. '4.75' → 475 fils (0.475 BD); '4.755' → 475 (third digit truncated).

## Reproduction / evidence
Trace. Finance: 4.75 → 0.475 (matches). Their '4.755 → 4.750' figure does not match this code path exactly (code gives 0.475) — to reproduce in Phase 1. Slack: sheet 4,141.90 vs screen 414,190 fils = 414.190 BD (10× low).

**Phase 1 runtime check:** adjustmentCsvParsing.repro.test.ts: "4.75" → 475 (want 4750), "4.755" → 475 (want 4755; finance reported 4.750 so their figure differs slightly), "12" → 1200, "4.7555" accepted silently. Existing tests ENCODE the bug: admin/adjustmentImport.test.ts:67 (parsedAmountFils 475, totalPostedFils 600) and a false README claim 'comment 1250 fils = 12.50 BD' in routes/adminAdjustmentImport.test.ts:236. Fix those tests with justification.

## Impact
Every adjustment posted to the ledger at 1/10th; August imports affected; March 4.75-ish gap may be one of these rows.

## Fix (applied)
- `adjustmentCsvParsing.ts`: `parseAdjustmentAmountFils` now calls `parseBhdToFils` from `packages/money` (string-based, ≤3 decimals, rejects junk/1e3/thousands separators/locale commas, handles whitespace and negatives, `-0.000` → 0). Failures still map to the same `400 invalid_amount` (error code and message unchanged).
- Removed `apps/api/src/lib/decimal.ts` (`parseDecimalMinor`, default `decimals = 2`): its only caller was the importer, and it is a trap for the next person.
- Repro tests (written first, failed): `adjustmentCsvParsing.repro.test.ts` (4.75, 4.755, 12, 4.7555, commas).
- **Tests changed (justified, expected values only, no assertion removed):** they asserted the 10x-too-small figures.
  - `admin/adjustmentImport.test.ts`: totalPostedFils 600→6000, parsedAmountFils 475→4750 and 125→1250, negative row 350→3500 (`-3.50` BD), cache 500→5000.
  - `routes/adminAdjustmentImport.test.ts`: totalPostedFils 600→6000; replaced the false comment ("4.75 -> 475 … 1250 fils = 12.50 BD"; 1250 fils is 1.250 BD).

## Re-attack notes
- Inputs tried by the tests: `4.75`, `4.755`, `12`, ` -4.750 `, `0.005`, `4.7555` (rejected), `1,234.500` and `4,75` (rejected), existing `abc` (400, rolled back).
- Sibling money parsers: `parsePromotionalDiscountFils` in `payments/discountAdjustment.ts` (`parseFloat * 100`, i.e. cents) is exported but has **no callers**; it is deleted with the discount rework in AUD-016. `apps/web/.../SettlementBatchDetailPage.tsx:84` uses `parseFloat((grossFils/10000).toFixed(2))` for a progress ratio (display only, not BD formatting; noted, low). The admin UI credit form already uses `parseBhdToFils`.
- Behaviour change to tell finance: amounts with more than 3 decimals (e.g. `4.7501`) used to be truncated silently and are now rejected with 400 `invalid_amount`.
- Review follow-up: the dead `parsePromotionalDiscountFils` (parseFloat × 100) was deleted in a separate commit; a stale test comment claiming trailing garbage is accepted was corrected.
- Remaining gap (separate finding AUD-036): importing the same file twice still posts it twice.

## HISTORICAL DATA REPAIR (finance decision; nothing was run)
Every adjustment imported before this fix was posted at 1/10th (and the third decimal dropped). `adjustment_import_rows` keeps the original text, so the shortfall is exact. Read-only check:
```sql
SELECT r.adjustment_import_id, r.row_number, r.merchant_id, r.raw_amount_text,
       r.parsed_amount_fils AS posted,
       round(replace(r.raw_amount_text,' ','')::numeric * 1000)::bigint AS correct,
       round(replace(r.raw_amount_text,' ','')::numeric * 1000)::bigint - r.parsed_amount_fils AS missing_fils
FROM adjustment_import_rows r
WHERE r.parsed_amount_fils <> round(replace(r.raw_amount_text,' ','')::numeric * 1000)::bigint;
```
Correction must be a new, reviewed, idempotent adjustment (finance sign-off), not an edit of ledger history. Slack shows at least the two August imports (33 and 31 rows) were affected; the March 4.75 BD gap may be related but cannot be proven from the repo.

## Related
AUD-036
