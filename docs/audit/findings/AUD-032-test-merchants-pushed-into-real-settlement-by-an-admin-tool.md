# AUD-032 — Test merchants pushed into real settlement by an admin tool

| Field | Value |
|---|---|
| Owner | B |
| Severity | **Medium** |
| Category | data integrity |
| Status | fix ready, not merged (runtime-verified locally on 55433; independently reviewed 2026-10-30: confirmed) |
| Fix commit | uncommitted on local branch fix/AUD-046-024-merchant-write-authority (stack); patch stack/14-AUD-032.patch |

## Summary
Test merchants pushed into real settlement by an admin tool.

## Location
apps/api/src/admin/merchantFlags.ts:4-21 via routes/adminMerchantsRecompute.ts

**Sibling locations checked:** CloseBatch/RunDailyBatch correctly exclude test_mode; authorize doesn't block test merchants (by design).

## Root cause
'Recompute transaction statuses' clears `test_mode` whenever the merchant has no open authorizations.

## Reproduction / evidence
Trace; Slack 2026-09-19 'testModeCleared: true' for Gamma.

## Impact
Sandbox captures settle and pay out as real money. Chat claim TRUE.

## Fix (proposed)
Remove the side effect (a status recompute must not change merchant mode).

## Fix (applied, Track B, 2026-10-30)
Discovered in the Phase 0 team audit unless stated; repaired here. Base `main` af8e9c9, uncommitted working tree in `~/Desktop/hakathons/fils-pay-hackathon`; patch `~/Desktop/hakathons/track-b-patches/stack/14-AUD-032.patch`.
**Root cause (confirmed by test).** `routes/adminMerchantsRecompute.ts` called `admin/merchantFlags.ts reconcileSandboxFlag`
inside the recompute transaction, which sets `merchants.test_mode = false` whenever the scan saw transactions and no
open authorizations. Settlement (`apps/settlement/internal/settlement/batch.go`, Track A, unchanged) selects only
`test_mode = false` merchants, so the next close settled and paid out sandbox captures.

**Change.** The route no longer calls `reconcileSandboxFlag`; `flagsUpdated` stays in the response (the admin UI type
expects it) and is always `[]`. `admin/merchantFlags.ts` is now unreferenced and left in place (dead code; removal is
cleanup). No Go or settlement change needed.

**Tests:** `apps/api/src/routes/adminMerchantsRecompute.test.ts` (new; finance admin over HTTP, a test-mode merchant with
one captured transaction and no open authorizations). On `main`: `flagsUpdated: ["test_mode"]` and the flag cleared
(fails); after: `[]` and `test_mode` still true. **Tests changed:** none.

## Re-attack notes
- The flag survives the exact condition that used to clear it; settlement eligibility therefore stays excluded by the
  Go filter (read, not re-run here).
- Data: merchants already cleared by this tool (Slack 2026-09-19 "testModeCleared: true" for Gamma) are not restored;
  that needs ops/finance to decide which merchants were really sandbox. Track A owns any settled sandbox volume.
- No other code path writes `test_mode = false` (grep of apps/api).
- Independent skeptical review (2026-10-30, `docs/audit/reviews/2026-10-30-track-b-batch.md`): **CONFIRMED** — regression test fails with the fix reverted, passes with it; no other writer of `test_mode = false`. Data-repair lookup for affected merchants: `admin_audit_log` where `action='transaction_status_recompute'` and `metadata->'flagsUpdated' ? 'test_mode'`.

## Related
—
