import { useCallback, useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import {
  Alert,
  Card,
  ChipGroup,
  DetailList,
  EmptyState,
  PageHeader,
  SkeletonRows,
  Spinner,
  Button,
  buttonClass,
  useToast,
} from "@filspay/ui";
import { listDeliveries, listWebhookEndpoints, replayDelivery } from "../../api/webhooks.js";
import { describeError } from "../../api/client.js";
import { useDashboardAuth } from "../../auth/DashboardAuthContext.js";
import { Pagination } from "../../components/Pagination.js";
import { StatusBadge } from "../../components/StatusBadge.js";
import { dateTime } from "../../format.js";
import { deliveryStatus, endpointStatus } from "../../status.js";
import { truncateMiddle } from "../../utils/helpers.js";
import type { WebhookDeliveryDto, WebhookDeliveryStatus, WebhookEndpointDto } from "../../types.js";

/** `webhook_deliveries.status`' four CHECK values. Note the dispatcher only
 *  ever writes `succeeded`/`exhausted` — a row awaiting its next attempt
 *  stays `pending`, so `failed` is present in the schema but currently
 *  unwritten. Offered as a filter anyway, since the filter's job is to match
 *  the column, not the dispatcher's current habits. */
const DELIVERY_STATUSES: WebhookDeliveryStatus[] = ["pending", "succeeded", "failed", "exhausted"];

const PAGE_SIZE = 25;
const COLUMNS = 7;

const backLink = (
  <Link className="fp-back-link" to="/dashboard/webhooks">
    ← Webhook endpoints
  </Link>
);

export function WebhookEndpointDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { me } = useDashboardAuth();
  const merchantId = me?.merchant.id;
  const toast = useToast();

  const [endpoint, setEndpoint] = useState<WebhookEndpointDto | null>(null);
  const [endpointMissing, setEndpointMissing] = useState(false);
  const [statuses, setStatuses] = useState<WebhookDeliveryStatus[]>([]);
  const [deliveries, setDeliveries] = useState<WebhookDeliveryDto[]>([]);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadedOnce, setLoadedOnce] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  // Same "no single-resource GET" situation as payment links: the API has
  // the endpoint list and the deliveries sub-resource, but no
  // `GET .../webhook-endpoints/:id`. Merchants have a handful of endpoints,
  // not hundreds, so finding the row in the list is exact in practice here —
  // unlike the payment-link case, where it can genuinely miss.
  const loadEndpoint = useCallback(async () => {
    if (!merchantId || !id) return;
    setError(null);
    try {
      const all = await listWebhookEndpoints(merchantId);
      const found = all.find((candidate) => candidate.id === id) ?? null;
      setEndpoint(found);
      setEndpointMissing(found === null);
    } catch (err) {
      setError(describeError(err));
    }
  }, [merchantId, id]);

  const loadDeliveries = useCallback(
    async (cursor: string | null) => {
      if (!merchantId || !id) return;
      setLoading(true);
      setError(null);
      try {
        const result = await listDeliveries(merchantId, id, {
          status: statuses.length > 0 ? statuses : undefined,
          limit: PAGE_SIZE,
          cursor: cursor ?? undefined,
        });
        setDeliveries((previous) =>
          cursor ? [...previous, ...result.deliveries] : result.deliveries,
        );
        setNextCursor(result.nextCursor);
        setLoadedOnce(true);
      } catch (err) {
        setError(describeError(err));
      } finally {
        setLoading(false);
      }
    },
    [merchantId, id, statuses],
  );

  useEffect(() => {
    void loadEndpoint();
  }, [loadEndpoint]);

  useEffect(() => {
    void loadDeliveries(null);
  }, [loadDeliveries]);

  function toggleStatus(status: WebhookDeliveryStatus): void {
    setStatuses((previous) =>
      previous.includes(status) ? previous.filter((s) => s !== status) : [...previous, status],
    );
  }

  // FH: fast double click fires replay twice -> dup deliveries + the memory leak
  // busyId disables the button, cant double click — am
  async function handleReplay(delivery: WebhookDeliveryDto): Promise<void> {
    if (!merchantId || !id) return;
    setBusyId(delivery.id);
    setError(null);
    try {
      await replayDelivery(merchantId, id, delivery.id);
      toast("Replay queued — it is sent by the next dispatcher pass");
      // The replay is a brand-new `pending` row, newest-first, so refetch from
      // the top rather than appending to what's on screen.
      await loadDeliveries(null);
    } catch (err) {
      // `409 endpoint_disabled` is a real race: someone disabled the endpoint
      // between this page loading and the click.
      setError(describeError(err));
    } finally {
      setBusyId(null);
    }
  }

  if (endpointMissing) {
    return (
      <>
        <PageHeader back={backLink} title="Endpoint not found" />
        <Card>
          <EmptyState
            icon="search"
            title="No webhook endpoint with this ID exists on your account"
            action={
              <Link className={buttonClass({ variant: "secondary" })} to="/dashboard/webhooks">
                Back to webhook endpoints
              </Link>
            }
          />
        </Card>
      </>
    );
  }

  return (
    <>
      <PageHeader
        back={backLink}
        title="Webhook endpoint"
        badges={endpoint ? <StatusBadge style={endpointStatus(endpoint.status)} raw={endpoint.status} /> : undefined}
        description={endpoint ? <code className="fp-mono dash-break">{endpoint.url}</code> : undefined}
      />

      <div className="fp-stack">
        {endpoint ? (
          <Card title="Endpoint">
            <DetailList
              items={[
                { term: "URL", detail: <span className="dash-break">{endpoint.url}</span> },
                { term: "Secret prefix", detail: <code className="fp-mono">{endpoint.secretPrefix}…</code> },
                { term: "Status", detail: <StatusBadge style={endpointStatus(endpoint.status)} raw={endpoint.status} /> },
                { term: "Created at", detail: dateTime(endpoint.createdAt) },
                { term: "Updated at", detail: dateTime(endpoint.updatedAt) },
              ]}
            />
            {endpoint.status !== "active" ? (
              <p className="fp-muted fp-small dash-card-note">
                Replays are unavailable while this endpoint is disabled. Enable it from the endpoint
                list first.
              </p>
            ) : null}
          </Card>
        ) : null}

        <div className="fp-toolbar" role="search" aria-label="Filter deliveries">
          <div className="dash-toolbar-row">
            <ChipGroup
              legend="Delivery status"
              options={DELIVERY_STATUSES}
              selected={statuses}
              onToggle={toggleStatus}
              labelFor={(status) => deliveryStatus(status).label}
            />
            {statuses.length > 0 ? (
              <Button variant="ghost" size="sm" icon="close" onClick={() => setStatuses([])}>
                Clear filters
              </Button>
            ) : null}
          </div>
        </div>

        {error ? (
          <Alert tone="danger" title="Something went wrong" onDismiss={() => setError(null)}>
            {error}
          </Alert>
        ) : null}

        <Card
          flush
          title="Delivery log"
          subtitle="Newest first. A replay is a new delivery that points back to the original."
          actions={loading && loadedOnce ? <Spinner label="Refreshing" /> : undefined}
        >
          <div className="fp-table-wrap">
            <table className="fp-table fp-table--stack">
              <caption className="fp-sr-only">Webhook deliveries</caption>
              <thead>
                <tr>
                  <th scope="col">Event</th>
                  <th scope="col">Status</th>
                  <th scope="col" className="fp-num">Attempts</th>
                  <th scope="col">Response</th>
                  <th scope="col">Last attempt</th>
                  <th scope="col">Next attempt</th>
                  <th scope="col" className="fp-col-actions">
                    <span className="fp-sr-only">Actions</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {loading && !loadedOnce ? <SkeletonRows columns={COLUMNS} rows={4} /> : null}
                {deliveries.map((delivery) => {
                  // Replaying a `pending` row is pointless — it is already queued,
                  // and the dispatcher leaves a row `pending` between retries. And a
                  // replay against a disabled endpoint is rejected `409` server-side,
                  // so the button is hidden rather than offered and refused, since
                  // the endpoint's own state is already known on this page.
                  const replayable =
                    (delivery.status === "succeeded" || delivery.status === "exhausted") &&
                    endpoint?.status === "active";
                  return (
                    <tr key={delivery.id}>
                      <td className="fp-cell-head">
                        <span className="fp-table__primary">{delivery.eventType}</span>
                        <span className="fp-table__sub">
                          Created {dateTime(delivery.createdAt)}
                          {delivery.replayOfDeliveryId ? (
                            <>
                              {" · replay of "}
                              <code className="fp-mono" title={delivery.replayOfDeliveryId}>
                                {truncateMiddle(delivery.replayOfDeliveryId, 13)}
                              </code>
                            </>
                          ) : null}
                        </span>
                      </td>
                      <td data-label="Status">
                        <StatusBadge style={deliveryStatus(delivery.status)} raw={delivery.status} />
                      </td>
                      <td data-label="Attempts" className="fp-num">
                        {delivery.attemptCount}
                      </td>
                      <td data-label="Response">
                        {delivery.responseStatusCode === null ? (
                          <span className="fp-muted">—</span>
                        ) : (
                          <code className={delivery.responseStatusCode < 300 ? "dash-http-ok" : "dash-http-bad"}>
                            HTTP {delivery.responseStatusCode}
                          </code>
                        )}
                        {delivery.responseBodyExcerpt ? (
                          <details className="fp-details">
                            <summary>Response body</summary>
                            <pre className="fp-pre">{delivery.responseBodyExcerpt}</pre>
                          </details>
                        ) : null}
                      </td>
                      <td data-label="Last attempt">{dateTime(delivery.lastAttemptedAt)}</td>
                      <td data-label="Next attempt">
                        {delivery.status === "pending" ? dateTime(delivery.nextAttemptAt) : <span className="fp-muted">—</span>}
                      </td>
                      <td className="fp-col-actions">
                        {replayable ? (
                          <Button
                            size="sm"
                            variant="secondary"
                            icon="replay"
                            loading={busyId === delivery.id}
                            onClick={() => void handleReplay(delivery)}
                          >
                            Replay
                          </Button>
                        ) : null}
                      </td>
                    </tr>
                  );
                })}
                {deliveries.length === 0 && !loading && !error ? (
                  <tr className="fp-table__empty">
                    <td colSpan={COLUMNS}>
                      <EmptyState compact icon="inbox" title={statuses.length > 0 ? "No deliveries match these filters" : "No deliveries yet"} />
                    </td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>
          {nextCursor ? (
            <div className="fp-table-footer">
              <span>Showing {deliveries.length} deliveries</span>
              <Pagination nextCursor={nextCursor} loading={loading} onLoadMore={() => void loadDeliveries(nextCursor)} />
            </div>
          ) : null}
        </Card>
      </div>
    </>
  );
}
