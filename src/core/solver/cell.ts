import type { PixelData, Vec2 } from "@/core/types";
import { Bitset } from "@/core/bitset";
import type { Tileset } from "@/core/tileset";
import { PixelBlock } from "../pixels";

export class Cell {
  readonly pos: Vec2;
  readonly tileset: Tileset;
  
  possibleStates: Bitset; // each current valid state for this cell
  remainingStates: number; // the amount of valid states for this cell

  isCollapsed: boolean;
  collapsedState: number | undefined; // final state (if collapsed)

  currentColors: PixelData;

  // entropy related values
  sumWeights: number;
  sumWeightLogWeights: number;
  entropy: number;

  constructor(pos: Vec2, tileset: Tileset) {
    this.pos = pos;
    this.tileset = tileset;
    this.possibleStates = new Bitset(tileset.size, true);
    this.remainingStates = tileset.size;

    this.currentColors = new PixelBlock(tileset.tileSize);
    this.currentColors.setAll(tileset.averageColor);

    this.sumWeights = 0;
    this.sumWeightLogWeights = 0;
    this.entropy = 0;

    for (const freq of tileset.frequencies) {
      this.sumWeights += freq;
      this.sumWeightLogWeights += freq * Math.log(freq);
    }

    this.isCollapsed = false;
  }

  collapse(): void {
    this.isCollapsed = true;

    // @ TODO choose at random one of the states, considering tileset frequencies for the states

    this.entropy = 0;
    this.remainingStates = 1;

    // @TODO update current colors
  }

  apply(): void {
    // @TODO update current colors
  }
}
