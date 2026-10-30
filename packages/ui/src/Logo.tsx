/**
 * FilsPay wordmark with its mark: a rounded yellow tile holding a dark "f"
 * whose crossbar extends into a coin edge. Original artwork for this
 * project — no third-party logo geometry.
 */
export function LogoMark({ size = 28 }: { size?: number }) {
  return (
    <svg
      className="fp-logo__mark"
      width={size}
      height={size}
      viewBox="0 0 32 32"
      aria-hidden="true"
      focusable="false"
    >
      <rect width="32" height="32" rx="8" fill="#F0B90B" />
      <path
        d="M19.5 7.5h-3.2a3.8 3.8 0 0 0-3.8 3.8V25M9.5 14.5h10"
        fill="none"
        stroke="#0B0E11"
        strokeWidth="3.2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <circle cx="22.5" cy="21.5" r="3" fill="#0B0E11" />
    </svg>
  );
}

export function Logo({ size = 28 }: { size?: number }) {
  return (
    <span className="fp-logo">
      <LogoMark size={size} />
      <span>
        Fils<span className="fp-logo__word-accent">Pay</span>
      </span>
    </span>
  );
}
