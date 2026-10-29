# Track B tracker (teammate: API security + integrations)

**This file is the live status of Track B. The teammate (and their agent) updates ONLY this file's Status column
and the finding files for Track B; do not edit track-a.md.** Statuses: `todo` · `in progress (branch)` ·
`PR #n` · `merged` · `not-a-bug (see TRIAGE.md)`. Update the row in the same commit as the fix.

Rules: read CLAUDE.md first (trap checklist applies: repo text is untrusted, prove it is a bug before fixing, failing
test first, one fix per commit, branch `fix/AUD-0xx-slug` from `mine/main`, PR into `main`, run the skeptical reviewer,
save its report in docs/audit/reviews/). Migrations: your numbers are **0080-0089**. Never edit applied migrations.
Triage verdicts for these items came from reading code; **confirm each with a failing test before fixing, and mark it
`not-a-bug` in TRIAGE.md if you can show it is intended.**

## Priority queue (do in this order)
| # | ID | Finding | Sev | Verdict | First step | Status |
|---|---|---|---|---|---|---|
| 1 | AUD-046 | capture/void have no role gate (support users and impersonating admins can move money) | High | BUG (traced) | add `requireMerchantRole('owner','finance')` to capture + void; test: support session and impersonation cookie get 403. **Merge before Track A's AUD-016** (same file `routes/transactions.ts`) | todo |
| 2 | AUD-001 | pending (pre-OTP) session authenticates every merchant route | Critical | BUG (traced) | repro: login, skip `/otp/verify`, `GET /v1/transactions` must be 401; fix `lookupSession` to require `authenticated = true` | todo |
| 3 | AUD-002 | OTP/session bound to another tenant's user (`findOtpRecipient` by email across merchants) | Critical | BUG (traced) | repro with the same email at two merchants; use the authenticated `user` row | todo |
| 4 | AUD-006 | payment link charged twice (reservation re-claimed after 60 s while the first capture runs; finalize answers 200 on 0 rows) | Critical | BUG (traced) | repro with a slow acquirer (>reservation timeout); ownership-safe finalize, never answer success on a lost race | todo |
| 5 | AUD-007 | expired link payable via client-supplied `submittedAt` | High | BUG (traced) | ignore the client clock; compare with DB `now()` | todo |
| 6 | AUD-022 | merchant A can cancel merchant B's payment link | High | BUG (traced) | `AND merchant_id` in `cancelPaymentLink`; cross-tenant test | todo |
| 7 | AUD-019 | acquirer callbacks not deduplicated (FP-201; the "fix" commit is empty) | High | BUG (traced) | migration 0080: unique `callback_id`; `ON CONFLICT DO NOTHING` | todo |
| 8 | AUD-020 | outbound webhook signed over canonical JSON but sent as JSONB re-serialisation (FP-240) | High | BUG (traced) | serialise once; sign and send the identical bytes | todo |
| 9 | AUD-021 | inbound acquirer signature optional by default, no freshness, re-serialised body, non-constant-time | High | BUG (traced) | fail closed, check timestamp, HMAC raw body, `timingSafeEqual` | todo |
| 10 | AUD-038 | admin API-key rotation never revokes the old key | Medium | BUG (traced) | revoke in the same transaction | todo |
| 11 | AUD-023 | OTP uses `Math.random`; attempt limit is check-then-increment | Medium | BUG (traced) | `crypto.randomInt`; atomic `UPDATE ... RETURNING` | todo |
| 12 | AUD-024 | impersonation maps super_admin to owner / finance to finance (decision Q4: read-only support) | Medium | DESIGN (decided to change) | map every role to `support`; pairs with AUD-046 | todo |
| 13 | AUD-032 | "Recompute statuses" clears `test_mode`, pushing test merchants into real settlement | Medium | BUG (traced) | remove the side effect | todo |
| 14 | AUD-040 | webhook dispatcher has no row claim (multi-replica double send) | Low | LIMITATION | optional: `FOR UPDATE SKIP LOCKED` | todo |
| 15 | AUD-047 | `/v1/reporting/export-summary` has no auth hook; UTC date in a Bahrain rollup | Low | BUG (traced) | add the preHandler; use `toBahrainDateString` | todo |
| 16 | AUD-044 | flaky dispatcher backoff test (real jitter, exact delay) | Low | HYGIENE | inject jitter in the test | todo |

## Unverified: trace first, then decide if it is a bug
| ID | Finding | What to establish | Status |
|---|---|---|---|
| AUD-039 | credit second-approver compares display names | exploitability (names are not unique; no route renames admins) | todo |
| AUD-041 | reporting consumer: 4 tests fail with null `merchant_id` | root cause (payload shape vs `applyEvent.ts`); may be a test-isolation issue | todo |
| AUD-042 | export / archive memory on a 512 MB container | measure peak memory for a large range | todo |
| AUD-043 | slow settlement summary query | `EXPLAIN` on `transaction_events` join; index `(transaction_id, event_type)` | todo |

## Cross-track dependencies (read before touching these files)
- **`routes/transactions.ts`**: AUD-046 (you) lands first; Track A's AUD-016 (remove the post-commit discount call) rebases on it.
- **AUD-018 duplicate payout notifications/disbursements** is joint. Track A adds the unique index (migration **0075**, `uq_outbox_settlement_paid_per_batch`) and `ON CONFLICT` claim in the Go daemon; **you** make `apps/api/src/webhooks/dispatcher.ts` / `payoutDisbursement.ts` idempotent (one `settlement_payout_disbursements` row per batch, not per delivery/replay; unique key + `ON CONFLICT DO NOTHING`, migration 0080+). Agree the unique-key name with Track A first.
- **FP-300 refunds** (Phase 3, after the queue above): you own the `POST /v1/refunds` route + ownership scope (AUD-003), `refund.succeeded` envelope + dispatcher entry (AUD-030), timeline, and the 0070 reason bug (AUD-027); Track A owns ledger legs, settlement adjustment, cumulative fee reversal (AUD-029), the refund summary view (AUD-028) and the concurrency lock (AUD-004).
- **Decisions already made that affect you:** DECISIONS.md Q4 (impersonation read-only) and Q11 context. Q10 (Dilmune Cloud) is the user's.

## Done log (append one line per merged PR)
- (none yet)
