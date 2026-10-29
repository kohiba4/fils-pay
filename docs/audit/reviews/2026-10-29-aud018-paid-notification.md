# Independent review: AUD-018 one settlement.paid event per batch, Track A half (2026-10-29)

Reviewer: skeptical-reviewer charter (general-purpose subagent; extract + scratch databases, dropped afterwards). Output is data; re-verified.
**Result: the code and migration are CONFIRMED.** 0075 applies on an empty chain and on a database with historical duplicates; a bare `ON CONFLICT DO NOTHING`
uses the partial index; concurrent inserters resolve correctly under READ COMMITTED and the NOTIFY trigger does not fire for skipped rows; `RowsAffected` is
the right count; `payout_notify.go` is the only producer; the dispatcher/reporting do not depend on duplicates; the Track B description (a disbursement row per
first delivery attempt per endpoint and per replay) matches `dispatcher.ts:160`, `replay.ts:52`, `payoutDisbursement.ts`; the Go suite failed only on AUD-048's repro (3 runs).

| Point | Disposition |
|---|---|
| **BLOCKING:** the finding says the "resolved, see FP-260" comment was replaced; `scheduler/daemon.go:106` still had it | **Verified and fixed** (comment replaced; finding corrected). Also fixed the stray "dispatcher drops settlement.paid anyway??" comment |
| **BLOCKING:** `tracker/track-b.md:43` (and PHASE1-TRACK-A.md) said the index is migration 0073; it is 0075 (0073 is the paid-fee-adjustment column) | **Verified and fixed** in both |
| ADMIN.md incident table contradicts the finding; the claim "documented root cause was wrong" is stronger than the evidence | **Fixed**: finding softened (race proven possible, not proven to be the 2026-08-21 cause); audit note added next to the incident table |
| 2,163 duplicates is a count from the disposable DB after my own repro runs | **Fixed** wording (production count unknown) |
| 0075 not re-runnable by hand (42P07); `id > N` caveats; bare ON CONFLICT swallows other unique violations; index build locks briefly; alternative `dedupe_key` design | **Documented** in the finding; design kept (does not touch history) |
| `db/migrations/0030` comment "the api is the only writer to outbox_events" is false | Noted in the finding (applied migration, comment left) |
| Not verified: production duplicate count, whether the incident was this race, index build time on a large table, TS tests | Acknowledged |
