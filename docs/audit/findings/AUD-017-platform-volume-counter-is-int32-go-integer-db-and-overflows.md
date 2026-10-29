# AUD-017 — Platform volume counter is int32 (Go) / INTEGER (DB) and overflows

| Field | Value |
|---|---|
| Owner | A |
| Severity | **High** |
| Category | money / overflow |
| Status | confirmed (trace) |
| Fix commit | — (not fixed; Phase 2) |

## Summary
Platform volume counter is int32 (Go) / INTEGER (DB) and overflows.

## Location
apps/settlement/internal/settlement/platform_volume.go, db/migrations/0049, apps/api/src/fees/platformVolumeTier.ts

**Sibling locations checked:** Comments claim BIGINT / 64-bit INTEGER — false.

## Root cause
`current + int32(batchGross)` wraps past 2,147,483,647 fils (≈2.15M BD); threshold 2,000,000,000 is just below. Once wrapped, the counter goes negative and the tier switches off (or the UPDATE fails range check depending on value).

## Reproduction / evidence
Trace + threshold history: `git log -S2_000_000_000` shows the constant present from the first fees commit (3f9ee27), so the repeated 'threshold bumped in d69a813 / approved by finance' claim has no commit behind it in this history and finance (Huda) did not know of it. Seed counter is 69,418 fils, far below the threshold, so the tier is dormant in test data; production state unknown. int32 wraps at 2,147,483,647 fils (≈2.15M BD), only 147M fils above the threshold.

## Impact
Fee rate flips platform-wide; capture and close read the tier at different times; potential CloseBatch failure.

## Fix (proposed)
BIGINT column (new migration) + int64 in Go; question: should the unapproved tier exist at all?

## Re-attack notes
_To be filled after the fix (bypass via other route / tenant / retry / concurrency)._

## Related
AUD-016
