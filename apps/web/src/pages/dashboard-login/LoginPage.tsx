import { useEffect, useState } from "react";
import { Navigate, useLocation, useNavigate } from "react-router-dom";
import { Alert, Backdrop, Button, CopyButton, Field, Logo, useDocumentTitle } from "@filspay/ui";
import { login, resendOtp, verifyOtp } from "../../api/dashboardAuth.js";
import { ApiError, describeError } from "../../api/client.js";
import { authErrorMessage } from "../../auth/authMessages.js";
import {
  readLastMerchantId,
  useDashboardAuth,
  writeLastMerchantId,
} from "../../auth/DashboardAuthContext.js";
import type { DashboardLoginResponse } from "../../types.js";

type Step = { kind: "credentials" } | { kind: "otp"; challenge: DashboardLoginResponse };

/** Re-renders every few seconds while a code is outstanding so the screen can
 *  say when it has lapsed. Display only — the server decides validity. */
function useNow(active: boolean, intervalMs = 5000): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!active) return;
    setNow(Date.now());
    const timer = window.setInterval(() => setNow(Date.now()), intervalMs);
    return () => window.clearInterval(timer);
  }, [active, intervalMs]);
  return now;
}

/**
 * Two-step merchant login: merchantId + email + password
 * creates a *pending* session and issues an OTP challenge; the OTP step is
 * what actually authenticates it. Neither step is told which credential was
 * wrong — the API answers a single generic `invalid_credentials`, and this
 * screen repeats it verbatim rather than guessing at something more specific.
 *
 * The Merchant ID field is a raw pasted UUID. This is a genuine rough edge,
 * not a preference: `merchant_users.email` is unique per merchant rather than
 * globally (Phase 1 schema), so an email alone cannot identify a user, and no
 * merchant slug or subdomain concept exists anywhere in the platform to infer
 * the id from. `localStorage` remembering the last-used value is the whole
 * mitigation available without new backend work; a lookup-by-email endpoint
 * or a per-merchant subdomain would be the real fix, and both are out of
 * scope for a frontend-only phase.
 */
/** The API's error code as a readable sentence; anything else as before. */
function friendly(err: unknown): string {
  return authErrorMessage(err instanceof ApiError ? err.code : undefined, describeError(err));
}

function TotpEnrollment({ secret, otpauthUri, email }: { secret: string; otpauthUri: string; email: string }) {
  return (
    <div className="auth-enroll" data-testid="totp-enrollment">
      <p className="auth-enroll__title">
        Set up your authenticator app for <strong className="auth-strong">{email}</strong>
      </p>
      <ol className="auth-enroll__steps">
        <li>
          In Google Authenticator, Microsoft Authenticator, Authy or 1Password choose <em>Add account</em> →{" "}
          <em>Enter a setup key</em>.
        </li>
        <li>
          Enter this key (time-based, 6 digits):
          <div className="fp-secret auth-enroll__secret">
            <code data-testid="totp-secret">{secret}</code>
            <CopyButton value={secret} label="Copy key" copiedMessage="Setup key copied" />
          </div>
        </li>
        <li>
          On a phone you can also <a href={otpauthUri}>open the setup link</a>.
        </li>
      </ol>
      <p className="fp-muted fp-xs">This key is shown once. Then enter the 6-digit code the app shows.</p>
    </div>
  );
}

export function LoginPage() {
  const { status, refresh } = useDashboardAuth();
  const navigate = useNavigate();
  const location = useLocation();

  const [step, setStep] = useState<Step>({ kind: "credentials" });
  // MK: remembers the last merchantId in localStorage. not a secret
  const [merchantId, setMerchantId] = useState(() => readLastMerchantId());
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [code, setCode] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const now = useNow(step.kind === "otp" && step.challenge.otpExpiresAt !== undefined);

  useDocumentTitle(step.kind === "otp" ? "Verify sign-in" : "Sign in");

  const redirectTo = (location.state as { from?: string } | null)?.from ?? "/dashboard/transactions";

  if (status === "authenticated") {
    return <Navigate to={redirectTo} replace />;
  }

  function backToCredentials(message: string | null): void {
    setStep({ kind: "credentials" });
    setCode("");
    setError(message);
  }

  async function handleCredentials(event: React.FormEvent): Promise<void> {
    event.preventDefault();
    setSubmitting(true);
    setError(null);
    setNotice(null);
    try {
      const challenge = await login({ merchantId: merchantId.trim(), email, password });
      setStep({ kind: "otp", challenge });
      setPassword("");
    } catch (err) {
      setError(friendly(err));
    } finally {
      setSubmitting(false);
    }
  }

  // after otp we get logged out after ~10 min. cookie ttl never extended? — am
  // MK: that's the idle timeout, by design
  async function handleOtp(event: React.FormEvent): Promise<void> {
    event.preventDefault();
    setSubmitting(true);
    setError(null);
    setNotice(null);
    try {
      await verifyOtp({ code });
      writeLastMerchantId(merchantId.trim());
      // The session cookie is now authenticated server-side; re-read `me` so
      // the rest of the dashboard renders from the server's answer, not from
      // the verify response we happen to be holding.
      await refresh();
      navigate(redirectTo, { replace: true });
    } catch (err) {
      // `429 too_many_attempts` revokes the pending session server-side, so
      // retrying the OTP step against it can only ever fail again — start
      // over instead of leaving the user tapping a dead form.
      if (err instanceof ApiError && err.statusCode === 429 && err.code === "too_many_attempts") {
        backToCredentials(friendly(err));
      } else {
        setError(friendly(err));
      }
    } finally {
      setSubmitting(false);
    }
  }

  async function handleResend(): Promise<void> {
    setSubmitting(true);
    setError(null);
    setNotice(null);
    try {
      const challenge = await resendOtp();
      setStep({ kind: "otp", challenge });
      setCode("");
      setNotice("A new code has been sent.");
    } catch (err) {
      // Includes `429 resend_too_soon` — the server owns the cadence rule, so
      // whatever it says is shown as-is rather than pre-empted by a
      // client-side timer that could drift from it.
      setError(friendly(err));
    } finally {
      setSubmitting(false);
    }
  }

  const otpExpired =
    step.kind === "otp" &&
    step.challenge.otpExpiresAt !== undefined &&
    Date.parse(step.challenge.otpExpiresAt) <= now;

  return (
    <div className="fp-standalone">
      <Backdrop quiet />
      <header className="fp-standalone__bar">
        <Logo />
        <span className="fp-context">Merchant dashboard</span>
      </header>
      <main className="fp-standalone__body">
        <div className="fp-panel">
          <ol className="fp-steps" aria-label="Sign-in steps">
            <li className="fp-steps__item" data-state={step.kind === "credentials" ? "current" : "done"} aria-current={step.kind === "credentials" ? "step" : undefined}>
              1 · Account
            </li>
            <li className="fp-steps__item" data-state={step.kind === "otp" ? "current" : "todo"} aria-current={step.kind === "otp" ? "step" : undefined}>
              2 · Verification
            </li>
          </ol>

          {step.kind === "credentials" ? (
            <>
              <h1 className="auth-title">Sign in</h1>
              <p className="auth-lead">Use the account your business owner set up for you.</p>
            </>
          ) : (
            <>
              <h1 className="auth-title">
                {step.challenge.method === "totp" ? "Enter your authenticator code" : "Enter your one-time code"}
              </h1>
              {step.challenge.method === "totp" ? (
                step.challenge.totpEnrollment ? null : (
                  <p className="auth-lead">
                    Enter the 6-digit code from your authenticator app for{" "}
                    <strong className="auth-strong">{email}</strong>.
                  </p>
                )
              ) : (
                <p className="auth-lead">
                  A one-time code was issued for <strong className="auth-strong">{email}</strong>. It
                  expires at{" "}
                  {step.challenge.otpExpiresAt ? new Date(step.challenge.otpExpiresAt).toLocaleTimeString() : "soon"}.
                </p>
              )}
            </>
          )}

          <div className="fp-stack fp-stack--sm auth-messages">
            {error ? (
              <Alert tone="danger" title={step.kind === "otp" ? "Code not accepted" : "Couldn't sign you in"}>
                {error}
              </Alert>
            ) : null}
            {notice ? <Alert tone="success">{notice}</Alert> : null}
            {otpExpired && !error ? (
              <Alert tone="warning" title="This code has expired">
                Request a new code, or start over.
              </Alert>
            ) : null}
          </div>

          {step.kind === "credentials" ? (
            <form onSubmit={(e) => void handleCredentials(e)} className="fp-form">
              <Field
                label="Merchant ID"
                hint="The UUID issued when your account was created. Your API integration already uses this value."
              >
                {(props) => (
                  <input
                    {...props}
                    className="fp-input fp-input--mono"
                    type="text"
                    required
                    autoComplete="off"
                    spellCheck={false}
                    placeholder="00000000-0000-0000-0000-000000000000"
                    value={merchantId}
                    onChange={(e) => setMerchantId(e.target.value)}
                  />
                )}
              </Field>
              <Field label="Email">
                {(props) => (
                  <input
                    {...props}
                    className="fp-input"
                    type="email"
                    autoComplete="username"
                    required
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                  />
                )}
              </Field>
              <Field label="Password">
                {(props) => (
                  <input
                    {...props}
                    className="fp-input"
                    type="password"
                    autoComplete="current-password"
                    required
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                  />
                )}
              </Field>
              <Button type="submit" variant="primary" size="lg" block loading={submitting}>
                {submitting ? "Signing in…" : "Continue"}
              </Button>
            </form>
          ) : (
            <form onSubmit={(e) => void handleOtp(e)} className="fp-form">
              {step.challenge.method === "totp" && step.challenge.totpEnrollment ? (
                <TotpEnrollment
                  secret={step.challenge.totpEnrollment.secret}
                  otpauthUri={step.challenge.totpEnrollment.otpauthUri}
                  email={email}
                />
              ) : null}
              {step.challenge.method !== "totp" && step.challenge.devOtpCode ? (
                <Alert tone="neutral" title="Development code">
                  <code className="auth-dev-code">{step.challenge.devOtpCode}</code> — shown only
                  outside production.
                </Alert>
              ) : null}
              <Field label={step.challenge.method === "totp" ? "6-digit code" : "One-time code"}>
                {(props) => (
                  <input
                    {...props}
                    className="fp-input fp-input--lg auth-code"
                    type="text"
                    inputMode="numeric"
                    autoComplete="one-time-code"
                    maxLength={step.challenge.method === "totp" ? 7 : undefined}
                    required
                    autoFocus
                    value={code}
                    onChange={(e) => setCode(e.target.value)}
                  />
                )}
              </Field>
              <Button type="submit" variant="primary" size="lg" block loading={submitting}>
                {submitting ? "Verifying…" : "Verify and sign in"}
              </Button>
              <div className="fp-between">
                {step.challenge.method === "totp" ? (
                  <span />
                ) : (
                  <Button variant="ghost" size="sm" icon="replay" disabled={submitting} onClick={() => void handleResend()}>
                    Resend code
                  </Button>
                )}
                <Button variant="ghost" size="sm" icon="arrowLeft" disabled={submitting} onClick={() => backToCredentials(null)}>
                  Start over
                </Button>
              </div>
            </form>
          )}
        </div>
      </main>
      <footer className="fp-standalone__footer">FilsPay merchant dashboard · Sign-in requires a one-time code.</footer>
    </div>
  );
}
