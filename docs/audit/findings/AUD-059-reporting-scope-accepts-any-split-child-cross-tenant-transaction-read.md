# AUD-059 — Reporting scope accepts any split child: cross-tenant transaction read

| Field | Value |
|---|---|
| Owner | B |
| Severity | **High** |
| Category | authz / tenant isolation |
| Status | open: not fixed (found by the independent review of the Track B batch, 2026-10-30; present unchanged on `main` af8e9c9) |
| Fix commit | none |

## Summary
New, found 2026-10-30 by the skeptical reviewer (auth/admin slice) of the Track B batch. Any authenticated merchant
actor can read another merchant's transaction report by naming that merchant's id in the report filter, provided the
target merchant is a split child of **any** parent. The parent is never compared with the caller.

## Location
- `apps/api/src/reporting/scope.ts:12-19` (`resolveReportMerchantId`)
- caller: `apps/api/src/routes/reporting.ts` `GET /v1/reporting/transactions` (`parsed.merchantId` from the `filter` query
  parameter is passed straight in)

## Root cause
```
`SELECT 1 AS ok FROM merchant_split_children WHERE child_merchant_id = $1`,
...
return requestedMerchantId;
```
The check asks "is this id a split child?" instead of "is this id a split child **of the caller**?". The docstring in
`apps/api/src/reporting/transactionsReportQuery.ts:4-8` ("`merchantId` is always overwritten by the route with the
authenticated merchant") is false, and ruled-out item R-09 repeated it ("`merchantId` forced from auth").

## Reproduction / evidence
Independent review, 2026-10-30 (disposable DB `filspay_rev1` on 127.0.0.1:55433): a `support` session of an unrelated
merchant calls `GET /v1/reporting/transactions?filter={"merchantId":"<split child id>"}` →
`status 200 rows 1 [{"isChild":true,"ref":"child-private-ref","amt":"123.456"}]`. A non-child id falls back to the
caller's own rows. Code path re-traced by the integrator (scope.ts is byte-identical on `main` and on the Track B branch).
No regression test exists yet.

## Impact
Cross-tenant read of transaction references, amounts, statuses and dates of every split-child merchant. Any merchant
role (including `support`) and merchant API keys can do it (`requireMerchantAuth`). Precondition: the attacker must know
or guess the child's merchant UUID (not enumerable through this route). No write.

## Fix (proposed, not applied)
Compare the parent with the caller: `... WHERE child_merchant_id = $1 AND parent_merchant_id = $2` with
`[requestedMerchantId, callerMerchantId]`; failing test first (unrelated merchant → its own rows or 403, never the
child's); correct the `transactionsReportQuery.ts` docstring and R-09. Grep for other users of `merchant_split_children`
in apps/api that trust a caller-supplied id.

## Re-attack notes
- Not yet done (no fix).
- Independent skeptical review: the finding itself comes from the review (docs/audit/reviews/2026-10-30-track-b-batch.md).

## Related
AUD-047 (same route file), ruled-out R-09
