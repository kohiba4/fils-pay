# AUD-046 — Capture and void have no role gate: support users and impersonating admins can move money

| Field | Value |
|---|---|
| Owner | B |
| Severity | **High** |
| Category | authz |
| Status | fix ready, not merged (runtime-verified locally on 55433; independently reviewed 2026-10-30: confirmed) |
| Fix commit | none yet: uncommitted in the local stack on branch fix/AUD-046-024-merchant-write-authority (git commit denied); patch stack/01-AUD-046-024.patch |

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

## Fix (applied, Track B, 2026-10-30)
Discovered in the Phase 0 team audit; repaired here. Base `main` af8e9c9, uncommitted working tree in `~/Desktop/hakathons/fils-pay-hackathon`; reviewable patch `~/Desktop/hakathons/track-b-patches/stack/01-AUD-046-024.patch` (applies alone to af8e9c9, checked with `git apply --check`). Commands: fresh DB, `npm run migrate && npm run seed`, `cd apps/api && npm test`, `cd apps/reporting && npm test`.
`routes/transactions.ts`: capture and void now chain `requireMerchantRole("owner", "finance")` after
`requireMerchantAuth` (decision Q4). Nothing else in the file changed; Track A's post-commit
`applyCaptureDiscountAdjustment` call (AUD-016) is left exactly as it is for A to remove after this merges.
`capture.ts`, `void.ts` and refund code are untouched. Ported from the earlier uncommitted repair, minus its other changes.

**Test:** `apps/api/src/routes/merchantWriteAuthority.test.ts` (new, real Postgres). Seen failing on `main` af8e9c9
(4 of 6: support capture 200, impersonation capture 200, disabled admin grant 200, writer helper accepts impersonation),
passing after the fix (6/6). Suites on a fresh 127.0.0.1:55433 DB (2026-10-30): `main` api 398/399, branch api 404/405;
the single failure in both is the AUD-044 jitter test. Reporting 7/11 on both (AUD-041, unchanged). Typecheck clean.
**Tests changed:** none. The existing support-grant test in `routes/admin.test.ts` still passes unchanged.

## Re-attack notes
- Support session: capture and void 403; status, captured amount, events, ledger and outbox rows unchanged; reads still 200.
- Impersonation grant of every admin role: capture and void 403, no side effects (with AUD-024).
- Owner and finance sessions: capture and void 200. API key of the merchant: capture 200 (contract unchanged).
- Other merchant's owner session or API key: 404, target unchanged.
- Sibling sweep: every merchant write route is now role-gated except `POST /v1/reporting/saved-filters`
  (`requireMerchantAuth` only; writes a saved report filter, no money). Left as is; noted for triage.
- Independent skeptical review (2026-10-30, `docs/audit/reviews/2026-10-30-track-b-batch.md`): **CONFIRMED** — regression test fails with the fix reverted, passes with it (4 of 6 fail on main as claimed). Other capture/void callers are `paymentLinks/pay.ts` system actions. Business check suggested: decision Q4 lets `finance` capture and void.

## Related
AUD-024, AUD-003
