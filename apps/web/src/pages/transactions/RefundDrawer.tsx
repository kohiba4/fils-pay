import { useState } from "react";
import { parseBhdToFils } from "@filspay/money";
import { request, describeError } from "../../api/client.js";
import { RequireRole } from "../../auth/RequireRole.js";
import { bhd } from "../../format.js";
import type { TransactionDto } from "../../types.js";
import { useAttemptKey } from "./useAttemptKey.js";

interface RefundResponse {
  id: string;
  transactionId: string;
  amountFils: number;
  feeReversedFils: number;
  status: string;
  transactionStatus: string;
  refundedTotalFils: number;
  occurredAt: string;
}

interface RefundDrawerProps {
  txn: TransactionDto;
  onRefunded: () => Promise<void>;
}

/**
 * FP-300 PR 4. Posts to `POST /v1/refunds` (the route that exists; the parked
 * draft posted to /v1/merchants/:id/refunds). One Idempotency-Key per refund
 * attempt, reused when the same amount is retried after an error, so a lost
 * response or a second click cannot refund twice. The amount is entered in BD
 * and parsed to whole fils with the shared money package (ADR-0001). The
 * server enforces the role, the ceiling and the REFUNDS_ENABLED switch; this
 * control only mirrors them.
 */
export function RefundDrawer({ txn, onRefunded }: RefundDrawerProps) {
  const [open, setOpen] = useState(false);
  const [amount, setAmount] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const attempt = useAttemptKey(amount);

  const remainingFils = txn.capturedFils - (txn.refundedFils ?? 0);
  const refundable =
    remainingFils > 0 && ["captured", "partially_captured", "partially_refunded"].includes(txn.status);

  async function handleRefund(event: React.FormEvent): Promise<void> {
    event.preventDefault();
    if (submitting) return;
    const trimmed = amount.trim();
    let amountFils: number | undefined;
    if (trimmed !== "") {
      try {
        amountFils = Number(parseBhdToFils(trimmed));
      } catch {
        setError("Enter the amount in BD, for example 4.750 (at most 3 decimals).");
        return;
      }
      if (amountFils <= 0 || amountFils > remainingFils) {
        setError(`The amount must be between 0.001 BD and ${bhd(remainingFils)}.`);
        return;
      }
    }
    if (!window.confirm("Refund this transaction? The money goes back to the cardholder and cannot be recalled.")) {
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      await request<RefundResponse>("/v1/refunds", {
        method: "POST",
        headers: { "Idempotency-Key": attempt.key },
        body: JSON.stringify(amountFils === undefined ? { transactionId: txn.id } : { transactionId: txn.id, amountFils }),
      });
      attempt.consumed();
      setOpen(false);
      setAmount("");
      await onRefunded();
    } catch (err) {
      setError(describeError(err)); // the key is kept: retrying the same amount is safe
    } finally {
      setSubmitting(false);
    }
  }

  if (!refundable) return null;

  return (
    <RequireRole allow={["owner", "finance"]}>
      <div className="dash-actions">
        {error ? <p className="dash-error" role="alert">{error}</p> : null}
        {open ? (
          <form className="dash-form dash-form-inline" onSubmit={(e) => void handleRefund(e)}>
            <label>
              Amount in BD (blank refunds everything still refundable)
              <input inputMode="decimal" placeholder="0.000" value={amount} onChange={(e) => setAmount(e.target.value)} />
            </label>
            <p className="dash-muted">Still refundable: {bhd(remainingFils)}</p>
            <button type="submit" className="dash-button" disabled={submitting}>
              {submitting ? "Refunding..." : "Refund"}
            </button>
            <button type="button" className="dash-button" disabled={submitting} onClick={() => setOpen(false)}>
              Cancel
            </button>
          </form>
        ) : (
          <button type="button" className="dash-button" onClick={() => setOpen(true)}>
            Refund
          </button>
        )}
      </div>
    </RequireRole>
  );
}
