import { createOverlappingTileset } from "@/io/overlapping";
import { createSimpleTiledTileset } from "@/io/simple-tiled.ts";
import type { SymmetryMode, Vec2 } from "@/core/types";
import { Wave } from "@/core/solver/wave";
import {
  type GPUAppBase, type GPUApp, initWebGPU, initRenderPipeline,
  render, initGPUBuffers, updateTexture, updatePanData
} from "@/renderer";

import imgCircle from "@assets/circle.png";
import imgOffice from "@assets/MagicOffice.png";
import imgSpirals from "@assets/Spirals.png";
import imgWall from "@assets/wall.png";
import imgFlowers from "@assets/flowers.png";
import imgPlatformer from "@assets/platformer.png";
import xmlCastle from "@assets/tilesets/castle/castle.xml?raw"  ;

const SIMPLE_TILESET_PATH = "../assets/tilesets/castle/";

const IMAGES: Record<string, string> = {
  "Magic Office": imgOffice,
  "Circle": imgCircle,
  "Spirals": imgSpirals,
  "Wall": imgWall,
  "Flowers": imgFlowers,
  "Platformer": imgPlatformer,
};

// configuration
const CANVAS_WIDTH = 712;
const CANVAS_HEIGHT = 712;
const GRID_WIDTH = 40;
const GRID_HEIGHT = 40;

let currentCancelToken = { cancelled: false };
let gpuApp: GPUApp | null = null;
let gpuBase: GPUAppBase | null = null;
let pan: Vec2 = { x: 0, y: 0 };

// ui references
const ui = {
  imgSelect: document.querySelector("#img-select") as HTMLSelectElement,
  modelSelect: document.querySelector("#model-select") as HTMLSelectElement,
  nSize: document.querySelector("#n-size") as HTMLInputElement,
  symSelect: document.querySelector("#sym-select") as HTMLSelectElement,
  heuristicSelect: document.querySelector("#heuristic-select") as HTMLSelectElement,
  toroidalCheck: document.querySelector("#toroidal-check") as HTMLInputElement,
  speedRange: document.querySelector("#speed-range") as HTMLInputElement,
  speedVal: document.querySelector("#speed-val") as HTMLSpanElement,
  restartBtn: document.querySelector("#restart-btn") as HTMLButtonElement,
  status: document.querySelector("#status") as HTMLElement,
  canvas: document.querySelector("canvas") as HTMLCanvasElement,
};

// initialization
function initUI() {
  // image selection (input)
  Object.keys(IMAGES).forEach(key => {
    const opt = document.createElement("option");
    opt.value = key;
    opt.innerText = key;
    ui.imgSelect.appendChild(opt);
  });

  // speed control
  ui.speedRange.addEventListener("input", () => {
    ui.speedVal.innerText = ui.speedRange.value;
  });

  // restart generation
  ui.restartBtn.addEventListener("click", () => {
    runSimulation();
  });

  // panning control
  let isDragging = false;
  let lastX = 0, lastY = 0;

  ui.canvas.addEventListener("mousedown", e => { isDragging = true; lastX = e.clientX; lastY = e.clientY; });
  window.addEventListener("mouseup", () => isDragging = false);
  ui.canvas.addEventListener("mousemove", e => {
    if (!isDragging || !gpuApp) return;

    pan.x += e.clientX - lastX;
    pan.y += e.clientY - lastY;

    updatePanData(gpuApp, pan);

    lastX = e.clientX;
    lastY = e.clientY;
  });
}

async function initGPU() {
  if (gpuBase) return gpuBase; // init once
  
  try {
    gpuBase = await initWebGPU(ui.canvas, {
      canvas: { width: CANVAS_WIDTH, height: CANVAS_HEIGHT },
      grid: { width: GRID_WIDTH, height: GRID_HEIGHT },
      tileSize: parseInt(ui.nSize.value),
      pan,
    });
    
    // start render loop at initilization
    const loop = () => {
      if (gpuApp) render(gpuApp);
      requestAnimationFrame(loop);
    };
    requestAnimationFrame(loop);

    return gpuBase;
  } catch (e) {
    console.error(e);
    alert("WebGPU failed to initialize.");
    return null;
  }
}

async function runSimulation() {
  currentCancelToken.cancelled = true; // stops previous call (previous call has ref to this obj)
  currentCancelToken = { cancelled: false }; // new obj ref
  const token = currentCancelToken;

  ui.status.innerText = "Loading...";
  
  const overlapping = true; // @TODO allow simple tiled model
  const imgKey = ui.imgSelect.value;
  const symmetry = ui.symSelect.value as SymmetryMode;
  const heuristic = ui.heuristicSelect.value as any;
  const toroidal = ui.toroidalCheck.checked;
  let tileSize = parseInt(ui.nSize.value);

  const base = await initGPU();
  if (!base) return;

  let tileset;
  try {
    if (overlapping) {
      tileset = await createOverlappingTileset(IMAGES[imgKey], tileSize, symmetry);
    } else {
      // @TODO simple model tileset selection
      const { tileset: tset, tileSize: tsize } = await createSimpleTiledTileset(xmlCastle, SIMPLE_TILESET_PATH);
      tileset = tset;
      tileSize = tsize;
      base.dimensions.tileSize = tileSize;
    }
  } catch (e) {
    console.error(e);
    ui.status.innerText = `Error loading tileset: ${e}`;
    return;
  }

  if (token.cancelled) return;

  // initialize wave
  const wave = new Wave(GRID_WIDTH, GRID_HEIGHT, tileset, overlapping, heuristic, toroidal);

  const pipeline = initRenderPipeline(base);
  gpuApp = initGPUBuffers(pipeline, overlapping);
  
  // reset pan
  pan = { x: 0, y: 0 };
  updatePanData(gpuApp, pan);

  ui.status.innerText = "Running...";

  // generation
  await wave.collapse(async () => {
    if (token.cancelled) throw "CANCELLED";

    updateTexture(gpuApp!, wave.getTexturePixels());

    const delay = parseInt(ui.speedRange.value);
    if (delay > 0) await new Promise(r => setTimeout(r, delay));
  }).catch(e => {
    if (e !== "CANCELLED") {
      console.error(e);
      ui.status.innerText = `Error: ${e}`;
    }
  });

  if (!token.cancelled) ui.status.innerText = "Finished";
}

initUI();
setTimeout(runSimulation, 100);
