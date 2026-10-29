# AUD-046 — Capture and void have no role gate: support users and impersonating admins can move money

| Field | Value |
|---|---|
| Owner | B |
| Severity | **High** |
| Category | authz |
| Status | confirmed (trace) |
| Fix commit | — (not fixed; Phase 2) |

## Summary
Capture and void have no role gate: support users and impersonating admins can move money.

## Location
apps/api/src/routes/transactions.ts:90-131 (`/:id/capture`, `/:id/void`: `preHandler: requireMerchantAuth` only), auth/requireMerchantAuth.ts:61-110

**Sibling locations checked:** Webhook/payment-link/api-key routes DO chain `requireMerchantRole`; `/v1/refunds` stub also has none; `requireMerchantWriterActor` records an impersonating admin as `merchant_session`.

## Root cause
`requireMerchantAuth` only establishes identity; nothing blocks writes for `role='support'` or for the `admin_impersonation` actor. MK's route comment ("impersonation is read-only, enforced in requireMerchantAuth") is false: the function has no such check. Even after fixing AUD-024 (impersonation → support) support could still capture/void unless these routes are gated. FH's own TODO notes it.

## Reproduction / evidence
Trace of routes/transactions.ts and requireMerchantAuth. Regression test to add: session with role support (and an impersonation cookie) POST /:id/void → expect 403.

## Impact
A read-only support user or a 'view as merchant' admin can capture or void payments (money movement) with audit attribution to a merchant session.

## Fix (proposed)
Add `requireMerchantRole('owner','finance')` to capture, void (and the refund route in FP-300); API keys keep full authority by design.

## Re-attack notes
_To be filled after the fix (bypass via other route / tenant / retry / concurrency)._

## Related
AUD-024, AUD-003
