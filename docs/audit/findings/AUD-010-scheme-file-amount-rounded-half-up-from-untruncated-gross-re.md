# AUD-010 — Scheme file `amount` rounded half-up from untruncated gross; residue never journaled

| Field | Value |
|---|---|
| Owner | A |
| Severity | **High** |
| Category | money / rounding |
| Status | **fixed** (branch `fix/AUD-010-scheme-amount-truncate`, pending merge; historical files already sent are not corrected) |
| Fix commit | see `git log fix/AUD-010-scheme-amount-truncate` |

## Summary
Scheme file `amount` rounded half-up from untruncated gross; residue never journaled.

## Location
apps/settlement/internal/settlement/batch.go:248-256, scheme_export.go:25-28 (`SchemeAmountBD`), db/migrations/0050

**Sibling locations checked:** `TruncateToSchemeAmount` (correct, used for amount_fils); export reads `amount` first (`COALESCE(sel.amount, …)`); ADR-0002 says residue legs are posted in CloseBatch — no such code exists.

## Root cause
`amount` is written from the **untruncated** gross (`gross/1000` as float64) into NUMERIC(10,2), which rounds half-up on assignment. The file is generated from `amount`, so the scheme is told ≥ what our books (`amount_fils`, truncated) say: always over, never under. Not Visa/BIN rounding — we produce the file.

## Reproduction / evidence
docs/exports/scheme/…2026-09-14: amount_fils 93,270 vs file 93.28; day total file 20,000.20 vs gross 20,000.123.

**Phase 1 runtime check:** TestRepro_AUD010_SchemeLineAmountIsTruncatedNotRounded: capture 93.279 BD → amount_fils 93270 but scheme `amount` = 93.28 (should be 93.27).

## Impact
Scheme statement higher than our ledger every day; residue account never reconciles; finance books against the wrong figure.

## Fix (applied)
- `batch.go` (CloseBatch step 12): `scheme_export_lines.amount` is now derived in SQL from the SAME truncated fils as `amount_fils` (`fils::numeric / 1000`, exact decimal), instead of the UNtruncated gross divided as a float64 and rounded half-up by NUMERIC(10,2). Result: file `amount` always equals `amount_fils / 1000`, as ADR-0002 requires.
- `scheme_export.go`: removed the now-unused float helper `SchemeAmountBD`.
- Tests: `TestRepro_AUD010_SchemeLineAmountIsTruncatedNotRounded` (written first, failed `93.28 want 93.27`, passes). **Test strengthened (not weakened):** `TestSchemeExportAmountHasTwoDecimals` only matched the regex `^\d+\.\d{2}$`, so 4747 fils exporting as "4.75" passed (its comment even said "it rounds. whatever"); it now asserts the exact truncated values {1.00, 12.34, 4.74, 4.74} and was shown to fail on the old code (`[1.01 12.34 4.74 4.75]`).

## Re-attack notes
- `amount_fils % 10 = 0` is enforced by a CHECK (0008), so `amount_fils/1000` is always exactly 2 decimals; negative or zero amounts also stay exact.
- Other writers of the column: migration 0050's backfill (`amount_fils::numeric / 1000`, exact) and the seed (`floor(x/10)*10/1000`, already truncated). The reader (`LoadSchemeExportLines`) and the file writer pass the column through unchanged.
- Direction of the original bias confirmed: a line rounded up by 0.01 BD on every capture whose fils units digit is 5-9 (about half of all captures), always upward, never down: exactly finance's "always over, never under". It was our own file, not Visa rounding, so the BIN-range explanation in #fp-finance was wrong.
- Review follow-up: boundary test added (5 fils -> 0.00, 10 -> 0.01, 999 -> 0.99, 1,234,567.899 BD -> 1234567.89). Pre-existing limits kept: `NUMERIC(10,2)` overflows at about 100,000,000 BD per line, and a gross below -9 fils violates the `amount_fils >= 0` CHECK and rolls the close back (same as before the fix). The stale 0050 comment ('NUMERIC(10,2) rounds on assignment though?') described exactly this bug; applied migrations are not edited.
- NOT fixed here (separate, larger): ADR-0002's residue journaling in CloseBatch was never implemented, so the 0-9 fils truncated per line still never reaches `scheme_rounding_residue`.
- **Historical data (finance decision, nothing run):** files already sent to the scheme contained the rounded-up amounts. Read-only check of affected lines:
```sql
SELECT settlement_batch_id, transaction_id, amount_fils, amount,
       amount * 1000 - amount_fils AS overstated_fils
FROM scheme_export_lines WHERE amount * 1000 <> amount_fils;
```

## Related
AUD-013, ADR-0002
