import { createOverlappingTileset } from "@/io/overlapping";
import { createStmTileset } from "@/io/stm";
import { previewBlocks } from "@/utils/image";
import type { SymmetryMode, Vec2 } from "@/core/types";
import { Wave } from "@/core/solver/wave";
import {
  type GPUAppBase, type GPUApp, initWebGPU, initRenderPipeline,
  render, initGPUBuffers, updateTexture, updatePanData
} from "@/renderer";
import { Tileset } from "./core/tileset";

import imgCircle from "@assets/circle.png";
import imgOffice from "@assets/MagicOffice.png";
import imgSpirals from "@assets/Spirals.png";
import imgWall from "@assets/wall.png";
import imgFlowers from "@assets/flowers.png";
import imgPlatformer from "@assets/platformer.png";
import tilesetCastle from "@assets/tilesets/castle/castle.xml?raw";
import tilesetCircuit from "@assets/tilesets/circuit/circuit.xml?raw";

const BASE_TILESET_PATH = "assets/tilesets";

const IMAGES_OVERLAPPING: Record<string, string> = {
  "Magic Office": imgOffice,
  "Circle": imgCircle,
  "Spirals": imgSpirals,
  "Wall": imgWall,
  "Flowers": imgFlowers,
  "Platformer": imgPlatformer,
};

const TILESETS_STM: Record<string, { definition: string, dirPath: string }> = {
  "Castle": { definition: tilesetCastle, dirPath: `${BASE_TILESET_PATH}/castle/` },
  "Circuit": { definition: tilesetCircuit, dirPath: `${BASE_TILESET_PATH}/circuit/` },
}

// configuration
const CANVAS_WIDTH = 712;
const CANVAS_HEIGHT = 712;

let currentCancelToken = { cancelled: false };
let gpuApp: GPUApp | null = null;
let gpuBase: GPUAppBase | null = null;
let pan: Vec2 = { x: 0, y: 0 };

// ui references
const ui = {
  modelSelect: document.querySelector("#model-select") as HTMLSelectElement,
  imgSelect: document.querySelector("#img-select") as HTMLSelectElement,
  outputSize: document.querySelector("#output-size") as HTMLInputElement,
  nSize: document.querySelector("#n-size") as HTMLInputElement,
  symSelect: document.querySelector("#sym-select") as HTMLSelectElement,
  heuristicSelect: document.querySelector("#heuristic-select") as HTMLSelectElement,
  toroidalCheck: document.querySelector("#toroidal-check") as HTMLInputElement,
  speedRange: document.querySelector("#speed-range") as HTMLInputElement,
  speedVal: document.querySelector("#speed-val") as HTMLSpanElement,
  restartBtn: document.querySelector("#restart-btn") as HTMLButtonElement,
  status: document.querySelector("#status") as HTMLElement,
  canvas: document.querySelector("#main-canvas") as HTMLCanvasElement,
  previewTilesCheck: document.querySelector("#preview-tiles-check") as HTMLInputElement,
  previewTilesSection: document.querySelector("#preview-section") as HTMLDivElement,
  previewCanvasWrapper: document.querySelector("#preview-canvas-wrapper") as HTMLDivElement,
};

// WFC global references
interface WFCState {
  tileset: Tileset | null;
  wave: Wave | null;
};

const wfc: WFCState = {
  tileset: null,
  wave: null,
};

// initialization
function initUI() {
  // image selection (input)
  const setInputOptions = () => {
    const overlapping = ui.modelSelect.value == "OVERLAPPING";
    ui.imgSelect.innerHTML = "";

    Object.keys(overlapping ? IMAGES_OVERLAPPING : TILESETS_STM).forEach(key => {
      const opt = document.createElement("option");
      opt.value = key;
      opt.innerText = key;
      ui.imgSelect.appendChild(opt);
    });

    ui.nSize.disabled = !overlapping;
    ui.symSelect.disabled = !overlapping;
  };

  setInputOptions();
  ui.modelSelect.addEventListener("input", setInputOptions);

  // speed control
  ui.speedRange.addEventListener("input", () => {
    ui.speedVal.innerText = ui.speedRange.value;
  });

  ui.outputSize.addEventListener("input", () => {
    gpuBase = null; // invalidate current gpu config to force a new setup
    gpuApp = null;
    currentCancelToken.cancelled = true;

    ui.status.innerText = "Generation stopped because output size changed."
  });

  // restart generation
  ui.restartBtn.addEventListener("click", () => {
    runSimulation();
  });

  // tile preview
  const setPreviewDisplay = () => {
    const shown = ui.previewTilesCheck.checked;
    ui.previewTilesSection.style.display = shown ? "flex" : "none";
  };

  setPreviewDisplay();
  ui.previewTilesCheck.addEventListener("input", setPreviewDisplay);

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

function updateTilesPreview(): void {
  if (!wfc.tileset) return;

  previewBlocks(
    ui.previewCanvasWrapper,
    wfc.tileset.tiles.map(t => t.pixels),
    Math.floor(Math.sqrt(wfc.tileset.size))
  );
}

async function initGPU() {
  if (gpuBase) return gpuBase; // init once

  try {
    gpuBase = await initWebGPU(ui.canvas, {
      canvas: { width: CANVAS_WIDTH, height: CANVAS_HEIGHT },
      grid: { width: parseInt(ui.outputSize.value), height: parseInt(ui.outputSize.value) },
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
  
  const overlapping = ui.modelSelect.value == "OVERLAPPING";
  const imgKey = ui.imgSelect.value;
  const outputSize = parseInt(ui.outputSize.value);
  const symmetry = ui.symSelect.value as SymmetryMode;
  const heuristic = ui.heuristicSelect.value as any;
  const toroidal = ui.toroidalCheck.checked;
  const tileSize = parseInt(ui.nSize.value);

  const base = await initGPU();
  if (!base) return;

  try {
    if (overlapping) {
      wfc.tileset = await createOverlappingTileset(IMAGES_OVERLAPPING[imgKey], tileSize, symmetry);
    } else {
      const stm = TILESETS_STM[imgKey];
      const res = await createStmTileset(stm.definition, stm.dirPath);

      wfc.tileset = res.tileset;
      base.dimensions.tileSize = res.tileset.tileSize;
    }
  } catch (e) {
    console.error(e);
    ui.status.innerText = `Error loading tileset: ${e}`;
    return;
  }

  if (token.cancelled) return;
  updateTilesPreview();

  // initialize wave
  wfc.wave = new Wave(outputSize, outputSize, wfc.tileset, overlapping, heuristic, toroidal);

  const pipeline = initRenderPipeline(base);
  gpuApp = initGPUBuffers(pipeline, overlapping);
  
  // reset pan
  pan = { x: 0, y: 0 };
  updatePanData(gpuApp, pan);

  ui.status.innerText = "Running...";

  // generation
  await wfc.wave.collapse(async () => {
    if (token.cancelled) throw "CANCELLED";

    updateTexture(gpuApp!, wfc.wave!.getTexturePixels());

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
