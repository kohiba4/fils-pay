# Phase 1 — Track A verification and proposed fix order

Repro tests live on branch **`a/phase1-repros`** (intentionally failing; not merged into
`audit/fixes`). Each test is committed with its fix in Phase 2.

## Verification status
| Finding | Result | Evidence |
|---|---|---|
| AUD-008 float32 net | confirmed (runtime) | Go test; up to 59 fils off, -1 fil at 20,000 BD |
| AUD-009 splits | confirmed (runtime) | net 1001 → 1000 allocated; ±1 fil, both directions |
| AUD-010 scheme `amount` | confirmed (runtime) | 93.279 → file 93.28 vs fils 93270 |
| AUD-011 expire_holds | confirmed (runtime) | empty set → `DELETE FROM holds` |
| AUD-012 CSV import | confirmed (runtime) | 4.75 → 475, 12 → 1200, 4.7555 accepted |
| AUD-013 March script | confirmed (runtime) | second run doubles posting (170 → 340 fils) |
| AUD-014 recalc paid batch | confirmed (runtime) | paid net 97500 → 96000 |
| AUD-015 admin rebuild | confirmed (runtime) | cache 0 vs ledger 975,000; seed Alpha 7.3M vs 136.5M |
| AUD-017 counter | confirmed (runtime) | wraps to −2,146,967,296 |
| AUD-018 duplicate notifications | confirmed (runtime) | 35–37 of 40 batches duplicated; no unique index exists |
| AUD-026 migrations | confirmed (runtime) | fresh migrate fails at 0054 |
| AUD-031 fee display | confirmed (runtime) | shows 245, charges 225 |
| AUD-034 ledger delete | confirmed (runtime) | whole balanced group deleted and committed |
| AUD-016 fee formula | confirmed (trace + numbers) | needs capture-level integration test in Phase 2 |
| AUD-025 close at 03:15 | confirmed (trace) | worked example; needs a clock seam to test |
| AUD-033, 036, 037, 045 | trace only | low priority |

## Existing tests that ENCODE bugs (to change in the fix commit, with justification)
- `apps/api/src/admin/adjustmentImport.test.ts:61-67` — asserts 600 total / 475 / 125 fils for 4.75 / 1.25 BD (AUD-012).
- `apps/api/src/routes/adminAdjustmentImport.test.ts:236-238` — comment claims "4.75 → 475 … 1250 fils = 12.50 BD" (false: 1250 fils = 1.250 BD).
- `apps/api/src/fees/currentFeeScheduleDisplay.test.ts:71-82` — "backfilled row wins" (AUD-031).
- `apps/settlement/internal/settlement/recalculate_mdr_test.go` — only closed batches, fine, but needs a paid-batch case.
- `apps/settlement/internal/settlement/window_utc_compat_test.go` — asserts correct Bahrain window (OK), name misleading.
- `scripts/expire_holds.test.ts` — never tests the empty case.
None of these is deleted or weakened; each is corrected so it asserts the right behaviour.

## Proposed fix order (Track A)
1. **AUD-026** broken migrations 0054/0055 (blocks fresh DB; add "migrate from empty" check)
2. **AUD-008** float32 payout → integer subtraction
3. **AUD-011** `expire_holds` empty-set delete (and UPDATE→expired as documented)
4. **AUD-012** CSV import via `parseBhdToFils` (+ fix encoded tests; then AUD-036 duplicate-submit guard)
5. **AUD-015** admin rebuild reads the ledger (single query, row locks) + ADR-0007
6. **AUD-010** scheme `amount` from truncated fils
7. **AUD-009** exact split allocation + weight guard
8. **AUD-018** unique index + `ON CONFLICT` claim for `settlement.paid` (migration 0075) — see coordination note
9. **AUD-014** recalc: never rewrite paid batches
10. **AUD-016** one fee formula at capture (see coordination note)
11. **AUD-017** BIGINT counter (migration 0074) / int64
12. **AUD-025**, **AUD-031**, **AUD-034** (immutability trigger, migration 0076), **AUD-013** (script: dry-run default, idempotent key, correct legs, Bahrain window), **AUD-033/037/045**

Migrations reserved for A: 0073–0079.

## Coordination points with Track B (shared files)
- `apps/api/src/routes/transactions.ts`: B adds role gates to capture/void (AUD-046); A removes the post-commit `applyCaptureDiscountAdjustment` call (AUD-016). Different lines, but same file → whoever merges second rebases; A should do AUD-016 after B's AUD-046 merges.
- `apps/api/src/webhooks/dispatcher.ts` + `payoutDisbursement.ts` (B owns): AUD-018's second half (duplicate `settlement_payout_disbursements` written once per delivery row, incl. replays). A adds the unique index/migration; B changes the dispatcher call. Agree before touching.
- `apps/api/src/payments/capture.ts` (A) vs `paymentLinks/pay.ts` (B): AUD-016 fixes the fee inside capture so pay.ts needs no change.
