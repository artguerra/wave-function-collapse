import type { RGBA, Vec2 } from "@/core/types";
import { Bitset } from "@/core/bitset";
import type { Tileset } from "@/core/tileset";

export class Cell {
  readonly pos: Vec2;
  readonly tileset: Tileset;
  
  possibleStates: Bitset; // each current valid state for this cell
  remainingStates: number; // the amount of valid states for this cell

  isCollapsed: boolean;
  collapsedState: number | undefined; // final state (if collapsed)

  currentColor: RGBA;

  // entropy related values
  sumWeights: number;
  sumWeightLogWeights: number;
  entropy: number;

  constructor(pos: Vec2, tileset: Tileset, weightSum: number, weightLogWeightSum: number) {
    this.pos = pos;
    this.tileset = tileset;
    this.possibleStates = new Bitset(tileset.size, true);
    this.remainingStates = tileset.size;

    this.currentColor = tileset.averageColor;

    this.sumWeights = weightSum;
    this.sumWeightLogWeights = weightLogWeightSum;

    this.entropy = Math.log(this.sumWeights) - this.sumWeightLogWeights / this.sumWeights;

    this.isCollapsed = false;
  }

  // choose at random one of the remaining states, considering tileset frequencies
  chooseRandomTile(): number {
    const currentFrequencies: number[] = [];
    let sumFrequencies = 0;

    for (const [idx, possible] of this.possibleStates.bits()) {
      const freq = possible ? this.tileset.frequencies[idx] : 0;

      currentFrequencies.push(freq);
      sumFrequencies += freq;
    }

    if (sumFrequencies == 0) return -1;

    const threshold = Math.random() * sumFrequencies;    

    let currentSum = 0;
    for (let i = 0; i < currentFrequencies.length; ++i) {
      currentSum += currentFrequencies[i];

      if (currentSum > threshold) return i;
    }

    return -1;
  }

  collapseTo(tileIdx: number): void {
    this.isCollapsed = true;
    this.collapsedState = tileIdx;
    this.entropy = 0;

    this.currentColor = this.tileset.tiles[tileIdx].pixels.mainColor;
  }

  // disallow tile in this cell (updates states)
  ban(tileIdx: number): boolean {
    if (!this.possibleStates.getBit(tileIdx)) return false;

    this.possibleStates.unsetBit(tileIdx);
    this.remainingStates -= 1;

    const freq = this.tileset.frequencies[tileIdx];
    this.sumWeights -= freq;
    this.sumWeightLogWeights -= Math.log(freq) * freq;
    this.entropy = Math.log(this.sumWeights) - this.sumWeightLogWeights / this.sumWeights;

    this.updateCurrentColors();

    return true;
  }

  updateCurrentColors(): void {
    const avg: RGBA = [0, 0, 0, 0];
    for (const allowed of this.possibleStates) {
      for (let i = 0; i < 4; ++i) avg[i] += this.tileset.tiles[allowed].pixels.mainColor[i];
    }
    
    const total = this.possibleStates.count();
    for (let i = 0; i < 4; ++i) avg[i] /= total;

    this.currentColor = avg;
  }
}
