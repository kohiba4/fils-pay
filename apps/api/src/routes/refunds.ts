import type { FastifyInstance } from "fastify";
import { toFils } from "@filspay/money";
import {
  requireMerchantAuth,
  requireMerchantRole,
  requireMerchantWriterActor,
} from "../auth/requireMerchantAuth.js";
import { UUID_RE } from "../admin/merchants.js";
import { BadRequestError } from "../lib/errors.js";
import { initiateMerchantRefund } from "../refunds/initiateMerchantRefund.js";

interface CreateRefundBody {
  transactionId?: unknown;
  amountFils?: unknown;
  reason?: unknown;
}

const MAX_REASON_LENGTH = 255;

/**
 * Registered with prefix '/v1/refunds'.
 *
 * `POST /` refunds all or part of a captured transaction of the AUTHENTICATED merchant (session or API key); the
 * merchant is never taken from the body. Requires an `Idempotency-Key` header, like capture: a retry with the same key
 * and body replays the first answer and refunds once. Session users need the owner or finance role (a support user and
 * a "view as merchant" operator cannot move money); an API key has full merchant authority, as for capture.
 * Omitting `amountFils` refunds everything still refundable (captured minus already refunded).
 */
export async function refundRoutes(app: FastifyInstance): Promise<void> {
  app.post<{ Body: CreateRefundBody }>(
    "/",
    { preHandler: [requireMerchantAuth, requireMerchantRole("owner", "finance")] },
    async (request, reply) => {
      const header = request.headers["idempotency-key"];
      const idempotencyKey = Array.isArray(header) ? header[0] : header;
      if (!idempotencyKey) {
        throw new BadRequestError("idempotency_key_required", "Idempotency-Key header is required");
      }

      const { transactionId, amountFils, reason } = request.body ?? {};
      if (typeof transactionId !== "string" || !UUID_RE.test(transactionId)) {
        throw new BadRequestError("invalid_request", "transactionId is required and must be a transaction id");
      }
      let amount;
      if (amountFils !== undefined) {
        try {
          amount = toFils(amountFils as number);
        } catch {
          throw new BadRequestError("invalid_request", "amountFils, if given, must be a whole number of fils");
        }
      }
      if (reason !== undefined && (typeof reason !== "string" || reason.trim() === "" || reason.length > MAX_REASON_LENGTH)) {
        throw new BadRequestError("invalid_request", `reason, if given, must be 1-${MAX_REASON_LENGTH} characters`);
      }

      const result = await initiateMerchantRefund(app.db, app.acquirer, {
        merchantId: request.merchantAuth!.merchantId,
        transactionId,
        amountFils: amount,
        idempotencyKey,
        actor: requireMerchantWriterActor(request.merchantAuth!),
        reason: reason === undefined ? undefined : reason.trim(),
      });
      reply.code(result.statusCode).send(result.body);
    },
  );
}
