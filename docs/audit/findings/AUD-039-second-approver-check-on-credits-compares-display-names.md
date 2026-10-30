# AUD-039 — Second-approver check on credits compares display names

| Field | Value |
|---|---|
| Owner | B |
| Severity | **Medium** |
| Category | authz |
| Status | fix ready, not merged (runtime-verified locally on 55433; independently reviewed 2026-10-30: confirmed) |
| Fix commit | uncommitted on local branch fix/AUD-046-024-merchant-write-authority (stack); patch stack/17-AUD-039.patch |

## Summary
Second-approver check on credits compares display names.

## Location
apps/api/src/admin/creditApproval.ts:11

**Sibling locations checked:** 0060 note.

## Root cause
Identity compared by mutable display name instead of admin id.

## Reproduction / evidence
Trace; exploitability depends on how display names are set — Phase 1.

## Impact
Self-approval or false rejection of large credits.

## Fix (proposed)
Compare admin user ids.

## Fix (applied, Track B, 2026-10-30)
Discovered in the Phase 0 team audit unless stated; repaired here. Base `main` af8e9c9, uncommitted working tree in `~/Desktop/hakathons/fils-pay-hackathon`; patch `~/Desktop/hakathons/track-b-patches/stack/17-AUD-039.patch`.
**Verdict: BUG (runtime), low-to-medium.** Requirement: ARCHITECTURE / INVARIANTS I26 "credits above threshold need a
*different* second approver"; HANDOVER says the approver is compared by admin user id.
`admin/creditApproval.ts assertDistinctApprover` compared `displayName` (requester's snapshot vs approver's current name).
- Reachable without DB access: two different admins who share a display name (not unique in `admin_users`) — the
  legitimate checker was refused (409 `self_approval_forbidden`). Availability/correctness impact.
- Needs DB access (no route renames admins): a requester whose display name changed could approve their own credit
  (two-person control bypass). Reproduced with a direct UPDATE.

**Change.** Compare `adminUserId` (the request row's `requested_by_admin_user_id` vs the session's admin id). The
`FOR UPDATE OF cr` lock and the `pending_approval` check in `approveCreditRequest` are untouched.

**Tests:** appended to `apps/api/src/routes/adminCredits.test.ts` (real approval route over HTTP): `AUD-039: two different
admins who share a display name can be maker and checker` (failed on `main` with 409), `AUD-039: the requester cannot
approve their own credit after changing their display name` (failed on `main` with 200 and a journal), `AUD-039: two
checkers approving the same credit at once post it exactly once` (passed on `main` too: the existing lock holds). Credit
tests 25/25. **Tests changed:** none; the existing unit tests in `admin/creditApproval.test.ts` still pass (their actors
differ in both id and name).

## Re-attack notes
- Same name, different people: approved once. Same person, new name: 409, nothing journaled.
- Concurrent approvals by two checkers: one 200, one 409, one ledger group.
- Reject path does not do a two-person check (any finance admin may reject); unchanged, not a requirement in the docs.
- Independent skeptical review (2026-10-30, `docs/audit/reviews/2026-10-30-track-b-batch.md`): **CONFIRMED** — regression test fails with the fix reverted, passes with it.

## Related
—
