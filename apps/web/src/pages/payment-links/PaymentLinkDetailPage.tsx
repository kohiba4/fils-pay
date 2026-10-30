import { useCallback, useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import {
  Alert,
  Button,
  Card,
  ConfirmDialog,
  CopyButton,
  DetailList,
  EmptyState,
  IdText,
  Loading,
  PageHeader,
  buttonClass,
  useToast,
} from "@filspay/ui";
import { cancelPaymentLink, listPaymentLinks } from "../../api/paymentLinks.js";
import { describeError } from "../../api/client.js";
import { useDashboardAuth } from "../../auth/DashboardAuthContext.js";
import { RequireRole } from "../../auth/RequireRole.js";
import { Money } from "../../components/Money.js";
import { StatusBadge } from "../../components/StatusBadge.js";
import { bhd, dash, dateTime } from "../../format.js";
import { paymentLinkDisplayStatus, paymentLinkStatus } from "../../status.js";
import type { PaymentLinkDisplayStatus } from "../../status.js";
import type { PaymentLinkDto } from "../../types.js";

/** The list endpoint's own maximum page size. */
const LOOKUP_LIMIT = 100;

type LoadState =
  | { kind: "loading" }
  | { kind: "not_found" }
  | { kind: "error"; message: string }
  | { kind: "loaded"; link: PaymentLinkDto };

const backLink = (
  <Link className="fp-back-link" to="/dashboard/payment-links">
    ← Payment links
  </Link>
);

/** What the customer currently sees at the checkout URL, per state. */
function stateNotice(display: PaymentLinkDisplayStatus, link: PaymentLinkDto) {
  switch (display) {
    case "active":
      return (
        <Alert tone="info" title="Ready to pay">
          Customers can pay this link until {dateTime(link.expiresAt)}.
        </Alert>
      );
    case "reserved":
      return (
        <Alert tone="info" title="Payment in progress">
          A payment attempt is being processed. The link can't be canceled until it finishes or the
          reservation times out.
        </Alert>
      );
    case "paid":
      return (
        <Alert tone="success" title="Paid">
          Paid {dateTime(link.paidAt)}. The link can't be paid again.
        </Alert>
      );
    case "canceled":
      return (
        <Alert tone="neutral" title="Canceled">
          Canceled {dateTime(link.canceledAt)}. Customers see that the link is no longer available.
        </Alert>
      );
    case "expired":
      return (
        <Alert tone="warning" title="Expired">
          Expired {dateTime(link.expiresAt)}. Customers see that the link has expired.
        </Alert>
      );
  }
}

/**
 * There is no merchant-authenticated `GET .../payment-links/:id` — the API
 * has the merchant-scoped *list* and the *public* single-token read, and nothing
 * in between. So this page reads the first page of the unfiltered list
 * (newest-first, capped at the endpoint's own 100-row maximum) and finds the
 * row by id.
 *
 * That is correct for a merchant with a normal number of links and genuinely
 * degrades for one whose direct-linked link has aged past row 100 — it will
 * render "not found" for a link that exists. It is left this way deliberately
 * rather than papered over with cursor-walking loops: the real fix is a
 * one-row backend route (`SELECT * ... WHERE id = $1 AND merchant_id = $2`,
 * 404 on no match).
 */
export function PaymentLinkDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { me } = useDashboardAuth();
  const merchantId = me?.merchant.id;
  const toast = useToast();

  const [state, setState] = useState<LoadState>({ kind: "loading" });
  const [actionError, setActionError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [confirmCancel, setConfirmCancel] = useState(false);

  const load = useCallback(async () => {
    if (!merchantId || !id) return;
    try {
      const result = await listPaymentLinks(merchantId, { limit: LOOKUP_LIMIT });
      const found = result.paymentLinks.find((link) => link.id === id);
      setState(found ? { kind: "loaded", link: found } : { kind: "not_found" });
    } catch (err) {
      setState({ kind: "error", message: describeError(err) });
    }
  }, [merchantId, id]);

  useEffect(() => {
    void load();
  }, [load]);

  async function handleCancel(): Promise<void> {
    if (!merchantId || !id) return;
    setSubmitting(true);
    setActionError(null);
    try {
      await cancelPaymentLink(merchantId, id);
      setConfirmCancel(false);
      toast("Payment link canceled");
      await load();
    } catch (err) {
      // Includes `409 not_cancelable` for a link that is paid, already
      // canceled, or `reserved` mid-payment-attempt.
      setConfirmCancel(false);
      setActionError(describeError(err));
    } finally {
      setSubmitting(false);
    }
  }

  async function handleShare(link: PaymentLinkDto): Promise<void> {
    try {
      await navigator.share({
        title: link.reference ?? "Payment link",
        text: `Payment of ${bhd(link.amountFils)}`,
        url: link.url,
      });
    } catch {
      // Dismissed share sheets reject too; the URL is on screen either way.
    }
  }

  if (state.kind === "loading") return <Loading page>Loading payment link…</Loading>;
  if (state.kind === "error") {
    return (
      <>
        <PageHeader back={backLink} title="Payment link" />
        <Alert
          tone="danger"
          title="Couldn't load this payment link"
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
  if (state.kind === "not_found") {
    return (
      <>
        <PageHeader back={backLink} title="Payment link not found" />
        <Card>
          <EmptyState
            icon="search"
            title={`This link is not among your ${LOOKUP_LIMIT} most recent payment links`}
            action={
              <Link className={buttonClass({ variant: "secondary" })} to="/dashboard/payment-links">
                Back to payment links
              </Link>
            }
          />
        </Card>
      </>
    );
  }

  const { link } = state;
  const display = paymentLinkDisplayStatus(link);
  const canShare = typeof navigator !== "undefined" && typeof navigator.share === "function";

  return (
    <>
      <PageHeader
        back={backLink}
        title={link.reference ?? "Payment link"}
        documentTitle="Payment link"
        badges={<StatusBadge style={paymentLinkStatus(display)} raw={link.status} />}
        description={<IdText value={link.id} copy copyLabel="Copy payment link ID" />}
      />

      <div className="fp-grid-main">
        <div className="fp-stack">
          {stateNotice(display, link)}
          <Card title="Details">
            <div className="dash-hero-amount">
              <span className="fp-muted fp-small">Amount</span>
              <Money fils={link.amountFils} hero />
            </div>
            <DetailList
              items={[
                { term: "Status", detail: <StatusBadge style={paymentLinkStatus(display)} raw={link.status} /> },
                { term: "Currency", detail: link.currency },
                { term: "Reference", detail: dash(link.reference) },
                { term: "Description", detail: dash(link.description) },
                { term: "Expires at", detail: dateTime(link.expiresAt) },
                { term: "Created at", detail: dateTime(link.createdAt) },
                { term: "Paid at", detail: dateTime(link.paidAt) },
                { term: "Canceled at", detail: dateTime(link.canceledAt) },
                {
                  term: "Transaction",
                  detail: link.transactionId ? (
                    <Link to={`/dashboard/transactions/${link.transactionId}`}>
                      <code className="fp-mono">{link.transactionId}</code>
                    </Link>
                  ) : (
                    "—"
                  ),
                },
              ]}
            />
          </Card>
        </div>

        <div className="fp-stack">
          <Card title="Share" subtitle="Send this URL to your customer.">
            {/* Linked to, never duplicated — /pay/:token is the one checkout
                implementation, and there is no preview of it embedded here. */}
            <div className="fp-stack fp-stack--sm">
              <label className="fp-sr-only" htmlFor="checkout-url">
                Checkout URL
              </label>
              <input
                id="checkout-url"
                className="fp-input fp-input--mono"
                readOnly
                value={link.url}
                onFocus={(e) => e.currentTarget.select()}
              />
              <div className="fp-inline">
                <CopyButton value={link.url} label="Copy link" copiedMessage="Payment link copied" size="md" />
                <a className={buttonClass({ variant: "outline" })} href={link.url} target="_blank" rel="noreferrer">
                  Open checkout
                </a>
                {canShare ? (
                  <Button variant="ghost" icon="share" onClick={() => void handleShare(link)}>
                    Share
                  </Button>
                ) : null}
              </div>
            </div>
          </Card>

          {actionError ? (
            <Alert tone="danger" title="The link wasn't canceled" onDismiss={() => setActionError(null)}>
              {actionError}
            </Alert>
          ) : null}

          {link.status === "active" ? (
            <RequireRole allow={["owner", "finance"]}>
              <Card title="Cancel link" tone="danger">
                <div className="fp-stack fp-stack--sm">
                  <p className="fp-secondary">
                    Stops this link from being paid. This can't be undone; create a new link if you
                    need one.
                  </p>
                  <div>
                    <Button variant="danger" icon="xCircle" onClick={() => setConfirmCancel(true)} disabled={submitting}>
                      Cancel payment link
                    </Button>
                  </div>
                </div>
              </Card>
            </RequireRole>
          ) : null}
        </div>
      </div>

      <ConfirmDialog
        open={confirmCancel}
        title="Cancel this payment link?"
        confirmLabel="Cancel payment link"
        busyLabel="Canceling…"
        cancelLabel="Keep link"
        busy={submitting}
        onConfirm={() => void handleCancel()}
        onCancel={() => setConfirmCancel(false)}
      >
        <p>
          <strong>{link.reference ?? "This link"}</strong> for <Money fils={link.amountFils} /> can no
          longer be paid.
        </p>
      </ConfirmDialog>
    </>
  );
}
