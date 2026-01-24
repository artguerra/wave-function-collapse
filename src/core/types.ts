export type RGBA = [number, number, number, number];

export interface PixelData {
  ksize: number;  // number of rows/columns (square kernels)
  values: RGBA[];
  hash: string;

  averageColor: RGBA;
  mainColor: RGBA;

  setAll(color: RGBA): void;
}

export interface Tile {
  id: number;
  pixels: PixelData;
}

export type SymmetryMode = "ALL" | "MIRROR_X" | "MIRROR_Y" | "MIRROR_XY" | "NONE";

export interface Vec2 {
  x: number;
  y: number;
}

export interface Dimensions {
  width: number;
  height: number;
}

