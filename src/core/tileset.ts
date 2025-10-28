import { idx } from "@/utils/grid";
import { Bitset } from "@/core/bitset";
import { PixelBlock } from "@/core/pixels";
import type { Tile } from "@/core/types";

export class Tileset {
  tiles: Tile[];
  allowedNeighbors: [
    Bitset[], // N
    Bitset[], // E
    Bitset[], // S
    Bitset[], // W
  ];
  weights: Float32Array;
  weightLogWeights: Float32Array;

  constructor(
    tiles: Tile[],
    weights: number[],
    allowed: [Bitset[], Bitset[], Bitset[], Bitset[]],
  ) {
    this.tiles = tiles;
    this.allowedNeighbors = allowed;
    this.weights = new Float32Array(weights);
    this.weightLogWeights = new Float32Array(
      weights.map((w) => w * Math.log(w)),
    );
  }
}

export function generateTileset(rawTiles: PixelBlock[], cols: number): Tileset {
  const tiles: Tile[] = [];
  const frequencies: number[] = [];
  const rows = rawTiles.length / cols;

  const tileIndexMap = new Map<string, Tile["id"]>();
  const neighbors = new Map<
    string,
    [Set<string>, Set<string>, Set<string>, Set<string>]
  >();

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
  const words = Math.ceil(nTiles / 32);
  const adj: Tileset["allowedNeighbors"] = [
    Array.from({ length: nTiles }, () => new Bitset(words)),
    Array.from({ length: nTiles }, () => new Bitset(words)),
    Array.from({ length: nTiles }, () => new Bitset(words)),
    Array.from({ length: nTiles }, () => new Bitset(words)),
  ];

  neighbors.forEach(
    (
      dirs: [Set<string>, Set<string>, Set<string>, Set<string>],
      key: string,
    ) => {
      const id = tileIndexMap.get(key)!;

      for (let d = 0; d < 4; ++d) {
        for (const neighHash of dirs[d]) {
          adj[d][id].setBit(tileIndexMap.get(neighHash)!);
        }
      }
    },
  );

  return new Tileset(tiles, frequencies, adj);
}
