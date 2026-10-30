import { useId, useRef } from "react";
import type { ReactNode } from "react";
import { createPortal } from "react-dom";
import { Button } from "./Button.js";
import type { ButtonVariant } from "./Button.js";
import { useModalFocus } from "./focus.js";
import { Icon } from "./Icon.js";
import type { IconName } from "./Icon.js";
import { cx } from "./text.js";

/**
 * Accessible modal: portal to `<body>`, `role="dialog"` + `aria-modal`,
 * labelled by its title, focus trapped and restored, Escape and backdrop
 * close it — except while `busy`, so a request in flight can't be orphaned
 * by a stray click.
 */
export function Dialog({
  open,
  onClose,
  title,
  icon,
  tone = "default",
  size = "md",
  busy = false,
  footer,
  children,
}: {
  open: boolean;
  onClose: () => void;
  title: ReactNode;
  icon?: IconName;
  tone?: "default" | "danger" | "warning";
  size?: "md" | "lg";
  busy?: boolean;
  footer?: ReactNode;
  children?: ReactNode;
}) {
  const panelRef = useRef<HTMLDivElement>(null);
  const titleId = useId();
  const close = () => {
    if (!busy) onClose();
  };
  useModalFocus(open, panelRef, close);

  if (!open) return null;
  return createPortal(
    <div
      className="fp-overlay"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) close();
      }}
    >
      <div
        ref={panelRef}
        className={cx("fp-dialog", size === "lg" && "fp-dialog--lg")}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
      >
        <div className="fp-dialog__header">
          {icon ? (
            <span className={cx("fp-dialog__icon", tone !== "default" && `fp-dialog__icon--${tone}`)}>
              <Icon name={icon} size={20} />
            </span>
          ) : null}
          <h2 className="fp-dialog__title" id={titleId}>
            {title}
          </h2>
          <Button
            variant="ghost"
            size="sm"
            iconOnly
            icon="close"
            className="fp-dialog__close"
            onClick={close}
            disabled={busy}
          >
            Close
          </Button>
        </div>
        <div className="fp-dialog__body">{children}</div>
        {footer ? <div className="fp-dialog__footer">{footer}</div> : null}
      </div>
    </div>,
    document.body,
  );
}

/**
 * Replaces `window.confirm` for anything that moves money, deletes, or
 * revokes. The confirming button says exactly what will happen; Cancel is
 * focused first so Enter never confirms by accident.
 */
export function ConfirmDialog({
  open,
  title,
  children,
  confirmLabel,
  busyLabel,
  cancelLabel = "Cancel",
  tone = "danger",
  busy = false,
  confirmDisabled = false,
  onConfirm,
  onCancel,
}: {
  open: boolean;
  title: ReactNode;
  children?: ReactNode;
  confirmLabel: string;
  busyLabel?: string;
  cancelLabel?: string;
  tone?: "danger" | "warning" | "primary";
  busy?: boolean;
  confirmDisabled?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  const variant: ButtonVariant = tone === "danger" ? "danger-solid" : "primary";
  return (
    <Dialog
      open={open}
      onClose={onCancel}
      title={title}
      icon={tone === "primary" ? "info" : "alert"}
      tone={tone === "primary" ? "default" : tone}
      busy={busy}
      footer={
        <>
          <Button variant="secondary" onClick={onCancel} disabled={busy} data-autofocus>
            {cancelLabel}
          </Button>
          <Button variant={variant} onClick={onConfirm} loading={busy} disabled={confirmDisabled}>
            {busy && busyLabel ? busyLabel : confirmLabel}
          </Button>
        </>
      }
    >
      {children}
    </Dialog>
  );
}

/** Side sheet. `side="start"` is the mobile navigation drawer. */
export function Drawer({
  open,
  onClose,
  title,
  side = "end",
  children,
}: {
  open: boolean;
  onClose: () => void;
  title: ReactNode;
  side?: "start" | "end";
  children?: ReactNode;
}) {
  const panelRef = useRef<HTMLDivElement>(null);
  const titleId = useId();
  useModalFocus(open, panelRef, onClose);

  if (!open) return null;
  return createPortal(
    <div
      className="fp-overlay fp-overlay--drawer"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div
        ref={panelRef}
        className={cx("fp-drawer", `fp-drawer--${side}`)}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
      >
        <div className="fp-drawer__header">
          <h2 className="fp-drawer__title" id={titleId}>
            {title}
          </h2>
          <Button variant="ghost" iconOnly icon="close" onClick={onClose}>
            Close
          </Button>
        </div>
        <div className="fp-drawer__body">{children}</div>
      </div>
    </div>,
    document.body,
  );
}
