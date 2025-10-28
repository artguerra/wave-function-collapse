export class Bitset {
  readonly data: Uint32Array;
  readonly words: number;

  constructor(words: number, data?: Uint32Array) {
    this.words = words;
    this.data = data ?? new Uint32Array(words);
  }

  setBit(n: number): void {
    this.data[n >>> 5] |= 1 << (n & 31);
  }

  getBit(n: number): boolean {
    return (this.data[n >>> 5] & (1 << (n & 31))) !== 0;
  }
}
