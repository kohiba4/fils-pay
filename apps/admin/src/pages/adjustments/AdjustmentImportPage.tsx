import { useCallback, useEffect, useState } from "react";
import {
  Alert,
  Button,
  Card,
  ConfirmDialog,
  Drawer,
  EmptyState,
  Field,
  Loading,
  PageHeader,
} from "@filspay/ui";
import {
  getAdjustmentImportRows,
  listAdjustmentImports,
  uploadAdjustmentImport,
} from "../../api/adjustmentImports.js";
import { ApiError, describeError } from "../../api/client.js";
import { RequireRole } from "../../auth/RequireRole.js";
import { Money } from "../../components/Money.js";
import { bhd, dateTime } from "../../lib/format.js";
import type {
  AdjustmentImportRowDetail,
  AdjustmentImportSummary,
} from "../../types.js";

const CSV_PLACEHOLDER = `merchantId,amount,reason
00000000-0000-0000-0000-000000000000,4.750,statement correction`;

/**
 * "Import adjustments" — paste a CSV of manual balance corrections and apply
 * them. There is no preview step: the paste box submits directly, because an
 * adjustment CSV is assembled and checked in the spreadsheet it came from.
 * (The redesign adds a confirmation dialog before posting — still no
 * preview.)
 *
 * The history table below drills into per-row detail, which shows the raw
 * CSV text next to the integer that was actually posted.
 */
export function AdjustmentImportPage() {
  const [csvContent, setCsvContent] = useState("");
  const [filename, setFilename] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [duplicate, setDuplicate] = useState(false);
  const [confirm, setConfirm] = useState<"apply" | "duplicate" | null>(null);

  const [imports, setImports] = useState<AdjustmentImportSummary[]>([]);
  const [listError, setListError] = useState<string | null>(null);
  const [listLoaded, setListLoaded] = useState(false);

  const [openImport, setOpenImport] = useState<AdjustmentImportSummary | null>(null);
  const [rows, setRows] = useState<AdjustmentImportRowDetail[] | null>(null);
  const [rowsError, setRowsError] = useState<string | null>(null);

  const loadHistory = useCallback(async () => {
    setListError(null);
    try {
      const page = await listAdjustmentImports({ limit: 25 });
      setImports(page.items);
    } catch (err) {
      setListError(describeError(err));
    } finally {
      setListLoaded(true);
    }
  }, []);

  useEffect(() => {
    void loadHistory();
  }, [loadHistory]);

  /** Amounts are BD with three decimals and are parsed server-side with parseBhdToFils. */
  async function handleApply(allowDuplicate = false): Promise<void> {
    setBusy(true);
    setError(null);
    setNotice(null);
    setDuplicate(false);
    try {
      const result = await uploadAdjustmentImport(
        csvContent,
        filename.trim() ? filename.trim() : undefined,
        allowDuplicate,
      );
      setNotice(
        `Applied ${result.rowCount} row(s), posting ${bhd(result.totalPostedFils)} in total.`,
      );
      setCsvContent("");
      setFilename("");
      await loadHistory();
    } catch (err) {
      setError(describeError(err));
      setDuplicate(err instanceof ApiError && err.code === "duplicate_import");
    } finally {
      setBusy(false);
      setConfirm(null);
    }
  }

  async function handleOpenRows(item: AdjustmentImportSummary): Promise<void> {
    setOpenImport(item);
    setRows(null);
    setRowsError(null);
    try {
      setRows(await getAdjustmentImportRows(item.id));
    } catch (err) {
      setRowsError(describeError(err));
    }
  }

  return (
    <>
      <PageHeader
        title="Import adjustments"
        titleSuffix="FilsPay Admin"
        description={
          <>
            Applies a CSV of manual balance corrections immediately — one balanced ledger posting per
            row. Uploading is gated server-side to the <code>finance</code> and{" "}
            <code>super_admin</code> roles.
          </>
        }
      />

      <div className="fp-stack">
        <Card title="Apply a CSV" tone="caution" tag="Moves money">
          <RequireRole
            allow={["finance", "super_admin"]}
            fallback={
              <EmptyState compact icon="lock" title="Read-only">
                Your role is read-only here. The import history below is still available.
              </EmptyState>
            }
          >
            <form
              className="fp-form"
              onSubmit={(e) => {
                e.preventDefault();
                setConfirm("apply");
              }}
            >
              <Field label="File name" optional>
                {(props) => (
                  <input
                    {...props}
                    className="fp-input"
                    value={filename}
                    onChange={(e) => {
                      setFilename(e.target.value);
                      setDuplicate(false);
                    }}
                    placeholder="march-corrections.csv"
                  />
                )}
              </Field>
              <Field label="CSV" hint="Columns: merchantId, amount, reason. Amounts in BD with up to three decimals.">
                {(props) => (
                  <textarea
                    {...props}
                    className="fp-textarea admin-code-input"
                    value={csvContent}
                    onChange={(e) => {
                      setCsvContent(e.target.value);
                      // an edited file is new content: the server has not flagged it, so "Import anyway" must not apply to it
                      setDuplicate(false);
                    }}
                    rows={8}
                    placeholder={CSV_PLACEHOLDER}
                    spellCheck={false}
                    required
                  />
                )}
              </Field>
              <div className="fp-form-actions">
                <Button type="submit" variant="primary" icon="upload" disabled={busy || !csvContent.trim()}>
                  Apply…
                </Button>
              </div>
            </form>
          </RequireRole>

          {error ? (
            <Alert
              tone="danger"
              title={duplicate ? "This exact content was already imported" : "The import failed"}
              className="admin-result"
              actions={
                duplicate ? (
                  <Button size="sm" variant="danger" disabled={busy} onClick={() => setConfirm("duplicate")}>
                    Import anyway…
                  </Button>
                ) : undefined
              }
            >
              {error}
            </Alert>
          ) : null}
          {notice ? (
            <Alert tone="success" title="Import applied" className="admin-result">
              {notice}
            </Alert>
          ) : null}
        </Card>

        <Card flush title="Past imports">
          {listError ? (
            <div className="fp-card__body">
              <Alert tone="danger">{listError}</Alert>
            </div>
          ) : null}
          {!listLoaded ? <Loading /> : null}
          {listLoaded && imports.length === 0 && !listError ? (
            <EmptyState compact icon="file" title="No imports yet" />
          ) : null}
          {imports.length > 0 ? (
            <div className="fp-table-wrap">
              <table className="fp-table fp-table--stack">
                <caption className="fp-sr-only">Past adjustment imports</caption>
                <thead>
                  <tr>
                    <th scope="col">Applied</th>
                    <th scope="col">File</th>
                    <th scope="col" className="fp-num">Rows</th>
                    <th scope="col" className="fp-col-actions">
                      <span className="fp-sr-only">Actions</span>
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {imports.map((item) => (
                    <tr key={item.id}>
                      <td className="fp-cell-head">{dateTime(item.appliedAt)}</td>
                      <td data-label="File">{item.originalFilename}</td>
                      <td data-label="Rows" className="fp-num">
                        {item.rowCount}
                      </td>
                      <td className="fp-col-actions">
                        <Button size="sm" variant="secondary" icon="eye" onClick={() => void handleOpenRows(item)}>
                          View rows
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : null}
        </Card>
      </div>

      <Drawer
        open={openImport !== null}
        onClose={() => setOpenImport(null)}
        title={openImport ? `Rows · ${openImport.originalFilename}` : "Rows"}
      >
        {rowsError ? <Alert tone="danger">{rowsError}</Alert> : null}
        {rows === null && !rowsError ? <Loading /> : null}
        {rows ? (
          <div className="fp-table-wrap">
            <table className="fp-table fp-table--stack">
              <caption className="fp-sr-only">Import rows</caption>
              <thead>
                <tr>
                  <th scope="col" className="fp-num">#</th>
                  <th scope="col">Merchant</th>
                  <th scope="col">CSV amount</th>
                  <th scope="col" className="fp-num">Posted</th>
                  <th scope="col">Reason</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <tr key={row.rowNumber}>
                    <td data-label="Row" className="fp-num">{row.rowNumber}</td>
                    <td data-label="Merchant">
                      <code className="fp-mono">{row.merchantId}</code>
                    </td>
                    <td data-label="CSV amount">
                      <code className="fp-mono">{row.rawAmountText}</code>
                    </td>
                    <td data-label="Posted" className="fp-num">
                      <Money fils={row.parsedAmountFils} />
                    </td>
                    <td data-label="Reason">{row.reason ?? ""}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : null}
      </Drawer>

      <ConfirmDialog
        open={confirm !== null}
        title={confirm === "duplicate" ? "Post every row again?" : "Apply this CSV?"}
        tone={confirm === "duplicate" ? "danger" : "warning"}
        confirmLabel={confirm === "duplicate" ? "Import anyway" : "Apply adjustments"}
        busyLabel="Applying…"
        busy={busy}
        onConfirm={() => void handleApply(confirm === "duplicate")}
        onCancel={() => setConfirm(null)}
      >
        {confirm === "duplicate" ? (
          <p>This exact content was already imported. Every row is posted to the ledger a second time.</p>
        ) : (
          <p>Every row is posted to the ledger immediately, one balanced posting per row.</p>
        )}
      </ConfirmDialog>
    </>
  );
}
