import { useState } from "react";
import {
  Alert,
  Button,
  Card,
  ConfirmDialog,
  EmptyState,
  Field,
  PageHeader,
} from "@filspay/ui";
import { rebuildAnalytics, rebuildBalances, runBatch } from "../../api/settlement.js";
import { recalculateMdr } from "../../api/mdrRecalculation.js";
import { describeError } from "../../api/client.js";
import { bahrainYesterday } from "../../lib/bahrainDate.js";
import { RequireRole } from "../../auth/RequireRole.js";
import { Money } from "../../components/Money.js";
import { StatusBadge } from "../../components/StatusBadge.js";
import type {
  AnalyticsRebuildSummary,
  BalanceRebuildSummary,
  MdrRecalcSummary,
  RunBatchSummary,
} from "../../types.js";

/**
 * The two cross-process operations. Both are `finance` /
 * `super_admin` server-side; both write their audit row *before* the call
 * crosses the network, so an attempt is on record even if the settlement
 * service never answers.
 *
 * The analytics rebuild at the bottom is the same role gate and the same
 * confirm-before-you-run shape, but it never leaves apps/api — it is one
 * transaction of SQL, so its audit row is simply part of that transaction.
 *
 * Every action on this page now asks for confirmation in a dialog before it
 * runs, including the batch run and the MDR recalculation, which move money.
 */
export function SettlementPage() {
  const [date, setDate] = useState(bahrainYesterday());
  const [merchantId, setMerchantId] = useState("");
  const [runBusy, setRunBusy] = useState(false);
  const [runError, setRunError] = useState<string | null>(null);
  const [runResult, setRunResult] = useState<RunBatchSummary | null>(null);
  const [confirmingRun, setConfirmingRun] = useState(false);

  const [confirmingRebuild, setConfirmingRebuild] = useState(false);
  const [rebuildBusy, setRebuildBusy] = useState(false);
  const [rebuildError, setRebuildError] = useState<string | null>(null);
  const [rebuildResult, setRebuildResult] = useState<BalanceRebuildSummary | null>(null);

  const [confirmingAnalytics, setConfirmingAnalytics] = useState(false);
  const [analyticsBusy, setAnalyticsBusy] = useState(false);
  const [analyticsError, setAnalyticsError] = useState<string | null>(null);
  const [analyticsResult, setAnalyticsResult] = useState<AnalyticsRebuildSummary | null>(null);

  const [mdrMerchantId, setMdrMerchantId] = useState("");
  const [mdrFrom, setMdrFrom] = useState("");
  const [mdrTo, setMdrTo] = useState("");
  const [mdrBusy, setMdrBusy] = useState(false);
  const [mdrError, setMdrError] = useState<string | null>(null);
  const [mdrResult, setMdrResult] = useState<MdrRecalcSummary | null>(null);
  const [confirmingMdr, setConfirmingMdr] = useState(false);

  /** Idempotent per business date: re-running returns the already-closed batches. */
  async function handleRunBatch(): Promise<void> {
    setRunBusy(true);
    setRunError(null);
    setRunResult(null);
    try {
      setRunResult(
        await runBatch({ date, merchantId: merchantId.trim() ? merchantId.trim() : undefined }),
      );
    } catch (err) {
      setRunError(describeError(err));
    } finally {
      setRunBusy(false);
      setConfirmingRun(false);
    }
  }

  // after clicking rebuild on staging alpha's balance jumped to like 3x?? — am
  // MK: staging data is junk. cache-only, safe to click
  async function handleRebuild(): Promise<void> {
    setRebuildBusy(true);
    setRebuildError(null);
    setRebuildResult(null);
    try {
      setRebuildResult(await rebuildBalances());
      setConfirmingRebuild(false);
    } catch (err) {
      setConfirmingRebuild(false);
      setRebuildError(describeError(err));
    } finally {
      setRebuildBusy(false);
    }
  }

  async function handleRebuildAnalytics(): Promise<void> {
    setAnalyticsBusy(true);
    setAnalyticsError(null);
    setAnalyticsResult(null);
    try {
      setAnalyticsResult(await rebuildAnalytics());
      setConfirmingAnalytics(false);
    } catch (err) {
      setConfirmingAnalytics(false);
      setAnalyticsError(describeError(err));
    } finally {
      setAnalyticsBusy(false);
    }
  }

  // FH: ADMIN.md says this is safe
  async function handleRecalculateMdr(): Promise<void> {
    setMdrBusy(true);
    setMdrError(null);
    setMdrResult(null);
    try {
      setMdrResult(await recalculateMdr(mdrMerchantId.trim(), { from: mdrFrom, to: mdrTo }));
    } catch (err) {
      setMdrError(describeError(err));
    } finally {
      setMdrBusy(false);
      setConfirmingMdr(false);
    }
  }

  const runResults = runResult?.merchantResults ?? [];
  const mdrAdjusted = mdrResult?.adjusted ?? [];
  const financeOnly = (message: string) => (
    <EmptyState compact icon="lock" title="Finance role required">
      {message}
    </EmptyState>
  );

  return (
    <>
      <PageHeader
        title="Settlement ops"
        titleSuffix="FilsPay Admin"
        description={
          <>
            Every action below is money-adjacent and is gated server-side to the{" "}
            <code>finance</code> and <code>super_admin</code> roles. Every invocation is written to the
            admin audit log before it runs.
          </>
        }
      />

      <div className="admin-actions-grid">
        <Card
          title="Re-run a daily batch"
          tone="caution"
          tag="Moves money"
          subtitle="Closes and pays out the batch for one business date. Running a date that is already closed or paid is safe — the settlement service reports it as already-done rather than doing it twice."
        >
          <RequireRole
            allow={["finance", "super_admin"]}
            fallback={financeOnly("Your role cannot trigger settlement runs. Ask a finance admin.")}
          >
            <form
              className="fp-form"
              onSubmit={(e) => {
                e.preventDefault();
                setConfirmingRun(true);
              }}
            >
              <Field label="Business date" hint="Asia/Bahrain business day. Defaults to yesterday.">
                {(props) => (
                  <input {...props} className="fp-input" type="date" required value={date} onChange={(e) => setDate(e.target.value)} />
                )}
              </Field>
              <Field label="Merchant id" optional hint="Leave blank to run every eligible merchant.">
                {(props) => (
                  <input
                    {...props}
                    className="fp-input fp-input--mono"
                    type="text"
                    placeholder="00000000-0000-0000-0000-000000000000"
                    value={merchantId}
                    onChange={(e) => setMerchantId(e.target.value)}
                  />
                )}
              </Field>
              <div>
                <Button type="submit" variant="primary" icon="play" disabled={runBusy}>
                  Run batch…
                </Button>
              </div>
            </form>
          </RequireRole>

          {runError ? (
            <Alert tone="danger" title="The batch run failed" className="admin-result">
              {runError}
            </Alert>
          ) : null}
          {runResult ? (
            <div className="admin-result">
              <Alert tone="success" title={`Batch run for ${runResult.businessDate}`}>
                {runResults.length} merchant{runResults.length === 1 ? "" : "s"} processed.
              </Alert>
              {runResults.length > 0 ? (
                <div className="fp-table-wrap">
                  <table className="fp-table fp-table--stack">
                    <caption className="fp-sr-only">Batch run results</caption>
                    <thead>
                      <tr>
                        <th scope="col">Merchant / batch</th>
                        <th scope="col" className="fp-num">Gross</th>
                        <th scope="col" className="fp-num">Fee</th>
                        <th scope="col" className="fp-num">Net payout</th>
                        <th scope="col">Already</th>
                      </tr>
                    </thead>
                    <tbody>
                      {runResults.map((outcome) => (
                        <tr key={`${outcome.merchantId}-${outcome.batchId}`}>
                          <td className="fp-cell-head">
                            <code className="fp-mono">{outcome.merchantId}</code>
                            <span className="fp-table__sub">
                              batch <code className="fp-mono">{outcome.batchId}</code>
                            </span>
                          </td>
                          <td data-label="Gross" className="fp-num">
                            <Money fils={outcome.grossFils} />
                          </td>
                          <td data-label="Fee" className="fp-num">
                            <Money fils={outcome.feeFils} />
                          </td>
                          <td data-label="Net payout" className="fp-num">
                            <Money fils={outcome.netPayoutFils} />
                          </td>
                          <td data-label="Already">
                            closed: {outcome.alreadyClosed ? "yes" : "no"} · paid: {outcome.alreadyPaid ? "yes" : "no"}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : null}
            </div>
          ) : null}
        </Card>

        <Card
          title="Recalculate MDR"
          tone="caution"
          tag="Moves money"
          subtitle="Re-derives one merchant's settlement-batch fees over a date range at their current contracted rate, and posts a ledger adjustment for any difference. Finance runs this after a rate change lands so historical batches reflect the same figure a fresh reconciliation would show."
        >
          <RequireRole
            allow={["finance", "super_admin"]}
            fallback={financeOnly("Your role cannot run an MDR recalculation. Ask a finance admin.")}
          >
            <form
              className="fp-form"
              onSubmit={(e) => {
                e.preventDefault();
                setConfirmingMdr(true);
              }}
            >
              <Field label="Merchant id">
                {(props) => (
                  <input
                    {...props}
                    className="fp-input fp-input--mono"
                    value={mdrMerchantId}
                    onChange={(e) => setMdrMerchantId(e.target.value)}
                    placeholder="merchant UUID"
                    required
                  />
                )}
              </Field>
              <div className="fp-form-grid">
                <Field label="From (inclusive)">
                  {(props) => (
                    <input {...props} className="fp-input" type="date" value={mdrFrom} onChange={(e) => setMdrFrom(e.target.value)} required />
                  )}
                </Field>
                <Field label="To (exclusive)">
                  {(props) => (
                    <input {...props} className="fp-input" type="date" value={mdrTo} onChange={(e) => setMdrTo(e.target.value)} required />
                  )}
                </Field>
              </div>
              <div>
                <Button type="submit" variant="primary" icon="coins" disabled={mdrBusy}>
                  Recalculate MDR…
                </Button>
              </div>
            </form>
          </RequireRole>

          {mdrError ? (
            <Alert tone="danger" title="The recalculation failed" className="admin-result">
              {mdrError}
            </Alert>
          ) : null}
          {mdrResult ? (
            <div className="admin-result">
              <Alert tone="success" title="Recalculation complete">
                Considered {mdrResult.batchesConsidered} batch(es); {mdrAdjusted.length} had a fee change.
              </Alert>
              {mdrAdjusted.length > 0 ? (
                <div className="fp-table-wrap">
                  <table className="fp-table fp-table--stack">
                    <caption className="fp-sr-only">Fee adjustments</caption>
                    <thead>
                      <tr>
                        <th scope="col">Batch date</th>
                        <th scope="col">Status</th>
                        <th scope="col" className="fp-num">Old fee</th>
                        <th scope="col" className="fp-num">New fee</th>
                        <th scope="col" className="fp-num">Difference</th>
                      </tr>
                    </thead>
                    <tbody>
                      {mdrAdjusted.map((adjustment) => (
                        <tr key={adjustment.batchId}>
                          <td className="fp-cell-head fp-num">{adjustment.batchDate}</td>
                          <td data-label="Status">
                            <StatusBadge kind="batch" value={adjustment.status} />
                          </td>
                          <td data-label="Old fee" className="fp-num">
                            <Money fils={adjustment.oldFeeFils} />
                          </td>
                          <td data-label="New fee" className="fp-num">
                            <Money fils={adjustment.newFeeFils} />
                          </td>
                          <td data-label="Difference" className="fp-num">
                            <Money fils={adjustment.diffFils} />
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <p className="fp-muted fp-small">Every batch in range already matched the current rate.</p>
              )}
            </div>
          ) : null}
        </Card>

        <Card
          title="Rebuild cached balances"
          tone="caution"
          tag="Platform-wide"
          tagIcon="store"
          subtitle={
            <>
              Recomputes every merchant&apos;s cached payable balance from <code>ledger_entries</code>,
              the authoritative record. The ledger itself is only read, never written — but this
              touches every merchant on the platform at once, so it asks before it runs.
            </>
          }
        >
          <RequireRole
            allow={["finance", "super_admin"]}
            fallback={financeOnly("Your role cannot rebuild balances. Ask a finance admin.")}
          >
            <Button variant="secondary" icon="replay" onClick={() => setConfirmingRebuild(true)}>
              Rebuild balances…
            </Button>
          </RequireRole>

          {rebuildError ? (
            <Alert tone="danger" title="The rebuild failed" className="admin-result">
              {rebuildError}
            </Alert>
          ) : null}
          {rebuildResult ? (
            <div className="admin-result">
              <Alert tone="success" title="Balances rebuilt">
                Rebuilt {rebuildResult.rebuiltCount} balance
                {rebuildResult.rebuiltCount === 1 ? "" : "s"}; {(rebuildResult.changed ?? []).length} changed.
              </Alert>
              {(rebuildResult.changed ?? []).length > 0 ? (
                <div className="fp-table-wrap">
                  <table className="fp-table fp-table--stack">
                    <caption className="fp-sr-only">Changed balances</caption>
                    <thead>
                      <tr>
                        <th scope="col">Merchant</th>
                        <th scope="col" className="fp-num">Before</th>
                        <th scope="col" className="fp-num">After</th>
                      </tr>
                    </thead>
                    <tbody>
                      {(rebuildResult.changed ?? []).map((change) => (
                        <tr key={change.merchantId}>
                          <td className="fp-cell-head">
                            <code className="fp-mono">{change.merchantId}</code>
                          </td>
                          <td data-label="Before" className="fp-num">
                            <Money fils={change.before} />
                          </td>
                          <td data-label="After" className="fp-num">
                            <Money fils={change.after} />
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <p className="fp-muted fp-small">Every cached balance already matched the ledger.</p>
              )}
            </div>
          ) : null}
        </Card>

        <Card
          title="Rebuild analytics"
          tone="caution"
          tag="Platform-wide"
          tagIcon="store"
          subtitle="Recomputes the analytics read model — daily volumes and payout trends — from scratch, for when a merchant reports their dashboard looking behind and you would rather not wait for the reporting worker to catch up. Like the balance rebuild, it touches every merchant at once, so it asks before it runs."
        >
          <RequireRole
            allow={["finance", "super_admin"]}
            fallback={financeOnly("Your role cannot rebuild analytics. Ask a finance admin.")}
          >
            <Button variant="secondary" icon="activity" onClick={() => setConfirmingAnalytics(true)}>
              Rebuild analytics…
            </Button>
          </RequireRole>

          {analyticsError ? (
            <Alert tone="danger" title="The rebuild failed" className="admin-result">
              {analyticsError}
            </Alert>
          ) : null}
          {analyticsResult ? (
            <Alert tone="success" title="Analytics rebuilt" className="admin-result">
              Rebuilt {analyticsResult.volumeRows} daily-volume row
              {analyticsResult.volumeRows === 1 ? "" : "s"} and {analyticsResult.trendRows} payout-trend
              row{analyticsResult.trendRows === 1 ? "" : "s"}.
            </Alert>
          ) : null}
        </Card>
      </div>

      <ConfirmDialog
        open={confirmingRun}
        title={`Run the batch for ${date}?`}
        tone="warning"
        confirmLabel="Run batch"
        busyLabel="Running…"
        busy={runBusy}
        onConfirm={() => void handleRunBatch()}
        onCancel={() => setConfirmingRun(false)}
      >
        <p>
          Closes and pays out the {date} batch for{" "}
          {merchantId.trim() ? (
            <code className="fp-mono">{merchantId.trim()}</code>
          ) : (
            <strong>every eligible merchant</strong>
          )}
          . Already-closed or paid batches are reported, not repeated.
        </p>
      </ConfirmDialog>

      <ConfirmDialog
        open={confirmingMdr}
        title="Recalculate MDR and post adjustments?"
        tone="warning"
        confirmLabel="Recalculate MDR"
        busyLabel="Recalculating…"
        busy={mdrBusy}
        onConfirm={() => void handleRecalculateMdr()}
        onCancel={() => setConfirmingMdr(false)}
      >
        <p>
          Batches for <code className="fp-mono">{mdrMerchantId.trim()}</code> from {mdrFrom} to {mdrTo}{" "}
          (exclusive) are re-priced at the current contracted rate, and a ledger adjustment is posted
          for any difference.
        </p>
      </ConfirmDialog>

      <ConfirmDialog
        open={confirmingRebuild}
        title="Rebuild balances for every merchant?"
        tone="warning"
        confirmLabel="Yes, rebuild all balances"
        busyLabel="Rebuilding…"
        busy={rebuildBusy}
        onConfirm={() => void handleRebuild()}
        onCancel={() => setConfirmingRebuild(false)}
      >
        <p>
          This recalculates all cached payable balances and records the action in the admin audit log.
        </p>
      </ConfirmDialog>

      <ConfirmDialog
        open={confirmingAnalytics}
        title="Rebuild analytics for every merchant?"
        tone="warning"
        confirmLabel="Yes, rebuild analytics"
        busyLabel="Rebuilding…"
        busy={analyticsBusy}
        onConfirm={() => void handleRebuildAnalytics()}
        onCancel={() => setConfirmingAnalytics(false)}
      >
        <p>
          This replaces both rollup tables with a fresh recompute and records the action in the admin
          audit log.
        </p>
      </ConfirmDialog>
    </>
  );
}
