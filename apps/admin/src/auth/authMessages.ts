/**
 * Plain-language text for the admin sign-in errors apps/api actually returns
 * (routes/adminAuth.ts). Never says which credential was wrong. Unknown
 * codes fall through to the caller's generic description. Pure, so it is
 * tested.
 */
const MESSAGES: Record<string, string> = {
  invalid_credentials: "Those details don't match a staff account. Check the email and password.",
  invalid_code: "That code isn't right. Check it and try again.",
  otp_expired: "This code has expired. Start over to get a new code.",
  too_many_attempts: "Too many incorrect codes. Start over to get a new code.",
  no_pending_session: "This sign-in attempt has timed out. Start over.",
  totp_locked: "Too many incorrect codes. This account is locked for a short while; try again later.",
};

export function authErrorMessage(code: string | undefined, fallback: string): string {
  return (code && MESSAGES[code]) || fallback;
}
