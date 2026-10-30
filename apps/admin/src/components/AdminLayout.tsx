import { useState } from "react";
import { Link, NavLink, Outlet, useLocation, useNavigate } from "react-router-dom";
import {
  AccountMenu,
  AccountRow,
  AccountSection,
  Alert,
  AppShell,
  Badge,
  Card,
  EmptyState,
  Icon,
  Logo,
  NavGroup,
  NavSection,
  humanize,
} from "@filspay/ui";
import type { IconName } from "@filspay/ui";
import { useAdminAuth } from "../auth/AdminAuthContext.js";
import { describeError, WEB_BASE_URL } from "../api/client.js";
import { ImpersonationBanner } from "./ImpersonationBanner.js";

function NavItem({ to, icon, children }: { to: string; icon: IconName; children: string }) {
  return (
    <li>
      <NavLink to={to} className="fp-nav__link">
        <Icon name={icon} size={18} />
        {children}
      </NavLink>
    </li>
  );
}

/** Nav shell for every admin-plane screen: who you are signed in as, the
 *  section links, a logout, and — above all of it — the impersonation
 *  banner when a grant is live. */
// YA: nav order per Huda's request (Credits first)
export function AdminLayout() {
  const { admin, signOut, impersonation } = useAdminAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [error, setError] = useState<string | null>(null);
  const [signingOut, setSigningOut] = useState(false);

  async function handleSignOut(): Promise<void> {
    setError(null);
    setSigningOut(true);
    try {
      await signOut();
      navigate("/login", { replace: true });
    } catch (err) {
      setError(describeError(err));
    } finally {
      setSigningOut(false);
    }
  }

  const nav = (
    <NavGroup label="Admin console">
      <NavSection title="Merchants">
        <NavItem to="/merchants" icon="store">
          Merchants
        </NavItem>
      </NavSection>
      <NavSection title="Money operations">
        <NavItem to="/credits" icon="coins">
          Credits
        </NavItem>
        <NavItem to="/settlement" icon="settlement">
          Settlement ops
        </NavItem>
        <NavItem to="/adjustment-imports" icon="upload">
          Import adjustments
        </NavItem>
      </NavSection>
      <NavSection title="Integrations">
        <NavItem to="/webhooks" icon="replay">
          Webhook replay
        </NavItem>
      </NavSection>
    </NavGroup>
  );

  const account = admin ? (
    <AccountMenu name={admin.email} meta={humanize(admin.role)} variant="admin">
      <AccountSection>
        <AccountRow label="Signed in as">{admin.email}</AccountRow>
        <AccountRow label="Admin role">
          <Badge tone="warning" icon="shield">
            {humanize(admin.role)}
          </Badge>
        </AccountRow>
      </AccountSection>
      <AccountSection>
        <button
          type="button"
          className="fp-account__action"
          onClick={() => void handleSignOut()}
          disabled={signingOut}
        >
          <Icon name="logout" size={18} />
          {signingOut ? "Signing out…" : "Log out"}
        </button>
      </AccountSection>
    </AccountMenu>
  ) : null;

  return (
    <AppShell
      banner={impersonation ? <ImpersonationBanner /> : undefined}
      brand={
        <Link to="/merchants" className="fp-brand-link" aria-label="FilsPay admin home">
          <Logo />
        </Link>
      }
      context={
        <span className="fp-context fp-context--admin">
          <Icon name="shield" size={14} />
          Admin console
        </span>
      }
      nav={nav}
      sidebarFooter={
        <>
          Internal operations console. Times are shown in your browser&apos;s time zone; settlement
          business dates are Asia/Bahrain.
        </>
      }
      account={account}
      locationKey={location.pathname}
    >
      {error ? (
        <Alert tone="danger" title="Couldn't sign out" onDismiss={() => setError(null)} className="admin-shell-alert">
          {error}
        </Alert>
      ) : null}

      {impersonation ? (
        // An explicit "exit view-as-merchant" action is required before
        // admin-plane screens are shown again. This is a UX safeguard so the
        // two modes are never confused on screen; the privilege boundary
        // itself does not depend on it — /v1/admin/* never reads the
        // impersonation cookie, and the merchant side never reads the admin
        // session cookie.
        <Card>
          <EmptyState icon="eye" title="Admin screens are paused">
            <p>
              An impersonation grant is active. Use <strong>Exit impersonation</strong> above to end
              it and return to the admin console.
            </p>
            <p>
              Merchant screens are at <code>{WEB_BASE_URL}</code> while the grant lasts.
            </p>
          </EmptyState>
        </Card>
      ) : (
        <Outlet />
      )}
    </AppShell>
  );
}
