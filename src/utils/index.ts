import type { RGBA } from "@/core/types";

// asserts a condition (with proper typing)
export function assert(
  condition: boolean,
  msg?: string | (() => string),
): asserts condition {
  if (!condition)
    throw new Error(msg && (typeof msg === "string" ? msg : msg()));
}
