# BRIEF — transcription of the four photographed brief pages

Transcribed by the auditor from the images supplied in chat on 2026-10-29.
Decorative content (sponsor strip: BBK, AUBH, reboot01, Hope Events,
"HOSTED BY DILMUNE"; coffee-ring stains; paperclips) is omitted.
`[?]` marks anything I could not read with confidence.

Legend: **[stamp]** rubber stamp · **[hand]** handwritten (red ink) ·
**[circled]/[underlined]** printed text marked by hand.

---

## Item 01 — Security & Code Audit, Onboarding Briefing

Header: `THE HANDOVER / CASE FILE` · FilsPay · **[stamp] CONFIDENTIAL**
Evidence tag: CASE NO. `000` · ITEM `01` · COLLECTED **[hand]** `29.10.26`
(last digit partly cut off at the page edge — reads as `26` `[?]`).

**SECURITY & CODE AUDIT** — ONBOARDING BRIEFING · CONFIDENTIAL

> Your job: Check FilsPay, a payment app made for Bahrain. It signs up shops,
> takes card payments, and pays the shops their money. Everything is in
> Bahraini Dinar (BD). 1 BD = 1000 fils.

WHAT YOU NEED TO DO

| # | Task | Text |
|---|---|---|
| 01 | AUDIT | Find security holes, money bugs and anything that breaks. |
| 02 | FIX | Fix each bug with the smallest change that works. |
| 03 | EXPLAIN | For each bug, write a short note: what's wrong, why, and what it breaks. |
| 04 | BUILD | Finish the missing feature and host it on Dilmune Cloud. See the back. |

THE REPO

| Path | Description |
|---|---|
| apps/api/ | TypeScript/Fastify API (auth, payments, webhooks, admin) |
| apps/settlement/ | Go daemon (batch close, scheme export, splits, payouts) |
| apps/reporting/ | TypeScript consumer (outbox events to rollups) |
| apps/web/ | React hosted checkout |
| apps/admin/ | React admin console |
| packages/money/ | Shared integer-fils arithmetic |
| packages/events/ | Outbox event types |
| db/migrations/ | Postgres schema (numbered 0001 to 0072) |
| scripts/ | One-off operational scripts |
| ops/ | Docker compose, env files |
| docs/ | Architecture, ADRs, runbook, handover notes |

WHERE TO START
- Start with `docs/ARCHITECTURE.md` and `docs/HANDOVER.md`
- Read every ADR in `docs/adr/`. They are the rules the code should follow
- Money rule: **whole fils only, never decimals** (ADR-0001)
- Settlement closes every day at midnight, Bahrain time (UTC+3)
- Run `docker compose up` in `ops/` to start everything on your laptop

SCORING — Bigger bugs get more points, and so do clear explanations.
Explaining why a bug happens scores more than just spotting it. A small fix
that works scores more than a big rewrite.

---

## Item 02 — Finance & Ops Weekly

Header: `THE HANDOVER / CASE FILE` · FilsPay · Evidence: CASE NO. `000` ·
ITEM `02` · COLLECTED **[hand]** `29.10.26`

**FINANCE & OPS WEEKLY** — Circulated 2026-09-20. Do not distribute.

FROM: Fatima H. (Finance) · RE: Open items from the Sep 17 reconciliation review

> The numbers still don't match. I listed everything below, but nobody has
> time to check all of it before the audit. Leaving it for whoever picks this up.

- ☐ The **scheme statement** total is always a few fils higher than ours.
  It's **[circled]** "always over, never under" **[hand: arrow]**. I checked
  three months and it's the same every time. Something is rounding, but I
  can't find where.
- ☐ Related: the **March sweep script** was meant to fix the leftover gap
  for Q1. It did, but someone ran it twice on staging and the gap doubled.
  Nobody knows if it ran more than once on production. The log file only
  has one timestamp. Is it safe to run again? **[underlined]** "I wouldn't."
  (looks like printed italic, underlined by hand — could be handwritten `[?]`)
- ☐ **Split payouts** for Delta Marketplace: the three child payouts don't
  add up to the parent's total. It's small, a few tens of fils each batch,
  but it happens every batch since launch. Where do the missing fils go? I
  can't find them anywhere in the ledger.
  **[hand, left margin, level with the end of this item]** `!!`
- ☐ The **"Recalculate cached balances" button** in admin: I pressed it last
  Thursday and Alpha Retail's balance went from 135K to 7K. Yousif had to
  run the CLI rebuild to fix it. Why do the button and the CLI give
  different numbers?
- ☐ **MDR recalculation** changed batches that were already paid out. Those
  should never change. The settlement team says it only touches open
  batches, but I'm seeing changes on closed ones too.
- ☐ Support says the **fee shown in the merchant dashboard** isn't what we
  actually charge. It shows 245bps, but payments go through at 225bps. The
  two fee tables have different dates, and one was a backfill fix.
- ☐ The **CSV import** for manual changes: I uploaded 4.755 BD and the
  ledger shows 4.750. I uploaded 4.75 BD and it shows 0.475. That's ten
  times less. Something is wrong with how it reads BD amounts.
  **[hand, right margin]** `10x??`

Other things people said in the group chat. I haven't checked these:
- "The daily close is running at 3am local, not midnight"
- "Lifetime payout estimate drifts for high-volume merchants"
- "Test merchants keep showing up in the real settlement run"
- "Login works without entering the OTP code?"
- "I cancelled merchant B's payment link from merchant A's dashboard"

> I'm on leave next week. Good luck.

**[hand, bottom right]** `F.`

---

## Item 03 — Support Ticket Excerpts & Incident Notes

Header: `THE HANDOVER / CASE FILE` · FilsPay · Evidence: CASE NO. `000` ·
ITEM `03` · COLLECTED **[hand]** `29.10.26`

Redacted extract. Internal reference only. PREPARED BY ████ · SOURCE ████

| Ref | Title | Text |
|---|---|---|
| FP-187 | Payment link paid after expiry | A buyer says the link showed "expired", but the payment still went through. The checkout page sends something that the server shouldn't trust. Engineering flagged this months ago. |
| FP-201 **[stamp] REOPENED** | Duplicate notes on acquirer callbacks | The bank sent the same callback twice and we saved two identical notes on one payment. The 1.9.0 postmortem says this was fixed. **[circled]** "It wasn't." |
| FP-203 | Balance cache wrong after admin action | An admin clicked "Recalculate cached balances" and a merchant's balance dropped from 135K to 7K. The CLI tool gives the right number. The two read from different places. |
| FP-209 | Concurrent refund: double money out | Two refund requests came in at the same time. Both went through, and we lost money. Normal payments don't have this problem. So why do refunds? |
| FP-240 | Webhook signatures rejected by merchants | Some merchants can't verify our webhook signatures. The part that signs the message and the part that sends it don't agree on what it looks like. Also, someone said the incoming signature check has its own problems. |
| INCIDENT 2026-05-14 | Payment link charged twice | A slow payment let a second buyer use the same link before the first one finished. Both were charged. The code comments say "this IS reachable." |
| INCIDENT 2026-08-21 | Duplicate payout notifications | Shops got two "your payout is on the way" messages for the same payout. Two processes checked at the same time, and both thought they were first. |

**[hand, boxed list, red ink]** *things that feel wrong but nobody's filed tickets for:*
- can you refund more than what was actually charged?
- the settlement splits are always a few fils short
- some admin actions don't seem to have the right role checks
- there's a key rotation flow that doesn't do what you'd expect
- the daily close timing doesn't match what the docs say
- one of the reporting queries is suspiciously slow
- what happens to test merchants when certain admin tools run?
- the OTP implementation changed at some point. is it still safe?
- has anyone tried uploading a really large export?

---

## Back page — FP-300 "Finish the missing feature"

Header: `THE HANDOVER / CASE FILE` · FilsPay · **[stamp-style box] ASSIGNED TO YOU**
Chips: `FP-300` · `Feature` · `Priority: High` · `Status: To do` · **[stamp] UNFINISHED**

**FINISH THE MISSING FEATURE** — REQUESTED BY PRODUCT · NEVER SHIPPED

> The last developer started a feature but never finished it. Find out what
> it is, build it so it works from start to end, and host the app on
> Dilmune Cloud.

DONE WHEN
- ☐ The feature works from start to end, through the API
- ☐ The money is right in the ledger, down to the fils
- ☐ Fees and payouts come out right
- ☐ The shop gets the right webhook
- ☐ It shows up right in the timeline, the reports and reconciliation
- ☐ The app is live on Dilmune Cloud, our hosting provider

**[hand]** *"looks easy. it isn't. it touches everything."*

(Right page edge shows bleed-through fragments of the page underneath —
"bef…", "cl…", "twi…", "has…", "few", "em…" — matching item 02's text;
not content of this page.)

---

## Discrepancies between this transcription and the Phase-1 leads in the prompt

The images win in every case. Items marked ⚑ change what we look for.

| # | Lead (prompt) | Image says | Effect |
|---|---|---|---|
| D1 ⚑ | March sweep: "run more than once in prod? idempotent?" | Also: **"someone ran it twice on staging and the gap doubled"**, and it was meant to fix the gap **for Q1**, not just March | Direct evidence the script is not idempotent; the leads omit it |
| D2 | FP-187: "client-controlled data used for a server-side decision" | "sends something the server shouldn't trust. **Engineering flagged this months ago.**" | Lead wording is an interpretation; the "flagged months ago" detail is missing |
| D3 | FP-240: inbound check "constant-time compare, replay/timestamp, raw vs parsed body" | Only "someone said the incoming signature check has its own problems" | The specific sub-claims are the transcriber's, not the brief's |
| D4 ⚑ | Splits: "remainder fils vanish every batch" | "**three** child payouts", "**a few tens of fils** each batch", "every batch since launch"; the handwritten list says "a few fils short" | Magnitude differs between the two sources (tens vs few) — both recorded as claims |
| D5 ⚑ | FP-203: "135K became 7K" | Names **Alpha Retail**, "last Thursday", and "**Yousif** had to run the CLI rebuild" | HANDOVER says Yousif left 2026-04-09, but this email is dated 2026-09-20. Conflict logged in CLAIMS |
| D6 | Scheme: "always higher, never lower" | Adds "I checked three months" | — |
| D7 | Annotations "It wasn't", "always over, never under", "I wouldn't" called *handwritten* | "It wasn't." and "always over, never under" are **printed** text that is **circled** by hand; "I wouldn't." is printed italic, **underlined** (may be handwritten `[?]`). The truly handwritten marks are `!!`, `10x??`, `F.`, the red list and the FP-300 quote | Annotation hints still apply, but they are emphasis marks, not extra text |
| D8 | `!!` not placed | `!!` sits in the left margin next to the **Split payouts** item | Emphasis on splits |
| D9 | — | FP-300 quote **"looks easy. it isn't. it touches everything."** is not in the leads | Hint for FP-300 scope |
| D10 ⚑ | Item 02 "from finance" | Signed "Fatima H. (Finance)"; `docs/ONBOARDING.md` lists Fatima as **Tests/QA** and Huda as finance | Source-role inconsistency; logged as a claim |
| D11 | Incident 05-14 lead matches | Image: "slow payment let a **second buyer**…" | Contradicts the repo postmortem (blames duplicate callbacks) — the image matches the code (see AUD-006) |

No other differences: the 9-item "things that feel wrong" list matches the
leads item for item.
