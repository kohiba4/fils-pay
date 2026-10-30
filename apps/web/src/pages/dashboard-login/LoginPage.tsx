import { useState } from "react";
import { Navigate, useLocation, useNavigate } from "react-router-dom";
import { login, resendOtp, verifyOtp } from "../../api/dashboardAuth.js";
import { ApiError, describeError } from "../../api/client.js";
import {
  readLastMerchantId,
  useDashboardAuth,
  writeLastMerchantId,
} from "../../auth/DashboardAuthContext.js";
import type { DashboardLoginResponse } from "../../types.js";
import "../../dashboard.css";

type Step = { kind: "credentials" } | { kind: "otp"; challenge: DashboardLoginResponse };

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
      setError(describeError(err));
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
        backToCredentials(describeError(err));
      } else {
        setError(describeError(err));
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
      setError(describeError(err));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <main className="dash-centered">
      <h1>FilsPay dashboard</h1>
      <p className="dash-muted">Merchant sign-in.</p>

      {error ? <p className="dash-error">{error}</p> : null}
      {notice ? <p className="dash-notice">{notice}</p> : null}

      {step.kind === "credentials" ? (
        <form onSubmit={(e) => void handleCredentials(e)} className="dash-form">
          <label>
            Merchant ID
            <input
              type="text"
              required
              autoComplete="off"
              spellCheck={false}
              placeholder="00000000-0000-0000-0000-000000000000"
              value={merchantId}
              onChange={(e) => setMerchantId(e.target.value)}
            />
          </label>
          <p className="dash-muted dash-hint">
            The UUID issued when your account was created. Your API integration
            already uses this value.
          </p>
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
          <button type="submit" className="dash-button" disabled={submitting}>
            {submitting ? "Signing in..." : "Continue"}
          </button>
        </form>
      ) : (
        <form onSubmit={(e) => void handleOtp(e)} className="dash-form">
          {step.challenge.method === "totp" ? (
            <>
              {step.challenge.totpEnrollment ? (
                <div className="dash-notice" data-testid="totp-enrollment">
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
                  <p className="dash-muted">This key is shown once. Then enter the 6-digit code the app shows.</p>
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
                <p className="dash-muted">
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
          <button type="submit" className="dash-button" disabled={submitting}>
            {submitting ? "Verifying..." : "Verify"}
          </button>
          {step.challenge.method === "totp" ? null : (
            <button
              type="button"
              className="dash-button"
              disabled={submitting}
              onClick={() => void handleResend()}
            >
              Resend code
            </button>
          )}
          <button type="button" className="dash-button" onClick={() => backToCredentials(null)}>
            Start over
          </button>
        </form>
      )}
    </main>
  );
}
