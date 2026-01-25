import { assert } from "@/utils";
import { decodePNG, pngToPixelBlock, rotateBlock90 } from "@/utils/image";
import type { Tile } from "@/core/types";
import { Bitset } from "@/core/bitset";
import { Tileset } from "@/core/tileset";

const SYMMETRY_MAP: Record<string, (r: number) => number> = {
  X: (_) => 0,
  L: (r) => r % 4,
  T: (r) => r % 4,
  I: (r) => r % 2,
  "\\": (r) => r % 2,
}

const CARDINALITY: Record<string, number> = {
  X: 1, L: 4, T: 4, I: 2, "\\": 2
};

export async function createSimpleTiledTileset(
  xml: string, tilesDir: string
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
    tiles.push({ id: tiles.length, pixels });
    frequencies.push(weight);

    // add symmetries
    let rotated = pixels;
    for (let i = 1; i < cardinality; ++i) {
      rotated = rotateBlock90(rotated);
      tiles.push({ id: tiles.length, pixels: rotated });
    
      frequencies.push(weight);
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
  
  const getTileIdx = (tileName: string, rot: number): number => {
    const parts = tileName.split(/\s+/);
    const name = parts[0];
    const tileRotation = parts.length > 1 ? parseInt(parts[1]) : 0;

    const tileInfo = tileNameMap.get(name)!;

    const offset = SYMMETRY_MAP[tileInfo.sym](tileRotation + rot);
    return tileInfo.firstIdx + offset;
  }

  const neighbors = doc.querySelectorAll("neighbors neighbor");
  for (const neigh of neighbors) {
    const leftstr = neigh.getAttribute("left")!;
    const rightstr = neigh.getAttribute("right")!;

    for (let r = 0; r < 4; ++r) {
      const leftTile = getTileIdx(leftstr, r);
      const rightTile = getTileIdx(rightstr, r);

      // normal (no rotation)
      if (r == 0) {
        allowed[0][rightTile].setBit(leftTile);
        allowed[2][leftTile].setBit(rightTile);
      }

      // rotated 90deg
      if (r == 1) {
        allowed[3][rightTile].setBit(leftTile);
        allowed[1][leftTile].setBit(rightTile);
      }

      // rotated 180deg
      if (r == 2) {
        allowed[2][rightTile].setBit(leftTile);
        allowed[0][leftTile].setBit(rightTile);
      }

      // rotated 270deg
      if (r == 3) {
        allowed[1][rightTile].setBit(leftTile);
        allowed[3][leftTile].setBit(rightTile);
      }
    }
  }

  // console.log("neighs of tile 0: ");
  // for (let d = 0; d < 4; ++d) {
  //   console.log("direction: ", d);
  //   for (const n of allowed[d][0]) {
  //     console.log(n)
  //   }
  // }

  let totalFrequency = 0;
  for (let i = 0; i < frequencies.length; ++i) {
    totalFrequency += frequencies[i];
  }

  const normalizedFrequencies = frequencies.map(f => f / totalFrequency);

  return { tileset: new Tileset(tileSize, tiles, normalizedFrequencies, allowed), tileSize };
}

