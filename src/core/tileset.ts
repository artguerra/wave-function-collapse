import { Bitset } from "@/core/bitset";
import { type RGBA, type Tile } from "@/core/types";

export class Tileset {
  readonly size: number;
  readonly tileSize: number;
  readonly tiles: Tile[];
  readonly allowedNeighbors: [
    Bitset[], // W
    Bitset[], // N
    Bitset[], // E
    Bitset[], // S
  ];
  readonly frequencies: Float32Array;
  readonly averageColor: RGBA;
  readonly totalColorSum: RGBA; // for progressive color updates

  constructor(
    tileSize: number,
    tiles: Tile[],
    weights: number[],
    allowed: [Bitset[], Bitset[], Bitset[], Bitset[]],
  ) {
    this.tileSize = tileSize;
    this.tiles = tiles;
    this.size = tiles.length;
    this.allowedNeighbors = allowed;
    this.frequencies = new Float32Array(weights);

    // calculate average color
    const avgColorSum = [0, 0, 0, 0];
    for (const tile of tiles) {
      for (let i = 0; i < 4; ++i) avgColorSum[i] += tile.pixels.averageColor[i];
    }
    this.averageColor = avgColorSum.map(s => s / tiles.length) as RGBA;

    // calculate total sum of tiles main colors
    this.totalColorSum = [0, 0, 0, 0];
    for(const tile of tiles) {
      for(let i = 0; i < 4; ++i) {
        this.totalColorSum[i] += tile.pixels.mainColor[i];
      }
    }
  }
}

