export function assert(
  condition: boolean,
  msg?: string | (() => string),
): asserts condition {
  if (!condition)
    throw new Error(msg && (typeof msg === "string" ? msg : msg()));
}

export function idx(y: number, x: number, cols: number) : number {
  return cols * y + x; 
}

