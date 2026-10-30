import { useState } from "react";
import { Money } from "../../components/Money.js";
import { bhd } from "../../format.js";
import { formatCount } from "../../utils/helpers.js";
import type { VolumePointDto } from "../../types.js";

/** Keeps the tooltip inside the plot: anchored at its start or end edge when
 *  the bar is near either side, centred otherwise. */
function tooltipEdge(leftPercent: number): "start" | "end" | undefined {
  if (leftPercent < 30) return "start";
  if (leftPercent > 70) return "end";
  return undefined;
}

/**
 * Daily captured gross as a single-series bar chart. Real data only: one bar
 * per point the API returned, height relative to the window's own peak (bar
 * geometry is the only arithmetic here; amounts are rendered by the shared
 * formatter). Single series, so no legend box — the card title names it and
 * the unit is on the axis. Hover shows the day's figures; the daily table
 * under the chart is the keyboard and screen-reader equivalent.
 *
 * Bars are slim with rounded ends in violet #8B5CF6 (checked with the dataviz
 * validator against the #16141C card surface: lightness band and 3:1
 * contrast pass); the hovered bar lifts to lavender.
 */
export function VolumeChart({ points }: { points: VolumePointDto[] }) {
  const [active, setActive] = useState<number | null>(null);
  const peak = Math.max(1, ...points.map((point) => point.capturedGrossFils));
  const activePoint = active === null ? null : points[active];
  const first = points[0];
  const last = points[points.length - 1];

  const summary =
    first && last
      ? `Daily captured gross from ${first.date} to ${last.date}; highest day ${bhd(peak)}. Exact figures are in the table below.`
      : "No data.";

  return (
    <figure className="dash-chart">
      <div className="dash-chart__frame">
        <div className="dash-chart__plot" role="img" aria-label={summary} onMouseLeave={() => setActive(null)}>
          <div className="dash-chart__grid" aria-hidden="true">
            <span />
            <span />
            <span />
            <span />
          </div>
          <div className="dash-chart__bars">
            {points.map((point, index) => (
              <div
                key={point.date}
                className="dash-chart__slot"
                data-active={active === index || undefined}
                onMouseEnter={() => setActive(index)}
              >
                <span
                  className="dash-chart__bar"
                  style={{ height: `${Math.max(point.capturedGrossFils > 0 ? 2 : 0, (point.capturedGrossFils / peak) * 100)}%` }}
                />
              </div>
            ))}
          </div>
          {activePoint && active !== null ? (
            <div
              className="dash-chart__tooltip"
              data-edge={tooltipEdge(((active + 0.5) / points.length) * 100)}
              style={{ left: `${((active + 0.5) / points.length) * 100}%` }}
              aria-hidden="true"
            >
              <div className="dash-chart__tooltip-date">{activePoint.date}</div>
              <div className="fp-between">
                <span className="fp-muted">Gross</span>
                <Money fils={activePoint.capturedGrossFils} />
              </div>
              <div className="fp-between">
                <span className="fp-muted">Captured</span>
                <span className="fp-num">{formatCount(activePoint.capturedCount)}</span>
              </div>
              <div className="fp-between">
                <span className="fp-muted">Voided</span>
                <span className="fp-num">{formatCount(activePoint.voidedCount)}</span>
              </div>
            </div>
          ) : null}
        </div>
        <div className="dash-chart__axis" aria-hidden="true">
          <span>
            <Money fils={peak} />
          </span>
          <span>0</span>
        </div>
      </div>
      {first && last ? (
        <div className="dash-chart__x" aria-hidden="true">
          <span>{first.date}</span>
          {points.length > 2 ? <span>{points[Math.floor(points.length / 2)]?.date}</span> : null}
          <span>{last.date}</span>
        </div>
      ) : null}
      <figcaption className="fp-sr-only">{summary}</figcaption>
    </figure>
  );
}
