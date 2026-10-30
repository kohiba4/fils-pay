import type { ReactNode } from "react";
import { Icon } from "./Icon.js";
import type { IconName } from "./Icon.js";
import { cx } from "./text.js";

export type Tone = "neutral" | "success" | "danger" | "warning" | "info" | "brand";

/**
 * A status label. Colour is never the only signal: every badge carries its
 * text, and either a dot or an icon whose shape differs by meaning.
 */
export function Badge({
  tone = "neutral",
  icon,
  outline = false,
  title,
  children,
}: {
  tone?: Tone;
  icon?: IconName;
  outline?: boolean;
  title?: string;
  children: ReactNode;
}) {
  return (
    <span
      className={cx("fp-badge", tone !== "neutral" && `fp-badge--${tone}`, outline && "fp-badge--outline")}
      title={title}
    >
      {icon ? <Icon name={icon} size={14} /> : <span className="fp-badge__dot" aria-hidden="true" />}
      {children}
    </span>
  );
}
