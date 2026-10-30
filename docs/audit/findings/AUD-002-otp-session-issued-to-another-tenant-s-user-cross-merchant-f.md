# AUD-002 — OTP/session issued to another tenant's user (cross-merchant `findOtpRecipient`)

| Field | Value |
|---|---|
| Owner | B |
| Severity | **Critical** |
| Category | authn / tenant isolation |
| Status | fix ready, not merged (runtime-verified locally on 55433; review pending) |
| Fix commit | none yet: uncommitted in the local stack on branch fix/AUD-046-024-merchant-write-authority (git commit denied); patch stack/03-AUD-002.patch |

## Summary
OTP/session issued to another tenant's user (cross-merchant `findOtpRecipient`).

## Location
apps/api/src/routes/auth.ts:84, apps/api/src/auth/users.ts:11-25

**Sibling locations checked:** Admin login (`routes/adminAuth.ts`) uses global-unique admin email — not affected; resend uses `pending.merchantUserId` (fine).

## Root cause
After verifying the password of user U at merchant A, login calls `findOtpRecipient(email)` which searches **all** merchants by email with `LIMIT 1` and no ORDER BY, and binds the challenge and the pending session to that row instead of U. 0003 explicitly allows the same email at several merchants; 0011 says challenges are never resolved by email.

## Reproduction / evidence
Trace: auth.ts:84 `const recipient = await findOtpRecipient(app.db, email) ?? user;` → `createPendingSession({ merchantUserId: recipient.id })`. Combined with AUD-001 the pending cookie is already a full session for `recipient`'s merchant.

## Impact
A person with a login at merchant A whose email also exists at merchant B can end up authenticated as B's user without B's password. With AUD-001 no OTP is even needed → cross-tenant account takeover.

## Fix (proposed)
Use the authenticated `user` row; delete the cross-merchant lookup (keep `users.ts` export only if referenced elsewhere).

## Fix (applied, Track B, 2026-10-30)
Discovered in the Phase 0 team audit; repaired here. Base `main` af8e9c9, uncommitted working tree in `~/Desktop/hakathons/fils-pay-hackathon`; reviewable patch `~/Desktop/hakathons/track-b-patches/stack/03-AUD-002.patch` (applies alone to af8e9c9, checked with `git apply --check`). Commands: fresh DB, `npm run migrate && npm run seed`, `cd apps/api && npm test`, `cd apps/reporting && npm test`.
`routes/auth.ts` login binds the OTP challenge and pending session to the password-verified `user`; the `findOtpRecipient` call and import are removed. `auth/users.ts findOtpRecipient` is now unreferenced and left in place (removal is cleanup, not part of the fix).

**Test:** `apps/api/src/routes/authOtpRecipient.test.ts` (new). Same email at two merchants, the other tenant's row created first. Failed on `main` (pending session bound to the other tenant's user), passes after the fix.
Suites on a fresh 127.0.0.1:55433 DB (2026-10-30) with this fix stacked on AUD-046/024: api 407/408 (only failure: the
AUD-044 jitter test, also failing on `main`), reporting 7/11 (AUD-041, same as `main`). Typecheck clean.
**Tests changed:** none.

## Re-attack notes
- Pending session row bound to the verified user; OTP verify returns the own merchant and the own role (`finance`, while the other tenant's user is `owner`).
- The other tenant's password does not log in at the own merchant (401).
- Resend already used `pending.merchantUserId`; admin login uses globally unique admin emails (unaffected).
- Independent skeptical review: **pending**.

## Related
AUD-001
