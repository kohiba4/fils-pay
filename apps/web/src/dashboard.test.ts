import assert from "node:assert/strict";
import test from "node:test";
import { buildQuery } from "./api/query.js";
import { bahrainWindow, bhd, dash, dayStartIso, localDateTimeToIso, sumFils } from "./format.js";
import { paymentLinkDisplayStatus } from "./status.js";
import { authErrorMessage } from "./auth/authMessages.js";
import { sharePercent } from "./pages/overview/OutcomeDonut.js";

/**
 * The pure logic behind the dashboard's query strings and money/date display.
 * Both are places a silent bug does real damage: a dropped filter param makes
 * a page show rows it claimed to exclude, and a mis-scaled amount misstates
 * money. Everything else is rendering, verified against the running API
 * rather than here.
 */

test("buildQuery repeats array keys rather than encoding a filter object", () => {
  assert.equal(
    buildQuery({ status: ["captured", "voided"] }),
    "?status=captured&status=voided",
  );
});

test("buildQuery drops empty values so an unset filter sends no param", () => {
  assert.equal(buildQuery({}), "");
  assert.equal(buildQuery({ from: undefined, to: null, search: "" }), "");
  assert.equal(buildQuery({ status: [] }), "");
  // A zero is a real value, not an empty one.
  assert.equal(buildQuery({ limit: 0 }), "?limit=0");
});

test("buildQuery percent-encodes values", () => {
  assert.equal(buildQuery({ search: "a b&c=d" }), "?search=a+b%26c%3Dd");
});

test("buildQuery keeps a cursor byte-exact", () => {
  // Cursors are base64url; a mangled one silently restarts or skips a page.
  const cursor = "MjAyNi0wOS0xMlQwMDowMDowMC4wMDBafGFiYw";
  assert.equal(buildQuery({ cursor }), `?cursor=${cursor}`);
});

// FH: covers negatives too
test("bhd formats integer fils via @filspay/money, never float arithmetic", () => {
  assert.equal(bhd(0), "0.000 BHD");
  assert.equal(bhd(1), "0.001 BHD");
  assert.equal(bhd(1000), "1.000 BHD");
  assert.equal(bhd(1234567), "1234.567 BHD");
  // negative amounts (refund-only batch net, reconciliation pending/gap) render instead of throwing
  assert.equal(bhd(-1250), "-1.250 BHD");
  assert.equal(bhd(-1), "-0.001 BHD");
});

test("dash renders absent values as an em dash but keeps zero", () => {
  assert.equal(dash(null), "—");
  assert.equal(dash(undefined), "—");
  assert.equal(dash(""), "—");
  assert.equal(dash(0), "0");
});

test("dayStartIso converts a date input to a UTC day boundary", () => {
  assert.equal(dayStartIso("2026-09-12"), "2026-09-12T00:00:00.000Z");
  assert.equal(dayStartIso(""), undefined);
});

test("localDateTimeToIso rejects garbage instead of sending Invalid Date", () => {
  assert.equal(localDateTimeToIso(""), null);
  assert.equal(localDateTimeToIso("not-a-date"), null);
  // A real value round-trips to the same instant it names.
  const iso = localDateTimeToIso("2026-09-12T14:30");
  assert.notEqual(iso, null);
  assert.equal(new Date(iso ?? "").getTime(), new Date("2026-09-12T14:30").getTime());
});

test("sumFils totals integer fils exactly and rejects fractional input", () => {
  assert.equal(sumFils([]), 0);
  assert.equal(sumFils([1, 999, 1000]), 2000);
  assert.equal(sumFils([426987, 496948, 57006]), 980941);
  assert.equal(bhd(sumFils([1250, -2500])), "-1.250 BHD");
  // A fractional value is a money bug upstream, not something to round away.
  assert.throws(() => sumFils([1.5]));
});

test("paymentLinkDisplayStatus shows an expired active link as expired, like the API", () => {
  const now = Date.parse("2026-10-30T12:00:00.000Z");
  const link = (status: "active" | "reserved" | "paid" | "canceled", expiresAt: string) => ({ status, expiresAt });
  assert.equal(paymentLinkDisplayStatus(link("active", "2026-10-30T12:00:01.000Z"), now), "active");
  // expires_at <= now is expired (derivePublicStatus uses the same <=).
  assert.equal(paymentLinkDisplayStatus(link("active", "2026-10-30T12:00:00.000Z"), now), "expired");
  assert.equal(paymentLinkDisplayStatus(link("active", "2026-10-29T00:00:00.000Z"), now), "expired");
  // Only `active` is derived; terminal and in-flight states are shown as stored.
  assert.equal(paymentLinkDisplayStatus(link("paid", "2026-10-29T00:00:00.000Z"), now), "paid");
  assert.equal(paymentLinkDisplayStatus(link("canceled", "2026-10-29T00:00:00.000Z"), now), "canceled");
  assert.equal(paymentLinkDisplayStatus(link("reserved", "2026-10-29T00:00:00.000Z"), now), "reserved");
});

test("authErrorMessage turns sign-in error codes into sentences without naming the wrong field", () => {
  assert.match(authErrorMessage("invalid_code", "x"), /code isn't right/);
  assert.match(authErrorMessage("otp_expired", "x"), /expired/);
  assert.match(authErrorMessage("too_many_attempts", "x"), /Sign in again/);
  assert.match(authErrorMessage("resend_too_soon", "x"), /wait/);
  // One message for every bad-credential case: merchant ID, email or password.
  assert.equal(
    authErrorMessage("invalid_credentials", "x"),
    "Those details don't match an account. Check the merchant ID, email and password.",
  );
  // Anything unknown keeps the caller's description (e.g. a server message).
  assert.equal(authErrorMessage("some_new_code", "Server said no"), "Server said no");
  assert.equal(authErrorMessage(undefined, "Network down"), "Network down");
});

test("bahrainWindow mirrors the API's default window on Bahrain calendar days", () => {
  // 21:30Z on 30 Oct is already 31 Oct in Bahrain (UTC+3).
  const lateEvening = Date.parse("2026-10-30T21:30:00.000Z");
  assert.deepEqual(bahrainWindow(30, lateEvening), { from: "2026-10-01", to: "2026-11-01" });
  assert.deepEqual(bahrainWindow(7, lateEvening), { from: "2026-10-24", to: "2026-11-01" });
  // 20:59Z is still 30 Oct in Bahrain.
  const earlier = Date.parse("2026-10-30T20:59:00.000Z");
  assert.deepEqual(bahrainWindow(7, earlier), { from: "2026-10-23", to: "2026-10-31" });
});

test("sharePercent is a one-decimal share of counts and never divides by zero", () => {
  assert.equal(sharePercent(1, 3), "33.3");
  assert.equal(sharePercent(2, 3), "66.7");
  assert.equal(sharePercent(0, 0), "0.0");
  assert.equal(sharePercent(5, 5), "100.0");
});
