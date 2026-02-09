import { createOverlappingTileset } from "@/io/overlapping";
import { createStmTileset } from "@/io/stm";
import { idx } from "@/utils/grid";
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
import tilesetSummer from "@assets/tilesets/summer/summer.xml?raw";

const BASE_TILESET_PATH = "assets/tilesets";

const IMAGES_OVERLAPPING: Record<string, string> = {
  "Magic Office": imgOffice,
  "Circle": imgCircle,
  "Spirals": imgSpirals,
  "Wall": imgWall,
  "Flowers": imgFlowers,
  "Platformer": imgPlatformer,
};

const TILESETS_STM: Record<string, { definition: string, dirPath: string, genSym: boolean }> = {
  "Castle": { definition: tilesetCastle, dirPath: `${BASE_TILESET_PATH}/castle`, genSym: true },
  "Circuit": { definition: tilesetCircuit, dirPath: `${BASE_TILESET_PATH}/circuit`, genSym: true },
  "Summer": { definition: tilesetSummer, dirPath: `${BASE_TILESET_PATH}/summer`, genSym: false },
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
  densityEditBtn: document.querySelector("#density-edit-btn") as HTMLButtonElement,
  resetDensityBtn: document.querySelector("#reset-density-btn") as HTMLButtonElement,
  densityBrushRange: document.querySelector("#density-brush") as HTMLButtonElement,
  status: document.querySelector("#status") as HTMLElement,
  canvas: document.querySelector("#main-canvas") as HTMLCanvasElement,
  previewTilesCheck: document.querySelector("#preview-tiles-check") as HTMLInputElement,
  previewTilesSection: document.querySelector("#preview-section") as HTMLDivElement,
  previewCanvas: document.querySelector("#preview-canvas") as HTMLCanvasElement,
};

// WFC global references
interface State {
  mode: "running" | "density-edit" | "flow-edit";
  tileset: Tileset | null;
  wave: Wave | null;

  densityMap: number[][] | null;
  emptyTiles: Set<number>;
  tilesetNeedsReload: boolean;
};

const wfc: State = {
  mode: "running",
  tileset: null,
  wave: null,
  densityMap: null,
  emptyTiles: new Set(),
  tilesetNeedsReload: true,
};

function initUI() {
  // speed control
  ui.speedRange.addEventListener("input", () => {
    ui.speedVal.innerText = ui.speedRange.value;
  });

  // change output size
  ui.outputSize.addEventListener("input", () => {
    gpuBase = null; // invalidate current gpu config to force a new setup
    gpuApp = null;
    currentCancelToken.cancelled = true;

    if (wfc.mode == "running") {
      ui.status.innerText = "Generation stopped: output size changed.";
    }
    else {
      ui.status.innerText = "Editing reset: output size changed.";
      editDensityMap();
    }
  });

  // tile preview
  const setPreviewDisplay = () => {
    updateTilesPreview();

    const shown = ui.previewTilesCheck.checked;
    ui.previewTilesSection.style.display = shown ? "flex" : "none";

    if (wfc.mode == "density-edit")
      ui.previewTilesSection.querySelector("h2")!.innerText = "Select empty tiles:";
    else
      ui.previewTilesSection.querySelector("h2")!.innerText = "Extracted tiles:";
  };

  setPreviewDisplay();
  ui.previewTilesCheck.addEventListener("input", setPreviewDisplay);

  // restart generation
  ui.restartBtn.addEventListener("click", () => {
    wfc.mode = "running";
    setPreviewDisplay();
    runSimulation();
  });

  // density edit
  ui.densityEditBtn.addEventListener("click", () => {
    wfc.mode = "density-edit";
    currentCancelToken.cancelled = true;

    // update ui
    ui.status.innerText = "Entered density map editing mode."
    ui.previewTilesCheck.checked = true;
    setPreviewDisplay();

    editDensityMap();
  });

  const resetDensity = () => {
    if (wfc.densityMap) {
      const n = parseInt(ui.outputSize.value);
      wfc.densityMap = Array.from({ length: n }, () => new Array(n).fill(0));

      ui.status.innerText = "Density map reset.";
    }
  };
  ui.resetDensityBtn.addEventListener("click", resetDensity);

  // resets to be done when image changes
  const resetTileset = () => {
    wfc.tilesetNeedsReload = true;

    resetDensity();
    wfc.emptyTiles = new Set();

    if (wfc.mode == "running") runSimulation();
    else
      loadTileset().then(() => { wfc.tilesetNeedsReload = false; });
  };
  ui.imgSelect.addEventListener("input", resetTileset);

  // model selection
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
  ui.modelSelect.addEventListener("input", () => {
    setInputOptions();
    resetTileset();
  });


  // mouse events
  ui.previewCanvas.addEventListener("mousedown", (e) => {
    if (!wfc.tileset) return;
    if (wfc.mode == "running") return;

    ui.status.innerText = "Selecting empty tiles.";

    const cols = Math.floor(Math.sqrt(wfc.tileset.size));
    const rows = Math.ceil(wfc.tileset.size / cols);

    const x = Math.floor(cols * (e.offsetX / ui.previewCanvas.offsetWidth));
    const y = Math.floor(rows * (e.offsetY / ui.previewCanvas.offsetHeight));

    const i = idx(y, x, cols);

    if (i >= wfc.tileset.size) return;


    if (wfc.emptyTiles.has(i))
      wfc.emptyTiles.delete(i);
    else
      wfc.emptyTiles.add(i);

    updateTilesPreview();
  });

  // panning control
  let isDragging = false;
  let lastX = 0, lastY = 0;

  ui.canvas.addEventListener("mousedown", e => {
    isDragging = true;
    lastX = e.clientX;
    lastY = e.clientY;

    if (wfc.mode != "running") {
      ui.status.innerText = "Editing density map."
      paintDensity(e.offsetX, e.offsetY);
    }
  });

  window.addEventListener("mouseup", () => isDragging = false);

  ui.canvas.addEventListener("mousemove", e => {
    if (!isDragging || !gpuApp) return;

    if (wfc.mode == "running") {
      pan.x += e.clientX - lastX;
      pan.y += e.clientY - lastY;

      updatePanData(gpuApp, pan);

      lastX = e.clientX;
      lastY = e.clientY;
    } else {
      paintDensity(e.offsetX, e.offsetY);
    }
  });
}

// ui helper functions
function paintDensity(mouseX: number, mouseY: number) {
  if (!wfc.densityMap) return;

  const n = parseInt(ui.outputSize.value);
  const brushSize = parseInt(ui.densityBrushRange.value);
  const intensity = 0.15;

  const canvas = ui.canvas;
  const gridY = Math.floor(n * (mouseY / canvas.offsetHeight));
  const gridX = Math.floor(n * (mouseX / canvas.offsetWidth));

  const radius = Math.ceil(brushSize / 2);
  
  const startY = Math.max(0, gridY - radius);
  const endY = Math.min(n - 1, gridY + radius);
  const startX = Math.max(0, gridX - radius);
  const endX = Math.min(n - 1, gridX + radius);

  for (let y = startY; y <= endY; y++) {
    for (let x = startX; x <= endX; x++) {
      const dist = (x - gridX) * (x - gridX) + (y - gridY) * (y - gridY);
      if (dist > radius * radius) continue;

      const decay = 1 - (dist / (radius * radius));
      const current = wfc.densityMap[y][x];
      wfc.densityMap[y][x] = Math.min(1.0, current + intensity * decay);
    }
  }
}

function updateTilesPreview(): void {
  if (!wfc.tileset) return;

  previewBlocks(
    ui.previewCanvas,
    wfc.tileset.tiles.map(t => t.pixels),
    Math.floor(Math.sqrt(wfc.tileset.size)),
    64,
    2,
    wfc.mode == "running" ? undefined : wfc.emptyTiles,
  );
}

// webgpu initialization
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

async function loadTileset() {
  const overlapping = ui.modelSelect.value == "OVERLAPPING";
  const imgKey = ui.imgSelect.value;
  const symmetry = ui.symSelect.value as SymmetryMode;
  const tileSize = parseInt(ui.nSize.value);

  try {
    if (overlapping) {
      wfc.tileset = await createOverlappingTileset(IMAGES_OVERLAPPING[imgKey], tileSize, symmetry);
    } else {
      const stm = TILESETS_STM[imgKey];
      const res = await createStmTileset(stm.definition, stm.dirPath, stm.genSym);

      wfc.tileset = res.tileset;
    }
  } catch (e) {
    console.error(e);
    ui.status.innerText = `Error loading tileset: ${e}`;
    return;
  }

  updateTilesPreview();
}

async function runSimulation() {
  currentCancelToken.cancelled = true; // stops previous call (previous call has ref to this obj)
  currentCancelToken = { cancelled: false }; // new obj ref
  const token = currentCancelToken;

  ui.status.innerText = "Loading...";
  
  const overlapping = ui.modelSelect.value == "OVERLAPPING";
  const outputSize = parseInt(ui.outputSize.value);
  const heuristic = ui.heuristicSelect.value as any;
  const toroidal = ui.toroidalCheck.checked;

  const base = await initGPU();
  if (!base) return;

  if (wfc.tilesetNeedsReload) {
    await loadTileset();
    wfc.tilesetNeedsReload = false;
  }

  if (!wfc.tileset) return;
  base.dimensions.tileSize = wfc.tileset.tileSize;

  if (token.cancelled) return;

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

async function editDensityMap() {
  const base = await initGPU();
  if (!base) return;

  const pipeline = initRenderPipeline(base);
  gpuApp = initGPUBuffers(pipeline, true);

  const n = parseInt(ui.outputSize.value);

  if (!wfc.densityMap || wfc.densityMap.length != n) {
    wfc.densityMap = Array.from({ length: n }, () => new Array(n).fill(0));
  }

  const encodeColor = (v: number) => {
    const val = Math.min(1, Math.max(0, v));
    return [val * 255, val * 255, val * 255, 1]; // black to white (rgba from 0 to 255)
  }

  const colorBuffer = new Uint8ClampedArray(n * n * 4);

  const frame = () => {
    if (wfc.mode !== "density-edit" || !gpuApp) return;

    let idx = 0;
    for (let y = 0; y < n; ++y) {
      for (let x = 0; x < n; ++x) {
        const [r, g, b, a] = encodeColor(wfc.densityMap![y][x]);
        colorBuffer[idx] = r;
        colorBuffer[idx + 1] = g;
        colorBuffer[idx + 2] = b;
        colorBuffer[idx + 3] = a;
        idx += 4;
      }
    }

    updateTexture(gpuApp!, colorBuffer);
    requestAnimationFrame(frame);
  };

  requestAnimationFrame(frame);
}

initUI();
setTimeout(runSimulation, 100);
