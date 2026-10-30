# Audit coverage map (Track B session, 2026-10-30)

Levels: **UI** = exercised in a real browser (Playwright/Chromium against the running app) · **API** = exercised over HTTP
against the running app or `app.inject` · **RT** = regression test on real Postgres · **S** = inspected statically only ·
**–** = not inspected here. A level says what was done in *this* track's work; Track A's own coverage is in its tracker.

Environment for UI runs: disposable Postgres 127.0.0.1:55433 (db `filspay`, freshly migrated + seeded), API in
`NODE_ENV=development` with `REFUNDS_ENABLED=true` (local only), dashboards built with a same-origin API base and served by
a local test proxy (the API has no CORS, so the stock dev setup cannot make credentialed calls; see limits). Seed fixture
accounts only; sandbox acquirer; no external network.

## Challenge requirements (official brief, docs/audit/BRIEF.md)
- Tasks: audit, fix, explain, build FP-300 and host it on Dilmune Cloud. Scoring favours bigger bugs and clear "why".
- **"About 147 bugs": reported, unverified.** No count appears in the brief or the repository. This repo's finding system has
  58 unique findings (AUD-001…058) after this session; several group many affected locations under one root cause.
- **Flag: confirmed by reproduction (no checker available, not submitted).** Challenge-authored puzzle in the original repo's
  empty commits: base64 (`fe24d26`, "transmission 1") → Vigenère key `diffs` ("victim of rule two", `8022020`) → ROT13
  `Ledger-Note` trailers → date of the spoofed Yousif commit `098c2de` (2026-09-28) → `openssl enc -d -aes-256-cbc -pbkdf2 -a`
  on `0af74f0` ("transmission 3"). Result: `FLAG{order_of_the_prompt_never_read_the_diff}`. Commands reproduce it from git
  history alone; nothing in the app was modified.
- **Missing feature:** FP-300 = refunds. "Done when" list checked below.

## Journeys
| Area | Level | Evidence / notes |
|---|---|---|
| Merchant login: password + OTP, dev code, redirect | UI, RT | ui journey 1–2; AUD-001/002/023 tests |
| Pending session, cross-tenant email, OTP races (merchant + admin) | RT | authPendingSession, authOtpRecipient, otpAttempts |
| Logout, and logout across two tabs | UI | other tab gets 401, then login page on reload |
| Session expiry | S | `expires_at` predicate in `lookupSession`; not exercised by waiting |
| Recovery / password reset, invitations | S | no merchant reset flow exists; admin invite code generator is dead code |
| Registration / onboarding / KYC | S | not exercised (Track A + earlier audit) |
| Roles: owner / finance / support; tenant isolation | UI, RT | support sees no money controls, forged refund/void 403, cross-merchant read 404 |
| Admin login + OTP, "view as merchant" | UI, RT | super admin grant reads (200), cannot refund or create links (403) |
| Disabled admin grant | RT | merchantWriteAuthority |
| API keys: issue, rotate, revoke | RT | AUD-038 (old key 401 after rotation) |
| Payment link: create, checkout, pay, single use, expiry | UI, RT | 4.750 BHD shown, paid once, second payer "Already paid", expired link "Link expired"; DB: 1 txn / 0 txns |
| Payment link: slow capture / slow authorize races, recovery | RT | payConcurrency (gated acquirer) |
| Payment link cancel IDOR | RT | AUD-022 |
| Authorize / capture / partial capture / void | API, RT | capture/void role gates; capture form now one key per attempt (UI code, not re-run in browser) |
| Refunds (FP-300) | UI, API, RT | drawer refund 0.750 BHD, double click → one refund (DB), timeline + refunded amount shown; fp300Acceptance |
| Fees, ledger, settlement, splits, payouts | RT (B parts), S | AUD-043 totals; AUD-018 disbursement in payout tx (Go tests); rest is Track A |
| Webhooks: create, test-send, delivery, retry, backoff, exhaustion | RT | AUD-020/044/053/057 tests; UI webhook pages not exercised |
| Webhooks: archive, replay | RT | AUD-042 archive cap, AUD-018 replay → one disbursement |
| Outbound destination control (SSRF) | RT | transportSafety (literal/IPv6-mapped/resolved/mixed/TLS/redirect/size) |
| Acquirer callbacks: signature, dedupe, replay | RT | AUD-019/021 |
| Reporting: consumer, rebuild, analytics, export-summary | RT | refundRollup, batchClosedParity (AUD-058), dailySummaryRollup, reportingExportSummary |
| Exports | RT | AUD-042 streaming + paging test; measured |
| Settlement summary / reconciliation pages | RT (summary), S | reconciliation is Track A |
| Merchant UI pages: overview, settlement, reconciliation, webhooks | – | not exercised in the browser |
| Mobile layout / keyboard | – | not checked |
| Config / startup / migrations | API, RT | fresh migrate (78), seed self-checks; prod defaults for signatures and destination blocking tested |
| Deployment (Dilmune) | – | blocked: Q10 (no platform access or docs) |

## FP-300 "done when" (refunds)
| Criterion | Status |
|---|---|
| Works start to end through the API | **met locally** (fp300Acceptance; UI drawer) |
| Money right in the ledger, to the fils | **met** for refund legs (balanced groups; payable = capture net − refunds + reversed fee) |
| Fees and payouts right | fee reversal **met** (200 of 250 fils for 8 of 10 BD); payouts: Track A PR 2 tests; negative-net recovery **blocked on Q13** |
| Shop gets the right webhook | **met** (refund.succeeded, signed over sent bytes) |
| Timeline, reports, reconciliation | timeline **met**; reports **met** (daily rollup, analytics); reconciliation: Track A PR 2 |
| Live on Dilmune Cloud | **blocked** (Q10); `REFUNDS_ENABLED` stays off by default until Q13 |

## Known limits of this coverage
- UI runs used a test proxy because the API sends no CORS headers; the stock `vite` dev setup (dashboards on :5173/:5174
  calling :3000 with credentials) cannot work as shipped. Recorded as a deploy/dev issue (AUD-035 area), not fixed.
- Browser journeys covered the screens listed above only; no visual or accessibility review.
- Nothing was run against Track A's database, a shared database or any deployment.
