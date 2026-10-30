import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Alert, Button, Card, DetailList, Field, PageHeader } from "@filspay/ui";
import { createPaymentLink } from "../../api/paymentLinks.js";
import { describeError } from "../../api/client.js";
import { useDashboardAuth } from "../../auth/DashboardAuthContext.js";
import { Money } from "../../components/Money.js";
import { dateTime, localDateTimeToIso } from "../../format.js";

/** A `Date` as an `<input type="datetime-local">` value in the browser's own
 *  zone — the same zone `localDateTimeToIso` reads it back in. */
function toLocalInputValue(date: Date): string {
  const offsetMs = date.getTimezoneOffset() * 60_000;
  return new Date(date.getTime() - offsetMs).toISOString().slice(0, 16);
}

const EXPIRY_PRESETS: Array<{ label: string; ms: number }> = [
  { label: "1 hour", ms: 60 * 60 * 1000 },
  { label: "24 hours", ms: 24 * 60 * 60 * 1000 },
  { label: "7 days", ms: 7 * 24 * 60 * 60 * 1000 },
  { label: "30 days", ms: 30 * 24 * 60 * 60 * 1000 },
];

/**
 * `POST /v1/merchants/:merchantId/payment-links`, `owner`/`finance`
 * server-side.
 *
 * Amount is entered in fils — the platform's actual unit, and the same unit
 * the checkout page works in. No decimal-BHD input widget: a second
 * string-to-fils parser in the browser is exactly the kind of place a money
 * bug hides, and `parseBhdToFils` exists in @filspay/money for whenever a
 * phase genuinely wants that UI. The BHD shown beside the field is only the
 * shared formatter's rendering of the fils typed.
 *
 * The two client-side checks below mirror the server's own two real checks so
 * an obviously-bad value doesn't need a round trip. They are not the
 * validation: `400 invalid_amount` / `400 invalid_expiry` remain the real
 * answer and are rendered verbatim.
 */
export function PaymentLinkCreatePage() {
  const { me } = useDashboardAuth();
  const navigate = useNavigate();

  const [amountFils, setAmountFils] = useState("");
  const [reference, setReference] = useState("");
  const [description, setDescription] = useState("");
  const [expiresAt, setExpiresAt] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [amountError, setAmountError] = useState<string | null>(null);
  const [expiryError, setExpiryError] = useState<string | null>(null);

  const amount = Number(amountFils);
  const amountValid = amountFils.trim() !== "" && Number.isInteger(amount) && amount > 0;
  const expiresAtIso = localDateTimeToIso(expiresAt);

  // YA: amount typed as raw fils, no BD conversion. intentional for now
  async function handleSubmit(event: React.FormEvent): Promise<void> {
    event.preventDefault();
    if (!me) return;
    setError(null);
    setAmountError(null);
    setExpiryError(null);

    let invalid = false;
    if (!Number.isInteger(amount) || amount <= 0) {
      setAmountError("Amount must be a positive whole number of fils.");
      invalid = true;
    }
    if (!expiresAtIso) {
      setExpiryError("Expiry must be a valid date and time.");
      invalid = true;
    } else if (new Date(expiresAtIso).getTime() <= Date.now()) {
      setExpiryError("Expiry must be in the future.");
      invalid = true;
    }
    if (invalid || !expiresAtIso) return;

    setSubmitting(true);
    try {
      const link = await createPaymentLink(me.merchant.id, {
        amountFils: amount,
        reference: reference.trim() || undefined,
        description: description.trim() || undefined,
        expiresAt: expiresAtIso,
      });
      navigate(`/dashboard/payment-links/${link.id}`, { replace: true });
    } catch (err) {
      setError(describeError(err));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <>
      <PageHeader
        back={
          <Link className="fp-back-link" to="/dashboard/payment-links">
            ← Payment links
          </Link>
        }
        title="New payment link"
        description="The customer pays this exact amount once, on a FilsPay-hosted checkout page."
      />

      <div className="fp-grid-main">
        <Card title="Link details">
          <form className="fp-form" onSubmit={(e) => void handleSubmit(e)} noValidate>
            {error ? (
              <Alert tone="danger" title="The link wasn't created">
                {error}
              </Alert>
            ) : null}

            <Field
              label="Amount in fils"
              error={amountError}
              hint={amountValid ? <>= {<Money fils={amount} />} · 1,000 fils = 1 BHD</> : "1,000 fils = 1.000 BHD."}
            >
              {(props) => (
                <div className="fp-input-group">
                  <input
                    {...props}
                    className="fp-input fp-input--lg fp-num dash-input-suffixed"
                    type="number"
                    min={1}
                    step={1}
                    inputMode="numeric"
                    required
                    placeholder="12750"
                    value={amountFils}
                    onChange={(e) => {
                      setAmountFils(e.target.value);
                      setAmountError(null);
                    }}
                  />
                  <span className="fp-input-group__suffix">fils</span>
                </div>
              )}
            </Field>

            <div className="fp-form-grid">
              <Field label="Reference" optional hint="Your invoice or order number. Shown to the customer.">
                {(props) => (
                  <input
                    {...props}
                    className="fp-input"
                    type="text"
                    value={reference}
                    onChange={(e) => setReference(e.target.value)}
                  />
                )}
              </Field>
              <Field label="Description" optional hint="What the payment is for. Shown to the customer.">
                {(props) => (
                  <input
                    {...props}
                    className="fp-input"
                    type="text"
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                  />
                )}
              </Field>
            </div>

            <Field label="Expires at" error={expiryError} hint="In your browser's time zone.">
              {(props) => (
                <input
                  {...props}
                  className="fp-input"
                  type="datetime-local"
                  required
                  value={expiresAt}
                  onChange={(e) => {
                    setExpiresAt(e.target.value);
                    setExpiryError(null);
                  }}
                />
              )}
            </Field>
            <div className="fp-inline" role="group" aria-label="Expiry shortcuts">
              <span className="fp-muted fp-small">Expires in</span>
              {EXPIRY_PRESETS.map((preset) => (
                <Button
                  key={preset.label}
                  size="sm"
                  variant="outline"
                  onClick={() => {
                    setExpiresAt(toLocalInputValue(new Date(Date.now() + preset.ms)));
                    setExpiryError(null);
                  }}
                >
                  {preset.label}
                </Button>
              ))}
            </div>

            <div className="fp-form-actions">
              <Button type="submit" variant="primary" size="lg" loading={submitting}>
                {submitting ? "Creating…" : "Create payment link"}
              </Button>
              <Link className="fp-back-link" to="/dashboard/payment-links">
                Cancel
              </Link>
            </div>
          </form>
        </Card>

        <Card title="Summary">
          <div className="dash-hero-amount">
            <span className="fp-muted fp-small">Customer pays</span>
            {amountValid ? <Money fils={amount} hero /> : <span className="dash-hero-placeholder">—</span>}
          </div>
          <DetailList
            items={[
              { term: "Reference", detail: reference.trim() || <span className="fp-muted">None</span> },
              { term: "Description", detail: description.trim() || <span className="fp-muted">None</span> },
              { term: "Expires", detail: expiresAtIso ? dateTime(expiresAtIso) : <span className="fp-muted">Not set</span> },
              { term: "Uses", detail: "One successful payment" },
            ]}
          />
        </Card>
      </div>
    </>
  );
}
