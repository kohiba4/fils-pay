# AUD-023 — OTP: Math.random codes and racy attempt limit

| Field | Value |
|---|---|
| Owner | B |
| Severity | **Medium** |
| Category | authn |
| Status | fix ready, not merged (runtime-verified locally on 55433; review pending) |
| Fix commit | uncommitted on local branch fix/AUD-046-024-merchant-write-authority (stack); patch stack/07-AUD-023-055.patch |

## Summary
OTP: Math.random codes and racy attempt limit.

## Location
apps/api/src/lib/random.ts:2-7, auth/otp.ts:7, routes/auth.ts:150-162; admin OTP to check

**Sibling locations checked:** Admin OTP (adminAuth/otp.ts) — same `randomDigits`? to verify.

## Root cause
`randomDigits` uses `Math.random`; attempt check is read-then-increment, so N parallel guesses all see attempt_count=0.

## Reproduction / evidence
Trace (MK's own comment describes the race).

## Impact
Brute force exceeds the 5-try budget; predictable codes in principle. Mostly moot until AUD-001 is fixed.

## Fix (proposed)
`crypto.randomInt`; atomic `UPDATE … SET attempt_count = attempt_count+1 WHERE … AND attempt_count < max RETURNING`.

## Fix (applied, Track B, 2026-10-30)
Discovered in the Phase 0 team audit unless stated; repaired here. Base `main` af8e9c9, uncommitted working tree in `~/Desktop/hakathons/fils-pay-hackathon`; patch `~/Desktop/hakathons/track-b-patches/stack/07-AUD-023-055.patch`.
**Root cause (confirmed by test).** `lib/random.ts randomDigits` used `Math.random`. Both verify routes read the challenge,
compared, then incremented `attempt_count` in a separate statement, so N parallel guesses all saw the starting count; the
consume was unconditional. The admin route's comment ("the challenge row is read FOR UPDATE — MK") is false.

**Change.** `lib/random.ts`: `crypto.randomInt` (also fixes AUD-055, payment-link tokens; same helper).
`routes/auth.ts` and `routes/adminAuth.ts` verify: one atomic `UPDATE … SET attempt_count = attempt_count + 1 WHERE
id = $1 AND consumed_at IS NULL AND attempt_count < max_attempts RETURNING …` before the comparison; no row → 410 if
consumed, else revoke the pending session and 429; consume is conditional (`AND consumed_at IS NULL`) inside the
promotion transaction, 410 for the loser. Same 5 comparisons per challenge as before.

**Tests:** `apps/api/src/routes/otpAttempts.test.ts` (new, 5 tests, real Postgres, merchant and admin). On `main`: 12
parallel wrong guesses were all judged (budget 5); two correct submissions both promoted; codes collapsed with a
constant `Math.random` — all 5 failed. After: 5/5 pass. **Tests changed:** none.

## Re-attack notes
- 12 parallel wrong guesses: at most 5 judged, `attempt_count` ≤ 5, the correct code afterwards refused, cookie unusable.
- Two concurrent correct codes: exactly one 200; replay refused; the winning session works. Same for admin.
- Challenge is still bound to the pending session's `otp_challenge_id` and the user (AUD-002).
- **Open (not fixed, policy):** each resend (30 s cooldown) and each fresh password login issues a new 5-attempt challenge;
  there is no per-user lockout or rate limit, so an attacker who already has the password gets 5 guesses per login.
  Needs a product decision on lockout; recorded in the Track B handoff.
- Independent skeptical review: **pending**.

## Related
AUD-001
