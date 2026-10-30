import { useId } from "react";

export interface SegmentOption<T extends string> {
  value: T;
  label: string;
  /** Longer accessible label when `label` is an abbreviation ("7D"). */
  ariaLabel?: string;
}

/**
 * Pill-shaped single choice (time ranges). Native radio inputs, visually
 * hidden: arrow keys move the selection, Tab enters/leaves the group, and
 * screen readers announce it as a radio group under `legend`.
 */
export function SegmentedControl<T extends string>({
  legend,
  options,
  value,
  onChange,
  hideLegend = true,
}: {
  legend: string;
  options: ReadonlyArray<SegmentOption<T>>;
  value: T;
  onChange: (value: T) => void;
  hideLegend?: boolean;
}) {
  const name = useId();
  return (
    <fieldset className="fp-segmented">
      <legend className={hideLegend ? "fp-sr-only" : "fp-chips__legend"}>{legend}</legend>
      {options.map((option) => (
        <label key={option.value} className="fp-segmented__option">
          <input
            type="radio"
            name={name}
            value={option.value}
            checked={option.value === value}
            onChange={() => onChange(option.value)}
            aria-label={option.ariaLabel}
          />
          <span className="fp-segmented__face">{option.label}</span>
        </label>
      ))}
    </fieldset>
  );
}
