import { useEffect } from "react";
import type { ReactNode } from "react";

/** Sets `document.title` as "<page> · <suffix>" for the life of the page. */
export function useDocumentTitle(title: string | null | undefined, suffix = "FilsPay"): void {
  useEffect(() => {
    if (!title) return;
    const previous = document.title;
    document.title = `${title} · ${suffix}`;
    return () => {
      document.title = previous;
    };
  }, [title, suffix]);
}

/**
 * The top of every screen: optional back link, the page's single `<h1>`, a
 * short description, and the page-level actions.
 */
export function PageHeader({
  title,
  documentTitle,
  titleSuffix,
  description,
  back,
  badges,
  actions,
}: {
  title: ReactNode;
  /** Plain-text title for the browser tab when `title` is not a string. */
  documentTitle?: string;
  titleSuffix?: string;
  description?: ReactNode;
  back?: ReactNode;
  badges?: ReactNode;
  actions?: ReactNode;
}) {
  useDocumentTitle(documentTitle ?? (typeof title === "string" ? title : null), titleSuffix);
  return (
    <div className="fp-page-header">
      <div className="fp-page-header__text">
        {back ? <div className="fp-page-header__eyebrow">{back}</div> : null}
        <h1 className="fp-page-header__title">
          {title}
          {badges}
        </h1>
        {description ? <div className="fp-page-header__description">{description}</div> : null}
      </div>
      {actions ? <div className="fp-page-header__actions">{actions}</div> : null}
    </div>
  );
}
