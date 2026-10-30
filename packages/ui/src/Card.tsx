import { useId } from "react";
import type { ReactNode } from "react";
import { Badge } from "./Badge.js";
import { Icon } from "./Icon.js";
import type { IconName } from "./Icon.js";
import { cx } from "./text.js";

/**
 * A titled surface. `tone="caution"` marks money-moving or platform-wide
 * actions (amber edge + "Moves money"-style tag); `tone="danger"` marks
 * destructive ones. Rendered as a labelled `<section>` when it has a title.
 */
export function Card({
  title,
  subtitle,
  icon,
  actions,
  tone,
  tag,
  tagIcon,
  glow = false,
  flush = false,
  footer,
  className,
  children,
}: {
  title?: ReactNode;
  subtitle?: ReactNode;
  icon?: IconName;
  actions?: ReactNode;
  tone?: "caution" | "danger";
  /** Short label shown next to the title, e.g. "Moves money". */
  tag?: string;
  tagIcon?: IconName;
  /** Faint violet light from the top corner — for the summary/selected card on a dashboard. */
  glow?: boolean;
  flush?: boolean;
  footer?: ReactNode;
  className?: string;
  children?: ReactNode;
}) {
  const titleId = useId();
  const hasHeader = title !== undefined || actions !== undefined;
  return (
    <section
      className={cx("fp-card", tone && `fp-card--${tone}`, glow && "fp-card--glow", className)}
      aria-labelledby={title !== undefined ? titleId : undefined}
    >
      {hasHeader ? (
        <header className="fp-card__header">
          <div>
            {title !== undefined ? (
              <h2 className="fp-card__title" id={titleId}>
                {icon ? <Icon name={icon} size={18} /> : null}
                {title}
                {tag ? (
                  <Badge tone={tone === "danger" ? "danger" : "warning"} icon={tagIcon ?? (tone === "danger" ? "alert" : "coins")}>
                    {tag}
                  </Badge>
                ) : null}
              </h2>
            ) : null}
            {subtitle ? <p className="fp-card__subtitle">{subtitle}</p> : null}
          </div>
          {actions ? <div className="fp-card__actions">{actions}</div> : null}
        </header>
      ) : null}
      <div className={cx("fp-card__body", flush && "fp-card__body--flush")}>{children}</div>
      {footer ? <div className="fp-card__footer">{footer}</div> : null}
    </section>
  );
}

/** One headline figure. `value` is pre-formatted by the caller. */
export function Metric({
  label,
  value,
  meta,
  icon,
  accent = false,
}: {
  label: ReactNode;
  value: ReactNode;
  meta?: ReactNode;
  icon?: IconName;
  accent?: boolean;
}) {
  return (
    <div className="fp-metric">
      <div className="fp-metric__label">
        {icon ? <Icon name={icon} size={16} /> : null}
        {label}
      </div>
      <div className={cx("fp-metric__value", accent && "fp-metric__value--accent")}>{value}</div>
      {meta ? <div className="fp-metric__meta">{meta}</div> : null}
    </div>
  );
}

/** A small labelled figure inside a card (2-up grid via `<Tiles>`). */
export function Tile({ value, label, selected = false }: { value: ReactNode; label: ReactNode; selected?: boolean }) {
  return (
    <div className={cx("fp-tile", selected && "fp-tile--selected")}>
      <div className="fp-tile__value">{value}</div>
      <div className="fp-tile__label">{label}</div>
    </div>
  );
}

export function Tiles({ children, label }: { children: ReactNode; label?: string }) {
  return (
    <div className="fp-tiles" role={label ? "group" : undefined} aria-label={label}>
      {children}
    </div>
  );
}
