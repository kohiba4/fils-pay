# Invariants checklist (from ADRs, brief and ARCHITECTURE)

✅ holds · ❌ violated (finding) · ⚠ partially · ❓ not yet verified

| # | Invariant | Source | Status | Where it breaks |
|---|---|---|---|---|
| I1 | Every money value is an integer number of fils | ADR-0001 §1 | ❌ | float32 net payout (AUD-008), REAL estimate (AUD-033), float fee estimate in reconciliation (AUD-016), float64 scheme amount (AUD-010) |
| I2 | Money columns end `_fils` and are BIGINT | ADR-0001 §1 | ❌ | 0040 REAL (AUD-033), 0050 NUMERIC(10,2); 0049 INTEGER fixed to BIGINT by migration 0074 (AUD-017) |
| I3 | TS uses `Fils`, Go uses `money.Fils` (int64) | ADR-0001 §2 | ⚠ | many `number` casts; Go int32 counter |
| I4 | Text input parsed with `parseBhdToFils` | ADR-0001 §3 | ❌ | CSV import (AUD-012), promo discount parser |
| I5 | Rates in bps applied with `applyRateFils`, one rounding, half-even | ADR-0001 §4 | ❌ | v1 half-up, `estimateFeeFils` float, double rounding in discount (AUD-016) |
| I6 | Only the scheme file has 2-decimal figures, by truncation | ADR-0001 §5, ADR-0002 | ❌ | `amount` rounded half-up (AUD-010) |
| I7 | Scheme residue journaled per line at export | ADR-0002 | ❌ | not implemented (R3) |
| I8 | Scheme `amount` = `amount_fils/1000` exactly | ADR-0002 consequences | ❌ | AUD-010 |
| I9 | Daily windows = Asia/Bahrain business day | ADR-0003, brief | ⚠ | window OK; daemon "today" is UTC (AUD-025) |
| I10 | Monthly finance windows = UTC month | ADR-0003 | ⚠ | Contradicts brief/YA; **conflict — ask** |
| I11 | Balance cache rebuild: button reads settled data | ADR-0004 | conflict | Contradicts HANDOVER & ledger-as-truth; causes AUD-015 — **ask** |
| I12 | 0054–0056 reserved for settlement v2, never reused | ADR-0005 | ❌ | 0054/0055/0056 exist on main (AUD-026) |
| I13 | Adjust balance is cache-only, no ledger entry | ADR-0006 | ✅ code / ❌ ADMIN.md says journaled | AUD-037 |
| I14 | Ledger groups balance (debits = credits) | 0007, ARCH | ✅ (seed check passes) | — |
| I15 | Ledger is append-only | 0007, ARCH | ❌ before; ✅ since migration 0076 for UPDATE/DELETE (TRUNCATE, table owner and superuser can still bypass) | AUD-034 |
| I16 | Outbox row in same tx as the business write | ARCH | ⚠ | `EnqueuePayoutNotifications` writes outside the payout tx (AUD-018) |
| I17 | Webhook HMAC-SHA256 over what is sent; Delivery-Id stable | ARCH | ❌ | AUD-020; replay-batch new ids (to verify) |
| I18 | Pending session grants nothing until OTP | ARCH, 0012, 0033 | ❌ | AUD-001 |
| I19 | Merchant queries take merchant from auth context | ARCH | ❌ | AUD-003, AUD-022 |
| I20 | Payment links single-use, server clock, 128-bit tokens | ARCH, 0020 | ❌ | AUD-006, AUD-007 (tokens ✅) |
| I21 | Admin roles checked server-side per route | ARCH, 0031 | ⚠ | AUD-024 |
| I22 | Closed and paid batches are left alone | ARCH, brief item 02 | ❌ | AUD-014 |
| I23 | Fees per capture event at rate in force at event time | ARCH, 0048 | ⚠ | recalc uses current mdr_bps (AUD-014), display by created_at (AUD-031) |
| I24 | Test-mode merchants never settle | 0002 | ❌ | AUD-032 |
| I25 | Callbacks deduplicated before applying | ARCH §5 (per postmortem), HANDOVER | ❌ | AUD-019 |
| I26 | Credits above threshold need a *different* second approver | ARCH | ⚠ | display-name compare (AUD-039) |
| I27 | Holds are never deleted | HANDOVER | ❌ | AUD-011 |

## ADR conflicts to decide (see PLAN.md questions)
- ADR-0003 (UTC month) vs brief/HANDOVER/YA (Bahrain day everywhere compared to batches).
- ADR-0004 (button from settled data) vs HANDOVER/ARCH (ledger is the record; button must not read anything else).
- ADR-0005 (0054–0056 reserved) vs the repo (they exist, broken).
- ADR-0006 vs ADMIN.md (journaled?).
- ADR-0002 "implemented" vs code (not implemented).
