# AUD-003 — Refund path has no transaction-ownership check (IDOR across merchants)

| Field | Value |
|---|---|
| Owner | FP-300 (shared) |
| Severity | **Critical** |
| Category | authz / money |
| Status | latent (route returns 501 today; becomes live with FP-300) |
| Fix commit | — (not fixed; Phase 2) |

## Summary
Refund path has no transaction-ownership check (IDOR across merchants).

## Location
apps/api/src/refunds/initiateMerchantRefund.ts:64-80, apps/api/src/payments/processRefund.ts:79-84

**Sibling locations checked:** capture.ts scopes `WHERE id=$1 AND merchant_id=$2` (correct); void.ts to check; payment-link cancel has the same class (AUD-022).

## Root cause
`initiateMerchantRefund` loads the transaction by id alone and passes **the transaction's own** `merchant_id` to `processRefund`, which also selects by id alone. The authenticated merchant is only compared with the path param, never with the transaction.

## Reproduction / evidence
Trace only (route is a 501 stub). Unit tests exist for the helper; none for a foreign transaction (`processRefund.test.ts:466` TODO says "Claude says it's covered").

## Impact
Once refunds are wired, merchant A can refund merchant B's captures — money out of B's balance to arbitrary cards.

## Fix (proposed)
Part of FP-300 build: scope the SELECT by the authenticated merchant (`WHERE id=$1 AND merchant_id=$2`), 404 otherwise.

## Re-attack notes
_To be filled after the fix (bypass via other route / tenant / retry / concurrency)._

## Related
AUD-004, AUD-005, FP-300
