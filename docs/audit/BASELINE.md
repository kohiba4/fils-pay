# Baseline (2026-10-29, branch audit/fixes @ 8b58b0f, before any change)

## Environment
- Node 22.14, Go 1.27, Docker 29. `npm ci` (lockfile, registry.npmjs.org only), `go mod download`.
- Disposable Postgres: `docker run --name filspay-audit-pg -p 127.0.0.1:55432:5432 postgres:16-alpine`
  with a random password (scratchpad only, not committed). **Not** `ops/docker-compose.yml`:
  its Dockerfiles don't exist and it publishes 0.0.0.0:5432 with a default password.
- Throwaway `WEBHOOK_SECRET_ENCRYPTION_KEY` (random 32 bytes) required — built-in dev key is 34 bytes.

## Migrate / seed
- `npm run migrate` on an empty DB **fails at 0054_views.sql** (`settlement_batch_events` missing). See AUD-026.
- Scratch-only workaround in the disposable DB (not in repo): created `merchant_payable_position`
  and `v_active_api_keys` views, marked 0054/0055 applied; 0056–0072 then applied.
- `npm run seed`: 8 merchants, 2105 transactions, 6210 ledger entries, 68 batches; all 5 REAL self-checks pass. Seed prints raw API keys (AUD-045).

## Tests
| Suite | Result |
|---|---|
| packages/events | 4/4 pass (FH note: mock-based, no real pg) |
| packages/money | 40/40 pass (assert correct behaviour — R-01) |
| apps/api | 350/362 — **12 fail**: 11 refund tests (`chk_refunds_reason_not_null`, AUD-027), 1 dispatcher backoff (jitter, AUD-044) |
| apps/reporting | 7/11 — **4 fail**: `merchant_id` null in merchant_daily_volume (AUD-041) |
| apps/web | 8/8 pass |
| scripts | not reached (npm stops after workspace failures) — to run separately |
| Go settlement (`DATABASE_URL` set) | all packages `ok`, 0 skips. Without DATABASE_URL every DB test **skips** and still reports ok |

## Tests that encode suspicious behaviour (do not trust as spec)
- `apps/settlement/internal/settlement/window_utc_compat_test.go` ("locks in current behaviour, don't ask")
- `apps/settlement/internal/money/rounding_drift_test.go`, `packages/money/src/*_legacy|compat|drift*.test.ts` (these assert *correct* math despite names)
- adjustment import tests expecting 475 for "4.75" (per commit 9567ea0) — to confirm in Phase 1
- `processRefund.test.ts:466` TODO cross-merchant case never written; `initiateMerchantRefund.test.ts:171` deleted test
- `transactions.test.ts` asserts `POST /v1/refunds` → 501 (will change with FP-300)
