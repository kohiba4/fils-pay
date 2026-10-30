import assert from "node:assert/strict";
import { test } from "node:test";
import {
  base32Decode,
  base32Encode,
  currentStep,
  generateTotpSecret,
  matchTotp,
  otpauthUri,
  totpCodeForStep,
} from "./totp.js";

// RFC 6238 appendix B: secret "12345678901234567890" (ASCII), SHA-1, 30 s step. The RFC lists 8-digit codes; the 6-digit
// code is their last six digits, which is what Google Authenticator shows.
const RFC_SECRET = Buffer.from("12345678901234567890");
const RFC_SECRET_B32 = "GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ";
const VECTORS: Array<[number, string]> = [
  [59, "287082"],
  [1111111109, "081804"],
  [1111111111, "050471"],
  [1234567890, "005924"],
  [2000000000, "279037"],
  [20000000000, "353130"],
];

test("totpCodeForStep reproduces the RFC 6238 test vectors", () => {
  for (const [unixSeconds, expected] of VECTORS) {
    assert.equal(totpCodeForStep(RFC_SECRET, Math.floor(unixSeconds / 30)), expected, `t=${unixSeconds}`);
  }
});

test("base32 round-trips and matches the RFC secret", () => {
  assert.equal(base32Encode(RFC_SECRET), RFC_SECRET_B32);
  assert.deepEqual(base32Decode(RFC_SECRET_B32), RFC_SECRET);
  assert.deepEqual(base32Decode(RFC_SECRET_B32.toLowerCase() + "===="), RFC_SECRET, "lowercase and padding are tolerated");
  const s = generateTotpSecret();
  assert.match(s, /^[A-Z2-7]{32}$/, "160 random bits as 32 base32 characters");
  assert.notEqual(s, generateTotpSecret());
  assert.throws(() => base32Decode("not*base32"), RangeError);
});

test("matchTotp accepts the current step and one step of clock drift each way, nothing further", () => {
  const nowMs = 1_234_567_890_000;
  const step = currentStep(nowMs);
  for (const d of [-1, 0, 1]) {
    const code = totpCodeForStep(RFC_SECRET, step + d);
    assert.equal(matchTotp(RFC_SECRET_B32, code, nowMs, null), step + d, `drift ${d}`);
  }
  for (const d of [-2, 2, 10]) {
    assert.equal(matchTotp(RFC_SECRET_B32, totpCodeForStep(RFC_SECRET, step + d), nowMs, null), null, `drift ${d} is refused`);
  }
});

test("matchTotp refuses a step that was already used (no replay) but accepts a later one", () => {
  const nowMs = 1_234_567_890_000;
  const step = currentStep(nowMs);
  const code = totpCodeForStep(RFC_SECRET, step);
  assert.equal(matchTotp(RFC_SECRET_B32, code, nowMs, step), null, "same step again");
  assert.equal(matchTotp(RFC_SECRET_B32, code, nowMs, step + 1), null, "older than the last used step");
  assert.equal(matchTotp(RFC_SECRET_B32, code, nowMs, step - 1), step);
});

test("matchTotp rejects anything that is not six digits", () => {
  const nowMs = 1_234_567_890_000;
  const good = totpCodeForStep(RFC_SECRET, currentStep(nowMs));
  for (const bad of ["", "12345", "1234567", "abcdef", " " + good, good + " ", "00000x"]) {
    assert.equal(matchTotp(RFC_SECRET_B32, bad, nowMs, null), null, JSON.stringify(bad));
  }
});

test("otpauthUri is the format authenticator apps import", () => {
  const uri = otpauthUri("FilsPay", "owner@example.test", "ABCDEFGHIJKLMNOP");
  assert.equal(
    uri,
    "otpauth://totp/FilsPay:owner%40example.test?secret=ABCDEFGHIJKLMNOP&issuer=FilsPay&algorithm=SHA1&digits=6&period=30",
  );
});
