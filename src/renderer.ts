import displayShaders from "@/shaders/display.wgsl?raw";
import type { Dimensions, Vec2 } from "@/core/types";

export interface AppDimensions {
  grid: Dimensions;
  canvas: Dimensions;
  tileSize: number;
  pan: Vec2;
}

export interface GPUAppBase {
  device: GPUDevice;
  adapter: GPUAdapter;
  context: GPUCanvasContext;

  canvas: HTMLCanvasElement;
  canvasFormat: GPUTextureFormat;

  dimensions: AppDimensions;
}

export interface GPUAppPipeline extends GPUAppBase {
  shaderModule: GPUShaderModule;
  pipeline: GPURenderPipeline;
  bindGroupLayout: GPUBindGroupLayout;
}

export interface GPUApp extends GPUAppPipeline {
  bindGroup: GPUBindGroup;
  uniformBuffer: GPUBuffer;
  cellDataBuffer: GPUBuffer;
}

export async function initWebGPU(canvas: HTMLCanvasElement, dimensions: AppDimensions): Promise<GPUAppBase> {
  if (!navigator.gpu) throw new Error("WebGPU is not supported on this browser.");

  const adapter = await navigator.gpu.requestAdapter();
  if (!adapter) throw new Error("No adapter available for WebGPU.");

  canvas.width = dimensions.canvas.width;
  canvas.height = dimensions.canvas.height;

  const device = await adapter.requestDevice();

  const context = canvas.getContext("webgpu") as GPUCanvasContext;
  const canvasFormat = navigator.gpu.getPreferredCanvasFormat();

  context.configure({
    device,
    format: canvasFormat,
    alphaMode: "opaque",
  });

  return { adapter, device, canvas, context, canvasFormat, dimensions };
}

export function initRenderPipeline(app: GPUAppBase): GPUAppPipeline {
  const shaderModule = app.device.createShaderModule({
    label: "display shaders",
    code: displayShaders,
  });

  const bindGroupLayout = app.device.createBindGroupLayout({
    entries: [
      {
        binding: 0,
        visibility: GPUShaderStage.FRAGMENT,
        buffer: { type: "uniform" },
      },
      {
        binding: 1,
        visibility: GPUShaderStage.FRAGMENT,
        buffer: { type: "read-only-storage" },
      }
    ]
  });

  const pipeline = app.device.createRenderPipeline({
    label: "display grid with tiles pipeline",
    layout: app.device.createPipelineLayout({
      bindGroupLayouts: [bindGroupLayout],
    }),
    vertex: {
      module: shaderModule,
      entryPoint: "vs",
    },
    fragment: {
      module: shaderModule,
      entryPoint: "fs",
      targets: [{ format: app.canvasFormat }],
    },
  });

  return { ...app, shaderModule, bindGroupLayout, pipeline };
}

export function initGPUBuffers(app: GPUAppPipeline): GPUApp {
  const configData = new Uint32Array([
    app.dimensions.grid.width,
    app.dimensions.grid.height,
    app.dimensions.canvas.width,
    app.dimensions.canvas.height,
    app.dimensions.tileSize,
    0,
    app.dimensions.pan.x,
    app.dimensions.pan.y,
  ]);

  const uniformBuffer = app.device.createBuffer({
    label: "config uniform buffer",
    usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
    size: configData.byteLength,
  });

  app.device.queue.writeBuffer(uniformBuffer, 0, configData);

  const cellDataBuffer = app.device.createBuffer({
    label: "cell data storage uniform buffer",
    usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
    size: (app.dimensions.grid.width * app.dimensions.grid.height) // for each tile (x, y)
      // * (app.dimensions.tileSize * app.dimensions.tileSize) // pixels for each tile
      * 4 * 4, // RGBA and 4 bytes each
  });


  const bindGroup = app.device.createBindGroup({
    layout: app.bindGroupLayout,
    entries: [
      {
        binding: 0,
        resource: { buffer: uniformBuffer },
      },
      {
        binding: 1,
        resource: { buffer: cellDataBuffer },
      }
    ],
  });

  return { ...app, bindGroup, uniformBuffer, cellDataBuffer };
}

export function updateCellData(app: GPUApp, data: Float32Array | Array<number>): void {
  const arr = new Float32Array(data);

  if (arr.byteLength != app.cellDataBuffer.size)
    throw Error("Tried to update cell data with invalid size.")

  app.device.queue.writeBuffer(app.cellDataBuffer, 0, arr);
}

export function updatePanData(app: GPUApp, pan: Vec2) {
  app.device.queue.writeBuffer(app.uniformBuffer, 24, new Float32Array([pan.x, pan.y]));
}

export function render(app: GPUApp): void {
  const renderPassDescriptor: GPURenderPassDescriptor = {
    label: "display render pass",
    colorAttachments: [
      {
        view: app.context.getCurrentTexture().createView(),
        clearValue: [0.0, 0.0, 0.0, 1.0],
        loadOp: "clear",
        storeOp: "store",
      },
    ],
  };

  const encoder = app.device.createCommandEncoder({ label: "display encoder" });
  const pass = encoder.beginRenderPass(renderPassDescriptor);

  pass.setPipeline(app.pipeline);
  pass.setBindGroup(0, app.bindGroup);
  pass.draw(6);
  pass.end();

  const commandBuffer = encoder.finish();
  app.device.queue.submit([commandBuffer]);
}
