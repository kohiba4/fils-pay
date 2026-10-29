# Triage: is it really a bug?

Added after the tip that some reported "bugs" are not bugs. Every finding was re-read against
the executing code, the ADRs, the design docs and the brief, asking **"could this be intended?"**.
`docs/audit/build_report.py` reads this table to build REPORT.md, so keep one row per finding.

Verdicts: **BUG (runtime)** reproduced by running code · **BUG (traced)** proven by reading the exact
code path, not yet run · **LATENT** real code defect but unreachable today (refund route returns 501) ·
**DESIGN** behaviour matches an ADR/design decision; only docs disagree, not a code bug ·
**LIMITATION** documented, accepted constraint · **HYGIENE** test/dev-tooling quality, no product impact ·
**UNVERIFIED** not yet proven either way.

| ID | Verdict | Confidence | Why it is (or is not) a bug |
|---|---|---|---|
| AUD-001 | BUG (traced) | high | `lookupSession` reads the `live_sessions` view and never tests `authenticated`; 0012 states every auth query must. Track B to reproduce. |
| AUD-002 | BUG (traced) | high | login re-resolves the OTP recipient by email across all merchants; 0003 allows duplicate emails and 0011 says no code resolves a challenge by email. |
| AUD-003 | LATENT | high | No ownership scope in refund path, but `POST /v1/refunds` is a 501 stub today. Becomes critical when FP-300 wires it. |
| AUD-004 | LATENT | high | No lock across the acquirer call; capture does lock (ruled-out R-04), so "payments are safe" is true. |
| AUD-005 | LATENT | high | Ceiling is authorized minus refunded; the brief lists "refund more than charged". |
| AUD-006 | BUG (traced) | high | Matches the incident exactly (>60 s first attempt, finalize answers 200 on 0 rows). The postmortem's callback theory is wrong: callbacks never touch links. |
| AUD-007 | BUG (traced) | high | ARCHITECTURE documents client-clock expiry as a feature, but the brief (FP-187) calls it untrusted input. Treated as a bug. |
| AUD-008 | BUG (runtime) | high | float32 net differs from integer subtraction (up to 14 fils at ~1M BD). ADR-0001 forbids it. |
| AUD-009 | BUG (runtime) | high | Allocation error is ±1 fil/batch with the seed weights. Finance's "tens of fils" is NOT explained by this (open). |
| AUD-010 | BUG (runtime) | high | File `amount` 93.28 vs 93270 fils. Not Visa rounding: we generate the file. |
| AUD-011 | BUG (runtime) | high | Unconditional DELETE when nothing expired. |
| AUD-012 | BUG (runtime) | high | 4.75 BD posts 475 fils. The comment "import format is 2dp by agreement with finance" is contradicted by finance's own email. |
| AUD-013 | BUG (runtime) | high | Second run doubles the posting (170 to 340 fils). |
| AUD-014 | BUG (runtime) | high | Only the paid-batch rewrite is a bug. Recalculating CLOSED unpaid batches at current terms IS intended (finance flow, existing test). |
| AUD-015 | BUG (runtime) | high | Reproduced 136.5M vs 7.3M fils; fixed (ADR-0007). ADR-0004 chose this on purpose, but it contradicts the ledger being authoritative and the brief; decision Q2. |
| AUD-016 | BUG (traced) | medium | Ledger fee and batch fee are computed by different formulas and pay-link captures skip the discount. Orderings differ by at most 1 fil, so the exact size per payment is small; to be run as a test in Phase 2. |
| AUD-017 | BUG (runtime) | high | Counter wrapped negative; fixed (migration 0074, int64). Whether the tier discount itself is approved is a separate, open business question. |
| AUD-018 | BUG (runtime) | high | 35 to 37 of 40 batches duplicated; the "unique index" in the code comment does not exist. |
| AUD-019 | BUG (traced) | high | Plain INSERT, no unique key; the "dedupe" commit is empty. Confirmed by the brief (FP-201). |
| AUD-020 | BUG (traced) | high | Signs canonical JSON but sends the JSONB re-serialization. |
| AUD-021 | BUG (traced) | high | Missing signature accepted by default, no timestamp check, non-constant-time compare. |
| AUD-022 | BUG (traced) | high | Cancel updates `WHERE id` without merchant. Confirmed by chat claim. |
| AUD-023 | BUG (traced) | medium | `Math.random` OTP and a check-then-increment attempt limit. Mostly moot until AUD-001 is fixed. |
| AUD-024 | DESIGN (decided to change) | medium | Write-capable impersonation was a deliberate July change (migration comment), but it contradicts the security docs. Q4: read-only. |
| AUD-025 | BUG (traced) | high | `time.Now().UTC()` date used as the Bahrain day. Matches ops log (~03:15) and chat. Needs a clock seam to test. |
| AUD-026 | BUG (runtime) | high | Fresh migrate fails at 0054. |
| AUD-027 | BUG (runtime) | high | 11 refund tests fail on the 0070 check. Latent in product (route is a stub). |
| AUD-028 | LATENT | high | View joins `t.id = r.id`; refunds are not live yet. |
| AUD-029 | LATENT | medium | Per-partial rounding can reverse more fee than charged (arithmetic example); refunds not live. |
| AUD-030 | LATENT | high | Event produced, no envelope or dispatcher entry. |
| AUD-031 | BUG (runtime) | high | Reproduced 245 vs 225 with the seed. |
| AUD-032 | BUG (traced) | medium | The code clears `test_mode` deliberately ("tidied"), but a status recompute changing settlement eligibility contradicts 0002. Confirmed by chat. |
| AUD-033 | BUG (low impact) | high | Real float32 accumulation, but monitoring-only: grep shows nothing reads the column. No money effect. |
| AUD-034 | BUG (runtime) | high | Whole balanced group deleted and committed; fixed by migration 0076 (reject trigger). Needs DB access, not an API path; a superuser/owner can still bypass (see the finding). |
| AUD-035 | BUG (runtime/ops) | high | Dockerfiles missing, dev webhook key invalid, compose never loads `.env.docker`. |
| AUD-036 | BUG (traced) | high | Slack shows a double import. The "unique filename" claim is false (no such constraint). |
| AUD-037 | DESIGN | high | **Not a code bug.** `applyBalanceCorrection` is cache-only exactly as ADR-0006 says; the journaled variant exists but is not wired. Only ADMIN.md ("journaled to the ledger") is wrong. |
| AUD-038 | BUG (traced) | high | Old key is never revoked. The "24h grace" mentioned in a migration comment is not in ADMIN.md or in code. |
| AUD-039 | UNVERIFIED | low | Compares display names, but `admin_users.display_name` is not unique and no route lets admins rename themselves, so exploitation needs DB access. Likely low. |
| AUD-040 | LIMITATION | high | Code comments state "only run ONE api replica". Real if scaled, not a current bug. |
| AUD-041 | UNVERIFIED | medium | 4 reporting tests really fail (null merchant_id); root cause not traced. |
| AUD-042 | UNVERIFIED | low | Export memory behaviour not measured. |
| AUD-043 | UNVERIFIED | low | Slow query not measured with EXPLAIN. |
| AUD-044 | HYGIENE | high | Test uses real jitter and expects an exact delay. |
| AUD-045 | HYGIENE | high | Dev seed prints keys; the SQL dump is harmless (no PII). |
| AUD-046 | BUG (traced) | high | No role gate on capture/void; MK's "enforced in requireMerchantAuth" comment is false. |
| AUD-047 | BUG (traced, low) | high | Route lacks the auth hook (fails closed with a 500). |
| AUD-048 | BUG (runtime) | high | Reproduced (cache 195,000 vs ledger 97,500 after rebuild then close); display-only impact, so Medium. Pre-existing in the CLI; the definitions of 'balance' differ between the incremental cache and the ledger. |
| AUD-049 | BUG (traced) | high | The --merchant path only reads; the comment and RUNBOOK claim it writes. |
| AUD-050 | BUG (traced) | medium | `calculateCreditFeeReversal(base, merchants.mdr_bps)` ignores `fee_schedules`; the stored default is only the fallback. Not yet reproduced as a test; what a goodwill reversal should mean is a finance call. |
| AUD-051 | BUG (traced) | high | `toISOString()` (UTC) applied to a browser-local date; wrong day for 3 hours after Bahrain midnight. Only a default value; low impact. |
