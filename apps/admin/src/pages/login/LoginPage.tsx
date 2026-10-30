import { useState } from "react";
import { Navigate, useLocation, useNavigate } from "react-router-dom";
import { Alert, Backdrop, Button, CopyButton, Field, Icon, Logo, useDocumentTitle } from "@filspay/ui";
import { login, verifyOtp } from "../../api/auth.js";
import { ApiError, describeError } from "../../api/client.js";
import { authErrorMessage } from "../../auth/authMessages.js";
import { useAdminAuth } from "../../auth/AdminAuthContext.js";
import type { AdminLoginResponse } from "../../types.js";

type Step =
  | { kind: "credentials" }
  | { kind: "otp"; challenge: AdminLoginResponse };

/**
 * Two-step admin login: email + password creates a *pending* session
 * and issues an OTP challenge; the OTP step is what actually authenticates
 * it. Neither step is told which half of a bad credential pair was wrong —
 * the API answers a single generic `invalid_credentials`, and this screen
 * repeats it verbatim rather than guessing at something more specific.
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
  const { status, refresh } = useAdminAuth();
  const navigate = useNavigate();
  const location = useLocation();

  const [step, setStep] = useState<Step>({ kind: "credentials" });
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [code, setCode] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useDocumentTitle(step.kind === "otp" ? "Verify sign-in" : "Sign in", "FilsPay Admin");

  const redirectTo =
    (location.state as { from?: string } | null)?.from ?? "/merchants";

  if (status === "authenticated") {
    return <Navigate to={redirectTo} replace />;
  }

  async function handleCredentials(event: React.FormEvent): Promise<void> {
    event.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      const challenge = await login({ email, password });
      setStep({ kind: "otp", challenge });
      setPassword("");
    } catch (err) {
      setError(friendly(err));
    } finally {
      setSubmitting(false);
    }
  }

  // YA: admin verify re-issues the cookie with the full TTL
  async function handleOtp(event: React.FormEvent): Promise<void> {
    event.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      await verifyOtp({ code });
      // The session cookie is now authenticated server-side; re-read `me`
      // so the rest of the console renders from the server's answer, not
      // from the verify response we happen to be holding.
      await refresh();
      navigate(redirectTo, { replace: true });
    } catch (err) {
      setError(friendly(err));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="fp-standalone">
      <Backdrop quiet />
      <header className="fp-standalone__bar">
        <Logo />
        <span className="fp-context fp-context--admin">
          <Icon name="shield" size={14} />
          Admin console
        </span>
      </header>
      <main className="fp-standalone__body">
        <div className="fp-panel">
          <ol className="fp-steps" aria-label="Sign-in steps">
            <li className="fp-steps__item" data-state={step.kind === "credentials" ? "current" : "done"} aria-current={step.kind === "credentials" ? "step" : undefined}>
              1 · Operator
            </li>
            <li className="fp-steps__item" data-state={step.kind === "otp" ? "current" : "todo"} aria-current={step.kind === "otp" ? "step" : undefined}>
              2 · Verification
            </li>
          </ol>

          {step.kind === "credentials" ? (
            <>
              <h1 className="auth-title">FilsPay Admin</h1>
              <p className="auth-lead">Internal operations console. Staff accounts only.</p>
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

          <div className="auth-messages">
            {error ? (
              <Alert tone="danger" title={step.kind === "otp" ? "Code not accepted" : "Couldn't sign you in"}>
                {error}
              </Alert>
            ) : null}
          </div>

          {step.kind === "credentials" ? (
            <form onSubmit={(e) => void handleCredentials(e)} className="fp-form">
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
              <div>
                <Button
                  variant="ghost"
                  size="sm"
                  icon="arrowLeft"
                  onClick={() => {
                    setStep({ kind: "credentials" });
                    setCode("");
                    setError(null);
                  }}
                >
                  Start over
                </Button>
              </div>
            </form>
          )}
        </div>
      </main>
      <footer className="fp-standalone__footer">FilsPay internal operations · Sign-in requires a one-time code.</footer>
    </div>
  );
}
