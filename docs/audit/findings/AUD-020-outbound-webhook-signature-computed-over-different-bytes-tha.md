# AUD-020 — Outbound webhook signature computed over different bytes than sent — FP-240

| Field | Value |
|---|---|
| Owner | B |
| Severity | **High** |
| Category | integration / security |
| Status | confirmed (trace) |
| Fix commit | — (not fixed; Phase 2) |

## Summary
Outbound webhook signature computed over different bytes than sent — FP-240.

## Location
apps/api/src/webhooks/dispatcher.ts:173-190, sign.ts:39

**Sibling locations checked:** testSend.ts and replay paths to check for the same pattern; RUNBOOK tells merchants to re-sort keys (workaround).

## Root cause
Signs `canonicalJson(payload)` (sorted keys) but sends `JSON.stringify(row.payload)` where payload came back from JSONB (Postgres key order: by length). Bytes differ → raw-body HMAC fails.

## Reproduction / evidence
Trace; branch ya/sign-raw (deleted) intended "sign the exact bytes we send".

## Impact
Merchants cannot verify webhooks → either reject real events or disable verification.

## Fix (proposed)
Serialize once; sign and send that exact string.

## Re-attack notes
_To be filled after the fix (bypass via other route / tenant / retry / concurrency)._

## Related
AUD-021
