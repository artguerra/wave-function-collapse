// return the corresponding index of (y, x) coords in a 1D mapped array
export function idx(y: number, x: number, cols: number): number {
  return cols * y + x;
}
