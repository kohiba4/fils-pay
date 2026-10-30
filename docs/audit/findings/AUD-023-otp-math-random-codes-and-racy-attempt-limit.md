# AUD-023 — OTP: Math.random codes and racy attempt limit

| Field | Value |
|---|---|
| Owner | B |
| Severity | **Medium** |
| Category | authn |
| Status | fix ready, not merged (runtime-verified locally on 55433; independently reviewed 2026-10-30: partly disputed, resend resets the guess budget (open)) |
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
- Independent skeptical review (2026-10-30, `docs/audit/reviews/2026-10-30-track-b-batch.md`): **PARTLY DISPUTED.** Confirmed: atomic attempt increment, conditional consume, `crypto.randomInt` (merchant and admin). **Disputed: the guess budget is not enforced across resends.** `routes/auth.ts` resend docstring (present on main) says the new challenge "inherits the previous challenge's attempt_count"; `auth/otp.ts issueChallenge` inserts a fresh count. Review repro: 4 wrong guesses, resend, ×3 → 12 wrong guesses judged on one pending session (budget 5); ~100 per 10-minute pending session. This is a broken documented contract (not only a lockout-policy question as stated in the handoff). **Open:** carry `attempt_count` into the resent challenge (or correct the docstring and this finding). Non-blocking: `otpAttempts.test.ts` `latestAttemptCount` reads the newest challenge in the whole DB (flaky on a shared DB).

## Related
AUD-001


> **Update 2026-10-30 (Q16):** the residual items (resend resets the guess budget; endless new pending sessions) disappear in production: the second factor is now TOTP, which has no resend, a 5-try budget per session and a 10-try lock per account (`auth/totp.ts`). The OTP code path remains only for non-production use.
