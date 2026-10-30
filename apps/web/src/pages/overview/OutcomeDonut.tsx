import { formatCount } from "../../utils/helpers.js";

const R = 42;
const C = 2 * Math.PI * R;
const GAP = 2; // px of surface between the two segments

/** One-decimal share of a whole, from counts (never money). */
export function sharePercent(part: number, whole: number): string {
  if (whole <= 0) return "0.0";
  return (Math.round((part * 1000) / whole) / 10).toFixed(1);
}

/**
 * Part-to-whole of payment outcomes in the window: captured vs voided
 * payment counts, as the daily volume rollup reports them. The whole is
 * "captured + voided" — not every authorization (one still open is in
 * neither) — and the legend says so.
 *
 * Captured #8B5CF6 and voided #D8609F were checked as a pair with the dataviz
 * validator on the #16141C surface (CVD ΔE 15.3 protan; both in the lightness
 * band). Each segment is also labelled in the legend with its count and
 * share, so colour is never the only cue.
 */
export function OutcomeDonut({ captured, voided }: { captured: number; voided: number }) {
  const total = captured + voided;
  const capturedLen = total > 0 ? (captured / total) * C : 0;
  const voidedLen = total > 0 ? (voided / total) * C : 0;
  const both = captured > 0 && voided > 0;

  return (
    <figure className="dash-donut">
      <div className="dash-donut__ring">
        <svg viewBox="0 0 100 100" aria-hidden="true" focusable="false">
          <circle cx="50" cy="50" r={R} className="dash-donut__track" />
          {captured > 0 ? (
            <circle
              cx="50"
              cy="50"
              r={R}
              className="dash-donut__seg dash-donut__seg--captured"
              strokeDasharray={`${Math.max(0, capturedLen - (both ? GAP : 0))} ${C}`}
              transform="rotate(-90 50 50)"
            />
          ) : null}
          {voided > 0 ? (
            <circle
              cx="50"
              cy="50"
              r={R}
              className="dash-donut__seg dash-donut__seg--voided"
              strokeDasharray={`${Math.max(0, voidedLen - (both ? GAP : 0))} ${C}`}
              strokeDashoffset={-capturedLen}
              transform="rotate(-90 50 50)"
            />
          ) : null}
        </svg>
        <div className="dash-donut__center">
          <span className="dash-donut__value fp-num">{sharePercent(voided, total)}%</span>
          <span className="dash-donut__label">voided</span>
        </div>
      </div>
      <figcaption className="dash-donut__legend">
        <div className="dash-donut__row">
          <span className="dash-donut__swatch dash-donut__swatch--captured" aria-hidden="true" />
          <span>Captured</span>
          <span className="fp-num">{formatCount(captured)}</span>
          <span className="fp-num fp-muted">{sharePercent(captured, total)}%</span>
        </div>
        <div className="dash-donut__row">
          <span className="dash-donut__swatch dash-donut__swatch--voided" aria-hidden="true" />
          <span>Voided</span>
          <span className="fp-num">{formatCount(voided)}</span>
          <span className="fp-num fp-muted">{sharePercent(voided, total)}%</span>
        </div>
        <p className="fp-muted fp-xs dash-donut__note">
          Share of {formatCount(total)} payments captured or voided in this window.
        </p>
      </figcaption>
    </figure>
  );
}
