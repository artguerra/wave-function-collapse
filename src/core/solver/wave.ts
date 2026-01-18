import { DX, DY, OPPOSITE, type Vec2 } from "@/core/types.ts";
import { Tileset } from "@/core/tileset";
import { Cell } from "@/core/solver/cell";
import { idx } from "@/utils/grid.ts";

type Heuristic = "SCANLINE" | "ENTROPY";

export class Wave {
  heuristic: Heuristic;

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
  nCollapsed: number;

  constructor(width: number, height: number, tileset: Tileset, heuristic: Heuristic = "ENTROPY") {
    this.heuristic = heuristic;

    this.width = width;
    this.height = height;
    this.waveSize = width * height;

    this.nCollapsed = 0;
    this.propagationStack = [];
    this.supporters = Array.from({ length: this.waveSize }, () =>
      Array.from({ length: tileset.size }, () => new Array(4))
    );

    this.tileset = tileset;
    this.wave = new Array<Cell>(this.waveSize);

    this.totalWeightSum = 0;
    this. totalWeightLogWeightsSum = 0;
    for (const freq of tileset.frequencies) {
      this.totalWeightSum += freq;
      this.totalWeightLogWeightsSum += freq * Math.log(freq);
    }

    this.reset();
  }

  async collapse(
    onPropagate: () => Promise<void>
  ): Promise<void> {
    while (this.nCollapsed != this.waveSize) {
      try {
        const cell = this.chooseNextCell();
        if (cell == -1) throw Error("Could not choose next cell to collapse.");

        if (!this.observe(cell))
          throw "WFC reached an impossible state while observing.";

        if (!this.propagate())
          throw "WFC reached an impossible state while propagating.";
      } catch(msg) {
        console.warn(msg);
        this.reset();
      }

      await onPropagate();
    }
  }

  chooseNextCell(): number {
    if (this.heuristic == "SCANLINE") {
      for (let i = 0; i < this.waveSize; ++i)
        if (!this.wave[i].isCollapsed) return i;
    }

    if (this.heuristic == "ENTROPY") {
      let minEntropy = Number.MAX_VALUE;
      let minIdx = 0;

      for (let i = 0; i < this.waveSize; ++i) {
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

    if (chosenTile == -1) {
      console.warn("Contradiction reached when observing cell: " + cellIdx);
      return false;
    }

    for (const tileIdx of cell.possibleStates) {
      if (tileIdx != chosenTile) this.ban(cellIdx, tileIdx);
    }

    cell.collapseTo(chosenTile);
    this.nCollapsed++;

    return true;
  }

  propagate(): boolean {
    while (this.propagationStack.length > 0) {
      const [cell, tile] = this.propagationStack.pop()!;

      const pos: Vec2 = this.wave[cell].pos;

      for (let d = 0; d < 4; ++d) {
        const nx = pos.x + DX[d];
        const ny = pos.y + DY[d];

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
    this.nCollapsed = 0;
    this.propagationStack = [];

    let i = 0;
    for (let y = 0; y < this.height; ++y) {
      for (let x = 0; x < this.width; ++x) {
        this.wave[i++] = new Cell(
          { x, y }, this.tileset, this.totalWeightSum, this.totalWeightLogWeightsSum
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

  getCurrentColorsFlat(): Float32Array {
    const data = new Float32Array(this.waveSize * 4);

    let idx = 0;
    for (const cell of this.wave) {
      const color = cell.currentColor;

      data[idx++] = color[0] / 255;
      data[idx++] = color[1] / 255;
      data[idx++] = color[2] / 255;
      data[idx++] = color[3] / 255;
    }

    return data;
  }
}
