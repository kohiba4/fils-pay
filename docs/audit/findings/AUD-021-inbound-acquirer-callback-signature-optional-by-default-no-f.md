# AUD-021 — Inbound acquirer callback signature: optional by default, no freshness, re-serialized body, non-constant-time compare

| Field | Value |
|---|---|
| Owner | B |
| Severity | **High** |
| Category | authn |
| Status | **fixed** (merged with PR #27/#28) (runtime-verified locally on 55433; independently reviewed 2026-10-30: confirmed; provider contract unverifiable from the repo) |
| Fix commit | uncommitted on local branch fix/AUD-046-024-merchant-write-authority (stack); patch stack/09-AUD-021.patch |

## Summary
Inbound acquirer callback signature: optional by default, no freshness, re-serialized body, non-constant-time compare.

## Location
apps/api/src/webhooks/inboundVerify.ts:44-71, config.ts (`ACQUIRER_CALLBACK_REQUIRE_SIGNATURE` default false), routes/acquirerCallbacks.ts

**Sibling locations checked:** Outbound verifySignature uses timingSafeEqual (fine).

## Root cause
Missing header → valid unless required (default not required). Timestamp never checked → replay forever. HMAC over `JSON.stringify(parsedBody)` not raw bytes. `Buffer.compare` is not constant-time.

## Reproduction / evidence
Trace.

## Impact
Anyone can post forged fraud-review notes on any transaction id; replay of captured callbacks.

## Fix (proposed)
Require signature (fail closed), check |now − t| ≤ 300 s, HMAC raw body, `timingSafeEqual`.

## Fix (applied, Track B, 2026-10-30)
Discovered in the Phase 0 team audit unless stated; repaired here. Base `main` af8e9c9, uncommitted working tree in `~/Desktop/hakathons/fils-pay-hackathon`; patch `~/Desktop/hakathons/track-b-patches/stack/09-AUD-021.patch`.
**Contract used (evidence, not a provider spec).** The repo's own verifier format: header `acquirer-callback-signature:
t=<unix seconds>,v1=<hex HMAC-SHA256 of "t.body">` with `ACQUIRER_CALLBACK_SIGNING_SECRET`. The acquirer comparison
(2025-11) says acquirer B signs "HMAC-SHA256, timestamped" with replay protection and retries up to 5 times from 60 s.
No provider document for the header, body canonicalisation or a freshness window exists in the repo; the comment
"header name confirmed with the acquirer's integration guide v3.2" cannot be checked. **Unverified external contract.**

**Root cause / changes.**
- HMAC was computed over `JSON.stringify(parsedBody)`, not the received bytes, so a genuine callback with any other
  whitespace or key order was rejected (test reproduced 401). Now `routes/acquirerCallbacks.ts` keeps the raw body
  with a JSON parser scoped to this plugin, and `webhooks/inboundVerify.ts` signs the raw string.
- `Buffer.compare` replaced by `timingSafeEqual` over the decoded 32-byte digest after a `^[0-9a-f]{64}$` check.
- `config.ts`: `ACQUIRER_CALLBACK_REQUIRE_SIGNATURE` now defaults to **true when `NODE_ENV=production`** (where the
  secret is already mandatory); dev/test keep the old default; an explicit value still wins.
- **Not done:** no timestamp freshness window. The 300 s window in the earlier repair is not supported by any provider
  evidence and could reject documented retries (up to ~31 min). Replay of a signed callback is now a no-op (AUD-019).
  If the provider confirms a window and re-signing on retry, add it then.

**Tests:** appended to `apps/api/src/routes/acquirerCallbacks.test.ts`: `AUD-021: the signature is checked over the exact
bytes received…` (failed on `main` with 401, passes), `AUD-021: bytes changed after signing, or a malformed / truncated /
non-hex v1…` (6 variants, 401 and no note; passed before too), `AUD-021: production requires a callback signature by
default…` (failed on `main`, passes). Callback + verifier + acquirer tests 26/26.
**Tests changed:** none. The existing "accepts a callback sent without a signature header" test still holds for dev/test.

## Re-attack notes
- Raw bytes with different whitespace/key order: accepted when signed over those bytes; altered bytes: 401.
- Truncated, non-hex, wrong-timestamp, missing `t`, garbage header: 401, never 500.
- Production with no override: unsigned callbacks refused (config test). Integrator: ARCHITECTURE.md's env table still
  lists `ACQUIRER_CALLBACK_REQUIRE_SIGNATURE` default `false`.
- No secret rotation support (single secret); not requested by any document.
- Independent skeptical review (2026-10-30, `docs/audit/reviews/2026-10-30-track-b-batch.md`): **CONFIRMED** — regression test fails with the fix reverted, passes with it (raw-bytes test); replay argument holds while the only callback type appends a note. **Open, non-blocking:** signatures are required by default only when `NODE_ENV=production` (`parseNodeEnv` maps e.g. `staging` to development: unsigned callbacks accepted); `ACQUIRER_CALLBACK_REQUIRE_SIGNATURE=false` is still honoured in production; `ARCHITECTURE.md:96` still says the default is false; revisit before any state-changing callback type.

## Related
AUD-019, AUD-020

## Completion check (2026-10-30)
- **Provider / simulator:** none identifiable. The repo has no callback producer (the in-process acquirer simulator
  authorizes/captures/refunds only), no provider name beyond "Acquirer B" (`docs/research/acquirer-comparison-2025-11.md`),
  and no integration guide (the "v3.2" comment cites a document that is not in the repo). So no official signing contract
  can be consulted; nothing was invented.
- **Replay effect after the current protections:** the signed bytes include `callbackId`, `transactionId`, `outcome` and
  `note`, so a captured callback can only be replayed verbatim. AUD-019's unique `(transaction_id, callback_id)` makes a
  verbatim replay a no-op (tested: 3 sequential and 10 concurrent copies → 1 note). The only callback type
  (`fraud_review.completed`, CHECK in 0051) appends a note and changes no transaction status or ledger. **No additional
  effect of a replay exists**, so the missing timestamp window is not an exploitable replay here. A callbackId reused on a
  different transaction is kept (tested), matching the comparison doc ("callback ids are stable across retries").
- **Still open — interoperability questions for the acquirer:** exact header name and format; whether retries are re-signed
  with a new `t`; whether a freshness window is expected; how secret rotation works (the API accepts one secret only).
  Adding a window or dual-secret verification should wait for those answers.

