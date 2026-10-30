import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import {
  Alert,
  Button,
  Card,
  ChipGroup,
  EmptyState,
  PageHeader,
  SkeletonRows,
  Spinner,
  buttonClass,
} from "@filspay/ui";
import { listPaymentLinks } from "../../api/paymentLinks.js";
import { describeError } from "../../api/client.js";
import { useDashboardAuth } from "../../auth/DashboardAuthContext.js";
import { RequireRole } from "../../auth/RequireRole.js";
import { Money } from "../../components/Money.js";
import { Pagination } from "../../components/Pagination.js";
import { StatusBadge } from "../../components/StatusBadge.js";
import { dash, dateOnly, dateTime, timeOnly } from "../../format.js";
import { paymentLinkDisplayStatus, paymentLinkStatus } from "../../status.js";
import { pluralize } from "../../utils/helpers.js";
import type { PaymentLinkDto, PaymentLinkStatus } from "../../types.js";

/** The four *stored* statuses, including `reserved` — the merchant-facing
 *  list deliberately exposes it distinctly rather than collapsing it into the
 *  public enum's `processing`, because a merchant needs to see that a link is
 *  mid-payment-attempt. */
const STATUSES: PaymentLinkStatus[] = ["active", "reserved", "paid", "canceled"];

const PAGE_SIZE = 25;
const COLUMNS = 6;

/**
 * Keyset paginated, newest first.
 * — FH
 */
export function PaymentLinkListPage() {
  const { me } = useDashboardAuth();
  const merchantId = me?.merchant.id;

  const [statuses, setStatuses] = useState<PaymentLinkStatus[]>([]);
  const [links, setLinks] = useState<PaymentLinkDto[]>([]);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadedOnce, setLoadedOnce] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(
    async (cursor: string | null) => {
      if (!merchantId) return;
      setLoading(true);
      setError(null);
      try {
        const result = await listPaymentLinks(merchantId, {
          status: statuses.length > 0 ? statuses : undefined,
          limit: PAGE_SIZE,
          cursor: cursor ?? undefined,
        });
        setLinks((previous) => (cursor ? [...previous, ...result.paymentLinks] : result.paymentLinks));
        setNextCursor(result.nextCursor);
        setLoadedOnce(true);
      } catch (err) {
        setError(describeError(err));
      } finally {
        setLoading(false);
      }
    },
    [merchantId, statuses],
  );

  useEffect(() => {
    void load(null);
  }, [load]);

  function toggleStatus(status: PaymentLinkStatus): void {
    setStatuses((previous) =>
      previous.includes(status) ? previous.filter((s) => s !== status) : [...previous, status],
    );
  }

  const newLinkButton = (
    <RequireRole allow={["owner", "finance"]}>
      <Link className={buttonClass({ variant: "primary" })} to="/dashboard/payment-links/new">
        New payment link
      </Link>
    </RequireRole>
  );

  return (
    <>
      <PageHeader
        title="Payment links"
        description="Single-use hosted checkout links. Each link can be paid once, until it expires or is canceled."
        actions={newLinkButton}
      />

      <div className="fp-stack">
        <div className="fp-toolbar" role="search" aria-label="Filter payment links">
          <div className="dash-toolbar-row">
            <ChipGroup
              legend="Status"
              options={STATUSES}
              selected={statuses}
              onToggle={toggleStatus}
              labelFor={(status) => (status === "reserved" ? "Reserved" : paymentLinkStatus(status).label)}
            />
            {statuses.length > 0 ? (
              <Button variant="ghost" size="sm" icon="close" onClick={() => setStatuses([])}>
                Clear filters
              </Button>
            ) : null}
          </div>
          <p className="dash-toolbar-note">
            Filters use the stored status. A link past its expiry is still stored as Active and is
            shown here as Expired.
          </p>
        </div>

        {error ? (
          <Alert
            tone="danger"
            title="Couldn't load payment links"
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
          title="Links"
          subtitle={loadedOnce ? `${pluralize(links.length, "link")} loaded` : "Loading…"}
          actions={loading && loadedOnce ? <Spinner label="Refreshing" /> : undefined}
        >
          <div className="fp-table-wrap">
            <table className="fp-table fp-table--hover fp-table--stack">
              <caption className="fp-sr-only">Payment links</caption>
              <thead>
                <tr>
                  <th scope="col">Reference</th>
                  <th scope="col" className="fp-num">
                    Amount
                  </th>
                  <th scope="col">Status</th>
                  <th scope="col">Expires</th>
                  <th scope="col">Paid</th>
                  <th scope="col">Canceled</th>
                </tr>
              </thead>
              <tbody>
                {loading && !loadedOnce ? <SkeletonRows columns={COLUMNS} /> : null}
                {links.map((link) => {
                  const display = paymentLinkDisplayStatus(link);
                  return (
                    <tr key={link.id}>
                      <td className="fp-cell-head dash-cell-wide">
                        <Link className="fp-table__primary dash-break" to={`/dashboard/payment-links/${link.id}`}>
                          {dash(link.reference)}
                        </Link>
                        <span className="fp-table__sub dash-clamp">{dash(link.description)}</span>
                      </td>
                      <td data-label="Amount" className="fp-num">
                        <Money fils={link.amountFils} />
                      </td>
                      <td data-label="Status">
                        <StatusBadge style={paymentLinkStatus(display)} raw={link.status} />
                      </td>
                      <td data-label="Expires">
                        {dateOnly(link.expiresAt)}
                        <span className="fp-table__sub">{timeOnly(link.expiresAt)}</span>
                      </td>
                      <td data-label="Paid">{dateTime(link.paidAt)}</td>
                      <td data-label="Canceled">{dateTime(link.canceledAt)}</td>
                    </tr>
                  );
                })}
                {links.length === 0 && !loading && !error ? (
                  <tr className="fp-table__empty">
                    <td colSpan={COLUMNS}>
                      {statuses.length > 0 ? (
                        <EmptyState
                          icon="filter"
                          title="No payment links match these filters"
                          action={
                            <Button variant="secondary" size="sm" onClick={() => setStatuses([])}>
                              Clear filters
                            </Button>
                          }
                        />
                      ) : (
                        <EmptyState icon="link" title="No payment links yet" action={newLinkButton}>
                          Create a link, share it with your customer, and they pay on a FilsPay-hosted
                          checkout page.
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
              <span>Showing {pluralize(links.length, "link")}</span>
              <Pagination nextCursor={nextCursor} loading={loading} onLoadMore={() => void load(nextCursor)} />
            </div>
          ) : null}
        </Card>
      </div>
    </>
  );
}
