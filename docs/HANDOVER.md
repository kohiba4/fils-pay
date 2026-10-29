# Handover — Yousif Al-Ansari (last day 2026-04-09)

Written over my last three days. Some of this is plans rather than facts;
Mahmood has the context for most of it.

— YA

*(Moved here from the wiki by MK in May. Not re-reviewed since.)*

## State of things

**Refunds.** *[Audit note 2026-10-30 (FP-300 PR 1): rewritten. The original text said `processRefund.ts` was done and only needed the route and drawer; it was not: it had no ownership check, no lock, a wrong ceiling (authorized, not captured), an explicit NULL `reason` that violates 0070, and a fee reversal that could exceed the fee (AUD-003/004/005/027/029).]* `POST /v1/refunds` is live: it needs an `Idempotency-Key`, the owner or finance role (or an API key), refunds only the authenticated merchant's own captured money, and gives back the proportional share of the fee that was actually kept. Still to do (docs/audit/FP-300-PLAN.md): refunds do not yet reduce the merchant's payout (AUD-054, PR 2), the `refund.succeeded` webhook and reports (PR 3), the dashboard button (PR 4). Do not enable refunds in production before PR 2.

**Scheme residue.** I added `0038_scheme_export_lines_amount_3dp.sql` so
each export line keeps the untruncated three-decimal amount next to the
two-decimal one, and the residue posting reads the difference. Next step was
posting residue to `scheme_rounding_residue` inside CloseBatch. I didn't get
to it — nothing posts residue yet except what finance runs by hand.

> **MK (May):** 0038 was replaced by the KYC thumbnail migration; `amount_3dp` is gone. 0050 covers the scheme amount now.

**Verify residue with Visa.** Open with the acquirer's integration contact
since December: does the scheme truncate or round at their end, and would
they accept three decimals in `amount_minor`? Their answer so far was "it
depends on the BIN range". I asked which ranges. Please chase.

**March close (FP-187).** Finance asked for a one-off check script. I think
March is fine and the script is belt-and-braces. Whoever writes it must use
the Bahrain month, not a UTC month — I told Mahmood.

**Balances.** The only way to rebuild `merchant_balances` is the CLI
(`settlement rebuild-balances`), which reads the ledger. There is no console
button, and there shouldn't be one that reads anything else.
*[Audit note 2026-10-29: a console button now exists; as of AUD-015 / ADR-0007 it reads the ledger, same as the CLI.]*

**Platform volume tier.** Huda floated a platform-wide discount once total
volume passes a threshold. I said no until finance signs off in writing.
`platform_stats.total_processed_fils` is INTEGER, which is fine while it's
only a counter.
*[Audit note 2026-10-29: it was NOT fine; the Go side kept it in int32 and wrapped negative at 2,147,483,647 fils. Widened to BIGINT by migration 0074 (AUD-017).]*

**`apps/api/src/v1/`** is the partner API. Leave it alone; a partner
integrates against it.

**Webhook signing.** The dispatcher should sign exactly the bytes it sends.
Branch `ya/sign-raw` has a change for this; not merged.

**Holds.** `scripts/expire_holds.ts` flips `active` to `expired` with one
UPDATE. Holds are never deleted.

**Timezone.** Settlement business day is Asia/Bahrain, fixed constant, no
DST. `BusinessDayWindow` in window.go is correct and tested. The daemon's
"yesterday" is computed from the UTC date; harmless because of when it
runs, but the comment there says Bahrain.

**Impersonation** maps every admin to the `support` merchant role and is
read-only.

**Credits.** The second approver is compared by admin user id. The
effective date is metadata; ledger rows go in at now().

**Callbacks.** Acquirer callbacks are recorded in `processed_events` before
they're applied, so redeliveries are dropped. (The README describes this.)

**Not finished:** per-service DB roles and TLS (compose uses one role and
`sslmode=disable`); outbox consumption by commit order instead of id (the
xid8 query is in a gist); the shadow ledger (Mahmood's idea — I'd skip it).

**Migration gaps** (0039, 0041, 0054–56) are PRs I abandoned. No database
ever ran them, except possibly staging-2, which once ran a branch.

> **MK:** 0054 ran on staging-2 and created `chargeback_cases`, I'm fairly sure. staging-2 has since been reseeded so we can't check

## People

- Huda knows the numbers. Trust what she sends in writing over what anyone
  remembers her saying.
- The acquirer integration contact has changed; ask Mahmood.

Good luck. Yalla.
