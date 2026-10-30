# Submission guidelines and judging criteria (source: FilsPay_Submission_Guidelines.pdf, read 2026-10-30)

**Deadline: Friday 2026-10-30, 23:00 (Bahrain). Nothing can change after that: code, server, documents, slides.**
The submission link is shared later.

## What to submit (4 items)
1. **Submission document**: one PDF `TeamName_FilsPay_Submission.pdf` (structure below).
2. **Slide deck**: one PDF `TeamName_FilsPay_Slides.pdf` (4-minute pitch if the team qualifies for the final).
3. **Repository link**: our **own PUBLIC fork** of the challenge repository (`MJ5-byte/fils-pay`). The last version saved before 23:00 is judged. It must include the **AI setup files**: agent instructions, custom commands, tool configuration, permission rules and helper scripts.
4. **Live deployment**: the running server, reachable until judging ends. URLs go on the cover page.

## Submission document structure (same order, same headings)
- **Cover page:** team name, members and what each owned; live URLs (checkout, merchant dashboard, admin console, public API); link to the public fork and the ID of the last commit before the deadline.
- **1. Summary** (half a page): what we found, fixed, left alone, the main root cause.
- **2. Architecture and deployment:** diagram of every service and port and which face the internet; the ONE command (or IaC) to redeploy; where secrets come from; health checks, restart policies, how a redeploy avoids interrupting a settlement run.
- **3. Capacity:** our estimate of simulated users on the fixed scenario; our own load test (tool, method, results); where the bottleneck is; how the stack turns away excess load and recovers.
- **4. Findings report:** per finding: symptom, how found and reproduced, root cause, fix, how verified (test/query/repro), effect on existing data. Then **Root causes** (group findings sharing a cause, explain the design decision) and **Decisions and open risks** (what we chose not to change or run, why, the safeguard we'd propose, what is unresolved).
- **5. UI and UX changes:** each change: what, why it mattered, before and after screenshots (link any recording).
- **6. AI usage:** setup (what we built and where it lives in the repo); **three annotated transcript excerpts**, each with: the finding it supports, our prompt and the context/tools the AI had, the relevant part of the AI's answer, how we verified it and what that showed, what we changed. **At least one excerpt must show the AI being wrong and how we noticed.**
- **Appendix (optional):** queries, test output, logs, load test graphs.

## How we are judged (170 points)
| Area | Pts | What it means |
|---|---|---|
| Correctness | 100 | Load testing, a security review, hidden regression tests and a written findings report explaining the root cause of each problem. |
| Capacity | 20 | They load test the live server with a fixed checkout scenario and measure how many users it serves while staying fast and correct. Send our own estimate (an accurate one earns points). Then they push past the limit: does the stack turn away the excess, restart itself and recover without losing data. |
| Hosting architecture | 10 | Live, secure and reproducible. Whole stack on ONE server with 1 vCPU and 2 GB RAM; **the API is limited to 0.5 vCPU and 512 MB**. |
| AI usage and setup | 10 | AI setup files in the repo + three annotated transcript excerpts. They care how we checked what the AI told us, not how much we used it. |
| UI and UX | 10 | Checkout, the merchant dashboard and the admin console. Bring before and after evidence. |
| Technical defence | 20 | The whole team meets the judges and presents from the slide deck, then judges ask technical questions and choose who answers. Anything we can't explain or show working doesn't score. |

## Semi-final / final
- Semi-final: 15 min with a judge in one of five rooms. The judge first receives the results of the automated tests run on our website. We have 2-3 min to explain key findings and briefly show the site; the judge spends the rest evaluating against the criteria.
- Final (if qualified): 4 min pitch + 7 min questions. No extra time.
- Recommended slides: Team; Root cause (one sentence + the symptoms it explains); Key findings (top 3-4 ranked by impact, one line of evidence each); Fixes and proof; **Live demo: a full and a partial refund end to end, with correct amounts in the dashboard and the settlement report** (have screenshots ready); Under load (architecture, estimated vs measured capacity, overload handling); How we used AI (setup in one line + one time the AI was wrong and how we caught it); Decisions and open risks. Appendix is not presented.

## Checklist before 23:00
1. All code in our own **public fork**, and that link is what we submit.
2. Both PDFs named correctly; cover page has live URLs, fork link, last commit ID.
3. Server up, live links open, stays reachable.
4. (Section 5 of the guidelines: if work was done in a local copy, fork the challenge repo first, then move the work across, keeping history, never force push.)

## What this means for the work (decisions taken against the criteria)
- **Refunds must work live** (the slide deck demo: full and partial refund, dashboard and settlement report): `REFUNDS_ENABLED=true` on the demo server; Q13 (negative net) goes in "Decisions and open risks".
- **Hosting:** one server, systemd units with `Restart=always`; API unit capped at `CPUQuota=50%` and `MemoryMax=512M`; one redeploy script in the repo; secrets generated on the server, not in git; migrations run before restart; the settlement daemon is stopped only between runs.
- **Capacity:** nginx request/connection limits so excess load gets 429/503 instead of memory growth; own load test script in the repo with results.
- **AI setup files** must be tracked in git (`.claude/` was git-ignored: fixed in the same change that adds this file).
- **Findings report** is generated: `docs/audit/REPORT.md` (see build_report.py).
