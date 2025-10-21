import { PixelBlock } from "./wfc";
import { idx } from "./utils/util";

const N_CHANNELS = 4;

export async function extractPixelBlocks(
  path: string,
  size: number,
): Promise<{ blocks: PixelBlock[]; cols: number }> {
  const png = await decodePNG(path);

  if (png.width % size != 0 || png.height % size != 0)
    throw Error("Image not compatible with tile size");

  const outHeight = png.height / size;
  const outWidth = png.width / size;

  const blocks = new Array<PixelBlock>(outHeight * outWidth);
  for (let y = 0; y < png.height; ++y) {
    for (let x = 0; x < png.width; ++x) {
      const imgIdx = idx(y, x, png.width) * N_CHANNELS;
      const tileIdx = idx(Math.floor(y / size), Math.floor(x / size), outWidth);
      const innerTileIdx = idx(y % size, x % size, size);

      if (!blocks[tileIdx]) blocks[tileIdx] = new PixelBlock(size);

      blocks[tileIdx].values[innerTileIdx] = [
        png.data[imgIdx],
        png.data[imgIdx + 1],
        png.data[imgIdx + 2],
        png.data[imgIdx + 3],
      ];
    }
  }

  return { blocks, cols: outWidth };
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

export function previewPixelBlocks(
  target: HTMLElement,
  blocks: PixelBlock[],
  cols: number,
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
