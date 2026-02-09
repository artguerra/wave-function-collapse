import { assert } from "@/utils";
import { idx, OPPOSITE } from "@/utils/grid";
import { decodePNG, pngToPixelBlock, rotateBlock90 } from "@/utils/image";
import type { RGBA, Tile } from "@/core/types";
import { Bitset } from "@/core/bitset";
import { Tileset } from "@/core/tileset";


const REFLECT_IDX: Record<string, (idx: number) => number> = {
  X: (idx) => idx,
  L: (idx) => (idx % 2 === 0) ? (idx + 1) : (idx - 1),
  T: (idx) => (idx % 2 === 0) ? idx : (4 - idx),
  I: (idx) => idx,
  "\\": (idx) => 1 - idx,
}

const ROTATION_MAP: Record<string, (r: number) => number> = {
  X: (_) => 0,
  L: (r) => r % 4,
  T: (r) => r % 4,
  I: (r) => r % 2,
  "\\": (r) => r % 2,
}

const CARDINALITY: Record<string, number> = {
  X: 1, L: 4, T: 4, I: 2, "\\": 2
};

export async function createStmTileset(
  xml: string, tilesDir: string,
  inferNeighborhood: boolean = false,
  inferredNeighborhoodWidth: number = 1,
  inferrenceTolerance: number = 40
): Promise<{ tileset: Tileset, tileSize: number }> {
  const parser = new DOMParser();
  const doc = parser.parseFromString(xml, "text/xml");

  const root = doc.querySelector("set");
  if (!root) throw new Error("Invalid WFC XML: No <set> tag found.");

  const tiles: Tile[] = [];
  const frequencies: number[] = [];
  let tileSize = -1;

  const tileTags = root.querySelectorAll("tiles tile");
  const tileNameMap: Map<string, { firstIdx: number; sym: string }> = new Map();

  // read and create tiles (w/ symmetry)
  for (const tag of tileTags) {
    const name = tag.getAttribute("name")!;
    const sym = (tag.getAttribute("symmetry") || "X").toUpperCase();
    const weight = parseFloat(tag.getAttribute("weight") || "1.0");

    const cardinality = CARDINALITY[sym] || 1;
    tileNameMap.set(name, { firstIdx: tiles.length, sym });
    
    const png = await decodePNG(`${tilesDir}${name}.png`);
    if (tileSize == -1) tileSize = png.width;
    else assert(tileSize == png.width, "All the tiles should have the same size.");
    
    const pixels = pngToPixelBlock(png);

    // add symmetries
    let rotated = pixels;
    for (let i = 0; i < cardinality; ++i) {
      tiles.push({ id: tiles.length, pixels: rotated });
      frequencies.push(weight);

      rotated = rotateBlock90(rotated);
    }
  }

  // read allowed neighbors
  const nTiles = tiles.length;
  const allowed: Tileset["allowedNeighbors"] = [
    Array.from({ length: nTiles }, () => new Bitset(nTiles)), // W
    Array.from({ length: nTiles }, () => new Bitset(nTiles)), // N
    Array.from({ length: nTiles }, () => new Bitset(nTiles)), // E
    Array.from({ length: nTiles }, () => new Bitset(nTiles)), // S
  ];

  if (inferNeighborhood) {
    for (const tile of tiles) {
      for (const neighTile of tiles) {
        for (let d = 0; d < 4; ++d) {
          if (allowed[d][tile.id].getBit(neighTile.id)) continue; // already computed

          if (compatible(tile, neighTile, d, inferredNeighborhoodWidth, inferrenceTolerance)) {
            allowed[d][tile.id].setBit(neighTile.id);
            allowed[OPPOSITE[d]][neighTile.id].setBit(tile.id);
          }
        }
      }
    }
  } else {
    const getTileIdx = (tileName: string, rot: number, reflected: boolean): number => {
      const parts = tileName.split(/\s+/);
      const name = parts[0];
      const tileRotation = parts.length > 1 ? parseInt(parts[1]) : 0;

      const tileInfo = tileNameMap.get(name)!;

      const rotationBase = reflected ? REFLECT_IDX[tileInfo.sym](tileRotation) : tileRotation;
      const rotationOffset = ROTATION_MAP[tileInfo.sym](rotationBase + rot);

      return tileInfo.firstIdx + rotationOffset;
    }

    const neighbors = doc.querySelectorAll("neighbors neighbor");
    for (const neigh of neighbors) {
      const leftstr = neigh.getAttribute("left")!;
      const rightstr = neigh.getAttribute("right")!;

      for (let refl = 0; refl < 2; ++refl) {
        const reflected = refl == 1;

        for (let rot = 0; rot < 4; ++rot) {
          const leftTile = getTileIdx(leftstr, rot, reflected);
          const rightTile = getTileIdx(rightstr, rot, reflected);
          const R = reflected ? leftTile : rightTile;
          const L = reflected ? rightTile : leftTile;

          // normal (no rotation)
          if (rot == 0) {
            allowed[0][R].setBit(L);
            allowed[2][L].setBit(R);
          }

          // rotated 90deg
          if (rot == 1) {
            allowed[3][R].setBit(L);
            allowed[1][L].setBit(R);
          }

          // rotated 180deg
          if (rot == 2) {
            allowed[2][R].setBit(L);
            allowed[0][L].setBit(R);
          }

          // rotated 270deg
          if (rot == 3) {
            allowed[1][R].setBit(L);
            allowed[3][L].setBit(R);
          }
        }
      }
    }
  }

  let totalFrequency = 0;
  for (let i = 0; i < frequencies.length; ++i) {
    totalFrequency += frequencies[i];
  }

  const normalizedFrequencies = frequencies.map(f => f / totalFrequency);

  return { tileset: new Tileset(tileSize, tiles, normalizedFrequencies, allowed), tileSize };
}

function compatible(tile: Tile, neighbor: Tile, dir: number, pixelWidth: number, tolerance: number): boolean {
  const ksize = tile.pixels.ksize;
  const verifyMargin = ksize - pixelWidth;

  let meanDist = 0;
  let startX = 0, endX = ksize, startY = 0, endY = ksize;
  let shiftX = 0, shiftY = 0;

  switch (dir) {
    case 0: // W
      endX = ksize - verifyMargin;
      shiftX = verifyMargin; 
      break;
    case 2: // E
      startX = verifyMargin;
      shiftX = -verifyMargin;
      break;
    case 1: // N
      endY = ksize - verifyMargin;
      shiftY = verifyMargin;
      break;
    case 3: // S
      startY = verifyMargin;
      shiftY = -verifyMargin;
      break;
  }

  for (let y = startY; y < endY; y++) {
    for (let x = startX; x < endX; x++) {
      const tileIdx = idx(y, x, ksize);
      const neighIdx = idx(y + shiftY, x + shiftX, ksize);

      meanDist += rgbaDist(tile.pixels.values[tileIdx], neighbor.pixels.values[neighIdx]);
    }
  }
  meanDist /= ksize * pixelWidth;

  return meanDist <= tolerance;
}

function rgbaDist(a: RGBA, b: RGBA): number {
  const vec = [a[0] - b[0], a[1] - b[1], a[2] - b[2], a[3] - b[3]];
  const dist = Math.sqrt(vec[0] * vec[0] + vec[1] * vec[1] + vec[2] * vec[2] + vec[3] * vec[3]);

  return dist;
}
