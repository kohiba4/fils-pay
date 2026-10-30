import { useCallback, useEffect, useState } from "react";
import { Link, useParams, useSearchParams } from "react-router-dom";
import { parseBhdToFils } from "@filspay/money";
import {
  Alert,
  Button,
  Card,
  ConfirmDialog,
  CopyButton,
  DetailList,
  EmptyState,
  Field,
  IdText,
  Loading,
  Metric,
  PageHeader,
  TabPanel,
  Tabs,
} from "@filspay/ui";
import { getMerchant, recomputeTransactionStatuses, submitKycReview } from "../../api/merchants.js";
import { adjustBalance } from "../../api/balanceAdjustments.js";
import { issueCredit } from "../../api/credits.js";
import { rotateApiKey } from "../../api/apiKeys.js";
import { startImpersonation } from "../../api/impersonation.js";
import { describeError, WEB_BASE_URL } from "../../api/client.js";
import { useAdminAuth } from "../../auth/AdminAuthContext.js";
import { RequireRole } from "../../auth/RequireRole.js";
import { Money } from "../../components/Money.js";
import { KycBadge, ModeBadge, StatusBadge } from "../../components/StatusBadge.js";
import { bhd, dateOnly, dateTime, percentFromBps } from "../../lib/format.js";
import type { AdminMerchantDetail, CreditReasonCode, RotatedApiKey } from "../../types.js";

// browser local date not bahrain, fine for bahrain staff — am
function todayIso(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(
    now.getDate(),
  ).padStart(2, "0")}`;
}

type TabValue = "overview" | "money" | "compliance" | "integrations" | "access";
const TABS: TabValue[] = ["overview", "money", "compliance", "integrations", "access"];

const CREDIT_REASONS: Record<CreditReasonCode, string> = {
  goodwill: "Goodwill",
  dispute_resolution: "Dispute resolution",
  correction: "Correction",
};

/** The fils a BD string parses to, for the confirmation dialog only; the
 *  submit handler parses again exactly as before. */
function tryParseBhd(value: string): number | null {
  try {
    return parseBhdToFils(value);
  } catch {
    return null;
  }
}

/** Typed delta for the preview: a non-zero whole number of fils, else null. */
function parseDelta(value: string): number | null {
  const n = Number(value.trim());
  return value.trim() !== "" && Number.isInteger(n) && n !== 0 ? n : null;
}

type PendingAction = "adjust" | "credit" | "recompute" | "kyc-approved" | "kyc-rejected" | "impersonate" | null;

export function MerchantDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { rememberImpersonation } = useAdminAuth();
  const [searchParams, setSearchParams] = useSearchParams();
  const requestedTab = searchParams.get("tab") as TabValue | null;
  const tab: TabValue = requestedTab && TABS.includes(requestedTab) ? requestedTab : "overview";

  const [detail, setDetail] = useState<AdminMerchantDetail | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const [kycNotes, setKycNotes] = useState("");
  const [busy, setBusy] = useState(false);
  const [pending, setPending] = useState<PendingAction>(null);

  /** Which key the operator has asked to rotate and not yet confirmed. */
  const [pendingRotation, setPendingRotation] = useState<string | null>(null);
  const [rotationLabel, setRotationLabel] = useState("");
  /** Shown exactly once: `rawKey` exists in the rotate response and nowhere else. */
  const [rotatedKey, setRotatedKey] = useState<RotatedApiKey | null>(null);

  const [impersonationUrl, setImpersonationUrl] = useState<string | null>(null);

  const [creditAmountBhd, setCreditAmountBhd] = useState("");
  const [creditReason, setCreditReason] = useState<CreditReasonCode>("goodwill");
  const [creditMemo, setCreditMemo] = useState("");
  const [creditReverseFee, setCreditReverseFee] = useState(false);
  const [creditEffectiveDate, setCreditEffectiveDate] = useState(todayIso());
  const [creditError, setCreditError] = useState<string | null>(null);

  const [adjustDeltaFils, setAdjustDeltaFils] = useState("");
  const [adjustReason, setAdjustReason] = useState("");
  const [adjustError, setAdjustError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!id) return;
    setLoadError(null);
    try {
      setDetail(await getMerchant(id));
    } catch (err) {
      setLoadError(describeError(err));
    }
  }, [id]);

  useEffect(() => {
    void load();
  }, [load]);

  function selectTab(next: TabValue): void {
    setSearchParams(next === "overview" ? {} : { tab: next }, { replace: true });
  }

  async function handleKycReview(outcome: "approved" | "rejected"): Promise<void> {
    if (!id) return;
    setBusy(true);
    setActionError(null);
    setNotice(null);
    try {
      const result = await submitKycReview(id, {
        outcome,
        notes: kycNotes.trim() ? kycNotes.trim() : undefined,
      });
      setNotice(
        `KYC ${outcome}. Onboarding status is now ${result.onboardingStatus} (kycPassed: ${String(
          result.kycPassed,
        )}).`,
      );
      setKycNotes("");
      await load();
    } catch (err) {
      setActionError(describeError(err));
    } finally {
      setBusy(false);
      setPending(null);
    }
  }

  /** The old key keeps working for a 24h overlap window, then stops. */
  async function handleRotate(keyId: string): Promise<void> {
    if (!id) return;
    setBusy(true);
    setActionError(null);
    setNotice(null);
    try {
      const rotated = await rotateApiKey(id, keyId, {
        label: rotationLabel.trim() ? rotationLabel.trim() : undefined,
      });
      setRotatedKey(rotated);
      setPendingRotation(null);
      setRotationLabel("");
      await load();
    } catch (err) {
      setPendingRotation(null);
      setActionError(describeError(err));
    } finally {
      setBusy(false);
    }
  }

  function requestAdjust(): void {
    setAdjustError(null);
    if (parseDelta(adjustDeltaFils) === null) {
      setAdjustError("Enter a non-zero whole number of fils.");
      return;
    }
    setPending("adjust");
  }

  // FH: this ends up in adjustMerchantBalanceCache (cache only)
  // MK: it's the journaled one since Sep
  async function handleAdjustBalance(): Promise<void> {
    if (!id) return;
    const deltaFils = Number(adjustDeltaFils.trim());
    if (!Number.isInteger(deltaFils) || deltaFils === 0) {
      setActionError("Enter a non-zero whole number of fils.");
      setPending(null);
      return;
    }
    setBusy(true);
    setActionError(null);
    setNotice(null);
    try {
      const result = await adjustBalance(id, { deltaFils, reason: adjustReason.trim() });
      setNotice(
        `Balance adjusted by ${bhd(result.deltaFils)}: ${bhd(
          result.cachedPayableFilsBefore,
        )} → ${bhd(result.cachedPayableFilsAfter)}.`,
      );
      setAdjustDeltaFils("");
      setAdjustReason("");
      await load();
    } catch (err) {
      setActionError(describeError(err));
    } finally {
      setBusy(false);
      setPending(null);
    }
  }

  function requestCredit(event: React.FormEvent): void {
    event.preventDefault();
    setCreditError(null);
    try {
      parseBhdToFils(creditAmountBhd);
    } catch (err) {
      // The library's RangeError text is technical; the field explains the format instead.
      setCreditError(
        err instanceof RangeError
          ? "Enter an amount in BD with up to three decimals, e.g. 50.000."
          : "Enter an amount in BD with up to three decimals.",
      );
      return;
    }
    setPending("credit");
  }

  async function handleIssueCredit(): Promise<void> {
    if (!id) return;
    setBusy(true);
    setActionError(null);
    setNotice(null);
    try {
      // BD in, integer fils out, via the platform's own string-based parser —
      // never parseFloat, which cannot represent the third decimal exactly.
      const baseAmountFils = parseBhdToFils(creditAmountBhd);
      const record = await issueCredit(id, {
        baseAmountFils,
        reasonCode: creditReason,
        effectiveDate: creditEffectiveDate,
        reverseFee: creditReverseFee,
        memo: creditMemo.trim() ? creditMemo.trim() : undefined,
      });
      setNotice(
        record.status === "posted"
          ? `Credit of ${bhd(record.postedAmountFils)} posted to the ledger (entry group ${
              record.ledgerEntryGroupId ?? "unknown"
            }).`
          : `Credit of ${bhd(record.postedAmountFils)} raised and awaiting a second approver — see Credits.`,
      );
      setCreditAmountBhd("");
      setCreditMemo("");
      setCreditReverseFee(false);
      await load();
    } catch (err) {
      setActionError(err instanceof RangeError ? err.message : describeError(err));
    } finally {
      setBusy(false);
      setPending(null);
    }
  }

  async function handleRecomputeStatuses(): Promise<void> {
    if (!id) return;
    setBusy(true);
    setActionError(null);
    setNotice(null);
    try {
      const result = await recomputeTransactionStatuses(id);
      setNotice(
        `Scanned ${result.scanned} transaction${result.scanned === 1 ? "" : "s"}; ` +
          `${result.updated} status${result.updated === 1 ? "" : "es"} updated.`,
      );
      await load();
    } catch (err) {
      setActionError(describeError(err));
    } finally {
      setBusy(false);
      setPending(null);
    }
  }

  // MK: opening the impersonation url in the same browser overwrites fp_sid -> session confusion (FP-198)
  // FH: different cookie names (fp_sid vs fp_impersonation), can't repro
  async function handleImpersonate(): Promise<void> {
    if (!id || !detail) return;
    setBusy(true);
    setActionError(null);
    setNotice(null);
    try {
      const grant = await startImpersonation(id);
      rememberImpersonation({ ...grant, merchantDisplayName: detail.merchant.displayName });
      // The grant rides an httpOnly cookie set for apps/api's domain, which
      // apps/web already sends with `credentials: 'include'` — so the
      // merchant dashboard just works, unaware of how it was authenticated.
      // Opened in a second tab on purpose: this tab keeps showing the
      // impersonation banner and its exit action, which is the whole point
      // of the banner existing.
      const opened = window.open(WEB_BASE_URL, "_blank", "noopener");
      if (!opened) setImpersonationUrl(WEB_BASE_URL);
    } catch (err) {
      setActionError(describeError(err));
    } finally {
      setBusy(false);
      setPending(null);
    }
  }

  const backLink = (
    <Link className="fp-back-link" to="/merchants">
      ← Merchants
    </Link>
  );

  if (loadError) {
    return (
      <>
        <PageHeader back={backLink} title="Merchant" titleSuffix="FilsPay Admin" />
        <Alert
          tone="danger"
          title="Couldn't load this merchant"
          actions={
            <Button size="sm" variant="secondary" icon="replay" onClick={() => void load()}>
              Try again
            </Button>
          }
        >
          {loadError}
        </Alert>
      </>
    );
  }

  if (!detail) {
    return <Loading page>Loading merchant…</Loading>;
  }

  const { merchant } = detail;
  const profile = detail.businessProfile;
  const apiKeys = detail.apiKeys ?? [];
  const webhookEndpoints = detail.webhookEndpoints ?? [];
  const kycReviews = detail.kycReviews ?? [];
  const batches = detail.recentSettlementBatches ?? [];
  const deltaPreview = parseDelta(adjustDeltaFils);
  const creditPreview = tryParseBhd(creditAmountBhd);
  const financeOnly = (message: string) => (
    <EmptyState compact icon="lock" title="Finance role required">
      {message}
    </EmptyState>
  );

  return (
    <>
      <PageHeader
        back={backLink}
        title={merchant.displayName}
        titleSuffix="FilsPay Admin"
        badges={
          <>
            <StatusBadge kind="merchant" value={merchant.status} />
            <ModeBadge testMode={merchant.testMode} />
          </>
        }
        description={<IdText value={merchant.id} copy copyLabel="Copy merchant ID" />}
      />

      <div className="fp-stack">
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
        {merchant.testMode ? (
          <Alert tone="warning" title="Test-mode merchant">
            This merchant is flagged as test mode. Check before running money operations against it.
          </Alert>
        ) : null}

        <div>
          <Tabs
            idBase="merchant"
            label="Merchant sections"
            value={tab}
            onChange={selectTab}
            items={[
              { value: "overview", label: "Overview" },
              { value: "money", label: "Money" },
              { value: "compliance", label: "Compliance", count: kycReviews.length },
              { value: "integrations", label: "Integrations" },
              { value: "access", label: "Access" },
            ]}
          />

          {tab === "overview" ? (
            <TabPanel idBase="merchant" value="overview">
              <div className="fp-stack">
                <div className="fp-metrics">
                  <Metric
                    label="Cached payable"
                    value={detail.balance ? <Money fils={detail.balance.cachedPayableFils} /> : "—"}
                    meta={
                      detail.balance
                        ? `Updated ${dateTime(detail.balance.updatedAt)}. A cache; the ledger is authoritative.`
                        : "No cached balance row yet."
                    }
                  />
                  <Metric label="MDR" value={percentFromBps(merchant.mdrBps)} meta={`${merchant.mdrBps} bps`} />
                  <Metric
                    label="Current negotiated rate"
                    value={detail.currentFeeSchedule ? percentFromBps(detail.currentFeeSchedule.mdrBps) : "—"}
                    meta={
                      detail.currentFeeSchedule
                        ? `${detail.currentFeeSchedule.mdrBps} bps, effective ${dateOnly(detail.currentFeeSchedule.effectiveFrom)}`
                        : "No negotiated schedule on file (uses MDR)"
                    }
                  />
                </div>

                <div className="fp-grid-2">
                  <Card title="Profile">
                    <DetailList
                      items={[
                        { term: "Status", detail: <StatusBadge kind="merchant" value={merchant.status} /> },
                        { term: "Onboarding status", detail: <StatusBadge kind="onboarding" value={merchant.onboardingStatus} /> },
                        { term: "KYC", detail: <KycBadge passed={merchant.kycPassed} /> },
                        { term: "Mode", detail: <ModeBadge testMode={merchant.testMode} /> },
                        { term: "Created", detail: dateTime(merchant.createdAt) },
                      ]}
                    />
                  </Card>
                  <Card title="Business profile">
                    {profile ? (
                      <DetailList
                        items={[
                          { term: "Legal name", detail: profile.legalName },
                          { term: "Registration number", detail: profile.registrationNumber },
                          { term: "Business type", detail: profile.businessType },
                          { term: "Contact", detail: `${profile.contactEmail} / ${profile.contactPhone}` },
                          {
                            term: "Address",
                            detail: `${profile.addressLine1}${profile.addressLine2 ? `, ${profile.addressLine2}` : ""}, ${profile.city}${
                              profile.postalCode ? ` ${profile.postalCode}` : ""
                            }, ${profile.country}`,
                          },
                        ]}
                      />
                    ) : (
                      <EmptyState compact icon="file" title="No business profile submitted yet" />
                    )}
                  </Card>
                </div>

                <Card flush title="Recent settlement batches">
                  <div className="fp-table-wrap">
                    <table className="fp-table fp-table--stack">
                      <caption className="fp-sr-only">Recent settlement batches</caption>
                      <thead>
                        <tr>
                          <th scope="col">Date</th>
                          <th scope="col">Status</th>
                          <th scope="col" className="fp-num">Gross</th>
                          <th scope="col" className="fp-num">Fee</th>
                          <th scope="col" className="fp-num">Net payout</th>
                        </tr>
                      </thead>
                      <tbody>
                        {batches.map((batch) => (
                          <tr key={batch.id}>
                            <td className="fp-cell-head fp-num">{batch.batchDate}</td>
                            <td data-label="Status">
                              <StatusBadge kind="batch" value={batch.status} />
                            </td>
                            <td data-label="Gross" className="fp-num">
                              <Money fils={batch.grossFils} />
                            </td>
                            <td data-label="Fee" className="fp-num">
                              <Money fils={batch.feeFils} />
                            </td>
                            <td data-label="Net payout" className="fp-num">
                              <Money fils={batch.netPayoutFils} />
                            </td>
                          </tr>
                        ))}
                        {batches.length === 0 ? (
                          <tr className="fp-table__empty">
                            <td colSpan={5}>
                              <EmptyState compact icon="settlement" title="No batches yet" />
                            </td>
                          </tr>
                        ) : null}
                      </tbody>
                    </table>
                  </div>
                </Card>
              </div>
            </TabPanel>
          ) : null}

          {tab === "money" ? (
            <TabPanel idBase="merchant" value="money">
              <div className="admin-actions-grid">
                <Card
                  title="Adjust balance"
                  tone="caution"
                  tag="Moves money"
                  subtitle="A direct correction to this merchant's cached payable balance, for when support has confirmed the figure on screen is wrong and it needs to be right now rather than after the next settlement cycle."
                >
                  <RequireRole
                    allow={["finance", "super_admin"]}
                    fallback={financeOnly("Your role is read-only for balance corrections. Ask a finance admin.")}
                  >
                    <div className="fp-form">
                      <Field
                        label="Delta (fils, may be negative)"
                        error={adjustError}
                        hint={deltaPreview !== null ? `= ${bhd(deltaPreview)}` : "1,000 fils = 1 BHD."}
                      >
                        {(props) => (
                          <input
                            {...props}
                            className="fp-input fp-num"
                            value={adjustDeltaFils}
                            onChange={(e) => {
                              setAdjustDeltaFils(e.target.value);
                              setAdjustError(null);
                            }}
                            inputMode="numeric"
                            placeholder="e.g. 50000"
                          />
                        )}
                      </Field>
                      <Field label="Reason" hint="Recorded with the adjustment.">
                        {(props) => (
                          <input
                            {...props}
                            className="fp-input"
                            value={adjustReason}
                            onChange={(e) => setAdjustReason(e.target.value)}
                            placeholder="e.g. phone confirmation with merchant"
                          />
                        )}
                      </Field>
                      <div>
                        <Button
                          variant="primary"
                          disabled={busy || !adjustDeltaFils.trim() || !adjustReason.trim()}
                          onClick={requestAdjust}
                        >
                          Adjust balance…
                        </Button>
                      </div>
                    </div>
                  </RequireRole>
                </Card>

                <Card
                  title="Issue credit"
                  tone="caution"
                  tag="Moves money"
                  subtitle={
                    <>
                      Journals a manual credit to this merchant&apos;s payable balance. Above the
                      approval limit it waits in <Link to="/credits">Credits</Link> for a second
                      finance operator; at or below it, it posts immediately.
                    </>
                  }
                >
                  <RequireRole
                    allow={["finance", "super_admin"]}
                    fallback={financeOnly("Your role cannot issue credits. Ask a finance admin.")}
                  >
                    <form className="fp-form" onSubmit={requestCredit}>
                      <Field
                        label="Amount (BD, up to 3 decimals)"
                        error={creditError}
                        hint={creditPreview !== null ? `= ${bhd(creditPreview)} (${creditPreview} fils)` : undefined}
                      >
                        {(props) => (
                          <input
                            {...props}
                            className="fp-input fp-num"
                            type="text"
                            required
                            placeholder="e.g. 50.000"
                            value={creditAmountBhd}
                            onChange={(e) => {
                              setCreditAmountBhd(e.target.value);
                              setCreditError(null);
                            }}
                          />
                        )}
                      </Field>
                      <div className="fp-form-grid">
                        <Field label="Reason">
                          {(props) => (
                            <select
                              {...props}
                              className="fp-select"
                              value={creditReason}
                              onChange={(e) => setCreditReason(e.target.value as CreditReasonCode)}
                            >
                              <option value="goodwill">Goodwill</option>
                              <option value="dispute_resolution">Dispute resolution</option>
                              <option value="correction">Correction</option>
                            </select>
                          )}
                        </Field>
                        <Field label="Effective date" hint="The accounting date the ledger legs are booked against.">
                          {(props) => (
                            <input
                              {...props}
                              className="fp-input"
                              type="date"
                              required
                              value={creditEffectiveDate}
                              onChange={(e) => setCreditEffectiveDate(e.target.value)}
                            />
                          )}
                        </Field>
                      </div>
                      <label className="fp-check">
                        <input
                          type="checkbox"
                          checked={creditReverseFee}
                          onChange={(e) => setCreditReverseFee(e.target.checked)}
                        />
                        Also reverse the MDR on this amount ({percentFromBps(merchant.mdrBps)})
                      </label>
                      <Field label="Memo" optional>
                        {(props) => (
                          <textarea
                            {...props}
                            className="fp-textarea"
                            value={creditMemo}
                            onChange={(e) => setCreditMemo(e.target.value)}
                            rows={2}
                          />
                        )}
                      </Field>
                      <div>
                        <Button type="submit" variant="primary" disabled={busy}>
                          Issue credit…
                        </Button>
                      </div>
                    </form>
                  </RequireRole>
                </Card>

                <Card
                  title="Recompute transaction statuses"
                  tone="caution"
                  tag="Rewrites statuses"
                  tagIcon="replay"
                  subtitle="Re-derives this merchant's transaction statuses from their own captured/refunded amounts. Rows written before the refunds release can carry a status that predates the derivation rule; this backfills them. Rows that already agree are left alone."
                >
                  <RequireRole
                    allow={["finance", "super_admin"]}
                    fallback={financeOnly("Your role cannot run this backfill. Ask a finance admin.")}
                  >
                    <Button variant="secondary" icon="replay" disabled={busy} onClick={() => setPending("recompute")}>
                      Recompute statuses…
                    </Button>
                  </RequireRole>
                </Card>
              </div>
            </TabPanel>
          ) : null}

          {tab === "compliance" ? (
            <TabPanel idBase="merchant" value="compliance">
              <div className="fp-stack">
                <Card
                  title="KYC review"
                  subtitle={
                    <>
                      Approving or rejecting requires the <code>finance</code> or{" "}
                      <code>super_admin</code> role; the API enforces it and answers <code>403</code>{" "}
                      otherwise.
                    </>
                  }
                  actions={<KycBadge passed={merchant.kycPassed} />}
                >
                  <RequireRole
                    allow={["finance", "super_admin"]}
                    fallback={financeOnly("Your role is read-only for KYC decisions. Ask a finance admin to review.")}
                  >
                    <div className="fp-form">
                      <Field label="Notes" optional>
                        {(props) => (
                          <textarea
                            {...props}
                            className="fp-textarea"
                            value={kycNotes}
                            onChange={(e) => setKycNotes(e.target.value)}
                            rows={3}
                          />
                        )}
                      </Field>
                      <div className="fp-form-actions">
                        <Button variant="primary" icon="checkCircle" disabled={busy} onClick={() => setPending("kyc-approved")}>
                          Approve KYC…
                        </Button>
                        <Button variant="danger" icon="xCircle" disabled={busy} onClick={() => setPending("kyc-rejected")}>
                          Reject KYC…
                        </Button>
                      </div>
                    </div>
                  </RequireRole>
                </Card>

                <Card flush title="Review history">
                  <div className="fp-table-wrap">
                    <table className="fp-table fp-table--stack">
                      <caption className="fp-sr-only">KYC review history</caption>
                      <thead>
                        <tr>
                          <th scope="col">Outcome</th>
                          <th scope="col">Reviewer</th>
                          <th scope="col">Notes</th>
                          <th scope="col">Reviewed at</th>
                        </tr>
                      </thead>
                      <tbody>
                        {kycReviews.map((review) => (
                          <tr key={review.id}>
                            <td className="fp-cell-head">
                              <StatusBadge kind="kycOutcome" value={review.outcome} />
                            </td>
                            <td data-label="Reviewer">{review.reviewerIdentifier}</td>
                            <td data-label="Notes">{review.notes ?? "—"}</td>
                            <td data-label="Reviewed at">{dateTime(review.reviewedAt)}</td>
                          </tr>
                        ))}
                        {kycReviews.length === 0 ? (
                          <tr className="fp-table__empty">
                            <td colSpan={4}>
                              <EmptyState compact icon="shield" title="No reviews recorded" />
                            </td>
                          </tr>
                        ) : null}
                      </tbody>
                    </table>
                  </div>
                </Card>
              </div>
            </TabPanel>
          ) : null}

          {tab === "integrations" ? (
            <TabPanel idBase="merchant" value="integrations">
              <div className="fp-stack">
                {rotatedKey ? (
                  <Card title="New API key — copy it now" tone="danger" icon="key">
                    <div className="fp-stack fp-stack--sm">
                      <Alert tone="warning" title="Shown once">
                        This value is shown once and is not recoverable afterwards.
                      </Alert>
                      <div className="fp-secret">
                        <code aria-label="New API key">{rotatedKey.rawKey}</code>
                        <CopyButton value={rotatedKey.rawKey} label="Copy key" copiedMessage="API key copied" size="md" />
                      </div>
                      <p className="fp-muted fp-small">
                        New key id <code className="fp-mono">{rotatedKey.id}</code>, replacing previous key{" "}
                        <code className="fp-mono">{rotatedKey.previousKeyId}</code>.
                      </p>
                      <div>
                        <Button variant="secondary" onClick={() => setRotatedKey(null)}>
                          I&apos;ve stored it — dismiss
                        </Button>
                      </div>
                    </div>
                  </Card>
                ) : null}

                <Card flush title="API keys" icon="key">
                  <div className="fp-table-wrap">
                    <table className="fp-table fp-table--stack">
                      <caption className="fp-sr-only">API keys</caption>
                      <thead>
                        <tr>
                          <th scope="col">Prefix</th>
                          <th scope="col">Label</th>
                          <th scope="col">Created</th>
                          <th scope="col">Last used</th>
                          <th scope="col">Revoked</th>
                          <th scope="col" className="fp-col-actions">
                            <span className="fp-sr-only">Actions</span>
                          </th>
                        </tr>
                      </thead>
                      <tbody>
                        {apiKeys.map((key) => (
                          <tr key={key.id}>
                            <td className="fp-cell-head">
                              <code className="fp-mono">{key.prefix}…</code>
                            </td>
                            <td data-label="Label">{key.label ?? "—"}</td>
                            <td data-label="Created">{dateOnly(key.createdAt)}</td>
                            <td data-label="Last used">{key.lastUsedAt ? dateTime(key.lastUsedAt) : "never"}</td>
                            <td data-label="Revoked">
                              {key.revokedAt ? (
                                <StatusBadge kind="endpoint" value="disabled" />
                              ) : (
                                <span className="fp-muted">—</span>
                              )}
                              {key.revokedAt ? <span className="fp-table__sub">{dateTime(key.revokedAt)}</span> : null}
                            </td>
                            <td className="fp-col-actions">
                              {key.revokedAt ? null : (
                                <RequireRole
                                  allow={["finance", "super_admin"]}
                                  fallback={<span className="fp-muted fp-xs">finance role required</span>}
                                >
                                  <Button size="sm" variant="secondary" icon="replay" onClick={() => setPendingRotation(key.id)}>
                                    Rotate…
                                  </Button>
                                </RequireRole>
                              )}
                            </td>
                          </tr>
                        ))}
                        {apiKeys.length === 0 ? (
                          <tr className="fp-table__empty">
                            <td colSpan={6}>
                              <EmptyState compact icon="key" title="No API keys" />
                            </td>
                          </tr>
                        ) : null}
                      </tbody>
                    </table>
                  </div>
                </Card>

                <Card
                  flush
                  title="Webhook endpoints"
                  icon="webhook"
                  actions={
                    <Link className="fp-btn fp-btn--secondary fp-btn--sm" to={`/webhooks/${merchant.id}`}>
                      Replay deliveries
                    </Link>
                  }
                >
                  <div className="fp-table-wrap">
                    <table className="fp-table fp-table--stack">
                      <caption className="fp-sr-only">Webhook endpoints</caption>
                      <thead>
                        <tr>
                          <th scope="col">URL</th>
                          <th scope="col">Status</th>
                          <th scope="col">Secret prefix</th>
                          <th scope="col">Created</th>
                        </tr>
                      </thead>
                      <tbody>
                        {webhookEndpoints.map((endpoint) => (
                          <tr key={endpoint.id}>
                            <td className="fp-cell-head">
                              <span className="fp-mono">{endpoint.url}</span>
                            </td>
                            <td data-label="Status">
                              <StatusBadge kind="endpoint" value={endpoint.status} />
                            </td>
                            <td data-label="Secret prefix">
                              <code className="fp-mono">{endpoint.secretPrefix}…</code>
                            </td>
                            <td data-label="Created">{dateOnly(endpoint.createdAt)}</td>
                          </tr>
                        ))}
                        {webhookEndpoints.length === 0 ? (
                          <tr className="fp-table__empty">
                            <td colSpan={4}>
                              <EmptyState compact icon="webhook" title="No endpoints registered" />
                            </td>
                          </tr>
                        ) : null}
                      </tbody>
                    </table>
                  </div>
                </Card>
              </div>
            </TabPanel>
          ) : null}

          {tab === "access" ? (
            <TabPanel idBase="merchant" value="access">
              <Card
                title="View as merchant"
                tone="danger"
                tag="Impersonation"
                tagIcon="eye"
                subtitle="Starts a short-lived, audited impersonation grant. It always acts with this merchant's least-privileged support role — never with your admin role — and it expires on its own. A banner stays on screen until you exit it."
              >
                <div className="fp-stack fp-stack--sm">
                  <div>
                    <Button variant="danger" icon="eye" disabled={busy} onClick={() => setPending("impersonate")}>
                      View as merchant…
                    </Button>
                  </div>
                  {impersonationUrl ? (
                    <Alert tone="warning" title="Your browser blocked the new tab">
                      <a href={impersonationUrl} target="_blank" rel="noreferrer">
                        Open the merchant dashboard
                      </a>
                      .
                    </Alert>
                  ) : null}
                </div>
              </Card>
            </TabPanel>
          ) : null}
        </div>
      </div>

      <ConfirmDialog
        open={pending === "adjust"}
        title="Adjust cached payable balance?"
        tone="warning"
        confirmLabel="Adjust balance"
        busyLabel="Adjusting…"
        busy={busy}
        onConfirm={() => void handleAdjustBalance()}
        onCancel={() => setPending(null)}
      >
        <p>
          {merchant.displayName}: change by{" "}
          <strong>{deltaPreview !== null ? <Money fils={deltaPreview} /> : adjustDeltaFils}</strong>
          {detail.balance ? (
            <>
              {" "}
              from <Money fils={detail.balance.cachedPayableFils} />
            </>
          ) : null}
          .
        </p>
        <p>Reason: {adjustReason.trim()}</p>
      </ConfirmDialog>

      <ConfirmDialog
        open={pending === "credit"}
        title="Issue this credit?"
        tone="warning"
        confirmLabel="Issue credit"
        busyLabel="Submitting…"
        busy={busy}
        onConfirm={() => void handleIssueCredit()}
        onCancel={() => setPending(null)}
      >
        <p>
          <strong>{creditPreview !== null ? <Money fils={creditPreview} /> : creditAmountBhd}</strong> to{" "}
          {merchant.displayName} · {CREDIT_REASONS[creditReason]} · effective {creditEffectiveDate}
          {creditReverseFee ? `, reversing the MDR (${percentFromBps(merchant.mdrBps)})` : ""}.
        </p>
        <p>Above the approval limit it waits for a second finance operator instead of posting.</p>
      </ConfirmDialog>

      <ConfirmDialog
        open={pending === "recompute"}
        title="Recompute transaction statuses?"
        tone="warning"
        confirmLabel="Recompute statuses"
        busyLabel="Working…"
        busy={busy}
        onConfirm={() => void handleRecomputeStatuses()}
        onCancel={() => setPending(null)}
      >
        <p>Re-derives every transaction status for {merchant.displayName}. Rows that already agree are left alone.</p>
      </ConfirmDialog>

      <ConfirmDialog
        open={pending === "kyc-approved" || pending === "kyc-rejected"}
        title={pending === "kyc-rejected" ? "Reject KYC?" : "Approve KYC?"}
        tone={pending === "kyc-rejected" ? "danger" : "primary"}
        confirmLabel={pending === "kyc-rejected" ? "Reject KYC" : "Approve KYC"}
        busyLabel="Submitting…"
        busy={busy}
        onConfirm={() => void handleKycReview(pending === "kyc-rejected" ? "rejected" : "approved")}
        onCancel={() => setPending(null)}
      >
        <p>
          Records a {pending === "kyc-rejected" ? "rejection" : "approval"} for {merchant.displayName}
          {kycNotes.trim() ? " with your notes" : " without notes"}.
        </p>
      </ConfirmDialog>

      <ConfirmDialog
        open={pending === "impersonate"}
        title={`View as ${merchant.displayName}?`}
        tone="danger"
        confirmLabel="Start impersonation"
        busyLabel="Starting…"
        busy={busy}
        onConfirm={() => void handleImpersonate()}
        onCancel={() => setPending(null)}
      >
        <p>
          An audited grant starts now and the merchant dashboard opens in a new tab. Admin screens stay
          paused until you exit impersonation.
        </p>
      </ConfirmDialog>

      <ConfirmDialog
        open={pendingRotation !== null}
        title="Rotate this API key?"
        confirmLabel="Yes, rotate it"
        busyLabel="Rotating…"
        busy={busy}
        onConfirm={() => pendingRotation && void handleRotate(pendingRotation)}
        onCancel={() => {
          setPendingRotation(null);
          setRotationLabel("");
        }}
      >
        <p>
          The current key is revoked and a replacement is issued in the same transaction, so the
          merchant is never left without a working key — but any integration still sending the old
          key will start failing immediately.
        </p>
        <Field label="Label for the new key" optional>
          {(props) => (
            <input
              {...props}
              className="fp-input"
              type="text"
              value={rotationLabel}
              onChange={(e) => setRotationLabel(e.target.value)}
            />
          )}
        </Field>
      </ConfirmDialog>
    </>
  );
}
