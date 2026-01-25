import type { Vec2 } from "@/core/types.ts";
import { Tileset } from "@/core/tileset";
import { Cell } from "@/core/solver/cell";
import { idx, DX, DY, OPPOSITE } from "@/utils/grid.ts";

type Heuristic = "SCANLINE" | "ENTROPY";

export class Wave {
  overlapping: boolean;
  heuristic: Heuristic;
  toroidal: boolean;

  width: number;
  height: number;

  tileset: Tileset;
  totalWeightSum: number;
  totalWeightLogWeightsSum: number;

  waveSize: number;
  wave: Cell[]; // each actual cell with its possible states management

  // propagation data structures
  propagationStack: [cell: number, tile: number][];
  supporters: number[][][]; // how many supporters a specific tile in a specific cell has in each direction

  constructor(
    width: number, height: number,
    tileset: Tileset, overlapping: boolean,
    heuristic: Heuristic = "ENTROPY",
    toroidal: boolean = false
  ) {
    this.overlapping = overlapping;
    this.heuristic = heuristic;
    this.toroidal = toroidal;

    this.width = width;
    this.height = height;
    this.waveSize = width * height;

    this.propagationStack = [];
    this.supporters = Array.from({ length: this.waveSize }, () =>
      Array.from({ length: tileset.size }, () => new Array(4))
    );

    this.tileset = tileset;
    this.wave = new Array<Cell>(this.waveSize);

    this.totalWeightSum = 0;
    this.totalWeightLogWeightsSum = 0;
    for (const freq of tileset.frequencies) {
      this.totalWeightSum += freq;
      this.totalWeightLogWeightsSum += freq * Math.log(freq);
    }

    this.reset();
  }

  async collapse(
    onPropagate: () => Promise<void>
  ): Promise<void> {
    let cell = this.chooseNextCell();
    while (cell != -1) {
      try {
        if (!this.observe(cell))
          throw "WFC reached an impossible state while observing.";
        if (!this.propagate())
          throw "WFC reached an impossible state while propagating.";
      } catch (msg) {
        console.warn(msg);
        this.reset();
      }

      await onPropagate();
      cell = this.chooseNextCell();
    }

    // all tiles chosen here
    console.log("WFC finished.")
  }

  chooseNextCell(): number {
    const ksize = this.tileset.tileSize;

    if (this.heuristic == "SCANLINE") {
      for (let i = 0; i < this.waveSize; ++i) {
        // check if overlapping block can be placed
        if (this.overlapping && !this.toroidal) {
          if (this.wave[i].pos.x + ksize > this.width || this.wave[i].pos.y + ksize > this.height)
            continue;
        }

        if (!this.wave[i].isCollapsed) return i;
      }
    }

    if (this.heuristic == "ENTROPY") {
      let minEntropy = Number.MAX_VALUE;
      let minIdx = -1;

      for (let i = 0; i < this.waveSize; ++i) {
        // check if overlapping block can be placed
        if (this.overlapping && !this.toroidal) {
          if (this.wave[i].pos.x + ksize > this.width || this.wave[i].pos.y + ksize > this.height)
            continue;
        }

        if (!this.wave[i].isCollapsed) {
          const noise = Math.random() * 1e-6;
          const entropy = this.wave[i].entropy + noise;

          if (entropy < minEntropy) {
            minEntropy = entropy;
            minIdx = i;
          }
        }
      }

      return minIdx;
    }

    return -1;
  }

  observe(cellIdx: number): boolean {
    const cell = this.wave[cellIdx];
    const chosenTile = cell.chooseRandomTile();

    if (chosenTile == -1) return false;

    for (const tileIdx of cell.possibleStates) {
      if (tileIdx != chosenTile) this.ban(cellIdx, tileIdx);
    }

    cell.collapseTo(chosenTile);

    return true;
  }

  propagate(): boolean {
    while (this.propagationStack.length > 0) {
      const [cell, tile] = this.propagationStack.pop()!;

      const pos: Vec2 = this.wave[cell].pos;

      for (let d = 0; d < 4; ++d) {
        let nx = pos.x + DX[d];
        let ny = pos.y + DY[d];

        if (this.toroidal) {
          nx = (this.width + nx) % this.width;
          ny = (this.height + ny) % this.height;
        }

        if (nx < 0 || nx >= this.width || ny < 0 || ny >= this.height) continue;

        const neighCell = idx(ny, nx, this.width);

        // for each possible neighbor of this tile, update support
        for (const neighTile of this.tileset.allowedNeighbors[d][tile]) {
          const sup = this.supporters[neighCell][neighTile];

          if (!this.wave[neighCell].possibleStates.getBit(neighTile)) continue;

          sup[OPPOSITE[d]]--;
          if (sup[OPPOSITE[d]] == 0) this.ban(neighCell, neighTile);
        }
      }
    }

    return true;
  }

  ban(cell: number, tile: number) {
    const changed = this.wave[cell].ban(tile);

    if (changed) {
      this.propagationStack.push([cell, tile]);
      for (let d = 0; d < 4; ++d) this.supporters[cell][tile][d] = 0;
    }
  }

  reset(): void {
    this.propagationStack = [];

    let i = 0;
    for (let y = 0; y < this.height; ++y) {
      for (let x = 0; x < this.width; ++x) {
        this.wave[i++] = new Cell(
          { x, y }, this.tileset, this.totalWeightSum, this.totalWeightLogWeightsSum,
        );
      }
    }

    // reset supporters array
    for (let cell = 0; cell < this.waveSize; ++cell) {
      for (let tile = 0; tile < this.tileset.size; ++tile) {
        for (let dir = 0; dir < 4; ++dir) {
          this.supporters[cell][tile][dir] = this.tileset.allowedNeighbors[dir][tile].count();
        }
      }
    }
  }

  getTexturePixels(): Uint8ClampedArray {
    const ksize = this.tileset.tileSize;
    
    const scale = this.overlapping ? 1 : ksize;
    const outWidth = this.width * scale;
    const outHeight = this.height * scale;

    const data = new Uint8ClampedArray(outWidth * outHeight * 4);

    for (let i = 0; i < this.waveSize; i++) {
      const cell = this.wave[i];
      
      const startX = cell.pos.x * scale;
      const startY = cell.pos.y * scale;

      if (this.overlapping) {
        const idx = (startY * outWidth + startX) * 4;
        const color = cell.currentMainColor;

        data[idx] = color[0];
        data[idx + 1] = color[1];
        data[idx + 2] = color[2];
        data[idx + 3] = color[3];
      } 
      else {
        // simple tiled model
        // if collapsed, draw the actual detailed tile pixels
        // if not collapsed, draw the average color of remaining options
        const pixels = cell.isCollapsed 
           ? this.tileset.tiles[cell.collapsedState!].pixels.values
           : null; 
        
        const fallbackColor = cell.currentAverageColor;

        for (let y = 0; y < ksize; y++) {
          for (let x = 0; x < ksize; x++) {
            const texIdx = idx(startY + y, startX + x, outWidth) *  4;

            if (pixels) {
               const localIdx = idx(y, x, ksize);
               data[texIdx + 0] = pixels[localIdx][0];
               data[texIdx + 1] = pixels[localIdx][1];
               data[texIdx + 2] = pixels[localIdx][2];
               data[texIdx + 3] = pixels[localIdx][3];
            } else {
               // Draw solid average color
               data[texIdx + 0] = fallbackColor[0];
               data[texIdx + 1] = fallbackColor[1];
               data[texIdx + 2] = fallbackColor[2];
               data[texIdx + 3] = 255;
            }
          }
        }
      }
    }

    return data;
  }
}
