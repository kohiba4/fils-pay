# AUD-038 — Admin API-key rotation never revokes the old key

| Field | Value |
|---|---|
| Owner | B |
| Severity | **Medium** |
| Category | security |
| Status | **fixed** (merged with PR #27/#28) (runtime-verified locally on 55433; independently reviewed 2026-10-30: confirmed) |
| Fix commit | uncommitted on local branch fix/AUD-046-024-merchant-write-authority (stack); patch stack/13-AUD-038.patch |

## Summary
Admin API-key rotation never revokes the old key.

## Location
apps/api/src/admin/apiKeys.ts:15-50

**Sibling locations checked:** 0056 `revoke_after` column unused; ADMIN.md mentions a 24h grace no code implements.

## Root cause
New key issued with rotated_from_key_id; old row never gets revoked_at/revoke_after.

## Reproduction / evidence
Trace; 0037 comment (FH saw old key still working).

## Impact
Rotating a leaked key does nothing.

## Fix (proposed)
Set `revoked_at = now(), revoked_reason='rotated'` in the same transaction (or a grace window if you prefer).

## Fix (applied, Track B, 2026-10-30)
Discovered in the Phase 0 team audit unless stated; repaired here. Base `main` af8e9c9, uncommitted working tree in `~/Desktop/hakathons/fils-pay-hackathon`; patch `~/Desktop/hakathons/track-b-patches/stack/13-AUD-038.patch`.
**Contract verified.** TRIAGE (current): "Old key is never revoked. The '24h grace' mentioned in a migration comment is not
in ADMIN.md or in code." 0037's "that's the 24h grace period (see ADMIN.md)" points at text that does not exist; 0056's
`revoke_after` "revoked by a sweep job" has no sweep job and no reader. No decision establishes a grace period, so
rotation = immediate revocation.

**Root cause (confirmed by test).** `apiKeys/issue.ts issueApiKeyInTx` recorded `rotated_from_key_id` but never revoked the
old key, although its own docstring said it did.

**Change.** In the same transaction as the new key's insert (and the admin audit row), `UPDATE api_keys SET revoked_at =
now(), revoked_reason = 'rotated' WHERE id = $1 AND merchant_id = $2 AND revoked_at IS NULL`; anything other than one row
aborts the rotation. Only caller: `admin/apiKeys.ts rotateApiKeyAsAdmin` (already locks the old row `FOR UPDATE`).

**Test changed (encoded the bug):** `routes/admin.test.ts` "API key rotation … the previous key stays active" asserted the
old key still authenticates and `revoked_at IS NULL`; corrected (not deleted) to require 401 for the old key and
`revoked_reason = 'rotated'`. It failed on `main` (200), passes after. Existing tests kept: forced audit failure rolls the
whole rotation back (atomicity), already-revoked → 409, another merchant's key → 404. Admin + API-key tests 41/41.

## Re-attack notes
- Old key after rotation: 401. New key: 200. Audit row written; a forced audit failure rolls back both the new key and
  the revocation (existing test).
- Tenant isolation: rotating another merchant's key id is 404 (existing test); the revoke statement is also merchant-scoped.
- **Compatibility:** an integration still using the old key stops working the moment an admin rotates it. If ops want an
  overlap window, it needs a decision and a real `revoke_after` sweep; ADMIN.md should state the immediate behaviour.
- Independent skeptical review (2026-10-30, `docs/audit/reviews/2026-10-30-track-b-batch.md`): **CONFIRMED** — regression test fails with the fix reverted, passes with it; the `routes/admin.test.ts` change is a correction (0037 says rotation revokes; no grace-period mechanism exists).

## Related
—
