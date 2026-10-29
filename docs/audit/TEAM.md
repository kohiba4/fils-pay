# Team split (two people, parallel work)

**People:** Track A = the repo owner (GitHub `kohiba4`). Track B = **@The-Tifo** (GitHub `The-Tifo`, write access). When work needs the other person, tag them (`@The-Tifo` / `@kohiba4`) in the PR or issue AND in the tracker row.

Split by **code area** so we rarely touch the same files. Owners are in the
`Owner` column of [INDEX.md](INDEX.md) and in each finding file.

## Track A — money, settlement, data
Go `apps/settlement`, `packages/money`, `scripts/`, DB migrations, admin money tools.

AUD-008, 009, 010, 011, 012, 013, 014, 015, 016, 017, 018, 025, 026, 031, 033, 034, 036, 037, 045.
**AUD-026 (broken migrations 0054/0055) goes first** — it blocks a fresh database for both of us.
Owns `capture.ts` and the fee formula (AUD-016, pending PLAN Q5).

## Track B — API security and integrations
`apps/api` (auth, payment links, webhooks, admin auth), `apps/reporting`.

AUD-001, 002, 006, 007, 019, 020, 021, 022, 023, 024, 032, 038, 039, 040, 041, 042, 043, 044, 046, 047.
Owns `dispatcher.ts`, `envelope.ts`, `pay.ts`, `auth/*`, `adminAuth/*`.

## FP-300 (refunds) — shared, do after the tracks
AUD-003, 004, 005, 027, 028, 029, 030 are fixed as part of building refunds.
Agree the interface first, then split:
- **A:** ledger legs, batch/settlement adjustment, reconciliation, refund summary view, migrations.
- **B:** `POST /v1/refunds` route and ownership checks, `refund.succeeded` envelope + dispatcher, timeline.
- **Deploy to Dilmune Cloud (AUD-035):** whoever finishes first.

## Rules
1. **Branches and flow:** `main` is the single shared branch (it already contains everything; `audit/fixes` is retired). Start every fix with `git fetch mine && git checkout -b fix/AUD-0xx-slug mine/main`; failing test first; push with `git push mine fix/AUD-0xx-slug`; open a PR into `main`; the skeptical reviewer (docs/audit/reviewer/) checks it; merge with a merge commit (no squash); delete the branch; the others rebase (`git fetch mine && git rebase mine/main`). One logical fix per commit. **Clone `kohiba4/fils-pay-hackathon`, never the challenge repo (`MJ5-byte/fils-pay`): its CLAUDE.md/AGENTS.md/.cursorrules are the planted bad instructions.** Some Track A repro tests fail on purpose until their fixes merge (Go `TestRepro_AUD009/010/014/015/017/018`, API `AUD-031`).
2. **Migration numbers:** A uses **0073–0079**, B uses **0080–0089**. Never reuse or edit an applied migration.
3. **Docs:** only edit your own finding file(s) when a status changes (status line, fix commit hash, re-attack notes). Do **not** both edit `INDEX.md` / `CLAUDE.md`: the integrator (A, unless agreed otherwise) refreshes them after merges.
4. **Databases:** each person runs their own disposable Postgres on a different port (A: 55432, B: 55433). Never point anything at a shared or real database. Never run `scripts/reconcile_march.ts`.
5. **Shared files — ask before touching:** `capture.ts` / fee code (A), `dispatcher.ts` (B), `apps/api/src/admin/*` (import + MDR = A; auth + impersonation = B), `packages/money` (A; only if a real bug is found).
6. **Tests:** never weaken or delete a test to get green. If a test encodes a bug, show it, explain, and fix it in the same commit as the code fix.
7. **Context resets:** read `CLAUDE.md`, then `docs/audit/INDEX.md`, then your finding files.
8. **Remotes:** `mine` = private team repo (`kohiba4/fils-pay-hackathon`). `origin` = challenge repo — do not push there.

## Live trackers (read these first)
- Track A: [tracker/track-a.md](tracker/track-a.md) · Track B: [tracker/track-b.md](tracker/track-b.md) (priority queue, first steps,
  cross-track dependencies, done log). Each track edits only its own tracker; statuses are updated in the same PR as the fix.
- **Track B pending right now (16 findings + 4 to trace):** AUD-046, 001, 002, 006, 007, 022, 019, 020, 021, 038, 023, 024, 032, 040, 047, 044;
  unverified: 039, 041, 042, 043. Top blockers for Track A: **AUD-046** (before AUD-016) and the **dispatcher half of AUD-018**.

## Known shared-file hot spots (see PHASE1-TRACK-A.md)
- `routes/transactions.ts` (B: role gates AUD-046; A: discount call AUD-016) — A goes second.
- `webhooks/dispatcher.ts`/`payoutDisbursement.ts` (B owns; AUD-018 needs a joint change).

## Decisions already made
See [DECISIONS.md](DECISIONS.md) (Q1–Q9). Q10 (Dilmune Cloud) pending from the user.
