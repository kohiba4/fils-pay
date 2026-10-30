# AUD-019 — Acquirer callbacks are not deduplicated — FP-201 (reopened)

| Field | Value |
|---|---|
| Owner | B |
| Severity | **Medium** |
| Category | idempotency |
| Status | **fixed** (merged with PR #27/#28) (runtime-verified locally on 55433; independently reviewed 2026-10-30: confirmed) |
| Fix commit | uncommitted on local branch fix/AUD-046-024-merchant-write-authority (stack); patch stack/08-AUD-019.patch |

## Summary
Acquirer callbacks are not deduplicated — FP-201 (reopened).

## Location
apps/api/src/acquirer/callbacks.ts:28-55, db/migrations/0051

**Sibling locations checked:** Postmortem/CHANGELOG/commit bf66bf2 claim `processed_events`; the table, the index (FP-238) and the commit content do not exist (bf66bf2 is an empty commit).

## Root cause
Plain INSERT per callback; no unique on callback_id, no processed_events; `withCallbackRetry` can re-run the insert.

## Reproduction / evidence
Trace + git show bf66bf2 (empty).

## Impact
Duplicate notes on the timeline; any future state-changing callback would double-apply.

## Fix (proposed)
New migration: unique index on (callback_id); INSERT … ON CONFLICT DO NOTHING (de-dup existing rows first).

## Fix (applied, Track B, 2026-10-30)
Discovered in the Phase 0 team audit unless stated; repaired here. Base `main` af8e9c9, uncommitted working tree in `~/Desktop/hakathons/fils-pay-hackathon`; patch `~/Desktop/hakathons/track-b-patches/stack/08-AUD-019.patch`.
**Root cause (confirmed by test).** `acquirer/callbacks.ts` did a plain INSERT per callback; no unique key, no
`processed_events` table (commit bf66bf2 is empty). Redeliveries and `withCallbackRetry` repeats appended notes.
**Actual impact:** duplicate fraud-review notes per transaction. Callbacks change no transaction status or ledger
(the apply function only inserts a note), so no money effect today; any future state-changing callback would
double-apply.

**Change.**
- Migration **`0081_acquirer_callback_notes_dedupe.sql`**: `duplicate_of_note_id` column; existing duplicates are kept and
  marked (later copies point at the earliest note of the same `(transaction_id, callback_id)`); partial unique index
  `uq_acquirer_callback_notes_txn_callback` on `(transaction_id, callback_id) WHERE duplicate_of_note_id IS NULL`.
  No rows are deleted. No code reads the notes table today; any future reader must skip marked rows.
- `acquirer/callbacks.ts`: `INSERT … ON CONFLICT (transaction_id, callback_id) WHERE duplicate_of_note_id IS NULL DO NOTHING`.
  Response stays `{ received: true }` for a duplicate (acquirer contract unchanged).
- Not ported: the earlier repair's DELETE of existing duplicates and its `{duplicate}` response field.

**Tests:** three tests appended to `apps/api/src/routes/acquirerCallbacks.test.ts` (`AUD-019: a redelivered callback…`,
`AUD-019: concurrent deliveries…`, `AUD-019: distinct callbacks are all kept…`). On `main`: 3 deliveries → 3 notes, 10
concurrent → 10 notes (fail); after: 1 and 1. Callback tests 18/18.
**Upgrade check (manual, 55433):** 3 historical copies inserted before applying 0081 → after migrate all 3 rows remain,
the earliest unmarked, the other two marked.

## Re-attack notes
- Sequential redelivery ×3 and 10 concurrent copies: one note each, every response 200 `{received:true}`.
- Same callbackId on a different transaction: kept (dedupe scope is per transaction).
- Dedupe runs after signature verification in the route, so an unsigned forgery cannot pre-empt a real callback's id
  once signatures are required (see AUD-021).
- Independent skeptical review (2026-10-30, `docs/audit/reviews/2026-10-30-track-b-batch.md`): **CONFIRMED** — regression test fails with the fix reverted, passes with it; 0081 upgrade verified on planted duplicates (earliest kept, ties by id, nothing deleted; re-run is a no-op). **Open, non-blocking:** a reused `callbackId` with a different outcome/note is answered 200 and silently dropped (log or 409 on mismatch).

## Related
AUD-021
