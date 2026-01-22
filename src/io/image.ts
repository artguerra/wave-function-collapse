import { idx } from "@/utils/grid";
import { PixelBlock } from "@/core/pixels";
import type { PixelData } from "@/core/types";

const N_CHANNELS = 4;

export async function extractPixelBlocks(
  path: string,
  ksize: number,
  symmetryMode: "ALL" | "MIRROR_X" | "MIRROR_Y" | "MIRROR_XY" | "NONE" = "ALL"
): Promise<PixelBlock[]> {
  if (ksize % 2 == 0) throw Error("Kernel size must be odd");

  const png = await decodePNG(path);

  const pad = (ksize - 1) / 2;

  const blocks: PixelBlock[] = [];

  for (let y = pad; y < png.height - pad; ++y) {
    for (let x = pad; x < png.width - pad; ++x) {
      const block = dataAt(png, y, x, ksize);

      blocks.push(block);

      if (symmetryMode == "MIRROR_X") {
        blocks.push(mirrorBlockX(block));
      }

      if (symmetryMode == "MIRROR_Y") {
        blocks.push(mirrorBlockX(block));
      }

      if (symmetryMode == "MIRROR_XY") {
        blocks.push(mirrorBlockX(block));
        blocks.push(mirrorBlockY(block));
        blocks.push(mirrorBlockY(mirrorBlockX(block)));
      }

      if (symmetryMode == "ALL") {
        let current = block;
        blocks.push(mirrorBlockX(current));

        for (let r = 0; r < 3; ++r) {
          const rotated = rotateBlock90(current);

          blocks.push(rotated);
          blocks.push(mirrorBlockX(rotated));

          current = rotated;
        }
      }
    }
  }

  return blocks;
}

function dataAt(png: PngResponse, y: number, x: number, ksize: number) {
  const pad = (ksize - 1) / 2;
  const block = new PixelBlock(ksize);

  for (let innerY = y - pad; innerY <= y + pad; ++innerY) {
    for (let innerX = x - pad; innerX <= x + pad; ++innerX) {
      const blockIdx = idx(innerY + pad - y, innerX + pad - x, ksize);
      const imgIdx = idx(innerY, innerX, png.width) * N_CHANNELS;

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

function mirrorBlockX(block: PixelBlock): PixelBlock {
  const ksize = block.ksize;
  const mirrored = new PixelBlock(ksize);
  
  for (let y = 0; y < ksize; ++y)
    for (let x = 0; x < ksize; ++x)
      mirrored.values[idx(y, x, ksize)] = block.values[idx(y, ksize - 1 - x, ksize)];

  mirrored.calculateAverage();
  return mirrored;
}

function mirrorBlockY(block: PixelBlock): PixelBlock {
  const ksize = block.ksize;
  const mirrored = new PixelBlock(ksize);
  
  for (let y = 0; y < ksize; ++y)
    for (let x = 0; x < ksize; ++x)
      mirrored.values[idx(y, x, ksize)] = block.values[idx(ksize - 1 - y, x, ksize)];

  mirrored.calculateAverage();
  return mirrored;
}

function rotateBlock90(block: PixelBlock): PixelBlock {
  const ksize = block.ksize;
  const rotated = new PixelBlock(ksize);

  for (let y = 0; y < ksize; ++y)
    for (let x = 0; x < ksize; ++x)
      rotated.values[idx(y, x, ksize)] = block.values[idx(x, ksize - 1 - y, ksize)];

  rotated.calculateAverage();
  return rotated;
}

type PngResponse = {
  width: number;
  height: number;
  data: Uint8ClampedArray;
};

async function decodePNG(url: string): Promise<PngResponse> {
  const res = await fetch(url);
  const data = await res.blob();

  const dec = new ImageDecoder({ data: data.stream(), type: "image/png" });
  const { image } = await dec.decode();
  const { codedWidth: w, codedHeight: h } = image;

  const buf = new Uint8ClampedArray(w * h * N_CHANNELS);
  await image.copyTo(buf, {
    format: "RGBA",
  });
  image.close();

  return { width: w, height: h, data: buf };
}

export function previewBlocks(
  target: HTMLElement,
  blocks: PixelData[],
  cols: number = 16,
  scale = 16,
  gap = 2,
) {
  if (blocks.length === 0) return;

  const size = Math.sqrt(blocks[0].values.length);
  const rows = Math.ceil(blocks.length / cols);

  const tileDrawSize = size * scale;
  const width = cols * tileDrawSize + (cols - 1) * gap;
  const height = rows * tileDrawSize + (rows - 1) * gap;

  const canvas = document.createElement("canvas");
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
  }

  target.appendChild(canvas);
}
