import type { Vec2 } from "@/core/types.ts";
import { Tileset } from "@/core/tileset";
import { Cell } from "@/core/solver/cell";
import { idx } from "@/utils/grid.ts";

type Heuristic = "SCANLINE" | "ENTROPY";

export class Wave {
  heuristic: Heuristic;

  width: number;
  height: number;

  tileset: Tileset;

  waveSize: number;
  wave: Cell[]; // each actual cell with its possible states management
  nCollapsed: number;

  constructor(width: number, height: number, tileset: Tileset, heuristic: Heuristic = "SCANLINE") {
    this.heuristic = heuristic;

    this.width = width;
    this.height = height;
    this.waveSize = width * height;

    this.tileset = tileset;
    this.nCollapsed = 0;
    this.wave = new Array<Cell>(this.waveSize);

    let i = 0;
    for (let y = 0; y < height; ++y)
      for (let x = 0; x < width; ++x)
        this.wave[i++] = new Cell({ x, y }, tileset);
  }

  collapse(
    onIterationFinish: () => void
  ): void {
    console.log("collapse started")
    while (this.nCollapsed != this.waveSize) {
      const cell = this.chooseNextCell();

      if (cell == -1) throw Error("Could not choose next cell to collapse.");

      this.observe(cell);

      // @ TODO handle errors and impossible cases
      // this.propagate(cell);

      onIterationFinish();
    }
    console.log("collapse ended")
  }

  chooseNextCell(): number {
    if (this.heuristic == "SCANLINE") {
      for (let i = 0; i < this.waveSize; ++i)
        if (!this.wave[i].isCollapsed) return i;
    }

    // @TODO add entropy heuristic

    return -1;
  }

  observe(cell: number): void {
    console.log("observing cell " + cell);
    this.wave[cell].collapse();
    this.nCollapsed++; // @TODO move to propagate
  }

  propagate(initialCell: number): void {
    const stack = [initialCell];
    const visited = new Array(this.waveSize).fill(false);

    while (stack.length > 0) {
      const cell = stack.pop()!;

      if (visited[cell]) continue;

      visited[cell] = true;
      const pos: Vec2 = this.wave[cell].pos;

      const left = idx(pos.y, pos.x - 1, this.width);
      const right = idx(pos.y, pos.x + 1, this.width);
      const up = idx(pos.y - 1, pos.x, this.width);
      const down = idx(pos.y + 1, pos.x, this.width);

      if (pos.x > 0 && !visited[left]) stack.push(left);
      if (pos.x < this.width - 1 && !visited[right]) stack.push(right);
      if (pos.y > 0 && !visited[up]) stack.push(up);
      if (pos.y < this.height - 1 && !visited[down]) stack.push(down);
    }
  }

  getCurrentColorsFlat(): Float32Array {
    const floatsPerCell = this.tileset.tileSize * this.tileset.tileSize * 4; // rgba
    const data = new Float32Array(this.waveSize * floatsPerCell);
    
    let idx = 0;
    for (const cell of this.wave) {
      for (const c of cell.currentColors.values) {
        const color = cell.isCollapsed ? c : cell.currentColors.averageColor;

        data[idx++] = color[0] / 255;
        data[idx++] = color[1] / 255;
        data[idx++] = color[2] / 255;
        data[idx++] = color[3] / 255;
      }
    }
    
    return data;
  }
}
