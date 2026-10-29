# Team split (two people, parallel work)

Split by **code area** so we rarely touch the same files. Owners are in the
`Owner` column of [INDEX.md](INDEX.md) and in each finding file.

## Track A — money, settlement, data
Go `apps/settlement`, `packages/money`, `scripts/`, DB migrations, admin money tools.

AUD-008, 009, 010, 011, 012, 013, 014, 015, 016, 017, 018, 025, 026, 031, 033, 034, 036, 037, 045.
**AUD-026 (broken migrations 0054/0055) goes first** — it blocks a fresh database for both of us.
Owns `capture.ts` and the fee formula (AUD-016, pending PLAN Q5).

## Track B — API security and integrations
`apps/api` (auth, payment links, webhooks, admin auth), `apps/reporting`.

AUD-001, 002, 006, 007, 019, 020, 021, 022, 023, 024, 032, 038, 039, 040, 041, 042, 043, 044.
Owns `dispatcher.ts`, `envelope.ts`, `pay.ts`, `auth/*`, `adminAuth/*`.

## FP-300 (refunds) — shared, do after the tracks
AUD-003, 004, 005, 027, 028, 029, 030 are fixed as part of building refunds.
Agree the interface first, then split:
- **A:** ledger legs, batch/settlement adjustment, reconciliation, refund summary view, migrations.
- **B:** `POST /v1/refunds` route and ownership checks, `refund.succeeded` envelope + dispatcher, timeline.
- **Deploy to Dilmune Cloud (AUD-035):** whoever finishes first.

## Rules
1. **Branches:** one per fix, `fix/AUD-0xx-slug`, branched from `audit/fixes`; small PRs back into `audit/fixes`; rebase before merging. One logical fix per commit, regression test written to fail first.
2. **Migration numbers:** A uses **0073–0079**, B uses **0080–0089**. Never reuse or edit an applied migration.
3. **Docs:** only edit your own finding file(s) when a status changes (status line, fix commit hash, re-attack notes). Do **not** both edit `INDEX.md` / `CLAUDE.md`: the integrator (A, unless agreed otherwise) refreshes them after merges.
4. **Databases:** each person runs their own disposable Postgres on a different port (A: 55432, B: 55433). Never point anything at a shared or real database. Never run `scripts/reconcile_march.ts`.
5. **Shared files — ask before touching:** `capture.ts` / fee code (A), `dispatcher.ts` (B), `apps/api/src/admin/*` (import + MDR = A; auth + impersonation = B), `packages/money` (A; only if a real bug is found).
6. **Tests:** never weaken or delete a test to get green. If a test encodes a bug, show it, explain, and fix it in the same commit as the code fix.
7. **Context resets:** read `CLAUDE.md`, then `docs/audit/INDEX.md`, then your finding files.
8. **Remotes:** `mine` = private team repo (`kohiba4/fils-pay-hackathon`). `origin` = challenge repo — do not push there.

## Blocked on (answer PLAN.md Q1–Q10 before Phase 2)
Q1 migrations (A, first) · Q2 rebuild source (A) · Q3 MDR recalc (A) · Q4 impersonation (B) · Q5 fee formula (A) · Q6 month windows · Q7 volume tier (A) · Q8 split ledger model (A) · Q9 seed dump/secret rotation · Q10 Dilmune access.
