import type { RGBA } from "@/core/types";

// asserts a condition (with proper typing)
export function assert(
  condition: boolean,
  msg?: string | (() => string),
): asserts condition {
  if (!condition)
    throw new Error(msg && (typeof msg === "string" ? msg : msg()));
}

// convert 8 bit unsigned RGBA value (0..255) to float (0..1)
export function rgbaU8ToF32(color: RGBA) {
  return color.map(c => c / 255);
}
