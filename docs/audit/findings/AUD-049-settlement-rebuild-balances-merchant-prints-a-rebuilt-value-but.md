# AUD-049 — `settlement rebuild-balances --merchant` prints a rebuilt value but never writes the cache

| Field | Value |
|---|---|
| Owner | A |
| Severity | **Low** |
| Category | ops tooling |
| Status | **fixed** (branch `fix/AUD-049-rebuild-one-merchant`) |
| Fix commit | see `git log fix/AUD-049-rebuild-one-merchant` |

## Summary
`settlement rebuild-balances --merchant` prints a rebuilt value but never writes the cache.

## Location
apps/settlement/cmd/settlement/main.go:148-160, internal/ledger/rebuild.go (`RebuildMerchantBalance`)

**Sibling locations checked:** The no-flag path (`RebuildAllBalances`) writes correctly.

## Root cause
`RebuildMerchantBalance` only SELECTs the ledger sum; the CLI then prints `rebuilt=<n>` and returns. A code comment ('--merchant writes the cache for that one merchant, same as the full rebuild') and RUNBOOK ('recompute it') say otherwise.

## Reproduction / evidence
Read of main.go and rebuild.go: no UPDATE/INSERT on the --merchant path. Reproduced by `TestRebuildOneMerchantBalance_WritesOnlyThatMerchant` (a drifted cache of 999999 stays 999999 when only the read-only function is used; it needs the new write path to become 10000).

## Impact
An operator following the RUNBOOK for a single wrong balance sees a correct-looking number but the dashboard cache stays wrong.

## Fix
`RebuildAllBalances` is now a thin wrapper over one private `rebuildBalances(ctx, db, only *uuid.UUID)`; the new `RebuildOneMerchantBalance` passes a merchant id, so the single-merchant path uses the same ledger query, the same `FOR UPDATE` lock, `lock_timeout` and upsert as the full rebuild, restricted to that merchant (other merchants' cache rows are not read or locked). A merchant with neither a cache row nor ledger activity gets a zero row (a non-existent merchant fails on the foreign key). The CLI now prints `before=<n> after=<n> (CHANGED)` like the full rebuild. `RebuildMerchantBalance` is kept as a read-only helper (its doc now says so). Tests: `TestRebuildOneMerchantBalance_WritesOnlyThatMerchant`, `TestRebuildOneMerchantBalance_CreatesMissingCacheRow`. Tests changed: none. ADR-0007 consequence line updated.

## Re-attack notes
The admin button still calls the all-merchants function. The same AUD-048 caveat applies to the single-merchant rebuild (unbatched captures are double counted at the next close), because it uses the same ledger definition; that is tracked separately. A bad UUID is rejected before any DB call.

## Related
AUD-015
