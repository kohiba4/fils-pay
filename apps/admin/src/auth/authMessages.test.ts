import assert from "node:assert/strict";
import test from "node:test";
import { authErrorMessage } from "./authMessages.js";

test("admin sign-in errors read as sentences; unknown codes keep the fallback", () => {
  assert.match(authErrorMessage("invalid_credentials", "x"), /staff account/);
  assert.match(authErrorMessage("too_many_attempts", "x"), /Start over/);
  assert.equal(authErrorMessage("unexpected", "fallback text"), "fallback text");
});
