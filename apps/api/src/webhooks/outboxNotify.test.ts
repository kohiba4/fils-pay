/**
 * Capacity work: a NOTIFY sent from inside the business transaction makes every committing checkout queue behind one
 * database-wide lock for the whole commit (including the disk flush), which capped the platform at ~15 checkouts/s on the
 * 1 vCPU box. The outbox trigger now honours `filspay.outbox_notify = 'off'` (set on the production database; consumers
 * poll instead). Default stays ON so nothing changes anywhere else.
 */
import assert from "node:assert/strict";
import { test } from "node:test";
import { Client } from "pg";

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) throw new Error("outboxNotify.test.ts requires DATABASE_URL to point at a real, migrated Postgres");

async function insertOutboxEventAndCollectNotifications(setting: string | null): Promise<string[]> {
  const listener = new Client({ connectionString: databaseUrl });
  const writer = new Client({ connectionString: databaseUrl });
  await listener.connect();
  await writer.connect();
  const received: string[] = [];
  listener.on("notification", (n) => received.push(n.payload ?? ""));
  try {
    await listener.query("LISTEN outbox_events_channel");
    await writer.query("BEGIN");
    if (setting !== null) await writer.query(`SET LOCAL filspay.outbox_notify = '${setting}'`);
    await writer.query(
      `INSERT INTO outbox_events (event_type, aggregate_type, aggregate_id, payload)
       VALUES ('transaction.captured', 'transaction', gen_random_uuid(), '{}'::jsonb)`,
    );
    await writer.query("COMMIT");
    await new Promise((resolve) => setTimeout(resolve, 300));
    return received;
  } finally {
    await listener.end();
    await writer.end();
  }
}

test("by default the outbox insert still sends a NOTIFY (unchanged behaviour)", async () => {
  const got = await insertOutboxEventAndCollectNotifications(null);
  assert.ok(got.length >= 1, "a notification arrived");
});

test("with filspay.outbox_notify = 'off' no NOTIFY is sent (consumers poll)", async () => {
  const got = await insertOutboxEventAndCollectNotifications("off");
  assert.deepEqual(got, []);
});
