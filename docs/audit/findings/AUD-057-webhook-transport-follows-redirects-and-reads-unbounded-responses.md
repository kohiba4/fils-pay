# AUD-057 — Webhook transport follows redirects (SSRF past the https-only rule) and reads unbounded responses

| Field | Value |
|---|---|
| Owner | B |
| Severity | **High** |
| Category | SSRF / resource exhaustion |
| Status | **fixed** (merged with PR #27/#28) (runtime-verified locally; review pending) |
| Fix commit | uncommitted on local branch fix/AUD-046-024-merchant-write-authority (stack); patch stack/20-AUD-056-057.patch |

## Summary
New in Track B's adjacent-path pass (2026-10-30). `webhooks/transport.ts` used `fetch` with default redirect following and
`response.text()`.

## Location
apps/api/src/webhooks/transport.ts (`createFetchTransport`), reached from `webhooks/dispatcher.ts` and `webhooks/testSend.ts`;
URL rule in `webhooks/create.ts` (https required in production; no host restriction).

## Root cause
The only SSRF control is "https in production" (MK's comment "https-only in prod is our SSRF protection"). The transport
comment "create.ts blocks private IPs, SSRF is handled upstream" is false: `create.ts` checks only the scheme. `fetch`
follows 3xx by default, including https→http, so the control is bypassed by an https endpoint that redirects. The whole
response body was buffered.

## Reproduction / evidence
`apps/api/src/webhooks/transportSafety.test.ts` with real local servers: on `main` af8e9c9 a 302 to an "internal" server
returned that server's 200 body (`INTERNAL-METADATA-SECRET`), and a 5 MB response was read in full (5,242,880 chars) —
both fail; after the fix both pass.

## Impact
Any merchant owner or finance user (any onboarded merchant) registers an https URL they control, answers with a redirect
to an internal http address (cloud metadata service, internal APIs), then reads up to 2,000 characters of the internal
response via test-send (`POST …/webhook-endpoints/:id/test`) or the delivery log (`responseBodyExcerpt`). A receiver can
also return an arbitrarily large body into the 512 MB API process. High.

## Fix (proposed)
`redirect: "manual"`; read at most a small bound and cancel the rest.

## Fix (applied, Track B, 2026-10-30)
Base `main` af8e9c9; patch `~/Desktop/hakathons/track-b-patches/stack/20-AUD-056-057.patch`. `fetch(..., { redirect: "manual" })`
(a 3xx is the receiver's non-2xx answer: delivery fails and retries as usual); `readBounded` reads at most
`MAX_RESPONSE_BYTES = 4096` bytes (the stored excerpt is 2,000 chars) and cancels the stream. Tests 3/3 (incl. an ordinary
200 receiver); webhook tests pass in the full run.

## Re-attack notes
- Redirect target never contacted; 5 MB body read only to 4,096 bytes.
- **Part 2 (2026-10-30, connection-time destination control):** `webhooks/transport.ts` now sends with `node:http` /
  `node:https` (Node's global `fetch` cannot pin a resolved address without the `undici` package, which is not
  installed). A `lookup` hook used by the socket itself resolves the host once, refuses the request if **any** answer is
  prohibited (mixed answers), and the socket connects to the checked address, so there is no second resolution to rebind.
  Literal IP hosts (which skip lookup) are checked before connecting, including IPv4-mapped (`::ffff:a.b.c.d`,
  `::ffff:7f00:1`) and NAT64 (`64:ff9b::/96`) forms. Prohibited: 0/8, 10/8, 100.64/10, 127/8, 169.254/16, 172.16/12,
  192.0.0/24, 192.0.2/24, 192.168/16, 198.18/15, 198.51.100/24, 203.0.113/24, 224/4, 240/4; ::, ::1, 100::/64, 2001:db8::/32,
  fc00::/7, fe80::/10, fec0::/10, ff00::/8. TLS keeps Node's default certificate and hostname verification; environment
  proxies are not used (`agent: false`, one connection per request); redirects are not followed; the timeout covers
  connect, send and the bounded read. Policy: `WEBHOOK_BLOCK_PRIVATE_DESTINATIONS`, default **on in production**, off in
  dev/test (local receivers). Applies to every outbound path: delivery, retry, replay and archive restore (all go through
  the dispatcher) and test-send (same transport instance, `app.webhookTransport`). Endpoint create/update still only
  validate the URL string; enforcement is at send time.
- Tests added to `webhooks/transportSafety.test.ts`: literal private/loopback/IPv6-mapped refused with no connection;
  hostname resolving internal, and mixed public+internal answers, refused; exactly one resolution per request and a
  legitimate delivery succeeds; production default on; a self-signed TLS receiver is refused. The three destination tests
  fail against the previous transport (swapped in temporarily) and pass now; 8/8 in the file.
- **Still recommended (deployment, not application):** a network egress policy for the API container (defence in
  depth, and the only control for anything the app does not mediate).
- Independent skeptical review: **pending**.

## Related
AUD-020, AUD-053
