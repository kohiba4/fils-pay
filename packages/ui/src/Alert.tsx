import type { ReactNode } from "react";
import { Button } from "./Button.js";
import { Icon } from "./Icon.js";
import type { IconName } from "./Icon.js";
import { cx } from "./text.js";

export type AlertTone = "info" | "success" | "warning" | "danger" | "neutral";

const ICONS: Record<AlertTone, IconName> = {
  info: "info",
  success: "checkCircle",
  warning: "alert",
  danger: "alertCircle",
  neutral: "info",
};

/**
 * Inline message. Errors use `role="alert"` so they are announced when they
 * appear; everything else is a polite `status`.
 */
export function Alert({
  tone = "info",
  title,
  children,
  actions,
  onDismiss,
  className,
}: {
  tone?: AlertTone;
  title?: ReactNode;
  children?: ReactNode;
  actions?: ReactNode;
  onDismiss?: () => void;
  className?: string;
}) {
  return (
    <div
      className={cx("fp-alert", tone !== "info" && `fp-alert--${tone}`, className)}
      role={tone === "danger" ? "alert" : "status"}
    >
      <Icon name={ICONS[tone]} size={18} className="fp-alert__icon" />
      <div className="fp-alert__content">
        {title ? <div className="fp-alert__title">{title}</div> : null}
        {children ? <div className="fp-alert__body">{children}</div> : null}
        {actions ? <div className="fp-alert__actions">{actions}</div> : null}
      </div>
      {onDismiss ? (
        <Button variant="ghost" size="sm" iconOnly icon="close" className="fp-alert__dismiss" onClick={onDismiss}>
          Dismiss
        </Button>
      ) : null}
    </div>
  );
}
