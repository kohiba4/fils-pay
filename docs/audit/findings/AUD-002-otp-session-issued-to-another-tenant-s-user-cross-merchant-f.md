# AUD-002 — OTP/session issued to another tenant's user (cross-merchant `findOtpRecipient`)

| Field | Value |
|---|---|
| Severity | **Critical** |
| Category | authn / tenant isolation |
| Status | confirmed (trace) |
| Fix commit | — (not fixed; Phase 2) |

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

## Re-attack notes
_To be filled after the fix (bypass via other route / tenant / retry / concurrency)._

## Related
AUD-001
