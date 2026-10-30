import type { SVGProps } from "react";

/**
 * The one icon family used across FilsPay: 24×24 grid, 1.75 stroke, round
 * caps and joins, no fills. Drawn for this project (no icon dependency), so
 * every glyph shares the same weight and corner treatment.
 *
 * Icons are decorative by default (`aria-hidden`). Pass `label` when an icon
 * is the only content of a control and needs an accessible name.
 */
const PATHS = {
  overview: "M4 13h6V4H4zM14 20h6v-9h-6zM14 4h6v3h-6zM4 17h6v3H4z",
  transactions: "M7 4 3 8l4 4M3 8h14M17 20l4-4-4-4M21 16H7",
  link: "M10 14a4.5 4.5 0 0 0 6.4 0l3.2-3.2a4.5 4.5 0 0 0-6.4-6.4l-1.1 1.1M14 10a4.5 4.5 0 0 0-6.4 0l-3.2 3.2a4.5 4.5 0 0 0 6.4 6.4l1.1-1.1",
  settlement: "M3 10h18M5 10v8M9.7 10v8M14.3 10v8M19 10v8M3 21h18M12 3l9 4.5H3z",
  reconcile: "M12 4v16M5 20h14M5 8h14M5 8l-2.5 6a2.5 2.5 0 0 0 5 0zM19 8l-2.5 6a2.5 2.5 0 0 0 5 0z",
  webhook: "M9.5 7.5a3.5 3.5 0 1 1 5.6 2.8L18 15M7 13.5a3.5 3.5 0 1 0 4.4 5.2H17M17 18.7a3.5 3.5 0 1 0-1.4-6.7L12.5 7",
  store: "M4 9.5V20h16V9.5M3 4h18l-1 5.5a2.8 2.8 0 0 1-5.3.8 2.8 2.8 0 0 1-5.4 0 2.8 2.8 0 0 1-5.3-.8zM10 20v-5h4v5",
  coins: "M8.5 14a5.5 5.5 0 1 0 0-11 5.5 5.5 0 0 0 0 11zM15.4 9.1a5.5 5.5 0 1 1-6.3 6.3M7.5 6.5h1.5v4",
  play: "M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18zM10 8.5v7l5.5-3.5z",
  upload: "M12 15V4M7.5 8.5 12 4l4.5 4.5M4 15v3.5A1.5 1.5 0 0 0 5.5 20h13a1.5 1.5 0 0 0 1.5-1.5V15",
  replay: "M3.5 12a8.5 8.5 0 1 0 2.6-6.1M3.5 4v4.5H8",
  menu: "M4 6h16M4 12h16M4 18h16",
  close: "M6 6l12 12M18 6 6 18",
  chevronRight: "m9 6 6 6-6 6",
  chevronLeft: "m15 6-6 6 6 6",
  chevronDown: "m6 9 6 6 6-6",
  arrowLeft: "M19 12H5M11 6l-6 6 6 6",
  search: "M11 18a7 7 0 1 0 0-14 7 7 0 0 0 0 14zM20 20l-4-4",
  copy: "M9 9h10.5v10.5H9zM15 5H5v10",
  check: "m5 12.5 4.5 4.5L19 7",
  external: "M14 4h6v6M20 4l-9 9M18 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5",
  share: "M12 3v12M7.5 7.5 12 3l4.5 4.5M5 12v7.5h14V12",
  logout: "M15 4h4v16h-4M10 8l-4 4 4 4M6 12h11",
  shield: "M12 3 4.5 6v5.5c0 4.6 3.2 8.4 7.5 9.5 4.3-1.1 7.5-4.9 7.5-9.5V6zM9 12l2 2 4-4",
  alert: "M12 4 2.5 20h19zM12 10v4.5M12 17.5v.01",
  alertCircle: "M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18zM12 7.5V13M12 16.5v.01",
  info: "M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18zM12 11v5.5M12 7.5v.01",
  checkCircle: "M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18zM8 12.5l2.7 2.7L16 10",
  xCircle: "M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18zM9 9l6 6M15 9l-6 6",
  clock: "M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18zM12 7v5l3.5 2",
  calendar: "M4 6h16v14H4zM4 10h16M8 3v4M16 3v4",
  key: "M8 15a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM11.5 11H21M18 11v3M15 11v2",
  lock: "M5 11h14v10H5zM8 11V7.5a4 4 0 0 1 8 0V11M12 15v2",
  card: "M3 6h18v12H3zM3 10h18M7 15h3",
  plus: "M12 5v14M5 12h14",
  trash: "M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13M10 11v6M14 11v6",
  power: "M12 3v8M6.4 6.6a8 8 0 1 0 11.2 0",
  inbox: "M3 13h5l1.5 3h5L16 13h5M5.5 5h13L21 13v6H3v-6z",
  filter: "M4 5h16l-6 7.5V19l-4 1.5v-8z",
  file: "M6 3h8l4 4v14H6zM14 3v4h4M9 12h6M9 16h6",
  user: "M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM4.5 20.5a7.5 7.5 0 0 1 15 0",
  eye: "M2.5 12S6 5 12 5s9.5 7 9.5 7-3.5 7-9.5 7-9.5-7-9.5-7zM12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6z",
  loader: "M12 3a9 9 0 1 0 9 9",
  receipt: "M6 3h12v18l-3-2-3 2-3-2-3 2zM9 8h6M9 12h6M9 16h3",
  activity: "M3 12h4l3-8 4 16 3-8h4",
} as const;

export type IconName = keyof typeof PATHS;

export interface IconProps extends Omit<SVGProps<SVGSVGElement>, "name"> {
  name: IconName;
  size?: number;
  /** Accessible name; omit for decorative icons. */
  label?: string;
}

export function Icon({ name, size = 18, label, className, ...rest }: IconProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.75}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      role={label ? "img" : undefined}
      aria-label={label}
      aria-hidden={label ? undefined : true}
      focusable="false"
      {...rest}
    >
      <path d={PATHS[name]} />
    </svg>
  );
}
