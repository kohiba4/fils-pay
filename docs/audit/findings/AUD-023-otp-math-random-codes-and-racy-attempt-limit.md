# AUD-023 — OTP: Math.random codes and racy attempt limit

| Field | Value |
|---|---|
| Severity | **Medium** |
| Category | authn |
| Status | confirmed (trace) |
| Fix commit | — (not fixed; Phase 2) |

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

## Re-attack notes
_To be filled after the fix (bypass via other route / tenant / retry / concurrency)._

## Related
AUD-001
