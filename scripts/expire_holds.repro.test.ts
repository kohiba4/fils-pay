import assert from "node:assert/strict";
import { test } from "node:test";
import { buildExpiredHoldsDelete } from "./expire_holds.js";

// AUD-011: with nothing expired the statement must never become an
// unconditional `DELETE FROM holds`.
test("AUD-011: an empty expired set must not produce an unconditional DELETE", () => {
  const { text } = buildExpiredHoldsDelete([]);
  assert.ok(!/^DELETE FROM holds\s*$/.test(text.trim()), `unconditional delete built: "${text}"`);
});
