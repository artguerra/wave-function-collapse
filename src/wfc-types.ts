export interface State {
  collapsed: Uint32Array;
  possibleTiles: Uint32Array;
  entropy: number[];
  words: number;
}

export type RGBA = [number, number, number, number];

export interface PixelBlock {
  hash: string;
  values: RGBA[];
}

export interface Tile {
  id: number;
  pixels: PixelBlock;
}

export type AdjBits = [
  Uint32Array[], // N
  Uint32Array[], // E
  Uint32Array[], // S
  Uint32Array[]  // W
];

export interface Tileset {
  tiles: Tile[];
  adj: AdjBits;
  words: number;
}

export interface Wave {
  width: number;
  height: number;
  tileset: Tileset;
  state: State;
}
