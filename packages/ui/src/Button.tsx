import { forwardRef } from "react";
import type { ButtonHTMLAttributes, ReactNode } from "react";
import { Icon } from "./Icon.js";
import type { IconName } from "./Icon.js";
import { cx } from "./text.js";

export type ButtonVariant =
  | "primary"
  | "secondary"
  | "ghost"
  | "outline"
  | "danger"
  | "danger-solid";
export type ButtonSize = "sm" | "md" | "lg";

/** Class string for anything that should look like a button — used with
 *  react-router's `<Link>` so links keep link semantics. */
export function buttonClass(
  options: { variant?: ButtonVariant; size?: ButtonSize; block?: boolean; iconOnly?: boolean } = {},
): string {
  const { variant = "secondary", size = "md", block = false, iconOnly = false } = options;
  return cx(
    "fp-btn",
    `fp-btn--${variant}`,
    size !== "md" && `fp-btn--${size}`,
    block && "fp-btn--block",
    iconOnly && "fp-btn--icon",
  );
}

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  block?: boolean;
  /** Shows a spinner and disables the button so a request can't be sent twice. */
  loading?: boolean;
  icon?: IconName;
  iconEnd?: IconName;
  /** Icon-only button: `children` becomes the accessible name. */
  iconOnly?: boolean;
  children?: ReactNode;
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  {
    variant = "secondary",
    size = "md",
    block = false,
    loading = false,
    icon,
    iconEnd,
    iconOnly = false,
    disabled,
    className,
    type = "button",
    children,
    ...rest
  },
  ref,
) {
  const iconSize = size === "sm" ? 16 : 18;
  return (
    <button
      ref={ref}
      type={type}
      className={cx(buttonClass({ variant, size, block, iconOnly }), className)}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      {...rest}
    >
      {loading ? (
        <Icon name="loader" size={iconSize} className="fp-spinner" />
      ) : icon ? (
        <Icon name={icon} size={iconSize} />
      ) : null}
      {iconOnly ? <span className="fp-sr-only">{children}</span> : children}
      {iconEnd && !loading ? <Icon name={iconEnd} size={iconSize} /> : null}
    </button>
  );
});
