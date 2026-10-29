# AUD-048 — Cache and ledger define the balance differently: a rebuild is double counted at the next batch close

| Field | Value |
|---|---|
| Owner | A |
| Severity | **Medium** |
| Category | money / data integrity |
| Status | confirmed (runtime; repro committed as `TestRepro_AUD048_*`) |
| Fix commit | — (not fixed; Phase 2) |

## Summary
Cache and ledger define the balance differently: a rebuild is double counted at the next batch close.

## Location
apps/settlement/internal/balances/cache.go (`ApplyBatchClose`, `ApplyPayout`), batch.go step 14, ledger/rebuild.go

**Sibling locations checked:** CloseBatch posts no ledger legs; capture.ts posts payable legs at capture; PayoutBatch posts payout legs and reduces the cache; RecalculateMDR and the CSV import update both. The nightly 02:00 refresh in the docs does not exist in code.

## Root cause
The incremental cache adds a batch's net at CLOSE and subtracts it at PAYOUT, so it means 'settled, not yet paid'. The ledger credits the merchant's payable at CAPTURE, so it means 'captured, not yet paid'. A rebuild sets the cache to the ledger figure, which already contains the captures that are still unbatched; the next close adds their net again and the payout only removes it once.

## Reproduction / evidence
Scratch Go test (not committed; becomes a regression test with the fix): capture 100,000 fils at 2.5% fee. cache/ledger: after capture 0/97,500; after rebuild 97,500/97,500; after CloseBatch 195,000/97,500; after PayoutBatch 97,500/0 (the +97,500 stays until the next rebuild). Same for the CLI rebuild.

## Impact
_Severity lowered High to Medium after independent review: the cache only feeds the merchant dashboard (apps/api/src/admin/merchants.ts) and payout amounts come from `settlement_batches.net_payout_fils`, so this is a wrong DISPLAYED balance, not a wrong payment._

The displayed balance is inflated by the amount captured but unbatched at the moment of each rebuild; after that day's payout the extra stays until the next rebuild corrects it (and a rebuild during the next trading day re-inflates it). Support's 'Rebuild then Adjust' workflow makes it routine, so the rebuild button is not safe to use intraday. Also not covered by any cache writer: refunds post ledger legs but never touch the cache (processRefund.ts), so once refunds go live the cache drifts from the ledger even without a rebuild.

## Fix (proposed)
Decision needed on the definition (propose: balance = ledger payable). Options: (A) rebuild subtracts the net of capture events with `settlement_batch_id IS NULL` so it matches the incremental meaning (depends on AUD-016 so close and capture compute the same fee); (B) move the cache increment to capture time and drop it at close (cache == ledger always; touches api capture.ts and the Go close). Recommend (B) after AUD-016.

## Re-attack notes
_To be filled after the fix (bypass via other route / tenant / retry / concurrency)._

## Related
AUD-015, AUD-016, AUD-037, AUD-049
