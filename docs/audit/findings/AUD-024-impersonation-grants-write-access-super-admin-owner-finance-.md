# AUD-024 — Impersonation grants write access (super_admin→owner, finance→finance); any admin can start one

| Field | Value |
|---|---|
| Owner | B |
| Severity | **Medium** |
| Category | authz |
| Status | fix ready, not merged (runtime-verified locally on 55433; review pending) |
| Fix commit | none yet: uncommitted in the local stack on branch fix/AUD-046-024-merchant-write-authority (git commit denied); patch stack/01-AUD-046-024.patch |

## Summary
Impersonation grants write access (super_admin→owner, finance→finance); any admin can start one.

## Location
apps/api/src/admin/impersonation.ts:93-97, routes/adminMerchants.ts:327-330

**Sibling locations checked:** 0035 header, ARCHITECTURE and HANDOVER say read-only `support`; ADMIN.md says super_admin may make changes; writes recorded as merchant_session (audit can't tell).

## Root cause
Role mapping changed in July without updating the guarantees; start route only requires a session.

## Reproduction / evidence
Trace.

## Impact
Admin acts as the merchant owner (issue API keys, refunds later) with merchant attribution.

## Fix (proposed)
Decision needed: which doc wins. Default recommendation: map every role to `support` (the documented security posture).

## Fix (applied, Track B, 2026-10-30)
Discovered in the Phase 0 team audit; repaired here. Base `main` af8e9c9, uncommitted working tree in `~/Desktop/hakathons/fils-pay-hackathon`; reviewable patch `~/Desktop/hakathons/track-b-patches/stack/01-AUD-046-024.patch` (applies alone to af8e9c9, checked with `git apply --check`). Commands: fresh DB, `npm run migrate && npm run seed`, `cd apps/api && npm test`, `cd apps/reporting && npm test`.
Per decision Q4: `admin/impersonation.ts` maps every admin role (support, finance, super_admin) to merchant `support`.
`lookupImpersonationGrant` now also requires `admin_users.status = 'active'`: the code comment claiming an
admin-disable trigger revokes grants is false (no such trigger in `db/migrations`), so a disabled admin's grant kept
working. `auth/requireMerchantAuth.ts requireMerchantWriterActor` throws 403 for an `admin_impersonation` actor, so a
future write route without a role gate still cannot record an admin's write as the merchant's. The start route still
needs only an admin session; that is acceptable because the grant itself is read-only.

**Test:** `apps/api/src/routes/merchantWriteAuthority.test.ts` (new, real Postgres). Seen failing on `main` af8e9c9
(4 of 6: support capture 200, impersonation capture 200, disabled admin grant 200, writer helper accepts impersonation),
passing after the fix (6/6). Suites on a fresh 127.0.0.1:55433 DB (2026-10-30): `main` api 398/399, branch api 404/405;
the single failure in both is the AUD-044 jitter test. Reporting 7/11 on both (AUD-041, unchanged). Typecheck clean.
**Tests changed:** none. The existing support-grant test in `routes/admin.test.ts` still passes unchanged.

## Re-attack notes
- super_admin, finance and support grants: capture, void, payment-link create 403; API-key issue refused; reads 200; no side effects.
- Disabled admin's grant: 401 on a read.
- Writer helper unit check: impersonation actor gets 403.
- Not covered: the admin UI's "view as merchant" screen (not run). ADMIN.md still says super_admin may make changes; fix that doc with the integrator.
- Independent skeptical review: **pending**.

## Related
—
