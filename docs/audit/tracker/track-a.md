# Track A tracker (money, settlement, data)

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
| 9 | AUD-018 | duplicate payout notifications/disbursements | todo (needs Track B for the dispatcher half) |
| 10 | AUD-016 | one fee formula at capture | todo (after Track B's AUD-046 merges) |
| 11 | AUD-017 | volume counter int32 to BIGINT | todo |
| 12 | AUD-048 | cache vs ledger definition (rebuild then close double counts) | todo (decision needed on the definition) |
| 13 | AUD-025, 031, 034, 013, 033, 036, 037, 045, 049 | remaining Track A items | todo |
| - | open question | adjustments (MDR recalc on paid batches, credits, imports) never reach a payout instruction | needs a finance decision |
