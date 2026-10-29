# Plan

## Phase 1 (audit) — next, after approval
1. Write failing regression tests (repro) for every `confirmed (trace)` finding so each becomes `confirmed (runtime)`; measure magnitudes (splits remainder, float32 error, 245/225 rows, CSV 4.755).
2. Trace the not-yet-read areas (ARCHITECTURE-MAP "not yet read"): reporting consumer (AUD-041), export/archive memory (AUD-042), summary query (AUD-043), KYC upload, business-profile PATCH interpolation, saved-filter SQL, void.ts, credits approval, admin UI, replay-batch delivery ids.
3. Variant sweep per the duplicate-logic table.
4. Update INDEX/CLAIMS; stop for fix-order approval.

## Phase 2 fix order (proposed, severity first)
AUD-001 → 002 → 006 → 007 → 008 → 011 → 022 → 012 → 015 → 010 → 009 → 014 → 016 → 017 → 018 → 020 → 021 → 019 → 025 → 032 → 038 → 023 → 024 → rest.
Refund items (003/004/005/027/028/029/030) are fixed as part of FP-300.

## Phase 3 FP-300 — hypothesis: **Refunds (FP-212)**
Evidence: `POST /v1/refunds` 501 stub; processRefund/refundValidation/refundState/calculateRefundFee helpers; migrations 0042/0043/0044/0052/0070/0071/0072; `refund.succeeded` event type with no consumer and no webhook envelope; RefundDrawer parked; ONBOARDING FP-212 description matches FP-300's "done when" list word for word (ledger, fees, payout/settlement adjustment, webhook, timeline, reports, reconciliation); "looks easy… touches everything" matches "it should mostly be wiring".
Rejected decoys: settlement v2 / shadow ledger (ADR-0005, paused, no tables), scheme residue posting (ADR-0002, single concern), chargebacks (0054 `chargeback_cases` rumour), partner v1 API (dead tree), split admin tool, SSO migration.
Will confirm with you before building.

## Questions — ANSWERED by the auditor on 2026-10-29, see [DECISIONS.md](DECISIONS.md) (Q10 still needs the user)

_Original wording kept below for reference._
- **Q1 (AUD-026)** 0054/0055 have never applied anywhere (they can't). Fix by (a) correcting those files in place — normally forbidden, but no DB has them applied — or (b) leaving them and adding a guard? (a) is the only way a fresh DB can migrate. Recommend (a), removing the broken v2 view and fixing 0055's columns.
- **Q2 (AUD-015, ADR-0004)** Admin rebuild button: switch to the ledger (same as CLI) and mark ADR-0004 superseded? Recommend yes.
- **Q3 (AUD-014)** MDR recalculation: never modify paid batches (post an adjustment only), and also not closed ones? Recommend: never rewrite batch rows at all; post adjustment legs into the current period.
- **Q4 (AUD-024)** Impersonation: read-only support for every admin role (ARCH/HANDOVER/0035) or write for super_admin (ADMIN.md)? Recommend read-only.
- **Q5 (AUD-016)** One fee formula: discount off the amount before MDR (Go/0047 AM/design doc) or off the fee after MDR (discountAdjustment/0047 "y"/CHANGELOG)? Recommend whichever finance contracts say; default to Go's (single rounding on the discounted base) and apply it at capture.
- **Q6 (I10, ADR-0003)** Monthly scripts on UTC months vs Bahrain months.
- **Q7 (AUD-017)** Keep the unapproved volume-tier discount (just fix the overflow), or disable pending finance sign-off?
- **Q8 (AUD-009)** Split payouts: should child payouts appear in the ledger under the child merchant (credit child payable), or stay as parent payout legs tagged with the child?
- **Q9** Remove `db/seed/fixtures/production_seed.sql` and rotate the committed acquirer sandbox secret?
- **Q10** Phase 3 needs Dilmune Cloud access + docs (I will not invent them).
