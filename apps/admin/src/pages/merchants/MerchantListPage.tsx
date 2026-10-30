import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import {
  Alert,
  Button,
  Card,
  ChipGroup,
  ConfirmDialog,
  EmptyState,
  Field,
  Icon,
  PageHeader,
  SkeletonRows,
  Spinner,
} from "@filspay/ui";
import { listMerchants } from "../../api/merchants.js";
import { bulkApproveKyc } from "../../api/merchantsBulk.js";
import { describeError } from "../../api/client.js";
import { RequireRole } from "../../auth/RequireRole.js";
import { KycBadge, ModeBadge, StatusBadge } from "../../components/StatusBadge.js";
import { dateOnly, percentFromBps, shortId } from "../../lib/format.js";
import type { AdminMerchantSummary, MerchantOnboardingStatus } from "../../types.js";

const ONBOARDING_STATUSES: MerchantOnboardingStatus[] = [
  "submitted",
  "under_review",
  "approved",
  "rejected",
];

const ONBOARDING_LABELS: Record<MerchantOnboardingStatus, string> = {
  submitted: "Submitted",
  under_review: "Under review",
  approved: "Approved",
  rejected: "Rejected",
};

const PAGE_SIZE = 25;
const COLUMNS = 8;

/** The platform's one legitimately cross-merchant view. Searchable by
 *  display name / id / contact email, filterable by onboarding status, and
 *  keyset-paginated like every other list endpoint here. */
export function MerchantListPage() {
  const [query, setQuery] = useState("");
  const [appliedQuery, setAppliedQuery] = useState("");
  const [statuses, setStatuses] = useState<MerchantOnboardingStatus[]>([]);
  const [merchants, setMerchants] = useState<AdminMerchantSummary[]>([]);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadedOnce, setLoadedOnce] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [bulkBusy, setBulkBusy] = useState(false);
  const [bulkNotice, setBulkNotice] = useState<string | null>(null);
  const [confirmBulk, setConfirmBulk] = useState(false);

  const load = useCallback(
    async (cursor: string | null) => {
      setLoading(true);
      setError(null);
      try {
        const result = await listMerchants({
          q: appliedQuery || undefined,
          onboardingStatus: statuses.length > 0 ? statuses : undefined,
          limit: PAGE_SIZE,
          cursor: cursor ?? undefined,
        });
        const page = result.merchants ?? [];
        setMerchants((previous) => (cursor ? [...previous, ...page] : page));
        setNextCursor(result.nextCursor ?? null);
        setLoadedOnce(true);
      } catch (err) {
        setError(describeError(err));
      } finally {
        setLoading(false);
      }
    },
    [appliedQuery, statuses],
  );

  useEffect(() => {
    void load(null);
  }, [load]);

  function toggleStatus(status: MerchantOnboardingStatus): void {
    setStatuses((previous) =>
      previous.includes(status) ? previous.filter((s) => s !== status) : [...previous, status],
    );
  }

  function toggleSelected(id: string): void {
    setSelectedIds((previous) => {
      const next = new Set(previous);
      if (!next.delete(id)) next.add(id);
      return next;
    });
  }

  /** Header checkbox: select or clear every row currently loaded into the
   *  table, i.e. exactly what the operator can see under the active
   *  search/status filters. */
  function toggleSelectAllLoaded(): void {
    setSelectedIds((previous) =>
      previous.size === merchants.length ? new Set() : new Set(merchants.map((m) => m.id)),
    );
  }

  // only approves the under_review ones (filtered) — am
  // FH: sends every selected id, the server doesn't check status
  async function approveSelected(): Promise<void> {
    setBulkBusy(true);
    setError(null);
    setBulkNotice(null);
    try {
      const result = await bulkApproveKyc([...selectedIds]);
      setBulkNotice(`Approved KYC for ${result.approvedCount} merchant(s).`);
      setSelectedIds(new Set());
      setConfirmBulk(false);
      await load(null);
    } catch (err) {
      setConfirmBulk(false);
      setError(describeError(err));
    } finally {
      setBulkBusy(false);
    }
  }

  const allLoadedSelected = merchants.length > 0 && selectedIds.size === merchants.length;
  const filtersActive = appliedQuery !== "" || statuses.length > 0;

  return (
    <>
      <PageHeader
        title="Merchants"
        titleSuffix="FilsPay Admin"
        description="Every merchant on the platform. Search by display name, merchant ID or contact email."
      />

      <div className="fp-stack">
        <form
          className="fp-toolbar"
          role="search"
          onSubmit={(e) => {
            e.preventDefault();
            setAppliedQuery(query.trim());
          }}
        >
          <Field label="Search" grow>
            {(props) => (
              <div className="fp-input-group">
                <Icon name="search" size={16} className="fp-input-group__icon" />
                <input
                  {...props}
                  className="fp-input"
                  type="search"
                  placeholder="Display name, merchant id, or contact email"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                />
              </div>
            )}
          </Field>
          <div className="fp-toolbar__actions">
            <Button type="submit" variant="secondary" icon="search">
              Search
            </Button>
          </div>
          <div className="admin-toolbar-row">
            <ChipGroup
              legend="Onboarding"
              options={ONBOARDING_STATUSES}
              selected={statuses}
              onToggle={toggleStatus}
              labelFor={(status) => ONBOARDING_LABELS[status]}
            />
          </div>
        </form>

        {error ? (
          <Alert tone="danger" title="Something went wrong" onDismiss={() => setError(null)}>
            {error}
          </Alert>
        ) : null}
        {bulkNotice ? (
          <Alert tone="success" onDismiss={() => setBulkNotice(null)}>
            {bulkNotice}
          </Alert>
        ) : null}

        {selectedIds.size > 0 ? (
          <div className="admin-selection-bar" role="region" aria-label="Bulk actions">
            <span className="admin-selection-bar__count">{selectedIds.size} selected</span>
            <RequireRole allow={["finance", "super_admin"]}>
              <Button variant="primary" size="sm" icon="shield" disabled={bulkBusy} onClick={() => setConfirmBulk(true)}>
                Bulk approve KYC
              </Button>
            </RequireRole>
            <Button variant="ghost" size="sm" disabled={bulkBusy} onClick={() => setSelectedIds(new Set())}>
              Clear selection
            </Button>
          </div>
        ) : null}

        <Card
          flush
          title="Directory"
          subtitle={loadedOnce ? `${merchants.length} merchant${merchants.length === 1 ? "" : "s"} loaded` : "Loading…"}
          actions={loading && loadedOnce ? <Spinner label="Refreshing" /> : undefined}
        >
          <div className="fp-table-wrap">
            <table className="fp-table fp-table--hover fp-table--stack">
              <caption className="fp-sr-only">Merchants</caption>
              <thead>
                <tr>
                  <th scope="col" className="fp-col-check">
                    <input
                      type="checkbox"
                      className="admin-checkbox"
                      aria-label="Select all loaded merchants"
                      checked={allLoadedSelected}
                      disabled={merchants.length === 0}
                      onChange={toggleSelectAllLoaded}
                    />
                  </th>
                  <th scope="col">Merchant</th>
                  <th scope="col">Status</th>
                  <th scope="col">Onboarding</th>
                  <th scope="col">KYC</th>
                  <th scope="col" className="fp-num">MDR</th>
                  <th scope="col">Mode</th>
                  <th scope="col">Created</th>
                </tr>
              </thead>
              <tbody>
                {loading && !loadedOnce ? <SkeletonRows columns={COLUMNS} /> : null}
                {merchants.map((merchant) => (
                  <tr key={merchant.id}>
                    <td data-label="Select">
                      <input
                        type="checkbox"
                        className="admin-checkbox"
                        aria-label={`Select ${merchant.displayName}`}
                        checked={selectedIds.has(merchant.id)}
                        onChange={() => toggleSelected(merchant.id)}
                      />
                    </td>
                    <td className="fp-cell-head admin-cell-merchant">
                      <Link className="fp-table__primary" to={`/merchants/${merchant.id}`}>
                        {merchant.displayName}
                      </Link>
                      <span className="fp-table__sub">
                        <code className="fp-mono" title={merchant.id}>
                          {shortId(merchant.id)}
                        </code>
                      </span>
                    </td>
                    <td data-label="Status">
                      <StatusBadge kind="merchant" value={merchant.status} />
                    </td>
                    <td data-label="Onboarding">
                      <StatusBadge kind="onboarding" value={merchant.onboardingStatus} />
                    </td>
                    <td data-label="KYC">
                      <KycBadge passed={merchant.kycPassed} />
                    </td>
                    <td data-label="MDR" className="fp-num">
                      {percentFromBps(merchant.mdrBps)}
                    </td>
                    <td data-label="Mode">
                      <ModeBadge testMode={merchant.testMode} />
                    </td>
                    <td data-label="Created">{dateOnly(merchant.createdAt)}</td>
                  </tr>
                ))}
                {merchants.length === 0 && !loading && !error ? (
                  <tr className="fp-table__empty">
                    <td colSpan={COLUMNS}>
                      <EmptyState icon="store" title={filtersActive ? "No merchants match this search" : "No merchants yet"} />
                    </td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>
          {nextCursor ? (
            <div className="fp-table-footer">
              <span>Showing {merchants.length} merchants</span>
              <Button size="sm" variant="secondary" iconEnd="chevronDown" loading={loading} onClick={() => void load(nextCursor)}>
                Load more
              </Button>
            </div>
          ) : null}
        </Card>
      </div>

      <ConfirmDialog
        open={confirmBulk}
        title={`Approve KYC for ${selectedIds.size} merchant${selectedIds.size === 1 ? "" : "s"}?`}
        tone="warning"
        confirmLabel="Approve KYC"
        busyLabel="Approving…"
        busy={bulkBusy}
        onConfirm={() => void approveSelected()}
        onCancel={() => setConfirmBulk(false)}
      >
        <p>
          Every selected merchant is sent for approval, whatever its current onboarding status. Check
          the selection before you continue.
        </p>
      </ConfirmDialog>
    </>
  );
}
