import { cx, splitAmount } from "@filspay/ui";
import { bhd } from "../format.js";

/**
 * An integer-fils amount, formatted by the one shared formatter (`bhd`, i.e.
 * `@filspay/money`'s `formatBhd` — three decimals, never rounded) and only
 * then split so the currency unit can be styled smaller. Tabular numerals
 * keep columns aligned.
 */
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
