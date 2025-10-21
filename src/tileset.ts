import { idx } from "./utils/util";
import type { AdjBits } from "./wfc-types";
import { PixelBlock, Tile, Tileset } from "./wfc";

export function generateTileset(rawTiles: PixelBlock[], cols: number): Tileset {
  const tiles: Tile[] = [];
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
        tiles.push(new Tile(id, rawTiles[tileIdx]));

        tileIndexMap.set(hash, id);
        neighbors.set(hash, [new Set(), new Set(), new Set(), new Set()]);
      }

      // 2) add neighbors
      const curNeighbors = neighbors.get(hash)!;
      if (y > 0) curNeighbors[0].add(rawTiles[idx(y - 1, x, cols)].hash); // up
      if (x < cols - 1) curNeighbors[1].add(rawTiles[idx(y, x + 1, cols)].hash); // right
      if (y < rows - 1) curNeighbors[2].add(rawTiles[idx(y + 1, x, cols)].hash); // bottom
      if (x > 0) curNeighbors[3].add(rawTiles[idx(y, x - 1, cols)].hash); // left
    }
  }

  const nTiles = tiles.length;
  const words = Math.ceil(nTiles / 32);
  const adj: AdjBits = [
    Array.from({ length: nTiles }, () => new Uint32Array(words)),
    Array.from({ length: nTiles }, () => new Uint32Array(words)),
    Array.from({ length: nTiles }, () => new Uint32Array(words)),
    Array.from({ length: nTiles }, () => new Uint32Array(words)),
  ];

  neighbors.forEach((dirs: [Set<string>, Set<string>, Set<string>, Set<string>], key: string) => {
    const id = tileIndexMap.get(key)!;

    for (let d = 0; d < 4; ++d) {
      for (const neighHash of dirs[d]) {
        setBit(adj[d][id], tileIndexMap.get(neighHash)!);
      }
    }
  });

  return new Tileset(tiles, adj);
}

function setBit(arr: Uint32Array, id: number) {
  arr[id >>> 5] |= 1 << (id & 31);
}

export function packRGBA(pixels: PixelBlock): Uint32Array {
  const n = pixels.values.length;
  const out = new Uint32Array(n);

  for (let i = 0; i < n; i++) {
    const [r, g, b, a] = pixels.values[i];
    out[i] = (r << 24) | (g << 16) | (b << 8) | a;
  }

  return out;
}

// Hash FNV-1a 64-bit (as hex string) for a Uint32Array.
export function fnv1a64(u32: Uint32Array): string {
  let lo = 0x2325;
  let hi = 0x84222325; // arbitrary 64-bit offset basis-ish

  for (let i = 0; i < u32.length; i++) {
    let x = u32[i];
    lo ^= x & 0xffff;
    hi ^= x >>> 16;
    // 64-bit * FNV prime (0x100000001B3) via 32-bit chunks
    const a = (lo & 0xffff) * 0x01b3;
    const b = (lo >>> 16) * 0x01b3 + (a >>> 16);
    const c = (hi & 0xffff) * 0x01b3 + (b >>> 16);
    const d = (hi >>> 16) * 0x01b3 + (c >>> 16);
    lo = ((a & 0xffff) | (b << 16)) >>> 0;
    hi = ((c & 0xffff) | (d << 16)) >>> 0;
  }

  return (
    (hi >>> 0).toString(16).padStart(8, "0") +
    (lo >>> 0).toString(16).padStart(8, "0")
  );
}
