#!/usr/bin/env -S npx tsx
/**
 * Nightly janitor: a hold that's never captured or released just sits in
 * the table past its expires_at as 'active' forever — capture.ts/void.ts
 * release one, nothing else sweeps one. Run once a night from cron/the
 * host's own scheduler.
 *
 * Marks holds that are still 'active' and past expires_at as 'expired'.
 * Holds are never deleted (HANDOVER, authorize.ts), so their history stays.
 * One atomic UPDATE with the predicate in SQL: no id list to build (an empty
 * list used to degrade into an unconditional DELETE, AUD-011) and no window
 * between selecting and writing in which a hold can be captured.
 *
 * Usage: DATABASE_URL=postgres://... npx tsx scripts/expire_holds.ts
 */
import { pathToFileURL } from "node:url";
import { Client } from "pg";

export const EXPIRE_HOLDS_SQL = `UPDATE holds
    SET status = 'expired'
  WHERE status = 'active' AND expires_at < now()
  RETURNING id`;

/** Returns how many holds were marked expired. */
export async function expireHolds(client: Client): Promise<number> {
  const result = await client.query(EXPIRE_HOLDS_SQL);
  return result.rowCount ?? 0;
}

async function main(): Promise<void> {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    throw new Error("expire_holds: DATABASE_URL environment variable is not set");
  }

  const client = new Client({ connectionString: databaseUrl });
  await client.connect();
  try {
    const expired = await expireHolds(client);
    console.log(`expire_holds: marked ${expired} abandoned hold(s) expired`);
  } finally {
    await client.end();
  }
}

const isMainModule = process.argv[1] !== undefined && import.meta.url === pathToFileURL(process.argv[1]).href;
if (isMainModule) {
  main().catch((err: unknown) => {
    console.error(err);
    process.exitCode = 1;
  });
}
