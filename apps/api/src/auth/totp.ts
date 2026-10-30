import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import type { Pool } from "pg";
import { withTransaction } from "../db/withTransaction.js";
import { TooManyRequestsError, UnauthorizedError } from "../lib/errors.js";
import { decodeEncryptionKey, decryptSecret, encryptSecret } from "../webhooks/secretCrypto.js";

/**
 * Time-based one-time passwords (RFC 6238, HMAC-SHA1, 6 digits, 30 s step) for the second login factor of both planes
 * (merchant dashboard and admin console). Works with Google Authenticator, Microsoft Authenticator, Authy, 1Password, ...
 * No third-party service and no dependency: the secret never leaves our database (encrypted at rest with the same
 * AES-256-GCM key as webhook secrets) and codes are checked offline.
 *
 * Replaces the emailed OTP, which had no delivery channel in production and (AUD-023) used Math.random.
 */

const BASE32 = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
export const TOTP_STEP_SECONDS = 30;
export const TOTP_DIGITS = 6;
/** Wrong codes allowed on one pending session (the old resend flow reset this budget: AUD-023 residual). */
export const MAX_SESSION_ATTEMPTS = 5;
/** Wrong codes allowed on one ACCOUNT before it is locked, whatever session they came from. */
export const MAX_ACCOUNT_FAILURES = 10;
export const ACCOUNT_LOCK_MINUTES = 15;

export function base32Encode(buf: Buffer): string {
  let bits = 0;
  let value = 0;
  let out = "";
  for (const byte of buf) {
    value = (value << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      out += BASE32[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  if (bits > 0) out += BASE32[(value << (5 - bits)) & 31];
  return out;
}

export function base32Decode(text: string): Buffer {
  const clean = text.replace(/=+$/, "").replace(/\s+/g, "").toUpperCase();
  let bits = 0;
  let value = 0;
  const out: number[] = [];
  for (const ch of clean) {
    const idx = BASE32.indexOf(ch);
    if (idx < 0) throw new RangeError(`base32Decode: invalid character "${ch}"`);
    value = (value << 5) | idx;
    bits += 5;
    if (bits >= 8) {
      out.push((value >>> (bits - 8)) & 255);
      bits -= 8;
    }
  }
  return Buffer.from(out);
}

/** 160-bit random secret, base32 (what the authenticator app stores). */
export function generateTotpSecret(): string {
  return base32Encode(randomBytes(20));
}

/** The 6-digit code for one 30-second step (RFC 4226 dynamic truncation of HMAC-SHA1). */
export function totpCodeForStep(secret: Buffer, step: number): string {
  const counter = Buffer.alloc(8);
  counter.writeBigUInt64BE(BigInt(step));
  const hmac = createHmac("sha1", secret).update(counter).digest();
  const offset = (hmac[19] as number) & 0x0f;
  const binary =
    (((hmac[offset] as number) & 0x7f) << 24) |
    (((hmac[offset + 1] as number) & 0xff) << 16) |
    (((hmac[offset + 2] as number) & 0xff) << 8) |
    ((hmac[offset + 3] as number) & 0xff);
  return String(binary % 10 ** TOTP_DIGITS).padStart(TOTP_DIGITS, "0");
}

export function currentStep(nowMs: number): number {
  return Math.floor(nowMs / 1000 / TOTP_STEP_SECONDS);
}

/**
 * Checks `code` against the steps now-1, now and now+1 (clock drift) and returns the step that matched, or null.
 * A step at or below `lastUsedStep` is refused, so a code that was already accepted can never be replayed. All three
 * candidates are always compared (no early exit) and compared in constant time.
 */
export function matchTotp(secretBase32: string, code: string, nowMs: number, lastUsedStep: number | null): number | null {
  if (!/^\d{6}$/.test(code)) return null;
  const secret = base32Decode(secretBase32);
  const now = currentStep(nowMs);
  const given = Buffer.from(code);
  let matched: number | null = null;
  for (const step of [now - 1, now, now + 1]) {
    const expected = Buffer.from(totpCodeForStep(secret, step));
    const equal = timingSafeEqual(expected, given);
    if (equal && (lastUsedStep === null || step > lastUsedStep) && (matched === null || step > matched)) matched = step;
  }
  return matched;
}

/** otpauth:// URI that authenticator apps import (also usable as a QR payload). */
export function otpauthUri(issuer: string, account: string, secretBase32: string): string {
  const label = `${encodeURIComponent(issuer)}:${encodeURIComponent(account)}`;
  return (
    `otpauth://totp/${label}?secret=${secretBase32}&issuer=${encodeURIComponent(issuer)}` +
    `&algorithm=SHA1&digits=${TOTP_DIGITS}&period=${TOTP_STEP_SECONDS}`
  );
}

/** The two planes store their TOTP state on their own user and session tables. Names are fixed literals, never input. */
export interface TotpPlane {
  userTable: "merchant_users" | "admin_users";
  sessionTable: "sessions" | "admin_sessions";
}
export const MERCHANT_PLANE: TotpPlane = { userTable: "merchant_users", sessionTable: "sessions" };
export const ADMIN_PLANE: TotpPlane = { userTable: "admin_users", sessionTable: "admin_sessions" };

export interface TotpEnrollment {
  /** base32 secret to type into the authenticator app */
  secret: string;
  otpauthUri: string;
}

/**
 * Step 1 of login (password already verified). Returns the enrollment details only while the account has NOT yet
 * confirmed a code: the first correct code confirms it, after that the secret is never shown again. Accounts that have
 * never enrolled are therefore only as safe as their password until first login (documented open risk; the safeguard is
 * provisioning the secret out of band).
 */
export async function beginTotpLogin(
  pool: Pool,
  plane: TotpPlane,
  userId: string,
  account: string,
  issuer: string,
  encryptionKeyB64: string,
): Promise<TotpEnrollment | null> {
  const key = decodeEncryptionKey(encryptionKeyB64);
  const read = () =>
    pool.query<{ ct: string | null; confirmed: Date | null }>(
      `SELECT totp_secret_ciphertext AS ct, totp_confirmed_at AS confirmed FROM ${plane.userTable} WHERE id = $1`,
      [userId],
    );
  let row = (await read()).rows[0];
  if (!row) throw new Error("beginTotpLogin: user disappeared");
  if (row.ct === null) {
    const fresh = generateTotpSecret();
    // only the first writer wins, so two parallel first logins cannot hand out two different secrets
    await pool.query(
      `UPDATE ${plane.userTable} SET totp_secret_ciphertext = $2 WHERE id = $1 AND totp_secret_ciphertext IS NULL`,
      [userId, encryptSecret(fresh, key)],
    );
    row = (await read()).rows[0];
    if (!row || row.ct === null) throw new Error("beginTotpLogin: could not store a secret");
  }
  if (row.confirmed !== null) return null;
  const secret = decryptSecret(row.ct, key);
  return { secret, otpauthUri: otpauthUri(issuer, account, secret) };
}

/** Counts one wrong/any attempt on a pending session; past the budget the session is revoked. */
export async function consumeSessionAttempt(
  pool: Pool,
  plane: TotpPlane,
  sessionId: string,
  revoke: () => Promise<void>,
): Promise<void> {
  const r = await pool.query(
    `UPDATE ${plane.sessionTable} SET totp_attempt_count = totp_attempt_count + 1
      WHERE id = $1 AND totp_attempt_count < $2 RETURNING id`,
    [sessionId, MAX_SESSION_ATTEMPTS],
  );
  if ((r.rowCount ?? 0) === 0) {
    await revoke();
    throw new TooManyRequestsError("too_many_attempts");
  }
}

/**
 * Verifies a code for the account and, on success, records the step (replay protection), clears the failure counter and
 * confirms enrollment. Wrong codes count against the ACCOUNT (not just the session), so opening new sessions with a
 * stolen password does not give fresh guesses: after MAX_ACCOUNT_FAILURES the account is locked for a while.
 */
export async function verifyAndConsumeTotp(
  pool: Pool,
  plane: TotpPlane,
  userId: string,
  code: string,
  encryptionKeyB64: string,
  nowMs: number = Date.now(),
): Promise<void> {
  const key = decodeEncryptionKey(encryptionKeyB64);
  const outcome = await withTransaction(pool, async (client): Promise<"ok" | "bad" | "locked"> => {
    const r = await client.query<{
      ct: string | null;
      last_step: string | null;
      failed: number;
      locked_until: Date | null;
    }>(
      `SELECT totp_secret_ciphertext AS ct, totp_last_step AS last_step, totp_failed_count AS failed, totp_locked_until AS locked_until
         FROM ${plane.userTable} WHERE id = $1 FOR UPDATE`,
      [userId],
    );
    const row = r.rows[0];
    if (!row) return "bad";
    if (row.locked_until !== null && row.locked_until.getTime() > nowMs) return "locked";
    const step = row.ct === null ? null : matchTotp(decryptSecret(row.ct, key), code, nowMs, row.last_step === null ? null : Number(row.last_step));
    if (step === null) {
      const failed = row.failed + 1;
      if (failed >= MAX_ACCOUNT_FAILURES) {
        await client.query(
          `UPDATE ${plane.userTable} SET totp_failed_count = 0, totp_locked_until = $2 WHERE id = $1`,
          [userId, new Date(nowMs + ACCOUNT_LOCK_MINUTES * 60_000)],
        );
      } else {
        await client.query(`UPDATE ${plane.userTable} SET totp_failed_count = $2 WHERE id = $1`, [userId, failed]);
      }
      return "bad";
    }
    await client.query(
      `UPDATE ${plane.userTable}
          SET totp_last_step = $2, totp_failed_count = 0, totp_locked_until = NULL,
              totp_confirmed_at = COALESCE(totp_confirmed_at, now())
        WHERE id = $1`,
      [userId, step],
    );
    return "ok";
  });
  if (outcome === "locked") throw new TooManyRequestsError("totp_locked");
  if (outcome === "bad") throw new UnauthorizedError("invalid_code");
}
