import { assert } from "@/utils";
import { DX, DY, idx } from "@/utils/grid";
import { PixelBlock } from "@/core/pixels";
import type { PixelData, RGBA, Vec2 } from "@/core/types";

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
  selectedIndicesColor?: RGBA,
  singleIndexSelected?: number,
  dirStrengths?: [number, number, number, number][],
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

    // visualize density maps tiles colors
    if (selectedIndices && selectedIndices.has(i)) {
      const col = selectedIndicesColor!;
      const rgb2hex = (v: number) => Math.round(v).toString(16);
      const hexColor = `#${rgb2hex(col[0])}${rgb2hex(col[1])}${rgb2hex(col[2])}`;

      ctx.strokeStyle = hexColor;
      ctx.lineWidth = 3;
      ctx.strokeRect(dx + 1.5, dy + 1.5, tileDrawSize - 3, tileDrawSize - 3);
      
      ctx.fillStyle = `${hexColor}40`;
      ctx.fillRect(dx, dy, tileDrawSize, tileDrawSize);
    }

    // visualize floor tile on flow selection
    if (singleIndexSelected !== undefined && singleIndexSelected === i) {
      ctx.strokeStyle = "#FF6347";
      ctx.lineWidth = 3;
      ctx.strokeRect(dx + 1.5, dy + 1.5, tileDrawSize - 3, tileDrawSize - 3);
      ctx.fillStyle = `${ctx.strokeStyle}40`;
      ctx.fillRect(dx, dy, tileDrawSize, tileDrawSize);
    }

    if (dirStrengths && dirStrengths[i]) {
      const strengths = dirStrengths[i];
      const cx = dx + tileDrawSize / 2;
      const cy = dy + tileDrawSize / 2;
      const maxLen = tileDrawSize * 0.4;

      ctx.strokeStyle = "#FF0101";
      ctx.fillStyle = "#FF0101";
      ctx.lineWidth = 2;

      for (let d = 0; d < 4; ++d) {
        const s = strengths[d];
        if (s < 0.05) continue;

        const len = maxLen * s;
        const ex = cx + DX[d] * len;
        const ey = cy + DY[d] * len;

        ctx.beginPath();
        ctx.moveTo(cx, cy);
        ctx.lineTo(ex, ey);
        ctx.stroke();

        const headlen = 3 + 4 * s;
        const angle = Math.atan2(DY[d], DX[d]);
        
        ctx.beginPath();
        ctx.moveTo(ex, ey);
        ctx.lineTo(
          ex - headlen * Math.cos(angle - Math.PI / 6),
          ey - headlen * Math.sin(angle - Math.PI / 6)
        );
        ctx.lineTo(
          ex - headlen * Math.cos(angle + Math.PI / 6),
          ey - headlen * Math.sin(angle + Math.PI / 6)
        );
        ctx.closePath();
        ctx.fill();
      }
    }
  }
}

export function previewMaps(
  canvas: HTMLCanvasElement,
  maps: number[][][],
  mapsColors: RGBA[],
  scale = 6,
) {
  if (maps.length < 1) return;
  if (mapsColors.length !== maps.length) return;

  const n = maps.length;
  const rows = maps[0].length;
  const cols = maps[0][0].length;

  canvas.width = cols * scale;
  canvas.height = rows * scale;

  const ctx = canvas.getContext("2d")!;
  ctx.imageSmoothingEnabled = false;

  const off = new OffscreenCanvas(cols, rows);
  const offCtx = off.getContext("2d")!;
  const data = new Float32Array(cols * rows * 4);

  const encodeColor = (mapIdx: number, v: number) => {
    const val = Math.min(1, Math.max(0, v));
    const color = mapsColors[mapIdx];
    return [val * color[0], val * color[1], val * color[2], color[3]];
  };

  const apparisons = Array.from({ length: rows }, () => new Array(cols).fill(0));
  for (let i = 0; i < n; ++i) {
    for (let y = 0; y < rows; ++y) {
      for (let x = 0; x < cols; ++x) {
        const value = maps[i][y][x];
        if (value === 0) continue;

        const imgIdx = idx(y, x, cols) * 4;
        const [r, g, b, a] = encodeColor(i, value);

        data[imgIdx] += r;
        data[imgIdx + 1] += g;
        data[imgIdx + 2] += b;
        data[imgIdx + 3] += a;

        apparisons[y][x]++;
      }
    }
  }

  const imgData = offCtx.createImageData(cols, rows);
  for (let y = 0; y < rows; ++y) {
    for (let x = 0; x < cols; ++x) {
      const imgIdx = idx(y, x, cols) * 4;
      const painted = apparisons[y][x] > 0;

      imgData.data[imgIdx] = painted ? data[imgIdx] / apparisons[y][x] : 0;
      imgData.data[imgIdx + 1] = painted ? data[imgIdx + 1] / apparisons[y][x] : 0;
      imgData.data[imgIdx + 2] = painted ? data[imgIdx + 2] / apparisons[y][x] : 0;
      imgData.data[imgIdx + 3] = painted ? data[imgIdx + 3] / apparisons[y][x] : 0;
    }
  }

  offCtx.putImageData(imgData, 0, 0);

  ctx.drawImage(
    off as unknown as CanvasImageSource, 0, 0,
    cols * scale, rows * scale,
  );
}

export function renderFlowArrows(
  canvas: HTMLCanvasElement, 
  flowMap: Vec2[][], 
  options: { fillBackground?: boolean, fixedScale?: number } = {},
  overlayedCanvas?: HTMLCanvasElement,
) {
  const n = flowMap.length;
  if (n === 0) return;

  let cellW, cellH;
  if (options.fixedScale) {
    canvas.width = n * options.fixedScale;
    canvas.height = n * options.fixedScale;
    cellW = options.fixedScale;
    cellH = options.fixedScale;
  } else {
    const rect = overlayedCanvas!.getBoundingClientRect(); // overlayed canvas
    canvas.width = rect.width;
    canvas.height = rect.height;
    cellW = canvas.width / n;
    cellH = canvas.height / n;
  }

  const ctx = canvas.getContext("2d")!;
  
  if (options.fillBackground) {
    ctx.fillStyle = "#1e1e1e";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
  } else {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
  }

  ctx.strokeStyle = "#007acc";
  ctx.lineWidth = options.fixedScale ? 1.5 : 2.5;

  const scale = Math.min(cellW, cellH);

  for (let y = 0; y < n; ++y) {
    for (let x = 0; x < n; ++x) {
      const flow = flowMap[y][x];
      const mag = Math.sqrt(flow.x * flow.x + flow.y * flow.y);
      
      const cx = x * cellW + cellW / 2;
      const cy = y * cellH + cellH / 2;

      // draw dot for empty flow
      if (mag < 0.1) {
        ctx.fillStyle = "#555";
        ctx.beginPath();
        ctx.arc(cx, cy, scale * 0.1, 0, Math.PI * 2);
        ctx.fill();
        continue;
      }

      // draw arrow line
      const arrowLen = (scale * 0.4) * mag; 
      const endX = cx + flow.x * arrowLen;
      const endY = cy + flow.y * arrowLen;

      ctx.beginPath();
      ctx.moveTo(cx, cy);
      ctx.lineTo(endX, endY);
      ctx.stroke();

      // arrow head
      const headlen = scale * 0.25;
      const angle = Math.atan2(flow.y, flow.x);
      
      ctx.beginPath();
      ctx.moveTo(endX, endY);
      ctx.lineTo(
        endX - headlen * Math.cos(angle - Math.PI / 6), 
        endY - headlen * Math.sin(angle - Math.PI / 6)
      );
      ctx.moveTo(endX, endY);
      ctx.lineTo(
        endX - headlen * Math.cos(angle + Math.PI / 6), 
        endY - headlen * Math.sin(angle + Math.PI / 6)
      );
      ctx.stroke();
    }
  }
}
