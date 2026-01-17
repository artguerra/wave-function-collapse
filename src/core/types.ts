export type RGBA = [number, number, number, number];

export const DX = [-1, 0, 1, 0] as const;
export const DY = [0, 1, 0, -1] as const;

export interface PixelData {
  ksize: number;  // number of rows/columns (square kernels)
  values: RGBA[];
  averageColor: RGBA;
  hash: string;

  setAll(color: RGBA): void;
}

export interface Tile {
  id: number;
  pixels: PixelData;
}

export interface Vec2 {
  x: number;
  y: number;
}

export interface Dimensions {
  width: number;
  height: number;
}

