# AUD-036 — Adjustment import has no duplicate-submit protection

| Field | Value |
|---|---|
| Owner | A |
| Severity | **Medium** |
| Category | idempotency |
| Status | **fixed** (branch `fix/AUD-036-import-duplicate-guard`) |
| Fix commit | see `git log fix/AUD-036-import-duplicate-guard` |

## Summary
Adjustment import has no duplicate-submit protection.

## Location
apps/api/src/admin/adjustmentImport.ts:47-110

**Sibling locations checked:** Comment claims unique original_filename — no such constraint.

## Root cause
The importer inserted an `adjustment_imports` row and posted every row with no check of what had been imported before. The code comment "re-upload is blocked by the unique original_filename" is false: no such constraint exists (migration 0065 has only a non-unique uploader index), and the filename is optional and defaults to `pasted.csv`.

## Reproduction / evidence
Slack 2026-09-04: same file imported twice seconds apart. Reproduced by tests (before the fix the second submit posted every row again, and two concurrent submits both succeeded).

## Impact
Every duplicate submit (double click, retry, someone re-pasting the file) posts every row again: the merchant balance and ledger are overstated or understated by the full file, with no error. Money rows are never idempotent here, so the only recovery is a manual counter-import.

## Fix
Migration 0077 adds `adjustment_imports.content_sha256` (nullable, plain index). `applyAdjustmentImport` parses all rows first, computes an order-independent fingerprint of `merchantId(lowercase)|fils|reason`, takes `pg_advisory_xact_lock` on it, and refuses (409 `duplicate_import`, message names the earlier import id and time) if an import with that fingerprint exists, unless the optional request field `allowDuplicate: true` is given (boolean, else 400). The route passes the flag through; the admin page shows the server message with an "Import anyway" button (confirm dialog). Decision Q12 (finance to confirm the override is the right shape). Imports made before the migration have no fingerprint and are not matched (a re-upload of an old file is not caught once). Tests: 3 unit tests (duplicate with a different file name/spelling/id case, deliberate repeat and different content, two concurrent submits) and 1 route test. Tests changed: none. Docs: ADMIN.md corrected, stale "2dp" comment in the admin API client fixed.

## Re-attack notes
Concurrency: advisory lock per fingerprint, tested with two simultaneous submits (one wins). Other routes posting adjustments (single manual adjustment, credits) are separate flows with their own approvals and are not affected. Changing the reason text or one amount makes the content differ, so a "slightly edited" re-upload is not blocked (by design: it is different content). Row order is ignored.

## Related
AUD-012
