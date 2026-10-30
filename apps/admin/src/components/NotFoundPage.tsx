import { Link } from "react-router-dom";
import { Card, EmptyState, PageHeader, buttonClass } from "@filspay/ui";

/** Catch-all inside the console shell — replaces React Router's developer
 *  error screen for unknown admin URLs. */
export function NotFoundPage() {
  return (
    <>
      <PageHeader title="Page not found" titleSuffix="FilsPay Admin" />
      <Card>
        <EmptyState
          icon="search"
          title="Nothing lives at this address"
          action={
            <Link className={buttonClass({ variant: "secondary" })} to="/merchants">
              Go to merchants
            </Link>
          }
        />
      </Card>
    </>
  );
}
