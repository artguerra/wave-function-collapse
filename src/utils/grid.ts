import type { Vec2 } from "@/core/types";

// return the corresponding index of (y, x) coords in a 1D mapped array
export function idx(y: number, x: number, cols: number): number {
  return cols * y + x;
}

// return the {x, y} coords of the corresponding index in a 1D mapped array
export function coord(idx: number, cols: number): Vec2 {
  return {
    x: idx % cols,
    y: Math.trunc(idx / cols),
  };
}
