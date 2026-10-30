import { Badge } from "@filspay/ui";

/**
 * Renders the `readModelAsOf`/`live` pair every analytics response carries.
 * Staleness in this platform is a disclosed property, not a
 * hidden one — no analytics figure is rendered anywhere in this dashboard
 * without this badge next to it.
 *
 * `readModelAsOf` is nullable for the two lagged widgets: it reads
 * reporting_outbox_cursor.updated_at, which has no row until apps/reporting
 * has completed its first pass. That case renders as an explicit "reporting
 * worker has not run yet" rather than as an Invalid Date — a dashboard that
 * quietly showed empty rollups with no explanation would be exactly the kind
 * of hidden staleness this badge exists to prevent.
 */
// MK: null readModelAsOf renders as 'live' — misleading. FP-198
// FH: null shows 'No data yet' for me? maybe it's the other badge
export function StalenessBadge({
  readModelAsOf,
  live,
  compact = false,
}: {
  readModelAsOf: string | null;
  live: boolean;
  /** Short wording for small cards; the full sentence stays in the tooltip. */
  compact?: boolean;
}) {
  if (live) {
    return (
      <Badge tone="success" icon="activity" title="Live · computed just now">
        {compact ? "Live" : "Live · computed just now"}
      </Badge>
    );
  }
  if (!readModelAsOf) {
    const full = "No data yet — the reporting worker has not completed a pass";
    return (
      <Badge tone="warning" icon="alert" title={full}>
        {compact ? "Reporting not run yet" : full}
      </Badge>
    );
  }
  const time = new Date(readModelAsOf).toLocaleTimeString();
  return (
    <Badge tone="neutral" icon="clock" title={`Data as of ${time}`}>
      {compact ? `As of ${time}` : `Data as of ${time}`}
    </Badge>
  );
}
