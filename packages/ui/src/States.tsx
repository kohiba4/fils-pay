import type { CSSProperties, ReactNode } from "react";
import { Icon } from "./Icon.js";
import type { IconName } from "./Icon.js";
import { cx } from "./text.js";

/** "Nothing here" with a reason and, when one exists, the next step. */
export function EmptyState({
  icon = "inbox",
  title,
  children,
  action,
  compact = false,
}: {
  icon?: IconName;
  title: ReactNode;
  children?: ReactNode;
  action?: ReactNode;
  compact?: boolean;
}) {
  return (
    <div className={cx("fp-empty", compact && "fp-empty--compact")}>
      <span className="fp-empty__icon">
        <Icon name={icon} size={22} />
      </span>
      <div className="fp-empty__title">{title}</div>
      {children ? <div className="fp-empty__body">{children}</div> : null}
      {action ? <div className="fp-empty__action">{action}</div> : null}
    </div>
  );
}

export function Spinner({ size = 18, label }: { size?: number; label?: string }) {
  return <Icon name="loader" size={size} className="fp-spinner" label={label} />;
}

/** Centered spinner + text, announced politely. */
export function Loading({ children = "Loading…", page = false }: { children?: ReactNode; page?: boolean }) {
  return (
    <div className={cx("fp-loading", page && "fp-loading--page")} role="status" aria-live="polite">
      <Spinner />
      <span>{children}</span>
    </div>
  );
}

export function Skeleton({ width = "100%", height = 12, style }: { width?: string | number; height?: number; style?: CSSProperties }) {
  return <span className="fp-skeleton" style={{ width, height, ...style }} aria-hidden="true" />;
}

const SKELETON_WIDTHS = ["72%", "48%", "60%", "40%", "56%", "64%", "36%", "52%"];

/** Placeholder rows shaped like the table that is loading. */
export function SkeletonRows({ rows = 6, columns }: { rows?: number; columns: number }) {
  return (
    <>
      {Array.from({ length: rows }, (_, row) => (
        <tr key={row} aria-hidden="true">
          {Array.from({ length: columns }, (_, col) => (
            <td key={col}>
              <Skeleton width={SKELETON_WIDTHS[(row + col) % SKELETON_WIDTHS.length]} />
            </td>
          ))}
        </tr>
      ))}
    </>
  );
}
