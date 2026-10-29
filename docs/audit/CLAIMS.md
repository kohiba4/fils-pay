# Claims ledger

Verified = checked against executing code (trace), runtime (repro), or not yet.
Result: **true / false / partially true / can't tell (yet)**.

## From the brief (images)

| # | Claim | Source | Verified? | Result |
|---|---|---|---|---|
| C1 | Checkout sends something the server shouldn't trust (FP-187) | Item 03 | trace | **true** — `submittedAt` drives expiry (AUD-007) |
| C2 | Duplicate callback notes; 1.9.0 fix didn't work (FP-201) | Item 03 | trace + git | **true** — no dedupe exists; fix commit bf66bf2 is empty (AUD-019) |
| C3 | Admin rebuild and CLI read from different places (FP-203) | Item 03/02 | **runtime (seed)** | **true, reproduced** — Alpha ledger 136.5M vs scheme view 7.3M fils (AUD-015) |
| C4 | Concurrent refunds double money out; payments safe (FP-209) | Item 03 | trace | **true (latent)** — no lock in processRefund; capture locks (AUD-004, R-04) |
| C5 | Webhook signer and sender disagree (FP-240) | Item 03 | trace | **true** (AUD-020) |
| C6 | Inbound signature check has problems | Item 03 | trace | **true** (AUD-021) |
| C7 | Slow payment let a second buyer pay the same link (05-14) | Item 03 | trace | **true** (AUD-006) |
| C8 | "this IS reachable" comment | Item 03 | read | **true** — pay.ts:150, and it is reachable |
| C9 | Duplicate payout notifications from two processes (08-21) | Item 03 | trace | **true** (AUD-018) |
| C10 | Scheme total always higher than ours | Item 02 | trace + export data | **true** — our own half-up rounding, not Visa (AUD-010) |
| C11 | "Something is rounding, can't find where" | Item 02 | trace | **true** — NUMERIC(10,2) assignment of untruncated gross |
| C12 | March sweep ran twice on staging; gap doubled | Item 02 | trace | **consistent** — script not idempotent (AUD-013) |
| C13 | March log has one timestamp → ran once in prod | Item 02 | — | **can't tell**; log not in repo; a log can't prove single execution. Meeting 07-08 "dry run" suggests a second real run |
| C14 | Splits: 3 children don't sum to parent, few tens of fils every batch | Item 02 | trace + numeric | **partially true** (AUD-009): ±1 fil per batch with the seed weights (both under- and over-allocation). "Tens of fils" is not explained by this code; open |
| C15 | "Settlement team says MDR recalc only touches open batches" | Item 02 | trace | **false** — it touches only closed+paid (AUD-014) |
| C16 | Dashboard 245 bps vs charged 225 bps; two fee tables, backfill | Item 02 | seed data | **true, reproduced** (AUD-031): Alpha rows 245/eff 03-01/created 08-15 and 225/eff 08-01 |
| C17 | CSV 4.75 → 0.475 | Item 02 | trace | **true** (AUD-012) |
| C18 | CSV 4.755 → 4.750 | Item 02 | trace | **partially true** — code gives 0.475 for 4.755; the 3rd decimal is lost as claimed, but the shown value doesn't match. Repro pending |
| C19 | Daily close at 3am local | chat | trace | **true** (AUD-025) |
| C20 | Lifetime payout estimate drifts | chat | trace | **true**, monitoring only (AUD-033) |
| C21 | Test merchants in real settlement | chat | trace | **true** via admin recompute (AUD-032) |
| C22 | Login works without OTP | chat | trace | **true** (AUD-001) |
| C23 | Merchant A cancelled B's link | chat | trace | **true** (AUD-022) |
| C24 | Refund more than charged | list | trace | **true** (AUD-005) |
| C25 | Admin actions with wrong role checks | list | trace | **true** — impersonation write mapping (AUD-024) and, on the merchant side, capture/void have no role gate (AUD-046); credits/replay any-role look intended per ADMIN.md |
| C26 | Key rotation doesn't do what you'd expect | list | trace | **true** (AUD-038) |
| C27 | Reporting query suspiciously slow | list | — | **can't tell yet** (AUD-043) |
| C28 | OTP implementation changed; still safe? | list | trace + git | **unsafe** (Math.random, racy limit; AUD-023). Git shows one OTP commit only — the "change" is not in visible history |
| C29 | Very large export upload | list | — | **can't tell yet** (AUD-042) |
| C30 | Yousif ran the CLI rebuild ("last Thursday", Sept) | Item 02 | docs | **conflict** — HANDOVER: last day 2026-04-09; git shows a spoofed Sept commit under his name (S-07) |
| C31 | Item 02 is from "Fatima H. (Finance)" | Item 02 | docs | **conflict** — ONBOARDING lists Fatima as Tests/QA |

## From repo docs, comments, commits

| # | Claim | Source | Verified? | Result |
|---|---|---|---|---|
| R1 | Money is BIGINT fils everywhere | ADR-0001, ARCH | schema | **partially true** — 0040 REAL, 0049 INTEGER, 0050 NUMERIC(10,2) |
| R2 | Money is cents (1 BD = 100) | CLAUDE.md/AGENTS.md/.cursorrules | ADR + code | **false** (S-01..03) |
| R3 | Residue journaled in CloseBatch (implemented 2026-03) | ADR-0002 | trace | **false** — no residue code in CloseBatch |
| R4 | Monthly UTC windows "net out" | ADR-0003 | reasoning | **false** in general (YA's objection stands); affects AUD-013 |
| R5 | Button rebuild = CLI rebuild ("same thing") | ADMIN, RUNBOOK, Slack MK, internalapi comment | trace + runtime | **was false; true since the AUD-015 fix (ADR-0007)**. Both are still unsafe intraday (AUD-048) |
| R6 | Callbacks deduped on callbackId via processed_events | CHANGELOG 1.6.0/1.9.0, postmortem, HANDOVER, 0051 note | trace | **false** |
| R7 | FP-202 unique "one capture per link" — Done | postmortem | schema | **false** — no such column/constraint |
| R8 | FP-208 settlement advisory lock — Done | postmortem | grep | **false** — no `SETTLEMENT_SINGLETON_LOCK` in code |
| R9 | Postmortem root cause = duplicate callbacks | postmortem | trace + its own appendix | **false** (AUD-006) |
| R10 | Payment-link tokens 128-bit crypto | 0020, ARCH | read | **true** (lib/crypto randomToken) |
| R11 | Impersonation is read-only `support` | 0035, ARCH, HANDOVER | trace | **false** (AUD-024) |
| R12 | Daemon closes shortly after Bahrain midnight | ARCH, meeting 06-02 | trace | **false** (AUD-025) |
| R13 | Nightly 02:00 balance refresh | ARCH, ADMIN | grep | **can't tell** — not found in scheduler; to confirm |
| R14 | `expire_holds` only flips to expired / never deletes | HANDOVER, authorize.ts | trace | **false** — deletes (AUD-011) |
| R15 | Re-running March script is a no-op / safe | RUNBOOK, meeting 07-08 | trace | **false** (AUD-013) |
| R16 | CSV export streams, safe on 512 MB | CHANGELOG 1.8.0 | — | **can't tell yet** (AGENTS.md says the opposite) |
| R17 | `refunds_enabled` NULL = disabled | 0052 "— y" note | trace | **false** — code treats NULL as enabled |
| R18 | Discount applied at capture for both paths ("moved into capture.ts in July") | pay.ts MK comment, CHANGELOG 1.3.1 | trace | **false** (AUD-016) |
| R19 | `merchants.mdr_bps` kept in sync by "0046 trigger" | settlement/query.ts | schema | **false** — 0046 is splits; no trigger |
| R20 | Admin rotation has 24h grace | 0037 AM note, ADMIN | trace | **false** — old key never revoked (AUD-038) |
| R21 | Dev doesn't need WEBHOOK_SECRET_ENCRYPTION_KEY | compose comment | runtime | **false** — fallback key is 34 bytes (AUD-035) |
| R22 | Dockerfiles exist in ops/ | compose, ops/README | ls | **false** |
| R23 | `.env.docker` is gitignored | .env.docker comment | git | **false** (S-08) |
| R24 | Volume tier approved by finance | platformVolumeTier.ts | comments | **unverified** — MK: "Huda didn't know" |
| R25 | Seed "only truncates its own tables", safe on shared DB | compose, RUNBOOK | — | can't tell yet; AM: "staging-2 got reset this way" |
| R26 | Tests are the tie-breaker / regression-locked | ONBOARDING, AGENTS | evidence | **false as a rule** — several tests lock in buggy behaviour (window_utc_compat_test.go, adjustment import "475") |
| R27 | Split feature unused in prod ("no merchant has children") | allocate.go YA note | seed/brief | **false** — Delta Marketplace is a split parent |
| R28 | Ledger is immutable via the balance trigger | 0007 | reasoning | **suspected false** (AUD-034) |
| R29 | 08-21 root cause = reporting worker replaying NOTIFYs | ADMIN.md review | trace | **false** — different outbox ids → two inserts (AUD-018) |
| R30 | Summary vs batch 38% gap is "timing" | perf doc (AI answer) | — | can't tell yet (AUD-043) |

## Added during decision research (2026-10-29)

| # | Claim | Source | Verified? | Result |
|---|---|---|---|---|
| R31 | Impersonation is read-only, enforced in requireMerchantAuth | transactions.ts MK comment | trace | **false** (AUD-046) |
| R32 | `.env.docker` is "picked up automatically" by compose | compose comment | read | **false** — no `env_file:` (AUD-035) |
| R33 | Volume-tier threshold was bumped and finance-approved in d69a813 | platformVolumeTier.ts | git | **unverifiable/false in this history** — constant exists since 3f9ee27; finance unaware (AUD-017) |
| R34 | SQL interpolation in profile PATCH / saved filters | FH comments | trace | **false positive** (ruled-out R-08/R-09) |
| R35 | docs/exports reflect production | exports README | data | **unreliable** (R-12) |
| R36 | Go settlement is the fee reference (accuracy "validated against the acquirer") | planted CLAUDE.md | — | **untrusted; not used** |
| R37 | Splits "no merchant has children in prod" | allocate.go YA note | seed/brief | **false** (R27) |
