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
  C: (idx) => idx,
}

const ROTATION_MAP: Record<string, (r: number) => number> = {
  X: (_) => 0,
  L: (r) => r % 4,
  T: (r) => r % 4,
  I: (r) => r % 2,
  "\\": (r) => r % 2,
  C: (_) => 0,
}

const CARDINALITY: Record<string, number> = {
  X: 1, L: 4, T: 4, I: 2, "\\": 2, C: 1
};

export async function createStmTileset(
  xml: string, tilesDir: string,
  generateSymmetries: boolean = true,
  customTileset: boolean = false,
  inferNeighborhood: boolean = false,
  inferredNeighborhoodWidth: number = 0,
  inferrenceTolerance: number = 40,
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
    const sym = (tag.getAttribute("symmetry") || "C").toUpperCase();
    const weight = parseFloat(tag.getAttribute("weight") || "1.0");

    const cardinality = CARDINALITY[sym] || 1;

    tileNameMap.set(name, { firstIdx: tiles.length, sym });
    
    if (generateSymmetries || customTileset) {
      const vars = customTileset ? parseInt(tag.getAttribute("variations")!) : 1;
      const rotatedVariations: any[][] = Array.from({ length: cardinality }, () => []);

      for (let v = 0; v < vars; ++v) {
        let png;
        console.log(name)
        if (!customTileset) png = await decodePNG(`${tilesDir}/${name}.png`);
        else png = await decodePNG(`${tilesDir}/${name}_var_${v}.png`);

        if (tileSize == -1) tileSize = png.width;
        else assert(tileSize == png.width, "All the tiles should have the same size.");

        const pixels = pngToPixelBlock(png);

        // add symmetries
        let rotated = pixels;

        if (customTileset && inferNeighborhood) {
          for (let i = 0; i < cardinality; ++i) {
            tiles.push({ id: tiles.length, variations: [rotated] });
            frequencies.push(weight);
            rotated = rotateBlock90(rotated);
          }
        } else {
          for (let i = 0; i < cardinality; ++i) {
            rotatedVariations[i].push(rotated);
            rotated = rotateBlock90(rotated);
          }
        }
      }

      if (!customTileset || !inferNeighborhood) {
        for (let i = 0; i < cardinality; ++i) {
          tiles.push({ id: tiles.length, variations: rotatedVariations[i] });
          frequencies.push(weight);
        }
      }
    } else {
      for (let i = 0; i < cardinality; ++i) {
        const png = await decodePNG(`${tilesDir}/${name} ${i}.png`);

        if (tileSize == -1) tileSize = png.width;
        else assert(tileSize == png.width, "All the tiles should have the same size.");


        tiles.push({ id: tiles.length, variations: [pngToPixelBlock(png)] });
        frequencies.push(weight);
      }
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
    // 1/6 of the tile
    const overlapWidth = inferredNeighborhoodWidth > 1 
        ? inferredNeighborhoodWidth 
        : Math.max(3, Math.floor(tileSize / 6)); 
        
    const toleranceFactor = 1.1; 
    
    const errorMatrix = new Map<string, number>();
    for (const tile of tiles) {
      for (const neighTile of tiles) {
        for (let d = 0; d < 4; ++d) {
          const key = `${tile.id}-${neighTile.id}-${d}`;
          if (errorMatrix.has(key)) continue;
          
          const err = getOverlapError(tile, neighTile, d, overlapWidth);
          errorMatrix.set(key, err);
          errorMatrix.set(`${neighTile.id}-${tile.id}-${OPPOSITE[d]}`, err);
        }
      }
    }

    // find the best match for each tile/direction, and accept anything within 10% of it
    for (const tile of tiles) {
      for (let d = 0; d < 4; ++d) {
        let minError = Infinity;
        
        for (const neighTile of tiles) {
          const err = errorMatrix.get(`${tile.id}-${neighTile.id}-${d}`)!;
          if (err < minError) minError = err;
        }

        const allowedErrorLimit = Math.max(minError * toleranceFactor, minError + 1);

        for (const neighTile of tiles) {
          const err = errorMatrix.get(`${tile.id}-${neighTile.id}-${d}`)!;
          
          // within 10% of the best match
          if (err <= allowedErrorLimit && err < inferrenceTolerance) {
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

    const shouldRotateRule = (t1: string, t2: string) => {
      const t1Name = t1.split(/\s+/)[0];
      const t2Name = t2.split(/\s+/)[0];
      const sym1 = tileNameMap.get(t1Name)!.sym;
      const sym2 = tileNameMap.get(t2Name)!.sym;
      return sym1 !== "C" && sym2 !== "C";
    };

    const neighbors = doc.querySelectorAll("neighbors neighbor");
    for (const neigh of neighbors) {
      const leftstr = neigh.getAttribute("left");
      const rightstr = neigh.getAttribute("right");
      const topstr = neigh.getAttribute("top");
      const bottomstr = neigh.getAttribute("bottom");

      if (leftstr && rightstr) {
        const rotateRule = shouldRotateRule(leftstr, rightstr);
        const maxRot = rotateRule ? 4 : 1;
        const maxRefl = rotateRule ? 2 : 1;

        for (let refl = 0; refl < maxRefl; ++refl) {
          const reflected = refl == 1;

          for (let rot = 0; rot < maxRot; ++rot) {
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

      if (topstr && bottomstr) {
        const rotateRule = shouldRotateRule(topstr, bottomstr);
        const maxRot = rotateRule ? 4 : 1;
        const maxRefl = rotateRule ? 2 : 1;

        for (let refl = 0; refl < maxRefl; ++refl) {
          const reflected = refl == 1;
          for (let rot = 0; rot < maxRot; ++rot) {
            const topTile = getTileIdx(topstr, rot, reflected);
            const bottomTile = getTileIdx(bottomstr, rot, reflected);
            
            // mirroring horizontally does not swap top and bottom
            const T = topTile;
            const B = bottomTile;

            if (rot == 0) {
              allowed[1][B].setBit(T);
              allowed[3][T].setBit(B);
            }

            // rotated 90deg
            if (rot == 1) {
              allowed[2][B].setBit(T);
              allowed[0][T].setBit(B);
            }

            // rotated 180deg
            if (rot == 2) {
              allowed[3][B].setBit(T);
              allowed[1][T].setBit(B);
            }

            // rotated 270deg
            if (rot == 3) {
              allowed[0][B].setBit(T);
              allowed[2][T].setBit(B);
            }
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

function getOverlapError(tile: Tile, neighbor: Tile, dir: number, pixelWidth: number): number {
  const pixels = tile.variations[0];
  const ksize = pixels.ksize;
  const verifyMargin = ksize - pixelWidth;

  let totalSSD = 0;
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

  let pixelCount = 0;
  for (let y = startY; y < endY; y++) {
    for (let x = startX; x < endX; x++) {
      const tileIdx = idx(y, x, ksize);
      const neighIdx = idx(y + shiftY, x + shiftX, ksize);

      console.log(pixels.values[tileIdx], neighbor)
      totalSSD += rgbaLabSSD(pixels.values[tileIdx], neighbor.variations[0].values[neighIdx]);
      pixelCount++;
    }
  }
  
  // mean squared error for the overlap patch
  return totalSSD / pixelCount;
}

// cache to store colors already converted
const labCache = new Map<number, [number, number, number]>();

function rgbToLabCached(r: number, g: number, b: number): [number, number, number] {
  const key = (r << 16) | (g << 8) | b;
  
  const cached = labCache.get(key);
  if (cached !== undefined) return cached;

  // sRGB to linear RGB, then to CIE XYZ
  let rL = r / 255.0;
  let gL = g / 255.0;
  let bL = b / 255.0;

  rL = rL > 0.04045 ? Math.pow((rL + 0.055) / 1.055, 2.4) : rL / 12.92;
  gL = gL > 0.04045 ? Math.pow((gL + 0.055) / 1.055, 2.4) : gL / 12.92;
  bL = bL > 0.04045 ? Math.pow((bL + 0.055) / 1.055, 2.4) : bL / 12.92;

  const x = (rL * 0.4124564 + gL * 0.3575761 + bL * 0.1804375) * 100;
  const y = (rL * 0.2126729 + gL * 0.7151522 + bL * 0.0721750) * 100;
  const z = (rL * 0.0193339 + gL * 0.1191920 + bL * 0.9503041) * 100;

  // CIE XYZ to CIELAB
  const refX = 95.047;
  const refY = 100.000;
  const refZ = 108.883;

  let xN = x / refX;
  let yN = y / refY;
  let zN = z / refZ;

  xN = xN > 0.008856 ? Math.pow(xN, 1.0 / 3.0) : (7.787 * xN) + (16.0 / 116.0);
  yN = yN > 0.008856 ? Math.pow(yN, 1.0 / 3.0) : (7.787 * yN) + (16.0 / 116.0);
  zN = zN > 0.008856 ? Math.pow(zN, 1.0 / 3.0) : (7.787 * zN) + (16.0 / 116.0);

  const L = (116.0 * yN) - 16.0;
  const A = 500.0 * (xN - yN);
  const B = 200.0 * (yN - zN);

  const lab: [number, number, number] = [L, A, B];
  
  labCache.set(key, lab);
  return lab;
}

function rgbaLabSSD(a: RGBA, b: RGBA): number {
  const [l1, a1, b1] = rgbToLabCached(a[0], a[1], a[2]);
  const [l2, a2, b2] = rgbToLabCached(b[0], b[1], b[2]);

  const dl = l1 - l2;
  const da = a1 - a2;
  const db = b1 - b2;
  
  const dAlpha = (a[3] - b[3]) * (100.0 / 255.0);

  return (dl * dl) + (da * da) + (db * db) + (dAlpha * dAlpha);
}