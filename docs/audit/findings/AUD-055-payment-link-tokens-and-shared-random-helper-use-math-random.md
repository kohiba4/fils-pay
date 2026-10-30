# AUD-055 — Payment-link tokens (and the shared random helper) use Math.random

| Field | Value |
|---|---|
| Owner | B |
| Severity | **Medium** |
| Category | crypto / bearer token |
| Status | **fixed** (merged with PR #27/#28) (runtime-verified locally on 55433; independently reviewed 2026-10-30: confirmed) |
| Fix commit | uncommitted on local branch fix/AUD-046-024-merchant-write-authority (stack); patch stack/07-AUD-023-055.patch |

## Summary
New in Track B's sibling sweep of AUD-023 (2026-10-30). The public payment-link token is generated with `Math.random`.

## Location
apps/api/src/lib/random.ts (`randomFromAlphabet`), apps/api/src/paymentLinks/create.ts:10-13 (`randomPlinkToken`).
Same helper also builds `displayReference()`. `admin/inviteCode.ts` used `Math.random` directly but has no caller (dead code).

## Root cause
`randomFromAlphabet` drew each character with `Math.floor(Math.random() * alphabet.length)`. V8's `Math.random` is
xorshift128+, not a CSPRNG: its state can be recovered from a run of observed outputs. ARCHITECTURE.md ("Tokens are
128-bit, from `crypto.randomBytes`") and INVARIANTS I20 ("tokens ✅") are false claims about this code.

## Reproduction / evidence
Test `AUD-023 / AUD-055: OTP codes and payment-link tokens do not come from Math.random`
(`apps/api/src/routes/otpAttempts.test.ts`): with `Math.random` replaced by a constant, 50 tokens collapsed to one value
on `main` af8e9c9 (fails), and stay distinct after the fix (passes).

## Impact
The token is the only secret for the public `GET/POST /v1/payment-links/:token…` routes (link details: merchant,
amount, reference, description; and paying it). A merchant who creates links and sees its own tokens observes the
generator's output; with the state recovered, tokens issued to other merchants in the same process become guessable.
Requires many observed outputs and the same API process; no money is taken (paying someone else's link only pays it),
but invoice details leak. Rated Medium.

## Fix (proposed)
Use `crypto.randomInt` in the shared helper (one change covers tokens, OTP codes and display references).

## Fix (applied, Track B, 2026-10-30)
Base `main` af8e9c9, uncommitted working tree in `~/Desktop/hakathons/fils-pay-hackathon`; patch
`~/Desktop/hakathons/track-b-patches/stack/07-AUD-023-055.patch` (same patch as AUD-023: one shared root cause).
`lib/random.ts` uses `crypto.randomInt` for `randomDigits` and `randomFromAlphabet`; `admin/inviteCode.ts` also switched
(unreachable today, same root cause). Token length and alphabet unchanged, so existing tokens and URLs keep working.

## Re-attack notes
- Constant `Math.random`: tokens and codes still distinct (test). Format of OTP codes unchanged (`^\d{6}$`, 200 samples).
- Existing links are not re-issued; tokens minted before the fix stay as predictable as they were. Rotating them would
  break sent invoices; a decision for the merchant-facing side.
- ARCHITECTURE.md and INVARIANTS I20 need correcting by the integrator.
- Independent skeptical review (2026-10-30, `docs/audit/reviews/2026-10-30-track-b-batch.md`): **CONFIRMED** — regression test fails with the fix reverted, passes with it; remaining `Math.random`: `apps/web/src/utils/helpers.ts randomId` (unused) and dispatcher jitter (not security-relevant).

## Related
AUD-023
