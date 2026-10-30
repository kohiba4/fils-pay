import { Icon } from "./Icon.js";

/**
 * A multi-select filter rendered as chips. Each chip is a real checkbox
 * (visually hidden, keyboard-operable with Space), so the group keeps the
 * same semantics as the plain checkbox fieldsets it replaces. A selected chip
 * shows a check mark as well as a fill.
 */
export function ChipGroup<T extends string>({
  legend,
  options,
  selected,
  onToggle,
  labelFor,
}: {
  legend: string;
  options: readonly T[];
  selected: readonly T[];
  onToggle: (value: T) => void;
  labelFor?: (value: T) => string;
}) {
  return (
    <fieldset className="fp-chips">
      <legend className="fp-chips__legend">{legend}</legend>
      {options.map((value) => (
        <label key={value} className="fp-chip">
          <input type="checkbox" checked={selected.includes(value)} onChange={() => onToggle(value)} />
          <span className="fp-chip__face">
            <Icon name="check" size={14} className="fp-chip__check" />
            {labelFor ? labelFor(value) : value}
          </span>
        </label>
      ))}
    </fieldset>
  );
}
