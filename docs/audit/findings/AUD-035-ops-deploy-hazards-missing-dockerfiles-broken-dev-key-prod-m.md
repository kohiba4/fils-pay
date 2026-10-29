# AUD-035 — Ops/deploy hazards: missing Dockerfiles, broken dev key, prod mode without token, exposed DB, committed secret

| Field | Value |
|---|---|
| Severity | **Medium** |
| Category | ops / secrets |
| Status | confirmed (runtime + read) |
| Fix commit | — (not fixed; Phase 2) |

## Summary
Ops/deploy hazards: missing Dockerfiles, broken dev key, prod mode without token, exposed DB, committed secret.

## Location
ops/docker-compose.yml, ops/.env.docker, apps/api/src/config.ts:207

**Sibling locations checked:** Settlement requires SETTLEMENT_INTERNAL_TOKEN for daemon; compose sets none.

## Root cause
(a) `ops/Dockerfile.node|go` don't exist → compose cannot build. (b) DEV_FALLBACK_WEBHOOK_KEY decodes to 34 bytes → API/seed crash without a key. (c) .env.docker sets NODE_ENV=production but no SETTLEMENT_INTERNAL_TOKEN → API refuses to boot. (d) Postgres published on 0.0.0.0:5432 with default password, sslmode=disable. (e) Acquirer sandbox signing secret committed (file is NOT gitignored despite the comment).

## Reproduction / evidence
Baseline run (b); read (a,c,d,e).

## Impact
`docker compose up` from the brief does not work; secret exposure.

## Fix (proposed)
Phase 3 deploy work; rotate the sandbox secret.

## Re-attack notes
_To be filled after the fix (bypass via other route / tenant / retry / concurrency)._

## Related
AUD-026
