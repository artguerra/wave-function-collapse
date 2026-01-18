import { assert } from "@/utils";

export class Bitset implements Iterable<number> {
  readonly size: number;
  readonly data: Uint32Array;
  readonly words: number;

  constructor(size: number, allOnes: boolean = false, data?: Uint32Array) {
    assert(size > 0, "Cannot create a bitset of size 0");

    this.size = size;
    this.words = Math.ceil(size / 32);

    if (data) {
      assert(data.length === this.words, "Bitset data has wrong length");
      this.data = new Uint32Array(data);
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

  unsetBit(n: number): void {
    this.data[n >>> 5] &= ~(1 << (n & 31));
  }

  getBit(n: number): boolean {
    return (this.data[n >>> 5] & (1 << (n & 31))) !== 0;
  }

  bitwiseAnd(other: Bitset): Bitset {
    assert(this.size == other.size, "Bitsets must have the same length for the bitwise operation.");
    const res = new Bitset(this.size, false, this.data);

    for (let i = 0; i < this.words; ++i)
      res.data[i] = this.data[i] & other.data[i];

    return res;
  }

  count(): number {
    let count = 0;

    for (let i = 0; i < this.words; i++) {
      let n = this.data[i];

      // hamming weight
      n = n - ((n >>> 1) & 0x55555555);
      n = (n & 0x33333333) + ((n >>> 2) & 0x33333333);
      n = (n + (n >>> 4)) & 0x0F0F0F0F;
      n = n + (n >>> 8);
      n = n + (n >>> 16);
      
      count += (n & 0x3F);
    }

    return count;
  }

  *bits(): IterableIterator<[number, boolean]> {
    for (let i = 0; i < this.size; ++i)
      yield [i, this.getBit(i)];
  }

  *[Symbol.iterator](): IterableIterator<number> {
    for (let i = 0; i < this.size; ++i)
      if (this.getBit(i)) yield i;
  }
}
