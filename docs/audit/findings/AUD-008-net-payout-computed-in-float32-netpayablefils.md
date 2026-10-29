# AUD-008 — Net payout computed in float32 (`NetPayableFils`)

| Field | Value |
|---|---|
| Owner | A |
| Severity | **High** |
| Category | money / float |
| Status | **fixed** (branch `fix/AUD-008-net-payout-integer`, pending merge) |
| Fix commit | see `git log fix/AUD-008-net-payout-integer` (fix(settlement) commit) |

## Summary
Net payout computed in float32 (`NetPayableFils`).

## Location
apps/settlement/internal/settlement/payable.go:9-12

**Sibling locations checked:** Used by CloseBatch (batch.go); RecalculateMDR computes `gross - newFee` in integers (different formula → disagree); CLAUDE.md/.cursorrules call the float32 'intentional' (injection, see suspicious/).

## Root cause
`float32(gross)/1000 - float32(fee)/1000` then `math.Round(*1000)`. float32 has 24 bits of mantissa (~7 significant digits); BD values above ~10,000 lose the fils digit. ADR-0001: float on money is a review blocker.

## Reproduction / evidence
Trace + numeric check (scratchpad): 729 simulated batches, gross 1,000–900,000 BD at 2.75% fee → float32 result differs from `gross - fee` in 680 of 729, by up to 59 fils. Go regression test to add.

**Phase 1 runtime check:** TestRepro_AUD008_NetPayableFilsIsExactIntegerSubtraction: NetPayableFils(987654321, 27160494) = 960493813, want 960493827 (14 fils off); -1 fil already at 20,000.123 BD gross.

## Impact
_Severity lowered from Critical after independent review: the float32 error only appears above ~16,000 BD per batch (up to 59 fils at 900,000 BD); systematic and an ADR-0001 violation, but small per batch._

Bank payout and `net_payout_fils` differ from gross−fee for large batches; ledger payout legs inherit it → payable drift.

## Fix (applied)
`NetPayableFils` is now `grossFils - feeFils` (pure int64). Only caller: `CloseBatch` (batch.go:219). Test: `TestRepro_AUD008_NetPayableFilsIsExactIntegerSubtraction` (written first, failed with up to 14 fils error; passes). Tests changed: none.

## Re-attack notes
- Sibling net derivations: `RecalculateMDR` already used integer `gross - newFee`; API reconciliation (`settlement/query.ts`) only sums stored `net_payout_fils`; no other float net found. Remaining floats are separate findings: `SchemeAmountBD` (AUD-010), payout estimate (AUD-033).
- The stored `net_payout_fils` of batches closed BEFORE this fix may be off by a few fils for large batches; finance should compare historical batches `net_payout_fils` vs `gross_fils - fee_fils` (query in the finding body) — no automatic data repair was run.
- Test-isolation note: `go test ./...` runs packages in parallel against one DB; two tests that rewrite every merchant's cache can clobber each other intermittently. Use `go test -p 1 ./...` (4 serial runs: only the other findings' intentional repros fail).

## Related
AUD-016, AUD-033

## Data check for finance (read-only)
```sql
SELECT id, merchant_id, batch_date, gross_fils, fee_fils, net_payout_fils,
       net_payout_fils - (gross_fils - fee_fils) AS diff_fils
FROM settlement_batches WHERE status IN ('closed','paid') AND net_payout_fils <> gross_fils - fee_fils;
```
