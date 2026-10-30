import { Badge, humanize } from "@filspay/ui";
import type { IconName, Tone } from "@filspay/ui";

interface StatusStyle {
  tone: Tone;
  label: string;
  icon?: IconName;
}

/** Display-only mapping of the console's backend enums to badge styles. */
const STYLES: Record<string, Record<string, StatusStyle>> = {
  merchant: {
    active: { tone: "success", label: "Active" },
    suspended: { tone: "warning", label: "Suspended", icon: "alert" },
    closed: { tone: "neutral", label: "Closed", icon: "xCircle" },
  },
  onboarding: {
    submitted: { tone: "info", label: "Submitted" },
    under_review: { tone: "warning", label: "Under review", icon: "clock" },
    approved: { tone: "success", label: "Approved", icon: "checkCircle" },
    rejected: { tone: "danger", label: "Rejected", icon: "xCircle" },
  },
  kycOutcome: {
    approved: { tone: "success", label: "Approved", icon: "checkCircle" },
    rejected: { tone: "danger", label: "Rejected", icon: "xCircle" },
  },
  batch: {
    open: { tone: "info", label: "Open", icon: "clock" },
    closed: { tone: "warning", label: "Closed · awaiting payout" },
    paid: { tone: "success", label: "Paid", icon: "checkCircle" },
  },
  endpoint: {
    active: { tone: "success", label: "Active" },
    disabled: { tone: "neutral", label: "Disabled", icon: "power" },
  },
  credit: {
    pending_approval: { tone: "warning", label: "Awaiting approval", icon: "clock" },
    posted: { tone: "success", label: "Posted", icon: "checkCircle" },
    rejected: { tone: "danger", label: "Rejected", icon: "xCircle" },
  },
};

export type StatusKind = keyof typeof STYLES;

export function StatusBadge({ kind, value }: { kind: StatusKind; value: string }) {
  const style = STYLES[kind]?.[value] ?? { tone: "neutral" as Tone, label: humanize(value) };
  return (
    <Badge tone={style.tone} icon={style.icon} title={value}>
      {style.label}
    </Badge>
  );
}

export function KycBadge({ passed }: { passed: boolean }) {
  return passed ? (
    <Badge tone="success" icon="shield">
      Passed
    </Badge>
  ) : (
    <Badge tone="warning" icon="alert">
      Not passed
    </Badge>
  );
}

/** Test merchants are flagged loudly everywhere they appear. */
export function ModeBadge({ testMode }: { testMode: boolean }) {
  return testMode ? (
    <Badge tone="warning" icon="alert" title="Test-mode merchant">
      Test mode
    </Badge>
  ) : (
    <Badge tone="neutral" title="Live merchant">
      Live
    </Badge>
  );
}
