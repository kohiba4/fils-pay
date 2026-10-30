Final configuration, load generator on the server, public HTTPS URL, 20 s per level. "Turned away" = 503 from the overload policy. Latencies are for the calls that were admitted.

| virtual users | checkouts/s | calls/s | authorize p50 / p95 ms | capture p50 / p95 ms | turned away | API CPU (of 0.5) | API memory |
|---:|---:|---:|---|---|---:|---:|---:|
| 10 | 16.3 | 33 | 275 / 418 | 305 / 446 | 0 % | 0.22 | 42 MB |
| 20 | 25.8 | 53 | 328 / 501 | 407 / 595 | 0 % | 0.28 | 46 MB |
| **30** | **29.8** | 68 | 348 / 574 | 538 / 761 | 9.5 % | 0.29 | 48 MB |
| **40** | **30.2** | 78 | 395 / 686 | 731 / 1013 | 19 % | 0.27 | 48 MB |
| 60 | 21.5 | 247 | 7 / 993 | 1451 / 2008 | 82 % | 0.20 | 49 MB |
| 80 | 11.1 | 379 | 45 / 429 | 2761 / 3578 | 93 % | 0.14 | 49 MB |
| 160 | 10.9 | 352 | 212 / 1615 | 2044 / 3539 | 92 % | 0.14 | 49 MB |
| 320 | 11.4 | 340 | 674 / 2167 | 2554 / 3853 | 91 % | 0.13 | 49 MB |

**Reading it.** The platform serves about **30 checkouts/s (≈ 70 calls/s)** with p95 under about 0.8 s (capture p95 1.0 s at 40 users). Real errors (anything other than success, an acquirer decline and a deliberate 503) were **0** at every level; the ~2 % declines are the acquirer simulator's configured failure rate. Past ~40 concurrent users the door closes on *new* checkouts within tens of milliseconds and the API stays at ~0.14–0.3 of its 0.5 cores and ~49 MB, i.e. it is protected, not overloaded; completed checkouts per second then fall to about a third of the peak because the rejected clients retry in a tight loop, which costs the single vCPU nginx and TLS work. A looser admission setting (40 new / 150 total in flight) measured a higher peak (36.5 checkouts/s) but let admitted captures reach 4–5 s under 160–320 users; we chose the tighter one to keep admitted requests fast.

**Before the fixes** (same scenario, same box): plateau of ~14 checkouts/s with capture p50 3.5 s at 80 users and 55 requests answered 500 at 320 users (pool timeouts), because every capture rescanned the whole ledger (AUD-061).

**Crash test** (`kill -9` of the API while 20 users are checking out): answering again about 5 s later; afterwards 0 unbalanced ledger groups, 0 captured transactions whose amount differs from the ledger, capture events = captured transactions (10,279 = 10,279), 0 idempotency keys stuck, total debits = total credits.
