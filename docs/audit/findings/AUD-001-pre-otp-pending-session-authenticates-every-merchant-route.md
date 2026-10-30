# AUD-001 — Pre-OTP (pending) session authenticates every merchant route

| Field | Value |
|---|---|
| Owner | B |
| Severity | **Critical** |
| Category | authn |
| Status | fix ready, not merged (runtime-verified locally on 55433; independently reviewed 2026-10-30: confirmed) |
| Fix commit | none yet: uncommitted in the local stack on branch fix/AUD-046-024-merchant-write-authority (git commit denied); patch stack/02-AUD-001.patch |

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

## Fix (applied, Track B, 2026-10-30)
Discovered in the Phase 0 team audit; repaired here. Base `main` af8e9c9, uncommitted working tree in `~/Desktop/hakathons/fils-pay-hackathon`; reviewable patch `~/Desktop/hakathons/track-b-patches/stack/02-AUD-001.patch` (applies alone to af8e9c9, checked with `git apply --check`). Commands: fresh DB, `npm run migrate && npm run seed`, `cd apps/api && npm test`, `cd apps/reporting && npm test`.
`auth/sessions.ts lookupSession` adds `AND s.authenticated = true` and keeps reading `live_sessions` (which already filters revoked and expired). No migration: the view is unchanged because other readers use it. The earlier uncommitted repair's extra `merchants.status = 'active'` predicate was deliberately **not** ported: it would also log out suspended merchants, a behaviour change no finding or decision asks for.

**Test:** `apps/api/src/routes/authPendingSession.test.ts` (new, real login + OTP over HTTP). Failed on `main` (pending cookie got 200 on `/v1/transactions`), passes after the fix.
Suites on a fresh 127.0.0.1:55433 DB (2026-10-30) with this fix stacked on AUD-046/024: api 407/408 (only failure: the
AUD-044 jitter test, also failing on `main`), reporting 7/11 (AUD-041, same as `main`). Typecheck clean.
**Tests changed:** none.

## Re-attack notes
- Pending cookie refused on the `requireMerchantAuth` surface (`/v1/transactions`) and the legacy `requireSession` surface (`/v1/merchants/:id/api-keys`): both 401.
- The same cookie works after a correct `/v1/auth/otp/verify` (flow preserved).
- Only one authenticated-session lookup exists (`lookupSession`); `lookupPendingSession` already filters `authenticated = false`. Admin sessions already test `authenticated = true`.
- Independent skeptical review (2026-10-30, `docs/audit/reviews/2026-10-30-track-b-batch.md`): **CONFIRMED** — regression test fails with the fix reverted, passes with it; `lookupSession` is the only merchant session lookup.

## Related
AUD-002, AUD-023
