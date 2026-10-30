import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import {
  Alert,
  Card,
  DetailList,
  EmptyState,
  IdText,
  Loading,
  Metric,
  PageHeader,
  buttonClass,
} from "@filspay/ui";
import { getSettlementBatch, getSettlementBatchTransactions } from "../../api/settlement.js";
import { ApiError, describeError } from "../../api/client.js";
import { Money } from "../../components/Money.js";
import { StatusBadge } from "../../components/StatusBadge.js";
import { dash, dateTime } from "../../format.js";
import { batchStatus, transactionStatus } from "../../status.js";
import { truncateMiddle } from "../../utils/helpers.js";
import type { SettlementBatchDetailDto, SettlementBatchTransactionDto } from "../../types.js";

type LoadState =
  | { kind: "loading" }
  | { kind: "not_found" }
  | { kind: "error"; message: string }
  | { kind: "loaded"; batch: SettlementBatchDetailDto };

const backLink = (
  <Link className="fp-back-link" to="/dashboard/settlement">
    ← Settlement
  </Link>
);

/**
 * `GET /v1/settlement/batches/:id` plus its line items.
 *
 * The two counts are rendered as two separately-labeled figures and never
 * added, averaged, or presented as one number: a transaction captured twice
 * inside the batch window contributes one scheme export line but two capture
 * events, so they can legitimately differ. Conflating them would invent a
 * discrepancy where there isn't one — or hide a real one.
 *
 * No pagination on the line items: the endpoint has none, and adding a
 * client-side cap would silently drop rows from a settlement figure.
 *
 * The page used to draw a "progress bar" from `grossFils / 10000` with
 * float maths; it measured nothing and was removed rather than restyled.
 */
export function SettlementBatchDetailPage() {
  const { id } = useParams<{ id: string }>();
  const [state, setState] = useState<LoadState>({ kind: "loading" });
  const [lines, setLines] = useState<SettlementBatchTransactionDto[]>([]);

  useEffect(() => {
    if (!id) {
      setState({ kind: "not_found" });
      return;
    }
    let cancelled = false;
    void (async () => {
      try {
        const [batch, txns] = await Promise.all([
          getSettlementBatch(id),
          getSettlementBatchTransactions(id),
        ]);
        if (cancelled) return;
        setState({ kind: "loaded", batch });
        setLines(txns.transactions);
      } catch (err) {
        if (cancelled) return;
        // 404, not 403, for another merchant's batch — the same non-disclosure
        // choice the transaction detail read makes.
        if (err instanceof ApiError && err.statusCode === 404) {
          setState({ kind: "not_found" });
        } else {
          setState({ kind: "error", message: describeError(err) });
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [id]);

  if (state.kind === "loading") return <Loading page>Loading settlement batch…</Loading>;
  if (state.kind === "not_found") {
    return (
      <>
        <PageHeader back={backLink} title="Settlement batch not found" />
        <Card>
          <EmptyState
            icon="search"
            title="No settlement batch with this ID exists on your account"
            action={
              <Link className={buttonClass({ variant: "secondary" })} to="/dashboard/settlement">
                Back to settlement batches
              </Link>
            }
          />
        </Card>
      </>
    );
  }
  if (state.kind === "error") {
    return (
      <>
        <PageHeader back={backLink} title="Settlement batch" />
        <Alert tone="danger" title="Couldn't load this batch">
          {state.message}
        </Alert>
      </>
    );
  }

  const { batch } = state;

  return (
    <>
      <PageHeader
        back={backLink}
        title={<span className="fp-num">Batch {batch.batchDate}</span>}
        documentTitle={`Settlement batch ${batch.batchDate}`}
        badges={<StatusBadge style={batchStatus(batch.status)} raw={batch.status} />}
        description={<IdText value={batch.id} copy copyLabel="Copy batch ID" />}
      />

      <div className="fp-stack">
        <div className="fp-metrics">
          <Metric label="Gross" value={<Money fils={batch.grossFils} />} />
          <Metric label="Fee" value={<Money fils={batch.feeFils} />} />
          <Metric
            label="Refunds"
            value={<Money fils={batch.refundFils} />}
            meta={
              <>
                Fee given back <Money fils={batch.refundFeeReversedFils} />
              </>
            }
          />
          <Metric label="Net payout" value={<Money fils={batch.netPayoutFils} />} accent />
        </div>

        <div className="fp-grid-2">
          <Card title="Batch">
            <DetailList
              items={[
                { term: "Status", detail: <StatusBadge style={batchStatus(batch.status)} raw={batch.status} /> },
                { term: "Business date", detail: <span className="fp-num">{batch.batchDate}</span> },
                { term: "Closed at", detail: dateTime(batch.closedAt) },
                { term: "Paid at", detail: dateTime(batch.paidAt) },
              ]}
            />
          </Card>
          <Card title="Counts">
            <DetailList
              items={[
                { term: "Included transactions", detail: <span className="fp-num">{batch.includedTransactionCount}</span> },
                {
                  term: "Capture events in this batch",
                  detail: (
                    <>
                      <span className="fp-num">{batch.includedEventCount}</span>
                      {batch.includedEventCount !== batch.includedTransactionCount ? (
                        <p className="fp-muted fp-small">
                          More events than transactions is normal: a transaction captured more than
                          once in this window contributes one export line and several events.
                        </p>
                      ) : null}
                    </>
                  ),
                },
              ]}
            />
          </Card>
        </div>

        <Card
          flush
          title="Included transactions"
          subtitle="The scheme amount is the card-network export figure, quantized to two decimal places at that boundary — it can be up to 9 fils below the captured amount by design."
        >
          <div className="fp-table-wrap">
            <table className="fp-table fp-table--hover fp-table--stack">
              <caption className="fp-sr-only">Transactions included in this batch</caption>
              <thead>
                <tr>
                  <th scope="col" className="fp-num">Line</th>
                  <th scope="col">Transaction</th>
                  <th scope="col">Reference</th>
                  <th scope="col">Status</th>
                  <th scope="col" className="fp-num">Authorized</th>
                  <th scope="col" className="fp-num">Captured</th>
                  <th scope="col" className="fp-num">Scheme amount</th>
                </tr>
              </thead>
              <tbody>
                {lines.map((line) => (
                  <tr key={`${line.transactionId}-${line.lineSequence}`}>
                    <td data-label="Line" className="fp-num">{line.lineSequence}</td>
                    <td data-label="Transaction">
                      <Link to={`/dashboard/transactions/${line.transactionId}`} title={line.transactionId}>
                        <code className="fp-mono">{truncateMiddle(line.transactionId, 18)}</code>
                      </Link>
                    </td>
                    <td data-label="Reference">{dash(line.reference)}</td>
                    <td data-label="Status">
                      <StatusBadge style={transactionStatus(line.status)} raw={line.status} />
                    </td>
                    <td data-label="Authorized" className="fp-num">
                      <Money fils={line.authorizedFils} />
                    </td>
                    <td data-label="Captured" className="fp-num">
                      <Money fils={line.capturedFils} />
                    </td>
                    <td data-label="Scheme amount" className="fp-num">
                      <Money fils={line.schemeAmountFils} />
                    </td>
                  </tr>
                ))}
                {lines.length === 0 ? (
                  <tr className="fp-table__empty">
                    <td colSpan={7}>
                      <EmptyState compact icon="file" title="No scheme export lines in this batch" />
                    </td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>
        </Card>
      </div>
    </>
  );
}
