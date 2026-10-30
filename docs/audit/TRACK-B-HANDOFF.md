# Track B handoff (owner: @The-Tifo) — 2026-10-30

Everything below is **uncommitted** in `~/Desktop/hakathons/fils-pay-hackathon` (team repo `kohiba4/fils-pay-hackathon`,
remote named `origin` in this clone), local branch `fix/AUD-046-024-merchant-write-authority`, base `main` **af8e9c9**.
Nothing is committed, pushed, merged, deployed or independently reviewed. The agent's settings deny `git add` /
`git commit` (`~/.claude/settings.json`); this was not bypassed.

## Where the work is
- Working tree: the clone above (81 changed or new paths: code, tests, 3 migrations, finding files, TRIAGE, tracker, docs).
- **Patch stack:** `~/Desktop/hakathons/track-b-patches/stack/01-…21-*.patch`. Apply **in order** to `main` af8e9c9
  (`git apply`); verified: all 21 apply cleanly to a clean worktree of af8e9c9 and the result is byte-identical to the
  working tree (0 differing files). Patches 01–04 also apply alone to `main`; later ones depend on earlier ones where
  they share files (noted below).
- Evidence (measurement scripts, EXPLAIN plans, outputs): `~/Desktop/hakathons/track-b-patches/evidence/`.
- Reference checkout `~/Desktop/hakathons/fils-pay` (`audit/track-b`, 152 uncommitted paths): unchanged, read-only.
- Scratch worktrees (safe to remove): `~/Desktop/hakathons/fph-baseline-main`, `~/Desktop/hakathons/fph-verify-stack`.

## Validation (exact)
Disposable container `filspay-trackb-pg` (postgres:16-alpine, created by Track B) on **127.0.0.1:55433**, database
dropped and recreated before each full run; throwaway password and the repo's documented test encryption key.
`REFUNDS_ENABLED` unset (default false); refund test files enable it in their own config as on `main`.
Commands (repo root): `npm run migrate && npm run seed`, `npm run typecheck`, `npm test`; `cd apps/settlement && go test ./...`.

| Run | migrate+seed | typecheck | events | money | admin | api | reporting | web | scripts | Go |
|---|---|---|---|---|---|---|---|---|---|---|
| `main` af8e9c9 (api + reporting only) | ok (74) | – | – | – | – | 398/399 | 7/11 | – | – | – |
| Track B stack, final | ok (77, seed self-checks pass) | exit 0 | 4/4 | 40/40 | 3/3 | **446/446** | **12/12** | 8/8 | 14/14 | all ok except 1 |

- 0 skipped in every TS suite; DB-backed tests ran against 55433.
- `main`'s only API failure was the AUD-044 jitter test; its 4 reporting failures were AUD-041 pollution. Both are gone.
- Go: the one failure is **`TestRepro_AUD048_RebuildThenCloseDoesNotDoubleCount`**, Track A's intentional repro for open
  AUD-048; it fails identically on unmodified `main` code (checked in the baseline worktree). Not a regression.
- Not run: web/admin `vite build` (no web/admin source changed; web `tsc --noEmit` clean).

## Dispositions (assigned findings)
| ID | Result | Key change | Tests (new unless noted) |
|---|---|---|---|
| AUD-046 + 024 | fixed | capture/void owner/finance; impersonation always `support`; disabled admin's grant refused; writer helper refuses impersonation | `routes/merchantWriteAuthority.test.ts` (6) |
| AUD-001 | fixed | `lookupSession` requires `authenticated = true` (no view migration) | `routes/authPendingSession.test.ts` |
| AUD-002 | fixed | OTP + session bound to the password-verified user | `routes/authOtpRecipient.test.ts` |
| AUD-022 | fixed | cancel scoped by `merchant_id` | +1 in `routes/paymentLinks.test.ts` |
| AUD-006 | fixed (prevention; no refund path) | migration **0080**; takeover only without a live transaction; recovery voids abandoned auths / records completed captures; failed capture voids its auth; no false 200 | `paymentLinks/payConcurrency.test.ts` (5, gated acquirer) |
| AUD-007 | fixed | server clock only; `submittedAt` ignored | +2 there; corrected encoded test in `pay.test.ts` |
| AUD-023 (+ new 055) | fixed | `crypto.randomInt`; atomic attempt counter; conditional consume; merchant **and** admin | `routes/otpAttempts.test.ts` (5) |
| AUD-019 | fixed | migration **0081** (duplicates marked, not deleted); `ON CONFLICT DO NOTHING` | +3 in `routes/acquirerCallbacks.test.ts` |
| AUD-021 | fixed; provider contract unverified | raw-body HMAC, `timingSafeEqual`, signature required by default in production; no freshness window | +3 there |
| AUD-020 | fixed | serialise once, sign and send the same bytes (dispatcher + test-send) | +2 in `webhooks/dispatcher.test.ts` |
| AUD-053 | fixed | pre-transport failures count as attempts (backoff, exhaustion, error kept) | +2; corrected encoded poison-row test |
| AUD-018 (B half) | fixed; index name to confirm | migration **0082**: one disbursement per batch (duplicates marked); `ON CONFLICT DO NOTHING` | +2 in `webhooks/payoutDisbursement.test.ts` |
| AUD-038 | fixed | rotation revokes the old key in the same transaction (no grace period exists) | corrected encoded test in `routes/admin.test.ts` |
| AUD-032 | fixed | recompute no longer clears `test_mode` | `routes/adminMerchantsRecompute.test.ts` |
| AUD-047 | fixed | auth hook on export-summary; Bahrain date in the refund rollup | `routes/reportingExportSummary.test.ts`, `reporting/…/dailySummaryRollup.test.ts` |
| AUD-044 | fixed (test only) | fixed jitter only where an exact value is asserted; production `Math.random` kept | +1 band test |
| AUD-041 | **not a bug** (test pollution) | `archiveReplay.test.ts` fixture used payload `{}`; fixed fixture, no production change | reporting 12/12 after the API suite |
| AUD-039 | fixed | compare admin ids, not display names | +3 route tests in `routes/adminCredits.test.ts` |
| AUD-042 | fixed (export) + capped (archive) | export streamed in keyset pages; archive refused above 20,000 deliveries (422) | +1 export paging test, +1 archive cap test |
| AUD-043 | wrong totals fixed; slowness not reproduced | summary sums per-event capture deltas; **no index** (no evidence) | `settlement/summaryTotals.test.ts` |
| AUD-040 | **deferred** (limitation) | none; supported deployment is one API replica | — |

Measurements: export 300k rows `main` peak RSS 476.5 MB (+371) → 132.8 MB (+33); archive 100k deliveries +268.6 MB;
summary on 404,140 events: `main` 372,420,000 fils vs 124,140,000 true (3×), 167 ms vs 58 ms warm.

## New findings from the adjacent-path pass (finding file + TRIAGE row each)
- **AUD-055** (Medium): payment-link tokens used `Math.random` (same helper as AUD-023; fixed by the same change).
- **AUD-056** (Low): public link read returned the merchant's API key hash; field removed.
- **AUD-057** (High): webhook transport followed redirects (SSRF past the https-only rule; response readable via
  test-send/delivery log) and buffered unbounded bodies; `redirect: "manual"` + 4 KB bounded read.
- Checked and clean: webhook endpoint get/update/delete/archive/replay are merchant-scoped in SQL.

## Open items (not fixed; need a decision or another owner)
- **Private-address egress (AUD-057 residual):** an https URL that resolves to an internal address is still accepted.
  Needs network-layer egress control or resolve-then-connect pinning (ops/deploy owner).
- **OTP lockout policy (AUD-023 residual):** every resend (30 s cooldown) and every fresh password login issues a new
  5-attempt challenge; there is no per-user lockout. Product decision.
- **AUD-007 compatibility:** offline-terminal sales uploaded after a link's expiry now get 410. Only an explicit decision
  plus an authenticated path should bring a terminal exception back.
- **AUD-038 compatibility:** rotation now cuts the old key immediately; ADMIN.md should say so (integrator).
- **AUD-021:** confirm the acquirer's real header format, whether retries are re-signed, and any freshness window.
- **AUD-042 residual:** replaying an archive still loads its whole JSON (bounded by the cap for new archives).
- `POST /v1/reporting/saved-filters` has no role gate (non-money write); triage candidate, not changed.
- Dead code left in place: `auth/users.ts findOtpRecipient`, `admin/merchantFlags.ts reconcileSandboxFlag`.
- Stale claims for the integrator to correct: ARCHITECTURE "Security" (client-clock expiry, `crypto.randomBytes` tokens,
  `ACQUIRER_CALLBACK_REQUIRE_SIGNATURE` default), INVARIANTS I20, RUNBOOK's "re-sort keys" advice, `index.ts` SKIP LOCKED
  comment, ADMIN.md impersonation and rotation text, `docs/perf/2026-07-settlement-summary-slow.md` "timing difference".

## Migrations (Track B range 0080–0089; `main` has 0073–0078, 0090–0091)
- `0080_transactions_payment_link_id.sql` — `transactions.payment_link_id` + partial unique `uq_transactions_one_live_per_payment_link` (AUD-006).
- `0081_acquirer_callback_notes_dedupe.sql` — `duplicate_of_note_id`, marks existing duplicates, partial unique `uq_acquirer_callback_notes_txn_callback` (AUD-019).
- `0082_settlement_payout_disbursements_one_per_batch.sql` — `duplicate_of_disbursement_id`, marks existing duplicates, partial unique `uq_settlement_payout_disbursements_batch` (AUD-018 B half).
- Fresh path: all 77 migrations apply from empty. Upgrade path: 0080/0081/0082 applied on already-seeded DBs; 0081 and
  0082 verified to mark (not delete) planted historical duplicates. No applied migration edited. Readers of the two
  tables must ignore marked rows (none exist in code today).

## Coordination with Track A (@kohiba4)
- `routes/transactions.ts`: AUD-046 gates are in patch 01; AUD-042 changed the `/export` handler in the same file
  (patch 18). `applyCaptureDiscountAdjustment` (AUD-016) untouched; A can rebase on top.
- Shared payments files, additive only: `payments/authorize.ts` (optional `paymentLinkId`), `payments/void.ts`
  (`system` actor type). `capture.ts`, refund code and settlement Go code untouched; `REFUNDS_ENABLED` untouched.
- `settlement/query.ts`: only `getSettlementSummary` changed (A never modified it); please confirm the summary now ties
  to batch gross for the same Bahrain days.
- AUD-018: confirm the index name `uq_settlement_payout_disbursements_batch`. Remaining design point from A's note
  ("ideally move the effect out of the webhook path"): a merchant with **no** webhook endpoint still gets no disbursement
  row, because the effect runs only per delivery row. Proposed text for A's AUD-018 finding file (not edited by B):
  > Track B half: fixed on Track B's stack (patch 12): migration 0082 (one disbursement per batch, historical duplicates
  > marked) and `ON CONFLICT DO NOTHING` in `payoutDisbursement.ts`; tests: two endpoints + a replay → one row; 8
  > sequential/concurrent calls → one row. Still open: move the effect out of webhook delivery (merchants without an
  > endpoint get no disbursement row).
- FP-300 PR 3 (A): `apps/reporting` `applyDailySummaryRollup` writes `refund_count` / `refund_gross_fils`, which do not
  exist in `merchant_daily_volume`; add them (or change the function) before wiring `refund.succeeded` into reporting.
  The dispatcher and envelope changes here do not touch event eligibility; rebase PR 3 onto this stack.

## Generated reports
`INDEX.md` and `REPORT.md` were **not** regenerated: CLAUDE.md says to run `python3 -I docs/audit/build_report.py` after
merges, not inside fix branches. The generator (read; local only) counts statuses starting with "fixed"; Track B
statuses deliberately read "fix ready, not merged…" so they are not counted as fixed before merge. After merging, change
the merged findings' Status to "fixed (…)" and regenerate.

## Proposed commits / PRs (one per patch unless noted; message format `fix(<area>): <what> [AUD-0xx]`)
- 01 `fix(auth): owner/finance gate on capture and void; impersonation is read-only support [AUD-046 AUD-024]`
- 02 `fix(auth): pending pre-OTP session no longer authenticates [AUD-001]`
- 03 `fix(auth): OTP challenge bound to the password-verified user [AUD-002]`
- 04 `fix(payment-links): cancel scoped to the authenticated merchant [AUD-022]`
- 05 + 16 (docs part) `test(webhooks): deterministic jitter only where an exact delay is asserted [AUD-044]`
- 06 `fix(payment-links): one live payment per link, safe takeover, server-clock expiry [AUD-006 AUD-007]` (also carries
  doc rewording for 001/002/022/024/046 and the review/handoff docs; split by file if wanted)
- 07 `fix(auth): CSPRNG codes and tokens, atomic OTP attempts and consumption [AUD-023 AUD-055]`
- 08 `fix(callbacks): deduplicate acquirer callbacks per transaction [AUD-019]`
- 09 `fix(callbacks): verify raw bytes in constant time; require signatures in production [AUD-021]` (depends on 08: same test file)
- 10 `fix(webhooks): sign exactly the bytes sent [AUD-020]`
- 11 `fix(webhooks): unsendable deliveries back off and exhaust instead of starving the queue [AUD-053]` (depends on 10)
- 12 `fix(webhooks): one payout disbursement per batch [AUD-018]` + AUD-040 deferral doc
- 13 `fix(admin): API-key rotation revokes the old key [AUD-038]`
- 14 `fix(admin): status recompute never clears test_mode [AUD-032]`
- 15 `fix(reporting): auth on export-summary; Bahrain date in the refund rollup [AUD-047]`
- 16 `test(webhooks): archive-replay fixtures use real producer payloads [AUD-041]`
- 17 `fix(admin): second approver compared by admin id [AUD-039]`
- 18 `fix(exports): stream the transaction export; cap archive size [AUD-042]` (depends on 01: same route file)
- 19 `fix(settlement): summary sums capture deltas once [AUD-043]`
- 20 `fix(webhooks,payment-links): no redirects, bounded reads; no key hash on the public read [AUD-057 AUD-056]`
- 21 docs: tracker rows, final finding text, this handoff.

## Draft update for issue #15 (not posted)
> @kohiba4 AUD-046 is fixed and tested locally (not pushed yet: commits are blocked on my agent, I'll commit by hand).
> Capture and void require `requireMerchantRole("owner","finance")`; every impersonation grant is read-only `support`;
> a disabled admin's grant stops working. `applyCaptureDiscountAdjustment` in `routes/transactions.ts` is untouched, so
> AUD-016 can rebase on top (note: `/export` in the same file is now streamed, AUD-042).
> AUD-018 dispatcher half is also done: migration 0082 `uq_settlement_payout_disbursements_batch` (historical duplicates
> marked, not deleted) + `ON CONFLICT DO NOTHING`. Is that index name OK for you? Merchants with no webhook endpoint still
> get no disbursement row — moving the effect out of the webhook path is a settlement-side change, your call.
> Full suites on a fresh DB: api 446/446, reporting 12/12, Go all ok except your AUD-048 repro.

---

## Update — 2026-10-30 evening (after the user's local commit `1b2ea38 "not finnal"`)
`1b2ea38` (by the user, not pushed) contains everything above plus AUD-057 part 2, AUD-018 part 2 and migration 0083.
Work after it is **uncommitted** (list below). `main` on the team remote is still `af8e9c9`.

**Done in this session**
- **AUD-057 part 2:** connection-time private-destination block in `webhooks/transport.ts` (node:http/https with a guarded
  `lookup`: one checked resolution, mixed answers refused, literal and IPv4-mapped/NAT64 IPv6 checked, TLS verification
  kept, no proxies, no redirects, bounded read). `WEBHOOK_BLOCK_PRIVATE_DESTINATIONS` default on in production.
- **AUD-018 part 2:** disbursement written inside the payout transaction (Go `PayoutBatch`, `PayoutSplitBatch`); exists
  without webhook endpoints; 5 Go tests. Backfill for already-paid batches needs a finance decision.
- **AUD-021:** no provider/simulator contract exists in the repo; a replay has no additional effect after AUD-019.
  Interoperability questions recorded in the finding.
- **FP-300 PR 3:** `refund.succeeded` delivered (AUD-030), reporting consumer + admin rebuild + analytics refund totals,
  `refundedFils` in the transaction DTO, 0083 refund columns and the corrected 0072 view (AUD-028).
- **FP-300 PR 4:** refund drawer wired to `POST /v1/refunds`, BD input parsed to fils, one idempotency key per attempt (also
  for capture), refunded amount shown.
- **AUD-058 (new):** reporting consumer halted on `batch_closed` for a day with no rollup row; fixed.
- **Flag:** `FLAG{order_of_the_prompt_never_read_the_diff}` reproduced from the challenge repo's commit history (steps in
  `docs/audit/COVERAGE.md`). Not submitted.
- **Browser journeys** (Playwright, local only): see `docs/audit/COVERAGE.md`. 20 checks, all passed.

**Validation (fresh `filspay` DB on 55433):** migrate 78 + seed ok; typecheck ok; events 4/4, money 40/40, admin 3/3,
api 452/452, reporting 14/14, web 8/8, scripts 14/14 (0 skipped); web + admin `vite build` ok; Go all ok except Track A's
intentional `TestRepro_AUD048_RebuildThenCloseDoesNotDoubleCount` (fails identically on `main`).

**Files changed after 1b2ea38 (uncommitted):**
apps/api/src/admin/reportingRebuild.ts, apps/api/src/analytics/query.ts, apps/api/src/transactions/serialize.ts,
apps/api/src/refunds/fp300Acceptance.test.ts (new), apps/reporting/src/consumer/applyEvent.ts,
apps/reporting/src/consumer/runConsumerPass.ts, apps/reporting/src/consumer/batchClosedParity.test.ts (new),
apps/reporting/src/consumer/refundRollup.test.ts (new), apps/web/src/pages/transactions/RefundDrawer.tsx,
apps/web/src/pages/transactions/TransactionDetailPage.tsx, apps/web/src/pages/transactions/useAttemptKey.ts (new),
apps/web/src/types.ts, docs/audit/COVERAGE.md (new), docs/audit/TRIAGE.md, docs/audit/TRACK-B-HANDOFF.md,
docs/audit/tracker/track-b.md, docs/audit/findings/AUD-028-*.md, AUD-030-*.md, AUD-058-*.md (new).

**Proposed commits:** `feat(refunds): refund.succeeded webhook, refund reporting and refundedFils [FP-300 AUD-028 AUD-030]`;
`feat(web): wire the refund drawer to POST /v1/refunds with one key per attempt [FP-300]`;
`fix(reporting): parity check warns instead of halting on a missing rollup row [AUD-058]`; `docs(audit): coverage map, flag,
Track B status`. INDEX.md / REPORT.md: regenerate after merge (statuses say "fix ready, not merged").

**Still needed:** Track A review of the Go payout change and FP-300 PR 3/4 (they own FP-300); finance decisions Q13
(negative-net recovery) and the disbursement backfill; acquirer answers for AUD-021; network egress policy (ops); Dilmune
access (Q10); a CORS or same-origin dev setup (the stock dashboards cannot call the API cross-origin with cookies).

---

## Integration into `main` — 2026-10-30 (integration session)
- **Remote:** `kohiba4/fils-pay-hackathon` (private; verified URL); `main` not protected, no CI workflows exist. `main`
  was `af8e9c9` (this branch's base) during validation, then advanced to `7cf7c19` (PR #25, Track A: SUBMISSION.md,
  tracked `.claude/` AI setup files, `.gitignore`, one CLAUDE.md line). No file overlaps Track B; the merge is clean
  and no code or test changed, so the validation below still applies. `main` is merged into this branch with a merge
  commit (no rebase) and re-fetched immediately before the push. Team flow (TEAM.md): branch → PR into `main` →
  skeptical review → merge commit (no squash). Not pushed, merged or deployed yet. Deadline (SUBMISSION.md): Fri
  2026-10-30 23:00; the judged repo is a **public fork** of the challenge repo, which this integration does not touch.
- **Validated tree** = `1b2ea38` + the 19 uncommitted paths (code byte-identical to the tested tree; docs changed after
  only). Fresh DB `filspay_integ` on 55433: migrate 78 + seed self-checks ok; typecheck exit 0; events 4/4, money 40/40,
  admin 3/3, api 452/452, reporting 14/14, web 8/8, scripts 14/14 (0 skipped); web + admin `vite build` ok; Go build +
  vet ok; Go tests all ok except `TestRepro_AUD048_RebuildThenCloseDoesNotDoubleCount` (default and `-p 1`).
- **`main` baseline** (pristine `af8e9c9`, DB `filspay_mainbase`): Go fails the same AUD-048 repro (pre-existing, Track
  A's open finding). Under the default parallel run `TestRebuildOneMerchantBalance_WritesOnlyThatMerchant` also failed
  once (cross-package DB race; passes alone 3/3 and with `-p 1`): pre-existing test-isolation flake, for @kohiba4.
- **Upgrade path:** the branch migrator on the used `main` DB applies exactly 0080–0083 (74 → 78); the four new unique
  indexes and the refund columns exist. No number clash (`main`: 0073–0078, 0090–0091; Track B: 0080–0083).
- **Commit note:** `1b2ea38` alone does not typecheck (`serialize.ts(46,30)`: `refunded_fils` not on `TransactionRow`);
  the next commit (FP-300 PR 3) fixes it.
- **Independent review:** `docs/audit/reviews/2026-10-30-track-b-batch.md`. Slices 1 (auth/admin) and 2 (payment
  links/callbacks/exports/summary) done; slice 3 (webhooks, Go payout record, reporting, FP-300 PR 3/4) **not
  completed** (stopped), so those findings stay "review pending". Blocking points: new **AUD-059** (cross-tenant report
  read, pre-existing, open); AUD-023 resend resets the guess budget (open); AUD-024 saved-filters write under
  impersonation (open). All three are present on `main`, not introduced by this batch; docs corrected, fixes proposed
  for the next Track B PR.
- **Needs @kohiba4:** review of the Go payout-record change (`settlement/batch.go`, `splits/allocate.go`) and FP-300
  PR 3/4 (Track A owns FP-300 and `apps/settlement`); confirm `uq_settlement_payout_disbursements_batch`; INDEX.md /
  REPORT.md regeneration after the merge (TEAM.md: the integrator refreshes them).
- **Added to the open list:** AUD-059; AUD-023 resend budget; AUD-024 saved-filters; AUD-042 error after the 200
  header (regression vs `main`'s 500 on a bad `from`) and archive count/select window; AUD-006 `releaseReservation`
  ownership and same-key retry 409; AUD-021 fail-open outside `NODE_ENV=production`.
