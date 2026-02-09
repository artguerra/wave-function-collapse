import { idx, OPPOSITE } from "@/utils/grid";
import { decodePNG, dataAt, mirrorBlockX, mirrorBlockY, rotateBlock90 } from "@/utils/image";
import { Tileset } from "@/core/tileset";
import { Bitset } from "@/core/bitset";
import { PixelBlock } from "@/core/pixels";
import type { Tile, RGBA, SymmetryMode } from "@/core/types";

export async function createOverlappingTileset(
  imagePath: string,
  tileSize: number,
  symmetryMode: SymmetryMode = "ALL",
) {
  const blocks = await extractPixelBlocks(imagePath, tileSize, symmetryMode);
  return createTileset(tileSize, blocks);
}

async function extractPixelBlocks(
  path: string,
  ksize: number,
  symmetryMode: "ALL" | "MIRROR_X" | "MIRROR_Y" | "MIRROR_XY" | "NONE" = "ALL"
): Promise<PixelBlock[]> {
  const png = await decodePNG(path);
  const blocks: PixelBlock[] = [];
  
  const xmax = png.width - ksize;
  const ymax = png.height - ksize;

  for (let y = 0; y <= ymax; ++y) {
    for (let x = 0; x <= xmax; ++x) {
      const block = dataAt(png, y, x, ksize);

      blocks.push(block);

      if (symmetryMode == "MIRROR_X") {
        blocks.push(mirrorBlockX(block));
      }

      if (symmetryMode == "MIRROR_Y") {
        blocks.push(mirrorBlockY(block));
      }

      if (symmetryMode == "MIRROR_XY") {
        blocks.push(mirrorBlockX(block));
        blocks.push(mirrorBlockY(block));
        blocks.push(mirrorBlockY(mirrorBlockX(block)));
      }

      if (symmetryMode == "ALL") {
        let current = block;
        blocks.push(mirrorBlockX(current));

        for (let r = 0; r < 3; ++r) {
          const rotated = rotateBlock90(current);

          blocks.push(rotated);
          blocks.push(mirrorBlockX(rotated));

          current = rotated;
        }
      }
    }
  }

  return blocks;
}

function createTileset(
  tileSize: number,
  rawTiles: PixelBlock[],
): Tileset {
  const tiles: Tile[] = [];
  const frequencies: number[] = [];

  const tileIndexMap = new Map<string, Tile["id"]>();

  // create new unique tiles in the tileset
  for (let i = 0; i < rawTiles.length; ++i) {
    const hash = rawTiles[i].hash;

    if (!tileIndexMap.has(hash)) {
      const id = tiles.length;
      tiles.push({ id, pixels: rawTiles[i] });

      frequencies.push(1);
      tileIndexMap.set(hash, id);
    } else {
      frequencies[tileIndexMap.get(hash)!] += 1;
    }
  }

  // find allowed neighbors
  const nTiles = tiles.length;
  const allowed: Tileset["allowedNeighbors"] = [
    Array.from({ length: nTiles }, () => new Bitset(nTiles)), // W
    Array.from({ length: nTiles }, () => new Bitset(nTiles)), // N
    Array.from({ length: nTiles }, () => new Bitset(nTiles)), // E
    Array.from({ length: nTiles }, () => new Bitset(nTiles)), // S
  ];
  

  // overlapping model: check every other tile for compatibility
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
    }
  }

  // normalize frequencies
  let totalFrequency = 0;
  for (let i = 0; i < frequencies.length; ++i) {
    totalFrequency += frequencies[i];
  }

  const normalizedFrequencies = frequencies.map(f => f / totalFrequency);

  return new Tileset(tileSize, tiles, normalizedFrequencies, allowed);
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
      const tileIdx = idx(y, x, ksize);
      const neighIdx = idx(y + shiftY, x + shiftX, ksize);

      if (!rgbaEqual(tile.pixels.values[tileIdx], neighbor.pixels.values[neighIdx])) return false;
    }
  }

  return true;
}

function rgbaEqual(a: RGBA, b: RGBA): boolean {
  return a[0] === b[0] && a[1] === b[1] && a[2] === b[2] && a[3] === b[3];
}
