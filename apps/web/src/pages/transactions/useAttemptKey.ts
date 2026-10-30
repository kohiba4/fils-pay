import { useRef } from "react";

/**
 * One Idempotency-Key per money-moving attempt. The key changes when the
 * input that defines the attempt changes, or after the attempt succeeded
 * (`consumed()`); a retry of the same input after an error or a lost
 * response reuses it, so the server replays instead of acting twice.
 */
export function useAttemptKey(input: string): { key: string; consumed: () => void } {
  const ref = useRef<{ input: string; key: string } | null>(null);
  if (!ref.current || ref.current.input !== input) {
    ref.current = { input, key: crypto.randomUUID() };
  }
  return {
    key: ref.current.key,
    consumed: () => {
      ref.current = null;
    },
  };
}
