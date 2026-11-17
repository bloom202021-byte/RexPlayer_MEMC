/// <reference types="@webgpu/types" />
import {
  WGSL_FLOW_COMPUTE_SHADER,
  WGSL_INGEST_EXTERNAL_SHADER,
  WGSL_SYNTH_RENDER_SHADER
} from './wgslShaders';

export interface WebGPUAdapterMeta {
  vendor: string;
  renderer: string;
  isAdreno: boolean;
  modelLabel: string;
  gmemCacheLabel: string;
  hasShaderF16: boolean;
  maxTextureDim: number;
}

export interface WebGPUSynthParams {
  vw: number;
  vh: number;
  outW: number;
  outH: number;
  subW: number;
  subH: number;
  stageAW: number;
  stageAH: number;
  flowCols: number;
  flowRows: number;
  alpha: number;
  strength: number;
  maxShift: number;
  haloGuard: number;
  mode: number; // 0=off, 1=blend, 2=optical, 3=rife
  splitCompare: number;
  monochrome: number;
  showVectors: number;
  showSadHeatmap: number;
  uvScaleX: number;
  uvScaleY: number;
  brightness: number;
  contrast: number;
  saturation: number;
  blackPoint: number;
  debandStrength: number;
  lutStrength: number;
  hdrStrength: number;
  targetFps: number;
  upscaleMode: number;
  upscaleFactor: number;
  upscaleSharpness: number;
  upscaleDenoise: number;
  adrenoOpt: number;
  adrenoTrue10: number;
  cascadeShaderVal: number;
  coherenceGuard: number;
  needPass2A: boolean;
  needStageAPostPass: boolean;
}

const PYR_L4_COLS = 16;
const PYR_L4_ROWS = 9;
const PYR_L3_COLS = 32;
const PYR_L3_ROWS = 18;
const PYR_L2_COLS = 64;
const PYR_L2_ROWS = 36;
const PYR_L1_COLS = 128;
const PYR_L1_ROWS = 72;
const PYR_L05_COLS = 256;
const PYR_L05_ROWS = 144;

export interface WebGPUProbeResult {
  supported: boolean;
  reason?: string;
  adapterMeta?: WebGPUAdapterMeta;
}

export async function probeWebGPUCapability(): Promise<WebGPUProbeResult> {
  if (typeof navigator === 'undefined' || !('gpu' in navigator) || !navigator.gpu) {
    return { supported: false, reason: 'navigator.gpu недоступен' };
  }
  try {
    const adapter = await navigator.gpu.requestAdapter({ powerPreference: 'high-performance' });
    if (!adapter) {
      return { supported: false, reason: 'GPUAdapter не найден' };
    }
    const meta = extractAdapterMeta(adapter);
    return { supported: true, adapterMeta: meta };
  } catch (err) {
    return {
      supported: false,
      reason: err instanceof Error ? err.message : 'Ошибка инициализации адаптера WebGPU'
    };
  }
}

function extractAdapterMeta(adapter: GPUAdapter): WebGPUAdapterMeta {
  const info: Partial<GPUAdapterInfo> =
    (adapter as unknown as { info?: GPUAdapterInfo }).info || {};
  const rawVendor = String(info.vendor || 'WebGPU');
  const rawArch = String(info.architecture || '');
  const rawDevice = String(info.device || '');
  const rawDesc = String(info.description || '');
  const combined = `${rawVendor} ${rawArch} ${rawDevice} ${rawDesc}`.trim();
  const isAdreno = /adreno|qualcomm|snapdragon|freedreno/i.test(combined);
  const adrenoMatch = combined.match(/Adreno\s*(?:\(TM\))?\s*(\d{3}[a-zA-Z]?)/i);
  const modelNum = adrenoMatch ? parseInt(adrenoMatch[1], 10) : 0;
  const hasShaderF16 = adapter.features.has('shader-f16');
  const maxTextureDim = Math.min(3840, adapter.limits.maxTextureDimension2D || 4096);

  let modelLabel = 'WebGPU Adapter';
  let gmemCacheLabel = `WebGPU • WGSL Compute • RGBA16F${hasShaderF16 ? ' + F16' : ''}`;
  if (adrenoMatch) {
    modelLabel = `Qualcomm Adreno ${adrenoMatch[1]}`;
    const cacheTag = modelNum >= 800 ? '12MB GMEM' : modelNum >= 700 ? '4MB GMEM' : '1MB GMEM';
    gmemCacheLabel = `Adreno ${adrenoMatch[1]} • ${cacheTag} • WebGPU WGSL RGBA16F`;
  } else if (isAdreno) {
    modelLabel = 'Qualcomm Adreno (WebGPU)';
    gmemCacheLabel = 'Adreno GMEM • WebGPU WGSL Compute RGBA16F';
  } else if (rawDesc || rawDevice || rawArch) {
    const labelSrc = (rawDesc || `${rawVendor} ${rawDevice || rawArch}`).trim();
    modelLabel = labelSrc.slice(0, 34);
  }

  return {
    vendor: rawVendor,
    renderer: combined || 'WebGPU',
    isAdreno,
    modelLabel,
    gmemCacheLabel,
    hasShaderF16,
    maxTextureDim
  };
}

export class WebGPUMemcEngine {
  public readonly device: GPUDevice;
  public readonly canvasCtx: GPUCanvasContext;
  public readonly canvasFormat: GPUTextureFormat;
  public readonly adapterMeta: WebGPUAdapterMeta;
  public readonly maxGpuWidth: number;
  public readonly maxGpuHeight: number;

  private destroyed = false;
  private onDeviceLostCb?: (reason: string) => void;

  private linearSampler: GPUSampler;
  private ingestLayout: GPUBindGroupLayout;
  private flowLayout: GPUBindGroupLayout;
  private synthLayout: GPUBindGroupLayout;

  private ingestPipeline: GPURenderPipeline;
  private flowPipeline: GPUComputePipeline;
  private sadHeatPipeline: GPUComputePipeline;
  private clearFlowPipeline: GPUComputePipeline;
  private fboSynthPipeline: GPURenderPipeline;
  private screenSynthPipeline: GPURenderPipeline;

  private uniformAlign: number;
  private flowUniformBuf: GPUBuffer;
  private synthUniformBuf: GPUBuffer;

  // Persistent textures
  private dummyFloatTex: GPUTexture;
  private dummyFloatView: GPUTextureView;

  private prevKeyTex!: GPUTexture;
  private prevKeyView!: GPUTextureView;
  private currKeyTex!: GPUTexture;
  private currKeyView!: GPUTextureView;
  public allocatedTexW = 960;
  public allocatedTexH = 540;

  private lutTex: GPUTexture;
  private lutView: GPUTextureView;
  private lastLutKey = '';

  // 6-level flow pyramid textures (rgba16float)
  private pyrL4Tex!: GPUTexture;
  private pyrL4View!: GPUTextureView;
  private pyrL3Tex!: GPUTexture;
  private pyrL3View!: GPUTextureView;
  private pyrL2Tex!: GPUTexture;
  private pyrL2View!: GPUTextureView;
  private pyrL1Tex!: GPUTexture;
  private pyrL1View!: GPUTextureView;
  private pyrL05Tex!: GPUTexture;
  private pyrL05View!: GPUTextureView;
  private flowPrevTex!: GPUTexture;
  private flowPrevView!: GPUTextureView;
  private flowCurrTex!: GPUTexture;
  private flowCurrView!: GPUTextureView;
  private sadDebugTex!: GPUTexture;
  private sadDebugView!: GPUTextureView;
  public allocatedFlowCols = 256;
  public allocatedFlowRows = 144;

  // Sub-frame anchor cascade + Stage A pure frame (rgba16float)
  private subMidTex!: GPUTexture;
  private subMidView!: GPUTextureView;
  private subQ1Tex!: GPUTexture;
  private subQ1View!: GPUTextureView;
  private subQ3Tex!: GPUTexture;
  private subQ3View!: GPUTextureView;
  public allocatedSubframeW = 960;
  public allocatedSubframeH = 540;

  private stageATex!: GPUTexture;
  private stageAView!: GPUTextureView;
  public allocatedAnimeW = 960;
  public allocatedAnimeH = 540;

  private lastPass2ASig = '';
  private lastStageASig = '';

  private readonly flowScratchBuf = new ArrayBuffer(64);
  private readonly flowScratchF32 = new Float32Array(this.flowScratchBuf);
  private readonly flowScratchI32 = new Int32Array(this.flowScratchBuf);
  private readonly synthScratchBuf = new ArrayBuffer(144);
  private readonly synthScratchF32 = new Float32Array(this.synthScratchBuf);
  private readonly synthScratchI32 = new Int32Array(this.synthScratchBuf);

  private constructor(
    device: GPUDevice,
    canvasCtx: GPUCanvasContext,
    canvasFormat: GPUTextureFormat,
    adapterMeta: WebGPUAdapterMeta,
    pipelines: {
      linearSampler: GPUSampler;
      ingestLayout: GPUBindGroupLayout;
      flowLayout: GPUBindGroupLayout;
      synthLayout: GPUBindGroupLayout;
      ingestPipeline: GPURenderPipeline;
      flowPipeline: GPUComputePipeline;
      sadHeatPipeline: GPUComputePipeline;
      clearFlowPipeline: GPUComputePipeline;
      fboSynthPipeline: GPURenderPipeline;
      screenSynthPipeline: GPURenderPipeline;
    },
    onDeviceLost?: (reason: string) => void
  ) {
    this.device = device;
    this.canvasCtx = canvasCtx;
    this.canvasFormat = canvasFormat;
    this.adapterMeta = adapterMeta;
    this.maxGpuWidth = Math.min(3840, adapterMeta.maxTextureDim);
    this.maxGpuHeight = Math.min(2160, adapterMeta.maxTextureDim);
    this.onDeviceLostCb = onDeviceLost;

    this.linearSampler = pipelines.linearSampler;
    this.ingestLayout = pipelines.ingestLayout;
    this.flowLayout = pipelines.flowLayout;
    this.synthLayout = pipelines.synthLayout;
    this.ingestPipeline = pipelines.ingestPipeline;
    this.flowPipeline = pipelines.flowPipeline;
    this.sadHeatPipeline = pipelines.sadHeatPipeline;
    this.clearFlowPipeline = pipelines.clearFlowPipeline;
    this.fboSynthPipeline = pipelines.fboSynthPipeline;
    this.screenSynthPipeline = pipelines.screenSynthPipeline;

    this.uniformAlign = Math.max(256, device.limits.minUniformBufferOffsetAlignment || 256);
    this.flowUniformBuf = device.createBuffer({
      size: this.uniformAlign * 8,
      usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST
    });
    this.synthUniformBuf = device.createBuffer({
      size: this.uniformAlign * 5,
      usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST
    });

    this.dummyFloatTex = device.createTexture({
      size: [1, 1],
      format: 'rgba16float',
      usage: GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.RENDER_ATTACHMENT
    });
    this.dummyFloatView = this.dummyFloatTex.createView();

    this.lutTex = device.createTexture({
      size: [256, 16],
      format: 'rgba8unorm',
      usage: GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.COPY_DST | GPUTextureUsage.RENDER_ATTACHMENT
    });
    this.lutView = this.lutTex.createView();

    this.allocKeyTextures(960, 540);
    this.allocFlowTextures(256, 144);
    this.allocSubframeTextures(960, 540);
    this.allocStageATexture(960, 540);

    const initEnc = device.createCommandEncoder();
    this.clearFlowPair(initEnc);
    device.queue.submit([initEnc.finish()]);

    device.lost.then((info) => {
      if (!this.destroyed && this.onDeviceLostCb) {
        this.onDeviceLostCb(info.message || info.reason || 'Потерян контекст WebGPU');
      }
    });
  }

  public static async create(
    canvas: HTMLCanvasElement,
    onDeviceLost?: (reason: string) => void
  ): Promise<WebGPUMemcEngine> {
    if (typeof navigator === 'undefined' || !navigator.gpu) {
      throw new Error('WebGPU API не поддерживается в этом браузере');
    }
    const adapter = await navigator.gpu.requestAdapter({ powerPreference: 'high-performance' });
    if (!adapter) {
      throw new Error('Не найден совместимый GPU-адаптер WebGPU');
    }
    const adapterMeta = extractAdapterMeta(adapter);
    const device = await adapter.requestDevice();
    const ctx = canvas.getContext('webgpu') as GPUCanvasContext | null;
    if (!ctx) {
      device.destroy();
      throw new Error('Не удалось создать GPUCanvasContext');
    }

    const canvasFormat = navigator.gpu.getPreferredCanvasFormat();
    ctx.configure({
      device,
      format: canvasFormat,
      alphaMode: 'opaque',
      usage: GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.COPY_SRC
    });

    device.pushErrorScope('validation');

    const compileCheck = async (label: string, code: string) => {
      const mod = device.createShaderModule({ label, code });
      if (typeof mod.getCompilationInfo === 'function') {
        const info = await mod.getCompilationInfo();
        const err = info.messages.find((m) => m.type === 'error');
        if (err) {
          throw new Error(`WGSL [${label}] line ${err.lineNum}: ${err.message}`);
        }
      }
      return mod;
    };

    const [ingestMod, flowMod, synthMod] = await Promise.all([
      compileCheck('ingest', WGSL_INGEST_EXTERNAL_SHADER),
      compileCheck('flow', WGSL_FLOW_COMPUTE_SHADER),
      compileCheck('synth', WGSL_SYNTH_RENDER_SHADER)
    ]);

    const linearSampler = device.createSampler({
      magFilter: 'linear',
      minFilter: 'linear',
      addressModeU: 'clamp-to-edge',
      addressModeV: 'clamp-to-edge'
    });

    const ingestLayout = device.createBindGroupLayout({
      entries: [
        { binding: 0, visibility: GPUShaderStage.FRAGMENT, externalTexture: {} },
        { binding: 1, visibility: GPUShaderStage.FRAGMENT, sampler: { type: 'filtering' } }
      ]
    });

    const flowLayout = device.createBindGroupLayout({
      entries: [
        {
          binding: 0,
          visibility: GPUShaderStage.COMPUTE,
          buffer: { type: 'uniform', hasDynamicOffset: true }
        },
        { binding: 1, visibility: GPUShaderStage.COMPUTE, texture: { sampleType: 'float' } },
        { binding: 2, visibility: GPUShaderStage.COMPUTE, texture: { sampleType: 'float' } },
        { binding: 3, visibility: GPUShaderStage.COMPUTE, texture: { sampleType: 'float' } },
        { binding: 4, visibility: GPUShaderStage.COMPUTE, texture: { sampleType: 'float' } },
        { binding: 5, visibility: GPUShaderStage.COMPUTE, sampler: { type: 'filtering' } },
        {
          binding: 6,
          visibility: GPUShaderStage.COMPUTE,
          storageTexture: { access: 'write-only', format: 'rgba16float' }
        }
      ]
    });

    const synthLayout = device.createBindGroupLayout({
      entries: [
        {
          binding: 0,
          visibility: GPUShaderStage.VERTEX | GPUShaderStage.FRAGMENT,
          buffer: { type: 'uniform', hasDynamicOffset: true }
        },
        { binding: 1, visibility: GPUShaderStage.FRAGMENT, texture: { sampleType: 'float' } },
        { binding: 2, visibility: GPUShaderStage.FRAGMENT, texture: { sampleType: 'float' } },
        { binding: 3, visibility: GPUShaderStage.FRAGMENT, texture: { sampleType: 'float' } },
        { binding: 4, visibility: GPUShaderStage.FRAGMENT, texture: { sampleType: 'float' } },
        { binding: 5, visibility: GPUShaderStage.FRAGMENT, texture: { sampleType: 'float' } },
        { binding: 6, visibility: GPUShaderStage.FRAGMENT, texture: { sampleType: 'float' } },
        { binding: 7, visibility: GPUShaderStage.FRAGMENT, texture: { sampleType: 'float' } },
        { binding: 8, visibility: GPUShaderStage.FRAGMENT, texture: { sampleType: 'float' } },
        { binding: 9, visibility: GPUShaderStage.FRAGMENT, texture: { sampleType: 'float' } },
        { binding: 10, visibility: GPUShaderStage.FRAGMENT, sampler: { type: 'filtering' } }
      ]
    });

    const ingestPipeline = await device.createRenderPipelineAsync({
      layout: device.createPipelineLayout({ bindGroupLayouts: [ingestLayout] }),
      vertex: { module: ingestMod, entryPoint: 'vs_ingest' },
      fragment: {
        module: ingestMod,
        entryPoint: 'fs_ingest',
        targets: [{ format: 'rgba8unorm' }]
      },
      primitive: { topology: 'triangle-list' }
    });

    const flowPipelineLayout = device.createPipelineLayout({ bindGroupLayouts: [flowLayout] });
    const [flowPipeline, sadHeatPipeline, clearFlowPipeline] = await Promise.all([
      device.createComputePipelineAsync({
        layout: flowPipelineLayout,
        compute: { module: flowMod, entryPoint: 'cs_flow_level' }
      }),
      device.createComputePipelineAsync({
        layout: flowPipelineLayout,
        compute: { module: flowMod, entryPoint: 'cs_sad_heatmap' }
      }),
      device.createComputePipelineAsync({
        layout: flowPipelineLayout,
        compute: { module: flowMod, entryPoint: 'cs_clear_flow' }
      })
    ]);

    const synthPipelineLayout = device.createPipelineLayout({ bindGroupLayouts: [synthLayout] });
    const [fboSynthPipeline, screenSynthPipeline] = await Promise.all([
      device.createRenderPipelineAsync({
        layout: synthPipelineLayout,
        vertex: { module: synthMod, entryPoint: 'vs_synth' },
        fragment: {
          module: synthMod,
          entryPoint: 'fs_synth',
          targets: [{ format: 'rgba16float' }]
        },
        primitive: { topology: 'triangle-list' }
      }),
      device.createRenderPipelineAsync({
        layout: synthPipelineLayout,
        vertex: { module: synthMod, entryPoint: 'vs_synth' },
        fragment: {
          module: synthMod,
          entryPoint: 'fs_synth',
          targets: [{ format: canvasFormat }]
        },
        primitive: { topology: 'triangle-list' }
      })
    ]);

    const valErr = await device.popErrorScope();
    if (valErr) {
      device.destroy();
      throw new Error(`Ошибка валидации WebGPU: ${valErr.message}`);
    }

    return new WebGPUMemcEngine(
      device,
      ctx,
      canvasFormat,
      adapterMeta,
      {
        linearSampler,
        ingestLayout,
        flowLayout,
        synthLayout,
        ingestPipeline,
        flowPipeline,
        sadHeatPipeline,
        clearFlowPipeline,
        fboSynthPipeline,
        screenSynthPipeline
      },
      onDeviceLost
    );
  }

  private allocKeyTextures(w: number, h: number) {
    this.prevKeyTex?.destroy();
    this.currKeyTex?.destroy();
    this.allocatedTexW = Math.max(16, w);
    this.allocatedTexH = Math.max(16, h);
    const usage =
      GPUTextureUsage.TEXTURE_BINDING |
      GPUTextureUsage.COPY_DST |
      GPUTextureUsage.RENDER_ATTACHMENT;
    this.prevKeyTex = this.device.createTexture({
      size: [this.allocatedTexW, this.allocatedTexH],
      format: 'rgba8unorm',
      usage
    });
    this.currKeyTex = this.device.createTexture({
      size: [this.allocatedTexW, this.allocatedTexH],
      format: 'rgba8unorm',
      usage
    });
    this.prevKeyView = this.prevKeyTex.createView();
    this.currKeyView = this.currKeyTex.createView();
  }

  private makeFlowTex(w: number, h: number): [GPUTexture, GPUTextureView] {
    const tex = this.device.createTexture({
      size: [w, h],
      format: 'rgba16float',
      usage:
        GPUTextureUsage.TEXTURE_BINDING |
        GPUTextureUsage.STORAGE_BINDING |
        GPUTextureUsage.COPY_DST
    });
    return [tex, tex.createView()];
  }

  private allocFlowTextures(cols: number, rows: number) {
    if (!this.pyrL4Tex) {
      [this.pyrL4Tex, this.pyrL4View] = this.makeFlowTex(PYR_L4_COLS, PYR_L4_ROWS);
      [this.pyrL3Tex, this.pyrL3View] = this.makeFlowTex(PYR_L3_COLS, PYR_L3_ROWS);
      [this.pyrL2Tex, this.pyrL2View] = this.makeFlowTex(PYR_L2_COLS, PYR_L2_ROWS);
      [this.pyrL1Tex, this.pyrL1View] = this.makeFlowTex(PYR_L1_COLS, PYR_L1_ROWS);
      [this.pyrL05Tex, this.pyrL05View] = this.makeFlowTex(PYR_L05_COLS, PYR_L05_ROWS);
    }
    this.flowPrevTex?.destroy();
    this.flowCurrTex?.destroy();
    this.sadDebugTex?.destroy();
    this.allocatedFlowCols = Math.max(16, cols);
    this.allocatedFlowRows = Math.max(9, rows);
    [this.flowPrevTex, this.flowPrevView] = this.makeFlowTex(
      this.allocatedFlowCols,
      this.allocatedFlowRows
    );
    [this.flowCurrTex, this.flowCurrView] = this.makeFlowTex(
      this.allocatedFlowCols,
      this.allocatedFlowRows
    );
    [this.sadDebugTex, this.sadDebugView] = this.makeFlowTex(
      this.allocatedFlowCols,
      this.allocatedFlowRows
    );
  }

  private allocSubframeTextures(w: number, h: number) {
    this.subMidTex?.destroy();
    this.subQ1Tex?.destroy();
    this.subQ3Tex?.destroy();
    this.allocatedSubframeW = Math.max(16, w);
    this.allocatedSubframeH = Math.max(16, h);
    const usage = GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.RENDER_ATTACHMENT;
    this.subMidTex = this.device.createTexture({
      size: [this.allocatedSubframeW, this.allocatedSubframeH],
      format: 'rgba16float',
      usage
    });
    this.subQ1Tex = this.device.createTexture({
      size: [this.allocatedSubframeW, this.allocatedSubframeH],
      format: 'rgba16float',
      usage
    });
    this.subQ3Tex = this.device.createTexture({
      size: [this.allocatedSubframeW, this.allocatedSubframeH],
      format: 'rgba16float',
      usage
    });
    this.subMidView = this.subMidTex.createView();
    this.subQ1View = this.subQ1Tex.createView();
    this.subQ3View = this.subQ3Tex.createView();
  }

  private allocStageATexture(w: number, h: number) {
    this.stageATex?.destroy();
    this.allocatedAnimeW = Math.max(16, w);
    this.allocatedAnimeH = Math.max(16, h);
    this.stageATex = this.device.createTexture({
      size: [this.allocatedAnimeW, this.allocatedAnimeH],
      format: 'rgba16float',
      usage: GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.RENDER_ATTACHMENT
    });
    this.stageAView = this.stageATex.createView();
  }

  public configureCanvasSize(width: number, height: number) {
    this.canvasCtx.configure({
      device: this.device,
      format: this.canvasFormat,
      alphaMode: 'opaque',
      usage: GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.COPY_SRC
    });
    void width;
    void height;
  }

  public uploadLutIfChanged(lutKey: string, data: Uint8Array) {
    if (this.destroyed || this.lastLutKey === lutKey) return;
    this.lastLutKey = lutKey;
    this.device.queue.writeTexture(
      { texture: this.lutTex },
      data as unknown as BufferSource,
      { bytesPerRow: 256 * 4, rowsPerImage: 16 },
      { width: 256, height: 16 }
    );
  }

  private writeFlowUniformSlot(
    slotIdx: number,
    vw: number,
    vh: number,
    outW: number,
    outH: number,
    parentCols: number,
    parentRows: number,
    maxShiftVal: number,
    sceneCutProtect: boolean,
    adrenoTileOpt: boolean,
    debugSad: number,
    pyrLevel: number,
    rifeMode: boolean
  ) {
    const f32 = this.flowScratchF32;
    const i32 = this.flowScratchI32;
    const flowAspect = vw > 0 && vh > 0 ? vw / vh : 16 / 9;
    const clampedAspect = Math.max(0.5, Math.min(2.4, flowAspect));

    f32[0] = 1.0 / Math.max(1, vw);
    f32[1] = 1.0 / Math.max(1, vh);
    f32[2] = maxShiftVal;
    f32[3] = maxShiftVal * clampedAspect;
    f32[4] = 1.0 / Math.max(1, parentCols);
    f32[5] = 1.0 / Math.max(1, parentRows);
    f32[6] = outW;
    f32[7] = outH;
    i32[8] = sceneCutProtect ? 1 : 0;
    i32[9] = adrenoTileOpt ? 1 : 0;
    i32[10] = debugSad;
    i32[11] = pyrLevel;
    i32[12] = rifeMode ? 1 : 0;
    i32[13] = 1; // fp16Flow
    f32[14] = 0;
    f32[15] = 0;

    this.device.queue.writeBuffer(this.flowUniformBuf, slotIdx * this.uniformAlign, this.flowScratchBuf);
  }

  private writeSynthUniformSlot(
    slotIdx: number,
    p: WebGPUSynthParams,
    overrideAlpha: number,
    overrideFboPass: number,
    overrideCascade: number,
    overrideUseStageA: number
  ) {
    const f32 = this.synthScratchF32;
    const i32 = this.synthScratchI32;

    f32[0] = p.uvScaleX;
    f32[1] = p.uvScaleY;
    f32[2] = 1.0 / Math.max(1, p.vw);
    f32[3] = 1.0 / Math.max(1, p.vh);
    f32[4] = 1.0 / Math.max(1, p.flowCols);
    f32[5] = 1.0 / Math.max(1, p.flowRows);
    f32[6] = overrideAlpha;
    f32[7] = p.strength;
    f32[8] = p.maxShift;
    f32[9] = p.haloGuard;
    f32[10] = p.brightness;
    f32[11] = p.contrast;
    f32[12] = p.saturation;
    f32[13] = p.blackPoint;
    f32[14] = p.debandStrength;
    f32[15] = p.lutStrength;
    f32[16] = p.hdrStrength;
    f32[17] = p.targetFps;
    f32[18] = p.upscaleFactor;
    f32[19] = p.upscaleSharpness;
    f32[20] = p.upscaleDenoise;
    f32[21] = p.coherenceGuard;

    i32[22] = p.mode;
    i32[23] = p.splitCompare;
    i32[24] = p.monochrome;
    i32[25] = p.showVectors;
    i32[26] = p.showSadHeatmap;
    i32[27] = p.upscaleMode;
    i32[28] = p.adrenoOpt;
    i32[29] = p.adrenoTrue10;
    i32[30] = overrideFboPass;
    i32[31] = overrideCascade;
    i32[32] = 1; // fp16Flow
    i32[33] = overrideUseStageA;
    f32[34] = 0;
    f32[35] = 0;

    this.device.queue.writeBuffer(this.synthUniformBuf, slotIdx * this.uniformAlign, this.synthScratchBuf);
  }

  private clearFlowPair(encoder: GPUCommandEncoder) {
    this.writeFlowUniformSlot(
      7,
      this.allocatedTexW,
      this.allocatedTexH,
      this.allocatedFlowCols,
      this.allocatedFlowRows,
      this.allocatedFlowCols,
      this.allocatedFlowRows,
      0.04,
      false,
      false,
      0,
      0,
      false
    );
    const targets = [this.flowPrevView, this.flowCurrView];
    for (const outView of targets) {
      const bg = this.device.createBindGroup({
        layout: this.flowLayout,
        entries: [
          { binding: 0, resource: { buffer: this.flowUniformBuf, size: 64 } },
          { binding: 1, resource: this.prevKeyView },
          { binding: 2, resource: this.currKeyView },
          { binding: 3, resource: this.dummyFloatView },
          { binding: 4, resource: this.dummyFloatView },
          { binding: 5, resource: this.linearSampler },
          { binding: 6, resource: outView }
        ]
      });
      const pass = encoder.beginComputePass();
      pass.setPipeline(this.clearFlowPipeline);
      pass.setBindGroup(0, bg, [7 * this.uniformAlign]);
      pass.dispatchWorkgroups(
        Math.ceil(this.allocatedFlowCols / 8),
        Math.ceil(this.allocatedFlowRows / 8),
        1
      );
      pass.end();
    }
  }

  public pushNewKeyframeAndComputeFlow(
    source: HTMLVideoElement | HTMLCanvasElement,
    stagingCanvas: HTMLCanvasElement,
    stagingCtx: CanvasRenderingContext2D | null,
    vw: number,
    vh: number,
    sceneCutProtect: boolean,
    resetHistory: boolean,
    adrenoTileOpt: boolean,
    computeOpticalFlow: boolean,
    flowCols: number,
    flowRows: number,
    maxShiftVal: number,
    emitSadDebugBuffer: boolean,
    rifeMode: boolean
  ) {
    if (this.destroyed) return;
    this.lastPass2ASig = '';
    this.lastStageASig = '';

    const resChanged = vw !== this.allocatedTexW || vh !== this.allocatedTexH;
    if (resChanged) {
      this.allocKeyTextures(vw, vh);
    }

    // Ping-pong ring swap O(1)
    const tmpTex = this.prevKeyTex;
    const tmpView = this.prevKeyView;
    this.prevKeyTex = this.currKeyTex;
    this.prevKeyView = this.currKeyView;
    this.currKeyTex = tmpTex;
    this.currKeyView = tmpView;

    const encoder = this.device.createCommandEncoder();

    const uploadTarget = (targetTex: GPUTexture, targetView: GPUTextureView) => {
      if (source instanceof HTMLVideoElement) {
        try {
          const extTex = this.device.importExternalTexture({ source });
          const ingestBg = this.device.createBindGroup({
            layout: this.ingestLayout,
            entries: [
              { binding: 0, resource: extTex },
              { binding: 1, resource: this.linearSampler }
            ]
          });
          const pass = encoder.beginRenderPass({
            colorAttachments: [
              {
                view: targetView,
                loadOp: 'clear',
                clearValue: { r: 0, g: 0, b: 0, a: 1 },
                storeOp: 'store'
              }
            ]
          });
          pass.setPipeline(this.ingestPipeline);
          pass.setBindGroup(0, ingestBg);
          pass.draw(6, 1, 0, 0);
          pass.end();
          return;
        } catch {
          // Cross-origin fallback via stagingCanvas
          if (stagingCtx) {
            if (stagingCanvas.width !== vw || stagingCanvas.height !== vh) {
              stagingCanvas.width = vw;
              stagingCanvas.height = vh;
            }
            stagingCtx.drawImage(source, 0, 0, vw, vh);
            this.device.queue.copyExternalImageToTexture(
              { source: stagingCanvas },
              { texture: targetTex },
              { width: vw, height: vh }
            );
            return;
          }
        }
      }
      this.device.queue.copyExternalImageToTexture(
        { source },
        { texture: targetTex },
        { width: vw, height: vh }
      );
    };

    uploadTarget(this.currKeyTex, this.currKeyView);
    if (resetHistory || resChanged) {
      uploadTarget(this.prevKeyTex, this.prevKeyView);
      this.clearFlowPair(encoder);
    }

    if (computeOpticalFlow) {
      this.encodeFlowPass1(
        encoder,
        vw,
        vh,
        sceneCutProtect,
        adrenoTileOpt,
        flowCols,
        flowRows,
        maxShiftVal,
        emitSadDebugBuffer,
        true,
        rifeMode
      );
    }

    // Single unified queue submit for keyframe ingest + 6-level optical flow pyramid!
    this.device.queue.submit([encoder.finish()]);
  }

  public dispatchFlowPass1(
    vw: number,
    vh: number,
    sceneCutProtect: boolean,
    adrenoTileOpt: boolean,
    flowCols: number,
    flowRows: number,
    maxShiftVal: number,
    emitSadDebugBuffer: boolean,
    advanceHistory: boolean,
    rifeMode: boolean
  ) {
    if (this.destroyed) return;
    this.lastPass2ASig = '';
    this.lastStageASig = '';
    const encoder = this.device.createCommandEncoder();
    this.encodeFlowPass1(
      encoder,
      vw,
      vh,
      sceneCutProtect,
      adrenoTileOpt,
      flowCols,
      flowRows,
      maxShiftVal,
      emitSadDebugBuffer,
      advanceHistory,
      rifeMode
    );
    this.device.queue.submit([encoder.finish()]);
  }

  private encodeFlowPass1(
    encoder: GPUCommandEncoder,
    vw: number,
    vh: number,
    sceneCutProtect: boolean,
    adrenoTileOpt: boolean,
    flowCols: number,
    flowRows: number,
    maxShiftVal: number,
    emitSadDebugBuffer: boolean,
    advanceHistory: boolean,
    rifeMode: boolean
  ) {
    if (flowCols !== this.allocatedFlowCols || flowRows !== this.allocatedFlowRows) {
      this.allocFlowTextures(flowCols, flowRows);
      this.clearFlowPair(encoder);
    }

    if (advanceHistory) {
      const tmpT = this.flowPrevTex;
      const tmpV = this.flowPrevView;
      this.flowPrevTex = this.flowCurrTex;
      this.flowPrevView = this.flowCurrView;
      this.flowCurrTex = tmpT;
      this.flowCurrView = tmpV;
    }

    const runLevel = (
      slotIdx: number,
      pyrLevel: number,
      outCols: number,
      outRows: number,
      parentCols: number,
      parentRows: number,
      parentView: GPUTextureView,
      outView: GPUTextureView
    ) => {
      this.writeFlowUniformSlot(
        slotIdx,
        vw,
        vh,
        outCols,
        outRows,
        parentCols,
        parentRows,
        maxShiftVal,
        sceneCutProtect,
        adrenoTileOpt,
        0,
        pyrLevel,
        rifeMode
      );
      const bg = this.device.createBindGroup({
        layout: this.flowLayout,
        entries: [
          { binding: 0, resource: { buffer: this.flowUniformBuf, size: 64 } },
          { binding: 1, resource: this.prevKeyView },
          { binding: 2, resource: this.currKeyView },
          { binding: 3, resource: parentView },
          { binding: 4, resource: this.flowPrevView },
          { binding: 5, resource: this.linearSampler },
          { binding: 6, resource: outView }
        ]
      });
      const pass = encoder.beginComputePass();
      pass.setPipeline(this.flowPipeline);
      pass.setBindGroup(0, bg, [slotIdx * this.uniformAlign]);
      pass.dispatchWorkgroups(Math.ceil(outCols / 8), Math.ceil(outRows / 8), 1);
      pass.end();
    };

    // L4 (16x9)
    runLevel(
      0,
      4,
      PYR_L4_COLS,
      PYR_L4_ROWS,
      this.allocatedFlowCols,
      this.allocatedFlowRows,
      this.flowPrevView,
      this.pyrL4View
    );
    // L3 (32x18)
    runLevel(1, 3, PYR_L3_COLS, PYR_L3_ROWS, PYR_L4_COLS, PYR_L4_ROWS, this.pyrL4View, this.pyrL3View);
    // L2 (64x36)
    if (this.allocatedFlowCols >= PYR_L2_COLS) {
      runLevel(
        2,
        2,
        PYR_L2_COLS,
        PYR_L2_ROWS,
        PYR_L3_COLS,
        PYR_L3_ROWS,
        this.pyrL3View,
        this.pyrL2View
      );
    }
    // L1 (128x72)
    if (this.allocatedFlowCols >= PYR_L1_COLS) {
      runLevel(
        3,
        1,
        PYR_L1_COLS,
        PYR_L1_ROWS,
        PYR_L2_COLS,
        PYR_L2_ROWS,
        this.pyrL2View,
        this.pyrL1View
      );
    }
    // L0.5 (256x144)
    if (this.allocatedFlowCols > PYR_L05_COLS) {
      runLevel(
        4,
        5,
        PYR_L05_COLS,
        PYR_L05_ROWS,
        PYR_L1_COLS,
        PYR_L1_ROWS,
        this.pyrL1View,
        this.pyrL05View
      );
    }

    const l0ParentView =
      this.allocatedFlowCols > PYR_L05_COLS
        ? this.pyrL05View
        : this.allocatedFlowCols >= PYR_L1_COLS
        ? this.pyrL1View
        : this.allocatedFlowCols >= PYR_L2_COLS
        ? this.pyrL2View
        : this.pyrL3View;
    const l0ParentCols =
      this.allocatedFlowCols > PYR_L05_COLS
        ? PYR_L05_COLS
        : this.allocatedFlowCols >= PYR_L1_COLS
        ? PYR_L1_COLS
        : this.allocatedFlowCols >= PYR_L2_COLS
        ? PYR_L2_COLS
        : PYR_L3_COLS;
    const l0ParentRows =
      this.allocatedFlowCols > PYR_L05_COLS
        ? PYR_L05_ROWS
        : this.allocatedFlowCols >= PYR_L1_COLS
        ? PYR_L1_ROWS
        : this.allocatedFlowCols >= PYR_L2_COLS
        ? PYR_L2_ROWS
        : PYR_L3_ROWS;

    // L0 Final
    runLevel(
      5,
      0,
      this.allocatedFlowCols,
      this.allocatedFlowRows,
      l0ParentCols,
      l0ParentRows,
      l0ParentView,
      this.flowCurrView
    );

    if (emitSadDebugBuffer) {
      this.writeFlowUniformSlot(
        6,
        vw,
        vh,
        this.allocatedFlowCols,
        this.allocatedFlowRows,
        this.allocatedFlowCols,
        this.allocatedFlowRows,
        maxShiftVal,
        sceneCutProtect,
        adrenoTileOpt,
        1,
        0,
        rifeMode
      );
      const sadBg = this.device.createBindGroup({
        layout: this.flowLayout,
        entries: [
          { binding: 0, resource: { buffer: this.flowUniformBuf, size: 64 } },
          { binding: 1, resource: this.prevKeyView },
          { binding: 2, resource: this.currKeyView },
          { binding: 3, resource: this.flowCurrView },
          { binding: 4, resource: this.flowPrevView },
          { binding: 5, resource: this.linearSampler },
          { binding: 6, resource: this.sadDebugView }
        ]
      });
      const pass = encoder.beginComputePass();
      pass.setPipeline(this.sadHeatPipeline);
      pass.setBindGroup(0, sadBg, [6 * this.uniformAlign]);
      pass.dispatchWorkgroups(
        Math.ceil(this.allocatedFlowCols / 8),
        Math.ceil(this.allocatedFlowRows / 8),
        1
      );
      pass.end();
    }
  }

  private buildSynthBindGroup(
    subMid: GPUTextureView,
    subQ1: GPUTextureView,
    subQ3: GPUTextureView,
    stageA: GPUTextureView
  ): GPUBindGroup {
    return this.device.createBindGroup({
      layout: this.synthLayout,
      entries: [
        { binding: 0, resource: { buffer: this.synthUniformBuf, size: 144 } },
        { binding: 1, resource: this.prevKeyView },
        { binding: 2, resource: this.currKeyView },
        { binding: 3, resource: this.flowCurrView },
        { binding: 4, resource: this.sadDebugView },
        { binding: 5, resource: subMid },
        { binding: 6, resource: this.lutView },
        { binding: 7, resource: subQ1 },
        { binding: 8, resource: subQ3 },
        { binding: 9, resource: stageA },
        { binding: 10, resource: this.linearSampler }
      ]
    });
  }

  public invalidateSubPasses() {
    this.lastPass2ASig = '';
    this.lastStageASig = '';
  }

  public renderPass2(
    p: WebGPUSynthParams,
    pass1Sig: string,
    lutKey: string,
    lutData: Uint8Array
  ): GPUTexture | null {
    if (this.destroyed) return null;
    this.uploadLutIfChanged(lutKey, lutData);

    const encoder = this.device.createCommandEncoder();

    // Single-generation crisp bidirectional synthesis is used directly in WGSL_SYNTH_RENDER_SHADER
    // to prevent multi-generation double-warping blur and phase tearing.

    // Pass 2B-1 Stage A FBO: Pure motion-compensated frame without post-process currTex phase ghosting
    if (p.needStageAPostPass) {
      if (p.stageAW !== this.allocatedAnimeW || p.stageAH !== this.allocatedAnimeH) {
        this.allocStageATexture(p.stageAW, p.stageAH);
        this.lastStageASig = '';
      }
      const sigStageA = `${pass1Sig}:${p.mode}:${p.alpha.toFixed(4)}:${p.stageAW}x${p.stageAH}:${p.cascadeShaderVal}:${p.strength.toFixed(3)}:${p.haloGuard.toFixed(3)}`;
      if (this.lastStageASig !== sigStageA) {
        this.lastStageASig = sigStageA;
        this.writeSynthUniformSlot(3, p, p.alpha, 4, p.cascadeShaderVal, 0);
        const bgStageA = this.buildSynthBindGroup(
          this.subMidView,
          this.subQ1View,
          this.subQ3View,
          this.dummyFloatView
        );
        const passA = encoder.beginRenderPass({
          colorAttachments: [
            {
              view: this.stageAView,
              loadOp: 'clear',
              clearValue: { r: 0, g: 0, b: 0, a: 0 },
              storeOp: 'store'
            }
          ]
        });
        passA.setPipeline(this.fboSynthPipeline);
        passA.setBindGroup(0, bgStageA, [3 * this.uniformAlign]);
        passA.draw(6, 1, 0, 0);
        passA.end();
      }
    }

    // Pass 2B Screen Swapchain Draw
    const swapTex = this.canvasCtx.getCurrentTexture();
    const swapView = swapTex.createView();
    this.writeSynthUniformSlot(
      4,
      p,
      p.alpha,
      0,
      p.cascadeShaderVal,
      p.needStageAPostPass ? 1 : 0
    );
    const bgScreen = this.buildSynthBindGroup(
      this.subMidView,
      this.subQ1View,
      this.subQ3View,
      p.needStageAPostPass ? this.stageAView : this.dummyFloatView
    );
    const passScreen = encoder.beginRenderPass({
      colorAttachments: [
        {
          view: swapView,
          loadOp: 'clear',
          clearValue: { r: 0, g: 0, b: 0, a: 1 },
          storeOp: 'store'
        }
      ]
    });
    passScreen.setPipeline(this.screenSynthPipeline);
    passScreen.setBindGroup(0, bgScreen, [4 * this.uniformAlign]);
    passScreen.draw(6, 1, 0, 0);
    passScreen.end();

    this.device.queue.submit([encoder.finish()]);
    return swapTex;
  }

  public async captureSwapTextureToDataUrl(swapTex: GPUTexture): Promise<string | null> {
    if (this.destroyed) return null;
    const width = swapTex.width;
    const height = swapTex.height;
    const bytesPerRow = Math.ceil((width * 4) / 256) * 256;
    const readBuf = this.device.createBuffer({
      size: bytesPerRow * height,
      usage: GPUBufferUsage.COPY_DST | GPUBufferUsage.MAP_READ
    });
    try {
      const encoder = this.device.createCommandEncoder();
      encoder.copyTextureToBuffer(
        { texture: swapTex },
        { buffer: readBuf, bytesPerRow, rowsPerImage: height },
        { width, height, depthOrArrayLayers: 1 }
      );
      this.device.queue.submit([encoder.finish()]);
      await readBuf.mapAsync(GPUMapMode.READ);
      const mapped = new Uint8Array(readBuf.getMappedRange());
      const outCanvas = document.createElement('canvas');
      outCanvas.width = width;
      outCanvas.height = height;
      const ctx = outCanvas.getContext('2d');
      if (!ctx) return null;
      const imgData = ctx.createImageData(width, height);
      const dst = imgData.data;
      const isBgra = this.canvasFormat === 'bgra8unorm';
      for (let y = 0; y < height; y++) {
        const srcRow = y * bytesPerRow;
        const dstRow = y * width * 4;
        for (let x = 0; x < width; x++) {
          const si = srcRow + x * 4;
          const di = dstRow + x * 4;
          if (isBgra) {
            dst[di] = mapped[si + 2];
            dst[di + 1] = mapped[si + 1];
            dst[di + 2] = mapped[si];
            dst[di + 3] = 255;
          } else {
            dst[di] = mapped[si];
            dst[di + 1] = mapped[si + 1];
            dst[di + 2] = mapped[si + 2];
            dst[di + 3] = 255;
          }
        }
      }
      ctx.putImageData(imgData, 0, 0);
      return outCanvas.toDataURL('image/png');
    } catch {
      return null;
    } finally {
      try {
        readBuf.unmap();
      } catch {
        // ignore
      }
      readBuf.destroy();
    }
  }

  public destroy() {
    if (this.destroyed) return;
    this.destroyed = true;
    this.onDeviceLostCb = undefined;
    try {
      this.flowUniformBuf.destroy();
      this.synthUniformBuf.destroy();
      this.dummyFloatTex.destroy();
      this.lutTex.destroy();
      this.prevKeyTex.destroy();
      this.currKeyTex.destroy();
      this.pyrL4Tex.destroy();
      this.pyrL3Tex.destroy();
      this.pyrL2Tex.destroy();
      this.pyrL1Tex.destroy();
      this.pyrL05Tex.destroy();
      this.flowPrevTex.destroy();
      this.flowCurrTex.destroy();
      this.sadDebugTex.destroy();
      this.subMidTex.destroy();
      this.subQ1Tex.destroy();
      this.subQ3Tex.destroy();
      this.stageATex.destroy();
      this.device.destroy();
    } catch {
      // ignore cleanup errors
    }
  }
}
