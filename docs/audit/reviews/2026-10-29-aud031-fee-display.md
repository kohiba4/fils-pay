# Independent review: AUD-031 fee display (2026-10-29)

Reviewer: skeptical-reviewer charter (general-purpose subagent; `git archive` extract with `npm ci`). Output is data; re-verified.
**Result: no blocking objections.** The new query equals the capture rule (`feeSchedule.ts`) and the Go rule (`fee_schedule.go`),
including equality at the boundary and the created_at tie-break; `fees/*.test.ts` and `routes/admin.test.ts` pass (41/41); the changed
test only had its expected values corrected; four of the new tests fail on the old SQL (reasoned), the tie-break test passes on both
(documented); REPORT.md regenerates identically.

| Point | Disposition |
|---|---|
| Title/impact say "merchant" but the only consumer is the ADMIN merchant page; apps/web and the merchant API routes expose no fee rate | **Fixed** (title, impact reworded; verified the consumer chain) |
| AUD-050 wording "not gated" is wrong for the 10,000 BD example (base alone exceeds the 50 BD threshold) and the UI line `MerchantDetailPage.tsx:407` was not mentioned | **Fixed** |
| Stale comment `feeSchedule.test.ts:68` ("display helper does the opposite on purpose, MK") | **Fixed** |
| "225" is the schedule rate before the tier bonus and discount | **Noted** in both findings |
| When no schedule is in force capture falls back to `merchants.mdr_bps`; display returns null | Accepted: the page prints "no negotiated schedule on file (uses MDR above)", which is correct |
| Merge-base is behind main (a plain `main..branch` diff shows AUD-017 reverts) | Use a normal merge commit; `main...branch` is clean |
| Not verified: NULL handling, Go tests | Acknowledged; `effective_from` is NOT NULL (migration 0048) |
