import type { RGBA, PixelData } from "@/core/types";

export class PixelBlock implements PixelData {
  private _hash?: string;
  values: RGBA[];

  constructor(size: number) {
    this.values = new Array<RGBA>(size * size);
  }

  get hash() {
    if (this._hash !== undefined) return this._hash;

    this._hash = this.computeHash();
    return this._hash;
  }

  private computeHash(): string {
    return fnv1a64(packRGBA(this));
  }
}

function packRGBA(pixels: PixelBlock): Uint32Array {
  const n = pixels.values.length;
  const out = new Uint32Array(n);

  for (let i = 0; i < n; i++) {
    const [r, g, b, a] = pixels.values[i];
    out[i] = (r << 24) | (g << 16) | (b << 8) | a;
  }

  return out;
}

// hash FNV-1a 64-bit (as hex string) for a Uint32Array.
function fnv1a64(u32: Uint32Array): string {
  let lo = 0x2325;
  let hi = 0x84222325; // arbitrary 64-bit offset basis-ish

  for (let i = 0; i < u32.length; i++) {
    let x = u32[i];
    lo ^= x & 0xffff;
    hi ^= x >>> 16;
    // 64-bit * FNV prime (0x100000001B3) via 32-bit chunks
    const a = (lo & 0xffff) * 0x01b3;
    const b = (lo >>> 16) * 0x01b3 + (a >>> 16);
    const c = (hi & 0xffff) * 0x01b3 + (b >>> 16);
    const d = (hi >>> 16) * 0x01b3 + (c >>> 16);
    lo = ((a & 0xffff) | (b << 16)) >>> 0;
    hi = ((c & 0xffff) | (d << 16)) >>> 0;
  }

  return (
    (hi >>> 0).toString(16).padStart(8, "0") +
    (lo >>> 0).toString(16).padStart(8, "0")
  );
}
