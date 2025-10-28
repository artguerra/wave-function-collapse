export type RGBA = [number, number, number, number];

export const DX = [-1, 0, 1, 0] as const;
export const DY = [0, 1, 0, -1] as const;

export interface PixelData {
  values: RGBA[];
  hash: string;
}

export interface Tile {
  id: number;
  pixels: PixelData;
}
