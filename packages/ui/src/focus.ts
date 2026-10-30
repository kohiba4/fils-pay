import { useEffect, useRef } from "react";
import type { RefObject } from "react";

const FOCUSABLE = [
  "a[href]",
  "button:not([disabled])",
  "input:not([disabled]):not([type='hidden'])",
  "select:not([disabled])",
  "textarea:not([disabled])",
  "[tabindex]:not([tabindex='-1'])",
].join(",");

/**
 * Where Tab should land inside a trapped container: wraps from the last
 * element to the first (and Shift+Tab from the first to the last). Returns
 * null when the browser's own move is fine. Pure, so it is unit-tested.
 */
export function wrapFocusIndex(current: number, count: number, backwards: boolean): number | null {
  if (count === 0) return null;
  if (current === -1) return backwards ? count - 1 : 0;
  if (backwards && current === 0) return count - 1;
  if (!backwards && current === count - 1) return 0;
  return null;
}

function focusableIn(container: HTMLElement): HTMLElement[] {
  return Array.from(container.querySelectorAll<HTMLElement>(FOCUSABLE)).filter(
    (el) => el.offsetParent !== null || el === document.activeElement,
  );
}

let scrollLocks = 0;

/**
 * Modal focus management for dialogs and drawers:
 * - moves focus in on open (`[data-autofocus]`, else the first control, else
 *   the container itself);
 * - keeps Tab / Shift+Tab inside;
 * - Escape calls `onEscape`;
 * - locks page scroll while open;
 * - returns focus to whatever had it before, on close.
 */
export function useModalFocus(
  open: boolean,
  containerRef: RefObject<HTMLElement>,
  onEscape: () => void,
): void {
  const escapeRef = useRef(onEscape);
  escapeRef.current = onEscape;

  useEffect(() => {
    if (!open) return;
    const container = containerRef.current;
    if (!container) return;
    const previouslyFocused = document.activeElement as HTMLElement | null;

    const initial =
      container.querySelector<HTMLElement>("[data-autofocus]") ?? focusableIn(container)[0] ?? container;
    initial.focus();

    scrollLocks += 1;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    function onKeyDown(event: KeyboardEvent): void {
      if (event.key === "Escape") {
        event.stopPropagation();
        escapeRef.current();
        return;
      }
      if (event.key !== "Tab" || !container) return;
      const items = focusableIn(container);
      const index = items.indexOf(document.activeElement as HTMLElement);
      const target = wrapFocusIndex(index, items.length, event.shiftKey);
      if (target !== null) {
        event.preventDefault();
        items[target]?.focus();
      } else if (items.length === 0) {
        event.preventDefault();
      }
    }

    container.addEventListener("keydown", onKeyDown);
    return () => {
      container.removeEventListener("keydown", onKeyDown);
      scrollLocks -= 1;
      if (scrollLocks === 0) document.body.style.overflow = previousOverflow;
      if (previouslyFocused && document.contains(previouslyFocused)) previouslyFocused.focus();
    };
  }, [open, containerRef]);
}
