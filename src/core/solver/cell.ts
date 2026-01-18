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

  constructor(pos: Vec2, tileset: Tileset) {
    this.pos = pos;
    this.tileset = tileset;
    this.possibleStates = new Bitset(tileset.size, true);
    this.remainingStates = tileset.size;

    this.currentColor = tileset.averageColor;

    this.sumWeights = 0;
    this.sumWeightLogWeights = 0;

    // @TODO pass this in the constructor from the wave function
    for (const freq of tileset.frequencies) {
      this.sumWeights += freq;
      this.sumWeightLogWeights += freq * Math.log(freq);
    }

    this.entropy = Math.log(this.sumWeights) - this.sumWeightLogWeights / this.sumWeights;

    this.isCollapsed = false;
  }

  // choose at random one of the remaining states, considering tileset frequencies
  collapse(waveBan: (t: number) => void): boolean {
    const currentFrequencies: number[] = [];
    let sumFrequencies = 0;

    for (const [idx, possible] of this.possibleStates.bits()) {
      const freq = possible ? this.tileset.frequencies[idx] : 0;

      currentFrequencies.push(freq);
      sumFrequencies += freq;
    }

    if (sumFrequencies == 0) {
      console.log("Reached a contradiction.");
      return false;
    }

    const threshold = Math.random() * sumFrequencies;    

    let currentSum = 0;
    let finalIdx = -1;
    for (let i = 0; i < currentFrequencies.length; ++i) {
      currentSum += currentFrequencies[i];

      if (currentSum > threshold) {
        finalIdx = i;
        break;
      }
    }

    for (let i = 0; i < this.tileset.size; ++i)
      if (i != finalIdx) waveBan(i);

    this.isCollapsed = true;
    this.collapsedState = finalIdx;
    this.entropy = 0;

    this.currentColor = this.tileset.tiles[finalIdx].pixels.mainColor;

    return true;
  }

  // disallow tile in this cell (updates states)
  ban(tileIdx: number): boolean {
    if (!this.possibleStates.getBit(tileIdx)) return false;

    this.possibleStates.unsetBit(tileIdx);
    this.remainingStates -= 1;

    // @TODO add to propagate stack
    // @TODO update supporters data structure

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
