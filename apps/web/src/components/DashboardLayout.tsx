import { useState } from "react";
import { Link, NavLink, Outlet, useLocation, useNavigate } from "react-router-dom";
import {
  AccountMenu,
  AccountRow,
  AccountSection,
  Alert,
  AppShell,
  Badge,
  Icon,
  IdText,
  Logo,
  NavGroup,
  NavSection,
  humanize,
} from "@filspay/ui";
import type { IconName } from "@filspay/ui";
import { useDashboardAuth } from "../auth/DashboardAuthContext.js";
import { RequireRole } from "../auth/RequireRole.js";
import { describeError } from "../api/client.js";

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

/** Nav shell for every merchant dashboard screen. No impersonation banner
 *  here — nothing in the merchant plane impersonates anyone; when an admin
 *  "views as merchant", they arrive with a `support`-role session and see
 *  exactly what a support user sees. */
export function DashboardLayout() {
  const { me, signOut } = useDashboardAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [error, setError] = useState<string | null>(null);
  const [signingOut, setSigningOut] = useState(false);

  // sign out clears the cookie server side, local merchantId stays — am
  async function handleSignOut(): Promise<void> {
    setError(null);
    setSigningOut(true);
    try {
      await signOut();
      navigate("/dashboard/login", { replace: true });
    } catch (err) {
      setError(describeError(err));
    } finally {
      setSigningOut(false);
    }
  }

  const nav = (
    <NavGroup label="Dashboard">
      <NavSection title="Payments">
        <NavItem to="/dashboard/overview" icon="overview">
          Overview
        </NavItem>
        <NavItem to="/dashboard/transactions" icon="transactions">
          Transactions
        </NavItem>
        <NavItem to="/dashboard/payment-links" icon="link">
          Payment links
        </NavItem>
      </NavSection>
      <NavSection title="Finance">
        <NavItem to="/dashboard/settlement" icon="settlement">
          Settlement
        </NavItem>
        {/* Reconciliation and every webhook route are owner/finance-only
            server-side, so their links are hidden from support rather than
            offered and then refused. UI convenience only — see RequireRole. */}
        <RequireRole allow={["owner", "finance"]}>
          <NavItem to="/dashboard/reconciliation" icon="reconcile">
            Reconciliation
          </NavItem>
        </RequireRole>
      </NavSection>
      <RequireRole allow={["owner", "finance"]}>
        <NavSection title="Developers">
          <NavItem to="/dashboard/webhooks" icon="webhook">
            Webhooks
          </NavItem>
        </NavSection>
      </RequireRole>
    </NavGroup>
  );

  const account = me ? (
    <AccountMenu name={me.merchant.displayName} meta={`${humanize(me.role)} · ${me.email}`}>
      <AccountSection>
        <AccountRow label="Signed in as">{me.email}</AccountRow>
        <AccountRow label="Role">
          <Badge tone="neutral" icon="user">
            {humanize(me.role)}
          </Badge>
        </AccountRow>
        <AccountRow label="Onboarding">{humanize(me.merchant.onboardingStatus)}</AccountRow>
      </AccountSection>
      <AccountSection>
        <span className="fp-muted fp-xs">Merchant ID</span>
        <IdText value={me.merchant.id} copy copyLabel="Copy merchant ID" />
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
      brand={
        <Link to="/dashboard" className="fp-brand-link" aria-label="FilsPay dashboard home">
          <Logo />
        </Link>
      }
      context={<span className="fp-context">Merchant dashboard</span>}
      nav={nav}
      sidebarFooter={
        <>
          Times are shown in your browser&apos;s time zone. Settlement batch dates are Asia/Bahrain
          business days.
        </>
      }
      account={account}
      locationKey={location.pathname}
    >
      {error ? (
        <Alert tone="danger" title="Couldn't sign out" onDismiss={() => setError(null)} className="dash-shell-alert">
          {error}
        </Alert>
      ) : null}
      <Outlet />
    </AppShell>
  );
}
