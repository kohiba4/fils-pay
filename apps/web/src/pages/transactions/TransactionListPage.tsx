import { useCallback, useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import type { MouseEvent } from "react";
import {
  Alert,
  Button,
  Card,
  ChipGroup,
  EmptyState,
  Field,
  Icon,
  PageHeader,
  SkeletonRows,
  Spinner,
} from "@filspay/ui";
import { listTransactions } from "../../api/transactions.js";
import { describeError } from "../../api/client.js";
import { Money } from "../../components/Money.js";
import { Pagination } from "../../components/Pagination.js";
import { StatusBadge } from "../../components/StatusBadge.js";
import { dash, dateOnly, dayStartIso, timeOnly } from "../../format.js";
import { transactionStatus } from "../../status.js";
import { pluralize, truncateMiddle } from "../../utils/helpers.js";
import type { TransactionDto, TransactionStatus } from "../../types.js";

const STATUSES: TransactionStatus[] = [
  "authorized",
  "captured",
  "partially_captured",
  "voided",
  "partially_refunded",
  "refunded",
  "chargeback",
];

const PAGE_SIZE = 25;
const SEARCH_DEBOUNCE_MS = 300;
const COLUMNS = 6;

/** Lets a mouse click anywhere on a row open it, without stealing clicks
 *  from the links and buttons inside. Keyboard users use the row's link. */
function isInteractive(target: EventTarget | null): boolean {
  return target instanceof Element && target.closest("a, button, input, select, textarea, summary") !== null;
}

/**
 * `GET /v1/transactions`. Every control here is a real server-side
 * query param — nothing fetches an unfiltered page and narrows it in the
 * browser, which would both lie about the result count and break pagination.
 */
// YA: from/to are UTC day starts, see dayStartIso
export function TransactionListPage() {
  const navigate = useNavigate();
  const [statuses, setStatuses] = useState<TransactionStatus[]>([]);
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [searchInput, setSearchInput] = useState("");
  const [search, setSearch] = useState("");

  const [transactions, setTransactions] = useState<TransactionDto[]>([]);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [loadedOnce, setLoadedOnce] = useState(false);

  // Debounce only the text box — the checkbox/date controls fire immediately,
  // since those are discrete choices, not a stream of keystrokes.
  useEffect(() => {
    const timer = window.setTimeout(() => setSearch(searchInput.trim()), SEARCH_DEBOUNCE_MS);
    return () => window.clearTimeout(timer);
  }, [searchInput]);

  const load = useCallback(
    async (cursor: string | null) => {
      setLoading(true);
      setError(null);
      try {
        const result = await listTransactions({
          status: statuses.length > 0 ? statuses : undefined,
          from: dayStartIso(from),
          to: dayStartIso(to),
          search: search || undefined,
          limit: PAGE_SIZE,
          cursor: cursor ?? undefined,
        });
        setTransactions((previous) =>
          cursor ? [...previous, ...result.transactions] : result.transactions,
        );
        setNextCursor(result.nextCursor);
        setLoadedOnce(true);
      } catch (err) {
        setError(describeError(err));
      } finally {
        setLoading(false);
      }
    },
    [statuses, from, to, search],
  );

  useEffect(() => {
    void load(null);
  }, [load]);

  function toggleStatus(status: TransactionStatus): void {
    setStatuses((previous) =>
      previous.includes(status) ? previous.filter((s) => s !== status) : [...previous, status],
    );
  }

  const filtersActive = statuses.length > 0 || from !== "" || to !== "" || searchInput.trim() !== "";

  function clearFilters(): void {
    setStatuses([]);
    setFrom("");
    setTo("");
    setSearchInput("");
    setSearch("");
  }

  function openRow(event: MouseEvent<HTMLTableRowElement>, id: string): void {
    if (isInteractive(event.target) || window.getSelection()?.toString()) return;
    navigate(`/dashboard/transactions/${id}`);
  }

  const firstLoad = loading && !loadedOnce;

  return (
    <>
      <PageHeader
        title="Transactions"
        description="Card payments on this account. Every filter is applied by the server, so counts and pages stay accurate."
      />

      <div className="fp-stack">
        <div className="fp-toolbar" role="search" aria-label="Filter transactions">
          <Field label="Search" grow>
            {(props) => (
              <div className="fp-input-group">
                <Icon name="search" size={16} className="fp-input-group__icon" />
                <input
                  {...props}
                  className="fp-input"
                  type="search"
                  placeholder="Reference, acquirer reference, or transaction ID"
                  value={searchInput}
                  onChange={(e) => setSearchInput(e.target.value)}
                />
              </div>
            )}
          </Field>
          <Field label="From">
            {(props) => (
              <input {...props} className="fp-input" type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
            )}
          </Field>
          {/* Exclusive, because the endpoint's own predicate is
              `occurred_at < to` — labelled rather than quietly shifted by a
              day here, which would make this page and the API disagree about
              what a filter means. */}
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
              labelFor={(status) => transactionStatus(status).label}
            />
            {filtersActive ? (
              <Button variant="ghost" size="sm" icon="close" onClick={clearFilters}>
                Clear filters
              </Button>
            ) : null}
          </div>
          <p className="dash-toolbar-note">Date filters start at 00:00 UTC on the chosen day.</p>
        </div>

        {error ? (
          <Alert
            tone="danger"
            title="Couldn't load transactions"
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
          title="Results"
          subtitle={loadedOnce ? `${pluralize(transactions.length, "transaction")} loaded` : "Loading…"}
          actions={loading && loadedOnce ? <Spinner label="Refreshing" /> : undefined}
        >
          <div className="fp-table-wrap">
            <table className="fp-table fp-table--hover fp-table--stack">
              <caption className="fp-sr-only">Transactions</caption>
              <thead>
                <tr>
                  <th scope="col">Occurred</th>
                  <th scope="col">Reference</th>
                  <th scope="col">Status</th>
                  <th scope="col" className="fp-num">
                    Authorized
                  </th>
                  <th scope="col" className="fp-num">
                    Captured
                  </th>
                  <th scope="col">Acquirer reference</th>
                </tr>
              </thead>
              <tbody>
                {firstLoad ? <SkeletonRows columns={COLUMNS} /> : null}
                {transactions.map((txn) => (
                  <tr key={txn.id} className="dash-row-link" onClick={(event) => openRow(event, txn.id)}>
                    <td className="fp-cell-head">
                      <Link className="fp-table__primary" to={`/dashboard/transactions/${txn.id}`}>
                        {dateOnly(txn.occurredAt)}
                      </Link>
                      <span className="fp-table__sub">{timeOnly(txn.occurredAt)}</span>
                    </td>
                    <td data-label="Reference">{dash(txn.reference)}</td>
                    <td data-label="Status">
                      <StatusBadge style={transactionStatus(txn.status)} raw={txn.status} />
                    </td>
                    <td data-label="Authorized" className="fp-num">
                      <Money fils={txn.amountFils} />
                    </td>
                    <td data-label="Captured" className="fp-num">
                      <Money fils={txn.capturedFils} />
                    </td>
                    <td data-label="Acquirer ref.">
                      <code className="fp-mono" title={txn.acquirerReference}>
                        {truncateMiddle(txn.acquirerReference, 20)}
                      </code>
                    </td>
                  </tr>
                ))}
                {transactions.length === 0 && !loading && !error ? (
                  <tr className="fp-table__empty">
                    <td colSpan={COLUMNS}>
                      {filtersActive ? (
                        <EmptyState
                          icon="filter"
                          title="No transactions match these filters"
                          action={
                            <Button variant="secondary" size="sm" onClick={clearFilters}>
                              Clear filters
                            </Button>
                          }
                        >
                          Try a wider date range or fewer statuses.
                        </EmptyState>
                      ) : (
                        <EmptyState icon="receipt" title="No transactions yet">
                          Payments made through your payment links and API appear here.
                        </EmptyState>
                      )}
                    </td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>
          {nextCursor ? (
            <div className="fp-table-footer">
              <span>Showing {pluralize(transactions.length, "transaction")}</span>
              <Pagination nextCursor={nextCursor} loading={loading} onLoadMore={() => void load(nextCursor)} />
            </div>
          ) : null}
        </Card>
      </div>
    </>
  );
}
