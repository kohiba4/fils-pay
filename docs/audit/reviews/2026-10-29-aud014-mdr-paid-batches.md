# Independent review: AUD-014 MDR recalculation on paid batches (2026-10-29)

Reviewer: skeptical-reviewer charter (general-purpose subagent, `git archive` extract). Output is data; re-verified.

| Point | Disposition |
|---|---|
| **BLOCKING:** `priorMdrAdjustmentFils` double counts for a batch rewritten while CLOSED, then paid, then recalculated (2500 -> 4000 closed, paid, rate 300: code gave OldFeeFils 5500, diff -2500; correct 4000 -> 3000, diff -1000; merchant over-credited 1500; cache also wrong). Proven by the reviewer's scratch test | **Reproduced by the auditor** as `TestRecalculateMDR_RewrittenWhileClosedThenPaidThenRecalculated` (failed with the same numbers), then **fixed** with an explicit column `paid_fee_adjustment_fils` (migration 0073) instead of inferring from ledger descriptions; test passes |
| Prior-adjustment matching was a free-text description string | Removed (column) |
| Cache `ApplyBatchClose(-diff)` consistent with the ledger | Confirmed (it inherited the double count, now fixed) |
| Concurrency (recalc vs payout of the same batch) | Confirmed by trace: both lock the batch row `FOR UPDATE`; no concurrency test, acknowledged |
| API consumers compatible; stale comment `routes/admin.ts:264` | Confirmed; stale comment removed; `oldFeeFils` semantics documented |
| Tests: new tests fail on old code, existing tests untouched | Confirmed (old-code run not re-done by the reviewer) |
| Adjustments never reach a payout (finance gap) | Confirmed by grep; promoted in the finding as an item to ESCALATE to finance |
| Docs: "rerun is idempotent" true only for never-rewritten batches; CLAUDE.md lists AUD-014 as queued | Fixed in the finding; CLAUDE.md/tracker updated after merge |
