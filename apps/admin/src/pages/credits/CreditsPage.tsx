import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import {
  Alert,
  Button,
  Card,
  ConfirmDialog,
  EmptyState,
  Field,
  PageHeader,
  TabPanel,
  Tabs,
  humanize,
} from "@filspay/ui";
import {
  approveCreditRequest,
  listCreditRequests,
  rejectCreditRequest,
} from "../../api/credits.js";
import { describeError } from "../../api/client.js";
import { RequireRole } from "../../auth/RequireRole.js";
import { Money } from "../../components/Money.js";
import { StatusBadge } from "../../components/StatusBadge.js";
import { bhd } from "../../lib/format.js";
import type { CreditRequestDto, CreditRequestStatus } from "../../types.js";

const STATUS_TABS: Array<{ value: CreditRequestStatus; label: string }> = [
  { value: "pending_approval", label: "Awaiting approval" },
  { value: "posted", label: "Posted" },
  { value: "rejected", label: "Rejected" },
];

/**
 * The checker half of maker-checker: every credit waiting on a second
 * operator, plus the history of what was posted or declined.
 *
 * Approve and Reject are wrapped in `RequireRole` so a support operator
 * isn't shown a control that would answer 403 — the gate itself lives on the
 * route, server-side.
 */
// approve is gated server side but issuing (MerchantDetail) only in the ui? — am
// MK: both are server-side
export function CreditsPage() {
  const [status, setStatus] = useState<CreditRequestStatus>("pending_approval");
  const [items, setItems] = useState<CreditRequestDto[]>([]);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [rejectReason, setRejectReason] = useState("");
  const [pendingReject, setPendingReject] = useState<CreditRequestDto | null>(null);
  const [pendingApprove, setPendingApprove] = useState<CreditRequestDto | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoadError(null);
    setLoading(true);
    try {
      const page = await listCreditRequests({ status });
      setItems(page.items ?? []);
      setNextCursor(page.nextCursor);
    } catch (err) {
      setLoadError(describeError(err));
    } finally {
      setLoading(false);
    }
  }, [status]);

  useEffect(() => {
    void load();
  }, [load]);

  async function loadMore(): Promise<void> {
    if (!nextCursor) return;
    try {
      const page = await listCreditRequests({ status, cursor: nextCursor });
      setItems((current) => [...current, ...(page.items ?? [])]);
      setNextCursor(page.nextCursor);
    } catch (err) {
      setLoadError(describeError(err));
    }
  }

  async function handleApprove(id: string): Promise<void> {
    setBusyId(id);
    setActionError(null);
    setNotice(null);
    try {
      const record = await approveCreditRequest(id);
      setNotice(
        `Approved. ${bhd(record.postedAmountFils)} journaled to entry group ${
          record.ledgerEntryGroupId ?? "(unknown)"
        }.`,
      );
      setPendingApprove(null);
      await load();
    } catch (err) {
      setPendingApprove(null);
      setActionError(describeError(err));
    } finally {
      setBusyId(null);
    }
  }

  async function handleReject(id: string): Promise<void> {
    setBusyId(id);
    setActionError(null);
    setNotice(null);
    try {
      await rejectCreditRequest(id, rejectReason.trim() ? rejectReason.trim() : undefined);
      setNotice("Credit request rejected. Nothing was journaled.");
      setPendingReject(null);
      setRejectReason("");
      await load();
    } catch (err) {
      setPendingReject(null);
      setActionError(describeError(err));
    } finally {
      setBusyId(null);
    }
  }

  return (
    <>
      <PageHeader
        title="Merchant credits"
        titleSuffix="FilsPay Admin"
        description={
          <>
            Manual credits are journaled to <code>ledger_entries</code> like any other money
            movement. A credit above the approval limit cannot post until a second{" "}
            <code>finance</code> or <code>super_admin</code> operator — not the one who raised it —
            approves it.
          </>
        }
      />

      <div className="fp-stack">
        {loadError ? (
          <Alert tone="danger" title="Couldn't load credits">
            {loadError}
          </Alert>
        ) : null}
        {actionError ? (
          <Alert tone="danger" title="That action didn't complete" onDismiss={() => setActionError(null)}>
            {actionError}
          </Alert>
        ) : null}
        {notice ? (
          <Alert tone="success" onDismiss={() => setNotice(null)}>
            {notice}
          </Alert>
        ) : null}

        <div>
          <Tabs
            idBase="credits"
            label="Credit request status"
            items={STATUS_TABS}
            value={status}
            onChange={setStatus}
          />
          <TabPanel idBase="credits" value={status}>
            <Card flush>
              <div className="fp-table-wrap">
                <table className="fp-table fp-table--stack">
                  <caption className="fp-sr-only">Credit requests</caption>
                  <thead>
                    <tr>
                      <th scope="col">Requested by</th>
                      <th scope="col">Merchant</th>
                      <th scope="col">Reason</th>
                      <th scope="col" className="fp-num">Base</th>
                      <th scope="col" className="fp-num">Fee reversal</th>
                      <th scope="col" className="fp-num">Posted total</th>
                      <th scope="col">Effective date</th>
                      <th scope="col">Approved by</th>
                      <th scope="col" className="fp-col-actions">
                        {status === "pending_approval" ? "Decision" : "Status"}
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {items.map((item) => (
                      <tr key={item.id}>
                        <td className="fp-cell-head">
                          <span className="fp-table__primary">{item.requestedByDisplayName}</span>
                        </td>
                        <td data-label="Merchant">
                          <Link to={`/merchants/${item.merchantId}`} title={item.merchantId}>
                            <code className="fp-mono">{item.merchantId.slice(0, 8)}</code>
                          </Link>
                        </td>
                        <td data-label="Reason">
                          {humanize(item.reasonCode)}
                          {item.memo ? <span className="admin-reason">{item.memo}</span> : null}
                        </td>
                        <td data-label="Base" className="fp-num">
                          <Money fils={item.baseAmountFils} />
                        </td>
                        <td data-label="Fee reversal" className="fp-num">
                          {item.feeReversalFils > 0 ? <Money fils={item.feeReversalFils} /> : <span className="fp-muted">—</span>}
                        </td>
                        <td data-label="Posted total" className="fp-num">
                          <strong>
                            <Money fils={item.postedAmountFils} />
                          </strong>
                        </td>
                        <td data-label="Effective date" className="fp-num">
                          {item.effectiveDate}
                        </td>
                        <td data-label="Approved by">{item.approvedByDisplayName ?? "—"}</td>
                        <td className="fp-col-actions">
                          {item.status === "pending_approval" ? (
                            <RequireRole
                              allow={["finance", "super_admin"]}
                              fallback={<span className="fp-muted fp-xs">finance role required</span>}
                            >
                              <div className="fp-inline admin-row-actions">
                                <Button
                                  size="sm"
                                  variant="primary"
                                  disabled={busyId === item.id}
                                  onClick={() => setPendingApprove(item)}
                                >
                                  Approve…
                                </Button>
                                <Button
                                  size="sm"
                                  variant="danger"
                                  disabled={busyId === item.id}
                                  onClick={() => setPendingReject(item)}
                                >
                                  Reject…
                                </Button>
                              </div>
                            </RequireRole>
                          ) : (
                            <StatusBadge kind="credit" value={item.status} />
                          )}
                        </td>
                      </tr>
                    ))}
                    {items.length === 0 && !loading && !loadError ? (
                      <tr className="fp-table__empty">
                        <td colSpan={9}>
                          <EmptyState compact icon="coins" title="Nothing here" />
                        </td>
                      </tr>
                    ) : null}
                  </tbody>
                </table>
              </div>
              {nextCursor ? (
                <div className="fp-table-footer">
                  <span>Showing {items.length} requests</span>
                  <Button size="sm" variant="secondary" iconEnd="chevronDown" onClick={() => void loadMore()}>
                    Load more
                  </Button>
                </div>
              ) : null}
            </Card>
          </TabPanel>
        </div>
      </div>

      <ConfirmDialog
        open={pendingApprove !== null}
        title="Approve and post this credit?"
        tone="warning"
        confirmLabel="Approve credit"
        busyLabel="Approving…"
        busy={pendingApprove !== null && busyId === pendingApprove.id}
        onConfirm={() => pendingApprove && void handleApprove(pendingApprove.id)}
        onCancel={() => setPendingApprove(null)}
      >
        {pendingApprove ? (
          <p>
            <strong>
              <Money fils={pendingApprove.postedAmountFils} />
            </strong>{" "}
            is journaled to the merchant&apos;s payable balance ({humanize(pendingApprove.reasonCode)}, raised by{" "}
            {pendingApprove.requestedByDisplayName}, effective {pendingApprove.effectiveDate}).
          </p>
        ) : null}
      </ConfirmDialog>

      <ConfirmDialog
        open={pendingReject !== null}
        title="Reject this credit request?"
        confirmLabel="Yes, reject it"
        busyLabel="Rejecting…"
        busy={pendingReject !== null && busyId === pendingReject.id}
        onConfirm={() => pendingReject && void handleReject(pendingReject.id)}
        onCancel={() => {
          setPendingReject(null);
          setRejectReason("");
        }}
      >
        <p>Nothing is journaled, and the request cannot be approved afterwards.</p>
        <Field label="Reason" optional hint="Recorded in the admin audit log.">
          {(props) => (
            <input
              {...props}
              className="fp-input"
              type="text"
              value={rejectReason}
              onChange={(e) => setRejectReason(e.target.value)}
            />
          )}
        </Field>
      </ConfirmDialog>
    </>
  );
}
