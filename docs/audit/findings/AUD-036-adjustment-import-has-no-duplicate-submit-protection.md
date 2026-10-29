# AUD-036 — Adjustment import has no duplicate-submit protection

| Field | Value |
|---|---|
| Severity | **Medium** |
| Category | idempotency |
| Status | confirmed (trace) |
| Fix commit | — (not fixed; Phase 2) |

## Summary
Adjustment import has no duplicate-submit protection.

## Location
apps/api/src/admin/adjustmentImport.ts:47-110

**Sibling locations checked:** Comment claims unique original_filename — no such constraint.

## Root cause
No idempotency key/checksum.

## Reproduction / evidence
Slack 2026-09-04: same file imported twice seconds apart.

## Impact
Double ledger postings.

## Fix (proposed)
Content-hash unique per import (new migration) — after AUD-012.

## Re-attack notes
_To be filled after the fix (bypass via other route / tenant / retry / concurrency)._

## Related
AUD-012
