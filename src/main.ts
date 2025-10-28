// import { assert } from "@/utils";
import { extractPixelBlocks, previewPixelBlocks } from "@/io/image";
import { generateTileset } from "@/core/tileset";
import { Wave } from "@/wfc";

import flowers from "@assets/flowers.png";

(async () => {
  if (!navigator.gpu) {
    const t = document.querySelector("#title") as HTMLElement;
    t.innerHTML = "WebGPU is not supported on this browser.";
    t.style.display = "block";

    return;
  }

  const adapter = await navigator.gpu.requestAdapter();

  if (!adapter) {
    const t = document.querySelector("#title") as HTMLElement;
    t.innerHTML = "No adapter available for WebGPU";
    t.style.display = "block";

    return;
  }

  const { blocks, cols } = await extractPixelBlocks(flowers, 3);
  const tileset = generateTileset(blocks, cols);
  const wave = new Wave(200, 200, tileset);
  wave.collapse();

  previewPixelBlocks(document.querySelector("body")!, blocks, cols);

  // const device = await adapter.requestDevice();
  // const canvas = document.querySelector<HTMLCanvasElement>("canvas");
  // assert(canvas !== null);
  //
  // const context = canvas.getContext("webgpu") as GPUCanvasContext;
  // // renderTriangle(context, device);
  //
  // const observer = new ResizeObserver(() => {
  //   canvas.width = canvas.clientWidth;
  //   canvas.height = canvas.clientHeight;
  //   // add logic to resize render target textures here.
  // });
})();
