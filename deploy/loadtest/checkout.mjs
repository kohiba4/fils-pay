#!/usr/bin/env node
// Load test for the fixed checkout scenario: each virtual user loops  authorize -> capture  (the two money calls a
// checkout makes) against the public URL, so nginx, TLS, the API, Postgres and the simulated acquirer are all included.
// Plain Node (>= 20), no dependencies.
//
//   node checkout.mjs --base https://HOST --key-file /path/to/key --levels 5,10,20,40,80 --seconds 20 [--think-ms 0]
//
// Per level it prints: completed checkouts/s, p50/p95/p99 latency per call, error classes, and (when systemd is
// readable) the API unit's CPU use and peak memory over that level. "Errors" are split: 429/503 = turned away by the
// overload policy (expected past capacity), 4xx other / 5xx = real failures, 402/502 from the acquirer simulator are
// reported separately (the simulator fails ~2% of calls by design).
import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { execFileSync } from "node:child_process";

const args = Object.fromEntries(process.argv.slice(2).reduce((acc, a, i, all) => (a.startsWith("--") ? [...acc, [a.slice(2), all[i + 1]]] : acc), []));
const BASE = (args.base ?? "https://localhost").replace(/\/$/, "");
const KEY = readFileSync(args["key-file"], "utf8").trim();
const LEVELS = (args.levels ?? "5,10,20,40").split(",").map(Number);
const SECONDS = Number(args.seconds ?? 20);
const THINK_MS = Number(args["think-ms"] ?? 0);
const CARD = { pan: "4242424242424242", expiryMonth: 12, expiryYear: 2030, cvv: "123" };

async function call(path, body, extra = {}) {
  const started = performance.now();
  let status = 0;
  let json = null;
  try {
    const res = await fetch(`${BASE}${path}`, {
      method: "POST",
      headers: { authorization: `Bearer ${KEY}`, "content-type": "application/json", "idempotency-key": randomUUID(), ...extra },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(30_000),
    });
    status = res.status;
    json = await res.json().catch(() => null);
  } catch {
    status = -1; // transport error / timeout
  }
  return { status, ms: performance.now() - started, json };
}

const pct = (arr, p) => (arr.length ? arr.slice().sort((a, b) => a - b)[Math.min(arr.length - 1, Math.floor((p / 100) * arr.length))] : 0);
function sample() {
  try {
    const out = execFileSync("systemctl", ["show", "filspay-api", "-p", "CPUUsageNSec", "-p", "MemoryCurrent", "-p", "MemoryPeak"], { encoding: "utf8" });
    return Object.fromEntries(out.trim().split("\n").map((l) => l.split("=")));
  } catch {
    return null;
  }
}

async function level(vus) {
  const lat = { authorize: [], capture: [] };
  const codes = {};
  let checkouts = 0;
  let deadline = Date.now() + SECONDS * 1000;
  const bump = (k) => (codes[k] = (codes[k] ?? 0) + 1);
  const before = sample();
  const t0 = Date.now();
  await Promise.all(
    Array.from({ length: vus }, async () => {
      while (Date.now() < deadline) {
        const a = await call("/v1/transactions", { amountFils: 10_000, card: CARD, reference: "loadtest" });
        lat.authorize.push(a.ms);
        bump(`authorize ${a.status}`);
        if (a.status === 201 && a.json?.id) {
          const c = await call(`/v1/transactions/${a.json.id}/capture`, {});
          lat.capture.push(c.ms);
          bump(`capture ${c.status}`);
          if (c.status === 200) checkouts++;
        }
        if (THINK_MS > 0) await new Promise((r) => setTimeout(r, THINK_MS));
      }
    }),
  );
  const secs = (Date.now() - t0) / 1000;
  const after = sample();
  const cpuSec = before && after ? (Number(after.CPUUsageNSec) - Number(before.CPUUsageNSec)) / 1e9 : null;
  const all = Object.entries(codes);
  const turnedAway = all.filter(([k]) => /( 429| 503)$/.test(k)).reduce((s, [, v]) => s + v, 0);
  const acquirer = all.filter(([k]) => /( 402| 502)$/.test(k)).reduce((s, [, v]) => s + v, 0);
  const total = all.reduce((s, [, v]) => s + v, 0);
  const real = all.filter(([k]) => !/ (201|200|402|502|429|503)$/.test(k)).reduce((s, [, v]) => s + v, 0);
  return {
    vus,
    secs: Number(secs.toFixed(1)),
    checkoutsPerSec: Number((checkouts / secs).toFixed(1)),
    callsPerSec: Number((total / secs).toFixed(1)),
    authorizeMs: { p50: Math.round(pct(lat.authorize, 50)), p95: Math.round(pct(lat.authorize, 95)), p99: Math.round(pct(lat.authorize, 99)) },
    captureMs: { p50: Math.round(pct(lat.capture, 50)), p95: Math.round(pct(lat.capture, 95)), p99: Math.round(pct(lat.capture, 99)) },
    turnedAwayPct: Number(((100 * turnedAway) / Math.max(1, total)).toFixed(1)),
    acquirerDeclinePct: Number(((100 * acquirer) / Math.max(1, total)).toFixed(1)),
    realErrors: real,
    apiCpuCores: cpuSec === null ? null : Number((cpuSec / secs).toFixed(2)),
    apiMemMB: after ? Math.round(Number(after.MemoryCurrent) / 1048576) : null,
    codes,
  };
}

console.log(`checkout load test -> ${BASE}  (${SECONDS}s per level, think ${THINK_MS} ms)`);
const results = [];
for (const vus of LEVELS) {
  const r = await level(vus);
  results.push(r);
  console.log(JSON.stringify(r));
  await new Promise((res) => setTimeout(res, 3000)); // let the server settle between levels
}
console.log("\nvus  checkouts/s  calls/s  authorize p50/p95/p99 ms  capture p50/p95/p99 ms  turned-away%  acq-decl%  real-err  API cores  API MB");
for (const r of results) {
  console.log(
    `${String(r.vus).padStart(3)}  ${String(r.checkoutsPerSec).padStart(11)}  ${String(r.callsPerSec).padStart(7)}  ` +
      `${`${r.authorizeMs.p50}/${r.authorizeMs.p95}/${r.authorizeMs.p99}`.padEnd(24)}  ${`${r.captureMs.p50}/${r.captureMs.p95}/${r.captureMs.p99}`.padEnd(22)}  ` +
      `${String(r.turnedAwayPct).padStart(12)}  ${String(r.acquirerDeclinePct).padStart(9)}  ${String(r.realErrors).padStart(8)}  ${String(r.apiCpuCores ?? "-").padStart(9)}  ${String(r.apiMemMB ?? "-").padStart(6)}`,
  );
}
