import { Link } from "react-router-dom";
import { Backdrop, EmptyState, Logo, buttonClass, useDocumentTitle } from "@filspay/ui";

/** Catch-all for URLs no route matches — replaces React Router's default
 *  developer error screen. Makes no API calls. */
export function NotFoundPage() {
  useDocumentTitle("Page not found");
  return (
    <div className="fp-standalone">
      <Backdrop quiet />
      <div className="fp-standalone__bar">
        <Logo />
      </div>
      <main className="fp-standalone__body">
        <div className="fp-panel">
          <EmptyState
            icon="search"
            title="Page not found"
            action={
              <Link className={buttonClass({ variant: "primary" })} to="/dashboard">
                Go to the dashboard
              </Link>
            }
          >
            Nothing lives at this address. If you followed a payment link, check that it was copied in
            full.
          </EmptyState>
        </div>
      </main>
    </div>
  );
}
