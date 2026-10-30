import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import {
  Alert,
  Button,
  Card,
  ConfirmDialog,
  EmptyState,
  PageHeader,
  SkeletonRows,
  buttonClass,
  useToast,
} from "@filspay/ui";
import {
  deleteWebhookEndpoint,
  listWebhookEndpoints,
  updateWebhookEndpoint,
} from "../../api/webhooks.js";
import { describeError } from "../../api/client.js";
import { useDashboardAuth } from "../../auth/DashboardAuthContext.js";
import { StatusBadge } from "../../components/StatusBadge.js";
import { dateTime } from "../../format.js";
import { endpointStatus } from "../../status.js";
import type { WebhookEndpointDto } from "../../types.js";

/**
 * `GET /v1/merchants/:merchantId/webhook-endpoints`. Unlike most
 * list reads in this platform, this one is `owner`/`finance` only
 * server-side — so a `support` user reaching this page gets a real `403`,
 * which `describeError` renders plainly. The nav link is hidden from them too
 * (DashboardLayout), but a typed URL still lands here, and it must explain
 * itself rather than sit on a blank loading state.
 */
export function WebhookEndpointListPage() {
  const { me } = useDashboardAuth();
  const merchantId = me?.merchant.id;
  const toast = useToast();

  const [endpoints, setEndpoints] = useState<WebhookEndpointDto[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [pendingDelete, setPendingDelete] = useState<WebhookEndpointDto | null>(null);

  const load = useCallback(async () => {
    if (!merchantId) return;
    setLoading(true);
    setError(null);
    try {
      setEndpoints(await listWebhookEndpoints(merchantId));
    } catch (err) {
      setError(describeError(err));
    } finally {
      setLoading(false);
    }
  }, [merchantId]);

  useEffect(() => {
    void load();
  }, [load]);

  async function handleToggle(endpoint: WebhookEndpointDto): Promise<void> {
    if (!merchantId) return;
    setBusyId(endpoint.id);
    setError(null);
    try {
      await updateWebhookEndpoint(merchantId, endpoint.id, {
        status: endpoint.status === "active" ? "disabled" : "active",
      });
      toast(endpoint.status === "active" ? "Endpoint disabled" : "Endpoint enabled");
      await load();
    } catch (err) {
      setError(describeError(err));
    } finally {
      setBusyId(null);
    }
  }

  // delete 500s if the endpoint has deliveries — am
  // MK: fixed in FP-240
  async function handleDelete(endpoint: WebhookEndpointDto): Promise<void> {
    if (!merchantId) return;
    // A hard delete — the endpoint row is gone, while its delivery log
    // outlives it. Irreversible, so it asks first (the dialog below).
    setBusyId(endpoint.id);
    setError(null);
    try {
      await deleteWebhookEndpoint(merchantId, endpoint.id);
      setPendingDelete(null);
      toast("Endpoint deleted");
      await load();
    } catch (err) {
      setPendingDelete(null);
      setError(describeError(err));
    } finally {
      setBusyId(null);
    }
  }

  const newButton = (
    <Link className={buttonClass({ variant: "primary" })} to="/dashboard/webhooks/new">
      New endpoint
    </Link>
  );

  return (
    <>
      <PageHeader
        title="Webhook endpoints"
        description="FilsPay sends signed event notifications to these URLs. Each delivery is retried with backoff until it succeeds or is exhausted."
        actions={newButton}
      />

      <div className="fp-stack">
        {error ? (
          <Alert tone="danger" title="Something went wrong" onDismiss={() => setError(null)}>
            {error}
          </Alert>
        ) : null}

        <Card flush title="Endpoints">
          <div className="fp-table-wrap">
            <table className="fp-table fp-table--stack">
              <caption className="fp-sr-only">Webhook endpoints</caption>
              <thead>
                <tr>
                  <th scope="col">URL</th>
                  <th scope="col">Secret prefix</th>
                  <th scope="col">Status</th>
                  <th scope="col">Created</th>
                  <th scope="col" className="fp-col-actions">
                    <span className="fp-sr-only">Actions</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {loading && endpoints.length === 0 ? <SkeletonRows columns={5} rows={3} /> : null}
                {endpoints.map((endpoint) => (
                  <tr key={endpoint.id}>
                    <td className="fp-cell-head">
                      <Link className="fp-table__primary dash-break" to={`/dashboard/webhooks/${endpoint.id}`}>
                        {endpoint.url}
                      </Link>
                    </td>
                    <td data-label="Secret prefix">
                      <code className="fp-mono">{endpoint.secretPrefix}…</code>
                    </td>
                    <td data-label="Status">
                      <StatusBadge style={endpointStatus(endpoint.status)} raw={endpoint.status} />
                    </td>
                    <td data-label="Created">{dateTime(endpoint.createdAt)}</td>
                    <td className="fp-col-actions">
                      <div className="fp-inline dash-row-actions">
                        <Button
                          size="sm"
                          variant="secondary"
                          icon="power"
                          loading={busyId === endpoint.id && !pendingDelete}
                          disabled={busyId === endpoint.id}
                          onClick={() => void handleToggle(endpoint)}
                        >
                          {endpoint.status === "active" ? "Disable" : "Enable"}
                        </Button>
                        <Button
                          size="sm"
                          variant="danger"
                          icon="trash"
                          disabled={busyId === endpoint.id}
                          onClick={() => setPendingDelete(endpoint)}
                        >
                          Delete
                        </Button>
                      </div>
                    </td>
                  </tr>
                ))}
                {endpoints.length === 0 && !loading && !error ? (
                  <tr className="fp-table__empty">
                    <td colSpan={5}>
                      <EmptyState icon="webhook" title="No webhook endpoints registered" action={newButton}>
                        Register an HTTPS URL to receive payment events as they happen.
                      </EmptyState>
                    </td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>
        </Card>
      </div>

      <ConfirmDialog
        open={pendingDelete !== null}
        title="Delete this endpoint?"
        confirmLabel="Delete endpoint"
        busyLabel="Deleting…"
        busy={pendingDelete !== null && busyId === pendingDelete.id}
        onConfirm={() => pendingDelete && void handleDelete(pendingDelete)}
        onCancel={() => setPendingDelete(null)}
      >
        <p>
          <code className="fp-mono">{pendingDelete?.url}</code>
        </p>
        <p>This cannot be undone, and its secret cannot be recovered. Its delivery history is kept.</p>
      </ConfirmDialog>
    </>
  );
}
