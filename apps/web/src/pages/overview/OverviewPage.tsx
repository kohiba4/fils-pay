import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import {
  Alert,
  Button,
  Card,
  EmptyState,
  Field,
  Loading,
  PageHeader,
  SegmentedControl,
  Tile,
  Tiles,
  buttonClass,
} from "@filspay/ui";
import { getPayoutTrends, getTopLinks, getVolumes } from "../../api/analytics.js";
import { describeError } from "../../api/client.js";
import { RequireRole } from "../../auth/RequireRole.js";
import { Money } from "../../components/Money.js";
import { StalenessBadge } from "../../components/StalenessBadge.js";
import { StatusBadge } from "../../components/StatusBadge.js";
import { bahrainWindow, dash, dateTime, sumFils } from "../../format.js";
import { batchStatus } from "../../status.js";
import { formatCount, pluralize } from "../../utils/helpers.js";
import type { PayoutTrendsResponse, TopLinksResponse, VolumesResponse } from "../../types.js";
import { OutcomeDonut } from "./OutcomeDonut.js";
import { PayoutLineChart } from "./PayoutLineChart.js";
import { VolumeChart } from "./VolumeChart.js";

/** 60s: comfortably above the reporting worker's 15s worst-case lag, and
 *  more than often enough for a dashboard. Poll, not push —
 *  there is no websocket or SSE anywhere in this platform, and this page does
 *  not introduce the first one. */
const POLL_MS = 60_000;

type RangeKey = "7d" | "30d" | "90d" | "custom";

const RANGES = [
  { value: "7d", label: "7D", ariaLabel: "Last 7 days" },
  { value: "30d", label: "30D", ariaLabel: "Last 30 days" },
  { value: "90d", label: "90D", ariaLabel: "Last 90 days" },
  { value: "custom", label: "Custom", ariaLabel: "Custom dates" },
] as const;

/** Integer total of counts — display only. */
function sumCounts(values: number[]): number {
  return values.reduce((total, value) => total + value, 0);
}

export function OverviewPage() {
  // "30D" sends no dates: the server applies its own "last 30 Asia/Bahrain
  // days" default and the client does not compute a competing one. 7D/90D
  // use the same convention (bahrainWindow); Custom sends what was typed.
  const [range, setRange] = useState<RangeKey>("30d");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [topLinksLimit, setTopLinksLimit] = useState(10);

  const [volumes, setVolumes] = useState<VolumesResponse | null>(null);
  const [payouts, setPayouts] = useState<PayoutTrendsResponse | null>(null);
  const [topLinks, setTopLinks] = useState<TopLinksResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Mirrors the server's own clamp so this page never displays a limit the
  // server would have silently overridden.
  const clampedLimit = Math.min(50, Math.max(1, Math.trunc(topLinksLimit) || 10));

  const win =
    range === "7d"
      ? bahrainWindow(7)
      : range === "90d"
        ? bahrainWindow(90)
        : range === "custom"
          ? { from, to }
          : { from: "", to: "" };
  const windowFrom = win.from;
  const windowTo = win.to;

  const load = useCallback(async () => {
    const query = { from: windowFrom || undefined, to: windowTo || undefined };
    setLoading(true);
    setError(null);
    try {
      // Three independent endpoints, three independent fetches — there is no
      // combined route to call.
      const [v, p, t] = await Promise.all([
        getVolumes(query),
        getPayoutTrends(query),
        getTopLinks({ ...query, limit: clampedLimit }),
      ]);
      setVolumes(v);
      setPayouts(p);
      setTopLinks(t);
    } catch (err) {
      setError(describeError(err));
    } finally {
      setLoading(false);
    }
  }, [windowFrom, windowTo, clampedLimit]);

  // overview memory leak (heap +40mb/hr), pretty sure its these effects — am
  // FH: profiled for 1h, heap flat. maybe it was a browser extension? open
  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    const timer = window.setInterval(() => void load(), POLL_MS);
    return () => window.clearInterval(timer);
  }, [load]);

  const volumePoints = volumes?.points ?? [];
  const payoutPoints = payouts?.points ?? [];
  const capturedCount = sumCounts(volumePoints.map((p) => p.capturedCount));
  const voidedCount = sumCounts(volumePoints.map((p) => p.voidedCount));
  const windowLabel =
    range === "custom"
      ? `${from || "…"} → ${to || "…"} (end exclusive)`
      : range === "30d"
        ? "Last 30 days, Asia/Bahrain"
        : `${windowFrom} → ${windowTo} (end exclusive), Asia/Bahrain`;

  return (
    <>
      <PageHeader
        title="Overview"
        description={windowLabel}
        actions={
          <div className="dash-overview-controls">
            <SegmentedControl legend="Time range" options={RANGES} value={range} onChange={setRange} />
            <Button variant="secondary" size="sm" icon="replay" loading={loading} onClick={() => void load()}>
              {loading ? "Refreshing…" : "Refresh"}
            </Button>
          </div>
        }
      />

      <div className="fp-stack">
        {range === "custom" ? (
          <div className="fp-toolbar" role="group" aria-label="Custom dates">
            <Field label="From">
              {(props) => (
                <input {...props} className="fp-input" type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
              )}
            </Field>
            <Field label="To (exclusive)">
              {(props) => (
                <input {...props} className="fp-input" type="date" value={to} onChange={(e) => setTo(e.target.value)} />
              )}
            </Field>
            <p className="dash-toolbar-note">
              Asia/Bahrain calendar dates. Leave either empty and the server fills in its default.
            </p>
          </div>
        ) : null}

        {error ? (
          <Alert
            tone="danger"
            title="Couldn't load the overview"
            actions={
              <Button size="sm" variant="secondary" icon="replay" onClick={() => void load()}>
                Try again
              </Button>
            }
          >
            {error}
          </Alert>
        ) : null}

        {!volumes && loading ? <Loading>Loading overview…</Loading> : null}

        {volumes && payouts ? (
          <div className="dash-overview-top">
            <Card glow className="dash-summary">
              <div className="dash-summary__head">
                <span className="fp-muted">Captured gross</span>
                <StalenessBadge readModelAsOf={volumes.readModelAsOf} live={volumes.live} compact />
              </div>
              <div className="dash-summary__figure">
                <Money fils={sumFils(volumePoints.map((p) => p.capturedGrossFils))} hero className="dash-highlight" />
              </div>
              <p className="dash-summary__meta">
                {formatCount(capturedCount)} captured · {formatCount(voidedCount)} voided payments in this window
              </p>
              <div className="dash-summary__actions">
                <RequireRole allow={["owner", "finance"]}>
                  <Link className={buttonClass({ variant: "primary" })} to="/dashboard/payment-links/new">
                    New payment link
                  </Link>
                </RequireRole>
                <Link className={buttonClass({ variant: "secondary" })} to="/dashboard/transactions">
                  View transactions
                </Link>
              </div>
            </Card>

            <Card className="dash-figure-card">
              <div className="dash-summary__head">
                <span className="fp-muted">Net payout</span>
                <StalenessBadge readModelAsOf={payouts.readModelAsOf} live={payouts.live} compact />
              </div>
              <div className="dash-figure-card__value">
                <Money fils={sumFils(payoutPoints.map((p) => p.netPayoutFils))} className="dash-highlight" />
              </div>
              <p className="dash-summary__meta">
                Across {pluralize(payoutPoints.length, "settlement batch", "settlement batches")} dated in this window
              </p>
            </Card>

            <Card className="dash-figure-card">
              <Tiles label="Window activity">
                <Tile selected value={formatCount(capturedCount)} label="Captured payments" />
                <Tile value={formatCount(voidedCount)} label="Voided payments" />
                <Tile value={formatCount(payoutPoints.length)} label="Settlement batches" />
                <Tile value={<Money fils={sumFils(payoutPoints.map((p) => p.feeFils))} />} label="Fees in batches" />
              </Tiles>
            </Card>
          </div>
        ) : null}

        {volumes && payouts ? (
          <div className="dash-overview-mid">
            <Card
              title="Net payout by batch"
              subtitle="BHD per settlement batch, oldest to newest"
              actions={<StalenessBadge readModelAsOf={payouts.readModelAsOf} live={payouts.live} compact />}
            >
              {payoutPoints.length > 0 ? (
                <PayoutLineChart points={payoutPoints} />
              ) : (
                <EmptyState compact icon="activity" title="No settlement batches in this window" />
              )}
            </Card>
            <Card
              title="Captured vs voided"
              subtitle="Payment count"
              actions={<StalenessBadge readModelAsOf={volumes.readModelAsOf} live={volumes.live} compact />}
            >
              {capturedCount + voidedCount > 0 ? (
                <OutcomeDonut captured={capturedCount} voided={voidedCount} />
              ) : (
                <EmptyState compact icon="activity" title="No captured or voided payments in this window" />
              )}
            </Card>
          </div>
        ) : null}

        {volumes ? (
          <Card
            title="Daily captured volume"
            subtitle="Captured gross per Asia/Bahrain day, BHD"
            actions={<StalenessBadge readModelAsOf={volumes.readModelAsOf} live={volumes.live} />}
          >
            {volumePoints.length > 0 ? (
              <div className="fp-stack">
                <VolumeChart points={volumePoints} />
                <details className="dash-table-details">
                  <summary>Daily figures as a table</summary>
                  <div className="fp-table-wrap">
                    <table className="fp-table">
                      <caption className="fp-sr-only">Daily captured volume</caption>
                      <thead>
                        <tr>
                          <th scope="col">Date</th>
                          <th scope="col" className="fp-num">Captured</th>
                          <th scope="col" className="fp-num">Gross</th>
                          <th scope="col" className="fp-num">Voided</th>
                        </tr>
                      </thead>
                      <tbody>
                        {volumePoints.map((point) => (
                          <tr key={point.date}>
                            <td className="fp-num">{point.date}</td>
                            <td className="fp-num">{formatCount(point.capturedCount)}</td>
                            <td className="fp-num">
                              <Money fils={point.capturedGrossFils} />
                            </td>
                            <td className="fp-num">{formatCount(point.voidedCount)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </details>
              </div>
            ) : (
              <EmptyState compact icon="activity" title="No captured volume in this window" />
            )}
          </Card>
        ) : null}

        {payouts ? (
          <Card
            flush
            title="Payout trends"
            subtitle={
              payoutPoints.length > 0 ? (
                <>
                  Net payout across {pluralize(payoutPoints.length, "batch", "batches")}:{" "}
                  <Money fils={sumFils(payoutPoints.map((p) => p.netPayoutFils))} />
                </>
              ) : undefined
            }
            actions={<StalenessBadge readModelAsOf={payouts.readModelAsOf} live={payouts.live} />}
          >
            <div className="fp-table-wrap">
              <table className="fp-table fp-table--hover fp-table--stack">
                <caption className="fp-sr-only">Payout trends</caption>
                <thead>
                  <tr>
                    <th scope="col">Batch date</th>
                    <th scope="col">Status</th>
                    <th scope="col" className="fp-num">Gross</th>
                    <th scope="col" className="fp-num">Fee</th>
                    <th scope="col" className="fp-num">Net payout</th>
                    <th scope="col">Paid</th>
                  </tr>
                </thead>
                <tbody>
                  {payoutPoints.map((point) => (
                    <tr key={point.settlementBatchId}>
                      <td className="fp-cell-head">
                        <Link className="fp-table__primary fp-num" to={`/dashboard/settlement/${point.settlementBatchId}`}>
                          {point.batchDate}
                        </Link>
                      </td>
                      <td data-label="Status">
                        <StatusBadge style={batchStatus(point.status)} raw={point.status} />
                      </td>
                      <td data-label="Gross" className="fp-num">
                        <Money fils={point.grossFils} />
                      </td>
                      <td data-label="Fee" className="fp-num">
                        <Money fils={point.feeFils} />
                      </td>
                      <td data-label="Net payout" className="fp-num dash-strong">
                        <Money fils={point.netPayoutFils} />
                      </td>
                      <td data-label="Paid">{dateTime(point.paidAt)}</td>
                    </tr>
                  ))}
                  {payoutPoints.length === 0 ? (
                    <tr className="fp-table__empty">
                      <td colSpan={6}>
                        <EmptyState compact icon="settlement" title="No settled batches in this window" />
                      </td>
                    </tr>
                  ) : null}
                </tbody>
              </table>
            </div>
          </Card>
        ) : null}

        {topLinks ? (
          <Card
            flush
            title="Top paid links"
            actions={
              <>
                <label className="dash-inline-field">
                  <span className="fp-muted fp-xs">Show (1–50)</span>
                  <input
                    className="fp-input fp-num dash-inline-field__input"
                    type="number"
                    min={1}
                    max={50}
                    value={topLinksLimit}
                    onChange={(e) => setTopLinksLimit(Number(e.target.value))}
                  />
                </label>
                <StalenessBadge readModelAsOf={topLinks.readModelAsOf} live={topLinks.live} />
              </>
            }
          >
            <div className="fp-table-wrap">
              <table className="fp-table fp-table--hover fp-table--stack">
                <caption className="fp-sr-only">Top paid payment links</caption>
                <thead>
                  <tr>
                    <th scope="col" className="fp-num">#</th>
                    <th scope="col">Reference</th>
                    <th scope="col">Description</th>
                    <th scope="col" className="fp-num">Amount</th>
                    <th scope="col">Paid at</th>
                  </tr>
                </thead>
                <tbody>
                  {topLinks.links.map((link, index) => (
                    <tr key={link.id}>
                      <td data-label="Rank" className="fp-num fp-muted">
                        {index + 1}
                      </td>
                      <td data-label="Reference">
                        <Link className="fp-table__primary dash-break" to={`/dashboard/payment-links/${link.id}`}>
                          {dash(link.reference)}
                        </Link>
                      </td>
                      <td data-label="Description" className="dash-clamp">
                        {dash(link.description)}
                      </td>
                      <td data-label="Amount" className="fp-num">
                        <Money fils={link.amountFils} />
                      </td>
                      <td data-label="Paid at">{dateTime(link.paidAt)}</td>
                    </tr>
                  ))}
                  {topLinks.links.length === 0 ? (
                    <tr className="fp-table__empty">
                      <td colSpan={5}>
                        <EmptyState compact icon="link" title="No paid payment links in this window" />
                      </td>
                    </tr>
                  ) : null}
                </tbody>
              </table>
            </div>
          </Card>
        ) : null}
      </div>
    </>
  );
}
