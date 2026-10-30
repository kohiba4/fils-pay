import assert from "node:assert/strict";
import test from "node:test";
import { wrapFocusIndex } from "./focus.js";
import { humanize, initial, splitAmount } from "./text.js";

/**
 * The pure logic the design system's behaviour depends on. Rendering is
 * verified in the browser; these pin the rules a refactor could quietly
 * break: focus never escapes a dialog, enum labels stay readable, and the
 * money text from the shared formatter is split for styling, never altered.
 */

test("wrapFocusIndex keeps Tab inside a dialog", () => {
  // Tab on the last control wraps to the first; Shift+Tab on the first wraps to the last.
  assert.equal(wrapFocusIndex(2, 3, false), 0);
  assert.equal(wrapFocusIndex(0, 3, true), 2);
  // Moves inside the list are left to the browser.
  assert.equal(wrapFocusIndex(0, 3, false), null);
  assert.equal(wrapFocusIndex(2, 3, true), null);
  // Focus outside the container (e.g. on the panel itself) is pulled in.
  assert.equal(wrapFocusIndex(-1, 3, false), 0);
  assert.equal(wrapFocusIndex(-1, 3, true), 2);
  // Nothing focusable: no target.
  assert.equal(wrapFocusIndex(-1, 0, false), null);
});

test("humanize turns backend enums into sentence-case labels", () => {
  assert.equal(humanize("partially_captured"), "Partially captured");
  assert.equal(humanize("pending_approval"), "Pending approval");
  assert.equal(humanize("paid"), "Paid");
  assert.equal(humanize("super_admin"), "Super admin");
  assert.equal(humanize(""), "");
});

test("splitAmount separates the unit without touching the digits", () => {
  assert.deepEqual(splitAmount("1234.567 BHD"), { amount: "1234.567", unit: "BHD" });
  assert.deepEqual(splitAmount("-0.001 BHD"), { amount: "-0.001", unit: "BHD" });
  assert.deepEqual(splitAmount("0.000"), { amount: "0.000", unit: "" });
});

test("initial picks the first visible character for avatars", () => {
  assert.equal(initial("coral Bay Traders"), "C");
  assert.equal(initial("  "), "?");
  assert.equal(initial(null), "?");
});
