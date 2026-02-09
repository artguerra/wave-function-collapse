import { assert } from "@/utils";
import { idx } from "@/utils/grid";
import { PixelBlock } from "@/core/pixels";
import type { PixelData } from "@/core/types";

type PngResponse = {
  width: number;
  height: number;
  data: Uint8ClampedArray;
};

export async function decodePNG(url: string): Promise<PngResponse> {
  const res = await fetch(url);
  const data = await res.blob();

  const dec = new ImageDecoder({ data: data.stream(), type: "image/png" });
  const { image } = await dec.decode();
  const { codedWidth: w, codedHeight: h } = image;

  const buf = new Uint8ClampedArray(w * h * 4);
  await image.copyTo(buf, {
    format: "RGBA",
  });
  image.close();

  return { width: w, height: h, data: buf };
}

export function dataAt(png: PngResponse, y: number, x: number, ksize: number) {
  const block = new PixelBlock(ksize);

  for (let innerY = y; innerY < y + ksize; ++innerY) {
    for (let innerX = x; innerX < x + ksize; ++innerX) {
      const blockIdx = idx(innerY - y, innerX - x, ksize);
      const imgIdx = idx(innerY, innerX, png.width) * 4;

      // only RGBA values for now
      block.values[blockIdx] = [
        png.data[imgIdx],
        png.data[imgIdx + 1],
        png.data[imgIdx + 2],
        png.data[imgIdx + 3],
      ];

    }
  }

  block.calculateAverage();
  return block;
}

export function pngToPixelBlock(png: PngResponse): PixelBlock {
  assert(png.width === png.height, "PNG has to be a square image to generate a Pixel Block");

  const block = new PixelBlock(png.width);
  for (let y = 0; y < png.height; ++y) {
    for (let x = 0; x < png.width; ++x) {
      const blockIdx = idx(y, x, png.width);
      const imgIdx = blockIdx * 4;

      block.values[blockIdx] = [
        png.data[imgIdx],
        png.data[imgIdx + 1],
        png.data[imgIdx + 2],
        png.data[imgIdx + 3],
      ];
    }
  }

  block.calculateAverage();
  return block;
}

// mirror horizontally
export function mirrorBlockX(block: PixelBlock): PixelBlock {
  const ksize = block.ksize;
  const mirrored = new PixelBlock(ksize);
  
  for (let y = 0; y < ksize; ++y)
    for (let x = 0; x < ksize; ++x)
      mirrored.values[idx(y, x, ksize)] = block.values[idx(y, ksize - 1 - x, ksize)];

  mirrored.calculateAverage();
  return mirrored;
}

// mirror vertically
export function mirrorBlockY(block: PixelBlock): PixelBlock {
  const ksize = block.ksize;
  const mirrored = new PixelBlock(ksize);
  
  for (let y = 0; y < ksize; ++y)
    for (let x = 0; x < ksize; ++x)
      mirrored.values[idx(y, x, ksize)] = block.values[idx(ksize - 1 - y, x, ksize)];

  mirrored.calculateAverage();
  return mirrored;
}

// rotate 90 degrees counterclockwise
export function rotateBlock90(block: PixelBlock): PixelBlock {
  const ksize = block.ksize;
  const rotated = new PixelBlock(ksize);

  for (let y = 0; y < ksize; ++y)
    for (let x = 0; x < ksize; ++x)
      rotated.values[idx(y, x, ksize)] = block.values[idx(x, ksize - 1 - y, ksize)];

  rotated.calculateAverage();
  return rotated;
}

export function previewBlocks(
  canvas: HTMLCanvasElement,
  blocks: PixelData[],
  cols: number = 16,
  scale = 64,
  gap = 2,
  selectedIndices?: Set<number>,
) {
  if (blocks.length === 0) return;

  const size = Math.sqrt(blocks[0].values.length);
  const rows = Math.ceil(blocks.length / cols);

  const tileDrawSize = scale;
  const width = cols * tileDrawSize + (cols - 1) * gap;
  const height = rows * tileDrawSize + (rows - 1) * gap;

  canvas.width = width;
  canvas.height = height;

  const ctx = canvas.getContext("2d")!;
  ctx.imageSmoothingEnabled = false;

  const off = new OffscreenCanvas(size, size);
  const offCtx = off.getContext("2d")!;
  const imgData = offCtx.createImageData(size, size);

  for (let i = 0; i < blocks.length; i++) {
    const block = blocks[i];
    if (!block) continue;

    let p = 0;
    for (const [r, g, b, a] of block.values) {
      imgData.data[p++] = r;
      imgData.data[p++] = g;
      imgData.data[p++] = b;
      imgData.data[p++] = a;
    }

    offCtx.putImageData(imgData, 0, 0);

    const col = i % cols;
    const row = Math.floor(i / cols);
    const dx = col * (tileDrawSize + gap);
    const dy = row * (tileDrawSize + gap);

    ctx.drawImage(
      off as unknown as CanvasImageSource,
      dx,
      dy,
      tileDrawSize,
      tileDrawSize,
    );

    if (selectedIndices && selectedIndices.has(i)) {
      ctx.strokeStyle = "#f13724";
      ctx.lineWidth = 3;
      ctx.strokeRect(dx + 1.5, dy + 1.5, tileDrawSize - 3, tileDrawSize - 3);
      
      ctx.fillStyle = "rgba(255, 99, 71, 0.2)";
      ctx.fillRect(dx, dy, tileDrawSize, tileDrawSize);
    }
  }
}
