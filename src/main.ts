import { assert } from "@/utils";

import { extractPixelBlocks, previewTiles } from "@/io/image";

import type { Vec2 } from "@/core/types";
import { createTileset } from "@/core/tileset";
import { Wave } from "@/core/solver/wave";
import {
  type GPUAppBase, type GPUApp, initWebGPU, initRenderPipeline,
  render, initGPUBuffers, updateCellData, updatePanData
} from "@/renderer";

import input from "@assets/flowers.png";

// global configurations
const TILE_SIZE = 3;
const GRID_WIDTH = 32;
const GRID_HEIGHT = 32;
const CANVAS_WIDTH = 712;
const CANVAS_HEIGHT = 712;

const HEURISTIC: Wave["heuristic"] = "SCANLINE";
const TOROIDAL_GENERATION = true;

// global UI control variables
// @TODO define more sophisticated camera struct
let isDragging = false;
let lastX = 0;
let lastY = 0;
let pan: Vec2 = { x: 0, y: 0 };

function setupListeners(app: GPUApp) {
  app.canvas.addEventListener("mousedown", (e) => {
    isDragging = true;
    lastX = e.clientX;
    lastY = e.clientY;
  });

  window.addEventListener("mouseup", () => {
    isDragging = false;
  });

  app.canvas.addEventListener("mousemove", (e) => {
    if (!isDragging) return;

    const dx = e.clientX - lastX;
    const dy = e.clientY - lastY;

    pan.x += dx / GRID_WIDTH;
    pan.y += dy / GRID_HEIGHT;

    updatePanData(app, pan);

    lastX = e.clientX;
    lastY = e.clientY;
  });
}

async function main() {
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
      pan,
    });
  } catch(e) {
    const t = document.querySelector("#title") as HTMLElement;
    t.innerHTML = "WebGPU is not supported on this browser.";
    t.style.display = "block";

    return;
  }

  // WFC setup
  const { blocks, cols } = await extractPixelBlocks(input, TILE_SIZE);
  const tileset = createTileset(TILE_SIZE, blocks, cols);

  const wave = new Wave(GRID_WIDTH, GRID_HEIGHT, tileset, HEURISTIC, TOROIDAL_GENERATION);

  const gpuAppPipeline = initRenderPipeline(gpuAppBase);
  const gpuApp = initGPUBuffers(gpuAppPipeline);

  setupListeners(gpuApp);

  wave.collapse(async () => {
    function timeout(ms: number) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    updateCellData(gpuApp, wave.getCurrentColorsFlat());
    await timeout(1);
  });

  setInterval(() => render(gpuApp), 16.6);
  // previewTiles(document.querySelector("body")!, tileset.tiles.map(t => t.pixels), cols);
}

main();
