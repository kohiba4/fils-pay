# AUD-050 — Manual credit MDR reversal uses the fallback rate, not the rate that was charged

| Field | Value |
|---|---|
| Owner | A |
| Severity | **Medium** |
| Category | money / duplicate logic |
| Status | confirmed (trace) |
| Fix commit | — (not fixed; Phase 2) |

## Summary
Manual credits reverse the MDR using `merchants.mdr_bps` (the default rate) instead of the rate in force when the fee was charged.

## Location
apps/api/src/admin/credits.ts:212-224 (`createCreditRequest`), apps/api/src/admin/creditThreshold.ts:19-21 (`calculateCreditFeeReversal`)

**Sibling locations checked:** capture resolves the rate with `getEffectiveMdrBps` (effective-dated, minus the tier bonus) and the Go close adds the negotiated discount; `processRefund` reads the fee actually charged from the ledger (correct); `settlement/query.ts` pending-fee estimate also uses `merchants.mdr_bps` (AUD-016).

## Root cause
`createCreditRequest` selects only `merchants.mdr_bps` and applies it to the credited amount. The platform's real fee for a merchant with a `fee_schedules` history (and possibly a negotiated discount and the volume tier) is a different number; `merchants.mdr_bps` is only the fallback, "shown at onboarding" per migration 0048.

## Reproduction / evidence
Trace of the code. With the seed's Alpha Retail (`merchants.mdr_bps` 250, schedule row 225 in force since 2026-08-01), a 10,000.000 BD credit with "reverse the MDR" returns 250.000 BD of fee although payments were charged 225 bps (225.000 BD), over-reversing 25.000 BD. Not yet run as a test.

## Impact
Platform fee revenue is debited and the merchant credited with more fee than was ever charged for every merchant whose schedule differs from the default rate; the approval threshold ignores the reversal by design (ADMIN.md), so this is not gated.

## Fix (proposed)
Resolve the reversal rate with the same function/formula as capture and settlement (decision Q5, AUD-016), or reverse the fee actually charged on the original transactions. Decide with finance which one a "goodwill MDR reversal" means.

## Re-attack notes
_To be filled after the fix._

## Related
AUD-016, AUD-031
