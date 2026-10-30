/**
 * FP-300 PR 3: the reporting consumer applies refund.succeeded (payload shape
 * from apps/api/src/payments/processRefund.ts) into merchant_daily_volume's
 * refund columns (migration 0083), bucketed by the Bahrain date.
 */
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { test } from "node:test";
import { Pool } from "pg";
import { enqueueEvent } from "@filspay/events";
import { runConsumerPass } from "./runConsumerPass.js";

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) throw new Error("refundRollup.test.ts requires DATABASE_URL to point at a real, migrated Postgres");
const pool = new Pool({ connectionString: databaseUrl, max: 3 });
test.after(async () => {
  await pool.end();
});

test("FP-300: refund.succeeded events roll up into the merchant's daily refund totals, once each", async () => {
  const m = await pool.query<{ id: string }>(`INSERT INTO merchants (display_name, mdr_bps) VALUES ($1, 250) RETURNING id`, [
    `Refund rollup ${randomUUID()}`,
  ]);
  const merchantId = m.rows[0]!.id;
  const txnId = randomUUID();
  for (const amountFils of [3_000, 2_000]) {
    await enqueueEvent(pool, {
      eventType: "refund.succeeded",
      aggregateType: "transaction",
      aggregateId: txnId,
      payload: { merchantId, refundId: randomUUID(), amountFils, feeReversedFils: 75, refundedTotalFils: amountFils, newStatus: "partially_refunded" },
    });
  }
  // Drain everything pending (shared DB), then a second pass must not double count.
  for (let i = 0; i < 50; i++) {
    const { processedCount } = await runConsumerPass(pool, { consumerBatchLimit: 500 });
    if (processedCount === 0) break;
  }
  await runConsumerPass(pool, { consumerBatchLimit: 500 });
  const r = await pool.query<{ n: number; g: string }>(
    `SELECT SUM(refund_count)::int AS n, SUM(refund_gross_fils)::text AS g FROM merchant_daily_volume WHERE merchant_id = $1`,
    [merchantId],
  );
  assert.deepEqual([r.rows[0]!.n, r.rows[0]!.g], [2, "5000"]);
});
