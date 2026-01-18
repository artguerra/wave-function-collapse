import { assert } from "@/utils";
import { extractPixelBlocks, previewPixelBlocks } from "@/io/image";
import { createTileset } from "@/core/tileset";
import { Wave } from "@/core/solver/wave";
import { type GPUAppBase, initWebGPU, initRenderPipeline, render, initGPUBuffers, updateCellData } from "@/renderer";

import flowers from "@assets/flowers.png";

const TILE_SIZE = 3;
const GRID_WIDTH = 16;
const GRID_HEIGHT = 16;
const CANVAS_WIDTH = 640;
const CANVAS_HEIGHT = 640;

(async () => {
  // WEBGPU initalization
  const canvas = document.querySelector<HTMLCanvasElement>("canvas");
  assert(canvas !== null);
  let gpuAppBase: GPUAppBase;

  try {
    gpuAppBase = await initWebGPU(canvas, {
      canvas: {
        width: CANVAS_WIDTH,
        height: CANVAS_HEIGHT,
      },
      grid: {
        width: GRID_WIDTH,
        height: GRID_HEIGHT,
      },
      tileSize: TILE_SIZE,
    });
  } catch(e) {
    const t = document.querySelector("#title") as HTMLElement;
    t.innerHTML = "WebGPU is not supported on this browser.";
    t.style.display = "block";

    return;
  }

  // WFC setup
  const { blocks, cols } = await extractPixelBlocks(flowers, TILE_SIZE);
  const tileset = createTileset(TILE_SIZE, blocks, cols);

  const wave = new Wave(GRID_WIDTH, GRID_HEIGHT, tileset);

  const gpuAppPipeline = initRenderPipeline(gpuAppBase);
  const gpuApp = initGPUBuffers(gpuAppPipeline);

  wave.collapse(() => {
    updateCellData(gpuApp, wave.getCurrentColorsFlat());
  });

  setInterval(() => render(gpuApp), 16.6);

  // previewPixelBlocks(document.querySelector("body")!, blocks, cols);
  // previewPixelBlocks(document.querySelector("body")!, tileset.tiles.map(t => t.pixels), cols);


  // const observer = new ResizeObserver(() => {
  //   canvas.width = canvas.clientWidth;
  //   canvas.height = canvas.clientHeight;
  //   // add logic to resize render target textures here.
  // });
})();
