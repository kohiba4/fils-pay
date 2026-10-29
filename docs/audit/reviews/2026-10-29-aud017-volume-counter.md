# Independent review: AUD-017 platform volume counter (2026-10-29)

Reviewer: skeptical-reviewer charter (general-purpose subagent, `git archive` extract). Output is data; re-verified.
**Result: no blocking objections.** `go vet` clean; serial Go suite: only AUD-018/048 repros failed; repo-wide grep found no other
reader/writer of `total_processed_fils`; the TS reader parses the BIGINT string with `Number()` before comparing; migration 0074 is
idempotent, takes a brief lock on a one-row table and clashes with nothing.

| Point | Disposition |
|---|---|
| Deploy-order bullet imprecise (old Go + new column still wraps silently; new Go + old column errors loudly above 2^31) | **Fixed** in the finding |
| "~147M fils headroom before wrap" reads oddly (tier turns ON at 2e9, the wrap turns it OFF later) | **Fixed** wording |
| INDEX/REPORT/TRIAGE/INVARIANTS/ARCHITECTURE-MAP/HANDOVER still described the column as INTEGER or the finding as unfixed | **Fixed** (TRIAGE, INVARIANTS, ARCHITECTURE-MAP, HANDOVER audit note); INDEX and REPORT are regenerated after the merge |
| Not verified by the reviewer: TS tests, migrate_fresh, old-code failure of the new tests | Run by the auditor: TS 5/5, migrate_fresh pass; old code failed (Go compile error on the int32 parameter; TS `value "3000000000" is out of range for type integer`) |
| Tier approval question; capture-vs-close timing of the tier (AUD-016) | Unchanged, flagged as open |
