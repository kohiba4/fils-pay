/**
 * recordPayoutDisbursementEffect writes the operational record of a payout-rail
 * transfer instruction. Requires DATABASE_URL to point at a real, migrated
 * Postgres (run `npm run migrate` first).
 */
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { test } from "node:test";
import { Pool } from "pg";
import { enqueueEvent } from "@filspay/events";
import { loadConfig } from "../config.js";
import { recordPayoutDisbursementEffect } from "./payoutDisbursement.js";
import { createWebhookEndpoint } from "./create.js";
import { runDispatchPass } from "./dispatcher.js";
import { replayWebhookDelivery } from "./replay.js";

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) {
  throw new Error(
    "payoutDisbursement.test.ts requires DATABASE_URL to point at a real, migrated Postgres (run `npm run migrate` first)",
  );
}

const pool = new Pool({ connectionString: databaseUrl, max: 5 });

test.after(async () => {
  await pool.end();
});

async function createPaidBatch(netPayoutFils: number): Promise<string> {
  const merchant = await pool.query<{ id: string }>(
    `INSERT INTO merchants (display_name, mdr_bps) VALUES ($1, $2) RETURNING id`,
    [`Disbursement Test Merchant ${randomUUID()}`, 250],
  );
  const batch = await pool.query<{ id: string }>(
    `INSERT INTO settlement_batches
        (merchant_id, batch_date, status, gross_fils, fee_fils, net_payout_fils, closed_at, paid_at)
     VALUES ($1, current_date, 'paid', $2, 0, $2, now(), now())
     RETURNING id`,
    [merchant.rows[0]!.id, netPayoutFils],
  );
  return batch.rows[0]!.id;
}

// FH: only checks the insert, not who calls it or how often
test("recordPayoutDisbursementEffect inserts one row with the given batch id and amount", async () => {
  const batchId = await createPaidBatch(471_300);

  await recordPayoutDisbursementEffect(pool, batchId, 471_300);

  const result = await pool.query<{ amount_fils: string; disbursement_reference: string }>(
    `SELECT amount_fils, disbursement_reference FROM settlement_payout_disbursements WHERE settlement_batch_id = $1`,
    [batchId],
  );

  assert.equal(result.rows.length, 1);
  assert.equal(Number(result.rows[0]!.amount_fils), 471_300);
  assert.ok(
    result.rows[0]!.disbursement_reference.startsWith("disb_"),
    "expected a generated disbursement reference distinct from the batch id",
  );
  assert.notEqual(result.rows[0]!.disbursement_reference, batchId);
});

const dispatchConfig = loadConfig({
  DATABASE_URL: databaseUrl,
  NODE_ENV: "test",
  WEBHOOK_SECRET_ENCRYPTION_KEY: "Y1ZTGTcYbe30GZJebys9w7T3OYZNKewuOH3SUCEdRQk=",
  WEBHOOK_MAX_ATTEMPTS: "3",
});

async function disbursementCount(batchId: string): Promise<number> {
  const r = await pool.query<{ n: number }>(
    `SELECT count(*)::int AS n FROM settlement_payout_disbursements
      WHERE settlement_batch_id = $1 AND duplicate_of_disbursement_id IS NULL`,
    [batchId],
  );
  return r.rows[0]!.n;
}

test("AUD-018 (B half): the disbursement effect is idempotent per batch, sequentially and concurrently", async () => {
  const batchId = await createPaidBatch(10_000);
  for (let i = 0; i < 3; i++) await recordPayoutDisbursementEffect(pool, batchId, 10_000);
  await Promise.all(Array.from({ length: 5 }, () => recordPayoutDisbursementEffect(pool, batchId, 10_000)));
  assert.equal(await disbursementCount(batchId), 1);
});

test("AUD-018 (B half): one settlement.paid delivered to two endpoints and then replayed records one disbursement", async () => {
  const batchId = await createPaidBatch(25_000);
  const merchant = await pool.query<{ merchant_id: string }>(`SELECT merchant_id FROM settlement_batches WHERE id = $1`, [batchId]);
  const merchantId = merchant.rows[0]!.merchant_id;
  const e1 = await createWebhookEndpoint(pool, dispatchConfig, { merchantId, url: `http://fake.test/a-${randomUUID()}`, createdByType: "merchant_session", createdById: randomUUID() });
  await createWebhookEndpoint(pool, dispatchConfig, { merchantId, url: `http://fake.test/b-${randomUUID()}`, createdByType: "merchant_session", createdById: randomUUID() });
  await enqueueEvent(pool, {
    eventType: "settlement.paid",
    aggregateType: "settlement_batch",
    aggregateId: batchId,
    payload: { merchantId, batchId, batchDate: "2026-10-30", netPayoutFils: 25_000 },
  });
  const ok = async () => ({ statusCode: 200, body: "" });
  // Step B is global (100 oldest due rows platform-wide) and this DB is shared
  // with other suites, so pass until this event's own rows have been attempted.
  const drain = async (): Promise<void> => {
    for (let pass = 0; pass < 20; pass++) {
      await runDispatchPass(pool, ok, dispatchConfig);
      const pending = await pool.query<{ n: number }>(
        `SELECT count(*)::int AS n FROM webhook_deliveries wd JOIN webhook_endpoints we ON we.id = wd.endpoint_id
          WHERE we.merchant_id = $1 AND wd.status = 'pending'`,
        [merchantId],
      );
      if (pending.rows[0]!.n === 0) return;
    }
    assert.fail("this merchant's deliveries were never attempted within 20 passes");
  };
  await drain();
  assert.equal(await disbursementCount(batchId), 1, "two endpoints, one disbursement");

  const original = await pool.query<{ id: string }>(
    `SELECT id FROM webhook_deliveries WHERE endpoint_id = $1 AND replay_of_delivery_id IS NULL ORDER BY created_at LIMIT 1`,
    [e1.id],
  );
  await replayWebhookDelivery(pool, { merchantId, endpointId: e1.id, deliveryId: original.rows[0]!.id });
  await drain();
  assert.equal(await disbursementCount(batchId), 1, "a replay does not record a second disbursement");
});
