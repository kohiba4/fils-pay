import { Fragment } from "react";
import type { ReactNode } from "react";

export interface DetailItem {
  term: ReactNode;
  detail: ReactNode;
  key?: string;
}

/** Label/value pairs as a `<dl>`; two columns on wide screens, stacked on phones. */
export function DetailList({ items }: { items: Array<DetailItem | null | false> }) {
  const shown = items.filter((item): item is DetailItem => Boolean(item));
  return (
    <dl className="fp-dl">
      {shown.map((item, index) => (
        <Fragment key={item.key ?? index}>
          <dt>{item.term}</dt>
          <dd>{item.detail}</dd>
        </Fragment>
      ))}
    </dl>
  );
}
