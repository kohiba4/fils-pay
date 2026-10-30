import { useRef } from "react";
import type { KeyboardEvent, ReactNode } from "react";

export interface TabItem<T extends string> {
  value: T;
  label: ReactNode;
  count?: number;
}

export function tabId(base: string, value: string): string {
  return `${base}-tab-${value}`;
}

export function panelId(base: string, value: string): string {
  return `${base}-panel-${value}`;
}

/**
 * WAI-ARIA tabs (automatic activation): Left/Right/Home/End move between
 * tabs, only the selected tab is in the Tab order. Pair with `<TabPanel>`.
 */
export function Tabs<T extends string>({
  idBase,
  label,
  items,
  value,
  onChange,
}: {
  idBase: string;
  label: string;
  items: Array<TabItem<T>>;
  value: T;
  onChange: (value: T) => void;
}) {
  const refs = useRef<Array<HTMLButtonElement | null>>([]);

  function onKeyDown(event: KeyboardEvent<HTMLButtonElement>, index: number): void {
    let next: number | null = null;
    if (event.key === "ArrowRight") next = (index + 1) % items.length;
    else if (event.key === "ArrowLeft") next = (index - 1 + items.length) % items.length;
    else if (event.key === "Home") next = 0;
    else if (event.key === "End") next = items.length - 1;
    if (next === null) return;
    event.preventDefault();
    const item = items[next];
    if (!item) return;
    onChange(item.value);
    refs.current[next]?.focus();
  }

  return (
    <div className="fp-tabs" role="tablist" aria-label={label}>
      {items.map((item, index) => {
        const selected = item.value === value;
        return (
          <button
            key={item.value}
            ref={(el) => {
              refs.current[index] = el;
            }}
            type="button"
            role="tab"
            className="fp-tab"
            id={tabId(idBase, item.value)}
            aria-selected={selected}
            aria-controls={panelId(idBase, item.value)}
            tabIndex={selected ? 0 : -1}
            onClick={() => onChange(item.value)}
            onKeyDown={(event) => onKeyDown(event, index)}
          >
            {item.label}
            {item.count !== undefined ? <span className="fp-tab__count">{item.count}</span> : null}
          </button>
        );
      })}
    </div>
  );
}

export function TabPanel({
  idBase,
  value,
  children,
}: {
  idBase: string;
  value: string;
  children: ReactNode;
}) {
  return (
    <div
      className="fp-tabpanel"
      role="tabpanel"
      id={panelId(idBase, value)}
      aria-labelledby={tabId(idBase, value)}
      tabIndex={0}
    >
      {children}
    </div>
  );
}
