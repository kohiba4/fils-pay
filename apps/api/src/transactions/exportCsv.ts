import type { Pool } from "pg";
import { formatBhd, toFils } from "@filspay/money";
import type { TransactionRow } from "./serialize.js";

export interface TransactionsExportFilters {
  merchantId: string;
  from?: Date;
  to?: Date;
  status?: string[];
}

function csvEscape(value: string): string {
  if (value.includes(",") || value.includes('"') || value.includes("\n")) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}

function toCsvRow(row: TransactionRow): string {
  return [
    row.id,
    row.status,
    formatBhd(toFils(Number(row.amount_fils))),
    formatBhd(toFils(Number(row.captured_fils))),
    csvEscape(row.reference ?? ""),
    row.occurred_at.toISOString(),
  ].join(",");
}

/** Builds the CSV body for `GET /v1/transactions/export`. */
const HEADER = "id,status,amount_bhd,captured_bhd,reference,occurred_at";
/** Rows fetched per keyset page; bounds memory per page, not per export. */
export const EXPORT_PAGE_SIZE = 1000;

/**
 * AUD-042: the export streams in keyset pages ordered by (occurred_at, id)
 * instead of loading every matching row, a line array and the joined string
 * at once (300k rows peaked at ~476 MB RSS against a 512 MB container).
 * Output is byte-identical: header, then "\n" + one line per row, no trailing
 * newline. Each page is its own short query, so an abandoned download holds
 * no connection or cursor: the consumer simply stops pulling.
 */
export async function* iterateTransactionsExportCsv(
  pool: Pool,
  filters: TransactionsExportFilters,
): AsyncGenerator<string> {
  const statusArray = filters.status && filters.status.length > 0 ? filters.status : null;
  yield HEADER;
  let cursor: { occurredAt: string; id: string } | null = null;
  for (;;) {
    const result: { rows: Array<TransactionRow & { occurred_at_cursor: string }> } = await pool.query(
      `SELECT *, occurred_at::text AS occurred_at_cursor FROM transactions
        WHERE merchant_id = $1
          AND ($2::timestamptz IS NULL OR occurred_at >= $2)
          AND ($3::timestamptz IS NULL OR occurred_at <  $3)
          AND ($4::text[] IS NULL OR status = ANY($4))
          AND ($5::timestamptz IS NULL OR (occurred_at, id) > ($5::timestamptz, $6::uuid))
        ORDER BY occurred_at ASC, id ASC
        LIMIT $7`,
      [filters.merchantId, filters.from ?? null, filters.to ?? null, statusArray, cursor?.occurredAt ?? null, cursor?.id ?? null, EXPORT_PAGE_SIZE],
    );
    let chunk = "";
    for (const row of result.rows) chunk += "\n" + toCsvRow(row);
    if (chunk) yield chunk;
    if (result.rows.length < EXPORT_PAGE_SIZE) return;
    const last = result.rows[result.rows.length - 1]!;
    cursor = { occurredAt: last.occurred_at_cursor, id: last.id };
  }
}

/** Whole export as one string (kept for callers/tests that want it). */
export async function buildTransactionsExportCsv(
  pool: Pool,
  filters: TransactionsExportFilters,
): Promise<string> {
  let out = "";
  for await (const part of iterateTransactionsExportCsv(pool, filters)) out += part;
  return out;
}
