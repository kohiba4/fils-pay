# AUD-024 — Impersonation grants write access (super_admin→owner, finance→finance); any admin can start one

| Field | Value |
|---|---|
| Severity | **Medium** |
| Category | authz |
| Status | confirmed (trace) — doc conflict |
| Fix commit | — (not fixed; Phase 2) |

## Summary
Impersonation grants write access (super_admin→owner, finance→finance); any admin can start one.

## Location
apps/api/src/admin/impersonation.ts:93-97, routes/adminMerchants.ts:327-330

**Sibling locations checked:** 0035 header, ARCHITECTURE and HANDOVER say read-only `support`; ADMIN.md says super_admin may make changes; writes recorded as merchant_session (audit can't tell).

## Root cause
Role mapping changed in July without updating the guarantees; start route only requires a session.

## Reproduction / evidence
Trace.

## Impact
Admin acts as the merchant owner (issue API keys, refunds later) with merchant attribution.

## Fix (proposed)
Decision needed: which doc wins. Default recommendation: map every role to `support` (the documented security posture).

## Re-attack notes
_To be filled after the fix (bypass via other route / tenant / retry / concurrency)._

## Related
—
