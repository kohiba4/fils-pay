# AUD-042 — Unbounded memory in exports/archives (large export DoS)

| Field | Value |
|---|---|
| Owner | B |
| Severity | **Medium** |
| Category | DoS |
| Status | fix ready, not merged (measured and verified locally on 55433; review pending) |
| Fix commit | uncommitted on local branch fix/AUD-046-024-merchant-write-authority (stack); patch stack/18-AUD-042.patch |

## Summary
Unbounded memory in exports/archives (large export DoS).

## Location
apps/api/src/transactions/exportCsv.ts, webhooks/archiveReplay.ts, 0068

**Sibling locations checked:** CHANGELOG says export streams; AGENTS.md says it buffers deliberately.

## Root cause
To verify in Phase 1.

## Reproduction / evidence
—

## Impact
OOM on 512 MB container.

## Fix (proposed)
TBD.

## Fix (applied, Track B, 2026-10-30)
Discovered in the Phase 0 team audit unless stated; repaired here. Base `main` af8e9c9, uncommitted working tree in `~/Desktop/hakathons/fils-pay-hackathon`; patch `~/Desktop/hakathons/track-b-patches/stack/18-AUD-042.patch`.
**Verdict: BUG (runtime, measured), both paths.** Container budget per ARCHITECTURE: 512 MB.
Measurement script (outside the repo: `~/Desktop/hakathons/track-b-patches/evidence/measure_export.mts`, `measure_archive.mts`, with their outputs) runs the real app
on 127.0.0.1 with a disposable 55433 DB and samples RSS every 5 ms.
- Transaction export, 300,000 rows of one merchant (28.3 MB CSV) over a real HTTP socket:
  `main` peak RSS **476.5 MB (+371 MB)**; after the change **132.8 MB (+33 MB)**, same 300,000 lines, 2.3 s → 1.4 s.
- Webhook archive, 100,000 deliveries of one endpoint (admin-only): **+268.6 MB RSS** on `main` (one in-memory JSON
  document, migration 0068's design). About 190,000 deliveries in one range would exceed the budget and take the API
  down for every merchant.

**Changes.**
- `transactions/exportCsv.ts`: `iterateTransactionsExportCsv` streams keyset pages of 1,000 rows ordered by
  `(occurred_at, id)` (Postgres text timestamps as the cursor, so microsecond ties are exact). Byte-identical format.
  Each page is a short query, so an abandoned download holds no connection; Fastify pulls the `Readable` (backpressure).
  `buildTransactionsExportCsv` is kept and now collects the stream. Ordering gains a deterministic `id` tiebreak.
- `routes/transactions.ts` sends `Readable.from(iterate…)` (only this route; merchant scope from auth, unchanged).
- `webhooks/archiveReplay.ts`: counts the range first; above `ARCHIVE_MAX_DELIVERIES = 20,000` (≈ 55 MB by the measured
  rate) it returns **422 `archive_range_too_large`** and writes nothing; the admin archives in smaller ranges. The archive
  document format is unchanged. A streamed/chunked archive would need a schema change (not done).

**Tests:** `transactions/exportCsv.test.ts` gains `AUD-042: the streamed export crosses page boundaries without losing or
repeating rows, even on timestamp ties` (2,001 rows on 3 microsecond-apart timestamps, 3+ pages, order equals the DB's,
other merchant excluded); `webhooks/archiveReplay.test.ts` gains `AUD-042: an archive range larger than the cap is refused
with 422 and writes nothing`. Existing export tests (format, filters, escaping) pass unchanged. Export + transactions
15/15 before adding, 6/6 export file after; archive + admin 82/82. **Tests changed:** none.

## Re-attack notes
- Export: page-edge ties, filters and tenant scope preserved; memory now bounded by one page, not the range.
- Archive: refused above the cap with no partial row. **Remaining:** replaying an archive still loads its whole JSON
  (bounded by the cap for new archives; archives created before this change could be larger). A row-per-delivery archive
  table would remove the cap; that is a schema decision.
- Not measured: client disconnect mid-export (by construction the generator stops when the stream is destroyed; no test).
- Independent skeptical review: **pending**.

## Related
—
