# AUD-003 — Refund path has no transaction-ownership check (IDOR across merchants)

| Field | Value |
|---|---|
| Owner | FP-300 (shared) |
| Severity | **Critical** |
| Category | authz / money |
| Status | **fixed** (branch `feat/FP-300-refund-core`) |
| Fix commit | see `git log feat/FP-300-refund-core` |

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

## Fix
`POST /v1/refunds` is wired (FP-300 PR 1). The authenticated merchant comes only from `request.merchantAuth`; `initiateMerchantRefund` looks the transaction up by id AND that merchant, and `processRefund` locks it with `WHERE id = $1 AND merchant_id = $2`. A foreign transaction answers 404 `transaction_not_found`, indistinguishable from a missing one, and nothing is written. Session users need the owner or finance role (support gets 403). A "view as merchant" operator is refused explicitly by actor type: the impersonation role map turns `super_admin` into `owner` and `finance` into `finance` (AUD-024), so the role check alone would have let them refund, recorded as the merchant's own session. Test: `routes/refunds.test.ts` "a view as merchant operator cannot refund, whatever role their grant maps to".

Tests: `processRefund.test.ts` (AUD-003: another merchant is a 404 and nothing is refunded), `initiateMerchantRefund.test.ts` (same, replacing the old TODO), `routes/refunds.test.ts` (404 for a foreign id; 401/403/200 by role). Tests changed: the stale TODO comment in `initiateMerchantRefund.test.ts` ("currently refunds it") was replaced by the test it asked for.

## Re-attack notes
Both layers are scoped (the pre-check and the locked SELECT), so a bug in one does not open the other. The merchant in the body is not accepted. Idempotency keys are scoped by merchant and endpoint, and the request hash includes the transaction id, so another merchant cannot replay a key to read a response.

## Related
AUD-004, AUD-005, FP-300
