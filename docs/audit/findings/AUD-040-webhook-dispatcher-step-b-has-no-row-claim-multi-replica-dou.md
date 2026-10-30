# AUD-040 — Webhook dispatcher Step B has no row claim (multi-replica double send)

| Field | Value |
|---|---|
| Owner | B |
| Severity | **Low** |
| Category | race |
| Status | deferred: limitation under the supported single-replica deployment (no change) |
| Fix commit | none (docs only; recorded in stack/12-AUD-040-docs-AUD-018.patch) |

## Summary
Webhook dispatcher Step B has no row claim (multi-replica double send).

## Location
apps/api/src/webhooks/dispatcher.ts:239-250

**Sibling locations checked:** index.ts comment claims SKIP LOCKED — absent.

## Root cause
Plain SELECT of due rows; two replicas send the same delivery.

## Reproduction / evidence
Trace; single replica today.

## Impact
Duplicate deliveries when scaled.

## Fix (proposed)
FOR UPDATE SKIP LOCKED claim.

## Fix (applied, Track B, 2026-10-30)
Discovered in the Phase 0 team audit unless stated; repaired here. No code change; this record is in `~/Desktop/hakathons/track-b-patches/stack/12-AUD-040-docs-AUD-018.patch`.
**Disposition: deferred limitation, no behaviour change.**
- Step B is a plain `SELECT … ORDER BY next_attempt_at LIMIT 100` with no row claim, so two processes running the
  dispatcher at once could send the same delivery. Confirmed by reading.
- Not reachable in the supported deployment: `ops/docker-compose.yml` runs one API container (no `replicas`/`scale`),
  and ARCHITECTURE describes one service per role. Within one process `startWebhookDispatcher` never overlaps passes
  (`running` guard), so one replica never double-claims. TRIAGE's LIMITATION verdict stands.
- The `index.ts` comment "SKIP LOCKED in the claim query makes multiple replicas safe" is **false** (no SKIP LOCKED
  exists). FH's "staging ran 2 replicas, never saw a dup" is unverifiable. Both should be corrected; not changed here.
- The earlier uncommitted lease/`FOR UPDATE SKIP LOCKED` repair was deliberately **not** ported (optional hardening).
- **If the API is ever scaled out:** claim rows with `UPDATE … WHERE id IN (SELECT … FOR UPDATE SKIP LOCKED) RETURNING`,
  pushing `next_attempt_at` forward by a lease longer than one request timeout; test two concurrent passes, a stale
  lease after a crash, and retries. Even then, delivery is at-least-once (a crash after send and before the status
  write re-sends); receivers dedupe on `Webhook-Delivery-Id`.
- Kept separate from AUD-018 (duplicate business events/disbursement rows), which a row claim would not fix.

## Re-attack notes
- Single process: overlapping passes prevented by the `running` flag (read, not tested here).
- No test added: there is no supported multi-replica configuration to test against.
- Independent skeptical review: **pending**.

## Related
AUD-018
