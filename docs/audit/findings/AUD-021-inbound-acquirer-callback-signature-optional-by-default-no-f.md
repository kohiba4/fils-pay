# AUD-021 — Inbound acquirer callback signature: optional by default, no freshness, re-serialized body, non-constant-time compare

| Field | Value |
|---|---|
| Owner | B |
| Severity | **High** |
| Category | authn |
| Status | confirmed (trace) |
| Fix commit | — (not fixed; Phase 2) |

## Summary
Inbound acquirer callback signature: optional by default, no freshness, re-serialized body, non-constant-time compare.

## Location
apps/api/src/webhooks/inboundVerify.ts:44-71, config.ts (`ACQUIRER_CALLBACK_REQUIRE_SIGNATURE` default false), routes/acquirerCallbacks.ts

**Sibling locations checked:** Outbound verifySignature uses timingSafeEqual (fine).

## Root cause
Missing header → valid unless required (default not required). Timestamp never checked → replay forever. HMAC over `JSON.stringify(parsedBody)` not raw bytes. `Buffer.compare` is not constant-time.

## Reproduction / evidence
Trace.

## Impact
Anyone can post forged fraud-review notes on any transaction id; replay of captured callbacks.

## Fix (proposed)
Require signature (fail closed), check |now − t| ≤ 300 s, HMAC raw body, `timingSafeEqual`.

## Re-attack notes
_To be filled after the fix (bypass via other route / tenant / retry / concurrency)._

## Related
AUD-019, AUD-020
