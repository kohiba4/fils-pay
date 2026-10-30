# Track A tracker (owner: @kohiba4; money, settlement, data)

Owner: the user + their agent. Updated with each fix; Track B does not edit this file. Statuses: `todo` · `in progress (branch)` ·
`PR #n` · `merged`. Migrations 0073-0079. Fix order approved 2026-10-29.

| # | ID | Finding | Status |
|---|---|---|---|
| 1 | AUD-026 | broken migrations 0054/0055 | merged |
| 2 | AUD-008 | float32 net payout | merged |
| 3 | AUD-011 | `expire_holds` deletes all holds | merged |
| 4 | AUD-012 | CSV import 2-decimal parsing (+ dead `parsePromotionalDiscountFils`) | merged (data repair + AUD-036 duplicate-submit guard still open) |
| 5 | AUD-015 | rebuild button reads scheme export | merged (PR #1) |
| 6 | AUD-010 | scheme file amount rounded up | merged (PR #2) |
| 7 | AUD-009 | split payout allocation | merged (PR #3) |
| 8 | AUD-014 | MDR recalculation rewrites paid batches | merged (PR #4; migration 0073; finance gap: adjustments never reach a payout) |
| 9 | AUD-018 | duplicate payout notifications/disbursements | Track A half merged (PR #10, migration 0075); dispatcher half waits for @The-Tifo (issue #15) |
| 10 | AUD-016 | one fee formula at capture | todo (after Track B's AUD-046 merges) |
| 11 | AUD-017 | volume counter int32 to BIGINT | merged (PR #7, migration 0074) |
| 12 | AUD-048 | cache vs ledger definition (rebuild then close double counts) | todo (needs a decision on the definition: you + finance) |
| 13 | AUD-025 | daily close at Bahrain midnight | merged (PR #9) |
| 14 | AUD-031 | admin fee display | merged (PR #8) |
| 15 | AUD-034 | ledger append-only | merged (PR #11, migration 0076) |
| 16 | AUD-013 | March sweep dry-run + idempotent | merged (PR #12); accounting still needs finance sign-off before anyone applies it |
| 17 | AUD-052 | fee tests independent of the volume counter | merged (PR #13) |
| 18 | AUD-037 | ADMIN.md corrections (docs only) | PR #17 |
| 19 | AUD-051 | admin default run date is the Bahrain day | merged (PR #18) |
| 20 | AUD-049 | `rebuild-balances --merchant` writes the cache | merged (PR #19) |
| 21 | AUD-036 | CSV import duplicate guard (migration 0077, Q12) | merged (PR #20) |
| 22 | AUD-033 | payout estimate integer BIGINT (migration 0078) | merged (PR #21) |
| 24 | FP-300 refunds | plan in [FP-300-PLAN.md](../FP-300-PLAN.md): PR1 route+core (AUD-003/004/005/027/029, migration 0090), PR2 settlement (AUD-054), PR3 webhook/reporting (AUD-028/030), PR4 web | PR1 merged (PR #23); PR2 settlement merged (migration 0091, AUD-054 partially fixed: refunds reduce payouts; `REFUNDS_ENABLED` stays OFF until finance decides Q13 = recovery of a negative net); NEXT: PR3 webhook/reporting/view, PR4 web; new finding AUD-053 (dispatcher starvation) handed to Track B |
| 23 | AUD-045, 050 | remaining small Track A items (050 waits for a finance decision) | todo |
| - | open question | adjustments (MDR recalc on paid batches, credits, imports) never reach a payout instruction | needs a finance decision |
| 25 | Q16 TOTP second factor, AUD-060 | authenticator-app login for merchant + admin, cookie lifetime fix, migration 0092 | in review (branch `feat/totp`) |
