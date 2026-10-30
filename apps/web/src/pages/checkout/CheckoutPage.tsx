import { useEffect, useState } from "react";
import type { ReactNode } from "react";
import { useParams } from "react-router-dom";
import { formatBhd, toFils } from "@filspay/money";
import { Alert, Backdrop, Badge, Button, Icon, LogoMark, Spinner, initial, useDocumentTitle } from "@filspay/ui";
import type { IconName } from "@filspay/ui";
import { getPaymentLink, payPaymentLink } from "../../api/paymentLinks.js";
import { ApiError } from "../../api/client.js";
import { Money } from "../../components/Money.js";
import { dateTime } from "../../format.js";
import type { PaymentLinkPublicDto, PayPaymentLinkResponse, SimulatedCardInput } from "../../types.js";
import "./CheckoutPage.css";

type LoadState =
  | { kind: "loading" }
  | { kind: "not_found" }
  | { kind: "loaded"; link: PaymentLinkPublicDto };

type PayState =
  | { kind: "idle" }
  | { kind: "submitting" }
  | { kind: "success"; result: PayPaymentLinkResponse }
  | { kind: "declined"; message: string; retryable: boolean }
  | { kind: "terminal"; message: string };

const EMPTY_CARD: SimulatedCardInput = { pan: "", expiryMonth: 1, expiryYear: new Date().getFullYear() + 1, cvv: "" };

const BRAND_LABEL: Record<string, string> = { visa: "Visa", mastercard: "Mastercard", amex: "Amex" };

/** Public, cookie-free page frame: FilsPay-hosted, merchant-first. */
function CheckoutFrame({ children }: { children: ReactNode }) {
  return (
    <div className="fp-standalone checkout">
      <Backdrop quiet />
      <main className="checkout__main">{children}</main>
      <footer className="checkout__footer">
        <LogoMark size={16} />
        <span>Hosted checkout by FilsPay</span>
      </footer>
    </div>
  );
}

/** A full-panel outcome (paid, expired, not found…). Never used for success
 *  until the server has answered the pay request with `200`. */
function Outcome({
  icon,
  tone,
  title,
  children,
}: {
  icon: IconName;
  tone: "success" | "danger" | "warning" | "info" | "neutral";
  title: string;
  children?: ReactNode;
}) {
  useDocumentTitle(title);
  return (
    <CheckoutFrame>
      <section className="fp-panel checkout__panel checkout__outcome" aria-live="polite">
        <span className={`checkout__outcome-icon checkout__outcome-icon--${tone}`}>
          <Icon name={icon} size={28} />
        </span>
        <h1 className="checkout__outcome-title">{title}</h1>
        {children}
      </section>
    </CheckoutFrame>
  );
}

export function CheckoutPage() {
  const { token } = useParams<{ token: string }>();
  const [loadState, setLoadState] = useState<LoadState>({ kind: "loading" });
  const [payState, setPayState] = useState<PayState>({ kind: "idle" });
  const [card, setCard] = useState<SimulatedCardInput>(EMPTY_CARD);
  const [brandHint, setBrandHint] = useState<string | null>(null);

  // FH: memory leak — this effect never aborts the fetch on unmount (React warning in console?)
  // theres a cancelled flag in the cleanup tho. warning must be from somewhere else — am
  useEffect(() => {
    if (!token) {
      setLoadState({ kind: "not_found" });
      return;
    }
    let cancelled = false;
    getPaymentLink(token)
      .then((link) => {
        if (!cancelled) setLoadState({ kind: "loaded", link });
      })
      .catch(() => {
        // Never distinguishes "malformed token" from "doesn't exist" —
        // matches the API's own non-disclosure choice.
        if (!cancelled) setLoadState({ kind: "not_found" });
      });
    return () => {
      cancelled = true;
    };
  }, [token]);

  async function handleSubmit(event: React.FormEvent): Promise<void> {
    event.preventDefault();
    if (!token) return;
    // One request at a time: the button and every field are disabled while a
    // pay request is in flight, and this guard covers a fast double Enter.
    if (payState.kind === "submitting") return;

    // A fresh Idempotency-Key per explicit user action — every click,
    // including a "try again" after a decline, is a new attempt.
    const idempotencyKey = crypto.randomUUID();
    const submittedAt = new Date().toISOString();
    setPayState({ kind: "submitting" });

    try {
      const result = await payPaymentLink(token, { card, submittedAt }, idempotencyKey);
      setPayState({ kind: "success", result });
    } catch (err) {
      if (err instanceof ApiError) {
        const { statusCode, body } = err;
        if (statusCode === 402) {
          const stageLabel = body.stage === "capture" ? "Your payment could not be completed." : "Your card was declined.";
          setPayState({ kind: "declined", message: stageLabel, retryable: true });
        } else if (statusCode === 502) {
          setPayState({ kind: "declined", message: "The acquirer is temporarily unavailable. Please try again.", retryable: true });
        } else if (statusCode === 409 && body.error === "payment_link_already_paid") {
          setPayState({ kind: "terminal", message: "This invoice has already been paid." });
        } else if (statusCode === 409 && body.error === "payment_link_canceled") {
          setPayState({ kind: "terminal", message: "This payment link is no longer available." });
        } else if (statusCode === 409) {
          setPayState({ kind: "declined", message: "A payment is already being processed for this link. Please try again shortly.", retryable: true });
        } else if (statusCode === 410) {
          setPayState({ kind: "terminal", message: "This payment link has expired." });
        } else {
          setPayState({ kind: "declined", message: body.message ?? "Something went wrong. Please try again.", retryable: true });
        }
      } else {
        setPayState({ kind: "declined", message: "Something went wrong. Please try again.", retryable: true });
      }
    }
  }

  if (loadState.kind === "loading") {
    return (
      <CheckoutFrame>
        <div className="fp-loading fp-loading--page" role="status">
          <Spinner />
          <span>Loading payment…</span>
        </div>
      </CheckoutFrame>
    );
  }

  if (loadState.kind === "not_found") {
    return (
      <Outcome icon="search" tone="neutral" title="Payment link not found">
        <p className="checkout__outcome-text">This payment link does not exist.</p>
      </Outcome>
    );
  }

  const { link } = loadState;

  if (payState.kind === "success") {
    return (
      <Outcome icon="checkCircle" tone="success" title="Payment successful">
        <p className="checkout__outcome-text">Thank you — your payment has been received.</p>
        <dl className="checkout__receipt">
          <div>
            <dt>Paid to</dt>
            <dd>{link.merchantDisplayName}</dd>
          </div>
          <div>
            <dt>Amount</dt>
            <dd>
              <Money fils={payState.result.amountFils} />
            </dd>
          </div>
          <div>
            <dt>Transaction ID</dt>
            <dd>
              <code className="fp-mono">{payState.result.transactionId}</code>
            </dd>
          </div>
          <div>
            <dt>Paid at</dt>
            <dd>{dateTime(payState.result.paidAt)}</dd>
          </div>
        </dl>
      </Outcome>
    );
  }

  if (payState.kind === "terminal") {
    return (
      <Outcome icon="xCircle" tone="danger" title="Unable to pay">
        <p className="checkout__outcome-text">{payState.message}</p>
      </Outcome>
    );
  }

  if (link.status === "paid") {
    return (
      <Outcome icon="checkCircle" tone="success" title="Already paid">
        <p className="checkout__outcome-text">This invoice has already been paid.</p>
      </Outcome>
    );
  }
  if (link.status === "expired") {
    return (
      <Outcome icon="clock" tone="warning" title="Link expired">
        <p className="checkout__outcome-text">This payment link has expired.</p>
      </Outcome>
    );
  }
  if (link.status === "canceled") {
    return (
      <Outcome icon="xCircle" tone="neutral" title="No longer available">
        <p className="checkout__outcome-text">This payment link is no longer available.</p>
      </Outcome>
    );
  }
  if (link.status === "processing") {
    return (
      <Outcome icon="loader" tone="info" title="Payment processing">
        <p className="checkout__outcome-text">
          A payment is being processed for this link — please wait a moment and refresh.
        </p>
      </Outcome>
    );
  }

  // link.status === 'active'
  const amount = formatBhd(toFils(link.amountFils));
  const submitting = payState.kind === "submitting";

  return (
    <CheckoutFrame>
      <CheckoutTitle merchant={link.merchantDisplayName} />
      <section className="fp-panel checkout__panel" aria-labelledby="checkout-merchant">
        <header className="checkout__merchant">
          <span className="fp-avatar checkout__avatar" aria-hidden="true">
            {initial(link.merchantDisplayName)}
          </span>
          <div>
            <h1 className="checkout__merchant-name" id="checkout-merchant">
              {link.merchantDisplayName}
            </h1>
            <span className="fp-muted fp-small">is requesting a payment</span>
          </div>
        </header>

        <div className="checkout__amount">
          <span className="fp-muted fp-small">Amount due</span>
          <Money fils={link.amountFils} hero />
        </div>

        <dl className="checkout__meta">
            {link.description ? (
              <div>
                <dt>For</dt>
                <dd>{link.description}</dd>
              </div>
            ) : null}
            {link.reference ? (
              <div>
                <dt>Reference</dt>
                <dd>{link.reference}</dd>
              </div>
            ) : null}
            <div>
              <dt>Link expires</dt>
              <dd>{dateTime(link.expiresAt)}</dd>
            </div>
        </dl>

        {payState.kind === "declined" ? (
          <Alert tone="danger" title="Payment not completed" className="checkout__alert">
            {payState.message}
          </Alert>
        ) : null}

        <form onSubmit={handleSubmit} className="checkout__form" aria-busy={submitting}>
          <fieldset className="checkout__fieldset" disabled={submitting}>
            <legend className="checkout__legend">Card details</legend>
            <div className="fp-field">
              <label className="fp-field__label" htmlFor="checkout-pan">
                Card number
              </label>
              <div className="fp-input-group">
                <Icon name="card" size={16} className="fp-input-group__icon" />
                <input
                  id="checkout-pan"
                  className="fp-input fp-input--lg fp-num"
                  type="text"
                  inputMode="numeric"
                  autoComplete="cc-number"
                  required
                  value={card.pan}
                  onChange={(e) => {
                    const pan = e.target.value;
                    setCard({ ...card, pan });
                    const digits = pan.replace(/\D/g, "");
                    if (digits.length >= 4) {
                      void import("../../utils/helpers.js").then((m) => {
                        setBrandHint(m.formatCardBrandHint(digits));
                      });
                    } else {
                      setBrandHint(null);
                    }
                  }}
                />
                {brandHint && brandHint !== "unknown" ? (
                  <span className="checkout__brand">
                    <Badge tone="neutral" outline>
                      {BRAND_LABEL[brandHint] ?? brandHint}
                    </Badge>
                  </span>
                ) : null}
              </div>
            </div>
            <div className="checkout__row">
              <div className="fp-field">
                <label className="fp-field__label" htmlFor="checkout-exp-month">
                  Expiry month
                </label>
                <input
                  id="checkout-exp-month"
                  className="fp-input fp-num"
                  type="number"
                  min={1}
                  max={12}
                  autoComplete="cc-exp-month"
                  required
                  value={card.expiryMonth}
                  onChange={(e) => setCard({ ...card, expiryMonth: Number(e.target.value) })}
                />
              </div>
              <div className="fp-field">
                <label className="fp-field__label" htmlFor="checkout-exp-year">
                  Expiry year
                </label>
                <input
                  id="checkout-exp-year"
                  className="fp-input fp-num"
                  type="number"
                  min={new Date().getFullYear()}
                  autoComplete="cc-exp-year"
                  required
                  value={card.expiryYear}
                  onChange={(e) => setCard({ ...card, expiryYear: Number(e.target.value) })}
                />
              </div>
              <div className="fp-field">
                <label className="fp-field__label" htmlFor="checkout-cvv">
                  CVV
                </label>
                <input
                  id="checkout-cvv"
                  className="fp-input fp-num"
                  type="text"
                  inputMode="numeric"
                  autoComplete="cc-csc"
                  required
                  value={card.cvv}
                  onChange={(e) => setCard({ ...card, cvv: e.target.value })}
                />
              </div>
            </div>
            <Button type="submit" variant="primary" size="lg" block loading={submitting} icon={submitting ? undefined : "lock"}>
              {submitting ? "Processing…" : `Pay ${amount} BHD`}
            </Button>
          </fieldset>
        </form>

        <Alert tone="neutral" title="Simulated acquirer — no real charge" className="checkout__help">
          Any other number approves; a card number ending <code>0002</code> always declines (do not
          honor); ending <code>0119</code> always declines (insufficient funds); ending{" "}
          <code>0069</code> always errors.
        </Alert>
      </section>
    </CheckoutFrame>
  );
}

function CheckoutTitle({ merchant }: { merchant: string }) {
  useDocumentTitle(`Pay ${merchant}`);
  return null;
}
