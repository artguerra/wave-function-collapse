import { Bitset } from "@/core/bitset";
import { type RGBA, type Tile } from "@/core/types";

export class Tileset {
  readonly size: number;
  readonly tileSize: number;
  readonly tiles: Tile[];
  tileDirectionsComputed: boolean;

  readonly allowedNeighbors: [
    Bitset[], // W
    Bitset[], // N
    Bitset[], // E
    Bitset[], // S
  ];
  readonly frequencies: Float32Array;
  readonly averageColor: RGBA;

  readonly mainColorSum: RGBA; // for progressive color updates (overlapping)
  readonly averageColorSum: RGBA; // for simple tiled model
  readonly totalVariations: number;

  constructor(
    tileSize: number,
    tiles: Tile[],
    weights: number[],
    allowed: [Bitset[], Bitset[], Bitset[], Bitset[]],
  ) {
    this.tileSize = tileSize;
    this.tiles = tiles;
    this.tileDirectionsComputed = false;
    this.size = tiles.length;
    this.allowedNeighbors = allowed;
    this.frequencies = new Float32Array(weights);
    this.totalVariations = 0;

    // calculate average color
    const avgColorSum = [0, 0, 0, 0];
    const denom = [0, 0, 0, 0];
    for (const tile of tiles) {
      const vars = tile.variations.length;
      this.totalVariations += vars;

      for (let v = 0; v < vars; ++v) {
        for (let i = 0; i < 4; ++i) {
          avgColorSum[i] += tile.variations[v].averageColor[i];
          denom[i]++;
        }
      }
    }
    this.averageColor = avgColorSum.map((s, i) => s / denom[i]) as RGBA;

    // calculate total sum of tiles main colors
    this.mainColorSum = [0, 0, 0, 0];
    this.averageColorSum = [0, 0, 0, 0];
    for(const tile of tiles) {
      for (let v = 0; v < tile.variations.length; ++v) {
        for(let i = 0; i < 4; ++i) {
          this.mainColorSum[i] += tile.variations[v].mainColor[i];
          this.averageColorSum[i] += tile.variations[v].averageColor[i];
        }
     }
    }
  }

  updateTileDirections(floorTile: number) {
    computeTilesDirections(this.tiles, this.allowedNeighbors, floorTile);
    this.tileDirectionsComputed = true;
  }

}

function computeTilesDirections(
  tiles: Partial<Tile>[],
  allowedNeighbors: [Bitset[], Bitset[], Bitset[], Bitset[]],
  floorTileIdx: number
) {
  let maxDir = 0.0;
  for (let i = 0; i < tiles.length; ++i) {
    const strengths: [number, number, number, number] = [0, 0, 0, 0];
    let neighCount = 0;

    for (let d = 0; d < 4; ++d) {
      const neighbors = allowedNeighbors[d][i];
      if (neighbors.getBit(floorTileIdx)) continue;

      const neighsInDir = neighbors.count();
      strengths[d] += neighsInDir;

      neighCount += neighsInDir;
    }

    if (neighCount > 0) {
      strengths[0] /= neighCount; strengths[1] /= neighCount;
      strengths[2] /= neighCount; strengths[3] /= neighCount;
    }

    maxDir = Math.max(maxDir, ...strengths);

    tiles[i].dirStrength = strengths;
  }

  for (let i = 0; i < tiles.length; ++i) {
    for (let d = 0; d < 4; ++d) {
      tiles[i].dirStrength![d] /= maxDir;
    }
  }

}