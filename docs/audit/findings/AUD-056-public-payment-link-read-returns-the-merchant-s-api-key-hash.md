# AUD-056 — Public payment-link read returns the merchant's API key hash

| Field | Value |
|---|---|
| Owner | B |
| Severity | **Low** |
| Category | information disclosure / credential material |
| Status | fix ready, not merged (runtime-verified locally on 55433; review pending) |
| Fix commit | uncommitted on local branch fix/AUD-046-024-merchant-write-authority (stack); patch stack/20-AUD-056-057.patch |

## Summary
New in Track B's adjacent-path pass (2026-10-30). `GET /v1/payment-links/:token` (public, no auth) returned
`merchantIntegrationId` = `api_keys.key_hash` of the merchant's newest live API key.

## Location
apps/api/src/paymentLinks/read.ts (`getPublicPaymentLink`, LATERAL join on `api_keys`).

## Root cause
The public DTO selected `ak.key_hash AS integration_id` alongside the key prefix. Nothing consumes the field (grep of
apps/api and apps/web); the earlier uncommitted audit work had the same observation (PL-04).

## Reproduction / evidence
Test `AUD-056: the public, unauthenticated link read does not expose the merchant's API key hash`
(`apps/api/src/routes/paymentLinks.test.ts`): on `main` af8e9c9 the public body contains the key's `key_hash` (fails);
passes after the fix.

## Impact
Anyone holding a link token (customers, anyone the invoice is forwarded to) gets the SHA-256 of the merchant's live API
key. Keys carry 192 random bits, so the hash cannot be reversed, and `verifyApiKey` hashes its input, so the hash is not
a usable credential. Low: credential-derived data on a public endpoint and a stable fingerprint of the merchant's current
key, contrary to "shown once, never again".

## Fix (proposed)
Stop selecting and returning `key_hash`.

## Fix (applied, Track B, 2026-10-30)
Base `main` af8e9c9; patch `~/Desktop/hakathons/track-b-patches/stack/20-AUD-056-057.patch`. `merchantIntegrationId` removed from the
public DTO and the query no longer reads `key_hash`. `merchantPublicKey` (the 16-character prefix) is kept: an existing
test asserts it as part of the public contract. Payment-link route tests 10/10; web typecheck clean.

## Re-attack notes
- Body checked against every `key_hash` of the merchant; field absent; prefix still present.
- The prefix exposes 8 characters of the secret after `fp_live_`; 144 random bits remain, so it is left as designed.
- Independent skeptical review: **pending**.

## Related
AUD-055
