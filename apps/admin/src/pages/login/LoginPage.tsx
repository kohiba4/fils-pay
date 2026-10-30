import { useState } from "react";
import { Navigate, useLocation, useNavigate } from "react-router-dom";
import { login, verifyOtp } from "../../api/auth.js";
import { describeError } from "../../api/client.js";
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
      setError(describeError(err));
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
      setError(describeError(err));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <main className="admin-centered">
      <h1>FilsPay Admin</h1>
      <p className="admin-muted">Internal operations console.</p>

      {error ? <p className="admin-error">{error}</p> : null}

      {step.kind === "credentials" ? (
        <form onSubmit={(e) => void handleCredentials(e)} className="admin-form">
          <label>
            Email
            <input
              type="email"
              autoComplete="username"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          </label>
          <label>
            Password
            <input
              type="password"
              autoComplete="current-password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </label>
          <button type="submit" disabled={submitting}>
            {submitting ? "Signing in..." : "Continue"}
          </button>
        </form>
      ) : (
        <form onSubmit={(e) => void handleOtp(e)} className="admin-form">
          {step.challenge.method === "totp" ? (
            <>
              {step.challenge.totpEnrollment ? (
                <div className="admin-notice" data-testid="totp-enrollment">
                  <p>
                    <strong>Set up your authenticator app</strong> (Google Authenticator, Microsoft Authenticator, Authy, 1Password…) for{" "}
                    <strong>{email}</strong>:
                  </p>
                  <ol>
                    <li>In the app choose <em>Add account</em> → <em>Enter a setup key</em>.</li>
                    <li>
                      Key: <code data-testid="totp-secret">{step.challenge.totpEnrollment.secret}</code> (time-based, 6 digits)
                    </li>
                    <li>
                      On a phone you can also <a href={step.challenge.totpEnrollment.otpauthUri}>open the setup link</a>.
                    </li>
                  </ol>
                  <p className="admin-muted">This key is shown once. Then enter the 6-digit code the app shows.</p>
                </div>
              ) : (
                <p>
                  Enter the 6-digit code from your authenticator app for <strong>{email}</strong>.
                </p>
              )}
            </>
          ) : (
            <>
              <p>
                A one-time code was issued for <strong>{email}</strong>. It expires at{" "}
                {step.challenge.otpExpiresAt ? new Date(step.challenge.otpExpiresAt).toLocaleTimeString() : "soon"}.
              </p>
              {step.challenge.devOtpCode ? (
                <p className="admin-muted">
                  Development code: <code>{step.challenge.devOtpCode}</code>
                </p>
              ) : null}
            </>
          )}
          <label>
            {step.challenge.method === "totp" ? "6-digit code" : "One-time code"}
            <input
              type="text"
              inputMode="numeric"
              autoComplete="one-time-code"
              maxLength={step.challenge.method === "totp" ? 7 : undefined}
              required
              value={code}
              onChange={(e) => setCode(e.target.value)}
            />
          </label>
          <button type="submit" disabled={submitting}>
            {submitting ? "Verifying..." : "Verify"}
          </button>
          <button
            type="button"
            onClick={() => {
              setStep({ kind: "credentials" });
              setCode("");
              setError(null);
            }}
          >
            Start over
          </button>
        </form>
      )}
    </main>
  );
}
