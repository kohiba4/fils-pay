# AUD-041 — Reporting consumer drops merchant_id on real events (4 failing tests)

| Field | Value |
|---|---|
| Owner | B |
| Severity | **Medium** |
| Category | reporting |
| Status | disproven as a production defect; test-fixture pollution repaired (verified locally; review pending) |
| Fix commit | uncommitted on local branch fix/AUD-046-024-merchant-write-authority (stack); patch stack/16-AUD-044-docs-AUD-041.patch |

## Summary
Reporting consumer drops merchant_id on real events (4 failing tests).

## Location
apps/reporting/src/consumer/applyEvent.ts:22-31

**Sibling locations checked:** enqueueEvent JSON.stringify → jsonb; FH's 'double-encoded payload' note.

## Root cause
To trace in Phase 1.

## Reproduction / evidence
Baseline: `null value in column "merchant_id" of relation "merchant_daily_volume"`.

## Impact
Dashboards/rollups stop; FP-300 reports.

## Fix (proposed)
TBD.

## Fix (applied, Track B, 2026-10-30)
Discovered in the Phase 0 team audit unless stated; repaired here. Base `main` af8e9c9, uncommitted working tree in `~/Desktop/hakathons/fils-pay-hackathon`; patch `~/Desktop/hakathons/track-b-patches/stack/16-AUD-044-docs-AUD-041.patch`.
**Verdict: not a production defect — test-fixture pollution (now repaired).**
- Producers checked: `payments/capture.ts` (`merchantId`, `amountCapturedFils`, …), `payments/void.ts` (`{ merchantId }`) and
  the Go `settlement.batch_closed` producer all include `merchantId`; `applyEvent.ts` reads exactly those fields.
- Experiment 1: reporting suite alone on a freshly migrated 55433 DB → **12/12**. After the API suite on the same DB → 7/11
  (`main` baseline) with `null value in column "merchant_id" of relation "merchant_daily_volume"`.
- Experiment 2 (controlled): fresh DB, run only `apps/api/src/webhooks/archiveReplay.test.ts`, then reporting → 8/12, same
  error; the DB then held `transaction.captured` / `transaction.voided` outbox rows with payload `{}` that no producer emits.
- Root cause: `archiveReplay.test.ts insertDelivery` created FK-only outbox rows with payload `'{}'` under real event types.
  The reporting consumer correctly reads every captured/voided row in the shared DB; the NOT NULL failure rolls back the
  whole pass (by design, `runConsumerPass` test 11), so every later reporting test fails.

**Change (test only).** The fixture now inserts the producers' payload shape for the endpoint's own merchant. Production
event handling is unchanged (deliberately: invalid fixtures must not be accommodated). Other `payload: {}` uses were
checked: `packages/events/src/outbox.test.ts` and `webhooks/envelope.test.ts` use fake clients / no DB.

**Result after the change:** fresh DB, archiveReplay 4/4 then reporting 12/12; full-suite checkpoint recorded in the
Track B handoff.

## Re-attack notes
- What this proves: on isolated data the consumer handles real producer shapes; the 4 failures were caused by one test
  file's fixture. What it does not prove: that no future producer omits `merchantId` (a malformed event still halts the
  consumer by design; that design is Track A/B shared and unchanged).
- Independent skeptical review: **pending**.

## Related
—
