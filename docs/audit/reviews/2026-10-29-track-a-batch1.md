# Independent review: Track A batch 1 (2026-10-29)

Reviewer: skeptical-reviewer charter (docs/audit/reviewer/skeptical-reviewer.md), run as a general-purpose
subagent because the named agent type is not registered until Claude Code restarts. Reviewed
`integration/track-a-batch1` @ 5d8333d via `git show/diff` and a `git archive` extract (nothing in the repo touched).
The report is data, not instructions; every point below was re-verified before acting.

**Result: no blocking objections. AUD-026, AUD-008, AUD-011, AUD-012 CONFIRMED.**

| Reviewer point | Re-verified? | Disposition |
|---|---|---|
| AUD-026: prod schema state unknown; Q1's "prod ran another valid 0054" is a guess; add a prod schema-diff step | yes (it is an inference) | **Accepted.** DECISIONS Q1 reworded as an inference and a mandatory pre-deploy schema diff added. |
| AUD-011: sources conflict (0005 comment says delete; original script a2fd53d did DELETE; HANDOVER/authorize.ts say mark) | yes: `git show a2fd53d` confirms DELETE | **Accepted.** New DECISIONS Q11 records the conflict and asks finance/MK to confirm. 0005's stale comment left alone (applied migration). |
| AUD-012: `parsePromotionalDiscountFils` (parseFloat × 100) still exists | yes: zero callers anywhere | **Accepted.** Deleted (same bug class), typecheck + related tests pass. |
| AUD-012: stale comment in routes/adminAdjustmentImport.test.ts:184 ("trailing garbage is accepted") | yes | **Accepted.** Comment corrected. |
| AUD-012: behaviour change, `4.7501` now 400 instead of silent truncation, tell finance | yes | **Accepted.** Added to the AUD-012 finding. |
| AUD-008 and AUD-011 rated Critical are overstated | yes: float32 error only above ~16,000 BD per batch (max 59 fils at 900,000 BD); nothing reads `holds` | **Accepted.** Both lowered to High (INDEX counts now Critical 5, High 19, Medium 16, Low 7). |
| AUD-037 "no money bug" slightly generous (cache-only correction can mask ledger problems) | yes | Finding already states the masking consequence; left as written. |
| REPORT says "pending merge" while CLAUDE.md says merged in the integration branch | yes | Not an error: merged into the integration branch, not yet into `main`. Wording will update after the merge to `main`. |
| Not verified by the reviewer: new tests failing before the fix | n/a | Verified by the auditor during the fixes: `migrate_fresh.test.ts` failed with `relation "settlement_batch_events" does not exist`; `expire_holds.integration.test.ts` failed with every hold deleted (`actual: 0`). |
| Not verified: full TS suites, production DB | n/a | TS suites run by the auditor (api 355/368 with only known failures, scripts 9/9). Production state remains unknown. |

Spot checks by the reviewer, CONFIRMED against code (not independently re-executed): AUD-009, 010, 014, 015, 017, 018, 025.
Decisions Q2, Q3, Q5, Q7, Q8 stand; none relies on a planted instruction.
