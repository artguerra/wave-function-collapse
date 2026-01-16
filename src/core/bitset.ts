import { assert } from "@/utils";

export class Bitset {
  readonly size: number;
  readonly data: Uint32Array;
  readonly words: number;

  constructor(size: number, allOnes: boolean = false, data?: Uint32Array) {
    assert(size > 0, "Cannot create a bitset of size 0");

    this.size = size;
    this.words = Math.ceil(size / 32);

    if (data) {
      assert(data.length === this.words, "Bitset data has wrong length");
      this.data = data;
      return;
    }

    this.data = new Uint32Array(this.words);

    if (allOnes) {
      this.data.fill(0xFFFFFFFF);

      // mask off unused bits in the last word (if any)
      const rem = size & 31; // size % 32
      if (rem !== 0) {
        this.data[this.words - 1] = (1 << rem) - 1;
      }
      // if rem === 0, last word stays 0xFFFFFFFF
    }
  }

  setBit(n: number): void {
    this.data[n >>> 5] |= 1 << (n & 31);
  }

  getBit(n: number): boolean {
    return (this.data[n >>> 5] & (1 << (n & 31))) !== 0;
  }
}
