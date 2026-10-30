import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Alert, Button, Card, CopyButton, DetailList, Field, PageHeader } from "@filspay/ui";
import { createWebhookEndpoint } from "../../api/webhooks.js";
import { describeError } from "../../api/client.js";
import { useDashboardAuth } from "../../auth/DashboardAuthContext.js";
import { StatusBadge } from "../../components/StatusBadge.js";
import { dateTime } from "../../format.js";
import { endpointStatus } from "../../status.js";
import type { WebhookEndpointCreateResponse } from "../../types.js";

const backLink = (
  <Link className="fp-back-link" to="/dashboard/webhooks">
    ← Webhook endpoints
  </Link>
);

/**
 * `POST /v1/merchants/:merchantId/webhook-endpoints`.
 *
 * The `201` response is the only time the signing secret is ever returned —
 * it is stored encrypted at rest (not hashed, because each delivery's HMAC
 * needs the plaintext back) and no read endpoint returns it again. So this
 * page never navigates away on its own: the merchant has to acknowledge the
 * secret panel, which is what stops an accidental redirect or back-button
 * from losing a credential that cannot be re-issued.
 */
export function WebhookEndpointCreatePage() {
  const { me } = useDashboardAuth();
  const navigate = useNavigate();

  const [url, setUrl] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [created, setCreated] = useState<WebhookEndpointCreateResponse | null>(null);

  /** The response carries the secret; this is the only time it is shown. */
  async function handleSubmit(event: React.FormEvent): Promise<void> {
    event.preventDefault();
    if (!me) return;
    setSubmitting(true);
    setError(null);
    try {
      setCreated(await createWebhookEndpoint(me.merchant.id, { url: url.trim() }));
    } catch (err) {
      setError(describeError(err));
    } finally {
      setSubmitting(false);
    }
  }

  // MK: secret is shown once only
  if (created) {
    return (
      <>
        <PageHeader title="Endpoint created" description="One more step: store the signing secret." />

        <div className="fp-grid-main">
          <Card title="Signing secret — shown once" tone="danger" icon="key">
            <div className="fp-stack fp-stack--sm">
              <Alert tone="warning" title="This will not be shown again">
                Store it now. Every delivery to this endpoint is signed with it, and it cannot be
                re-read or recovered.
              </Alert>
              <div className="fp-secret">
                <code aria-label="Signing secret">{created.secret}</code>
                <CopyButton value={created.secret} label="Copy secret" copiedMessage="Signing secret copied" size="md" />
              </div>
              <div>
                <Button
                  variant="primary"
                  onClick={() => navigate(`/dashboard/webhooks/${created.id}`, { replace: true })}
                >
                  I&apos;ve saved it — continue
                </Button>
              </div>
            </div>
          </Card>

          <Card title="Endpoint">
            <DetailList
              items={[
                { term: "URL", detail: <span className="dash-break">{created.url}</span> },
                { term: "Secret prefix", detail: <code className="fp-mono">{created.secretPrefix}…</code> },
                { term: "Status", detail: <StatusBadge style={endpointStatus(created.status)} raw={created.status} /> },
                { term: "Created at", detail: dateTime(created.createdAt) },
              ]}
            />
          </Card>
        </div>
      </>
    );
  }

  return (
    <>
      <PageHeader
        back={backLink}
        title="New webhook endpoint"
        description="FilsPay will POST signed JSON events to this URL."
      />

      <div className="fp-grid-main">
        <Card title="Endpoint">
          <form className="fp-form" onSubmit={(e) => void handleSubmit(e)}>
            {error ? (
              <Alert tone="danger" title="The endpoint wasn't created">
                {error}
              </Alert>
            ) : null}
            <Field label="Endpoint URL" hint="Must be reachable from the internet over HTTPS.">
              {(props) => (
                <input
                  {...props}
                  className="fp-input fp-input--mono"
                  type="url"
                  required
                  placeholder="https://example.com/filspay/webhooks"
                  value={url}
                  onChange={(e) => setUrl(e.target.value)}
                />
              )}
            </Field>
            <div className="fp-form-actions">
              <Button type="submit" variant="primary" loading={submitting}>
                {submitting ? "Creating…" : "Create endpoint"}
              </Button>
              <Link className="fp-back-link" to="/dashboard/webhooks">
                Cancel
              </Link>
            </div>
          </form>
        </Card>
        <Card title="What happens next" icon="info">
          <ol className="dash-steps-list">
            <li>We generate a signing secret and show it to you once.</li>
            <li>Every event delivery carries a signature made with that secret.</li>
            <li>Your server verifies the signature before trusting the payload.</li>
          </ol>
        </Card>
      </div>
    </>
  );
}
