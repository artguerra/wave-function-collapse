import { idx } from "@/utils/grid";
import { Bitset } from "@/core/bitset";
import { PixelBlock } from "@/core/pixels";
import { OPPOSITE, type RGBA, type Tile } from "@/core/types";

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

  constructor(
    tileSize: number,
    tiles: Tile[],
    averageColor: RGBA,
    weights: number[],
    allowed: [Bitset[], Bitset[], Bitset[], Bitset[]],
  ) {
    this.tileSize = tileSize;
    this.tiles = tiles;
    this.averageColor = averageColor;
    this.size = tiles.length;
    this.allowedNeighbors = allowed;
    this.frequencies = new Float32Array(weights);
  }
}

// `cols` is needed to gather adjecency information
export function createTileset(tileSize: number, rawTiles: PixelBlock[], cols: number): Tileset {
  const tiles: Tile[] = [];
  const frequencies: number[] = [];
  const rows = rawTiles.length / cols;

  const tileIndexMap = new Map<string, Tile["id"]>();

  for (let y = 0; y < rows; ++y) {
    for (let x = 0; x < cols; ++x) {
      // create new tile in the tileset (if necessary)
      const tileIdx = idx(y, x, cols);
      const pixels = rawTiles[tileIdx];
      const hash = pixels.hash;

      if (!tileIndexMap.has(hash)) {
        const id = tiles.length;
        tiles.push({ id, pixels });

        frequencies.push(1);
        tileIndexMap.set(hash, id);
      } else {
        frequencies[tileIndexMap.get(hash)!] += 1;
      }
    }
  }

  const nTiles = tiles.length;
  const allowed: Tileset["allowedNeighbors"] = [
    Array.from({ length: nTiles }, () => new Bitset(nTiles)), // W
    Array.from({ length: nTiles }, () => new Bitset(nTiles)), // N
    Array.from({ length: nTiles }, () => new Bitset(nTiles)), // E
    Array.from({ length: nTiles }, () => new Bitset(nTiles)), // S
  ];
  
  for (const tileIdx of tileIndexMap.values()) {
    const tile = tiles[tileIdx];

    for (const neighIdx of tileIndexMap.values()) {
      const neighbor = tiles[neighIdx];

      for (let d = 0; d < 4; ++d) {
        if (allowed[d][tileIdx].getBit(neighIdx)) continue; // already computed

        if (compatible(tile, neighbor, d)) {
          allowed[d][tileIdx].setBit(neighIdx);
          allowed[OPPOSITE[d]][neighIdx].setBit(tileIdx);
        }
      }
    };
  };

  // normalize frequencies
  let totalFrequency = 0;
  for (let i = 0; i < frequencies.length; ++i) {
    totalFrequency += frequencies[i];
  }

  const normalizedFrequencies = frequencies.map(f => f / totalFrequency);

  // calculate average color
  const channels = 4;
  const colorSum = new Array(channels).fill(0);
  for (const tile of tiles) {
    for (let i = 0; i < channels; ++i) colorSum[i] += tile.pixels.averageColor[i];
  }
  const average = colorSum.map(s => s / tiles.length) as RGBA;

  return new Tileset(tileSize, tiles, average, normalizedFrequencies, allowed);
}

function compatible(tile: Tile, neighbor: Tile, dir: number): boolean {
  const ksize = tile.pixels.ksize;

  let startX = 0, endX = ksize, startY = 0, endY = ksize;
  let shiftX = 0, shiftY = 0;

  switch (dir) {
    case 0: // W
      endX = ksize - 1; 
      shiftX = 1;      
      break;
    case 2: // E
      startX = 1;
      shiftX = -1;
      break;
    case 1: // N
      endY = ksize - 1;
      shiftY = 1;
      break;
    case 3: // S
      startY = 1;
      shiftY = -1;
      break;
  }

  for (let y = startY; y < endY; y++) {
    for (let x = startX; x < endX; x++) {
      const idxT = idx(y, x, ksize); // pixel idx for the tile
      const idxN = idx(y + shiftY, x + shiftX, ksize); // pixel idx for neighbor

      if (!rgbaEqual(tile.pixels.values[idxT], neighbor.pixels.values[idxN])) return false;
    }
  }

  return true;
}

function rgbaEqual(a: RGBA, b: RGBA) {
  return a[0] === b[0] && a[1] === b[1] && a[2] === b[2] && a[3] === b[3];
}
