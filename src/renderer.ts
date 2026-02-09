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
  outputTexture: GPUTexture;
  outputTextureDimensions: Dimensions;
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
        texture: {
          sampleType: "float",
          viewDimension: "2d",
          multisampled: false,
        },
      },
      {
        binding: 2,
        visibility: GPUShaderStage.FRAGMENT,
        sampler: {
          type: "filtering",
        }
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

export function initGPUBuffers(app: GPUAppPipeline, unitTile: boolean): GPUApp {
  const configData = new Uint32Array([
    app.dimensions.canvas.width, app.dimensions.canvas.height,
    app.dimensions.pan.x, app.dimensions.pan.y,
  ]);

  const uniformBuffer = app.device.createBuffer({
    label: "config uniform buffer",
    usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
    size: configData.byteLength,
  });

  app.device.queue.writeBuffer(uniformBuffer, 0, configData);

  const textureDimensions: Dimensions = {
    width: app.dimensions.grid.width * (unitTile ? 1 : app.dimensions.tileSize),
    height: app.dimensions.grid.height * (unitTile ? 1 : app.dimensions.tileSize),
  };

  const outputTexture = app.device.createTexture({
    label: "cell color texture",
    size: [textureDimensions.width, textureDimensions.height],
    format: "rgba8unorm",
    usage: GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.COPY_DST,
  });

  const sampler = app.device.createSampler({
    magFilter: "nearest",
    minFilter: "nearest",
    addressModeU: "repeat",
    addressModeV: "repeat",
  });

  const bindGroup = app.device.createBindGroup({
    layout: app.bindGroupLayout,
    entries: [
      { binding: 0, resource: { buffer: uniformBuffer } },
      { binding: 1, resource: outputTexture.createView() },
      { binding: 2, resource: sampler },
    ],
  });

  return { ...app, bindGroup, uniformBuffer, outputTexture, outputTextureDimensions: textureDimensions };
}

export function updateTexture(app: GPUApp, data: Uint8ClampedArray): void {
  const { width, height } = app.outputTextureDimensions;

  if (data.byteLength !== width * height * 4)
      throw Error("Tried to update texture with invalid size.")

  app.device.queue.writeTexture(
    { texture: app.outputTexture },
    data as GPUAllowSharedBufferSource,
    { bytesPerRow: width * 4 },
    { width, height },
  );
}

export function updatePanData(app: GPUApp, pan: Vec2) {
  app.device.queue.writeBuffer(app.uniformBuffer, 8, new Float32Array([pan.x, pan.y]));
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
