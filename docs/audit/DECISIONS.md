# Decisions on PLAN.md Q1–Q10

Decided by the auditor on the user's instruction (2026-10-29), each after
checking the code or data. Anything that only appears in a repo comment, doc,
chat export or the removed CLAUDE.md/AGENTS.md was treated as unverified.
**Reversible until the related Phase 2 commit lands.** Items marked ⚠ carry a
business risk the user/finance should know about.

## Q1 — Broken migrations 0054/0055 (AUD-026) → **edit both in place, minimal**
Facts: 0054 references table `settlement_batch_events` that exists nowhere; 0055
inserts into columns (`code, account_type, description`) that don't exist and a
kind (`suspense`) the CHECK forbids. Nothing reads `v_unbatched_capture_events`,
`fx_rounding_difference`, `chargeback_suspense` or `chargeback_cases`
(grep-verified). `merchant_payable_position` is used by `ledger/refresh.go`;
`v_active_api_keys` is unused but valid.
Why in-place is safe: the runner (`db/migrate.ts`) skips by **filename** and stores
no checksum (MK's checksum comment is false), so a database that already recorded
0054/0055 is unaffected. The button works in the brief's production, which suggests
a working `merchant_payable_position` already exists there, i.e. production ran
some other, valid 0054 (this is an INFERENCE, not evidence: production's real schema is unknown). The in-repo file can never have applied on a fresh DB.
Plan: 0054 drops the broken `v_unbatched_capture_events` view and keeps the two
valid ones (`CREATE OR REPLACE`); 0055 becomes a commented no-op (no code needs those
accounts and inventing `suspense` rows would need a CHECK change). Document the
production-drift caveat (HANDOVER: MK "fairly sure" 0054 created `chargeback_cases`
on staging-2, unverifiable). Add a CI-style test: migrate from empty must succeed.
**Required before the first deploy:** diff production's schema against a fresh migrate (views, `chargeback_cases`, any `v_unbatched_capture_events`) — this fix only guarantees fresh databases.

## Q2 — Rebuild button vs CLI (AUD-015, ADR-0004) → **button uses the ledger; supersede ADR-0004**
Reproduced on the seed: ledger 136.5M fils vs scheme-export view 7.3M fils for
Alpha (the brief's 135K → 7K). The ledger is the double-entry record; the view sums
truncated gross of scheme lines (no fees/payouts/adjustments), which is not a balance.
ADR-0004's reason (40 s ledger walk > 30 s HTTP timeout) is solved better by one
`GROUP BY merchant_id` query than by reading the wrong source. Also lock
`merchant_balances` rows (the open TODO) so a concurrent close isn't clobbered.
Write ADR-0007 superseding ADR-0004. Keep ADR-0006 (Adjust is display-only) but
fix ADMIN.md which says it's journaled.
⚠ Rebuild-from-ledger includes unbatched pending captures (the incremental cache
excludes them until close); that is what the CLI already does and finance accepts.

## Q3 — MDR recalculation (AUD-014) → **paid batches are never rewritten**
Recalculating at the merchant's current terms is the intended finance flow (kept).
Closed-unpaid batches: rewrite before payout, as now (the existing test covers this).
Paid batches: post the ledger adjustment (dated now) and cache delta only; leave the
batch row exactly as paid. This matches the code's own `BatchAdjustment` doc comment
("the original batch's figures stay as they were paid"). "Open" batches have no
totals, so the settlement team's claim is vacuously true and not a safeguard.

## Q4 — Impersonation (AUD-024, new AUD-046) → **read-only support for every admin role, and gate capture/void**
Checked more than the mapping: `capture` and `void` carry no role gate at all, so
even `support` can move money. So the fix is two parts: map every admin role to
merchant `support`, and add `requireMerchantRole('owner','finance')` to capture,
void and (FP-300) refund. API keys keep full authority by design. Impersonation
stays a viewing tool; "fix things for locked-out merchants" is done through admin
routes that audit as the admin. Update ADMIN.md.

## Q5 — Fee formula (AUD-016) → **discount off the amount, then MDR, then tier bonus; one function; applied at capture for every path**
Two candidate orderings (discount off amount vs off fee) differ by ≤1 fil, in 22%
of sampled amounts, so this is mostly about consistency. Chosen because (a) it is
what CloseBatch actually pays merchants today, (b) ARCHITECTURE and the v2 design
doc state it, (c) 0047's author note states it. The opposing evidence is one
unsigned "off the fee" note and `discountAdjustment.ts`'s cited "partner-pricing
addendum" that I cannot see. ⚠ If finance holds that addendum, confirm. Change:
compute the fee once at capture with the shared formula (no after-the-fact
adjustment, which today runs in a separate transaction and is skipped for
payment-link payments), then make settlement read the same function. The claim
that "Go is the reference" came from the planted CLAUDE.md and was NOT used.

## Q6 — Month windows (ADR-0003) → **Bahrain calendar month everywhere; supersede ADR-0003**
Batches are Bahrain days, so any monthly total compared with batches must be a
sum of Bahrain days. ADR-0003's "it nets out" is false (YA's objection stands).
Applies to future finance scripts and reports. The March gap itself cannot be
explained from the repo (data not present); not claimed.

## Q7 — Platform volume tier (AUD-017) → **fix the overflow, keep the behaviour, flag it** ⚠
Widen counter to BIGINT (new migration, A track) and int64 in Go. Do not
disable the tier: removing live pricing is a business decision, not a bug fix.
⚠ Risk to raise with finance: no commit or document shows written sign-off
(YA's handover required it; Huda "didn't know"; the "bumped in d69a813"
claim has no commit). Dormant in test data (counter 69,418 fils vs 2,000,000,000).

## Q8 — Split payouts (AUD-009) → **keep the parent-leg ledger model; exact allocation; validate weights**
Money leaving the platform to child accounts is a cash payout; `settlement_batch_splits`
is the per-child record. Introducing child payable accounts would be a redesign
that changes every child's balance. Fix = largest-remainder allocation (shares sum
exactly to net, never over), refuse to pay if weights ≠ 10000, include the child id
in the leg description for traceability. Measured: ±1 fil per batch; finance's "tens
of fils" is not explained by this alone (left open in CLAIMS).

## Q9 — Seed dump and committed secret → **keep the dump; scrub the secret; rotation is the owner's job** ⚠
`production_seed.sql`: synthetic, no PII, unreferenced → leave (deleting adds risk
and no value). `ops/.env.docker`: tracked file with a signing secret → replace the
value with a placeholder in a later commit, and compose must pass env explicitly.
⚠ The value stays in git history (including our private repo), so it must be
treated as exposed; rotating it needs the acquirer relationship, which I can't do.

## Q10 — Dilmune Cloud → **needs the user**
A web search found no Dilmune Cloud site, docs or deploy flow, only unrelated
hosts. I will not invent a procedure or credentials. Needed from the user: the
platform's URL/docs, how deploys happen (git push, container, CLI), whether a
managed Postgres exists, and where secrets are set.

## Q11 (added after review) — AUD-011: hold expiry marks 'expired' instead of deleting ⚠
Sources conflict: migration 0005's comment (MK, "FP-219 … now deletes expired rows", ticket not found in history)
and the ORIGINAL script (commit a2fd53d, which did DELETE) vs HANDOVER ("holds are never deleted"), the comment in
`authorize.ts`, and the schema's `expired` status. Chosen: mark `expired` (non-destructive, reversible; nothing
reads or references hold rows). Needs confirmation from finance/MK that nobody relies on expired rows being
removed (e.g. table-size housekeeping). The stale comment in 0005 is left alone (applied migration).

## Q12 — AUD-036: what counts as a duplicate CSV import
Chosen: a content fingerprint (sha256 of the sorted rows `merchantId|parsed fils|reason`, file name ignored) stored on
`adjustment_imports.content_sha256` (migration 0077). The same content is refused with 409 `duplicate_import` unless the
request carries the new optional `allowDuplicate: true` (admin UI: "Import anyway" with a confirm). Not a unique
index, because finance may legitimately repeat an identical file (recurring monthly credit); the check runs under an
advisory lock so two concurrent submits cannot both pass. Alternative rejected: "any identical file within N hours"
(arbitrary window). Needs finance to confirm that a repeat should require the explicit override.

## Q13-Q15 (FP-300 refunds) — see docs/audit/FP-300-PLAN.md
Q13 (how a refund reaches a payout, negative net) **needs finance** before go-live (PR 2 implements the batch terms; a negative net is recorded and pays nothing but is NOT recovered from later payouts, so `REFUNDS_ENABLED` stays off by default; options: carry the debt into the next batches by capping payouts at max(0, net + carried debt), or collect from the merchant); Q14 (concurrency) decided: row lock held across the acquirer call, like capture; Q15 (summary view) decided: plain view. Fee reversal keeps the finance-approved per-refund rounding and adds a clamp so the total never exceeds the fee charged.

## Q16 — Second login factor: authenticator app (TOTP) instead of an emailed code (decided with the user, 2026-10-30)
Problem: the emailed/dev-exposed OTP had no delivery channel in production (`sendOtpCode` is a logging stub), so the live server
either showed the code in the login response (second factor protects nothing) or nobody could log in. Resend (free: 100 mails/day)
only delivers to the account owner's own address until a domain is verified; we have no domain, and judges cannot read our mailbox.
Chosen: **TOTP, RFC 6238** (Google Authenticator and every compatible app), implemented with `node:crypto` only (no dependency, no
third-party service, works offline). `SECOND_FACTOR=totp` is the production default; outside production the original OTP stays the
default so local development and the existing tests need nothing installed (`SECOND_FACTOR` overrides).
- Secret: 160 random bits, stored AES-256-GCM encrypted on `merchant_users` / `admin_users` (same key as webhook secrets).
- First login of an account that has never confirmed a code returns the secret once (`totpEnrollment`); the first correct code confirms it.
  **Open risk:** until then the account is only as safe as its password (anyone with the password can enrol first). Safeguard: provision
  secrets out of band for real merchants (reset procedure in RUNBOOK) or require an admin-issued enrolment link.
- Limits (AUD-023 residual: the old resend reset the guess budget): 5 wrong codes per pending session, then the session is revoked; 10 wrong
  codes per ACCOUNT lock it for 15 minutes whatever session they came from; an accepted code's 30 s step can never be reused (replay);
  clock drift of one step either way is accepted. No resend exists.
- Judges/demo: the demo accounts are NOT pre-enrolled; whoever logs in first scans the key into an authenticator app.
Tests: RFC 6238 vectors, replay, drift window, session budget, account lock, enrolment shown once, both planes (`auth/totp.test.ts`, `routes/totpLogin.test.ts`).
