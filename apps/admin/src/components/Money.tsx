import { cx, splitAmount } from "@filspay/ui";
import { bhd } from "../lib/format.js";

/** Integer fils via the shared formatter, unit styled smaller, tabular digits. */
export function Money({ fils, hero = false, className }: { fils: number; hero?: boolean; className?: string }) {
  const { amount, unit } = splitAmount(bhd(fils));
  return (
    <span className={cx("fp-money", hero && "fp-money--hero", className)}>
      {amount}
      {unit ? (
        <>
          {" "}
          <span className="fp-money__unit">{unit}</span>
        </>
      ) : null}
    </span>
  );
}
