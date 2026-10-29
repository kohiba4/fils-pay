# AUD-049 — `settlement rebuild-balances --merchant` prints a rebuilt value but never writes the cache

| Field | Value |
|---|---|
| Owner | A |
| Severity | **Low** |
| Category | ops tooling |
| Status | confirmed (trace) |
| Fix commit | — (not fixed; Phase 2) |

## Summary
`settlement rebuild-balances --merchant` prints a rebuilt value but never writes the cache.

## Location
apps/settlement/cmd/settlement/main.go:148-160, internal/ledger/rebuild.go (`RebuildMerchantBalance`)

**Sibling locations checked:** The no-flag path (`RebuildAllBalances`) writes correctly.

## Root cause
`RebuildMerchantBalance` only SELECTs the ledger sum; the CLI then prints `rebuilt=<n>` and returns. A code comment ('--merchant writes the cache for that one merchant, same as the full rebuild') and RUNBOOK ('recompute it') say otherwise.

## Reproduction / evidence
Read of main.go and rebuild.go: no UPDATE/INSERT on the --merchant path.

## Impact
An operator following the RUNBOOK for a single wrong balance sees a correct-looking number but the dashboard cache stays wrong.

## Fix (proposed)
Write the value (same upsert as the full rebuild, restricted to one merchant) or rename the flag to make it read-only.

## Re-attack notes
_To be filled after the fix (bypass via other route / tenant / retry / concurrency)._

## Related
AUD-015
