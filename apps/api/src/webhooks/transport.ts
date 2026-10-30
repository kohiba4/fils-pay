/**
 * The injectable HTTP send — `runDispatchPass` and everything it calls take
 * a `WebhookTransport` as an explicit parameter, never calling `fetch`
 * directly deep inside dispatch logic. Same "pass the effectful dependency
 * in" shape as `AcquirerSimulator`.
 */

/**
 * @property timeoutMs Covers the whole exchange including reading the body (the abort
 * signal stays armed until the body has been read).
 */
export interface WebhookTransportRequest {
  url: string;
  headers: Record<string, string>;
  body: string;
  timeoutMs: number;
}

export interface WebhookTransportResponse {
  /** null on a transport-level failure (timeout, DNS, connection refused —
   *  never reached the receiver) */
  statusCode: number | null;
  /** "" on a transport-level failure */
  body: string;
  /** present iff statusCode is null */
  errorMessage?: string;
}

export type WebhookTransport = (req: WebhookTransportRequest) => Promise<WebhookTransportResponse>;

import { lookup as dnsLookup, type LookupAddress } from "node:dns";
import http from "node:http";
import https from "node:https";
import { BlockList, isIP } from "node:net";

/** Upper bound on the receiver response bytes read (AUD-057). */
export const MAX_RESPONSE_BYTES = 4096;

/**
 * AUD-057: destinations a webhook may never reach in production. Checked at
 * connection time (see guardedLookup), not on the URL string.
 */
const PROHIBITED = new BlockList();
for (const [net, prefix] of [
  ["0.0.0.0", 8], ["10.0.0.0", 8], ["100.64.0.0", 10], ["127.0.0.0", 8], ["169.254.0.0", 16],
  ["172.16.0.0", 12], ["192.0.0.0", 24], ["192.0.2.0", 24], ["192.168.0.0", 16], ["198.18.0.0", 15],
  ["198.51.100.0", 24], ["203.0.113.0", 24], ["224.0.0.0", 4], ["240.0.0.0", 4],
] as const) {
  PROHIBITED.addSubnet(net, prefix, "ipv4");
}
for (const [net, prefix] of [
  ["::", 128], ["::1", 128], ["100::", 64], ["2001:db8::", 32], ["fc00::", 7], ["fe80::", 10], ["fec0::", 10], ["ff00::", 8],
] as const) {
  PROHIBITED.addSubnet(net, prefix, "ipv6");
}

/** IPv4 embedded in an IPv4-mapped (::ffff:a.b.c.d / ::ffff:xxxx:xxxx) or NAT64 (64:ff9b::/96) address. */
function embeddedIpv4(address: string): string | null {
  const lower = address.toLowerCase();
  const m = /^(?:::ffff:|64:ff9b::)(?:0:)?(.+)$/.exec(lower);
  if (!m) return null;
  const tail = m[1]!;
  if (isIP(tail) === 4) return tail;
  const hex = /^([0-9a-f]{1,4}):([0-9a-f]{1,4})$/.exec(tail);
  if (!hex) return null;
  const hi = parseInt(hex[1]!, 16);
  const lo = parseInt(hex[2]!, 16);
  return `${hi >> 8}.${hi & 255}.${lo >> 8}.${lo & 255}`;
}

export function isProhibitedAddress(address: string): boolean {
  const family = isIP(address);
  if (family === 0) return true; // not an address at all: refuse rather than guess
  if (family === 4) return PROHIBITED.check(address, "ipv4");
  const v4 = embeddedIpv4(address);
  if (v4 !== null) return PROHIBITED.check(v4, "ipv4");
  return PROHIBITED.check(address, "ipv6");
}

export interface TransportPolicy {
  /** Refuse private, loopback, link-local and other internal destinations.
   *  On by default in production (config.webhookBlockPrivateDestinations). */
  blockPrivateDestinations: boolean;
  /** Test seam: replaces DNS resolution (same contract as dns.lookup with all: true). */
  resolve?: (hostname: string) => Promise<LookupAddress[]>;
  /** Test seam: addresses exempt from the block (local test receivers). Never set in production. */
  allowAddresses?: string[];
}

export class ProhibitedDestinationError extends Error {
  constructor(detail: string) {
    super(`webhook destination not allowed: ${detail}`);
  }
}

function defaultResolve(hostname: string): Promise<LookupAddress[]> {
  return new Promise((resolve, reject) =>
    dnsLookup(hostname, { all: true, verbatim: true }, (err, addresses) => (err ? reject(err) : resolve(addresses))),
  );
}

/**
 * The `lookup` used by the socket itself. Node calls it while opening the
 * connection and connects to the address it returns, so the address checked
 * is the address used: no second, uncontrolled resolution (DNS rebinding). If
 * ANY answer is prohibited the request is refused (mixed answers).
 */
function guardedLookup(policy: TransportPolicy) {
  const allowed = new Set(policy.allowAddresses ?? []);
  const resolve = policy.resolve ?? defaultResolve;
  return (
    hostname: string,
    options: { all?: boolean } | number,
    callback: (err: NodeJS.ErrnoException | null, address: string | LookupAddress[], family?: number) => void,
  ): void => {
    resolve(hostname).then(
      (answers) => {
        if (answers.length === 0) return callback(new ProhibitedDestinationError(`${hostname} did not resolve`), "", 0);
        const bad = answers.find((a) => !allowed.has(a.address) && isProhibitedAddress(a.address));
        if (policy.blockPrivateDestinations && bad) {
          return callback(new ProhibitedDestinationError(`${hostname} resolves to ${bad.address}`), "", 0);
        }
        const wantAll = typeof options === "object" && options?.all === true;
        if (wantAll) return callback(null, answers);
        const first = answers[0]!;
        return callback(null, first.address, first.family);
      },
      (err: NodeJS.ErrnoException) => callback(err, "", 0),
    );
  };
}

/**
 * Real transport (node:http / node:https; Node's global fetch cannot pin the
 * resolved address without the undici package). AUD-057:
 * - redirects are never followed (node:http does not follow them);
 * - the destination is checked at connection time (guardedLookup), and a
 *   literal IP host (which skips lookup) is checked before connecting,
 *   including IPv4-mapped IPv6 forms;
 * - TLS keeps Node's default certificate and hostname verification;
 * - environment proxies are not used; one fresh connection per request;
 * - the timeout covers connect, send and the bounded body read.
 */
export function createFetchTransport(
  policy: TransportPolicy = { blockPrivateDestinations: false },
): WebhookTransport {
  return (req: WebhookTransportRequest): Promise<WebhookTransportResponse> =>
    new Promise((resolve) => {
      let settled = false;
      const finish = (r: WebhookTransportResponse): void => {
        if (settled) return;
        settled = true;
        resolve(r);
      };
      const fail = (err: unknown): void =>
        finish({ statusCode: null, body: "", errorMessage: err instanceof Error ? err.message : String(err) });

      let url: URL;
      try {
        url = new URL(req.url);
      } catch (err) {
        return fail(err);
      }
      if (url.protocol !== "http:" && url.protocol !== "https:") return fail(new ProhibitedDestinationError(url.protocol));
      const host = url.hostname.replace(/^\[|\]$/g, "");
      const allowed = new Set(policy.allowAddresses ?? []);
      if (policy.blockPrivateDestinations && isIP(host) !== 0 && !allowed.has(host) && isProhibitedAddress(host)) {
        return fail(new ProhibitedDestinationError(host));
      }

      const mod = url.protocol === "https:" ? https : http;
      const request = mod.request(
        url,
        {
          method: "POST",
          headers: { ...req.headers, "Content-Length": Buffer.byteLength(req.body).toString() },
          agent: false,
          lookup: guardedLookup(policy) as unknown as typeof dnsLookup,
          timeout: req.timeoutMs,
        },
        (response) => {
          const chunks: Buffer[] = [];
          let total = 0;
          response.on("data", (chunk: Buffer) => {
            if (total >= MAX_RESPONSE_BYTES) return;
            const take = chunk.subarray(0, MAX_RESPONSE_BYTES - total);
            chunks.push(take);
            total += take.length;
            if (total >= MAX_RESPONSE_BYTES) {
              // AUD-057: stop reading; the rest is discarded with the socket.
              finish({ statusCode: response.statusCode ?? null, body: Buffer.concat(chunks).toString("utf8") });
              response.destroy();
            }
          });
          response.on("end", () => finish({ statusCode: response.statusCode ?? null, body: Buffer.concat(chunks).toString("utf8") }));
          response.on("error", (err) => (settled ? undefined : fail(err)));
        },
      );
      const hardTimeout = setTimeout(() => request.destroy(new Error(`timeout after ${req.timeoutMs} ms`)), req.timeoutMs);
      request.on("timeout", () => request.destroy(new Error(`timeout after ${req.timeoutMs} ms`)));
      request.on("error", fail);
      request.on("close", () => clearTimeout(hardTimeout));
      request.end(req.body);
    });
}
