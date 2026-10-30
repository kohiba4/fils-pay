import { useEffect, useRef, useState } from "react";
import { Button } from "./Button.js";
import type { ButtonSize, ButtonVariant } from "./Button.js";
import { useToast } from "./Toast.js";

/**
 * Copies `value` to the clipboard and says so. When the Clipboard API is
 * unavailable (no permission, insecure context) it says that instead — the
 * value is always also on screen and selectable, so nothing is lost.
 */
export function CopyButton({
  value,
  label = "Copy",
  copiedMessage = "Copied to clipboard",
  variant = "secondary",
  size = "sm",
  iconOnly = false,
}: {
  value: string;
  label?: string;
  copiedMessage?: string;
  variant?: ButtonVariant;
  size?: ButtonSize;
  iconOnly?: boolean;
}) {
  const toast = useToast();
  const [copied, setCopied] = useState(false);
  const timer = useRef<number | undefined>(undefined);

  useEffect(() => () => window.clearTimeout(timer.current), []);

  async function handleCopy(): Promise<void> {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      toast(copiedMessage);
      window.clearTimeout(timer.current);
      timer.current = window.setTimeout(() => setCopied(false), 2000);
    } catch {
      setCopied(false);
      toast("Couldn't copy automatically — select the text and copy it manually.", "danger");
    }
  }

  return (
    <Button
      variant={variant}
      size={size}
      icon={copied ? "check" : "copy"}
      iconOnly={iconOnly}
      onClick={() => void handleCopy()}
    >
      {copied ? "Copied" : label}
    </Button>
  );
}

/** A monospace identifier with an optional copy control. */
export function IdText({
  value,
  copy = false,
  display,
  copyLabel = "Copy ID",
}: {
  value: string;
  copy?: boolean;
  display?: string;
  copyLabel?: string;
}) {
  return (
    <span className="fp-id">
      <code title={value}>{display ?? value}</code>
      {copy ? <CopyButton value={value} label={copyLabel} variant="ghost" iconOnly copiedMessage="ID copied" /> : null}
    </span>
  );
}
