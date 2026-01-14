import { Tileset } from "@/core/tileset";

export class Wave {
  width: number;
  height: number;
  tileset: Tileset;

  constructor(width: number, height: number, tileset: Tileset) {
    this.width = width;
    this.height = height;
    this.tileset = tileset;
  }

  collapse(): void {}
}
