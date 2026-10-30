# AUD-060 — Merchant dashboard login cookie expires after 10 minutes even though the session lasts 12 hours

| Field | Value |
|---|---|
| Owner | A |
| Severity | **Medium** |
| Category | auth / UX |
| Status | **fixed** (branch `feat/totp`) |
| Fix commit | see `git log feat/totp` |

## Summary
After a successful merchant login the browser keeps the session cookie for the short PENDING lifetime (10 minutes), not the session lifetime (12 hours), so merchants are signed out after about ten minutes of use.

## Location
apps/api/src/routes/auth.ts: `POST /otp/verify` promotes the session in the database (`promoteSession`, expires_at +12 h) but never re-issues the cookie; `POST /login` set it with `maxAge = pendingSessionTtlMinutes * 60`. The admin verify handler does re-issue it (with a comment from the original authors asking why the merchant one does not: "related to the 10 min logouts?").

## Root cause
The cookie `Max-Age` is decided by the browser at the time the cookie is set. The merchant verify route only changes the server-side row.

## Reproduction / evidence
Code trace plus the authors' own comment. Covered by `routes/totpLogin.test.ts` ("the cookie is re-issued for the full session, not the 10 minute pending window", both planes).

## Impact
Dashboard users are logged out after ten minutes regardless of the 12-hour session, repeatedly re-doing password and second factor. UX defect; a dropped cookie also hides how long a session really lives.

## Fix
`/otp/verify` re-issues the cookie with `maxAge = sessionTtlHours * 3600`, in the TOTP branch and the legacy OTP branch.

## Re-attack notes
The server-side session still expires at `expires_at`; a longer-lived cookie cannot extend it. The cookie stays HttpOnly, SameSite=Lax and Secure in production.

## Related
Q16 (TOTP), AUD-023
