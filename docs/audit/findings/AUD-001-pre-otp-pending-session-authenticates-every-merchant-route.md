# AUD-001 — Pre-OTP (pending) session authenticates every merchant route

| Field | Value |
|---|---|
| Owner | B |
| Severity | **Critical** |
| Category | authn |
| Status | confirmed (trace) |
| Fix commit | — (not fixed; Phase 2) |

## Summary
Pre-OTP (pending) session authenticates every merchant route.

## Location
apps/api/src/auth/sessions.ts:91-117 (`lookupSession`), db/migrations/0058_live_sessions.sql

**Sibling locations checked:** `lookupPendingSession` (sessions.ts:126) filters `authenticated = false` correctly; admin `lookupAdminSession` not yet checked; `requireMerchantAuth` and legacy `requireSession` both call `lookupSession`.

## Root cause
0012 says every auth query must filter `authenticated = true`. `lookupSession` was moved onto the `live_sessions` view (0058), which filters revoked/expired only. The view exposes `authenticated` but the query never tests it. So the cookie issued by `POST /v1/auth/login` (password only) is accepted as a full session.

## Reproduction / evidence
Trace: login → `createPendingSession(authenticated=false)` → cookie set → any route → `requireMerchantAuth` → `lookupSession` → `SELECT … FROM live_sessions WHERE token_hash=$1` (no `authenticated` predicate) → authorized. Repro test to write in Phase 2: login, skip /otp/verify, GET /v1/transactions → expect 401, currently 200.

## Impact
Second factor is decorative: anyone with a password gets full merchant access (refunds once live, payment links, API keys, webhooks). Matches chat claim "Login works without entering the OTP code".

## Fix (proposed)
Add `AND s.authenticated = true` to `lookupSession` (smallest, root cause at the single shared lookup). Do not change the view (other readers).

## Re-attack notes
_To be filled after the fix (bypass via other route / tenant / retry / concurrency)._

## Related
AUD-002, AUD-023
