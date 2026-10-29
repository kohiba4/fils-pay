# 0007. Balance cache rebuilds read the ledger

- **Status:** Accepted
- **Date:** 2026-10-29
- **Supersedes:** 0004 (Balance cache rebuild source)
- **Related:** AUD-015 (FP-203), AUD-048, 0006

## Context

ADR-0004 let the admin "Rebuild cached balances" button read `scheme_export_lines`
(via the view `merchant_payable_position`) because walking the ledger was thought too slow for a
30 s HTTP request. That sum is the all-time truncated GROSS of exported scheme lines: it ignores fees,
payouts and adjustments, so it is not a balance. Reproduced on the seed: Alpha Retail ledger payable
136,496,486 fils vs 7,326,770 fils from the button (the brief's 135K to 7K). The CLI, which reads the
ledger, was right. HANDOVER already said "there shouldn't be a button that reads anything else".

## Decision

The button and the CLI share ONE implementation, `ledger.RebuildAllBalances`: payable =
SUM(credits - debits) of `merchant_payable` in `ledger_entries`. The slowness concern is addressed by
aggregating the ledger in a single `GROUP BY merchant_id` query (not one query per merchant) and by
locking the cache rows up front. `RefreshBalanceCache` and its view-based path were removed.

## Consequences

- The button and `settlement rebuild-balances` always agree.
- Known remaining problem (AUD-048): the incremental cache adds a capture's net at batch CLOSE while the
  ledger counts it at CAPTURE, so a rebuild with unbatched captures is double counted at the next close.
- Adjust balance stays display-only (ADR-0006) and is overwritten by a rebuild.
