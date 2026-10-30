import { Badge } from "@filspay/ui";
import type { StatusStyle } from "../status.js";

/** Renders a `StatusStyle` from status.ts; `raw` is kept as the tooltip so
 *  the exact backend value is one hover away. */
export function StatusBadge({ style, raw }: { style: StatusStyle; raw?: string }) {
  return (
    <Badge tone={style.tone} icon={style.icon} title={raw}>
      {style.label}
    </Badge>
  );
}
