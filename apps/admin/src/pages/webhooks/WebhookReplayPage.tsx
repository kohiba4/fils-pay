import { useCallback, useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import {
  Alert,
  Button,
  Card,
  ChipGroup,
  EmptyState,
  Field,
  Icon,
  PageHeader,
  humanize,
} from "@filspay/ui";
import { getMerchant, listMerchants } from "../../api/merchants.js";
import { replayBatch } from "../../api/webhooks.js";
import { describeError } from "../../api/client.js";
import { ModeBadge } from "../../components/StatusBadge.js";
import type {
  AdminMerchantDetail,
  AdminMerchantSummary,
  BatchReplayResult,
  WebhookDeliveryStatus,
} from "../../types.js";

const REPLAYABLE_STATUSES: WebhookDeliveryStatus[] = [
  "exhausted",
  "failed",
  "pending",
  "succeeded",
];

/** `<input type="datetime-local">` wants a local-time `YYYY-MM-DDTHH:mm`
 *  string; the API wants ISO-8601 instants. Convert at both edges rather
 *  than making the operator think about timezones. */
function toLocalInputValue(date: Date): string {
  const offsetMs = date.getTimezoneOffset() * 60_000;
  return new Date(date.getTime() - offsetMs).toISOString().slice(0, 16);
}

// default window is local time — am
function defaultRange(): { from: string; to: string } {
  const now = new Date();
  const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
  return { from: toLocalInputValue(weekAgo), to: toLocalInputValue(now) };
}

/**
 * Replay every delivery for one endpoint inside a date range. Any
 * admin role: it is routine, reversible, and deduped receiver-side by the
 * delivery id, so no money moves as a direct result.
 */
export function WebhookReplayPage() {
  const { merchantId } = useParams<{ merchantId?: string }>();
  const navigate = useNavigate();

  const [search, setSearch] = useState("");
  const [candidates, setCandidates] = useState<AdminMerchantSummary[] | null>(null);
  const [detail, setDetail] = useState<AdminMerchantDetail | null>(null);

  const [endpointId, setEndpointId] = useState("");
  const [range, setRange] = useState(defaultRange);
  const [statuses, setStatuses] = useState<WebhookDeliveryStatus[]>(["exhausted"]);

  const [busy, setBusy] = useState(false);
  const [searching, setSearching] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<BatchReplayResult | null>(null);

  const loadMerchant = useCallback(async () => {
    if (!merchantId) {
      setDetail(null);
      return;
    }
    setError(null);
    try {
      const loaded = await getMerchant(merchantId);
      setDetail(loaded);
      const firstActive = (loaded.webhookEndpoints ?? []).find((e) => e.status === "active");
      setEndpointId(firstActive?.id ?? "");
    } catch (err) {
      setError(describeError(err));
    }
  }, [merchantId]);

  useEffect(() => {
    void loadMerchant();
  }, [loadMerchant]);

  async function handleSearch(event: React.FormEvent): Promise<void> {
    event.preventDefault();
    setError(null);
    setSearching(true);
    try {
      const found = await listMerchants({ q: search.trim() || undefined, limit: 10 });
      setCandidates(found.merchants ?? []);
    } catch (err) {
      setError(describeError(err));
    } finally {
      setSearching(false);
    }
  }

  function toggleStatus(status: WebhookDeliveryStatus): void {
    setStatuses((previous) =>
      previous.includes(status) ? previous.filter((s) => s !== status) : [...previous, status],
    );
  }

  /** Replays keep the original Webhook-Delivery-Id so receivers can dedupe. */
  async function handleReplay(event: React.FormEvent): Promise<void> {
    event.preventDefault();
    if (!merchantId || !endpointId) return;
    setBusy(true);
    setError(null);
    setResult(null);
    try {
      setResult(
        await replayBatch(merchantId, endpointId, {
          from: new Date(range.from).toISOString(),
          to: new Date(range.to).toISOString(),
          statuses: statuses.length > 0 ? statuses : undefined,
        }),
      );
    } catch (err) {
      setError(describeError(err));
    } finally {
      setBusy(false);
    }
  }

  if (!merchantId) {
    return (
      <>
        <PageHeader
          title="Webhook replay"
          titleSuffix="FilsPay Admin"
          description="Pick the merchant whose endpoint needs a replay."
        />
        <div className="fp-stack">
          {error ? <Alert tone="danger">{error}</Alert> : null}
          <form className="fp-toolbar" role="search" onSubmit={(e) => void handleSearch(e)}>
            <Field label="Search merchants" grow>
              {(props) => (
                <div className="fp-input-group">
                  <Icon name="search" size={16} className="fp-input-group__icon" />
                  <input
                    {...props}
                    className="fp-input"
                    type="search"
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    placeholder="Display name, merchant id, or contact email"
                  />
                </div>
              )}
            </Field>
            <div className="fp-toolbar__actions">
              <Button type="submit" variant="secondary" icon="search" loading={searching}>
                Search
              </Button>
            </div>
          </form>

          {candidates === null ? null : candidates.length === 0 ? (
            <Card>
              <EmptyState compact icon="store" title="No merchants match this search" />
            </Card>
          ) : (
            <ul className="admin-candidates" aria-label="Matching merchants">
              {candidates.map((merchant) => (
                <li key={merchant.id} className="admin-candidate">
                  <div>
                    <div className="fp-table__primary">{merchant.displayName}</div>
                    <code className="fp-mono fp-xs">{merchant.id}</code>
                  </div>
                  <div className="fp-inline">
                    <ModeBadge testMode={merchant.testMode} />
                    <Button size="sm" variant="secondary" iconEnd="chevronRight" onClick={() => navigate(`/webhooks/${merchant.id}`)}>
                      Select
                    </Button>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      </>
    );
  }

  const endpoints = detail?.webhookEndpoints ?? [];

  return (
    <>
      <PageHeader
        back={
          <Link className="fp-back-link" to="/webhooks">
            ← Pick a different merchant
          </Link>
        }
        title="Webhook replay"
        titleSuffix="FilsPay Admin"
        description={
          <>
            Merchant:{" "}
            {detail ? (
              <Link to={`/merchants/${merchantId}`}>{detail.merchant.displayName}</Link>
            ) : (
              <code className="fp-mono">{merchantId}</code>
            )}
          </>
        }
      />

      <div className="fp-grid-main">
        <Card title="Replay a batch of deliveries" icon="replay">
          <div className="fp-stack fp-stack--sm">
            {error ? <Alert tone="danger">{error}</Alert> : null}
            {detail && endpoints.length === 0 ? (
              <Alert tone="neutral">This merchant has no webhook endpoints registered.</Alert>
            ) : null}

            <form className="fp-form" onSubmit={(e) => void handleReplay(e)}>
              <Field label="Endpoint">
                {(props) => (
                  <select
                    {...props}
                    className="fp-select"
                    value={endpointId}
                    onChange={(e) => setEndpointId(e.target.value)}
                    required
                  >
                    <option value="" disabled>
                      Select an endpoint
                    </option>
                    {endpoints.map((endpoint) => (
                      <option key={endpoint.id} value={endpoint.id}>
                        {endpoint.url} ({endpoint.status})
                      </option>
                    ))}
                  </select>
                )}
              </Field>
              <div className="fp-form-grid">
                <Field label="From" hint="Your browser's time zone.">
                  {(props) => (
                    <input
                      {...props}
                      className="fp-input"
                      type="datetime-local"
                      required
                      value={range.from}
                      onChange={(e) => setRange({ ...range, from: e.target.value })}
                    />
                  )}
                </Field>
                <Field label="To">
                  {(props) => (
                    <input
                      {...props}
                      className="fp-input"
                      type="datetime-local"
                      required
                      value={range.to}
                      onChange={(e) => setRange({ ...range, to: e.target.value })}
                    />
                  )}
                </Field>
              </div>
              <ChipGroup
                legend="Statuses to replay"
                options={REPLAYABLE_STATUSES}
                selected={statuses}
                onToggle={toggleStatus}
                labelFor={humanize}
              />
              <p className="fp-muted fp-xs">
                Defaults to <code>exhausted</code> — the one terminal failure state the dispatcher
                produces. Replaying a <code>succeeded</code> delivery is allowed but resends an event the
                receiver already accepted.
              </p>
              <div>
                <Button type="submit" variant="primary" icon="replay" loading={busy} disabled={!endpointId}>
                  {busy ? "Replaying…" : "Replay batch"}
                </Button>
              </div>
            </form>
          </div>
        </Card>

        <Card title="Result">
          {result ? (
            <div className="fp-stack fp-stack--sm">
              <Alert tone="success" title={`Matched ${result.matchedCount} deliver${result.matchedCount === 1 ? "y" : "ies"}`}>
                Queued {(result.replayedDeliveryIds ?? []).length} replay
                {(result.replayedDeliveryIds ?? []).length === 1 ? "" : "s"}. They are sent by the normal
                async dispatcher pass, not immediately by this request.
              </Alert>
              {(result.replayedDeliveryIds ?? []).length > 0 ? (
                <ul className="admin-id-list">
                  {(result.replayedDeliveryIds ?? []).map((id) => (
                    <li key={id}>
                      <code className="fp-mono">{id}</code>
                    </li>
                  ))}
                </ul>
              ) : null}
            </div>
          ) : (
            <EmptyState compact icon="inbox" title="No replay run yet">
              Results from this page&apos;s last replay appear here.
            </EmptyState>
          )}
        </Card>
      </div>
    </>
  );
}
