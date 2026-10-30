import { useId, useState } from "react";
import { Money } from "../../components/Money.js";
import { StatusBadge } from "../../components/StatusBadge.js";
import { bhd } from "../../format.js";
import { batchStatus } from "../../status.js";
import type { PayoutTrendPointDto } from "../../types.js";

const W = 1000;
const H = 300;
const PAD_Y = 18;

/** The hover band for point `index`: halfway to each neighbour, clamped to the plot. */
function hitBand(index: number, count: number): { left: string; width: string } {
  if (count === 1) return { left: "0%", width: "100%" };
  const start = Math.max(0, (index - 0.5) / (count - 1));
  const end = Math.min(1, (index + 0.5) / (count - 1));
  return { left: `${start * 100}%`, width: `${(end - start) * 100}%` };
}

/**
 * Net payout per settlement batch, oldest to newest, as a line. Real batch
 * figures only, joined by straight segments (no curve smoothing, so no peak
 * or dip appears that the data does not have). The y-range always includes
 * zero, so a refund-heavy batch with a negative net reads as below the line.
 *
 * Stroke #16A0D0 (cyan step that passes the dataviz validator on the
 * #16141C surface); the glow and the area fill are decorative. Hovering a
 * batch shows its figures; the payout table on the page is the accessible
 * equivalent.
 */
export function PayoutLineChart({ points }: { points: PayoutTrendPointDto[] }) {
  const gradientId = useId();
  const [active, setActive] = useState<number | null>(null);
  // Oldest first, without assuming the API's order.
  const series = [...points].sort((a, b) => (a.batchDate < b.batchDate ? -1 : a.batchDate > b.batchDate ? 1 : 0));
  const values = series.map((point) => point.netPayoutFils);
  const max = Math.max(0, ...values);
  const min = Math.min(0, ...values);
  const span = max - min || 1;

  const x = (index: number) => (series.length === 1 ? W / 2 : (index / (series.length - 1)) * W);
  const y = (value: number) => PAD_Y + ((max - value) / span) * (H - 2 * PAD_Y);
  const line = series.map((point, index) => `${index === 0 ? "M" : "L"}${x(index).toFixed(1)},${y(point.netPayoutFils).toFixed(1)}`).join(" ");
  const zeroY = y(0);
  const area = series.length > 1 ? `${line} L${x(series.length - 1).toFixed(1)},${zeroY.toFixed(1)} L${x(0).toFixed(1)},${zeroY.toFixed(1)} Z` : "";

  const first = series[0];
  const last = series[series.length - 1];
  const activePoint = active === null ? null : series[active];
  const summary =
    first && last
      ? `Net payout for ${series.length} settlement batches from ${first.batchDate} to ${last.batchDate}; highest ${bhd(max)}${min < 0 ? `, lowest ${bhd(min)}` : ""}. Exact figures are in the payout table below.`
      : "No data.";

  const leftPercent = (index: number) => (x(index) / W) * 100;

  return (
    <figure className="dash-line">
      <div className="dash-line__frame">
        <div className="dash-line__plot" role="img" aria-label={summary} onMouseLeave={() => setActive(null)}>
          <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" className="dash-line__svg" aria-hidden="true" focusable="false">
            <defs>
              <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#16a0d0" stopOpacity="0.28" />
                <stop offset="100%" stopColor="#16a0d0" stopOpacity="0" />
              </linearGradient>
            </defs>
            {[0.25, 0.5, 0.75].map((f) => (
              <line key={f} x1={W * f} x2={W * f} y1={0} y2={H} className="dash-line__grid" />
            ))}
            <line x1={0} x2={W} y1={zeroY} y2={zeroY} className="dash-line__zero" />
            {area ? <path d={area} fill={`url(#${gradientId})`} /> : null}
            {series.length > 1 ? <path d={line} className="dash-line__glow" /> : null}
            {series.length > 1 ? <path d={line} className="dash-line__stroke" /> : null}
            {active !== null ? <line x1={x(active)} x2={x(active)} y1={0} y2={H} className="dash-line__cursor" /> : null}
          </svg>
          {series.map((point, index) => (
            <span
              key={point.settlementBatchId}
              className="dash-line__hit"
              style={hitBand(index, series.length)}
              onMouseEnter={() => setActive(index)}
            />
          ))}
          {series.map((point, index) =>
            series.length === 1 || active === index ? (
              <span
                key={`dot-${point.settlementBatchId}`}
                className="dash-line__dot"
                style={{ left: `${leftPercent(index)}%`, top: `${(y(point.netPayoutFils) / H) * 100}%` }}
                aria-hidden="true"
              />
            ) : null,
          )}
          {activePoint && active !== null ? (
            <div
              className="dash-line__tooltip"
              data-edge={leftPercent(active) < 30 ? "start" : leftPercent(active) > 70 ? "end" : undefined}
              style={{ left: `${leftPercent(active)}%` }}
              aria-hidden="true"
            >
              <div className="dash-chart__tooltip-date">Batch {activePoint.batchDate}</div>
              <div className="fp-between">
                <span className="fp-muted">Net payout</span>
                <Money fils={activePoint.netPayoutFils} />
              </div>
              <div className="fp-between">
                <span className="fp-muted">Gross</span>
                <Money fils={activePoint.grossFils} />
              </div>
              <div className="fp-between">
                <span className="fp-muted">Fee</span>
                <Money fils={activePoint.feeFils} />
              </div>
              <div className="fp-between">
                <span className="fp-muted">Status</span>
                <StatusBadge style={batchStatus(activePoint.status)} raw={activePoint.status} />
              </div>
            </div>
          ) : null}
        </div>
        <div className="dash-chart__axis" aria-hidden="true">
          <span>
            <Money fils={max} />
          </span>
          <span>{min < 0 ? <Money fils={min} /> : "0"}</span>
        </div>
      </div>
      {first && last ? (
        <div className="dash-chart__x" aria-hidden="true">
          <span>{first.batchDate}</span>
          <span>{last.batchDate}</span>
        </div>
      ) : null}
      <figcaption className="fp-sr-only">{summary}</figcaption>
    </figure>
  );
}
