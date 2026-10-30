import { Navigate, useLocation } from "react-router-dom";
import type { ReactNode } from "react";
import { Backdrop, Loading } from "@filspay/ui";
import { useAdminAuth } from "../auth/AdminAuthContext.js";

/**
 * Route guard: renders its children only once `GET /v1/admin/auth/me` has
 * confirmed a live admin session, and sends the operator to `/login`
 * otherwise (remembering where they were headed).
 *
 * This is navigation, not authorization — the console's data is not behind
 * this component, it is behind the API's own `requireAdminSession`
 * preHandler, which answers `401` to an unauthenticated request no matter
 * what this app renders.
 */
/** Redirects to /login while status is anonymous. */
export function RequireAdminAuth({ children }: { children: ReactNode }) {
  const { status } = useAdminAuth();
  const location = useLocation();

  if (status === "loading") {
    return (
      <main className="fp-standalone">
        <Backdrop quiet />
        <Loading page>Checking your session…</Loading>
      </main>
    );
  }

  if (status === "anonymous") {
    return <Navigate to="/login" replace state={{ from: location.pathname + location.search }} />;
  }

  return <>{children}</>;
}
