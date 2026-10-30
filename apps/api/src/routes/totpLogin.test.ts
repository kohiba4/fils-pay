/**
 * Authenticator-app (TOTP) second factor, both planes, over real HTTP routes and a real Postgres.
 * SECOND_FACTOR=totp: no code is ever generated, stored, sent or returned; enrolment secret shown only until the first
 * correct code; replay, per-session and per-account brute-force limits.
 */
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { test } from "node:test";
import { Pool } from "pg";
import { buildApp } from "../app.js";
import { loadConfig } from "../config.js";
import { hashPassword } from "../auth/passwords.js";
import { base32Decode, currentStep, totpCodeForStep } from "../auth/totp.js";
import { recordKycReview } from "../onboarding/review.js";

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) throw new Error("totpLogin.test.ts requires DATABASE_URL to point at a real, migrated Postgres");

const config = loadConfig({
  DATABASE_URL: databaseUrl,
  NODE_ENV: "test",
  SECOND_FACTOR: "totp",
  INTERNAL_API_TOKEN: "test-internal-token",
  WEBHOOK_SECRET_ENCRYPTION_KEY: "Y1ZTGTcYbe30GZJebys9w7T3OYZNKewuOH3SUCEdRQk=",
});
const pool = new Pool({ connectionString: databaseUrl, max: 8 });
const app = buildApp(config, pool);
test.after(async () => {
  await app.close();
  await pool.end();
});

const PASSWORD = "correct horse battery staple";
let passwordHash: string | undefined;

function cookieOf(res: { headers: Record<string, unknown> }, name: string): { pair: string; maxAge: number } {
  const raw = res.headers["set-cookie"];
  const list = Array.isArray(raw) ? raw : [String(raw)];
  const hit = list.filter((c) => c.startsWith(`${name}=`)).pop();
  assert.ok(hit, `response sets ${name}`);
  const maxAge = Number(/Max-Age=(\d+)/i.exec(hit)?.[1] ?? 0);
  return { pair: hit.split(";")[0]!, maxAge };
}

function codeFor(secretBase32: string, stepOffset = 0): string {
  return totpCodeForStep(base32Decode(secretBase32), currentStep(Date.now()) + stepOffset);
}

interface Plane {
  name: string;
  cookieName: string;
  loginUrl: string;
  verifyUrl: string;
  resendUrl: string;
  probeUrl: string;
  userTable: string;
  sessionTable: string;
  makeUser: () => Promise<{ id: string; login: Record<string, string> }>;
}

const merchantPlane: Plane = {
  name: "merchant",
  cookieName: config.cookieName,
  loginUrl: "/v1/auth/login",
  verifyUrl: "/v1/auth/otp/verify",
  resendUrl: "/v1/auth/otp/resend",
  probeUrl: "/v1/transactions",
  userTable: "merchant_users",
  sessionTable: "sessions",
  async makeUser() {
    passwordHash ??= await hashPassword(PASSWORD, config);
    const m = await pool.query<{ id: string }>(`INSERT INTO merchants (display_name, mdr_bps) VALUES ($1, 250) RETURNING id`, [`TOTP ${randomUUID()}`]);
    const merchantId = m.rows[0]!.id;
    await recordKycReview(pool, { merchantId, outcome: "approved", reviewerIdentifier: "test" });
    const email = `totp-${randomUUID()}@example.test`;
    const u = await pool.query<{ id: string }>(
      `INSERT INTO merchant_users (merchant_id, email, role, password_hash) VALUES ($1, $2, 'owner', $3) RETURNING id`,
      [merchantId, email, passwordHash],
    );
    return { id: u.rows[0]!.id, login: { merchantId, email, password: PASSWORD } };
  },
};

const adminPlane: Plane = {
  name: "admin",
  cookieName: config.adminCookieName,
  loginUrl: "/v1/admin/auth/login",
  verifyUrl: "/v1/admin/auth/otp/verify",
  resendUrl: "/v1/admin/auth/otp/resend",
  probeUrl: "/v1/admin/auth/me",
  userTable: "admin_users",
  sessionTable: "admin_sessions",
  async makeUser() {
    passwordHash ??= await hashPassword(PASSWORD, config);
    const email = `totp-admin-${randomUUID()}@admin.test`;
    const u = await pool.query<{ id: string }>(
      `INSERT INTO admin_users (email, password_hash, display_name, role) VALUES ($1, $2, 'TOTP Test', 'support') RETURNING id`,
      [email, passwordHash],
    );
    return { id: u.rows[0]!.id, login: { email, password: PASSWORD } };
  },
};

for (const plane of [merchantPlane, adminPlane]) {
  const post = (url: string, cookie: string | null, payload: unknown) =>
    app.inject({ method: "POST", url, headers: cookie ? { cookie } : {}, payload: payload as Record<string, unknown> });
  const login = async (user: { login: Record<string, string> }) => {
    const res = await post(plane.loginUrl, null, user.login);
    assert.equal(res.statusCode, 200, res.body);
    return { res, body: res.json() as Record<string, unknown>, cookie: cookieOf(res, plane.cookieName).pair };
  };

  test(`${plane.name}: first login returns the enrolment secret, never a code; nothing is written to the OTP tables`, async () => {
    const user = await plane.makeUser();
    const { body, res } = await login(user);
    assert.equal(body.otpRequired, true);
    assert.equal(body.method, "totp");
    assert.equal(body.devOtpCode, undefined, "no code in the response");
    const enrol = body.totpEnrollment as { secret: string; otpauthUri: string };
    assert.match(enrol.secret, /^[A-Z2-7]{32}$/);
    assert.ok(enrol.otpauthUri.startsWith("otpauth://totp/") && enrol.otpauthUri.includes(`secret=${enrol.secret}`));
    assert.ok(!res.body.includes("otpExpiresAt"), "no OTP challenge was issued");

    const stored = await pool.query<{ ct: string }>(`SELECT totp_secret_ciphertext AS ct FROM ${plane.userTable} WHERE id = $1`, [user.id]);
    assert.ok(stored.rows[0]!.ct && !stored.rows[0]!.ct.includes(enrol.secret), "secret stored encrypted, not in clear");
    const sess = await pool.query<{ otp_challenge_id: string | null }>(
      `SELECT otp_challenge_id FROM ${plane.sessionTable} WHERE ${plane.name === "admin" ? "admin_user_id" : "merchant_user_id"} = $1`,
      [user.id],
    );
    assert.equal(sess.rows[0]!.otp_challenge_id, null);
  });

  test(`${plane.name}: a pending session grants nothing; the correct code promotes it for the full session lifetime`, async () => {
    const user = await plane.makeUser();
    const { body, cookie } = await login(user);
    const secret = (body.totpEnrollment as { secret: string }).secret;

    assert.equal((await app.inject({ method: "GET", url: plane.probeUrl, headers: { cookie } })).statusCode, 401, "pending session is not authenticated");
    const wrong = await post(plane.verifyUrl, cookie, { code: codeFor(secret) === "000000" ? "111111" : "000000" });
    assert.equal(wrong.statusCode, 401);
    assert.equal((wrong.json() as { error: string }).error, "invalid_code");

    const ok = await post(plane.verifyUrl, cookie, { code: codeFor(secret).replace(/^(\d{3})(\d{3})$/, "$1 $2") }); // a space in the middle is tolerated
    assert.equal(ok.statusCode, 200, ok.body);
    assert.equal((ok.json() as { authenticated: boolean }).authenticated, true);
    const full = cookieOf(ok, plane.cookieName);
    assert.ok(full.maxAge >= 3600, `the cookie is re-issued for the full session, not the 10 minute pending window (got ${full.maxAge}s)`);
    assert.notEqual((await app.inject({ method: "GET", url: plane.probeUrl, headers: { cookie: full.pair } })).statusCode, 401);
  });

  test(`${plane.name}: the secret is shown only once; an accepted code can never be replayed`, async () => {
    const user = await plane.makeUser();
    const first = await login(user);
    const secret = (first.body.totpEnrollment as { secret: string }).secret;
    const code = codeFor(secret);
    assert.equal((await post(plane.verifyUrl, first.cookie, { code })).statusCode, 200);

    const second = await login(user);
    assert.equal(second.body.totpEnrollment, undefined, "enrolled accounts never see the secret again");
    assert.equal(second.body.method, "totp");
    const replay = await post(plane.verifyUrl, second.cookie, { code });
    assert.equal(replay.statusCode, 401, "same code, same 30 s step: replay refused");
    // a code from the next step is a fresh one and works (clock-drift window)
    const next = await post(plane.verifyUrl, second.cookie, { code: codeFor(secret, 1) });
    assert.equal(next.statusCode, 200, next.body);
  });

  test(`${plane.name}: 5 wrong codes kill the pending session even if the 6th is right`, async () => {
    const user = await plane.makeUser();
    const { body, cookie } = await login(user);
    const secret = (body.totpEnrollment as { secret: string }).secret;
    const right = codeFor(secret);
    const wrong = right === "000000" ? "111111" : "000000";
    for (let i = 0; i < 5; i++) assert.equal((await post(plane.verifyUrl, cookie, { code: wrong })).statusCode, 401);
    const sixth = await post(plane.verifyUrl, cookie, { code: right });
    assert.equal(sixth.statusCode, 429, sixth.body);
    assert.equal((sixth.json() as { error: string }).error, "too_many_attempts");
    assert.equal((await post(plane.verifyUrl, cookie, { code: right })).statusCode, 401, "the session is gone");
  });

  test(`${plane.name}: guesses count against the ACCOUNT, so new sessions do not reset the budget (10 wrong = locked)`, async () => {
    const user = await plane.makeUser();
    const a = await login(user);
    const secret = (a.body.totpEnrollment as { secret: string }).secret;
    const right = codeFor(secret);
    const wrong = right === "000000" ? "111111" : "000000";
    for (let i = 0; i < 5; i++) await post(plane.verifyUrl, a.cookie, { code: wrong });
    const b = await login(user);
    for (let i = 0; i < 5; i++) await post(plane.verifyUrl, b.cookie, { code: wrong });
    const c = await login(user);
    const locked = await post(plane.verifyUrl, c.cookie, { code: right });
    assert.equal(locked.statusCode, 429, locked.body);
    assert.equal((locked.json() as { error: string }).error, "totp_locked");
  });

  test(`${plane.name}: resend does not exist in TOTP mode`, async () => {
    const user = await plane.makeUser();
    const { cookie } = await login(user);
    const res = await post(plane.resendUrl, cookie, {});
    if (plane.name === "admin") {
      assert.equal(res.statusCode, 404, "the admin plane never had a resend route");
    } else {
      assert.equal(res.statusCode, 400);
      assert.equal((res.json() as { error: string }).error, "resend_not_supported");
    }
  });
}

test("AUD-060: the legacy OTP mode (non-production) also re-issues the merchant cookie for the full session", async () => {
  const otpApp = buildApp(loadConfig({ DATABASE_URL: databaseUrl!, NODE_ENV: "test", SECOND_FACTOR: "otp", OTP_DEV_EXPOSE: "true",
    INTERNAL_API_TOKEN: "test-internal-token", WEBHOOK_SECRET_ENCRYPTION_KEY: "Y1ZTGTcYbe30GZJebys9w7T3OYZNKewuOH3SUCEdRQk=" }), pool);
  try {
    const user = await merchantPlane.makeUser();
    const res = await otpApp.inject({ method: "POST", url: merchantPlane.loginUrl, payload: user.login });
    assert.equal(res.statusCode, 200, res.body);
    const pending = cookieOf(res, config.cookieName);
    assert.ok(pending.maxAge <= 3600, "pending cookie is short");
    const ok = await otpApp.inject({ method: "POST", url: merchantPlane.verifyUrl, headers: { cookie: pending.pair },
      payload: { code: (res.json() as { devOtpCode: string }).devOtpCode } });
    assert.equal(ok.statusCode, 200, ok.body);
    assert.ok(cookieOf(ok, config.cookieName).maxAge >= 3600, "full session lifetime after verify");
  } finally {
    await otpApp.close();
  }
});
