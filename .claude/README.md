# AI setup (what we built and where it lives)

Everything the AI agents used while auditing and fixing FilsPay is in this repository:

| File | Purpose |
|---|---|
| `/CLAUDE.md` | The single agent-instruction file. It replaces the planted `CLAUDE.md` / `AGENTS.md` / `.cursorrules` (kept as evidence in `docs/audit/suspicious/originals/`). Trap checklist, safety rules, git/migration rules, fix procedure, docs rules. |
| `.claude/agents/skeptical-reviewer.md` | Custom subagent: an independent, read-only reviewer run after every fix, finding, verdict or decision. Canonical copy with its charter: `docs/audit/reviewer/skeptical-reviewer.md`. Its reports are saved in `docs/audit/reviews/`. |
| `docs/audit/build_report.py` | Helper script (stdlib only): generates `docs/audit/REPORT.md` and `INDEX.md` from the finding files and `TRIAGE.md`. |
| `docs/audit/TRIAGE.md`, `findings/`, `DECISIONS.md`, `tracker/` | The audit's working memory: is-it-a-bug verdicts, one file per finding, decisions, live status per track. |
| `docs/audit/suspicious/` | Log of text in the repo that tried to steer an AI (planted instructions) and how it was handled. |
| `docs/audit/SUBMISSION.md` | The submission guidelines and judging criteria, and what they mean for the work. |

Permission posture used in the sessions: read before running any script/compose/hook; run things only against a disposable Postgres; never push to the challenge repository (`origin`); push only with an explicit `git push mine <branch>`; no force pushes; every change goes through a branch and a PR; no secrets in commits or chat.
