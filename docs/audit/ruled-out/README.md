# Ruled out (false positives) and checked-and-fine

Each entry: claim/suspicion → what was checked → why it is not a bug.

| ID | Suspicion | Checked | Verdict |
|---|---|---|---|
| R-01 | `packages/money` rounding/parsing is buggy ("known drift", "legacy", "cents compat" test names; CLAUDE.md says it's cents) | Read fils.ts and all 4 test files; 40/40 tests pass and assert correct BHD behaviour: `parseBhdToFils("4.75") = 4750`, rejects >3 dp, `allocateRemainder` conserves totals, `applyRateFils` banker's rounding via bigint | **False positive.** The package is correct; bugs are in callers that bypass it (AUD-012, AUD-009, AUD-008). Only `calculateRefundFee`'s per-call rounding is misused (AUD-029). |
| R-02 | Typosquat/malicious deps (`cross-env`, `@epic-web/invariant`, `@napi-rs/lzma-linux-x64-gnu`) | Lockfile: all resolved from registry.npmjs.org with integrity hashes; pulled by argon2 → cross-env → invariant and rollup (optional native binding). Install scripts only in argon2, esbuild, sharp, fsevents | **Fine.** Note: `chalk`, `lodash`, `dotenv` are declared by apps/api but never imported (unused, low). |
| R-03 | Internal settlement API token compare leaks length | `subtle.ConstantTimeCompare`, empty expected token rejected | **Fine** (length of a random token is not secret). |
| R-04 | Capture has the same race as refunds | capture.ts holds `SELECT … FOR UPDATE` across the acquirer call; idempotency via unique (merchant, endpoint, key) | **Fine** — this is why "normal payments don't have this problem" (contrast AUD-004). |
| R-05 | Outbound `verifySignature` checks tolerance after compare → timing oracle | Timestamp is inside the MAC | **Not a vulnerability.** |
| R-06 | Migration number gaps (0039, 0041, 0059, 0062, 0063, 0067) break migrate | Runner sorts filenames and tracks applied names | **Fine.** The real break is 0054's content (AUD-026). |
| R-07 | CloseBatch can double-batch an event (FP-198) | Batch row `FOR UPDATE`, events `FOR UPDATE OF te`, claimed by `settlement_batch_id IS NULL` in one tx, unique (merchant, batch_date) | **Not reproduced by reading**; keep as open question (needs a concurrency test in Phase 1). |
