# AUD-020 — Outbound webhook signature computed over different bytes than sent — FP-240

| Field | Value |
|---|---|
| Owner | B |
| Severity | **High** |
| Category | integration / security |
| Status | **fixed** (merged with PR #27/#28) (runtime-verified locally on 55433; review pending) |
| Fix commit | uncommitted on local branch fix/AUD-046-024-merchant-write-authority (stack); patch stack/10-AUD-020.patch |

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

## Fix (applied, Track B, 2026-10-30)
Discovered in the Phase 0 team audit unless stated; repaired here. Base `main` af8e9c9, uncommitted working tree in `~/Desktop/hakathons/fils-pay-hackathon`; patch `~/Desktop/hakathons/track-b-patches/stack/10-AUD-020.patch`.
**Root cause (confirmed by test).** `webhooks/dispatcher.ts` signed `canonicalJson(row.payload)` (sorted keys) but sent
`JSON.stringify(row.payload)`, where the payload came back from JSONB in Postgres' key order; `webhooks/testSend.ts` did
the same with a literal object whose key order is not sorted. The bytes signed and the bytes sent differed, so a
receiver's raw-body HMAC failed (RUNBOOK told merchants to re-sort keys as a workaround).

**Change.** `webhooks/sign.ts`: `serializeWebhookBody` (canonical JSON, the one serialisation) and `signRawBody` (signs a
given string); `signPayload` now delegates to them, so `verifySignature` (which canonicalises) still matches.
`dispatcher.ts` and `testSend.ts` serialise once, sign that string and send that same string. Replays and archive
restores create delivery rows that go through the dispatcher, so they are covered; no other code calls the transport.
Delivery-id semantics untouched.

**Tests:** appended to `apps/api/src/webhooks/dispatcher.test.ts`: `AUD-020: the dispatcher signs exactly the bytes it sends`
(receiver-side HMAC over the captured body, on the first attempt and on a retry, and the retry's bytes are identical)
and `AUD-020: test-send signs exactly the bytes it sends`. Both failed on `main`, pass after. Webhook tests 43/43.
**Tests changed:** none.

## Re-attack notes
- First attempt and retry: both verify over the raw body; identical bytes on retry.
- Test-send: verifies over the raw body.
- Body format changes from Postgres key order to sorted keys. Receivers that verified by re-sorting (RUNBOOK workaround)
  still verify; receivers that parsed field values are unaffected. RUNBOOK's re-sort advice can be dropped by the integrator.
- Independent skeptical review: **pending**.

## Related
AUD-021
