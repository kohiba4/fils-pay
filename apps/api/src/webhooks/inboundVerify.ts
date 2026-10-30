import { createHmac, timingSafeEqual } from "node:crypto";

/** Verifies the signature on an inbound acquirer callback. */

interface ParsedAcquirerSignatureHeader {
  timestamp: number;
  signature: string;
}

function parseAcquirerSignatureHeader(header: string): ParsedAcquirerSignatureHeader | null {
  let timestampStr: string | null = null;
  let signature: string | null = null;

  for (const part of header.split(",")) {
    const eqIndex = part.indexOf("=");
    if (eqIndex === -1) continue;
    const key = part.slice(0, eqIndex).trim();
    const value = part.slice(eqIndex + 1).trim();
    if (key === "t") timestampStr = value;
    else if (key === "v1") signature = value;
  }

  if (!timestampStr || !signature) return null;
  if (!/^\d+$/.test(timestampStr)) return null;

  const timestamp = Number.parseInt(timestampStr, 10);
  if (!Number.isFinite(timestamp)) return null;

  return { timestamp, signature };
}

/** There is no timestamp reason: freshness is not checked for inbound callbacks. */
export type VerifyAcquirerCallbackFailureReason = "malformed_header" | "signature_mismatch";

export interface VerifyAcquirerCallbackResult {
  valid: boolean;
  reason?: VerifyAcquirerCallbackFailureReason;
}

/** AUD-021: `Buffer.compare` stops at the first differing byte (not
 *  constant-time). Compare the decoded 32-byte digests with timingSafeEqual
 *  after checking the format, so malformed input is a mismatch, never a throw. */
function constantTimeEquals(expectedHex: string, providedHex: string): boolean {
  if (!/^[0-9a-f]{64}$/i.test(providedHex)) return false;
  return timingSafeEqual(Buffer.from(expectedHex, "hex"), Buffer.from(providedHex, "hex"));
}

/** Verifies the acquirer callback signature when present and required. */
/**
 * AUD-021: `rawBody` should be the request body exactly as received (the
 * route keeps it); an HMAC over a re-serialised object depends on key order
 * and whitespace the acquirer never promised, so genuine callbacks failed.
 * A non-string argument falls back to JSON.stringify for direct callers.
 * No freshness window is enforced: the provider's retry schedule (up to 5
 * retries from 60 s, acquirer comparison 2025-11) and whether retries are
 * re-signed are not documented, and a replayed callback is a no-op since
 * AUD-019's dedupe.
 */
export function verifyAcquirerCallbackSignature(
  payload: unknown,
  header: string | undefined,
  secret: string,
  requireSignature = false,
): VerifyAcquirerCallbackResult {
  if (!header) {
    return requireSignature
      ? { valid: false, reason: "malformed_header" }
      : { valid: true };
  }

  const parsed = parseAcquirerSignatureHeader(header);
  if (!parsed) return { valid: false, reason: "malformed_header" };

  const expected = createHmac("sha256", secret)
    .update(`${parsed.timestamp}.${typeof payload === "string" ? payload : JSON.stringify(payload)}`)
    .digest("hex");

  if (!constantTimeEquals(expected, parsed.signature)) {
    return { valid: false, reason: "signature_mismatch" };
  }

  return { valid: true };
}
