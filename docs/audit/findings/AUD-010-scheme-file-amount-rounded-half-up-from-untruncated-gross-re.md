# AUD-010 — Scheme file `amount` rounded half-up from untruncated gross; residue never journaled

| Field | Value |
|---|---|
| Severity | **High** |
| Category | money / rounding |
| Status | confirmed (trace + exported data) |
| Fix commit | — (not fixed; Phase 2) |

## Summary
Scheme file `amount` rounded half-up from untruncated gross; residue never journaled.

## Location
apps/settlement/internal/settlement/batch.go:248-256, scheme_export.go:25-28 (`SchemeAmountBD`), db/migrations/0050

**Sibling locations checked:** `TruncateToSchemeAmount` (correct, used for amount_fils); export reads `amount` first (`COALESCE(sel.amount, …)`); ADR-0002 says residue legs are posted in CloseBatch — no such code exists.

## Root cause
`amount` is written from the **untruncated** gross (`gross/1000` as float64) into NUMERIC(10,2), which rounds half-up on assignment. The file is generated from `amount`, so the scheme is told ≥ what our books (`amount_fils`, truncated) say: always over, never under. Not Visa/BIN rounding — we produce the file.

## Reproduction / evidence
docs/exports/scheme/…2026-09-14: amount_fils 93,270 vs file 93.28; day total file 20,000.20 vs gross 20,000.123.

## Impact
Scheme statement higher than our ledger every day; residue account never reconciles; finance books against the wrong figure.

## Fix (proposed)
Write `amount` from the truncated fils (exact decimal, no float). Residue journaling per ADR-0002 is a separate, larger item — ask before building.

## Re-attack notes
_To be filled after the fix (bypass via other route / tenant / retry / concurrency)._

## Related
AUD-013, ADR-0002
