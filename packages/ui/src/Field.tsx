import { useId } from "react";
import type { ReactNode } from "react";
import { Icon } from "./Icon.js";
import { cx } from "./text.js";

export interface FieldControlProps {
  id: string;
  "aria-describedby"?: string;
  "aria-invalid"?: true;
}

/**
 * Label + control + hint + inline error, wired together: the control gets
 * the label's `id`, and `aria-describedby` points at the hint and error so a
 * screen reader reads them with the field.
 */
export function Field({
  label,
  hint,
  error,
  optional = false,
  grow = false,
  className,
  children,
}: {
  label: ReactNode;
  hint?: ReactNode;
  error?: ReactNode;
  optional?: boolean;
  grow?: boolean;
  className?: string;
  children: (props: FieldControlProps) => ReactNode;
}) {
  const id = useId();
  const hintId = `${id}-hint`;
  const errorId = `${id}-error`;
  const describedBy = [hint ? hintId : null, error ? errorId : null].filter(Boolean).join(" ");
  return (
    <div className={cx("fp-field", grow && "fp-field--grow", className)}>
      <label className="fp-field__label" htmlFor={id}>
        {label}
        {optional ? <span className="fp-field__optional"> (optional)</span> : null}
      </label>
      {children({
        id,
        "aria-describedby": describedBy || undefined,
        "aria-invalid": error ? true : undefined,
      })}
      {hint ? (
        <div className="fp-field__hint" id={hintId}>
          {hint}
        </div>
      ) : null}
      {error ? (
        <div className="fp-field__error" id={errorId}>
          <Icon name="alertCircle" size={14} />
          <span>{error}</span>
        </div>
      ) : null}
    </div>
  );
}
