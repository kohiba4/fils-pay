import { humanize } from "@filspay/ui";
import type { IconName, Tone } from "@filspay/ui";
import type {
  PaymentLinkStatus,
  PublicPaymentLinkStatus,
  SettlementBatchStatus,
  TransactionStatus,
  WebhookDeliveryStatus,
  WebhookEndpointStatus,
} from "./types.js";

/**
 * How each backend status is shown: a tone, a sentence-case label, and an
 * icon or dot. Presentation only — filters and requests keep the raw enum.
 * Distinct states never share both a tone and an icon, so they stay
 * distinguishable without colour.
 */
export interface StatusStyle {
  tone: Tone;
  label: string;
  icon?: IconName;
}

const TRANSACTION: Record<TransactionStatus, StatusStyle> = {
  authorized: { tone: "info", label: "Authorized", icon: "clock" },
  captured: { tone: "success", label: "Captured", icon: "checkCircle" },
  partially_captured: { tone: "info", label: "Partially captured" },
  voided: { tone: "neutral", label: "Voided", icon: "xCircle" },
  partially_refunded: { tone: "warning", label: "Partially refunded" },
  refunded: { tone: "neutral", label: "Refunded", icon: "replay" },
  chargeback: { tone: "danger", label: "Chargeback", icon: "alert" },
};

export function transactionStatus(status: TransactionStatus): StatusStyle {
  return TRANSACTION[status] ?? { tone: "neutral", label: humanize(status) };
}

/** A stored `active` link past its expiry is shown as expired — the same
 *  rule the API's own `derivePublicStatus` applies (expires_at <= now). The
 *  stored status is unchanged; this is display only. */
export type PaymentLinkDisplayStatus = PaymentLinkStatus | "expired";

export function paymentLinkDisplayStatus(
  link: { status: PaymentLinkStatus; expiresAt: string },
  now: number = Date.now(),
): PaymentLinkDisplayStatus {
  if (link.status === "active" && Date.parse(link.expiresAt) <= now) return "expired";
  return link.status;
}

const PAYMENT_LINK: Record<PaymentLinkDisplayStatus, StatusStyle> = {
  active: { tone: "brand", label: "Active" },
  reserved: { tone: "info", label: "Reserved · processing", icon: "loader" },
  paid: { tone: "success", label: "Paid", icon: "checkCircle" },
  canceled: { tone: "neutral", label: "Canceled", icon: "xCircle" },
  expired: { tone: "warning", label: "Expired", icon: "clock" },
};

export function paymentLinkStatus(status: PaymentLinkDisplayStatus): StatusStyle {
  return PAYMENT_LINK[status] ?? { tone: "neutral", label: humanize(status) };
}

const PUBLIC_LINK: Record<PublicPaymentLinkStatus, StatusStyle> = {
  active: PAYMENT_LINK.active,
  processing: { tone: "info", label: "Processing", icon: "loader" },
  paid: PAYMENT_LINK.paid,
  canceled: PAYMENT_LINK.canceled,
  expired: PAYMENT_LINK.expired,
};

export function publicLinkStatus(status: PublicPaymentLinkStatus): StatusStyle {
  return PUBLIC_LINK[status] ?? { tone: "neutral", label: humanize(status) };
}

const BATCH: Record<SettlementBatchStatus, StatusStyle> = {
  open: { tone: "info", label: "Open", icon: "clock" },
  closed: { tone: "warning", label: "Closed · awaiting payout" },
  paid: { tone: "success", label: "Paid", icon: "checkCircle" },
};

export function batchStatus(status: string): StatusStyle {
  return BATCH[status as SettlementBatchStatus] ?? { tone: "neutral", label: humanize(status) };
}

const DELIVERY: Record<WebhookDeliveryStatus, StatusStyle> = {
  pending: { tone: "info", label: "Pending", icon: "clock" },
  succeeded: { tone: "success", label: "Succeeded", icon: "checkCircle" },
  failed: { tone: "danger", label: "Failed", icon: "alertCircle" },
  exhausted: { tone: "danger", label: "Exhausted", icon: "xCircle" },
};

export function deliveryStatus(status: WebhookDeliveryStatus): StatusStyle {
  return DELIVERY[status] ?? { tone: "neutral", label: humanize(status) };
}

const ENDPOINT: Record<WebhookEndpointStatus, StatusStyle> = {
  active: { tone: "success", label: "Active" },
  disabled: { tone: "neutral", label: "Disabled", icon: "power" },
};

export function endpointStatus(status: WebhookEndpointStatus): StatusStyle {
  return ENDPOINT[status] ?? { tone: "neutral", label: humanize(status) };
}
