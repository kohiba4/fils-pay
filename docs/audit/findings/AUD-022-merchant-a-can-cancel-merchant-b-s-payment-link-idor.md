# AUD-022 — Merchant A can cancel merchant B's payment link (IDOR)

| Field | Value |
|---|---|
| Severity | **High** |
| Category | authz |
| Status | confirmed (trace) |
| Fix commit | — (not fixed; Phase 2) |

## Summary
Merchant A can cancel merchant B's payment link (IDOR).

## Location
apps/api/src/routes/paymentLinks.ts:100-117, paymentLinks/cancel.ts:9-17

**Sibling locations checked:** Other link routes (read/list) and webhook endpoint delete/patch to re-check in Phase 1.

## Root cause
`assertOwnMerchant` checks the path merchantId vs auth, but `cancelPaymentLink` updates `WHERE id = $1` without `merchant_id`.

## Reproduction / evidence
Trace. Chat claim TRUE.

## Impact
Any merchant can cancel any other merchant's invoices (denial of revenue).

## Fix (proposed)
Add `AND merchant_id = $2` (and in the lookup), pass the authenticated merchant.

## Re-attack notes
_To be filled after the fix (bypass via other route / tenant / retry / concurrency)._

## Related
AUD-003
