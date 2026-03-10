import { Wave } from "@/core/solver/wave";

export function exportWaveToDataURL(wave: Wave): string {
  const pixels = wave.getTexturePixels();

  const ksize = wave.tileset.tileSize;
  const scale = wave.overlapping ? 1 : ksize;
  const outWidth = wave.width * scale;
  const outHeight = wave.height * scale;

  const canvas = document.createElement("canvas");
  canvas.width = outWidth;
  canvas.height = outHeight;
  const ctx = canvas.getContext("2d")!;

  const imageData = new ImageData(pixels, outWidth, outHeight);
  ctx.putImageData(imageData, 0, 0);

  return canvas.toDataURL("image/png");
}