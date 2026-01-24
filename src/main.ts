import { assert } from "@/utils";
import { previewBlocks } from "./utils/image.ts";

import { createOverlappingTileset } from "@/io/overlapping";
import { SimpleTilesetParser } from "./io/simple-tiled.ts";

import type { SymmetryMode, Vec2 } from "@/core/types";
import { Wave } from "@/core/solver/wave";
import {
  type GPUAppBase, type GPUApp, initWebGPU, initRenderPipeline,
  render, initGPUBuffers, updateCellData, updatePanData
} from "@/renderer";

import input from "@assets/MagicOffice.png";
import simpleTiles from "@assets/tilesets/castle/castle.xml?raw"

// global configurations
const TILE_SIZE = 3;
const GRID_WIDTH = 16;
const GRID_HEIGHT = 16;
const CANVAS_WIDTH = 712;
const CANVAS_HEIGHT = 712;

// WFC parameters
const SYMMETRY_MODE: SymmetryMode = "ALL";
const HEURISTIC: Wave["heuristic"] = "SCANLINE";
const TOROIDAL_GENERATION = true;
const OVERLAPPING_MODEL = true;

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
  const tileset = await SimpleTilesetParser.load(simpleTiles, "../assets/tilesets/castle/");
  // const tileset = await createOverlappingTileset(input, TILE_SIZE, SYMMETRY_MODE);
  
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
  previewBlocks(document.querySelector("body")!, tileset.tiles.map(t => t.pixels));
}

main();
