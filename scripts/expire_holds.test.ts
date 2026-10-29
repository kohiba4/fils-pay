import assert from "node:assert/strict";
import { test } from "node:test";
import { EXPIRE_HOLDS_SQL } from "./expire_holds.js";
import { buildDelete } from "./lib/sqlFilter.js";

// Replaces the old tests that asserted the exact `DELETE FROM holds WHERE id = ANY(...)` text:
// they locked in deleting holds, which the docs say never happens (AUD-011).
test("expiry is one atomic UPDATE scoped to active, past-due holds, never a DELETE", () => {
  assert.match(EXPIRE_HOLDS_SQL, /^UPDATE holds/);
  assert.doesNotMatch(EXPIRE_HOLDS_SQL, /DELETE/i);
  assert.match(EXPIRE_HOLDS_SQL, /status = 'active'/);
  assert.match(EXPIRE_HOLDS_SQL, /expires_at < now\(\)/);
});

test("buildDelete still scopes to the ids it is handed", () => {
  const ids = ["11111111-1111-1111-1111-111111111111"];
  const { text, values } = buildDelete("holds", { id: ids });
  assert.equal(text, "DELETE FROM holds WHERE id = ANY($1::uuid[])");
  assert.deepEqual(values, [ids]);
});

test("buildDelete refuses an unfiltered DELETE (empty, null or undefined filters)", () => {
  assert.throws(() => buildDelete("holds", { id: [] }), /unfiltered DELETE/);
  assert.throws(() => buildDelete("holds", {}), /unfiltered DELETE/);
  assert.throws(() => buildDelete("holds", { id: null, merchant_id: undefined }), /unfiltered DELETE/);
});
