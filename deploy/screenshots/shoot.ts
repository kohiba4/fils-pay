// Drives a real headless Chrome through the UI with the DevTools protocol (no dependencies) and saves screenshots.
// Run with:  npx tsx deploy/screenshots/shoot.ts <mode: after|before> <out dir>   (stack.mjs + API + scratch DB must be running)
import { spawn } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import { base32Decode, currentStep, totpCodeForStep } from "../../apps/api/src/auth/totp.js";

const MODE = process.argv[2] ?? "after";
const OUT = process.argv[3] ?? "docs/submission/shots";
const WEB = process.env.SHOT_WEB ?? "http://127.0.0.1:5180";
const ADMIN = process.env.SHOT_ADMIN ?? "http://127.0.0.1:5181";
mkdirSync(OUT, { recursive: true });
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

const chrome = spawn("google-chrome", ["--headless=new", "--no-sandbox", "--disable-gpu", "--remote-debugging-port=9333", "--window-size=1360,900", "--hide-scrollbars", "about:blank"], { stdio: "ignore" });
let ws: WebSocket;
let id = 0;
const pending = new Map<number, (v: any) => void>();
async function connect() {
  for (let i = 0; i < 50; i++) {
    try {
      const targets = (await (await fetch("http://127.0.0.1:9333/json")).json()) as any[];
      const page = targets.find((t) => t.type === "page");
      if (page) {
        ws = new WebSocket(page.webSocketDebuggerUrl);
        await new Promise((res, rej) => { ws.onopen = () => res(null); ws.onerror = rej; });
        ws.onmessage = (m) => { const d = JSON.parse(String(m.data)); if (d.id && pending.has(d.id)) { pending.get(d.id)!(d); pending.delete(d.id); } };
        return;
      }
    } catch { /* not up yet */ }
    await sleep(200);
  }
  throw new Error("chrome did not start");
}
function cdp(method: string, params: Record<string, unknown> = {}): Promise<any> {
  const i = ++id;
  ws.send(JSON.stringify({ id: i, method, params }));
  return new Promise((resolve) => pending.set(i, resolve));
}
async function js<T = unknown>(expr: string): Promise<T> {
  const r = await cdp("Runtime.evaluate", { expression: expr, awaitPromise: true, returnByValue: true });
  return r.result?.result?.value as T;
}
async function goto(url: string) { await cdp("Page.navigate", { url }); await sleep(1500); }
async function shot(name: string) {
  const r = await cdp("Page.captureScreenshot", { format: "png" });
  writeFileSync(`${OUT}/${name}.png`, Buffer.from(r.result.data, "base64"));
  console.log("saved", name);
}
// React-controlled inputs need the native setter + an input event
const fill = (label: string, value: string) => js(`(() => { const l=[...document.querySelectorAll('label')].find(x=>x.textContent.trim().startsWith(${JSON.stringify(label)})); const i=l&&(l.control||l.querySelector('input,textarea')); if(!i) return false; const s=Object.getOwnPropertyDescriptor(Object.getPrototypeOf(i),'value').set; s.call(i,${JSON.stringify(value)}); i.dispatchEvent(new Event('input',{bubbles:true})); return true; })()`);
const click = (text: string) => js(`(() => { const b=[...document.querySelectorAll('button,a')].find(x=>x.textContent.trim().startsWith(${JSON.stringify(text)})); if(!b) return false; b.click(); return true; })()`);
const text = () => js<string>("document.body.innerText");

async function login(base: string, loginPath: string, creds: Record<string, string>, shotPrefix: string) {
  await goto(base + loginPath);
  await shot(`${shotPrefix}-1-credentials`);
  for (const [k, v] of Object.entries(creds)) await fill(k, v);
  await click("Continue");
  await sleep(1800);
  const secret = await js<string | null>(`document.querySelector('[data-testid=totp-secret]')?.textContent ?? null`);
  await shot(`${shotPrefix}-2-second-factor`);
  if (secret) {
    await fill("6-digit code", totpCodeForStep(base32Decode(secret), currentStep(Date.now())));
  } else {
    const dev = (await text()).match(/Development code:\s*(\d+)/)?.[1];
    if (dev) await fill("One-time code", dev);
  }
  await click("Verify");
  await sleep(2000);
}

await connect();
await cdp("Page.enable");
const merchantEmail = process.env.SHOT_MERCHANT_EMAIL!;
const merchantId = process.env.SHOT_MERCHANT_ID!;
const merchantPassword = process.env.SHOT_PASSWORD!;
const adminEmail = process.env.SHOT_ADMIN_EMAIL!;
const adminPassword = process.env.SHOT_ADMIN_PASSWORD!;

await login(WEB, "/dashboard/login", { "Merchant ID": merchantId, Email: merchantEmail, Password: merchantPassword }, `${MODE}-dashboard-login`);
await shot(`${MODE}-dashboard-transactions`);
{
  // open the first captured transaction; (after) refund part of it from the drawer and show the timeline
  const href = await js<string | null>(`[...document.querySelectorAll('a')].map(a=>a.getAttribute('href')).find(h=>/\\/dashboard\\/transactions\\/[0-9a-f-]{36}/.test(h||'')) ?? null`);
  if (href) {
    await goto(WEB + href);
    await shot(`${MODE}-transaction-detail`);
  }
  if (href && MODE === "after") {
    await click("Refund");
    await sleep(600);
    await fill("Amount", "10.000");
    await shot("after-refund-drawer");
    await click("Review refund");
    await sleep(700);
    await shot("after-refund-confirm");
    // the confirmation dialog's primary button is labelled "Refund" (the page also has a "Refund" heading, so click the dialog's button)
    await js(`(() => { const d=document.querySelector('[role=dialog],dialog,[aria-modal=true]'); const b=d&&[...d.querySelectorAll('button')].find(x=>x.textContent.trim()==='Refund'); if(b){b.click();return true;} return false; })()`);
    await sleep(2500);
    await shot("after-refund-timeline");
    await js(`window.scrollTo(0, document.body.scrollHeight)`);
    await sleep(400);
    await shot("after-refund-timeline-bottom");
  }
  await goto(WEB + "/dashboard/settlement");
  await shot(`${MODE}-settlement-batches`);
  await goto(WEB + "/dashboard/reconciliation");
  await shot(`${MODE}-reconciliation`);
}
await login(ADMIN, "/login", { Email: adminEmail, Password: adminPassword }, `${MODE}-admin-login`);
await shot(`${MODE}-admin-merchants`);
if (MODE === "after") {
  await goto(ADMIN + "/settlement");
  await shot("after-admin-settlement");
  await goto(ADMIN + "/adjustment-imports");
  await shot("after-admin-adjustment-import");
}
ws!.close();
chrome.kill();
