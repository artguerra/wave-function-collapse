import type { RGBA, Vec2 } from "@/core/types";
import { Bitset } from "@/core/bitset";
import type { Tileset } from "@/core/tileset";

export class Cell {
  readonly pos: Vec2;
  readonly tileset: Tileset;
  
  possibleStates: Bitset; // each current valid state for this cell
  remainingStates: number; // the amount of valid states for this cell
  remainingVariations: number; // the sum of variations of valid states

  isCollapsed: boolean;
  collapsedState: number | undefined; // final state (if collapsed)
  collapsedVariation: number | undefined; // final tile variation (if collapsed)

  mainColorSum: RGBA; // for the overlapping model visualisation
  averageColorSum: RGBA; // for the simple tiled model visualisation
  currentMainColor: RGBA;
  currentAverageColor: RGBA;

  // entropy related values
  sumWeights: number;
  sumWeightLogWeights: number;
  entropy: number;

  constructor(pos: Vec2, tileset: Tileset, weightSum: number, weightLogWeightSum: number) {
    this.pos = pos;
    this.tileset = tileset;
    this.possibleStates = new Bitset(tileset.size, true);
    this.remainingStates = tileset.size;
    this.remainingVariations = tileset.totalVariations;

    this.mainColorSum = [...tileset.mainColorSum];
    this.averageColorSum = [...tileset.averageColorSum];
    this.currentMainColor = [0, 0, 0, 0];
    this.currentAverageColor = [0, 0, 0, 0];
    this.updateAverageColor();

    this.sumWeights = weightSum;
    this.sumWeightLogWeights = weightLogWeightSum;

    this.entropy = Math.log(this.sumWeights) - this.sumWeightLogWeights / this.sumWeights;

    this.isCollapsed = false;
  }

  // choose at random one of the remaining states, considering tileset frequencies
  chooseRandomTile(
    densities?: number[],
    denseTilesPerMap?: Bitset[],
    strict?: boolean,
    flow?: Vec2
  ): number {
    const usingDensity = densities !== undefined && denseTilesPerMap;
    const usingFlow = flow !== undefined && (flow.x !== 0 || flow.y !== 0);

    const currentFrequencies: number[] = [];
    const freqIsDense = new Bitset(this.possibleStates.size);
    const freqIsFlow = new Bitset(this.possibleStates.size);

    let sumFrequencies = 0, sumDenseFreqs = 0, sumFlowFreqs = 0;

    for (const [idx, possible] of this.possibleStates.bits()) {
      if (!possible) {
        currentFrequencies.push(0);
        continue;
      }

      let freq = this.tileset.frequencies[idx];
      const STRENGTH = 100; 

      if (usingDensity) {
        let isDenseInAny = false;
        for (let i = 0; i < densities.length; ++i) {
          const density = densities[i];
          const isDense = density > 0 && denseTilesPerMap[i].getBit(idx);

          isDenseInAny ||= isDense;

          if (isDense) {
            freq += density * STRENGTH;
          }
        }

        if (isDenseInAny) {
          sumDenseFreqs += freq;
          freqIsDense.setBit(idx);
        }
      }

      if (usingFlow) {
        const strengths = this.tileset.tiles[idx].dirStrength;
        if (strengths) {
          const sx = flow.x < 0 ? strengths[0] : strengths[2];
          const sy = flow.y < 0 ? strengths[1] : strengths[3];

          const score = Math.abs(flow.x) * sx + Math.abs(flow.y) * sy;

          const EPS = 1e-4;
          if (score > EPS) {
            freq += score * STRENGTH;

            sumFlowFreqs += freq;
            freqIsFlow.setBit(idx);
          }
        }
      }

      currentFrequencies.push(freq);
      sumFrequencies += freq;
    }

    if (sumFrequencies === 0) return -1; // no tiles allowed remaining

    // if strict is true, we only allow tiles that meet the painted criteria
    let enforceDensity = usingDensity && strict && sumDenseFreqs > 0;
    let enforceFlow = usingFlow && strict && sumFlowFreqs > 0;
    let validSum = 0;

    for (let i = 0; i < currentFrequencies.length; ++i) {
      if (currentFrequencies[i] === 0) continue;
      
      const passDensity = !enforceDensity || freqIsDense.getBit(i);
      const passFlow = !enforceFlow || freqIsFlow.getBit(i);

      if (passDensity && passFlow) validSum += currentFrequencies[i];
    }

    if (validSum === 0) {
       enforceDensity = false;
       enforceFlow = false;
       validSum = sumFrequencies;
    }

    const threshold = Math.random() * validSum;

    let currentSum = 0;
    for (let i = 0; i < currentFrequencies.length; ++i) {
      if (currentFrequencies[i] === 0) continue;

      const passDensity = !enforceDensity || freqIsDense.getBit(i);
      const passFlow = !enforceFlow || freqIsFlow.getBit(i);

      if (passDensity && passFlow) {
        currentSum += currentFrequencies[i];
        if (currentSum >= threshold) return i;
      }
    }

    return -1;
  }

  collapseTo(tileIdx: number): void {
    this.isCollapsed = true;
    this.collapsedState = tileIdx;
    this.entropy = 0;

    const tile = this.tileset.tiles[tileIdx];

    const v = Math.floor(Math.random() * tile.variations.length);
    this.currentMainColor = tile.variations[v].mainColor;
    this.currentAverageColor = tile.variations[v].averageColor;
    this.collapsedVariation = v;
  }

  // disallow tile in this cell (updates states)
  ban(tileIdx: number): boolean {
    if (!this.possibleStates.getBit(tileIdx)) return false;

    const tile = this.tileset.tiles[tileIdx];
    this.possibleStates.unsetBit(tileIdx);
    this.remainingStates -= 1;
    this.remainingVariations -= tile.variations.length;

    const freq = this.tileset.frequencies[tileIdx];
    this.sumWeights -= freq;
    this.sumWeightLogWeights -= Math.log(freq) * freq;
    this.entropy = Math.log(this.sumWeights) - this.sumWeightLogWeights / this.sumWeights;

    for (let v = 0; v < tile.variations.length; ++v) {
      for (let i = 0; i < 4; ++i) {
        this.mainColorSum[i] -= tile.variations[v].mainColor[i];
        this.averageColorSum[i] -= tile.variations[v].averageColor[i];
      }
    }

    this.updateAverageColor();

    return true;
  }

  updateAverageColor(): void {
    if (this.remainingStates > 0) {
      this.currentMainColor = [
        this.mainColorSum[0] / this.remainingVariations,
        this.mainColorSum[1] / this.remainingVariations,
        this.mainColorSum[2] / this.remainingVariations,
        this.mainColorSum[3] / this.remainingVariations,
      ];

      this.currentAverageColor = [
        this.averageColorSum[0] / this.remainingVariations,
        this.averageColorSum[1] / this.remainingVariations,
        this.averageColorSum[2] / this.remainingVariations,
        this.averageColorSum[3] / this.remainingVariations,
      ];
    } else {
        this.currentMainColor = [0, 0, 0, 255]; // contradiction: black
        this.currentAverageColor = [0, 0, 0, 255];
    }
  }
}
