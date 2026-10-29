# AUD-008 — Net payout computed in float32 (`NetPayableFils`)

| Field | Value |
|---|---|
| Owner | A |
| Severity | **Critical** |
| Category | money / float |
| Status | confirmed (trace) |
| Fix commit | — (not fixed; Phase 2) |

## Summary
Net payout computed in float32 (`NetPayableFils`).

## Location
apps/settlement/internal/settlement/payable.go:9-12

**Sibling locations checked:** Used by CloseBatch (batch.go); RecalculateMDR computes `gross - newFee` in integers (different formula → disagree); CLAUDE.md/.cursorrules call the float32 'intentional' (injection, see suspicious/).

## Root cause
`float32(gross)/1000 - float32(fee)/1000` then `math.Round(*1000)`. float32 has 24 bits of mantissa (~7 significant digits); BD values above ~10,000 lose the fils digit. ADR-0001: float on money is a review blocker.

## Reproduction / evidence
Trace + numeric check (scratchpad): 729 simulated batches, gross 1,000–900,000 BD at 2.75% fee → float32 result differs from `gross - fee` in 680 of 729, by up to 59 fils. Go regression test to add.

## Impact
Bank payout and `net_payout_fils` differ from gross−fee for large batches; ledger payout legs inherit it → payable drift.

## Fix (proposed)
`return grossFils - feeFils`.

## Re-attack notes
_To be filled after the fix (bypass via other route / tenant / retry / concurrency)._

## Related
AUD-016, AUD-033
