import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import {
  Alert,
  Button,
  Card,
  ChipGroup,
  EmptyState,
  Field,
  PageHeader,
  SkeletonRows,
  Spinner,
} from "@filspay/ui";
import { listSettlementBatches } from "../../api/settlement.js";
import { describeError } from "../../api/client.js";
import { Money } from "../../components/Money.js";
import { Pagination } from "../../components/Pagination.js";
import { StatusBadge } from "../../components/StatusBadge.js";
import { dateTime } from "../../format.js";
import { batchStatus } from "../../status.js";
import { pluralize } from "../../utils/helpers.js";
import type { SettlementBatchDto, SettlementBatchStatus } from "../../types.js";

const STATUSES: SettlementBatchStatus[] = ["open", "closed", "paid"];
const PAGE_SIZE = 25;
const COLUMNS = 8;

/**
 * `GET /v1/settlement/batches` — `requireMerchantAuth` with no role
 * restriction — a batch list is not as sensitive as the reconciliation
 * report.
 *
 * `from`/`to` bound `batch_date`, a plain DATE column, so the raw YYYY-MM-DD
 * value from the date input goes through unchanged — no instant conversion,
 * because there is no timezone in the column to convert against.
 */
/** Filters by batch_date, which is a Bahrain business date. */
export function SettlementBatchListPage() {
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [statuses, setStatuses] = useState<SettlementBatchStatus[]>([]);
  const [batches, setBatches] = useState<SettlementBatchDto[]>([]);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadedOnce, setLoadedOnce] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(
    async (cursor: string | null) => {
      setLoading(true);
      setError(null);
      try {
        const result = await listSettlementBatches({
          from: from || undefined,
          to: to || undefined,
          status: statuses.length > 0 ? statuses : undefined,
          limit: PAGE_SIZE,
          cursor: cursor ?? undefined,
        });
        setBatches((previous) => (cursor ? [...previous, ...result.batches] : result.batches));
        setNextCursor(result.nextCursor);
        setLoadedOnce(true);
      } catch (err) {
        setError(describeError(err));
      } finally {
        setLoading(false);
      }
    },
    [from, to, statuses],
  );

  useEffect(() => {
    void load(null);
  }, [load]);

  function toggleStatus(status: SettlementBatchStatus): void {
    setStatuses((previous) =>
      previous.includes(status) ? previous.filter((s) => s !== status) : [...previous, status],
    );
  }

  const filtersActive = from !== "" || to !== "" || statuses.length > 0;

  function clearFilters(): void {
    setFrom("");
    setTo("");
    setStatuses([]);
  }

  return (
    <>
      <PageHeader
        title="Settlement"
        description="Daily payout batches: what was captured, the fees taken, refunds absorbed, and the net paid to you."
      />

      <div className="fp-stack">
        <div className="fp-toolbar" role="search" aria-label="Filter settlement batches">
          <Field label="Batch date from">
            {(props) => (
              <input {...props} className="fp-input" type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
            )}
          </Field>
          <Field label="To (exclusive)">
            {(props) => (
              <input {...props} className="fp-input" type="date" value={to} onChange={(e) => setTo(e.target.value)} />
            )}
          </Field>
          <div className="dash-toolbar-row">
            <ChipGroup
              legend="Status"
              options={STATUSES}
              selected={statuses}
              onToggle={toggleStatus}
              labelFor={(status) => (status === "closed" ? "Closed" : batchStatus(status).label)}
            />
            {filtersActive ? (
              <Button variant="ghost" size="sm" icon="close" onClick={clearFilters}>
                Clear filters
              </Button>
            ) : null}
          </div>
          <p className="dash-toolbar-note">Batch dates are Asia/Bahrain business days.</p>
        </div>

        {error ? (
          <Alert
            tone="danger"
            title="Couldn't load settlement batches"
            actions={
              <Button size="sm" variant="secondary" icon="replay" onClick={() => void load(null)}>
                Try again
              </Button>
            }
          >
            {error}
          </Alert>
        ) : null}

        <Card
          flush
          title="Batches"
          subtitle={loadedOnce ? `${pluralize(batches.length, "batch", "batches")} loaded` : "Loading…"}
          actions={loading && loadedOnce ? <Spinner label="Refreshing" /> : undefined}
        >
          <div className="fp-table-wrap">
            <table className="fp-table fp-table--hover fp-table--stack">
              <caption className="fp-sr-only">Settlement batches</caption>
              <thead>
                <tr>
                  <th scope="col">Batch date</th>
                  <th scope="col">Status</th>
                  <th scope="col" className="fp-num">Gross</th>
                  <th scope="col" className="fp-num">Fee</th>
                  <th scope="col" className="fp-num">Refunds</th>
                  <th scope="col" className="fp-num">Net payout</th>
                  <th scope="col">Closed</th>
                  <th scope="col">Paid</th>
                </tr>
              </thead>
              <tbody>
                {loading && !loadedOnce ? <SkeletonRows columns={COLUMNS} /> : null}
                {batches.map((batch) => (
                  <tr key={batch.id}>
                    <td className="fp-cell-head">
                      <Link className="fp-table__primary fp-num" to={`/dashboard/settlement/${batch.id}`}>
                        {batch.batchDate}
                      </Link>
                    </td>
                    <td data-label="Status">
                      <StatusBadge style={batchStatus(batch.status)} raw={batch.status} />
                    </td>
                    <td data-label="Gross" className="fp-num">
                      <Money fils={batch.grossFils} />
                    </td>
                    <td data-label="Fee" className="fp-num">
                      <Money fils={batch.feeFils} />
                    </td>
                    <td data-label="Refunds" className="fp-num">
                      <Money fils={batch.refundFils} />
                    </td>
                    <td data-label="Net payout" className="fp-num dash-strong">
                      <Money fils={batch.netPayoutFils} />
                    </td>
                    <td data-label="Closed">{dateTime(batch.closedAt)}</td>
                    <td data-label="Paid">{dateTime(batch.paidAt)}</td>
                  </tr>
                ))}
                {batches.length === 0 && !loading && !error ? (
                  <tr className="fp-table__empty">
                    <td colSpan={COLUMNS}>
                      <EmptyState
                        icon="settlement"
                        title={filtersActive ? "No settlement batches match these filters" : "No settlement batches yet"}
                        action={
                          filtersActive ? (
                            <Button variant="secondary" size="sm" onClick={clearFilters}>
                              Clear filters
                            </Button>
                          ) : undefined
                        }
                      >
                        {filtersActive ? null : "Batches appear after the first business day with captured payments closes."}
                      </EmptyState>
                    </td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>
          {nextCursor ? (
            <div className="fp-table-footer">
              <span>Showing {pluralize(batches.length, "batch", "batches")}</span>
              <Pagination nextCursor={nextCursor} loading={loading} onLoadMore={() => void load(nextCursor)} />
            </div>
          ) : null}
        </Card>
      </div>
    </>
  );
}
