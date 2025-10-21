// import { assert } from "./utils/util";

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
