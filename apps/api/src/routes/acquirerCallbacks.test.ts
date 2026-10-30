/**
 * Route tests for the public acquirer async-callback endpoint. Requires
 * DATABASE_URL to point at a real, migrated Postgres (run `npm run migrate`
 * first).
 */
import assert from "node:assert/strict";
import { createHmac, randomUUID } from "node:crypto";
import { test } from "node:test";
import { Pool } from "pg";
import { buildApp } from "../app.js";
import { loadConfig } from "../config.js";

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) {
  throw new Error(
    "acquirerCallbacks.test.ts requires DATABASE_URL to point at a real, migrated Postgres (run `npm run migrate` first)",
  );
}

const ACQUIRER_SECRET = "acqsec_route_test_secret";

const config = loadConfig({
  DATABASE_URL: databaseUrl,
  NODE_ENV: "test",
  WEBHOOK_SECRET_ENCRYPTION_KEY: "Y1ZTGTcYbe30GZJebys9w7T3OYZNKewuOH3SUCEdRQk=",
  ACQUIRER_CALLBACK_SIGNING_SECRET: ACQUIRER_SECRET,
});

const pool = new Pool({ connectionString: databaseUrl, max: 5 });
const app = buildApp(config, pool);

test.after(async () => {
  await app.close();
  await pool.end();
});

async function createTransaction(): Promise<string> {
  const merchantResult = await pool.query<{ id: string }>(
    `INSERT INTO merchants (display_name, mdr_bps) VALUES ($1, $2) RETURNING id`,
    [`Acquirer Callback Route Merchant ${randomUUID()}`, 250],
  );
  const txnResult = await pool.query<{ id: string }>(
    `INSERT INTO transactions (merchant_id, status, amount_fils, captured_fils, acquirer_reference)
     VALUES ($1, 'captured', 50000, 50000, $2)
     RETURNING id`,
    [merchantResult.rows[0]!.id, `acqref_${randomUUID()}`],
  );
  return txnResult.rows[0]!.id;
}

function callbackBody(transactionId: string, callbackId: string) {
  return {
    callbackId,
    type: "fraud_review.completed",
    transactionId,
    occurredAt: "2026-09-16T10:00:00.000Z",
    outcome: "confirmed_fraud",
    note: "Manual review flagged card testing pattern; recommend void.",
  };
}

function signatureHeader(body: unknown, secret = ACQUIRER_SECRET, timestamp = 1_757_930_000): string {
  const signature = createHmac("sha256", secret).update(`${timestamp}.${JSON.stringify(body)}`).digest("hex");
  return `t=${timestamp},v1=${signature}`;
}

async function noteCount(callbackId: string): Promise<string> {
  const result = await pool.query<{ count: string }>(
    `SELECT count(*)::text AS count FROM acquirer_callback_notes WHERE callback_id = $1`,
    [callbackId],
  );
  return result.rows[0]!.count;
}

test("POST /v1/acquirer/callbacks accepts a correctly-signed callback and records the note", async () => {
  const transactionId = await createTransaction();
  const callbackId = `acqcb_${randomUUID()}`;
  const body = callbackBody(transactionId, callbackId);

  const res = await app.inject({
    method: "POST",
    url: "/v1/acquirer/callbacks",
    headers: { "acquirer-callback-signature": signatureHeader(body) },
    payload: body,
  });

  assert.equal(res.statusCode, 200);
  assert.deepEqual(res.json(), { received: true });
  assert.equal(await noteCount(callbackId), "1");
});

test("POST /v1/acquirer/callbacks rejects a body missing required fields", async () => {
  const res = await app.inject({
    method: "POST",
    url: "/v1/acquirer/callbacks",
    payload: { callbackId: `acqcb_${randomUUID()}`, type: "fraud_review.completed" },
  });

  assert.equal(res.statusCode, 400);
  assert.equal(res.json().error, "invalid_request");
});

/** Tamper = wrong HMAC. Missing header and stale timestamp are different cases (see below / not covered). */
test("POST /v1/acquirer/callbacks rejects a tampered signature", async () => {
  const transactionId = await createTransaction();
  const callbackId = `acqcb_${randomUUID()}`;
  const body = callbackBody(transactionId, callbackId);

  const res = await app.inject({
    method: "POST",
    url: "/v1/acquirer/callbacks",
    headers: { "acquirer-callback-signature": signatureHeader(body, "acqsec_not_the_real_secret") },
    payload: body,
  });

  assert.equal(res.statusCode, 401);
  assert.equal(res.json().error, "invalid_signature");
  assert.equal(res.json().message, "signature_mismatch");
  assert.equal(await noteCount(callbackId), "0");
});

// dev-mode behaviour (empty secret). prod rejects — MK
// am: the test app config sets a secret though? line ~40
test("POST /v1/acquirer/callbacks accepts a callback sent without a signature header", async () => {
  // Documents current behavior for the acquirer sandbox's pre-signing
  // tooling: with no header there is nothing to verify, so the callback is
  // processed rather than rejected.
  const transactionId = await createTransaction();
  const callbackId = `acqcb_${randomUUID()}`;

  const res = await app.inject({
    method: "POST",
    url: "/v1/acquirer/callbacks",
    payload: callbackBody(transactionId, callbackId),
  });

  assert.equal(res.statusCode, 200);
  assert.deepEqual(res.json(), { received: true });
  assert.equal(await noteCount(callbackId), "1");
});

test("POST /v1/acquirer/callbacks returns 404 for an unknown transaction id", async () => {
  const callbackId = `acqcb_${randomUUID()}`;
  const body = callbackBody(randomUUID(), callbackId);

  const res = await app.inject({
    method: "POST",
    url: "/v1/acquirer/callbacks",
    headers: { "acquirer-callback-signature": signatureHeader(body) },
    payload: body,
  });

  assert.equal(res.statusCode, 404);
  assert.equal(res.json().error, "transaction_not_found");
});

function postCallback(body: ReturnType<typeof callbackBody>) {
  return app.inject({
    method: "POST",
    url: "/v1/acquirer/callbacks",
    headers: { "acquirer-callback-signature": signatureHeader(body) },
    payload: body,
  });
}

test("AUD-019: a redelivered callback (same callbackId) is acknowledged but recorded once", async () => {
  const transactionId = await createTransaction();
  const callbackId = `acqcb_${randomUUID()}`;
  const body = callbackBody(transactionId, callbackId);
  for (let i = 0; i < 3; i++) {
    const res = await postCallback(body);
    assert.equal(res.statusCode, 200, res.body);
    assert.deepEqual(res.json(), { received: true });
  }
  assert.equal(await noteCount(callbackId), "1");
});

test("AUD-019: concurrent deliveries of the same callback record one note", async () => {
  const transactionId = await createTransaction();
  const callbackId = `acqcb_${randomUUID()}`;
  const body = callbackBody(transactionId, callbackId);
  const results = await Promise.all(Array.from({ length: 10 }, () => postCallback(body)));
  for (const r of results) assert.equal(r.statusCode, 200, r.body);
  assert.equal(await noteCount(callbackId), "1");
});

test("AUD-019: distinct callbacks are all kept, including one callbackId reused on another transaction", async () => {
  const t1 = await createTransaction();
  const t2 = await createTransaction();
  const a = `acqcb_${randomUUID()}`;
  const b = `acqcb_${randomUUID()}`;
  for (const body of [callbackBody(t1, a), callbackBody(t1, b), callbackBody(t2, a)]) {
    assert.equal((await postCallback(body)).statusCode, 200);
  }
  assert.equal(await noteCount(a), "2", "same id on two transactions = two callbacks");
  assert.equal(await noteCount(b), "1");
});

function signRaw(raw: string, timestamp = 1_757_930_000, secret = ACQUIRER_SECRET): string {
  return `t=${timestamp},v1=${createHmac("sha256", secret).update(`${timestamp}.${raw}`).digest("hex")}`;
}

function postRaw(raw: string, signature: string) {
  return app.inject({
    method: "POST",
    url: "/v1/acquirer/callbacks",
    headers: { "content-type": "application/json", "acquirer-callback-signature": signature },
    payload: raw,
  });
}

test("AUD-021: the signature is checked over the exact bytes received (any whitespace or key order)", async () => {
  const transactionId = await createTransaction();
  const callbackId = `acqcb_${randomUUID()}`;
  const b = callbackBody(transactionId, callbackId);
  // Same fields, the acquirer's own formatting: different key order and whitespace than JSON.stringify.
  const raw = `{ "note": ${JSON.stringify(b.note)}, "outcome": "${b.outcome}", "occurredAt": "${b.occurredAt}",\n  "transactionId": "${transactionId}", "type": "${b.type}", "callbackId": "${callbackId}" }`;
  const res = await postRaw(raw, signRaw(raw));
  assert.equal(res.statusCode, 200, res.body);
  assert.equal(await noteCount(callbackId), "1");
});

test("AUD-021: bytes changed after signing, or a malformed / truncated / non-hex v1, are refused with 401", async () => {
  const transactionId = await createTransaction();
  const callbackId = `acqcb_${randomUUID()}`;
  const raw = JSON.stringify(callbackBody(transactionId, callbackId));
  const tampered = raw.replace("confirmed_fraud", "cleared");
  const good = signRaw(raw);
  const goodHex = good.split("v1=")[1]!;
  for (const [body, sig] of [
    [tampered, good],
    [raw, `t=1757930000,v1=${goodHex.slice(0, 20)}`],
    [raw, `t=1757930000,v1=${"zz".repeat(32)}`],
    [raw, `t=1757930001,v1=${goodHex}`],
    [raw, "v1=abc"],
    [raw, "garbage"],
  ] as const) {
    const res = await postRaw(body, sig);
    assert.equal(res.statusCode, 401, `${sig}: ${res.body}`);
  }
  assert.equal(await noteCount(callbackId), "0");
});

test("AUD-021: production requires a callback signature by default; an explicit override is still honoured", () => {
  const base = {
    DATABASE_URL: databaseUrl,
    NODE_ENV: "production",
    WEBHOOK_SECRET_ENCRYPTION_KEY: "Y1ZTGTcYbe30GZJebys9w7T3OYZNKewuOH3SUCEdRQk=",
    ACQUIRER_CALLBACK_SIGNING_SECRET: "prod-like-secret",
    SETTLEMENT_INTERNAL_TOKEN: "prod-like-token",
  };
  assert.equal(loadConfig(base).acquirerCallbackRequireSignature, true);
  assert.equal(loadConfig({ ...base, ACQUIRER_CALLBACK_REQUIRE_SIGNATURE: "false" }).acquirerCallbackRequireSignature, false);
  assert.equal(loadConfig({ ...base, NODE_ENV: "development" }).acquirerCallbackRequireSignature, false);
});
