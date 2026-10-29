# AUD-007 — Expired payment link payable via client-supplied `submittedAt` — FP-187

| Field | Value |
|---|---|
| Severity | **High** |
| Category | trust boundary |
| Status | confirmed (trace) |
| Fix commit | — (not fixed; Phase 2) |

## Summary
Expired payment link payable via client-supplied `submittedAt` — FP-187.

## Location
apps/api/src/paymentLinks/pay.ts:32-37 (`expiryReferenceTime`), :68-77; apps/web CheckoutPage sends it

**Sibling locations checked:** status.ts uses server time (so read and pay disagree); ARCHITECTURE "Security" documents the client-clock behaviour as a feature.

## Root cause
Expiry is compared against `submittedAt` from the request body when present. Any client can send a past timestamp.

## Reproduction / evidence
Trace: claim `AND expires_at > $3` with `$3 = new Date(input.submittedAt)`.

## Impact
Expired invoices still collect money (FP-187).

## Fix (proposed)
Ignore `submittedAt` for the decision; compare with DB `now()`.

## Re-attack notes
_To be filled after the fix (bypass via other route / tenant / retry / concurrency)._

## Related
AUD-006
