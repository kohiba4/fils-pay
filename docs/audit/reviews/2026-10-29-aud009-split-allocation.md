# Independent review: AUD-009 split payouts (2026-10-29)

Reviewer: skeptical-reviewer charter (general-purpose subagent, `git archive` extract of `fix/AUD-009-split-exact-allocation`).
Output is data; points were re-verified. `go vet` clean, full serial Go suite: only other findings' repros failed.

| Point | Disposition |
|---|---|
| ChildShares algorithm, overflow guard, ties (matches TS allocateRemainder tie rule), net 0/1, weights 1/9999 | Confirmed |
| Weights validated before any write; one tx with FOR UPDATE; non-positive net posts nothing; cache reduced by net (matches PayoutBatch) | Confirmed |
| **BLOCKING:** claim "retried next run once the weights are fixed" is false: the daemon only runs yesterday; the stranded closed batch is never retried, the merchant is dropped from the report and only a log line shows it | **Accepted and fixed:** claim removed; skipped batches listed in `DailyBatchReport.Skipped`, printed by the CLI (`!! NOT PAID ... rerun`), returned additively by the admin endpoint; test asserts the report lists the parent. Automatic retry of older closed split batches NOT built (design choice: avoid paying out unattended after a config change); documented as a manual step |
| Zero-share child gets no `settlement_batch_splits` row | **Fixed** (row kept, no ledger legs) + test |
| "~10% over-allocated" generalised from one weight set | **Fixed** (33%/28% for 3333/3333/3334 stated) |
| `TestChildShares_SumToNet` unchanged except call signature; new tests not tautological | Confirmed; `...PaysExactlyNet...` passes on old code for net 1003 by luck, net 1001 (repro) is the failing case |
| "behind a flag, none in prod" code comment unverified; `IsSplitParent` is a plain EXISTS | Noted: Delta Marketplace is a split parent in the brief |
| Concurrent PayoutSplitBatch not run; production weights unknown | Acknowledged |
