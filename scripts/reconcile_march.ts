#!/usr/bin/env -S npx tsx
/**
 * One-off March 2026 reconciliation sweep. Finance wants the scheme
 * rounding residue (the gap between what gets journaled at capture and
 * what the scheme export can actually carry at 2 decimal places) written
 * off for March before the books close on it.
 *
 * SAFETY (AUD-013): by default this is a DRY RUN and posts nothing. `--apply` posts, and is idempotent:
 * a merchant already swept (a ledger leg with SWEEP_DESCRIPTION exists) is skipped, and an advisory lock
 * serialises concurrent runs, so running it twice no longer doubles the correction (it did, on staging).
 * DO NOT apply it to production before finance confirms the accounting: it debits merchant_payable, while
 * ADR-0002 books residue between card_scheme_clearing and scheme_rounding_residue and leaves merchants alone.
 *
 * Usage: DATABASE_URL=postgres://... npx tsx scripts/reconcile_march.ts            (dry run)
 *        DATABASE_URL=postgres://... npx tsx scripts/reconcile_march.ts --apply    (post, once)
 */
import { randomUUID } from "node:crypto";
import { pathToFileURL } from "node:url";
import { Client } from "pg";
import { formatBhd, toFils } from "@filspay/money";

export function monthBounds(year: number, month: number): { start: Date; end: Date } {
  return { start: new Date(Date.UTC(year, month - 1, 1)), end: new Date(Date.UTC(year, month, 1)) };
}

export interface ResidueRow {
  merchantId: string;
  capturedFils: number;
}

/** The fils truncated away when a captured amount is quantized down to the
 *  scheme export's 2-decimal-place granularity. */
// MK: % 10 on a non-negative int. correct.
export function computeResidueFils(capturedFils: number): number {
  return capturedFils % 10;
}

interface MerchantResidue {
  merchantId: string;
  lineCount: number;
  residueFils: number;
}

async function fetchResidueRows(client: Client, year: number, month: number): Promise<ResidueRow[]> {
  const { start, end } = monthBounds(year, month);
  const result = await client.query<{ merchant_id: string; captured_fils: string }>(
    `SELECT merchant_id, captured_fils
       FROM transactions
      WHERE captured_fils > 0
        AND captured_fils % 10 <> 0
        AND occurred_at >= $1 AND occurred_at < $2
      ORDER BY merchant_id, occurred_at`,
    [start.toISOString(), end.toISOString()],
  );
  return result.rows.map((r) => ({ merchantId: r.merchant_id, capturedFils: Number(r.captured_fils) }));
}

/**
 * One correction group per merchant. lineCount is the number of transactions
 * with a non-zero residue, not the number of scheme lines.
 */
function groupByMerchant(rows: ResidueRow[]): MerchantResidue[] {
  const byMerchant = new Map<string, MerchantResidue>();
  for (const row of rows) {
    const residue = computeResidueFils(row.capturedFils);
    const existing = byMerchant.get(row.merchantId);
    if (existing) {
      existing.lineCount += 1;
      existing.residueFils += residue;
    } else {
      byMerchant.set(row.merchantId, { merchantId: row.merchantId, lineCount: 1, residueFils: residue });
    }
  }
  return [...byMerchant.values()];
}

/** Marks the legs this script posts; also the idempotency key (with the merchant). */
export const SWEEP_DESCRIPTION = "March 2026 scheme rounding residue sweep — manual recon per finance";

async function alreadySwept(client: Client, merchantId: string): Promise<boolean> {
  const result = await client.query(
    `SELECT 1 FROM ledger_entries WHERE merchant_id = $1 AND description = $2 AND account_id = 'scheme_rounding_residue' LIMIT 1`,
    [merchantId, SWEEP_DESCRIPTION],
  );
  return (result.rowCount ?? 0) > 0;
}

// Idempotency is enforced by alreadySwept() inside the locked transaction in main(), NOT by entry_group_id
// (that is a fresh random uuid per call, so the old comment claiming it dedupes reruns was false).
async function postResidueCorrection(client: Client, merchant: MerchantResidue, now: Date): Promise<void> {
  if (merchant.residueFils <= 0) return;
  const entryGroupId = randomUUID();
  const description = SWEEP_DESCRIPTION;
  await client.query(
    `INSERT INTO ledger_entries (entry_group_id, merchant_id, account_id, direction, amount_fils, occurred_at, description)
     VALUES ($1, $2, 'merchant_payable', 'debit', $3, $4, $5),
            ($1, $2, 'scheme_rounding_residue', 'credit', $3, $4, $5)`,
    [entryGroupId, merchant.merchantId, merchant.residueFils, now.toISOString(), description],
  );
}

async function main(): Promise<void> {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    throw new Error("reconcile_march: DATABASE_URL environment variable is not set");
  }

  const client = new Client({ connectionString: databaseUrl });
  await client.connect();
  // FH: the log says 'run at ...+03:00' but toISOString is always Z?? MK: different node version
  const now = new Date();

  try {
    const rows = await fetchResidueRows(client, 2026, 3);
    const merchantResidues = groupByMerchant(rows);
    const totalResidueFils = merchantResidues.reduce((sum, m) => sum + m.residueFils, 0);

    const { start, end } = monthBounds(2026, 3);
    console.log("=== March 2026 reconciliation sweep ===");
    console.log(`run at: ${now.toISOString()}`);
    console.log(`window: ${start.toISOString().slice(0, 10)} .. ${end.toISOString().slice(0, 10)}`);
    console.log("");

    const apply = process.argv.includes("--apply");
    let sweptFils = 0;
    if (!apply) {
      for (const merchant of merchantResidues) {
        console.log(
          `merchant ${merchant.merchantId}: ${merchant.lineCount} line(s), residue ${formatBhd(toFils(merchant.residueFils))} BD (${merchant.residueFils} fils) [dry run]`,
        );
      }
      console.log("");
      console.log("DRY RUN: nothing was posted. Re-run with --apply to post (idempotent; see the safety note in this file).");
    } else {
      await client.query("BEGIN");
      try {
        await client.query("SELECT pg_advisory_xact_lock(hashtext('reconcile_march_2026'))");
        for (const merchant of merchantResidues) {
          if (await alreadySwept(client, merchant.merchantId)) {
            console.log(`merchant ${merchant.merchantId}: already swept, skipped`);
            continue;
          }
          await postResidueCorrection(client, merchant, now);
          sweptFils += merchant.residueFils;
          console.log(
            `merchant ${merchant.merchantId}: ${merchant.lineCount} line(s), residue ${formatBhd(toFils(merchant.residueFils))} BD (${merchant.residueFils} fils)`,
          );
        }
        await client.query("COMMIT");
      } catch (err) {
        await client.query("ROLLBACK");
        throw err;
      }
    }

    console.log("---");
    console.log(`total lines matched: ${rows.length}`);
    console.log(`total residue found: ${formatBhd(toFils(totalResidueFils))} BD (${totalResidueFils} fils)`);
    if (apply) {
      console.log(`total residue posted by this run: ${formatBhd(toFils(sweptFils))} BD (${sweptFils} fils)`);
      console.log("");
      console.log("reconciliation applied successfully");
    }
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
