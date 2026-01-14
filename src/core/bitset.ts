import { assert } from "@/utils";

export class Bitset {
  readonly data: Uint32Array;
  readonly words: number;

  constructor(size: number, data?: Uint32Array) {
    assert(size > 0, "Cannot create a bitset of size 0");

    this.words = Math.ceil(size / 32);
    this.data = data ?? new Uint32Array(this.words);
  }

  setBit(n: number): void {
    this.data[n >>> 5] |= 1 << (n & 31);
  }

  getBit(n: number): boolean {
    return (this.data[n >>> 5] & (1 << (n & 31))) !== 0;
  }
}
