/**
 * Plain-language text for the sign-in errors apps/api actually returns
 * (routes/auth.ts). Still never says which credential was wrong: the API
 * answers one generic `invalid_credentials`, and so does this. Unknown codes
 * fall through to the caller's generic description. Pure, so it is tested.
 */
const MESSAGES: Record<string, string> = {
  invalid_credentials: "Those details don't match an account. Check the merchant ID, email and password.",
  invalid_code: "That code isn't right. Check it and try again.",
  otp_expired: "This code has expired. Request a new code, or start over.",
  too_many_attempts: "Too many incorrect codes. Sign in again to get a new code.",
  no_pending_session: "This sign-in attempt has timed out. Start over.",
  totp_locked: "Too many incorrect codes. This account is locked for a short while; try again later.",
  resend_not_supported: "Your authenticator app generates the codes, so there is nothing to resend.",
  resend_too_soon: "Please wait a moment before requesting another code.",
};

export function authErrorMessage(code: string | undefined, fallback: string): string {
  return (code && MESSAGES[code]) || fallback;
}
