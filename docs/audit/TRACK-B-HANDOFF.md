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
