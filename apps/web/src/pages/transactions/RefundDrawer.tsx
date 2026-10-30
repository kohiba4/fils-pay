import { useState } from "react";
import { parseBhdToFils } from "@filspay/money";
import { Alert, Button, Card, ConfirmDialog, Field } from "@filspay/ui";
import { request, describeError } from "../../api/client.js";
import { RequireRole } from "../../auth/RequireRole.js";
import { Money } from "../../components/Money.js";
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
 *
 * Redesign: the browser confirm became the shared ConfirmDialog. Validation
 * still runs before it opens, and the request still runs only on confirm.
 */
export function RefundDrawer({ txn, onRefunded }: RefundDrawerProps) {
  const [open, setOpen] = useState(false);
  const [amount, setAmount] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  /** The validated attempt waiting for confirmation: whole fils, or undefined for "everything left". */
  const [pending, setPending] = useState<{ amountFils: number | undefined } | null>(null);
  const attempt = useAttemptKey(amount);

  const remainingFils = txn.capturedFils - (txn.refundedFils ?? 0);
  const refundable =
    remainingFils > 0 && ["captured", "partially_captured", "partially_refunded"].includes(txn.status);

  function handleReview(event: React.FormEvent): void {
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
    setError(null);
    setPending({ amountFils });
  }

  async function handleRefund(): Promise<void> {
    if (submitting || !pending) return;
    const { amountFils } = pending;
    setSubmitting(true);
    setError(null);
    try {
      await request<RefundResponse>("/v1/refunds", {
        method: "POST",
        headers: { "Idempotency-Key": attempt.key },
        body: JSON.stringify(amountFils === undefined ? { transactionId: txn.id } : { transactionId: txn.id, amountFils }),
      });
      attempt.consumed();
      setPending(null);
      setOpen(false);
      setAmount("");
      await onRefunded();
    } catch (err) {
      setPending(null);
      setError(describeError(err)); // the key is kept: retrying the same amount is safe
    } finally {
      setSubmitting(false);
    }
  }

  if (!refundable) return null;

  return (
    <RequireRole allow={["owner", "finance"]}>
      <Card
        title="Refund"
        tone="caution"
        tag="Moves money"
        subtitle={
          <>
            Still refundable: <Money fils={remainingFils} />
          </>
        }
      >
        <div className="fp-stack fp-stack--sm">
          {error ? (
            <Alert tone="danger" title="The refund didn't go through" onDismiss={() => setError(null)}>
              {error}
            </Alert>
          ) : null}
          {open ? (
            <form className="fp-form" onSubmit={handleReview} noValidate>
              <Field
                label="Amount in BD"
                optional
                hint={
                  <>
                    Leave blank to refund everything still refundable (<Money fils={remainingFils} />).
                  </>
                }
              >
                {(props) => (
                  <input
                    {...props}
                    className="fp-input fp-num"
                    inputMode="decimal"
                    placeholder="0.000"
                    value={amount}
                    onChange={(e) => setAmount(e.target.value)}
                    autoFocus
                  />
                )}
              </Field>
              <div className="fp-form-actions">
                <Button type="submit" variant="danger" icon="replay" disabled={submitting}>
                  Review refund…
                </Button>
                <Button variant="ghost" disabled={submitting} onClick={() => setOpen(false)}>
                  Cancel
                </Button>
              </div>
            </form>
          ) : (
            <Button variant="danger" icon="replay" block onClick={() => setOpen(true)}>
              Refund
            </Button>
          )}
        </div>
      </Card>

      <ConfirmDialog
        open={pending !== null}
        title="Refund this transaction?"
        confirmLabel="Refund"
        busyLabel="Refunding…"
        busy={submitting}
        onConfirm={() => void handleRefund()}
        onCancel={() => setPending(null)}
      >
        <p>
          <strong>
            {pending?.amountFils === undefined ? (
              <>
                Everything still refundable (<Money fils={remainingFils} />)
              </>
            ) : (
              <Money fils={pending.amountFils} />
            )}
          </strong>{" "}
          goes back to the cardholder and cannot be recalled.
        </p>
      </ConfirmDialog>
    </RequireRole>
  );
}
