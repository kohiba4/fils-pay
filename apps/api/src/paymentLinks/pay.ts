import type { Pool } from "pg";
import { toFils } from "@filspay/money";
import { authorizeTransaction } from "../payments/authorize.js";
import { captureTransaction } from "../payments/capture.js";
import { voidTransaction } from "../payments/void.js";
import type { AcquirerSimulator, SimulatedCardInput } from "../acquirer/types.js";

export interface PayPaymentLinkInput {
  token: string;
  card: SimulatedCardInput;
  idempotencyKey: string;
  submittedAt?: string;
}

export interface PayPaymentLinkResult {
  statusCode: number;
  body: unknown;
}

/** Returned by the claim UPDATE; merchant_id comes from the link row, never from the request. */
interface ClaimedLinkRow {
  id: string;
  merchant_id: string;
  amount_fils: string | number;
  reference: string | null;
}

interface LinkStatusRow {
  status: string;
  expires_at: Date;
}

/** The instant a pay request is judged against: always the server's clock.
 *  AUD-007 / FP-187: `submittedAt` comes from the public, unauthenticated
 *  request body, so honouring it let anyone pay an expired link by sending an
 *  earlier timestamp. The field is still accepted (old checkouts send it) but
 *  never decides expiry; `status.ts` already used server time. */
export function expiryReferenceTime(_submittedAt?: string): Date {
  return new Date();
}

/**
 * `POST /v1/payment-links/:token/pay` business logic (public,
 * unauthenticated). Calls `authorizeTransaction`
 * then `captureTransaction` directly, in sequence, never issuing an HTTP
 * request back into the API's own /v1/transactions routes.
 *
 * Concurrency: reserve the link with a single
 * atomic conditional UPDATE, release the row lock immediately, run
 * authorize+capture with no lock held on payment_links at all, then
 * finalize with a second atomic conditional UPDATE keyed on still being in
 * the 'reserved' state. A short, configurable reservation timeout
 * self-heals a link stuck 'reserved' by a crash between claim and
 * finalize, with no sweep job.
 *
 * AUD-006: the transaction is tied to the link (`payment_link_id`, migration
 * 0080) and the database allows one non-voided transaction per link. A stale
 * reservation is only taken over when the link has no live transaction: while
 * the previous payer's transaction exists the takeover either waits (capture
 * in flight, row locked), finishes the link (already captured), or voids an
 * abandoned authorization first. Exactly-once is NOT claimed at the acquirer:
 * a request that loses the database race may leave an uncaptured
 * authorization hold on its card until the acquirer releases it.
 */
export async function payPaymentLink(
  pool: Pool,
  acquirer: AcquirerSimulator,
  config: { paymentLinkReservationTimeoutSeconds: number },
  input: PayPaymentLinkInput,
): Promise<PayPaymentLinkResult> {
  const expiryCheckTime = expiryReferenceTime(input.submittedAt);

  // Step 1 — claim. A single UPDATE is already atomic; no explicit
  // transaction needed.
  let claimedRow = await claimLink(pool, input.token, config.paymentLinkReservationTimeoutSeconds, expiryCheckTime);
  if (!claimedRow) {
    // A stale reservation whose transaction is still live is not taken over
    // by the claim. Resolve that transaction, then try the claim once more.
    const recovery = await recoverStaleReservation(pool, input.token, config.paymentLinkReservationTimeoutSeconds);
    if (recovery === "already_paid") {
      return { statusCode: 409, body: { error: "payment_link_already_paid" } };
    }
    if (recovery === "in_flight") {
      return { statusCode: 409, body: { error: "payment_link_processing" } };
    }
    if (recovery === "freed") {
      claimedRow = await claimLink(pool, input.token, config.paymentLinkReservationTimeoutSeconds, expiryCheckTime);
    }
  }
  if (!claimedRow) {
    return classifyClaimFailure(pool, input.token, config.paymentLinkReservationTimeoutSeconds, expiryCheckTime);
  }

  const link = {
    id: claimedRow.id,
    merchantId: claimedRow.merchant_id,
    amountFils: toFils(Number(claimedRow.amount_fils)),
    reference: claimedRow.reference,
  };

  // Step 2 — authorize.
  // am: keys include link.id so two links can never collide on idempotency. good
  const authorizeKey = `paylink:${link.id}:${input.idempotencyKey}:authorize`;
  let authResult;
  try {
    authResult = await authorizeTransaction(pool, acquirer, {
      merchantId: link.merchantId,
      amountFils: link.amountFils,
      card: input.card,
      reference: link.reference ?? undefined,
      idempotencyKey: authorizeKey,
      // No merchant session/API key initiated this — a customer did, via
      // the public link.
      actor: { type: "system" },
      paymentLinkId: link.id,
    });
  } catch (err) {
    if (isUniqueViolation(err, "uq_transactions_one_live_per_payment_link")) {
      // Another request's transaction already pays this link (AUD-006). The
      // reservation is left alone: the other request finalizes the link.
      return { statusCode: 409, body: { error: "payment_link_processing" } };
    }
    throw err;
  }

  if (authResult.statusCode !== 201) {
    await releaseReservation(pool, link.id);
    return {
      statusCode: authResult.statusCode,
      body: { stage: "authorize", ...(authResult.body as Record<string, unknown>) },
    };
  }

  const txnId = (authResult.body as { id: string }).id;

  // NOTE: discountAdjustment is applied by the transactions route only, not here — FH
  // MK: it's applied for both now (moved into capture.ts in July)
  // Step 3 — capture (full amount, immediately). amountFils omitted =>
  // capture the full remaining amount — always correct here, since this
  // transaction was just authorized for exactly link.amountFils and
  // nothing else could have touched it yet.
  const captureKey = `paylink:${link.id}:${input.idempotencyKey}:capture`;
  const captureResult = await captureTransaction(pool, acquirer, {
    transactionId: txnId,
    merchantId: link.merchantId,
    idempotencyKey: captureKey,
    actor: { type: "system", id: link.id },
  });

  if (captureResult.statusCode !== 200) {
    // Void this request's own authorization first: a live 'authorized'
    // transaction would otherwise hold the link (one live payment per link)
    // and leave a 7-day hold that nothing in checkout releases.
    await voidTransaction(pool, { transactionId: txnId, merchantId: link.merchantId, actor: { type: "system", id: link.id } });
    await releaseReservation(pool, link.id);
    return {
      statusCode: captureResult.statusCode,
      body: { stage: "capture", ...(captureResult.body as Record<string, unknown>) },
    };
  }

  // see incident 2026-05-14 — two customers charged on one link. root cause: the claim
  // MK: re-evaluation is exactly what makes it safe. the bug was in the web retry, closed
  // am: was it? FP-198 is still open
  // Step 4 — finalize.
  const finalizeResult = await pool.query<{
    id: string;
    paid_at: Date;
  }>(
    `UPDATE payment_links
        SET status = 'paid', paid_at = now(), transaction_id = $2, reserved_at = NULL
      WHERE id = $1 AND status IN ('reserved', 'active')
      RETURNING id, paid_at`,
    [link.id, txnId],
  );

  const finalized = finalizeResult.rows[0];
  if (!finalized) {
    // This request's transaction is the link's only live payment (index
    // 0080), so 0 rows means the link is already 'paid' by this same
    // transaction (a recovering request finished it) or it was canceled
    // while the capture ran. Only the first is a success.
    const current = await pool.query<{ status: string; transaction_id: string | null; paid_at: Date | null }>(
      `SELECT status, transaction_id, paid_at FROM payment_links WHERE id = $1`,
      [link.id],
    );
    const row = current.rows[0];
    if (row?.status === "paid" && row.transaction_id === txnId) {
      return {
        statusCode: 200,
        body: { status: "paid", transactionId: txnId, amountFils: link.amountFils, paidAt: row.paid_at!.toISOString() },
      };
    }
    console.error(
      `payPaymentLink: captured transaction ${txnId} could not be recorded on link ${link.id} ` +
        `(link status ${row?.status ?? "missing"}); needs manual review`,
    );
    return {
      statusCode: 409,
      body: { error: "payment_link_not_payable", status: row?.status ?? null, transactionId: txnId, needsReview: true },
    };
  }

  return {
    statusCode: 200,
    body: {
      status: "paid",
      transactionId: txnId,
      amountFils: link.amountFils,
      paidAt: finalized.paid_at.toISOString(),
    },
  };
}

/**
 * Used by both decline branches above. Guarded by `status =
 * 'reserved'` for the same reason as the finalize UPDATE: this request
 * only ever releases the reservation it itself holds.
 */
async function releaseReservation(pool: Pool, linkId: string): Promise<void> {
  await pool.query(`UPDATE payment_links SET status = 'active', reserved_at = NULL WHERE id = $1 AND status = 'reserved'`, [
    linkId,
  ]);
}

/** The atomic claim. A stale reservation is taken over only when the link has
 *  no live (non-voided) transaction — see recoverStaleReservation (AUD-006). */
async function claimLink(
  pool: Pool,
  token: string,
  reservationTimeoutSeconds: number,
  expiryCheckTime: Date,
): Promise<ClaimedLinkRow | undefined> {
  const claimResult = await pool.query<ClaimedLinkRow>(
    `UPDATE payment_links pl
        SET status = 'reserved', reserved_at = now()
      WHERE pl.token = $1
        AND (
             pl.status = 'active'
             OR (pl.status = 'reserved'
                 AND pl.reserved_at < now() - ($2 || ' seconds')::interval
                 AND NOT EXISTS (SELECT 1 FROM transactions t
                                  WHERE t.payment_link_id = pl.id AND t.status <> 'voided'))
            )
        AND pl.expires_at > $3
      RETURNING pl.id, pl.merchant_id, pl.amount_fils, pl.reference`,
    [token, reservationTimeoutSeconds, expiryCheckTime],
  );
  return claimResult.rows[0];
}

type RecoveryOutcome = "not_applicable" | "in_flight" | "already_paid" | "freed";

/**
 * A stale reservation still has a live transaction (AUD-006). Decide from
 * that transaction, never from the clock alone:
 * - row locked: a capture holds it right now (capture.ts locks the row across
 *   the acquirer call) → the previous payer is still paying: "in_flight".
 * - captured: the previous payer paid but crashed before finalize → record it
 *   on the link: "already_paid". No second charge.
 * - authorized and unlocked: abandoned before capture → void it ("freed").
 *   If a capture grabs the row in between, void waits for it, finds the row
 *   captured and refuses, and the next attempt sees "already_paid".
 */
async function recoverStaleReservation(
  pool: Pool,
  token: string,
  reservationTimeoutSeconds: number,
): Promise<RecoveryOutcome> {
  const client = await pool.connect();
  let live: { link_id: string; merchant_id: string; txn_id: string; status: string; captured_fils: string } | undefined;
  let locked = false;
  try {
    await client.query("BEGIN");
    const linkRow = await client.query<{ id: string; merchant_id: string }>(
      `SELECT id, merchant_id FROM payment_links
        WHERE token = $1 AND status = 'reserved'
          AND reserved_at < now() - ($2 || ' seconds')::interval`,
      [token, reservationTimeoutSeconds],
    );
    const link = linkRow.rows[0];
    if (!link) {
      await client.query("ROLLBACK");
      return "not_applicable";
    }
    const exists = await client.query<{ n: number }>(
      `SELECT count(*)::int AS n FROM transactions WHERE payment_link_id = $1 AND status <> 'voided'`,
      [link.id],
    );
    const probe = await client.query<{ id: string; status: string; captured_fils: string }>(
      `SELECT id, status, captured_fils::text FROM transactions
        WHERE payment_link_id = $1 AND status <> 'voided'
        FOR UPDATE SKIP LOCKED`,
      [link.id],
    );
    await client.query("ROLLBACK");
    if ((exists.rows[0]?.n ?? 0) === 0) return "not_applicable";
    const row = probe.rows[0];
    if (!row) {
      locked = true;
    } else {
      live = { link_id: link.id, merchant_id: link.merchant_id, txn_id: row.id, status: row.status, captured_fils: row.captured_fils };
    }
  } catch (err) {
    await client.query("ROLLBACK").catch(() => undefined);
    throw err;
  } finally {
    client.release();
  }
  if (locked || !live) return "in_flight";

  if (BigInt(live.captured_fils) > 0n) {
    await pool.query(
      `UPDATE payment_links SET status = 'paid', paid_at = now(), transaction_id = $2, reserved_at = NULL
        WHERE id = $1 AND status = 'reserved'`,
      [live.link_id, live.txn_id],
    );
    return "already_paid";
  }
  const voided = await voidTransaction(pool, {
    transactionId: live.txn_id,
    merchantId: live.merchant_id,
    actor: { type: "system", id: live.link_id },
  });
  return voided.statusCode === 200 ? "freed" : "in_flight";
}

function isUniqueViolation(err: unknown, constraint: string): boolean {
  return (
    typeof err === "object" &&
    err !== null &&
    (err as { code?: unknown }).code === "23505" &&
    (err as { constraint?: unknown }).constraint === constraint
  );
}

/**
 * The claim UPDATE matched 0 rows. This second read carries no race risk —
 * nothing further is decided from it, it only explains a decision already
 * made by the failed UPDATE.
 */
// FH: "This second read carries no race risk" — Claude disagrees, says we should SELECT
// ... FOR UPDATE here. TODO
// am: its only for the error message. ignore
async function classifyClaimFailure(
  pool: Pool,
  token: string,
  reservationTimeoutSeconds: number,
  expiryCheckTime: Date,
): Promise<PayPaymentLinkResult> {
  const result = await pool.query<LinkStatusRow>(`SELECT status, expires_at FROM payment_links WHERE token = $1`, [
    token,
  ]);
  const row = result.rows[0];

  if (!row) {
    return { statusCode: 404, body: { error: "payment_link_not_found" } };
  }
  if (row.status === "paid") {
    return { statusCode: 409, body: { error: "payment_link_already_paid" } };
  }
  if (row.status === "canceled") {
    return { statusCode: 409, body: { error: "payment_link_canceled" } };
  }
  if (row.status === "active" && row.expires_at.getTime() <= expiryCheckTime.getTime()) {
    return { statusCode: 410, body: { error: "payment_link_expired" } };
  }
  if (row.status === "reserved") {
    // A concurrent claim attempt raced us and won between our own UPDATE's
    // failure and this SELECT. It's still within the timeout (if it
    // weren't, our claim UPDATE would have matched it) — reachable only in
    // a genuine race, not a stale read.
    return { statusCode: 409, body: { error: "payment_link_processing" } };
  }
  // Defensive fallback, should be unreachable given the claim UPDATE's
  // WHERE clause exactly mirrors these cases.
  return { statusCode: 409, body: { error: "payment_link_not_payable", status: row.status } };
}
