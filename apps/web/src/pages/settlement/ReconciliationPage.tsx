import { useCallback, useEffect, useState } from "react";
import {
  Alert,
  Badge,
  Button,
  Card,
  EmptyState,
  Field,
  Loading,
  Metric,
  PageHeader,
} from "@filspay/ui";
import { getReconciliation } from "../../api/settlement.js";
import { ApiError, describeError } from "../../api/client.js";
import { Money } from "../../components/Money.js";
import type { ReconciliationReport } from "../../types.js";

/**
 * `from`/`to` are required by this endpoint (`400 invalid_request` without
 * them), so the page arrives with a filled-in window rather than an empty form
 * that would 400 on first load. `to` is exclusive.
 *
 * The window is anchored to the Asia/Bahrain calendar date, not the viewer's
 * own, because that is the business day `settlement_batches.batch_date` is
 * keyed on — a browser in another timezone would otherwise default to a
 * window off by a day from the batches it's reconciling. Bahrain has observed
 * no DST since 1972, so a fixed +3h shift is exact; this is the same technique
 * apps/api's own analytics route uses.
 */
const BAHRAIN_OFFSET_MS = 3 * 60 * 60 * 1000;
const DAY_MS = 86_400_000;

function defaultRange(): { from: string; to: string } {
  const nowBahrain = Date.now() + BAHRAIN_OFFSET_MS;
  const day = (offsetDays: number): string =>
    new Date(nowBahrain + offsetDays * DAY_MS).toISOString().slice(0, 10);
  return { from: day(-30), to: day(1) };
}

// FH: 'explained: false' only shows when settlement is mid-run, a refresh fixes it
// YA: gap != 0 is real when a fee schedule changes mid-period
export function ReconciliationPage() {
  const initial = defaultRange();
  const [from, setFrom] = useState(initial.from);
  const [to, setTo] = useState(initial.to);
  const [applied, setApplied] = useState(initial);
  const [report, setReport] = useState<ReconciliationReport | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [forbidden, setForbidden] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    setForbidden(false);
    try {
      setReport(await getReconciliation(applied));
    } catch (err) {
      // The one page-specific error branch in this dashboard, because this is
      // the one merchant endpoint with a role gate narrower than "any
      // authenticated merchant user". A `support` user who typed or bookmarked
      // this URL gets a plain explanation — not a crash, not a blank
      // loading-forever state, and no retry.
      if (err instanceof ApiError && err.statusCode === 403) {
        setForbidden(true);
        setReport(null);
      } else {
        setError(describeError(err));
      }
    } finally {
      setLoading(false);
    }
  }, [applied]);

  useEffect(() => {
    void load();
  }, [load]);

  if (forbidden) {
    return (
      <>
        <PageHeader title="Reconciliation" />
        <Card>
          <EmptyState icon="lock" title="You don't have permission to view this report">
            Ask an owner or finance user on your account.
          </EmptyState>
        </Card>
      </>
    );
  }

  return (
    <>
      <PageHeader
        title="Reconciliation"
        description="Checks that every captured fil is accounted for: either paid out in a settlement batch or still pending."
      />

      <div className="fp-stack">
        <form
          className="fp-toolbar"
          aria-label="Report period"
          onSubmit={(e) => {
            e.preventDefault();
            setApplied({ from, to });
          }}
        >
          <Field label="From">
            {(props) => (
              <input {...props} className="fp-input" type="date" required value={from} onChange={(e) => setFrom(e.target.value)} />
            )}
          </Field>
          <Field label="To (exclusive)">
            {(props) => (
              <input {...props} className="fp-input" type="date" required value={to} onChange={(e) => setTo(e.target.value)} />
            )}
          </Field>
          <div className="fp-toolbar__actions">
            <Button type="submit" variant="primary" loading={loading}>
              {loading ? "Loading…" : "Run report"}
            </Button>
          </div>
          <p className="dash-toolbar-note">
            Dates are Asia/Bahrain business days. The default window is the last 30 days.
          </p>
        </form>

        {error ? (
          <Alert tone="danger" title="Couldn't run the report">
            {error}
          </Alert>
        ) : null}

        {loading && !report ? <Loading>Running report…</Loading> : null}

        {report ? (
          <>
            {/* A nonzero gap is shown as a nonzero gap. This page never rounds
                it away, hides it behind a tolerance, or explains it as expected —
                the endpoint reports honestly and so does this. */}
            <Card
              title={
                <span className="fp-num">
                  {report.periodFrom} → {report.periodTo}
                </span>
              }
              subtitle="Period end is exclusive."
              actions={
                report.explained ? (
                  <Badge tone="success" icon="checkCircle">
                    Reconciled — no gap
                  </Badge>
                ) : (
                  <Badge tone="warning" icon="alert">
                    Gap: <Money fils={report.gapFils} />
                  </Badge>
                )
              }
            >
              <div className="dash-equation" aria-label="Gap equals ledger merchant payable minus settlement net payout minus pending unbatched">
                <Metric label="Ledger merchant payable (net)" value={<Money fils={report.ledgerMerchantPayableNetFils} />} />
                <span className="dash-equation__op" aria-hidden="true">−</span>
                <Metric label="Settlement net payout" value={<Money fils={report.settlementNetPayoutFils} />} />
                <span className="dash-equation__op" aria-hidden="true">−</span>
                <Metric
                  label="Pending, not yet batched"
                  value={<Money fils={report.pendingUnbatchedFils} />}
                  meta={
                    report.refundTimingFils > 0 ? (
                      <>
                        Includes refunds made in this period that no batch of the period has absorbed yet:{" "}
                        <Money fils={report.refundTimingFils} />
                      </>
                    ) : report.refundTimingFils < 0 ? (
                      <>
                        Includes refunds made earlier that a batch of this period absorbed:{" "}
                        <Money fils={-report.refundTimingFils} />
                      </>
                    ) : undefined
                  }
                />
                <span className="dash-equation__op" aria-hidden="true">=</span>
                <Metric label="Gap" value={<Money fils={report.gapFils} />} accent={report.gapFils !== 0} />
              </div>
              <p className="fp-muted fp-small dash-equation__note">
                Gap = ledger merchant payable − settlement net payout − pending unbatched. A zero gap
                means every captured fil is accounted for in either a settled batch or the pending
                queue.
              </p>
            </Card>
          </>
        ) : null}
      </div>
    </>
  );
}
