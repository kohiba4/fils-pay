# AUD-022 — Merchant A can cancel merchant B's payment link (IDOR)

| Field | Value |
|---|---|
| Owner | B |
| Severity | **High** |
| Category | authz |
| Status | fix ready, not merged (runtime-verified locally on 55433; review pending) |
| Fix commit | none yet: uncommitted in the local stack on branch fix/AUD-046-024-merchant-write-authority (git commit denied); patch stack/04-AUD-022.patch |

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

## Fix (applied, Track B, 2026-10-30)
Discovered in the Phase 0 team audit; repaired here. Base `main` af8e9c9, uncommitted working tree in `~/Desktop/hakathons/fils-pay-hackathon`; reviewable patch `~/Desktop/hakathons/track-b-patches/stack/04-AUD-022.patch` (applies alone to af8e9c9, checked with `git apply --check`). Commands: fresh DB, `npm run migrate && npm run seed`, `cd apps/api && npm test`, `cd apps/reporting && npm test`.
`paymentLinks/cancel.ts` takes `merchantId` and adds `AND merchant_id = $2` to both the UPDATE and the explanatory lookup, so another merchant's link reads as not found. `routes/paymentLinks.ts` passes `request.merchantAuth.merchantId`. It is the only caller.

**Test:** new test `AUD-022: merchant B cannot cancel merchant A's payment link …` appended to `apps/api/src/routes/paymentLinks.test.ts`. Failed on `main` (B got 204), passes after the fix; the file's 9 tests pass.
Suites on a fresh 127.0.0.1:55433 DB (2026-10-30) with this fix stacked on AUD-046/024: api 407/408 (only failure: the
AUD-044 jitter test, also failing on `main`), reporting 7/11 (AUD-041, same as `main`). Typecheck clean.
**Tests changed:** none.

## Re-attack notes
- B on its own path with A's link id: 404 `payment_link_not_found`; A's link still `active`, `canceled_at` null.
- B on A's path: 403 (existing path check).
- A can still cancel its own link (204); existing happy/404/409 cancel test unchanged and passing.
- Independent skeptical review: **pending**.

## Related
AUD-003
