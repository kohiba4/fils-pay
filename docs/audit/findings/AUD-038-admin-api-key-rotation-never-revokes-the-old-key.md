# AUD-038 — Admin API-key rotation never revokes the old key

| Field | Value |
|---|---|
| Severity | **Medium** |
| Category | security |
| Status | confirmed (trace) |
| Fix commit | — (not fixed; Phase 2) |

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

## Re-attack notes
_To be filled after the fix (bypass via other route / tenant / retry / concurrency)._

## Related
—
