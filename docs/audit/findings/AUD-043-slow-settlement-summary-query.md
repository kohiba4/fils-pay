# AUD-043 — Slow settlement summary query

| Field | Value |
|---|---|
| Owner | B |
| Severity | **Low** |
| Category | performance |
| Status | fix ready, not merged (wrong totals fixed and measured; slowness not reproduced, no index; review pending) |
| Fix commit | uncommitted on local branch fix/AUD-046-024-merchant-write-authority (stack); patch stack/19-AUD-043.patch |

## Summary
Slow settlement summary query.

## Location
apps/api/src/settlement/query.ts; missing index transaction_events(transaction_id, event_type)

**Sibling locations checked:** perf doc's '38% higher' summary vs batches explained away by an AI answer — likely a double count, to check.

## Root cause
To verify with EXPLAIN.

## Reproduction / evidence
docs/perf/2026-07-settlement-summary-slow.md

## Impact
Slow page; possibly wrong totals.

## Fix (proposed)
TBD.

## Fix (applied, Track B, 2026-10-30)
Discovered in the Phase 0 team audit unless stated; repaired here. Base `main` af8e9c9, uncommitted working tree in `~/Desktop/hakathons/fils-pay-hackathon`; patch `~/Desktop/hakathons/track-b-patches/stack/19-AUD-043.patch`.
**Two questions separated.**
1. **Wrong totals — BUG (runtime, measured), fixed.** `settlement/query.ts getSettlementSummary` joined each capture event to
   its transaction and summed `transactions.captured_fils` (the cumulative total) per event row: an N-part capture counted
   N × its full total, and capture parts outside the window leaked in. On a disposable DB mirroring the perf note
   (41,380 transactions × 3 partial captures + 140,000 single-capture transactions of another merchant, 404,140 events),
   June 2026 (Bahrain): **`main` 372,420,000 fils vs 124,140,000 fils** of capture events in the window (3×). The perf doc's
   "38% higher" for Delta Wholesale is this bug; the "timing difference that resolves at month end" explanation (from a
   chatbot answer recorded in the doc) is false. Change: `SUM(te.amount_fils)` and `COUNT(DISTINCT te.transaction_id)`
   over the same join and filters. Track A never modified this function (checked `git diff 8b58b0f HEAD`); the
   reconciliation report in the same file (A-owned, FP-300) is untouched.
2. **Slow query — not reproduced; no index added.** Same dataset, warm: `main` 167 ms, corrected query 58 ms (parallel
   seq scan + hash join). Candidate index `transaction_events (event_type, occurred_at)` on the perf DB: planner kept the
   seq scan (149 ms), so no evidence for it; the perf doc's suggested `(transaction_id, event_type)` cannot serve this
   filter either. The doc's 3.4 s came from `shared_buffers = 32 MB` on the hosted instance (raised to 128 MB there).
   Dataset size: 181,380 transactions, 404,140 events. `EXPLAIN (ANALYZE, BUFFERS)` outputs saved in
   `~/Desktop/hakathons/track-b-patches/evidence/` (`explain043*.sql`, `perf043.sql`, outputs).

**Tests:** `apps/api/src/settlement/summaryTotals.test.ts` (new): one 3-part capture with one part just after Bahrain
midnight (outside) + one single capture at 23:59:59 Bahrain; expected 2 transactions / 2,700 fils. On `main`: 6,700 (fails);
after: passes. Settlement tests 15/15. **Tests changed:** none.

## Re-attack notes
- Window edges: 00:00:00 Bahrain included, next 00:00:00 excluded, 23:59:59 included.
- Merchant scope unchanged (`t.merchant_id = $1`).
- **Behaviour change merchants will see:** the settlement page's captured total drops for multi-capture merchants (it was
  overstated). Worth a support note; Track A should confirm it now ties to batch gross for the same Bahrain days.
- Independent skeptical review: **pending**.

## Related
—
