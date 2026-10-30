import { useCallback, useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import {
  Alert,
  Button,
  Card,
  ConfirmDialog,
  DetailList,
  EmptyState,
  Field,
  IdText,
  Loading,
  PageHeader,
  buttonClass,
  humanize,
} from "@filspay/ui";
import {
  captureTransaction,
  getTransaction,
  getTransactionEvents,
  voidTransaction,
} from "../../api/transactions.js";
import { ApiError, describeError } from "../../api/client.js";
import { RequireRole } from "../../auth/RequireRole.js";
import { Money } from "../../components/Money.js";
import { StatusBadge } from "../../components/StatusBadge.js";
import { bhd, dash, dateTime } from "../../format.js";
import { transactionStatus } from "../../status.js";
import type { TransactionDto, TransactionEventDto } from "../../types.js";
import { RefundDrawer } from "./RefundDrawer.js";
import { useAttemptKey } from "./useAttemptKey.js";

type LoadState =
  | { kind: "loading" }
  | { kind: "not_found" }
  | { kind: "error"; message: string }
  | { kind: "loaded"; txn: TransactionDto };

/** Whole positive fils typed into the capture box, for the live BHD preview
 *  only — the request still sends exactly what was typed, as before. */
function previewFils(value: string): number | null {
  const trimmed = value.trim();
  if (!/^\d+$/.test(trimmed)) return null;
  const n = Number(trimmed);
  return Number.isSafeInteger(n) && n > 0 ? n : null;
}

const backLink = (
  <Link className="fp-back-link" to="/dashboard/transactions">
    ← Transactions
  </Link>
);

/**
 * `GET /v1/transactions/:id` plus its event timeline on the same page — one
 * feature, so one view, not two navigable routes.
 *
 * A `404` renders a plain "not found" state and never tries to distinguish
 * "doesn't exist" from "not yours": the API deliberately answers the same way
 * for both (a `403` would confirm a foreign transaction's existence), and
 * this page does not undo that by guessing.
 */
// MK: timeline renders refund events fine
export function TransactionDetailPage() {
  const { id } = useParams<{ id: string }>();
  const [state, setState] = useState<LoadState>({ kind: "loading" });
  const [events, setEvents] = useState<TransactionEventDto[]>([]);
  const [actionError, setActionError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [captureOpen, setCaptureOpen] = useState(false);
  const [captureAmount, setCaptureAmount] = useState("");
  const [confirmVoid, setConfirmVoid] = useState(false);
  const captureAttempt = useAttemptKey(captureAmount);

  const load = useCallback(async () => {
    if (!id) {
      setState({ kind: "not_found" });
      return;
    }
    try {
      // Two independent reads — the events route does its own merchant-scoped
      // existence check, so neither depends on the other's result.
      const [txn, timeline] = await Promise.all([getTransaction(id), getTransactionEvents(id)]);
      setState({ kind: "loaded", txn });
      setEvents(timeline);
    } catch (err) {
      if (err instanceof ApiError && err.statusCode === 404) {
        setState({ kind: "not_found" });
      } else {
        setState({ kind: "error", message: describeError(err) });
      }
    }
  }, [id]);

  useEffect(() => {
    void load();
  }, [load]);

  async function handleCapture(event: React.FormEvent): Promise<void> {
    event.preventDefault();
    if (!id) return;
    setSubmitting(true);
    setActionError(null);
    try {
      const trimmed = captureAmount.trim();
      // Left blank, `amountFils` is omitted entirely and capture.ts captures
      // everything still outstanding — its own documented default. Computing
      // the remainder here would just be a second, staler copy of that rule.
      const input = trimmed === "" ? {} : { amountFils: Number(trimmed) };
      // One Idempotency-Key per capture attempt: a retry of the same amount
      // after an error or a lost response replays instead of capturing again.
      await captureTransaction(id, input, captureAttempt.key);
      captureAttempt.consumed();
      setCaptureOpen(false);
      setCaptureAmount("");
      // Refetch rather than patch: a capture wrote a new transaction_events
      // row server-side, so the timeline is stale, not merely shorter.
      await load();
    } catch (err) {
      setActionError(describeError(err));
    } finally {
      setSubmitting(false);
    }
  }

  /** Only offered while status is authorized. Asked first in a dialog. */
  async function handleVoid(): Promise<void> {
    if (!id) return;
    setSubmitting(true);
    setActionError(null);
    try {
      // An already-voided transaction also answers `200` with the voided row —
      // indistinguishable from a first void on the wire, and correctly so:
      // both mean "now voided".
      await voidTransaction(id);
      setConfirmVoid(false);
      await load();
    } catch (err) {
      setConfirmVoid(false);
      setActionError(describeError(err));
    } finally {
      setSubmitting(false);
    }
  }

  if (state.kind === "loading") {
    return <Loading page>Loading transaction…</Loading>;
  }
  if (state.kind === "not_found") {
    return (
      <>
        <PageHeader back={backLink} title="Transaction not found" />
        <Card>
          <EmptyState
            icon="search"
            title="No transaction with this ID exists on your account"
            action={
              <Link className={buttonClass({ variant: "secondary" })} to="/dashboard/transactions">
                Back to transactions
              </Link>
            }
          />
        </Card>
      </>
    );
  }
  if (state.kind === "error") {
    return (
      <>
        <PageHeader back={backLink} title="Transaction" />
        <Alert
          tone="danger"
          title="Couldn't load this transaction"
          actions={
            <Button size="sm" variant="secondary" icon="replay" onClick={() => void load()}>
              Try again
            </Button>
          }
        >
          {state.message}
        </Alert>
      </>
    );
  }

  const { txn } = state;
  const capturable = txn.status === "authorized" || txn.status === "partially_captured";
  const voidable = txn.status === "authorized";
  const preview = previewFils(captureAmount);

  return (
    <>
      <PageHeader
        back={backLink}
        title={txn.reference ?? "Transaction"}
        documentTitle="Transaction"
        badges={<StatusBadge style={transactionStatus(txn.status)} raw={txn.status} />}
        description={<IdText value={txn.id} copy copyLabel="Copy transaction ID" />}
      />

      <div className="fp-grid-main">
        <div className="fp-stack">
          <Card title="Payment">
            <div className="dash-hero-amount">
              <span className="fp-muted fp-small">Captured</span>
              <Money fils={txn.capturedFils} hero />
              <span className="fp-muted fp-small">
                of <Money fils={txn.amountFils} /> authorized
                {(txn.refundedFils ?? 0) > 0 ? (
                  <>
                    {" · "}
                    <Money fils={txn.refundedFils} /> refunded
                  </>
                ) : null}
              </span>
            </div>
            <DetailList
              items={[
                { term: "Status", detail: <StatusBadge style={transactionStatus(txn.status)} raw={txn.status} /> },
                { term: "Authorized amount", detail: <Money fils={txn.amountFils} /> },
                { term: "Captured amount", detail: <Money fils={txn.capturedFils} /> },
                { term: "Refunded amount", detail: <Money fils={txn.refundedFils ?? 0} /> },
                { term: "Currency", detail: txn.currency },
                { term: "Reference", detail: dash(txn.reference) },
                { term: "Acquirer reference", detail: <IdText value={txn.acquirerReference} copy copyLabel="Copy acquirer reference" /> },
                { term: "Occurred at", detail: dateTime(txn.occurredAt) },
                { term: "Created at", detail: dateTime(txn.createdAt) },
              ]}
            />
          </Card>

          <Card title="Event timeline" subtitle="Oldest first, exactly as recorded.">
            {/* Already ordered oldest-first by the endpoint — never re-sorted
                here, so the page can't disagree with the API about history. */}
            {events.length === 0 ? (
              <EmptyState compact icon="activity" title="No events recorded" />
            ) : (
              <ol className="fp-timeline">
                {events.map((event) => (
                  <li key={event.id} className="fp-timeline__item">
                    <span className="fp-timeline__marker" aria-hidden="true" />
                    <div>
                      <div className="fp-timeline__title">{humanize(event.eventType)}</div>
                      <div className="fp-timeline__meta">
                        {dateTime(event.occurredAt)} · {humanize(event.actorType)}
                      </div>
                      {event.actorId ? (
                        <div className="fp-timeline__meta">
                          <code className="fp-mono">{event.actorId}</code>
                        </div>
                      ) : null}
                    </div>
                    <div className="fp-timeline__amount">
                      {event.amountFils === null ? <span className="fp-muted">—</span> : <Money fils={event.amountFils} />}
                    </div>
                  </li>
                ))}
              </ol>
            )}
          </Card>
        </div>

        {/* Capture, void and refund are hidden from `support`. The API enforces the
            same rule (owner/finance only, AUD-046 / FP-300); this hide only mirrors it. */}
        <div className="fp-stack">
          <RequireRole allow={["owner", "finance"]}>
            {capturable || voidable ? (
              <Card title="Actions" subtitle="Capture settles held funds; void releases them.">
                <div className="fp-stack fp-stack--sm">
                  {actionError ? (
                    <Alert tone="danger" title="That didn't go through" onDismiss={() => setActionError(null)}>
                      {actionError}
                    </Alert>
                  ) : null}

                  {capturable ? (
                    captureOpen ? (
                      <form className="fp-form" onSubmit={(e) => void handleCapture(e)}>
                        <Field
                          label="Amount in fils"
                          optional
                          hint={
                            preview !== null
                              ? `= ${bhd(preview)}. 1,000 fils = 1 BHD.`
                              : "Leave blank to capture everything still outstanding. 1,000 fils = 1 BHD."
                          }
                        >
                          {(props) => (
                            <input
                              {...props}
                              className="fp-input fp-num"
                              type="number"
                              min={1}
                              step={1}
                              inputMode="numeric"
                              value={captureAmount}
                              onChange={(e) => setCaptureAmount(e.target.value)}
                              autoFocus
                            />
                          )}
                        </Field>
                        <div className="fp-form-actions">
                          <Button type="submit" variant="primary" loading={submitting}>
                            {submitting ? "Capturing…" : "Capture"}
                          </Button>
                          <Button variant="ghost" disabled={submitting} onClick={() => setCaptureOpen(false)}>
                            Cancel
                          </Button>
                        </div>
                      </form>
                    ) : (
                      <Button variant="primary" icon="checkCircle" block onClick={() => setCaptureOpen(true)}>
                        Capture
                      </Button>
                    )
                  ) : null}

                  {voidable ? (
                    <Button variant="danger" icon="xCircle" block disabled={submitting} onClick={() => setConfirmVoid(true)}>
                      Void authorization
                    </Button>
                  ) : null}
                </div>
              </Card>
            ) : null}
          </RequireRole>

          <RefundDrawer txn={txn} onRefunded={load} />

          <Card title="Identifiers">
            <DetailList
              items={[
                { term: "Transaction ID", detail: <IdText value={txn.id} copy copyLabel="Copy transaction ID" /> },
                { term: "Merchant ID", detail: <IdText value={txn.merchantId} /> },
              ]}
            />
          </Card>
        </div>
      </div>

      <ConfirmDialog
        open={confirmVoid}
        title="Void this authorization?"
        confirmLabel="Void authorization"
        busyLabel="Voiding…"
        busy={submitting}
        onConfirm={() => void handleVoid()}
        onCancel={() => setConfirmVoid(false)}
      >
        <p>
          The held funds of <Money fils={txn.amountFils} /> are released and cannot be captured
          afterwards.
        </p>
      </ConfirmDialog>
    </>
  );
}
