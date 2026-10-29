# AUD-013 — March sweep script is not idempotent, posts to the wrong accounts, wrong window

| Field | Value |
|---|---|
| Owner | A |
| Severity | **High** |
| Category | ops script / money |
| Status | **made safe** (branch `fix/AUD-013-march-sweep-idempotent`, pending merge); **still must not be applied to production until finance confirms the accounting** |
| Fix commit | see `git log fix/AUD-013-march-sweep-idempotent` |

## Summary
March sweep script is not idempotent, posts to the wrong accounts, wrong window.

## Location
scripts/reconcile_march.ts

**Sibling locations checked:** RUNBOOK says copy it monthly and that a rerun is a no-op (false); meeting 2026-07-08 "dry run" — script has no dry-run, so that run posted again.

## Root cause
Random `entry_group_id`, no existing-posting check, no dry-run flag; residue computed from `transactions.captured_fils` (running total) not per scheme line; debits `merchant_payable` (takes money from the merchant) instead of ADR-0002's clearing/residue legs; UTC month (ADR-0003) not Bahrain.

## Reproduction / evidence
Trace; brief: ran twice on staging and the gap doubled.

**Phase 1 runtime check:** Ran scripts/reconcile_march.ts twice against a throwaway COPY of the disposable DB: residue legs 0 → 170 fils (11 legs) → 340 fils (22 legs). Second run doubled the posting, exactly as finance described. It also debits merchant_payable. NEVER run on a real DB.

## Impact
Each run doubles the correction; merchant payables reduced by residue they never owed. Not safe to rerun.

## Fix (applied: safety only; the accounting question is left to finance)
- `scripts/reconcile_march.ts`: **dry run by default** (prints per-merchant residue and `DRY RUN: nothing was posted`); `--apply` posts. Posting is **idempotent**: inside one transaction an advisory lock (`pg_advisory_xact_lock`) serialises concurrent runs and a merchant that already has a ledger leg with the sweep description is skipped. The false comment "re-running is safe, entry_group_id dedupes it" (the group id is a fresh random uuid per call) is replaced by the real mechanism. Totals now say "found" vs "posted by this run".
- Tests (written first; both failed on the old script: a plain run posted a row, and two applies posted 2 rows / 20 fils instead of 10): `scripts/reconcile_march.rerun.test.ts` runs the REAL script against a throwaway database: dry run posts nothing, `--apply` twice posts once (10 fils, not 20), three simultaneous `--apply` runs post once (3 repeats). The existing `reconcile_march.integration.test.ts` ("2000 ledger entries, zero net residual") never calls the script's posting code or a rerun: it recomputes the residue inside the test itself, so it could never have caught this; left unchanged.
- **Deliberately NOT changed (needs finance): the accounting itself.** The script debits `merchant_payable` and credits `scheme_rounding_residue`, i.e. it takes the residue out of the merchants' payable. ADR-0002 books residue between `card_scheme_clearing` (credit) and `scheme_rounding_residue` (debit) and does not touch merchants. It also uses the UTC month (ADR-0003; decision Q6 prefers the Bahrain month), computes residue from `transactions.captured_fils` (a running total) rather than per scheme line, and posts with `occurred_at = now()`. Changing any of this would change what gets booked, so the safe state is: idempotent, dry-run, and not to be applied until finance signs off.

## Re-attack notes
- Answer to the brief's question "was it run more than once in production, and is it safe to rerun?": the old script was NOT safe (reproduced: second run doubled the posting). Whether production ran it twice cannot be determined from the repo: the only evidence is a log with one timestamp, and a log cannot prove a single execution. Finance can check production with: `SELECT merchant_id, count(*), sum(amount_fils) FROM ledger_entries WHERE description LIKE 'March 2026 scheme rounding residue sweep%' AND account_id = 'scheme_rounding_residue' GROUP BY 1;` (more than one group per merchant means it was applied more than once, and the extra groups would need a reviewed reversing entry, NOT a script).
- `RUNBOOK.md` told finance to copy this script every month and said "a second run is a no-op": that was false for the old script and the copies would have inherited the bug. An audit note was added there.
- The March "gap" finance still sees (about 4.75 BD) is not explained by this script (its residue was 0.070 BD in the original run); candidates are the CSV import bug (AUD-012, 4.75 posted as 0.475) or the window difference, but the data is not in the repo.

## Related
AUD-010, ADR-0003
