# AUD-007 — Expired payment link payable via client-supplied `submittedAt` — FP-187

| Field | Value |
|---|---|
| Owner | B |
| Severity | **High** |
| Category | trust boundary |
| Status | fix ready, not merged (runtime-verified locally on 55433; review pending) |
| Fix commit | uncommitted on local branch fix/AUD-046-024-merchant-write-authority (stack); patch stack/06-AUD-006-007.patch |

## Summary
Expired payment link payable via client-supplied `submittedAt` — FP-187.

## Location
apps/api/src/paymentLinks/pay.ts:32-37 (`expiryReferenceTime`), :68-77; apps/web CheckoutPage sends it

**Sibling locations checked:** status.ts uses server time (so read and pay disagree); ARCHITECTURE "Security" documents the client-clock behaviour as a feature.

## Root cause
Expiry is compared against `submittedAt` from the request body when present. Any client can send a past timestamp.

## Reproduction / evidence
Trace: claim `AND expires_at > $3` with `$3 = new Date(input.submittedAt)`.

## Impact
Expired invoices still collect money (FP-187).

## Fix (proposed)
Ignore `submittedAt` for the decision; compare with DB `now()`.

## Fix (applied, Track B, 2026-10-30)
Discovered in the Phase 0 team audit unless stated; repaired here. Base `main` af8e9c9, uncommitted working tree in `~/Desktop/hakathons/fils-pay-hackathon`; patch `~/Desktop/hakathons/track-b-patches/stack/06-AUD-006-007.patch`.
**Root cause.** `expiryReferenceTime` returned the request body's `submittedAt` whenever it parsed, and the claim compared
`expires_at` with it. The pay endpoint is public, so the instant is attacker-controlled.

**Policy decision used.** The finding's own proposed fix and TRIAGE ("the brief (FP-187) calls it untrusted input.
Treated as a bug") — no decision approves a client-clock or "trusted terminal" exception, so none is kept. The earlier
uncommitted repair's API-key terminal exception was deliberately **not** ported. Compatibility effect: an offline
terminal's queued sale uploaded after the link's expiry now gets 410 `payment_link_expired`; if finance wants that
case, it needs an explicit decision and an authenticated path. ARCHITECTURE.md "Security" still documents the old
client-clock behaviour and should be corrected by the integrator.

**Change.** `paymentLinks/pay.ts expiryReferenceTime` always returns the server clock; the `submittedAt` field is still
accepted (the web checkout still sends it) but ignored. Claim and the 410 classification use the same instant.

**Tests:** two new tests in `apps/api/src/paymentLinks/payConcurrency.test.ts` (`AUD-007: an expired link cannot be paid
by backdating submittedAt…`, `AUD-007: a link that has not expired pays even if the client sends a future or bogus
submittedAt`). Both failed on `main` (backdated pay → 200; future instant → 410 on a live link), pass after.
**Test changed (encoded the bug):** `paymentLinks/pay.test.ts` "a valid ISO-8601 string round-trips exactly" asserted
that the client instant decides expiry; corrected (not deleted) to assert it is ignored. Payment-link tests 27/27.

## Re-attack notes
- Backdated by 1 hour and to 2020 on an expired link: 410, no authorization, link unchanged.
- Future instant on a live link: pays (200). Unparseable / empty value: server clock (unit tests).
- `status.ts` (public read) already used server time, so read and pay now agree.
- Boundary: expiry is a strict `expires_at > now` at the API clock; not tested at the exact millisecond.
- Independent skeptical review: **pending**.

## Related
AUD-006
