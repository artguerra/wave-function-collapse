import { createOverlappingTileset } from "@/io/overlapping";
import { createStmTileset } from "@/io/stm";
import { randomSRGBAColor } from "@/utils";
import { idx } from "@/utils/grid";
import { previewBlocks, previewMaps, renderFlowArrows } from "@/utils/image";
import type { RGBA, SymmetryMode, Vec2 } from "@/core/types";
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
import tilesetCustom from "@assets/tilesets/wfc_tileset/tileset.xml?raw";

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
  "Custom": { definition: tilesetCustom, dirPath: `${BASE_TILESET_PATH}/wfc_tileset`, genSym: true },
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
  // general
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

  // previews
  previewSidebar: document.querySelector("#preview-section") as HTMLDivElement,
  previewTilesCheck: document.querySelector("#preview-tiles-check") as HTMLInputElement,
  previewMapsCheck: document.querySelector("#preview-maps-check") as HTMLInputElement,
  tilesPreviewSection: document.querySelector("#tiles-preview") as HTMLDivElement,
  tilesPreviewCanvas: document.querySelector("#preview-canvas") as HTMLCanvasElement,
  mapsPreviewsSection: document.querySelector("#maps-previews") as HTMLDivElement,

  // density
  densityEditBtn: document.querySelector("#density-edit-btn") as HTMLButtonElement,
  resetDensityBtn: document.querySelector("#reset-density-btn") as HTMLButtonElement,
  densityBrushRange: document.querySelector("#density-brush") as HTMLButtonElement,
  densityPreviewCanvas: document.querySelector("#density-preview-canvas") as HTMLCanvasElement,
  densityMapChooserDiv: document.querySelector("#density-map-chooser") as HTMLDivElement,
  addDensityMapBtn: document.querySelector("#add-density-map-btn") as HTMLButtonElement,

  // flow
  flowEditBtn: document.querySelector("#flow-edit-btn") as HTMLButtonElement,
  resetFlowBtn: document.querySelector("#reset-flow-btn") as HTMLButtonElement,
  flowPreviewCanvas: document.querySelector("#flow-preview-canvas") as HTMLCanvasElement,
  flowOverlayCanvas: document.querySelector("#flow-overlay-canvas") as HTMLCanvasElement,
};

// WFC global references
interface State {
  mode: "running" | "density-edit" | "flow-edit";
  tileset: Tileset | null;
  wave: Wave | null;

  densityMaps: number[][][];
  denseTilesPerMap: Set<number>[];
  densityMapsColors: RGBA[],
  currentDensityMap: number;

  flowMap: Vec2[][];  
  floorTile: number;

  tilesetNeedsReload: boolean;
};

const wfc: State = {
  mode: "running",
  tileset: null,
  wave: null,

  densityMaps: [],
  denseTilesPerMap: [],
  densityMapsColors: [],
  currentDensityMap: 0,

  flowMap: [],
  floorTile: -1,

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

  // tile & maps preview
  const setPreviewDisplay = () => {
    updateTilesPreview();

    const previewTiles = ui.previewTilesCheck.checked;
    const previewMaps = ui.previewMapsCheck.checked;
    ui.previewSidebar.style.display = previewTiles || previewMaps ? "flex" : "none";
    ui.tilesPreviewSection.style.display = previewTiles ? "flex" : "none";
    ui.mapsPreviewsSection.style.display = previewMaps ? "flex" : "none";
    ui.densityMapChooserDiv.style.display = wfc.mode === "density-edit" ? "flex" : "none";
    ui.flowOverlayCanvas.style.display = wfc.mode === "flow-edit" ? "block" : "none";

    if (wfc.mode === "density-edit")
      ui.tilesPreviewSection.querySelector("h2")!.innerText = "Select tiles to densen:";
    else if (wfc.mode === "flow-edit")
      ui.tilesPreviewSection.querySelector("h2")!.innerText = "Select floor tile:";
    else if (wfc.mode === "running")
      ui.tilesPreviewSection.querySelector("h2")!.innerText = "Extracted tiles:";
  };

  setPreviewDisplay();
  ui.previewTilesCheck.addEventListener("input", setPreviewDisplay);
  ui.previewMapsCheck.addEventListener("input", setPreviewDisplay);

  // restart generation
  ui.restartBtn.addEventListener("click", () => {
    wfc.mode = "running";

    if (wfc.densityMaps.length > 0) ui.previewMapsCheck.checked = true;
    if (wfc.flowMap.length > 0 && wfc.floorTile !== -1) ui.previewMapsCheck.checked = true;

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
    ui.previewMapsCheck.checked = false;
    setPreviewDisplay();

    editDensityMap();
  });

  // add new density map
  const addDensityMap = () => {
    createNewDensityMap();
    updateTilesPreview();
  };
  ui.addDensityMapBtn.addEventListener("click", addDensityMap);

  const resetDensity = () => {
    if (wfc.densityMaps.length > 0) {
      ui.status.innerText = "All density maps reset.";

      wfc.currentDensityMap = 0;
      wfc.densityMaps = [];
      wfc.denseTilesPerMap = [];
      wfc.densityMapsColors = [];
      
      ui.densityMapChooserDiv.querySelectorAll(".density-map-chooser").forEach(e => e.remove());
      addDensityMap();
    }
  };
  ui.resetDensityBtn.addEventListener("click", resetDensity);

  // flow edit
  ui.flowEditBtn.addEventListener("click", () => {
    wfc.mode = "flow-edit";
    currentCancelToken.cancelled = true;

    ui.status.innerText = "Entered flow map editing mode.";
    ui.previewTilesCheck.checked = true;
    ui.previewMapsCheck.checked = false;
    setPreviewDisplay();

    editFlowMap();
  });

  const resetFlow = () => {
    const n = parseInt(ui.outputSize.value);

    wfc.flowMap = Array.from({ length: n }, () => 
      Array.from({ length: n }, () => ({ x: 0, y: 0 }))
    );
    wfc.floorTile = -1;

    ui.status.innerText = "Flow map reset.";
  };
  ui.resetFlowBtn.addEventListener("click", resetFlow);

  // resets to be done when image changes
  const resetTileset = () => {
    wfc.tilesetNeedsReload = true;

    resetDensity();
    resetFlow();

    if (wfc.mode == "running") runSimulation();
    else
      loadTileset().then(() => { wfc.tilesetNeedsReload = false; });
  };
  ui.imgSelect.addEventListener("input", resetTileset);
  ui.symSelect.addEventListener("input", resetTileset);

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
  ui.tilesPreviewCanvas.addEventListener("mousedown", (e) => {
    if (!wfc.tileset) return;
    if (wfc.mode === "running") return;
    if (wfc.mode === "density-edit" && wfc.densityMaps.length <= wfc.currentDensityMap) return;

    if (wfc.mode === "density-edit")
      ui.status.innerText = `Selecting dense tiles for map ${wfc.currentDensityMap}.`;

    const cols = Math.floor(Math.sqrt(wfc.tileset.size));
    const rows = Math.ceil(wfc.tileset.size / cols);

    const x = Math.floor(cols * (e.offsetX / ui.tilesPreviewCanvas.offsetWidth));
    const y = Math.floor(rows * (e.offsetY / ui.tilesPreviewCanvas.offsetHeight));

    const i = idx(y, x, cols);

    if (i >= wfc.tileset.size) return;

    if (wfc.mode === "density-edit") {
      const denseTiles = wfc.denseTilesPerMap[wfc.currentDensityMap];
      if (denseTiles.has(i))
        denseTiles.delete(i);
      else
        denseTiles.add(i);
    } else if (wfc.mode === "flow-edit") {
      wfc.floorTile = i;
      wfc.tileset.updateTileDirections(i);
      ui.status.innerText = `Floor tile selected.`;
    }

    updateTilesPreview();
  });

  // panning control
  let isDragging = false;
  let lastX = 0, lastY = 0;

  ui.canvas.addEventListener("mousedown", e => {
    isDragging = true;
    lastX = e.clientX;
    lastY = e.clientY;

    if (wfc.mode === "density-edit") {
      ui.status.innerText = "Editing density map."
      paintMap("density", e.offsetX, e.offsetY);
    } else if (wfc.mode === "flow-edit") {
      ui.status.innerText = "Editing flow map."
    }
  });

  window.addEventListener("mouseup", () => isDragging = false);

  ui.canvas.addEventListener("mousemove", e => {
    if (!isDragging || !gpuApp) return;

    if (wfc.mode === "running") {
      pan.x += e.clientX - lastX;
      pan.y += e.clientY - lastY;

      updatePanData(gpuApp, pan);

      lastX = e.clientX;
      lastY = e.clientY;
    } else if (wfc.mode === "density-edit") {
      paintMap("density", e.offsetX, e.offsetY);
    } else if (wfc.mode === "flow-edit") {
      const dx = e.clientX - lastX;
      const dy = e.clientY - lastY;

      const dist = Math.sqrt(dx * dx + dy * dy);

      if (dist > 2) {
        paintMap("flow", e.offsetX, e.offsetY, dx / dist, dy / dist);
        lastX = e.clientX;
        lastY = e.clientY;
      }
    }
  });
}

// ui helper functions
function paintMap(
  mode: "density" | "flow", mouseX: number, mouseY: number,
  dirX?: number, dirY?: number
) {
  if (mode === "density" && wfc.densityMaps.length <= wfc.currentDensityMap) return;

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

      if (mode === "density") {
        const decay = 1 - (dist / (radius * radius));
        const current = wfc.densityMaps[wfc.currentDensityMap][y][x];
        wfc.densityMaps[wfc.currentDensityMap][y][x] = Math.min(1.0, current + intensity * decay);
      } else if (mode === "flow") {
        const cell = wfc.flowMap[y][x];
        
        // interpolate current cell dir and new brush dir
        let nx = cell.x * (1 - intensity) + dirX! * intensity;
        let ny = cell.y * (1 - intensity) + dirY! * intensity;
        
        // normalize the vector
        const len = Math.sqrt(nx * nx + ny * ny);
        if (len > 0) {
          wfc.flowMap[y][x] = { x: nx / len, y: ny / len };
        }
      }
    }
  }
}

function createNewDensityMap() {
  const n = parseInt(ui.outputSize.value);
  const id = wfc.densityMaps.length;

  wfc.currentDensityMap = id;
  wfc.densityMaps.push(Array.from({ length: n }, () => new Array(n).fill(0)));
  wfc.denseTilesPerMap.push(new Set());
  wfc.densityMapsColors.push(randomSRGBAColor());
  ui.status.innerText = `New density map ${id} created.`;
  
  // remove other clicked statuses
  const resetClicked = () => {
    ui.densityMapChooserDiv.querySelectorAll(".density-map-chooser").forEach(btn => {
      btn.classList.remove("clicked");
    });
  };
  resetClicked();

  const newBtn = document.createElement("button");
  newBtn.innerText = `${wfc.currentDensityMap}`;
  newBtn.classList.add("density-map-chooser", "secondary-btn", "clicked");
  newBtn.addEventListener("click", () => {
    wfc.currentDensityMap = id;
    resetClicked();

    newBtn.classList.add("clicked")
    updateTilesPreview();
  });

  ui.densityMapChooserDiv.insertBefore(newBtn, ui.addDensityMapBtn);
}

function updateTilesPreview(): void {
  if (!wfc.tileset) return;

  const tilePreviewSize = Math.floor(Math.sqrt(wfc.tileset.size));
  const tilePreviewScale = 64;
  const tilePreviewGap = 2;

  previewBlocks(
    ui.tilesPreviewCanvas,
    wfc.tileset.tiles.map(t => t.variations[0]),
    tilePreviewSize,
    tilePreviewScale,
    tilePreviewGap,
    wfc.mode === "density-edit" ? wfc.denseTilesPerMap[wfc.currentDensityMap] : undefined,
    wfc.mode === "density-edit" ? wfc.densityMapsColors[wfc.currentDensityMap] : undefined,
    wfc.mode === "flow-edit" ? wfc.floorTile : undefined,
    wfc.tileset.tileDirectionsComputed ? wfc.tileset.tiles.map(t => t.dirStrength!) : undefined,
  );

  const gridWidth = parseInt(ui.outputSize.value);
  const scale = (tilePreviewSize * (tilePreviewScale + tilePreviewGap)) / gridWidth;

  if (wfc.densityMaps.length > 0) {
    previewMaps(ui.densityPreviewCanvas, wfc.densityMaps, wfc.densityMapsColors, scale);
  }

  if (wfc.flowMap && wfc.flowMap.length > 0) {
    renderFlowArrows(ui.flowPreviewCanvas, wfc.flowMap, { fillBackground: true, fixedScale: scale });
  }
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
      const res = await createStmTileset(stm.definition, stm.dirPath, stm.genSym, imgKey === "Custom");

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
  wfc.wave = new Wave(
    outputSize, outputSize, wfc.tileset,
    overlapping, heuristic, toroidal,
    wfc.densityMaps.length > 0 ? wfc.densityMaps : undefined,
    wfc.denseTilesPerMap.length > 0 ? wfc.denseTilesPerMap: undefined,
    wfc.flowMap.length > 0 && wfc.tileset.tileDirectionsComputed ? wfc.flowMap : undefined,
  );

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

  if (wfc.densityMaps.length === 0 || wfc.densityMaps[0].length != n) {
    createNewDensityMap();
  }

  const encodeColor = (mapIdx: number, v: number) => {
    const val = Math.min(1, Math.max(0, v));
    const color = wfc.densityMapsColors[mapIdx];

    return [val * color[0], val * color[1], val * color[2], color[3]];
  };

  const colorBuffer = new Uint8ClampedArray(n * n * 4);

  const frame = () => {
    if (wfc.mode !== "density-edit" || !gpuApp) return;

    let idx = 0;
    for (let y = 0; y < n; ++y) {
      for (let x = 0; x < n; ++x) {
        const value = wfc.densityMaps![wfc.currentDensityMap][y][x];
        const [r, g, b, a] = encodeColor(wfc.currentDensityMap, value);

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

async function editFlowMap() {
  const base = await initGPU();
  if (!base) return;

  const pipeline = initRenderPipeline(base);
  gpuApp = initGPUBuffers(pipeline, true);

  const n = parseInt(ui.outputSize.value);

  if (wfc.flowMap.length === 0 || wfc.flowMap.length !== n) {
    wfc.flowMap = Array.from({ length: n }, () => 
      Array.from({ length: n }, () => ({ x: 0, y: 0 }))
    );
  }

  const frame = () => {
    if (wfc.mode !== "flow-edit" || !gpuApp) return;

    renderFlowArrows(ui.flowOverlayCanvas, wfc.flowMap, {}, ui.canvas);
    requestAnimationFrame(frame);
  };

  requestAnimationFrame(frame);
}

initUI();
setTimeout(runSimulation, 100);
