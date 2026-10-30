# Current-state review before Track B implementation

Review-only report. No application code, tests, migrations, configuration or existing docs were changed. No tests,
migrations, seeds, services or scripts were run in this review session. This file is the only file created.

## A. Review identity and coverage

- **Date:** 2026-10-30.
- **Authoritative checkout (team repo):** `~/Desktop/hakathons/fils-pay/fils-pay-hackathon`, branch `main` at `af8e9c9`
  ("Merge pull request #24 … FP-300-settlement-refunds"), clean working tree before this file was added. Its remote is
  named `origin` but points to `kohiba4/fils-pay-hackathon`, the repo TEAM.md calls `mine`. Local branches: `main`,
  stale `audit/fixes` (retired upstream; deleted on the remote).
- **Second checkout holding uncommitted Track B work:** `~/Desktop/hakathons/fils-pay` (cloned from the challenge
  repo `MJ5-byte/fils-pay`), branch `audit/track-b` at `4af5d03` (the last `audit/fixes` commit), with **120 modified
  and 32 untracked paths**, never committed. Branches there: `audit/filspay-hackathon`, `audit/track-b`, `main`;
  remotes `origin` (challenge repo) and `mine` (team repo). No stashes, one worktree. The team clone lives inside it
  and is excluded through `.git/info/exclude`.
- **Markdown coverage:** 117 project Markdown files in the team clone (54 of them finding files), 97 in the outer
  checkout. Details and gaps are in section I. Coverage is **partial**: the Track B docs and coordination docs were
  read; the generated REPORT.md, Track A findings, review reports and most non-audit docs were not re-read today.
- **Source coverage:** targeted only. Track B code paths on `main` were spot-checked to confirm the original defects
  are still present. The uncommitted Track B repairs in the outer checkout were read in full in the previous session
  (2026-10-29). See section I.
- **Exclusions:** `node_modules/`, `.git/`, `dist/` and other build output, Go build caches, the
  `docs/audit/suspicious/originals/*.txt` evidence copies (inventoried, not followed).
- **CPE / KPE:** a search of project Markdown found no use of either term. Their meaning is unknown.

## B. Current project state

- **What is implemented on `main`:** most Track A money/settlement fixes are merged (AUD-008, 009, 010, 011, 012,
  013, 014, 015, 017, 025, 026, 031, 033, 034, 036, 049, 051, 052, Track A half of 018). FP-300 refunds PR 1 (route,
  ownership, row lock, captured ceiling, capped fee reversal) and PR 2 (settlement) are merged.
- **Refunds are switched off:** `POST /v1/refunds` returns early unless `REFUNDS_ENABLED=true`
  (`apps/api/src/config.ts`, default false), pending finance decision Q13 on negative-net recovery.
- **What is incomplete on `main`:** every Track B finding. Spot checks on `main` confirm the original defects remain:
  `findOtpRecipient` is still used at login (AUD-002), `lookupSession` still lacks the `authenticated` predicate
  (AUD-001), and capture/void carry no `requireMerchantRole` (AUD-046). No Track B file under `auth/`,
  `paymentLinks/`, `webhooks/`, `acquirer/`, `adminAuth/` or `apps/reporting` changed on `main` since `8b58b0f`.
  Track A items still open: AUD-016 (waits on AUD-046), AUD-048, AUD-050, AUD-045, FP-300 PR 3 and PR 4.
- **Commit status:** Track B has no commits, branches or PRs. All Track B repairs exist only as uncommitted changes
  in the outer checkout. Commits from this machine are blocked by a deny rule on `git add` / `git commit` in the
  user's Claude settings.
- **Deployment:** no evidence of a Dilmune Cloud deployment. Decision Q10 (platform access and docs) is still open.
  The outer checkout has Dockerfiles and compose files, and local docker containers named `fpprod-*` and `fpverify-*`
  were seen running on 2026-10-29; these are local only and are not a deployment.
- **Current blockers:** git commit restriction; Q10 for deploy; Q13 for enabling refunds; issue #15 (open) is Track
  A waiting on Track B for AUD-046 and the dispatcher half of AUD-018.

## C. Work already performed

- **Team audit (on `main`):** Phase 0 recon, Phase 1 Track A reproductions, decisions Q1 to Q15, 54 finding files,
  TRIAGE.md verdicts, generated INDEX.md and REPORT.md, a skeptical-reviewer charter and 21 saved review reports,
  trackers for each track. INDEX counts: Critical 5, High 21, Medium 18, Low 10; 24 fixed or partly fixed.
- **Earlier solo sessions (outer checkout, not in the team repo):** a full audit on the `8b58b0f` base recorded in
  `docs/audit/FINDINGS_RAW.md` (313 lines, about 85 distinct internal IDs such as AUTH-01, PAY-15, EVT-23, MNY-13),
  and broad uncommitted repairs across Track A and Track B areas, including its own refund implementation, its own
  migrations 0073 to 0084, regression tests (`audit.regression.test.ts`, `audit.followup.test.ts`,
  `cursorConcurrency.test.ts`, Go `audit_regression_test.go`, `audit_followup_test.go`), ops files and ADR 0007/0008.
- **Recorded test result for the outer tree:** 2026-10-29, branch `audit/track-b` plus the uncommitted tree,
  disposable Postgres on 127.0.0.1:55433, fresh migrate and seed passed, typecheck exit 0, TS money 4/4, events
  40/40, api 404/404, reporting 12/12, web 8/8, scripts 5/5, Go all packages ok. Source: the outer checkout's
  `docs/audit/TRACK-B-HANDOFF.md` and job logs. It applies to that tree only. **It is not evidence for `main`**, whose
  code differs.
- **Attribution limits:** the outer tree mixes work from two AI sessions (one that owned source and tests, one that
  owned ops and audit docs). File-level attribution beyond that split is not reliable.
- **The 47 versus about 70 discrepancy:** the numbers come from two independent audits. The team index grew from 47
  to 54 findings (AUD-048 to 054 added). The solo audit used its own ID scheme with about 85 IDs, where one AUD
  finding often maps to several raw items (for example payment links split into PL and PAY items) and some raw items
  have no AUD equivalent (for example PAY-15 no-store headers, EVT-14 bounded response reads, EVT-21 endpoint delete,
  MNY-13 future-dated credits). "About 70 fixed" was an approximate summary of that raw list and cannot be checked
  against the AUD index without a mapping. No consolidated FINDINGS.md exists in either checkout.

## D. Current decisions and ownership

- **Applicable decisions:** Q1 0054/0055 edited in place; Q2 rebuild from ledger (ADR-0007 on main); Q3 paid
  batches never rewritten; **Q4 impersonation read-only `support` for every admin role, plus owner/finance gates on
  capture, void and refund**; Q5 fee formula; Q6 Bahrain calendar months; Q7 to Q9; Q11 holds marked expired; Q12 CSV
  duplicate fingerprint; Q13 to Q15 refunds (Q13 needs finance).
- **Superseded instructions:** `audit/fixes` is retired; `main` is the single shared branch. FP-300 is no longer
  split: Track A took the whole refund build because no Track B work had started, and asks Track B to stay out of
  `routes/refunds.ts`, `payments/*refund*` and refund settlement. TEAM.md's FP-300 section still shows the old split.
- **Track A owns:** `apps/settlement`, `packages/money`, `scripts/`, Track A migrations (0073 to 0079, used up to
  0078; refunds 0090 to 0099), admin import and MDR, `capture.ts`, fee formula (AUD-016), the whole of FP-300.
- **Track B owns:** AUD-001, 002, 006, 007, 019, 020, 021, 022, 023, 024, 032, 038, 039, 040, 041, 042, 043, 044,
  046, 047, plus new **AUD-053** (stuck webhook rows starve the dispatcher). Files: `auth/*`, `adminAuth/*`,
  `paymentLinks/pay.ts`, `webhooks/dispatcher.ts`, `webhooks/envelope.ts`, `apps/reporting`, admin auth and
  impersonation. Migrations **0080 to 0089**. Database port **55433**.
- **Shared dependencies:** `routes/transactions.ts` (B role gates first, then A's AUD-016); `dispatcher.ts` and
  `payoutDisbursement.ts` for AUD-018 (A merged `uq_outbox_settlement_paid_per_batch` in 0075; B makes disbursement
  writes idempotent, unique key name to be agreed); FP-300 PR 3 will add `refund.succeeded` to the dispatcher (A),
  so B must rebase before touching `dispatcher.ts`.
- **Process rules from CLAUDE.md / TEAM.md:** branch `fix/AUD-0xx-slug` from `mine/main`, failing test first, one
  fix per commit, PR into `main`, skeptical reviewer report saved in `docs/audit/reviews/`, update the finding file
  and `tracker/track-b.md` in the same PR, do not hand-edit INDEX.md or REPORT.md (generated by
  `docs/audit/build_report.py`), add a TRIAGE row for any new finding.

## E. Track B readiness

Common facts: on `main`, every item below is unrepaired. A repair exists in the outer checkout (uncommitted), was
read in the previous session and passed the 2026-10-29 run on that tree. None has been ported to `main` or tested
against `main`. "Port" means re-applying the B-owned hunk on a fresh branch from `main`, with its test.

- **AUD-046 capture/void role gates.** Evidence: BUG (traced). Outer repair: `requireMerchantRole('owner','finance')`
  on both routes in `routes/transactions.ts`, writer-actor 403 for impersonation; tests PAY-16 and AUTH-04. Action:
  port first; it unblocks Track A's AUD-016. Coordination: tag @kohiba4 on issue #15.
- **AUD-001 pending session authenticates.** Evidence: BUG (traced). Outer repair: full predicate in
  `auth/sessions.ts lookupSession`; test AUTH-01. Do not port the outer migration 0073 (view change); the code fix
  is sufficient and the filename collides with main's 0073.
- **AUD-002 cross-tenant OTP recipient.** Evidence: BUG (traced). Outer repair: `routes/auth.ts` uses the
  password-verified user; test AUTH-02. `findOtpRecipient` becomes unused.
- **AUD-006 payment link double charge.** Evidence: BUG (traced). Outer repair: `paymentLinks/pay.ts` reservation
  token, re-assert before capture, finalize keyed on it, loser voids or refunds; DB unique
  `uq_transactions_one_live_per_payment_link` (outer migration 0082). Tests PL-03 (two). Limits: post-capture loser
  calls `processRefund`, which on `main` is Track A's refund code behind `REFUNDS_ENABLED`; that dependency must be
  re-checked. Migration must be renumbered into 0080 to 0089 with a new name.
- **AUD-007 client `submittedAt`.** Evidence: BUG (traced). Outer repair: server clock for public callers; trusted
  instant only for the link merchant's API key, clamped to 7 days. Open question: TRIAGE treats client clock as
  untrusted per FP-187; keeping the terminal exception needs Track A or user agreement.
- **AUD-022 cancel IDOR.** Evidence: BUG (traced). Outer repair: `paymentLinks/cancel.ts` scoped by merchant_id;
  test PL-01. Small, independent.
- **AUD-019 callback dedupe.** Evidence: BUG (traced). Outer repair: unique (transaction_id, callback_id) with a
  pre-dedupe DELETE (outer 0075, must become 0080+), `ON CONFLICT DO NOTHING`; test CB-01. Impact is duplicate
  notes only; callbacks change no money state.
- **AUD-021 inbound signature.** Evidence: BUG (traced). Outer repair: raw body, `timingSafeEqual`, 300 s window,
  required by default in production; test CB-02. Limit: no provider signing spec was found in the docs; the header
  format and window come from the repo's own verifier.
- **AUD-020 outbound signed bytes.** Evidence: BUG (traced). Outer repair: serialize once, sign those bytes
  (`webhooks/sign.ts`, `dispatcher.ts`, `testSend.ts`); test WH-01.
- **AUD-038 key rotation.** Evidence: BUG (traced). Outer repair: immediate revoke in `apiKeys/issue.ts`. TRIAGE
  finds no real grace period, which supports immediate revocation.
- **AUD-023 OTP randomness and attempts.** Evidence: BUG (traced). Outer repair: `crypto.randomInt`, atomic
  conditional increment, conditional consume, merchant and admin; test AUTH-03 (parallel guesses).
- **AUD-024 impersonation.** Evidence: DESIGN, decided Q4. Outer repair: all roles map to `support`
  (`admin/impersonation.ts`). Port together with AUD-046.
- **AUD-032 test_mode cleared.** Evidence: BUG (traced). Outer repair: recompute route no longer calls
  `reconcileSandboxFlag`; helper left as dead code.
- **AUD-040 dispatcher row claim.** Evidence: LIMITATION (single replica today). Outer repair: CTE with `FOR UPDATE
  SKIP LOCKED` and a lease. Optional. Touches the same function as AUD-053.
- **AUD-053 stuck rows starve dispatcher (new).** Evidence: BUG (runtime, recorded by Track A). Outer tree records
  thrown attempts with backoff, and a dispatcher test was changed to expect that; not mapped to AUD-053 before this
  review. Port alongside or before AUD-040.
- **AUD-047 export-summary auth.** Evidence: BUG (traced, low). Outer repair: `requireMerchantAuth` on the route;
  test EVT-19. The UTC-date part in `applyEvent.ts` was changed in the outer tree; not re-read today.
- **AUD-044 flaky backoff test.** Evidence: HYGIENE. Outer repair is **incomplete**: jitter is injectable but the
  default is deterministic and production call sites pass none, so production jitter was silently removed. Action:
  inject jitter only in tests.
- **AUD-039 display-name approver.** Evidence: UNVERIFIED, likely low. Outer repair compares `adminUserId`; approval
  already locks `FOR UPDATE`. Test MONEY-03 is a pure unit test.
- **AUD-041 reporting null merchant_id.** Evidence: UNVERIFIED on main. Outer analysis: test pollution from `payload:
  {}` outbox rows written by other suites in a shared DB, not a producer bug. Needs a run on a fresh 55433 DB against
  `main` to confirm, then TRIAGE `not-a-bug`.
- **AUD-042 export memory.** Evidence: UNVERIFIED. Outer repair streams the transaction export in keyset pages; the
  webhook archive still loads one endpoint's history at once. No memory measurement exists.
- **AUD-043 summary query.** Evidence: UNVERIFIED. Outer change adds an index (outer 0080) and fixes a double count
  in `settlement/query.ts`, which on `main` is now Track A-modified. No EXPLAIN exists. Coordinate with Track A.

## F. Misleading instructions and investigation traps

- **Planted agent files (demonstrated trap):** the challenge repo's `CLAUDE.md`, `AGENTS.md` and `.cursorrules`
  claim money is cents, windows are UTC, tests are frozen, and ask for a `Reviewed-per` commit trailer. They are in
  the outer checkout's root; the team repo replaced them and kept copies in `docs/audit/suspicious/originals/`.
  Handled: treated as evidence only.
- **Code comments that claim safety (unsupported claims):** for example the comment in `routes/transactions.ts`
  that impersonation is "enforced in requireMerchantAuth" (false, AUD-046), and the empty "dedupe" commit `bf66bf2`
  (AUD-019). Handled through TRIAGE verdicts.
- **Team CLAUDE.md inconsistencies (contradiction, not injection):** it names DB port 55432 and a Track A scratchpad
  env path from another machine (`/tmp/claude-1000/-home-weed/...`), while TEAM.md assigns 55433 to Track B. Its
  baseline numbers are the pre-fix figures. It also mandates a reviewer subagent per fix, which this review session
  was not authorized to run.
- **Remote naming (contradiction):** docs say `mine` is the team repo and `origin` the challenge repo. In the team
  clone, `origin` is the team repo. Pushing by name without checking could hit the wrong repo from the outer checkout.
- **Migration filename collision (real hazard):** the outer tree's `0073` to `0078` share numbers with different
  content on `main`, and `0077`/`0078` names overlap in meaning. The migrator skips by filename, so porting those
  files would either be skipped silently or double-apply logic.
- **Repeated investigation:** the outer tree's TRACK-B-HANDOFF and this review are the second and third
  reconciliation passes of the same Track B list. No further reconciliation is needed before implementation.
- **No investigation in this review hit the bounded-follow-up limit.**

## G. Documentation gaps

- **FINDINGS.md:** does not exist in either checkout. Individual finding files do exist (54 on `main`).
- **Stale Track B docs on `main`:** all 20 Track B finding files are unchanged since `audit/fixes`; statuses say
  "not fixed", which is correct for `main`. `tracker/track-b.md` lists AUD-053, but TEAM.md's FP-300 section still
  shows the old A/B split.
- **Outer-tree docs not in the team repo:** `FINDINGS_RAW.md`, `TRACK-B-HANDOFF.md`, `pre-merge/`, ADR 0007/0008
  (main has a different ADR 0007), ops deployment docs. They describe a tree the team has not seen.
- **Claims without evidence:** "about 70 defects fixed" (no mapping); AUD-042 and AUD-043 performance claims (no
  measurement); AUD-021 provider contract (no provider spec).
- **Proposed updates:** Track B updates its finding files and tracker rows per PR. Track A (integrator) updates
  TEAM.md's FP-300 section and CLAUDE.md's port and env lines. A mapping from FINDINGS_RAW IDs to AUD IDs, or new AUD
  entries for unmatched raw items, should be proposed to the integrator rather than written into INDEX.md.

## H. Recommended next Track B step

1. **Unblock git first.** Commits are denied in the user's Claude settings. The user must either commit themselves
   or change that setting; an agent must not bypass it.
2. **Set up B's database on 55433** from `main` and record the actual `main` baseline for B's areas (the tracker
   expects 11 refund failures, 1 flaky test and 4 reporting failures; FP-300 merges may have changed that).
3. **Port in this order, one branch per finding from `main`:** AUD-046 with AUD-024; AUD-001; AUD-002; AUD-022;
   AUD-006 (migration 0080 or later, new name); AUD-007 (after the terminal-exception decision); AUD-023; AUD-019
   (migration 0081 or later); AUD-021; AUD-020; AUD-053 then AUD-040; AUD-018 dispatcher half (agree key with A);
   AUD-038; AUD-032; AUD-047; AUD-044 (fix the jitter regression); then trace AUD-041, 039, 042, 043.
4. **Preserve:** the outer checkout's uncommitted tree as the source of the repairs. Copy only B-owned hunks. Do not
   port its refund code, its Track A changes or its migrations by filename.
5. **Information still needed:** user decision on AUD-007's terminal exception; the AUD-018 unique-key name from
   Track A; Q13 status if AUD-006's auto-refund path depends on refunds being enabled.
6. **Avoid repeating:** another full reconciliation of the 20 findings, re-deriving the 47/70 question, and running
   anything on 55432 or 5432.

## I. Coverage appendix

- **Markdown read in full this session (team `main`):** CLAUDE.md, TEAM.md, tracker/track-a.md, tracker/track-b.md
  (lines 1 to 53).
- **Read partially this session:** DECISIONS.md (Q10 to Q13), TRIAGE.md (header and Track B rows), INDEX.md (counts
  and new rows), AUD-053 (root cause to fix).
- **Read in the previous session (audit/fixes version, unchanged on main for these files):** all 20 Track B finding
  files, PLAN.md, INVARIANTS.md, PHASE1-TRACK-A.md, ruled-out/README.md, DECISIONS.md Q1 to Q6.
- **Read in earlier sessions on the 8b58b0f base, not re-read today:** ARCHITECTURE.md, HANDOVER.md, ADMIN.md,
  ONBOARDING.md, RUNBOOK.md, CHANGELOG.md, ADRs 0001 to 0006, postmortem-2026-05, perf docs, meetings, the planted
  agent files.
- **Inventoried only (not read):** REPORT.md (2,294 lines, generated), FP-300-PLAN.md, BRIEF.md, CLAIMS.md,
  BASELINE.md, ARCHITECTURE-MAP.md (team versions), reviewer charter, all 21 files in reviews/, suspicious/README.md,
  Track A finding files, AUD-048 to 052 and 054, ADR 0007 (main), design and runbook docs, ops/README.md.
- **Source on `main`:** spot-checked `auth/sessions.ts`, `routes/auth.ts`, `routes/transactions.ts`,
  `routes/refunds.ts`, `config.ts`; changed-file list for `apps/api/src` and `apps/reporting` since `8b58b0f` via
  diff. Not reviewed: Track A's refund and settlement code on `main`.
- **Source in the outer tree:** read in full on 2026-10-29 for the Track B paths listed in section E; not re-read
  today.
- **Unresolved questions:**
  - Does `main` still show 4 reporting failures on a fresh DB, and is AUD-041 test pollution there too?
  - Does AUD-006's post-capture refund path work on `main` when `REFUNDS_ENABLED` is false?
  - Which AUD-053 behaviour does Track A expect, and does the outer dispatcher change satisfy its repro?
  - Should the offline-terminal `submittedAt` exception (AUD-007) survive?
  - What unique key does Track A want for disbursement idempotency (AUD-018)?
