# AUD-017 — Platform volume counter is int32 (Go) / INTEGER (DB) and overflows

| Field | Value |
|---|---|
| Owner | A |
| Severity | **High** |
| Category | money / overflow |
| Status | **fixed** (branch `fix/AUD-017-volume-counter-bigint`, pending merge; the tier approval question remains open) |
| Fix commit | see `git log fix/AUD-017-volume-counter-bigint` |

## Summary
Platform volume counter is int32 (Go) / INTEGER (DB) and overflows.

## Location
apps/settlement/internal/settlement/platform_volume.go, db/migrations/0049, apps/api/src/fees/platformVolumeTier.ts

**Sibling locations checked:** Comments claim BIGINT / 64-bit INTEGER — false.

## Root cause
`current + int32(batchGross)` wraps past 2,147,483,647 fils (≈2.15M BD); threshold 2,000,000,000 is just below. Once wrapped, the counter goes negative and the tier switches off (or the UPDATE fails range check depending on value).

## Reproduction / evidence
Trace + threshold history: `git log -S2_000_000_000` shows the constant present from the first fees commit (3f9ee27), so the repeated 'threshold bumped in d69a813 / approved by finance' claim has no commit behind it in this history and finance (Huda) did not know of it. Seed counter is 69,418 fils, far below the threshold, so the tier is dormant in test data; production state unknown. int32 wraps at 2,147,483,647 fils (≈2.15M BD), only 147M fils above the threshold.

**Phase 1 runtime check:** TestRepro_AUD017_PlatformVolumeCounterDoesNotOverflow: counter 2,147,000,000 + 1,000,000 fils → stored -2,146,967,296 (tier would silently switch off).

## Impact
Fee rate flips platform-wide; capture and close read the tier at different times; potential CloseBatch failure.

## Fix (applied; decision Q7: fix the overflow, keep the behaviour)
- Migration **0074**: `platform_stats.total_processed_fils` INTEGER -> BIGINT (single-row table).
- Go (`settlement/platform_volume.go`): the counter is `int64` end to end (`ReadAndLockPlatformProcessedFils`, `RecordPlatformProcessedVolume`, `VolumeTierMdrBonusBps`); the old `int32(batchGrossFils)` truncation is gone.
- TS (`api/src/fees/platformVolumeTier.ts`): node-pg returns BIGINT as a string, so the value is parsed with `Number()` (safe to 2^53, about 9e15 fils); the false "is BIGINT" comment is now true and says why.
- Tests (written first; Go failed to compile on the int32 param, TS failed `value "3000000000" is out of range for type integer`, and the Phase-1 repro showed 2,147,000,000 + 1,000,000 -> -2,146,967,296): `TestRepro_AUD017_*` now passes, `TestVolumeTierMdrBonusBps_AboveInt32Max`, `TestPlatformStatsCounterColumnIsBigint`, and the TS test `a lifetime volume above int32 max (3,000,000,000 fils) keeps the tier bonus on`. Existing tests unchanged apart from one scan variable widened to int64 and a stale "nvm its bigint" comment.

## Re-attack notes
- **Deploy order: run migration 0074 first.** New code against the old INTEGER column still works below 2^31; old code against the new BIGINT column also works until the value exceeds int32, so there is no window where the tier flips.
- Other readers of the counter: only `capture.ts` (via `getVolumeTierBonusBps`) and `CloseBatch`; the seed inserts 0. No other `int32` money field found in `apps/settlement` (`LineSequence int32` and the pool size are not money).
- **Not fixed, business question (needs finance):** nothing in the repo shows written sign-off for the platform-wide 0.15% tier discount (YA's handover required it, Huda "did not know", and the "threshold bumped in d69a813" claim has no commit behind it: the 2,000,000,000 constant exists from the first fees commit). The counter is dormant in test data (69,418 fils) but production state is unknown. Capture and close also read the counter at different moments, so a capture just before the tier flips can be priced differently from its batch (AUD-016).
- Counter semantics are unchanged: it is the lifetime sum of batch GROSS fils at close, never decremented by refunds or MDR recalculation.

## Related
AUD-016
