# AUD-037 — 'Adjust balance' writes the cache only; ADMIN.md says it is journaled

| Field | Value |
|---|---|
| Owner | A |
| Severity | **Low** |
| Category | data integrity / docs |
| Status | by design (ADR-0006); documentation fixed (docs/ADMIN.md corrected), no code change |
| Fix commit | — (not fixed; Phase 2) |

## Summary
The console's **Adjust balance** changes only `merchant_balances` (display cache) and audits it. That is exactly what ADR-0006 decided. `docs/ADMIN.md` says the opposite ("journaled to the ledger"), so the documentation is wrong, not the code.

## Location
apps/api/src/admin/balanceAdjustments.ts; ADR-0006 vs ADMIN.md

**Sibling locations checked:** Journaled variant exists, not exposed.

## Root cause
None in code. `routes/adminBalanceAdjustments.ts` calls `applyBalanceCorrection` (cache-only) as ADR-0006 specifies; the journaled variant `adjustMerchantBalanceJournaled` exists but is not wired to any route. ADMIN.md was written from a different draft ("merged from two drafts"). (An earlier version of this finding inferred the behaviour from the ADR without reading the code; the code check confirmed the ADR.)

## Reproduction / evidence
Read.

## Impact
No money bug. Consequence of the design (not new): a correction is overwritten by the next balance rebuild, so support must re-apply it, and it hides underlying ledger problems such as AUD-015. Support reading ADMIN.md may wrongly believe the ledger changed.

## Fix (proposed)
No code change. Documentation fixed on 2026-10-29 (`docs/ADMIN.md`: Adjust balance is display-only and is lost on a rebuild; the claimed nightly 02:00 recompute does not exist in the code; rebuild caveat AUD-048). Original proposal: correct `docs/ADMIN.md` (Adjust balance is display-only and is lost on rebuild). Whether to expose the journaled variant is a product/finance decision (meeting 2026-09-17 chose option A: leave as is).

## Re-attack notes
_To be filled after the fix (bypass via other route / tenant / retry / concurrency)._

## Related
AUD-015
