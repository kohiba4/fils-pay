# Independent review: AUD-010 scheme amount truncation (2026-10-29)

Reviewer: skeptical-reviewer charter via a general-purpose subagent, from a `git archive` extract of
`fix/AUD-010-scheme-amount-truncate`. Output is data; points were re-verified before acting.
**Result: no blocking objections.** SQL typing verified for 0, 10, 4740, 99,999,999,990 (overflow starts at 99,999,999,999,990,
same limit as before); no other writer of `scheme_export_lines.amount` rounds (migration 0050 backfill exact, seed writes
quantized multiples of 10); "file always >= our books, upward only" correct; strengthened test reasoned to fail on the old
code (old output `[1.01 12.34 4.74 4.75]`); ADR-0002 residue statement accurate (no residue code in CloseBatch); diff hygiene clean.

| Point | Disposition |
|---|---|
| "third decimal 5-9" wording loose (it is the fils units digit) | **Fixed** in the finding |
| Add boundary tests (0, large) and note pre-existing limits (NUMERIC(10,2) overflow ~100M BD; gross < -9 fils violates the CHECK) | **Done** (`TestSchemeExportAmountBoundaries`; limits noted). My first expectation was wrong (999 fils = 0.99, not 9.99) and I had pushed before checking the run; corrected in a follow-up commit after a verified green run |
| Repro figure "93.28 want 93.27" is the auditor's own run | True: it was observed on the old code before the fix |
| Who bears the 0.01 BD overstatement unverified | Acknowledged; finance decision |
| Historical files already sent keep the rounded-up amounts | Already flagged (read-only query in the finding) |
