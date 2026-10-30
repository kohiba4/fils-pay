import { useEffect, useId, useLayoutEffect, useRef, useState } from "react";
import type { CSSProperties, ReactNode } from "react";
import { Backdrop } from "./Backdrop.js";
import { Button } from "./Button.js";
import { Drawer } from "./Dialog.js";
import { Icon } from "./Icon.js";
import { cx, initial } from "./text.js";

const ROUTE_ENTER: Keyframe[] = [
  { opacity: 0, transform: "translateY(6px)" },
  { opacity: 1, transform: "none" },
];

/**
 * The authenticated layout shared by the merchant dashboard and the admin
 * console: decorative backdrop, optional banner (impersonation), a
 * full-height sidebar (brand + grouped navigation) on ≥1024px that becomes a
 * drawer behind a menu button below that, a slim top bar with context and
 * account, and the main content region.
 *
 * Navigation itself is passed in (`nav`) so each app keeps its own router
 * links and role gates; the shell only arranges it. The drawer closes when
 * `locationKey` changes, so following a link never leaves it open, and
 * opening it never changes the current route.
 *
 * Route changes fade the content in (opacity + 6px rise, 200ms) with the Web
 * Animations API on the existing element: nothing remounts, so no request is
 * repeated and no form state resets. Only `locationKey` (the pathname)
 * triggers it — filter and `?tab=` changes do not — and it is skipped under
 * prefers-reduced-motion.
 */
export function AppShell({
  brand,
  context,
  nav,
  sidebarFooter,
  account,
  banner,
  locationKey,
  children,
}: {
  brand: ReactNode;
  context?: ReactNode;
  nav: ReactNode;
  sidebarFooter?: ReactNode;
  account?: ReactNode;
  banner?: ReactNode;
  locationKey: string;
  children: ReactNode;
}) {
  const [drawerOpen, setDrawerOpen] = useState(false);
  const bannerRef = useRef<HTMLDivElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  const [bannerHeight, setBannerHeight] = useState(0);

  useEffect(() => {
    setDrawerOpen(false);
  }, [locationKey]);

  useLayoutEffect(() => {
    const el = contentRef.current;
    if (!el || typeof el.animate !== "function") return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const animation = el.animate(ROUTE_ENTER, { duration: 200, easing: "cubic-bezier(0.2, 0, 0, 1)" });
    return () => animation.cancel();
  }, [locationKey]);

  // The sticky header and sidebar sit below the sticky banner, so they need
  // its live height (it wraps to two lines on narrow screens).
  useLayoutEffect(() => {
    const el = bannerRef.current;
    if (!el) {
      setBannerHeight(0);
      return;
    }
    const update = () => setBannerHeight(el.getBoundingClientRect().height);
    update();
    const observer = new ResizeObserver(update);
    observer.observe(el);
    return () => observer.disconnect();
  }, [banner]);

  return (
    <div className="fp-shell" style={{ "--fp-banner-h": `${bannerHeight}px` } as CSSProperties}>
      <Backdrop />
      <a className="fp-skip-link" href="#fp-main">
        Skip to content
      </a>
      {banner ? (
        <div className="fp-shell__banner" ref={bannerRef}>
          {banner}
        </div>
      ) : null}
      <div className="fp-frame">
        <aside className="fp-sidebar" aria-label="Sidebar">
          <div className="fp-sidebar__brand">{brand}</div>
          {nav}
          {sidebarFooter ? <div className="fp-sidebar__footer">{sidebarFooter}</div> : null}
        </aside>
        <div className="fp-workspace">
          <header className="fp-topbar">
            <Button
              variant="ghost"
              iconOnly
              icon="menu"
              className="fp-topbar__menu"
              aria-expanded={drawerOpen}
              onClick={() => setDrawerOpen(true)}
            >
              Open navigation
            </Button>
            <div className="fp-topbar__brand">{brand}</div>
            <div className="fp-topbar__context">{context}</div>
            <div className="fp-topbar__end">{account}</div>
          </header>
          <main className="fp-main" id="fp-main" tabIndex={-1}>
            <div className="fp-main__inner" ref={contentRef}>
              {children}
            </div>
          </main>
        </div>
      </div>
      <Drawer open={drawerOpen} onClose={() => setDrawerOpen(false)} title="Menu" side="start">
        <div className="fp-drawer-nav">
          {nav}
          {sidebarFooter ? <div className="fp-sidebar__footer">{sidebarFooter}</div> : null}
        </div>
      </Drawer>
    </div>
  );
}

/** A labelled group of sidebar links. Children are `<li>` items. */
export function NavSection({ title, children }: { title: string; children: ReactNode }) {
  const id = useId();
  return (
    <div className="fp-nav__section">
      <div className="fp-nav__heading" id={id}>
        {title}
      </div>
      <ul className="fp-nav__list" aria-labelledby={id}>
        {children}
      </ul>
    </div>
  );
}

export function NavGroup({ label, children }: { label: string; children: ReactNode }) {
  return (
    <nav className="fp-nav" aria-label={label}>
      {children}
    </nav>
  );
}

/**
 * Account disclosure in the header: who is signed in and where, plus the
 * sign-out action. A disclosure (button + panel), not an ARIA menu, because
 * its content is mostly information. Escape and outside clicks close it and
 * focus returns to the trigger.
 */
export function AccountMenu({
  name,
  meta,
  avatarLabel,
  variant = "merchant",
  children,
}: {
  name: string;
  meta?: string;
  avatarLabel?: string;
  variant?: "merchant" | "admin";
  children: ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const panelId = useId();

  useEffect(() => {
    if (!open) return;
    function onPointerDown(event: PointerEvent): void {
      if (rootRef.current && !rootRef.current.contains(event.target as Node)) setOpen(false);
    }
    function onKeyDown(event: KeyboardEvent): void {
      if (event.key === "Escape") {
        setOpen(false);
        triggerRef.current?.focus();
      }
    }
    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  return (
    <div className="fp-account" ref={rootRef}>
      <button
        ref={triggerRef}
        type="button"
        className="fp-account__trigger"
        aria-expanded={open}
        aria-controls={panelId}
        onClick={() => setOpen((value) => !value)}
      >
        <span className={cx("fp-avatar", variant === "admin" && "fp-avatar--admin")} aria-hidden="true">
          {initial(avatarLabel ?? name)}
        </span>
        <span className="fp-account__text">
          <span className="fp-account__name">{name}</span>
          {meta ? <span className="fp-account__meta">{meta}</span> : null}
        </span>
        <span className="fp-sr-only">Account details</span>
        <Icon name="chevronDown" size={16} className="fp-account__chevron" />
      </button>
      {open ? (
        <div className="fp-account__panel" id={panelId}>
          {children}
        </div>
      ) : null}
    </div>
  );
}

export function AccountSection({ children }: { children: ReactNode }) {
  return <div className="fp-account__section">{children}</div>;
}

export function AccountRow({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="fp-account__row">
      <span>{label}</span>
      <span>{children}</span>
    </div>
  );
}
