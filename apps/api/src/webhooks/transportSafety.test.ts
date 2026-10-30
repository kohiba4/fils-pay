/**
 * AUD-057 (new, Track B adjacent-path pass): the webhook transport followed
 * redirects and read the receiver's whole response. Production only requires
 * an https endpoint URL (webhooks/create.ts; the transport comment claiming
 * "create.ts blocks private IPs" is false), so an https endpoint the merchant
 * controls could 302 to an internal http address and test-send / the delivery
 * log would hand the merchant up to 2,000 characters of the internal response.
 * An unbounded read also let any receiver push an arbitrarily large body into
 * the API's memory.
 */
import assert from "node:assert/strict";
import http from "node:http";
import type { AddressInfo } from "node:net";
import { test } from "node:test";
import * as transport from "./transport.js";

const { createFetchTransport } = transport;
const MAX_RESPONSE_BYTES = (transport as { MAX_RESPONSE_BYTES?: number }).MAX_RESPONSE_BYTES ?? Number.NaN;

function serve(handler: http.RequestListener): Promise<{ url: string; hits: () => number; close: () => Promise<void> }> {
  let count = 0;
  const server = http.createServer((req, res) => {
    count++;
    handler(req, res);
  });
  return new Promise((resolve) => {
    server.listen(0, "127.0.0.1", () => {
      const { port } = server.address() as AddressInfo;
      resolve({
        url: `http://127.0.0.1:${port}/hook`,
        hits: () => count,
        close: () => new Promise((r) => server.close(() => r())),
      });
    });
  });
}

const send = (url: string) =>
  createFetchTransport()({ url, headers: { "Content-Type": "application/json" }, body: "{}", timeoutMs: 5_000 });

test("AUD-057: a redirect from the receiver is not followed and the redirect target is never contacted", async () => {
  const internal = await serve((_req, res) => res.end("INTERNAL-METADATA-SECRET"));
  const redirector = await serve((_req, res) => {
    res.writeHead(302, { location: internal.url });
    res.end();
  });
  try {
    const r = await send(redirector.url);
    assert.equal(r.statusCode, 302, "the 3xx is the receiver's answer");
    assert.ok(!r.body.includes("INTERNAL-METADATA-SECRET"));
    assert.equal(internal.hits(), 0, "the internal target was never requested");
  } finally {
    await internal.close();
    await redirector.close();
  }
});

test("AUD-057: the receiver's response body is read only up to the excerpt bound", async () => {
  const big = await serve((_req, res) => {
    res.writeHead(200, { "content-type": "text/plain" });
    res.end("x".repeat(5 * 1024 * 1024));
  });
  try {
    const r = await send(big.url);
    assert.equal(r.statusCode, 200);
    assert.ok(r.body.length <= MAX_RESPONSE_BYTES, `read ${r.body.length} chars`);
    assert.ok(r.body.length >= 2000, "still enough for the stored 2,000-char excerpt");
  } finally {
    await big.close();
  }
});

test("AUD-057: an ordinary 200 receiver still works", async () => {
  const ok = await serve((_req, res) => res.end("ok"));
  try {
    const r = await send(ok.url);
    assert.deepEqual([r.statusCode, r.body], [200, "ok"]);
  } finally {
    await ok.close();
  }
});

// ---- AUD-057 part 2: destinations checked at connection time ----
const blocking = (extra: Partial<transport.TransportPolicy> = {}) =>
  createFetchTransport({ blockPrivateDestinations: true, ...extra });
const post = (t: transport.WebhookTransport, url: string) =>
  t({ url, headers: { "Content-Type": "application/json" }, body: "{}", timeoutMs: 5_000 });

test("AUD-057: literal private, loopback, link-local and IPv6-mapped destinations are refused before connecting", async () => {
  const srv = await serve((_req, res) => res.end("internal"));
  try {
    const port = new URL(srv.url).port;
    for (const host of ["127.0.0.1", "[::1]", "[::ffff:127.0.0.1]", "[::ffff:7f00:1]"]) {
      const r = await post(blocking(), `http://${host}:${port}/hook`);
      assert.equal(r.statusCode, null, host);
      assert.match(String(r.errorMessage), /not allowed/, host);
    }
    assert.equal(srv.hits(), 0, "nothing reached the internal server");
  } finally {
    await srv.close();
  }
  for (const a of ["10.1.2.3", "172.20.0.5", "192.168.1.1", "169.254.169.254", "100.64.0.1", "0.0.0.0", "fd00::1", "fe80::1", "::ffff:10.0.0.1", "64:ff9b::a00:1"]) {
    assert.equal(transport.isProhibitedAddress(a), true, a);
  }
  for (const a of ["93.184.216.34", "8.8.8.8", "2606:4700:4700::1111"]) {
    assert.equal(transport.isProhibitedAddress(a), false, a);
  }
});

test("AUD-057: a hostname that resolves to an internal address, or to a mix of public and internal, is refused", async () => {
  const srv = await serve((_req, res) => res.end("internal"));
  try {
    const port = new URL(srv.url).port;
    const internalOnly = blocking({ resolve: async () => [{ address: "127.0.0.1", family: 4 }] });
    const mixed = blocking({ resolve: async () => [{ address: "93.184.216.34", family: 4 }, { address: "127.0.0.1", family: 4 }] });
    for (const t of [internalOnly, mixed]) {
      const r = await post(t, `http://hooks.merchant.test:${port}/hook`);
      assert.equal(r.statusCode, null);
      assert.match(String(r.errorMessage), /resolves to 127\.0\.0\.1/);
    }
    assert.equal(srv.hits(), 0);
  } finally {
    await srv.close();
  }
});

test("AUD-057: the connection uses the single, checked resolution (no second lookup to rebind)", async () => {
  const srv = await serve((_req, res) => res.end("ok"));
  try {
    const port = new URL(srv.url).port;
    let lookups = 0;
    const t = blocking({
      allowAddresses: ["127.0.0.1"], // stands in for a public receiver in this test
      resolve: async () => {
        lookups++;
        return lookups === 1 ? [{ address: "127.0.0.1", family: 4 }] : [{ address: "10.0.0.9", family: 4 }];
      },
    });
    const r = await post(t, `http://hooks.merchant.test:${port}/hook`);
    assert.deepEqual([r.statusCode, r.body], [200, "ok"]);
    assert.equal(lookups, 1, "resolved exactly once, at connect");
    assert.equal(srv.hits(), 1);
  } finally {
    await srv.close();
  }
});

test("AUD-057: blocking is on by default in production and off in development", async () => {
  const { loadConfig } = await import("../config.js");
  const base = {
    DATABASE_URL: "postgres://x@localhost/x",
    WEBHOOK_SECRET_ENCRYPTION_KEY: "Y1ZTGTcYbe30GZJebys9w7T3OYZNKewuOH3SUCEdRQk=",
    ACQUIRER_CALLBACK_SIGNING_SECRET: "s",
    SETTLEMENT_INTERNAL_TOKEN: "t",
  };
  assert.equal(loadConfig({ ...base, NODE_ENV: "production" }).webhookBlockPrivateDestinations, true);
  assert.equal(loadConfig({ ...base, NODE_ENV: "development" }).webhookBlockPrivateDestinations, false);
});

test("AUD-057: TLS certificate verification stays on (a self-signed receiver is refused)", async () => {
  const { execFileSync } = await import("node:child_process");
  const { mkdtempSync, readFileSync, rmSync } = await import("node:fs");
  const { tmpdir } = await import("node:os");
  const { join } = await import("node:path");
  const https = await import("node:https");
  const dir = mkdtempSync(join(tmpdir(), "aud057-tls-"));
  try {
    execFileSync("openssl", ["req", "-x509", "-newkey", "rsa:2048", "-nodes", "-days", "1", "-subj", "/CN=localhost",
      "-keyout", join(dir, "k.pem"), "-out", join(dir, "c.pem")], { stdio: "ignore" });
    let hits = 0;
    const server = https.createServer({ key: readFileSync(join(dir, "k.pem")), cert: readFileSync(join(dir, "c.pem")) }, (_q, s) => {
      hits++;
      s.end("ok");
    });
    await new Promise<void>((r) => server.listen(0, "127.0.0.1", () => r()));
    const port = (server.address() as AddressInfo).port;
    try {
      const t = createFetchTransport({ blockPrivateDestinations: true, allowAddresses: ["127.0.0.1"], resolve: async () => [{ address: "127.0.0.1", family: 4 }] });
      const r = await post(t, `https://localhost:${port}/hook`);
      assert.equal(r.statusCode, null);
      assert.match(String(r.errorMessage), /self[- ]signed|certificate/i);
      assert.equal(hits, 0, "no request was sent over the unverified connection");
    } finally {
      await new Promise<void>((r) => server.close(() => r()));
    }
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
