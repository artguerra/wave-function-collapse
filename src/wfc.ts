import type {
  State as IState,
  PixelBlock as IPixelBlock,
  Tile as ITile,
  Tileset as ITileset,
  Wave as IWave,
  RGBA,
  AdjBits,
} from "./wfc-types.ts";

import { packRGBA, fnv1a64 } from "./tileset.ts";

export class State implements IState {
  collapsed: Uint32Array;
  possibleTiles: Uint32Array;
  entropy: number[];
  words: number;  // words per bitset (number of groups of 32 bits to represent all tiles)

  constructor(_tilesetSize: number) {
    this.words = Math.ceil(_tilesetSize / 32);

    this.collapsed = new Uint32Array(this.words);
    this.entropy = new Array<number>(_tilesetSize).fill(_tilesetSize);
    this.possibleTiles = new Uint32Array(this.words);
  }
}

export class PixelBlock implements IPixelBlock {
  private _hash?: string;
  values: RGBA[];

  constructor(size: number) {
    this.values = new Array<RGBA>(size * size);
  }

  get hash() {
    if (this._hash !== undefined) return this._hash;

    this._hash = this.computeHash();
    return this._hash;
  }

  private computeHash(): string {
    return fnv1a64(packRGBA(this));
  }
}

export class Tile implements ITile {
  id: number;
  pixels: PixelBlock;

  constructor(_id: number, _pixels: PixelBlock) {
    this.id = _id;
    this.pixels = _pixels;
  }
}

export class Tileset implements ITileset {
  tiles: Tile[];
  adj: AdjBits;
  words: number;  // words per bitset

  constructor(_tiles: Tile[], _adj: AdjBits) {
    this.words = Math.ceil(_tiles.length / 32);
    this.tiles = _tiles;
    this.adj = _adj;
  }
}

export class Wave implements IWave {
  width: number;
  height: number;
  tileset: Tileset;
  state: State;

  constructor(_width: number, _height: number, _tileset: Tileset) {
    this.width = _width;
    this.height = _height;
    this.tileset = _tileset;
    this.state = new State(_tileset.tiles.length);
  }
}
