/**
 * AUD-058 (new, adjacent-path pass): the batch-closed "rollup parity check" is
 * meant to WARN when reporting's daily rollup lags real captures. When the
 * rollup row is missing entirely (captures recorded without a consumed outbox
 * event: seed, scripts, repairs), it dereferenced undefined and threw, which
 * rolls back the whole reporting pass every time and stops reporting for all
 * merchants.
 */
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { test } from "node:test";
import { Pool } from "pg";
import { applyEvent } from "./applyEvent.js";

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) throw new Error("batchClosedParity.test.ts requires DATABASE_URL to point at a real, migrated Postgres");
const pool = new Pool({ connectionString: databaseUrl, max: 2 });
test.after(async () => {
  await pool.end();
});

test("AUD-058: a batch close for a day with captures but no rollup row warns instead of failing the pass", async () => {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const m = await client.query<{ id: string }>(`INSERT INTO merchants (display_name, mdr_bps) VALUES ($1, 250) RETURNING id`, [
      `Parity ${randomUUID()}`,
    ]);
    const merchantId = m.rows[0]!.id;
    const t = await client.query<{ id: string }>(
      `INSERT INTO transactions (merchant_id, status, amount_fils, captured_fils, acquirer_reference)
       VALUES ($1, 'captured', 5000, 5000, $2) RETURNING id`,
      [merchantId, `acqref_${randomUUID()}`],
    );
    await client.query(
      `INSERT INTO transaction_events (transaction_id, event_type, amount_fils, actor_type, occurred_at)
       VALUES ($1, 'captured', 5000, 'system', '2026-04-10T09:00:00Z')`,
      [t.rows[0]!.id],
    );
    const b = await client.query<{ id: string }>(
      `INSERT INTO settlement_batches (merchant_id, batch_date, status, gross_fils, fee_fils, net_payout_fils)
       VALUES ($1, '2026-04-10', 'closed', 5000, 125, 4875) RETURNING id`,
      [merchantId],
    );
    const warnings: string[] = [];
    const original = console.warn;
    console.warn = (msg: unknown) => void warnings.push(String(msg));
    try {
      await applyEvent(client, {
        id: "1",
        event_type: "settlement.batch_closed",
        aggregate_id: b.rows[0]!.id,
        payload: { merchantId, batchId: b.rows[0]!.id, batchDate: "2026-04-10", grossFils: 5000, feeFils: 125, netPayoutFils: 4875 },
        created_at: new Date("2026-04-10T21:05:00Z"),
      });
    } finally {
      console.warn = original;
    }
    assert.ok(warnings.some((w) => w.includes("rollup lags ground truth") && w.includes("rollup=0")), warnings.join("\n"));
    const trend = await client.query(`SELECT 1 FROM merchant_payout_trends WHERE settlement_batch_id = $1`, [b.rows[0]!.id]);
    assert.equal(trend.rowCount, 1, "the payout trend row is still written");
  } finally {
    await client.query("ROLLBACK");
    client.release();
  }
});
