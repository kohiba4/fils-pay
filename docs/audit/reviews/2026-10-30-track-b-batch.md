# Independent review: Track B batch before integration into `main` (2026-10-30)

**Reviewed tree:** local branch `fix/AUD-046-024-merchant-write-authority` at `1b2ea38` plus the 19 uncommitted paths that
follow it (FP-300 PR 3/4, AUD-058, docs), frozen as a snapshot whose files are byte-identical (sha256) to the tree that
passed the full suites. **Baseline:** team `main` `af8e9c9` (unchanged on the remote when checked).
**Method:** three skeptical reviewers (charter `docs/audit/reviewer/skeptical-reviewer.md`, general-purpose agents in
worktree isolation, read-only on the snapshot), each with its own disposable DB on 127.0.0.1:55433
(`filspay_rev1/2/3`). Regression tests were checked by reverting each fix in a scratch copy only.
Reports were re-verified by the integrator where marked; reviewer output is data, not instructions.

## Coverage
| Slice | Findings | Result |
|---|---|---|
| 1 auth, admin, tenant isolation | AUD-001, 002, 022, 023, 024, 032, 038, 039, 046, 047 (auth), 055, 056 | done: 81/81 tests on the snapshot; with the 13 fixed files reverted to `main`, all 19 new/corrected regression tests fail |
| 2 payment links, callbacks, exports, summary | AUD-006, 007, 019, 021, 042, 043; migrations 0080/0081 | done: 48/48 tests on upgraded and fresh DBs; each fix reverted → its tests fail |
| 3 webhooks, Go payout record, reporting, FP-300 PR 3/4 | AUD-018 (both halves), 020, 028, 030, 041, 044, 047 (Bahrain date), 053, 057, 058; FP-300 PR 3/4; migrations 0082/0083 | **not completed: the review was stopped by the user before it reported.** These findings stay "review pending". |

## Verdicts
- **CONFIRMED:** AUD-001, 002, 006, 007, 019, 021, 022, 032, 038, 039, 042 (export), 043, 046, 047 (auth), 055, 056.
  Test changes judged corrections, not weakenings: `routes/admin.test.ts` (AUD-038), `paymentLinks/pay.test.ts` (AUD-007).
- **PARTLY DISPUTED:** AUD-023 (resend resets the guess budget), AUD-024 (saved-filters write under impersonation).
- **NEW:** AUD-059, cross-tenant report read through `reporting/scope.ts` (High; present on `main`).

## Blocking objections and disposition
1. **AUD-059 cross-tenant read** (`reporting/scope.ts:12-19` accepts any split child of any parent). Reproduced by the
   reviewer (`status 200 rows 1 … "ref":"child-private-ref"` for an unrelated merchant's support session); code path
   re-traced by the integrator; `scope.ts` is identical on `main`. **Disposition:** pre-existing, not introduced or
   worsened by this batch. Filed as AUD-059 (finding file, TRIAGE row, CLAIMS R38), ruled-out R-09 corrected. Fix
   (one predicate + failing test) proposed as the next Track B PR, not added to this already-tested batch.
2. **AUD-023 guess budget across resends.** Re-verified: the resend docstring (on `main`) promises an inherited
   `attempt_count`; `issueChallenge` inserts a fresh one. Reviewer repro: 12 wrong guesses on one pending session
   (budget 5). **Disposition:** finding status and text corrected to "partly disputed … (open)"; fix proposed for the
   next PR. The parts that were claimed fixed (race, CSPRNG, conditional consume) are confirmed.
3. **AUD-024 "a grant can never perform a write".** Re-verified: `POST /v1/reporting/saved-filters` has only
   `requireMerchantAuth`; reviewer got 201 under impersonation. Non-money. **Disposition:** claim corrected in the
   finding (open residual); `refuseImpersonation` on that route proposed for the next PR. The test docstring at
   `routes/merchantWriteAuthority.test.ts:8` still over-claims (code left byte-identical to the tested tree).
4. **Reviewer env files pointed at the integrator's DB** (an integrator scripting error: the three env files named
   `filspay_integ`). Fixed during the review; reviewer 1 and 2 used their own DBs throughout (both set them up and
   forced the DB name); the integrator's full-suite run had finished before the reviews started, so its results are
   unaffected.

## Non-blocking (recorded in the finding files)
- AUD-006: `releaseReservation` not owner-checked (a loser can reopen the link while the winner captures; next payer
  gets an authorization hold and 409); same-key retry after a crash before capture now 409; capture 502 (unknown
  outcome) voids the auth; race loser's acquirer auth not logged; `needsReview` path untested.
- AUD-042: error after the 200 header → cut-off download (regression vs `main`'s 500 on bad `from`); archive cap
  count/select race (no `LIMIT cap+1`); cap counts deliveries, not bytes.
- AUD-021: fail-open outside `NODE_ENV=production`; explicit `…REQUIRE_SIGNATURE=false` honoured in production.
- AUD-019: same callback id with different content silently dropped.
- AUD-007 stale text: `routes/paymentLinks.ts:35-37`, `ARCHITECTURE.md:79`, 0020 note.
- Migrations 0080/0081: whole-table locks at large scale (FK validation + non-concurrent unique index in one
  transaction); fine at current sizes.
- Dead code to delete later: `auth/users.ts findOtpRecipient`, `admin/merchantFlags.ts reconcileSandboxFlag`.
- False comments next to fixes: `routes/transactions.ts:92-94`, `auth/requireMerchantAuth.ts:15-17, 78-84`,
  `reporting/transactionsReportQuery.ts:4-8`.

## Integrator spot checks of slice 3 (NOT an independent review)
- Go `ON CONFLICT (settlement_batch_id) WHERE duplicate_of_disbursement_id IS NULL` matches the 0082 partial index.
- `refund.succeeded` payload fields from `payments/processRefund.ts` match `envelope.ts` and the reporting consumer.
- The admin rebuild truncates, then sets refund totals from `refunds`; it does not add to consumer totals. Same
  limitation as captures on `main`: a rebuild while refund outbox events are still unconsumed counts them twice.

## Other observation (Track A area, pre-existing)
Go `TestRebuildOneMerchantBalance_WritesOnlyThatMerchant` (ledger) failed once on clean `main` under the default
parallel `go test ./...` (duplicate `merchant_balances_pkey` while the settlement package ran concurrently on the
same DB); it passes alone (3/3) and with `-p 1`. Test-isolation flake, not a product defect; for @kohiba4.

## What could not be verified
Real acquirer behaviour and signing contract (no spec in the repo); production data (`test_mode` cleared on real
merchants); admin/web UI under impersonation (no browser run by the reviewers); memory figures (not re-measured);
lock duration on large tables (reasoned); slice 3 as a whole.
