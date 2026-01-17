import { idx } from "@/utils/grid";
import { Bitset } from "@/core/bitset";
import { PixelBlock } from "@/core/pixels";
import type { RGBA, Tile } from "@/core/types";

export class Tileset {
  readonly size: number;
  readonly tileSize: number;
  readonly tiles: Tile[];
  readonly allowedNeighbors: [
    Bitset[], // N
    Bitset[], // E
    Bitset[], // S
    Bitset[], // W
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
  const neighbors = new Map<string, [Set<string>, Set<string>, Set<string>, Set<string>]>();

  for (let y = 0; y < rows; ++y) {
    for (let x = 0; x < cols; ++x) {
      // 1) create new tile in the tileset (if necessary)
      const tileIdx = idx(y, x, cols);
      const hash = rawTiles[tileIdx].hash;

      if (!tileIndexMap.has(hash)) {
        const id = tiles.length;
        tiles.push({ id, pixels: rawTiles[tileIdx] });
        frequencies.push(1);

        tileIndexMap.set(hash, id);
        neighbors.set(hash, [new Set(), new Set(), new Set(), new Set()]);
      } else {
        frequencies[tileIndexMap.get(hash)!] += 1;
      }

      // 2) add neighbors
      const curNeighbors = neighbors.get(hash)!;
      if (y > 0) curNeighbors[0].add(rawTiles[idx(y - 1, x, cols)].hash); // N
      if (x < cols - 1) curNeighbors[1].add(rawTiles[idx(y, x + 1, cols)].hash); // E
      if (y < rows - 1) curNeighbors[2].add(rawTiles[idx(y + 1, x, cols)].hash); // S
      if (x > 0) curNeighbors[3].add(rawTiles[idx(y, x - 1, cols)].hash); // W
    }
  }

  const nTiles = tiles.length;
  const allAdjecencies: Tileset["allowedNeighbors"] = [
    Array.from({ length: nTiles }, () => new Bitset(nTiles)),
    Array.from({ length: nTiles }, () => new Bitset(nTiles)),
    Array.from({ length: nTiles }, () => new Bitset(nTiles)),
    Array.from({ length: nTiles }, () => new Bitset(nTiles)),
  ];

  neighbors.forEach((dirs, key) => {
    const id = tileIndexMap.get(key)!;

    for (let d = 0; d < 4; ++d) {
      for (const neighHash of dirs[d]) {
        allAdjecencies[d][id].setBit(tileIndexMap.get(neighHash)!);
      }
    }
  },
  );

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

  return new Tileset(tileSize, tiles, average, normalizedFrequencies, allAdjecencies);
}
