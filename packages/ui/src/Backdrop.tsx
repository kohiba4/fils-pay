import { useEffect } from "react";
import { cx } from "./text.js";

/**
 * The decorative page background (dots + soft colored light). Rendered once
 * per screen, behind everything, invisible to assistive tech and to the
 * pointer. Pure CSS motion — no timers, no re-renders. While the tab is
 * hidden the animation is paused via `html[data-fp-hidden]`.
 *
 * `quiet` (checkout, sign-in) is dimmer and does not move.
 */
export function Backdrop({ quiet = false }: { quiet?: boolean }) {
  useEffect(() => {
    const root = document.documentElement;
    const sync = () => root.toggleAttribute("data-fp-hidden", document.hidden);
    sync();
    document.addEventListener("visibilitychange", sync);
    return () => document.removeEventListener("visibilitychange", sync);
  }, []);

  return (
    <div className={cx("fp-backdrop", quiet && "fp-backdrop--quiet")} aria-hidden="true">
      <div className="fp-backdrop__glow fp-backdrop__glow--violet" />
      <div className="fp-backdrop__glow fp-backdrop__glow--lavender" />
      <div className="fp-backdrop__glow fp-backdrop__glow--pink" />
      <div className="fp-backdrop__glow fp-backdrop__glow--cyan" />
      <div className="fp-backdrop__dots">
        <div className="fp-backdrop__dots-layer fp-backdrop__dots-layer--a" />
        <div className="fp-backdrop__dots-layer fp-backdrop__dots-layer--b" />
      </div>
    </div>
  );
}
