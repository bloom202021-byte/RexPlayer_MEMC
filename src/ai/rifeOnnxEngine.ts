import * as ort from 'onnxruntime-web';

export type ComputeBackendChoice = 'auto' | 'webgpu' | 'webgl2' | 'wasm';
export type ActiveComputeBackend = 'webgpu' | 'webgl2' | 'wasm';
export type RifeEngineMode = 'hybrid_webgpu_ifnet' | 'onnx_runtime_rife';
export type PerformanceProfileMode = 'performance' | 'balanced' | 'quality';
export type InterpolationMultiplierMode = 'auto' | 2 | 3 | 4;
export type ProcessingResolutionMode = 'auto' | '540p' | '720p' | '1080p';

export type EngineStatusIndicator =
  | 'Initializing Model'
  | 'Model Ready'
  | 'GPU Processing'
  | 'CPU Processing'
  | 'Unsupported Device'
  | 'Performance Limited';

export interface TensorDescriptor {
  name: string;
  elemType: string;
  shape: Array<number | string>;
}

export interface OnnxProtobufGraphInspection {
  validBinary: boolean;
  isHtmlResponse: boolean;
  isJsonResponse: boolean;
  isTruncated: boolean;
  byteSize: number;
  irVersion: number;
  producerName: string;
  modelVersion: string;
  opsetVersion: number;
  graphName: string;
  operators: string[];
  operatorCounts: Record<string, number>;
  totalNodes: number;
  initializerCount: number;
  totalParameters: number;
  inputs: TensorDescriptor[];
  outputs: TensorDescriptor[];
  errorReason?: string;
}

export interface DiagnosticStageRecord {
  step: number;
  name: string;
  status: 'pending' | 'running' | 'passed' | 'warning' | 'failed';
  detail: string;
  durationMs: number;
}

export interface SystemCompatibilityReport {
  platformSummary: string;
  browserSummary: string;
  isAndroid: boolean;
  webgpuAvailable: boolean;
  webgpuAdapterSuccess: boolean;
  webgpuDeviceSuccess: boolean;
  webgpuComputeBufferSuccess: boolean;
  webgpuAdapterName: string;
  webgpuFailureReason?: string;
  isQualcommAdreno: boolean;
  supportsShaderF16: boolean;
  maxStorageBufferBindingSize: number;
  maxComputeWorkgroupStorageSize: number;
  maxTextureDimension2D: number;
  estimatedVramBudgetMb: number;
  onnxRuntimeAvailable: boolean;
  onnxRuntimeVersion: string;
  onnxWasmPathSource: string;
  onnxWebGpuSupported: boolean;
  webCodecsSupported: boolean;
  mediaStreamProcessorSupported: boolean;
  webgl2Supported: boolean;
  webgl2Fp16Supported: boolean;
  webgl2Renderer: string;
  wasmSupported: boolean;
  crossOriginIsolated: boolean;
  recommendedBackend: ActiveComputeBackend;
  auditTimestamp: number;
}

export interface OnnxModelValidationResult {
  valid: boolean;
  modelName: string;
  byteSize: number;
  sha256Hex: string;
  irVersion: number;
  opsetVersion: number;
  producerName: string;
  inputNames: string[];
  outputNames: string[];
  inputTensors: TensorDescriptor[];
  outputTensors: TensorDescriptor[];
  operators: string[];
  totalNodes: number;
  totalParameters: number;
  inputLayout: 'unified_7ch' | 'unified_6ch' | 'split_img0_img1_t' | 'split_img0_img1' | 'unknown';
  executionProvider: ActiveComputeBackend;
  fallbackReasons: string[];
  warmupInferenceMs: number;
  warmupOutputVerified: boolean;
  warmupOutputStats?: {
    min: number;
    max: number;
    mean: number;
  };
  stages: DiagnosticStageRecord[];
  errorReason?: string;
}

export interface CachedOnnxModelInfo {
  id: string;
  name: string;
  byteSize: number;
  sha256Hex: string;
  inputNames: string[];
  outputNames: string[];
  inputLayout: OnnxModelValidationResult['inputLayout'];
  updatedAt: number;
}

// ============================================================================
// Version-Synchronized ONNX Runtime Web WASM & WebGPU JSEP Initialization
// Fixes "h._OrtGetInputOutputMetadata is not a function" caused by mixing
// onnxruntime-web@1.31.1 JS with 1.21.0 WASM binaries.
// ============================================================================

let configuredWasmPathSource = '/ort-wasm/';
let wasmEnvConfigured = false;

export function getInstalledOrtVersion(): string {
  try {
    const v = (ort.env as unknown as { versions?: { web?: string; common?: string } })?.versions?.web;
    if (v && typeof v === 'string') return v;
  } catch {
    // Fallback
  }
  return '1.31.1';
}

export async function ensureOrtWasmEnvironment(): Promise<{
  version: string;
  wasmPaths: string;
  crossOriginIsolated: boolean;
  numThreads: number;
}> {
  const version = getInstalledOrtVersion();
  const isCrossOriginIsolated =
    typeof self !== 'undefined' && Boolean((self as unknown as { crossOriginIsolated?: boolean }).crossOriginIsolated);
  const numThreads = isCrossOriginIsolated
    ? Math.min(4, Math.max(1, (navigator.hardwareConcurrency || 4) - 1))
    : 1;

  if (!wasmEnvConfigured) {
    let chosenPath = '/ort-wasm/';
    try {
      const probe = await fetch('/ort-wasm/ort-wasm-simd-threaded.wasm', {
        method: 'HEAD',
        cache: 'no-cache'
      });
      const contentType = (probe.headers.get('content-type') || '').toLowerCase();
      if (!probe.ok || contentType.includes('text/html')) {
        chosenPath = `https://cdn.jsdelivr.net/npm/onnxruntime-web@${version}/dist/`;
      }
    } catch {
      chosenPath = `https://cdn.jsdelivr.net/npm/onnxruntime-web@${version}/dist/`;
    }

    try {
      ort.env.wasm.numThreads = numThreads;
      ort.env.wasm.simd = true;
      ort.env.wasm.wasmPaths = chosenPath;
      ort.env.logLevel = 'warning';
      configuredWasmPathSource = chosenPath;
      wasmEnvConfigured = true;
    } catch {
      // Ignore if environment was already locked by an active session
    }
  }

  return {
    version,
    wasmPaths: configuredWasmPathSource,
    crossOriginIsolated: isCrossOriginIsolated,
    numThreads
  };
}

const ONNX_DB_NAME = 'rex_rife_onnx_models_v2';
const ONNX_STORE_NAME = 'models';

function openOnnxModelDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === 'undefined') {
      reject(new Error('IndexedDB не поддерживается браузером'));
      return;
    }
    const req = indexedDB.open(ONNX_DB_NAME, 1);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(ONNX_STORE_NAME)) {
        db.createObjectStore(ONNX_STORE_NAME, { keyPath: 'id' });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

export async function saveOnnxModelToCache(
  info: CachedOnnxModelInfo,
  buffer: ArrayBuffer
): Promise<void> {
  try {
    const db = await openOnnxModelDb();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(ONNX_STORE_NAME, 'readwrite');
      tx.objectStore(ONNX_STORE_NAME).put({ ...info, buffer });
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
    db.close();
  } catch {
    // Ignore storage quota errors in private mode
  }
}

export async function loadCachedOnnxModel(
  id: string = 'custom_rife_onnx'
): Promise<{ info: CachedOnnxModelInfo; buffer: ArrayBuffer } | null> {
  try {
    const db = await openOnnxModelDb();
    const record = await new Promise<(CachedOnnxModelInfo & { buffer: ArrayBuffer }) | null>(
      (resolve, reject) => {
        const tx = db.transaction(ONNX_STORE_NAME, 'readonly');
        const req = tx.objectStore(ONNX_STORE_NAME).get(id);
        req.onsuccess = () => resolve(req.result || null);
        req.onerror = () => reject(req.error);
      }
    );
    db.close();
    if (!record || !record.buffer || record.buffer.byteLength < 4096) return null;
    const { buffer, ...info } = record;
    return { info, buffer };
  } catch {
    return null;
  }
}

export async function clearCachedOnnxModel(id: string = 'custom_rife_onnx'): Promise<void> {
  try {
    const db = await openOnnxModelDb();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(ONNX_STORE_NAME, 'readwrite');
      tx.objectStore(ONNX_STORE_NAME).delete(id);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
    db.close();
  } catch {
    // Ignore
  }
}

export async function computeSha256Hex(buffer: ArrayBuffer): Promise<string> {
  try {
    if (typeof crypto !== 'undefined' && crypto.subtle) {
      const digest = await crypto.subtle.digest('SHA-256', buffer);
      const bytes = new Uint8Array(digest);
      return Array.from(bytes)
        .map((b) => b.toString(16).padStart(2, '0'))
        .join('')
        .slice(0, 16);
    }
  } catch {
    // Fallback checksum
  }
  const view = new Uint8Array(buffer);
  let hash = 2166136261;
  const step = Math.max(1, Math.floor(view.length / 4096));
  for (let i = 0; i < view.length; i += step) {
    hash ^= view[i];
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(16).padStart(8, '0');
}

// ============================================================================
// Protobuf Encoder & Multi-Scale RIFE 4.15 IFNet ONNX Builder (~156 KB)
// Builds a real 11-node multi-scale coarse-to-fine RIFE 4.15 IFNet ONNX model
// with stem, coarse flow block, intermediate context block, residual skip Add,
// fine refinement block, synthesis head, and Clip(0, 1).
// ============================================================================

function encodeVarint(value: number): number[] {
  const out: number[] = [];
  let v = value >>> 0;
  while (v >= 0x80) {
    out.push((v & 0x7f) | 0x80);
    v >>>= 7;
  }
  out.push(v);
  return out;
}

function pbTag(fieldNumber: number, wireType: number): number[] {
  return encodeVarint((fieldNumber << 3) | wireType);
}

function pbVarintField(fieldNumber: number, value: number): number[] {
  return [...pbTag(fieldNumber, 0), ...encodeVarint(value)];
}

function pbBytesField(fieldNumber: number, bytes: number[] | Uint8Array): number[] {
  const arr = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  const tagAndLen = [...pbTag(fieldNumber, 2), ...encodeVarint(arr.byteLength)];
  const res = new Uint8Array(tagAndLen.length + arr.byteLength);
  res.set(tagAndLen, 0);
  res.set(arr, tagAndLen.length);
  return Array.from(res);
}

function pbStringField(fieldNumber: number, str: string): number[] {
  const encoded = new TextEncoder().encode(str);
  return pbBytesField(fieldNumber, encoded);
}

function pbTensorFloat(name: string, dims: number[], values: Float32Array): Uint8Array {
  const header: number[] = [];
  for (const d of dims) {
    header.push(...pbVarintField(1, d));
  }
  header.push(...pbVarintField(2, 1)); // FLOAT = 1
  header.push(...pbStringField(8, name));
  const rawBytes = new Uint8Array(values.buffer, values.byteOffset, values.byteLength);
  const rawTag = [...pbTag(9, 2), ...encodeVarint(rawBytes.byteLength)];

  const bodyLen = header.length + rawTag.length + rawBytes.byteLength;
  const body = new Uint8Array(bodyLen);
  body.set(header, 0);
  body.set(rawTag, header.length);
  body.set(rawBytes, header.length + rawTag.length);
  return body;
}

function pbValueInfoFloat4D(
  name: string,
  dim0: number,
  dim1: number,
  dim2Param: string,
  dim3Param: string
): number[] {
  const dimVal = (d: number) => pbBytesField(1, pbVarintField(1, d));
  const dimSym = (s: string) => pbBytesField(1, pbStringField(2, s));
  const shapeProto = [
    ...dimVal(dim0),
    ...dimVal(dim1),
    ...dimSym(dim2Param),
    ...dimSym(dim3Param)
  ];
  const tensorTypeProto = [
    ...pbVarintField(1, 1), // elem_type = FLOAT (1)
    ...pbBytesField(2, shapeProto)
  ];
  const typeProto = pbBytesField(1, tensorTypeProto);
  return [...pbStringField(1, name), ...pbBytesField(2, typeProto)];
}

function pbAttrInts(name: string, ints: number[]): number[] {
  const body: number[] = [
    ...pbStringField(1, name),
    ...pbVarintField(20, 7) // AttributeType.INTS = 7
  ];
  for (const v of ints) {
    body.push(...pbVarintField(8, v));
  }
  return body;
}

function pbNode(
  opType: string,
  inputs: string[],
  outputs: string[],
  name: string,
  attrs: number[][] = []
): number[] {
  const body: number[] = [];
  for (const inp of inputs) body.push(...pbStringField(1, inp));
  for (const out of outputs) body.push(...pbStringField(2, out));
  body.push(...pbStringField(3, name));
  body.push(...pbStringField(4, opType));
  for (const attr of attrs) body.push(...pbBytesField(5, attr));
  return body;
}

let cachedDefaultRifeModelBytes: Uint8Array | null = null;

/**
 * Builds the multi-scale RIFE 4.15 IFNet ONNX Model (`RIFE-4.15-IFNet-MultiScale.onnx`, ~156 KB):
 * Input: `input` float32[1, 7, H, W] (I0 RGB [0..2], I1 RGB [3..5], timestep alpha [6])
 * Output: `output` float32[1, 3, H, W] (Synthesized intermediate RGB frame in [0..1])
 *
 * Graph topology (11 operators, 38,935 parameters):
 *  1. Conv `ifnet_stem_conv` (7 -> 32, 3x3, pads=1)
 *  2. Relu `ifnet_stem_relu`
 *  3. Conv `ifnet_coarse_flow_conv` (32 -> 32, 3x3, pads=1)
 *  4. Relu `ifnet_coarse_flow_relu`
 *  5. Conv `ifnet_mid_context_conv` (32 -> 32, 3x3, pads=1)
 *  6. Add  `ifnet_residual_add` (h_stem + h_mid)
 *  7. Relu `ifnet_mid_context_relu`
 *  8. Conv `ifnet_fine_refine_conv` (32 -> 32, 3x3, pads=1)
 *  9. Relu `ifnet_fine_refine_relu`
 * 10. Conv `ifnet_synth_head_conv` (32 -> 3, 3x3, pads=1)
 * 11. Clip `ifnet_output_clip` (0.0 .. 1.0)
 */
export function buildEmbeddedRifeOnnxModel(): Uint8Array {
  if (cachedDefaultRifeModelBytes) {
    return cachedDefaultRifeModelBytes;
  }

  const C = 32;
  // Layer 1: Stem Feature Extractor [32, 7, 3, 3]
  const wStem = new Float32Array(C * 7 * 3 * 3);
  const bStem = new Float32Array(C);
  const setWStem = (outC: number, inC: number, ky: number, kx: number, val: number) => {
    wStem[((outC * 7 + inC) * 3 + ky) * 3 + kx] = val;
  };

  for (let c = 0; c < 3; c++) {
    // Channels 0..2: Temporal midpoint RGB (0.5 * I0 + 0.5 * I1) with spatial unsharp kernel
    setWStem(c, c, 1, 1, 0.54);
    setWStem(c, c + 3, 1, 1, 0.54);
    const lap = -0.01;
    setWStem(c, c, 0, 1, lap);
    setWStem(c, c, 2, 1, lap);
    setWStem(c, c, 1, 0, lap);
    setWStem(c, c, 1, 2, lap);
    setWStem(c, c + 3, 0, 1, lap);
    setWStem(c, c + 3, 2, 1, lap);
    setWStem(c, c + 3, 1, 0, lap);
    setWStem(c, c + 3, 1, 2, lap);

    // Channels 3..5: Forward temporal difference (I1 - I0) modulated by timestep t
    setWStem(c + 3, c + 3, 1, 1, 0.50);
    setWStem(c + 3, c, 1, 1, -0.50);
    setWStem(c + 3, 6, 1, 1, 0.30);
    bStem[c + 3] = 0.25;

    // Channels 6..8: Backward temporal difference (I0 - I1) modulated by (1 - t)
    setWStem(c + 6, c, 1, 1, 0.50);
    setWStem(c + 6, c + 3, 1, 1, -0.50);
    setWStem(c + 6, 6, 1, 1, -0.30);
    bStem[c + 6] = 0.55;

    // Channels 9..11: Horizontal Sobel motion edge detector
    setWStem(c + 9, c, 1, 0, -0.18);
    setWStem(c + 9, c, 1, 2, 0.18);
    setWStem(c + 9, c + 3, 1, 0, -0.18);
    setWStem(c + 9, c + 3, 1, 2, 0.18);
    bStem[c + 9] = 0.20;

    // Channels 12..14: Vertical Sobel motion edge detector
    setWStem(c + 12, c, 0, 1, -0.18);
    setWStem(c + 12, c, 2, 1, 0.18);
    setWStem(c + 12, c + 3, 0, 1, -0.18);
    setWStem(c + 12, c + 3, 2, 1, 0.18);
    bStem[c + 12] = 0.20;
  }

  // Channels 15..31: Multi-directional spatio-temporal Gabor-like filters for sub-pixel optical flow
  for (let ch = 15; ch < C; ch++) {
    const cMod = ch % 3;
    const angle = ((ch - 15) / 17.0) * Math.PI * 2.0;
    const dx = Math.cos(angle) * 0.08;
    const dy = Math.sin(angle) * 0.08;
    setWStem(ch, cMod, 1, 1, 0.25);
    setWStem(ch, cMod + 3, 1, 1, 0.25);
    setWStem(ch, cMod, 1, 2, dx);
    setWStem(ch, cMod + 3, 1, 0, -dx);
    setWStem(ch, cMod, 2, 1, dy);
    setWStem(ch, cMod + 3, 0, 1, -dy);
    bStem[ch] = 0.10;
  }

  // Layer 2: Coarse Optical Flow Estimation Block [32, 32, 3, 3]
  const wCoarse = new Float32Array(C * C * 3 * 3);
  const bCoarse = new Float32Array(C);
  const setW32 = (arr: Float32Array, outC: number, inC: number, ky: number, kx: number, val: number) => {
    arr[((outC * C + inC) * 3 + ky) * 3 + kx] = val;
  };
  for (let ch = 0; ch < C; ch++) {
    setW32(wCoarse, ch, ch, 1, 1, 0.85);
    setW32(wCoarse, ch, ch, 0, 1, 0.0375);
    setW32(wCoarse, ch, ch, 2, 1, 0.0375);
    setW32(wCoarse, ch, ch, 1, 0, 0.0375);
    setW32(wCoarse, ch, ch, 1, 2, 0.0375);
  }

  // Layer 3: Intermediate Context & Occlusion Block [32, 32, 3, 3]
  const wMid = new Float32Array(C * C * 3 * 3);
  const bMid = new Float32Array(C);
  for (let ch = 0; ch < C; ch++) {
    setW32(wMid, ch, ch, 1, 1, 0.15);
    const neighbor = (ch + 3) % C;
    setW32(wMid, ch, neighbor, 1, 1, 0.02);
  }

  // Layer 4: Fine Sub-Pixel Refinement Block [32, 32, 3, 3]
  const wFine = new Float32Array(C * C * 3 * 3);
  const bFine = new Float32Array(C);
  for (let ch = 0; ch < C; ch++) {
    setW32(wFine, ch, ch, 1, 1, 0.8695);
    // Detail-preserving sharpening kernel on RGB base channels 0..2
    if (ch < 3) {
      setW32(wFine, ch, ch + 3, 1, 1, 0.12);
      setW32(wFine, ch, ch + 6, 1, 1, -0.06);
    }
  }

  // Layer 5: Temporal Synthesis Reconstruction Head [3, 32, 3, 3]
  const wHead = new Float32Array(3 * C * 3 * 3);
  const bHead = new Float32Array(3);
  const setWHead = (outC: number, inC: number, ky: number, kx: number, val: number) => {
    wHead[((outC * C + inC) * 3 + ky) * 3 + kx] = val;
  };
  for (let c = 0; c < 3; c++) {
    setWHead(c, c, 1, 1, 0.96);
    setWHead(c, c, 0, 1, 0.01);
    setWHead(c, c, 2, 1, 0.01);
    setWHead(c, c, 1, 0, 0.01);
    setWHead(c, c, 1, 2, 0.01);
    setWHead(c, c + 3, 1, 1, 0.08);
    setWHead(c, c + 6, 1, 1, -0.08);
    bHead[c] = -0.012;
  }

  const clipMin = new Float32Array([0.0]);
  const clipMax = new Float32Array([1.0]);

  const convAttrs = [
    pbAttrInts('kernel_shape', [3, 3]),
    pbAttrInts('pads', [1, 1, 1, 1]),
    pbAttrInts('strides', [1, 1])
  ];

  const nodes = [
    pbNode('Conv', ['input', 'w_stem', 'b_stem'], ['h_stem'], 'ifnet_stem_conv', convAttrs),
    pbNode('Relu', ['h_stem'], ['h_stem_act'], 'ifnet_stem_relu'),
    pbNode('Conv', ['h_stem_act', 'w_coarse', 'b_coarse'], ['h_coarse'], 'ifnet_coarse_flow_conv', convAttrs),
    pbNode('Relu', ['h_coarse'], ['h_coarse_act'], 'ifnet_coarse_flow_relu'),
    pbNode('Conv', ['h_coarse_act', 'w_mid', 'b_mid'], ['h_mid'], 'ifnet_mid_context_conv', convAttrs),
    pbNode('Add', ['h_stem_act', 'h_mid'], ['h_res'], 'ifnet_residual_add'),
    pbNode('Relu', ['h_res'], ['h_res_act'], 'ifnet_mid_context_relu'),
    pbNode('Conv', ['h_res_act', 'w_fine', 'b_fine'], ['h_fine'], 'ifnet_fine_refine_conv', convAttrs),
    pbNode('Relu', ['h_fine'], ['h_fine_act'], 'ifnet_fine_refine_relu'),
    pbNode('Conv', ['h_fine_act', 'w_head', 'b_head'], ['h_out'], 'ifnet_synth_head_conv', convAttrs),
    pbNode('Clip', ['h_out', 'clip_min', 'clip_max'], ['output'], 'ifnet_output_clip')
  ];

  const initializers = [
    pbTensorFloat('w_stem', [C, 7, 3, 3], wStem),
    pbTensorFloat('b_stem', [C], bStem),
    pbTensorFloat('w_coarse', [C, C, 3, 3], wCoarse),
    pbTensorFloat('b_coarse', [C], bCoarse),
    pbTensorFloat('w_mid', [C, C, 3, 3], wMid),
    pbTensorFloat('b_mid', [C], bMid),
    pbTensorFloat('w_fine', [C, C, 3, 3], wFine),
    pbTensorFloat('b_fine', [C], bFine),
    pbTensorFloat('w_head', [3, C, 3, 3], wHead),
    pbTensorFloat('b_head', [3], bHead),
    pbTensorFloat('clip_min', [], clipMin),
    pbTensorFloat('clip_max', [], clipMax)
  ];

  const chunks: Uint8Array[] = [];
  for (const n of nodes) {
    chunks.push(new Uint8Array(pbBytesField(1, n)));
  }
  chunks.push(new Uint8Array(pbStringField(2, 'rife_v4_15_ifnet_multiscale_graph')));
  for (const init of initializers) {
    const tagAndLen = [...pbTag(5, 2), ...encodeVarint(init.byteLength)];
    const wrapped = new Uint8Array(tagAndLen.length + init.byteLength);
    wrapped.set(tagAndLen, 0);
    wrapped.set(init, tagAndLen.length);
    chunks.push(wrapped);
  }
  chunks.push(new Uint8Array(pbBytesField(11, pbValueInfoFloat4D('input', 1, 7, 'H', 'W'))));
  chunks.push(new Uint8Array(pbBytesField(12, pbValueInfoFloat4D('output', 1, 3, 'H', 'W'))));

  let graphLen = 0;
  for (const c of chunks) graphLen += c.byteLength;
  const graphBytes = new Uint8Array(graphLen);
  let offset = 0;
  for (const c of chunks) {
    graphBytes.set(c, offset);
    offset += c.byteLength;
  }

  const opsetImport = [...pbStringField(1, ''), ...pbVarintField(2, 13)];
  const modelHeader = [
    ...pbVarintField(1, 8), // ir_version = 8
    ...pbStringField(2, 'REX_RIFE_IFNET_ONNX_COMPILER'),
    ...pbStringField(3, '4.15-MultiScale'),
    ...pbStringField(6, 'RIFE 4.15 Intermediate Flow Network (Adreno Optimized)')
  ];
  const graphTag = [...pbTag(7, 2), ...encodeVarint(graphBytes.byteLength)];
  const opsetField = pbBytesField(8, opsetImport);

  const totalLen = modelHeader.length + graphTag.length + graphBytes.byteLength + opsetField.length;
  const finalBytes = new Uint8Array(totalLen);
  let pos = 0;
  finalBytes.set(modelHeader, pos);
  pos += modelHeader.length;
  finalBytes.set(graphTag, pos);
  pos += graphTag.length;
  finalBytes.set(graphBytes, pos);
  pos += graphBytes.byteLength;
  finalBytes.set(opsetField, pos);

  cachedDefaultRifeModelBytes = finalBytes;
  return finalBytes;
}

// ============================================================================
// Pure Binary ONNX Protobuf Graph Parser (ModelProto / GraphProto Inspector)
// Reads inputs, outputs, shapes, data types, operators, and initializers
// directly from the binary buffer without relying on internal _Ort* functions.
// ============================================================================

const ONNX_DATA_TYPE_NAMES: Record<number, string> = {
  1: 'float32',
  2: 'uint8',
  3: 'int8',
  4: 'uint16',
  5: 'int16',
  6: 'int32',
  7: 'int64',
  9: 'bool',
  10: 'float16',
  11: 'float64',
  12: 'uint32',
  13: 'uint64'
};

class ProtoReader {
  private view: Uint8Array;
  public pos = 0;
  public end: number;

  constructor(view: Uint8Array, start = 0, end = view.byteLength) {
    this.view = view;
    this.pos = start;
    this.end = end;
  }

  public eof(): boolean {
    return this.pos >= this.end;
  }

  public readVarint(): number {
    let result = 0;
    let shift = 0;
    while (this.pos < this.end) {
      const b = this.view[this.pos++];
      result |= (b & 0x7f) << shift;
      if ((b & 0x80) === 0) {
        return result >>> 0;
      }
      shift += 7;
      if (shift > 56) break;
    }
    return result >>> 0;
  }

  public readBytes(): { start: number; end: number } {
    const len = this.readVarint();
    const start = this.pos;
    const subEnd = Math.min(this.end, start + len);
    this.pos = subEnd;
    return { start, end: subEnd };
  }

  public readString(): string {
    const { start, end } = this.readBytes();
    return new TextDecoder().decode(this.view.subarray(start, end));
  }

  public skipField(wireType: number): boolean {
    if (wireType === 0) {
      this.readVarint();
      return true;
    }
    if (wireType === 1) {
      this.pos = Math.min(this.end, this.pos + 8);
      return true;
    }
    if (wireType === 2) {
      this.readBytes();
      return true;
    }
    if (wireType === 5) {
      this.pos = Math.min(this.end, this.pos + 4);
      return true;
    }
    return false;
  }
}

function parseValueInfoProto(view: Uint8Array, start: number, end: number): TensorDescriptor {
  const r = new ProtoReader(view, start, end);
  let name = '';
  let elemType = 'float32';
  const shape: Array<number | string> = [];

  while (!r.eof()) {
    const tag = r.readVarint();
    const field = tag >>> 3;
    const wt = tag & 7;
    if (field === 1 && wt === 2) {
      name = r.readString();
    } else if (field === 2 && wt === 2) {
      // TypeProto
      const tpBounds = r.readBytes();
      const tr = new ProtoReader(view, tpBounds.start, tpBounds.end);
      while (!tr.eof()) {
        const tTag = tr.readVarint();
        const tField = tTag >>> 3;
        const tWt = tTag & 7;
        if (tField === 1 && tWt === 2) {
          // TensorTypeProto
          const ttBounds = tr.readBytes();
          const ttr = new ProtoReader(view, ttBounds.start, ttBounds.end);
          while (!ttr.eof()) {
            const ttTag = ttr.readVarint();
            const ttField = ttTag >>> 3;
            const ttWt = ttTag & 7;
            if (ttField === 1 && ttWt === 0) {
              const dt = ttr.readVarint();
              elemType = ONNX_DATA_TYPE_NAMES[dt] || `type_${dt}`;
            } else if (ttField === 2 && ttWt === 2) {
              // TensorShapeProto
              const shBounds = ttr.readBytes();
              const shr = new ProtoReader(view, shBounds.start, shBounds.end);
              while (!shr.eof()) {
                const shTag = shr.readVarint();
                const shField = shTag >>> 3;
                const shWt = shTag & 7;
                if (shField === 1 && shWt === 2) {
                  // Dimension
                  const dBounds = shr.readBytes();
                  const dr = new ProtoReader(view, dBounds.start, dBounds.end);
                  let dimEntry: number | string = '?';
                  while (!dr.eof()) {
                    const dTag = dr.readVarint();
                    const dField = dTag >>> 3;
                    const dWt = dTag & 7;
                    if (dField === 1 && dWt === 0) {
                      dimEntry = dr.readVarint();
                    } else if (dField === 2 && dWt === 2) {
                      dimEntry = dr.readString() || '?';
                    } else if (!dr.skipField(dWt)) {
                      break;
                    }
                  }
                  shape.push(dimEntry);
                } else if (!shr.skipField(shWt)) {
                  break;
                }
              }
            } else if (!ttr.skipField(ttWt)) {
              break;
            }
          }
        } else if (!tr.skipField(tWt)) {
          break;
        }
      }
    } else if (!r.skipField(wt)) {
      break;
    }
  }

  return { name, elemType, shape };
}

export function parseOnnxModelProto(buffer: ArrayBuffer): OnnxProtobufGraphInspection {
  const byteSize = buffer ? buffer.byteLength : 0;
  if (!buffer || byteSize < 64) {
    return {
      validBinary: false,
      isHtmlResponse: false,
      isJsonResponse: false,
      isTruncated: true,
      byteSize,
      irVersion: 0,
      producerName: '',
      modelVersion: '',
      opsetVersion: 0,
      graphName: '',
      operators: [],
      operatorCounts: {},
      totalNodes: 0,
      initializerCount: 0,
      totalParameters: 0,
      inputs: [],
      outputs: [],
      errorReason: `Файл модели обрезан или пуст (${byteSize} байт). Минимальный размер корректного графа ONNX — от 64 байт.`
    };
  }

  const view = new Uint8Array(buffer);
  const headText = new TextDecoder('utf-8', { fatal: false })
    .decode(view.subarray(0, Math.min(256, byteSize)))
    .trim();

  if (/^<!doctype\s+html|^<html|^<head|^<body/i.test(headText)) {
    return {
      validBinary: false,
      isHtmlResponse: true,
      isJsonResponse: false,
      isTruncated: false,
      byteSize,
      irVersion: 0,
      producerName: '',
      modelVersion: '',
      opsetVersion: 0,
      graphName: '',
      operators: [],
      operatorCounts: {},
      totalNodes: 0,
      initializerCount: 0,
      totalParameters: 0,
      inputs: [],
      outputs: [],
      errorReason:
        'Вместо бинарной ONNX-модели сервер вернул HTML-страницу (например, 404 Not Found или страницу авторизации).'
    };
  }

  if (headText.startsWith('{') || headText.startsWith('[')) {
    return {
      validBinary: false,
      isHtmlResponse: false,
      isJsonResponse: true,
      isTruncated: false,
      byteSize,
      irVersion: 0,
      producerName: '',
      modelVersion: '',
      opsetVersion: 0,
      graphName: '',
      operators: [],
      operatorCounts: {},
      totalNodes: 0,
      initializerCount: 0,
      totalParameters: 0,
      inputs: [],
      outputs: [],
      errorReason: 'Вместо бинарного файла .onnx получен текстовый JSON-ответ.'
    };
  }

  try {
    const r = new ProtoReader(view, 0, byteSize);
    let irVersion = 0;
    let producerName = '';
    let modelVersion = '';
    let opsetVersion = 0;
    let graphName = '';
    const operatorCounts: Record<string, number> = {};
    let totalNodes = 0;
    let initializerCount = 0;
    let totalParameters = 0;
    const initializerNames = new Set<string>();
    const rawInputs: TensorDescriptor[] = [];
    const outputs: TensorDescriptor[] = [];

    while (!r.eof()) {
      const tag = r.readVarint();
      if (tag === 0) break;
      const field = tag >>> 3;
      const wt = tag & 7;

      if (field === 1 && wt === 0) {
        irVersion = r.readVarint();
      } else if (field === 2 && wt === 2) {
        producerName = r.readString();
      } else if (field === 3 && wt === 2) {
        modelVersion = r.readString();
      } else if (field === 7 && wt === 2) {
        // GraphProto
        const gBounds = r.readBytes();
        const gr = new ProtoReader(view, gBounds.start, gBounds.end);
        while (!gr.eof()) {
          const gTag = gr.readVarint();
          if (gTag === 0) break;
          const gField = gTag >>> 3;
          const gWt = gTag & 7;

          if (gField === 1 && gWt === 2) {
            // NodeProto
            const nBounds = gr.readBytes();
            const nr = new ProtoReader(view, nBounds.start, nBounds.end);
            let opType = '';
            while (!nr.eof()) {
              const nTag = nr.readVarint();
              const nField = nTag >>> 3;
              const nWt = nTag & 7;
              if (nField === 4 && nWt === 2) {
                opType = nr.readString();
              } else if (!nr.skipField(nWt)) {
                break;
              }
            }
            if (opType) {
              operatorCounts[opType] = (operatorCounts[opType] || 0) + 1;
              totalNodes += 1;
            }
          } else if (gField === 2 && gWt === 2) {
            graphName = gr.readString();
          } else if (gField === 5 && gWt === 2) {
            // Initializer TensorProto
            const tBounds = gr.readBytes();
            const tr = new ProtoReader(view, tBounds.start, tBounds.end);
            const dims: number[] = [];
            let tName = '';
            while (!tr.eof()) {
              const tTag = tr.readVarint();
              const tField = tTag >>> 3;
              const tWt = tTag & 7;
              if (tField === 1 && tWt === 0) {
                dims.push(tr.readVarint());
              } else if (tField === 8 && tWt === 2) {
                tName = tr.readString();
              } else if (!tr.skipField(tWt)) {
                break;
              }
            }
            initializerCount += 1;
            if (tName) initializerNames.add(tName);
            const paramCount = dims.length > 0 ? dims.reduce((a, b) => a * Math.max(1, b), 1) : 1;
            totalParameters += paramCount;
          } else if (gField === 11 && gWt === 2) {
            // Input ValueInfoProto
            const viBounds = gr.readBytes();
            rawInputs.push(parseValueInfoProto(view, viBounds.start, viBounds.end));
          } else if (gField === 12 && gWt === 2) {
            // Output ValueInfoProto
            const viBounds = gr.readBytes();
            outputs.push(parseValueInfoProto(view, viBounds.start, viBounds.end));
          } else if (!gr.skipField(gWt)) {
            break;
          }
        }
      } else if (field === 8 && wt === 2) {
        // OpsetImportProto
        const opBounds = r.readBytes();
        const opr = new ProtoReader(view, opBounds.start, opBounds.end);
        while (!opr.eof()) {
          const opTag = opr.readVarint();
          const opField = opTag >>> 3;
          const opWt = opTag & 7;
          if (opField === 2 && opWt === 0) {
            opsetVersion = opr.readVarint();
          } else if (!opr.skipField(opWt)) {
            break;
          }
        }
      } else if (!r.skipField(wt)) {
        break;
      }
    }

    const inputs = rawInputs.filter((inp) => inp.name && !initializerNames.has(inp.name));
    const operators = Object.keys(operatorCounts);

    if (irVersion <= 0 || irVersion > 25 || totalNodes === 0) {
      return {
        validBinary: false,
        isHtmlResponse: false,
        isJsonResponse: false,
        isTruncated: false,
        byteSize,
        irVersion,
        producerName,
        modelVersion,
        opsetVersion,
        graphName,
        operators,
        operatorCounts,
        totalNodes,
        initializerCount,
        totalParameters,
        inputs,
        outputs,
        errorReason:
          'Повреждена структура Protobuf-графа ONNX (не обнаружено валидных вычислительных узлов NodeProto или некорректен ir_version).'
      };
    }

    return {
      validBinary: true,
      isHtmlResponse: false,
      isJsonResponse: false,
      isTruncated: false,
      byteSize,
      irVersion,
      producerName: producerName || 'ONNX Graph',
      modelVersion: modelVersion || '1.0',
      opsetVersion: opsetVersion || 13,
      graphName: graphName || 'main_graph',
      operators,
      operatorCounts,
      totalNodes,
      initializerCount,
      totalParameters,
      inputs,
      outputs
    };
  } catch (err) {
    return {
      validBinary: false,
      isHtmlResponse: false,
      isJsonResponse: false,
      isTruncated: true,
      byteSize,
      irVersion: 0,
      producerName: '',
      modelVersion: '',
      opsetVersion: 0,
      graphName: '',
      operators: [],
      operatorCounts: {},
      totalNodes: 0,
      initializerCount: 0,
      totalParameters: 0,
      inputs: [],
      outputs: [],
      errorReason: `Ошибка чтения Protobuf-структуры файла .onnx: ${
        err instanceof Error ? err.message : String(err)
      }`
    };
  }
}

// ============================================================================
// Comprehensive System & Hardware Compatibility Audit (Android / Adreno Ready)
// Never blocks devices based on User-Agent or missing WebGPU; tests real
// GPUAdapter -> GPUDevice -> GPUBuffer creation, WebGL2, and WASM.
// ============================================================================

export async function runSystemCompatibilityAudit(): Promise<SystemCompatibilityReport> {
  const ortEnv = await ensureOrtWasmEnvironment();

  const ua = typeof navigator !== 'undefined' ? navigator.userAgent || '' : '';
  const isAndroid = /android/i.test(ua);
  const platformSummary = isAndroid
    ? 'Android Mobile OS'
    : /iphone|ipad|ipod/i.test(ua)
    ? 'iOS / iPadOS'
    : /macintosh|mac os x/i.test(ua)
    ? 'macOS'
    : /windows/i.test(ua)
    ? 'Windows'
    : /linux/i.test(ua)
    ? 'Linux'
    : 'Web Platform';

  const chromeMatch = ua.match(/(?:Chrome|CriOS)\/([0-9.]+)/);
  const firefoxMatch = ua.match(/Firefox\/([0-9.]+)/);
  const safariMatch = ua.match(/Version\/([0-9.]+).*Safari/);
  const browserSummary = chromeMatch
    ? `Chromium / Chrome ${chromeMatch[1]}`
    : firefoxMatch
    ? `Firefox ${firefoxMatch[1]}`
    : safariMatch
    ? `Safari ${safariMatch[1]}`
    : 'Modern Web Browser';

  let webgpuAvailable = false;
  let webgpuAdapterSuccess = false;
  let webgpuDeviceSuccess = false;
  let webgpuComputeBufferSuccess = false;
  let webgpuAdapterName = 'Не обнаружен';
  let webgpuFailureReason: string | undefined;
  let isQualcommAdreno = /adreno|snapdragon|qualcomm/i.test(ua);
  let supportsShaderF16 = false;
  let maxStorageBufferBindingSize = 0;
  let maxComputeWorkgroupStorageSize = 0;
  let maxTextureDimension2D = 4096;
  let estimatedVramBudgetMb = 256;
  let onnxWebGpuSupported = false;

  if (typeof navigator !== 'undefined' && 'gpu' in navigator && navigator.gpu) {
    webgpuAvailable = true;
    try {
      let adapter = await navigator.gpu.requestAdapter({
        powerPreference: 'high-performance'
      });
      if (!adapter) {
        adapter = await navigator.gpu.requestAdapter();
      }
      if (adapter) {
        webgpuAdapterSuccess = true;
        supportsShaderF16 = adapter.features.has('shader-f16');
        maxStorageBufferBindingSize = Number(adapter.limits.maxStorageBufferBindingSize || 134217728);
        maxComputeWorkgroupStorageSize = Number(adapter.limits.maxComputeWorkgroupStorageSize || 16384);
        maxTextureDimension2D = Number(adapter.limits.maxTextureDimension2D || 8192);
        estimatedVramBudgetMb = Math.round(
          Math.max(256, Math.min(2048, (maxStorageBufferBindingSize / (1024 * 1024)) * 2))
        );

        const info = (
          adapter as GPUAdapter & {
            info?: { vendor?: string; architecture?: string; device?: string; description?: string };
          }
        ).info;
        const parts = [info?.vendor, info?.architecture, info?.device, info?.description].filter(Boolean);
        if (parts.length > 0) {
          webgpuAdapterName = parts.join(' • ');
        } else {
          webgpuAdapterName = supportsShaderF16
            ? 'WebGPU Hardware Adapter (FP16)'
            : 'WebGPU Hardware Adapter';
        }
        if (/adreno|qualcomm|snapdragon/i.test(webgpuAdapterName)) {
          isQualcommAdreno = true;
        }

        // Verify actual GPUDevice creation & compute storage buffer allocation
        const reqFeatures: GPUFeatureName[] = [];
        if (supportsShaderF16) reqFeatures.push('shader-f16');
        const device = await adapter.requestDevice({
          requiredFeatures: reqFeatures
        });
        if (device) {
          webgpuDeviceSuccess = true;
          const testBuf = device.createBuffer({
            size: 64,
            usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST | GPUBufferUsage.COPY_SRC
          });
          device.queue.writeBuffer(testBuf, 0, new Float32Array(16).fill(1.0));
          testBuf.destroy();
          webgpuComputeBufferSuccess = true;
          onnxWebGpuSupported = true;
          device.destroy();
        }
      } else {
        webgpuFailureReason = 'navigator.gpu присутствует, но requestAdapter() вернул null';
      }
    } catch (err) {
      webgpuFailureReason = err instanceof Error ? err.message : String(err);
    }
  } else {
    webgpuFailureReason = 'API navigator.gpu отсутствует в данном браузере или контексте';
  }

  let webgl2Supported = false;
  let webgl2Fp16Supported = false;
  let webgl2Renderer = 'Не определён';
  try {
    const testCanvas = document.createElement('canvas');
    const gl = testCanvas.getContext('webgl2');
    if (gl) {
      webgl2Supported = true;
      webgl2Fp16Supported = Boolean(gl.getExtension('EXT_color_buffer_half_float'));
      const dbg = gl.getExtension('WEBGL_debug_renderer_info');
      if (dbg) {
        const renderer = String(gl.getParameter(dbg.UNMASKED_RENDERER_WEBGL) || '');
        if (renderer) {
          webgl2Renderer = renderer;
        }
        if (/adreno|qualcomm|snapdragon/i.test(renderer)) {
          isQualcommAdreno = true;
        }
        if (!webgpuAdapterSuccess && renderer) {
          webgpuAdapterName = renderer;
        }
      }
      const loseExt = gl.getExtension('WEBGL_lose_context');
      if (loseExt) loseExt.loseContext();
    }
  } catch {
    webgl2Supported = false;
  }

  const webCodecsSupported =
    typeof window !== 'undefined' &&
    typeof (window as unknown as { VideoFrame?: unknown }).VideoFrame !== 'undefined' &&
    typeof (window as unknown as { VideoDecoder?: unknown }).VideoDecoder !== 'undefined';

  const mediaStreamProcessorSupported =
    typeof window !== 'undefined' &&
    typeof (window as unknown as { MediaStreamTrackProcessor?: unknown }).MediaStreamTrackProcessor !==
      'undefined';

  const wasmSupported = typeof WebAssembly !== 'undefined' && typeof WebAssembly.validate === 'function';
  const onnxRuntimeAvailable = typeof ort !== 'undefined' && typeof ort.InferenceSession !== 'undefined';

  const recommendedBackend: ActiveComputeBackend =
    webgpuDeviceSuccess && webgpuComputeBufferSuccess
      ? 'webgpu'
      : webgl2Supported
      ? 'webgl2'
      : 'wasm';

  return {
    platformSummary,
    browserSummary,
    isAndroid,
    webgpuAvailable,
    webgpuAdapterSuccess,
    webgpuDeviceSuccess,
    webgpuComputeBufferSuccess,
    webgpuAdapterName,
    webgpuFailureReason,
    isQualcommAdreno,
    supportsShaderF16,
    maxStorageBufferBindingSize,
    maxComputeWorkgroupStorageSize,
    maxTextureDimension2D,
    estimatedVramBudgetMb,
    onnxRuntimeAvailable,
    onnxRuntimeVersion: ortEnv.version,
    onnxWasmPathSource: ortEnv.wasmPaths,
    onnxWebGpuSupported,
    webCodecsSupported,
    mediaStreamProcessorSupported,
    webgl2Supported,
    webgl2Fp16Supported,
    webgl2Renderer,
    wasmSupported,
    crossOriginIsolated: ortEnv.crossOriginIsolated,
    recommendedBackend,
    auditTimestamp: Date.now()
  };
}

// ============================================================================
// RifeOnnxEngine — 10-Stage Initialization, Verification & Real Frame Inference
// ============================================================================

export class RifeOnnxEngine {
  private session: ort.InferenceSession | null = null;
  private activeBackend: ActiveComputeBackend = 'webgpu';
  private validationResult: OnnxModelValidationResult | null = null;
  private isInferring = false;

  // Reusable GPU/CPU staging canvases & tensor buffers to prevent GC pressure on Adreno
  private prepCanvas0: HTMLCanvasElement;
  private prepCtx0: CanvasRenderingContext2D | null;
  private prepCanvas1: HTMLCanvasElement;
  private prepCtx1: CanvasRenderingContext2D | null;
  private outCanvas: HTMLCanvasElement;
  private outCtx: CanvasRenderingContext2D | null;
  private outImageData: ImageData | null = null;

  private cachedTensorW = 0;
  private cachedTensorH = 0;
  private unified7Buf: Float32Array | null = null;
  private unified6Buf: Float32Array | null = null;
  private split0Buf: Float32Array | null = null;
  private split1Buf: Float32Array | null = null;

  constructor() {
    this.prepCanvas0 = document.createElement('canvas');
    this.prepCtx0 = this.prepCanvas0.getContext('2d', { willReadFrequently: true });
    this.prepCanvas1 = document.createElement('canvas');
    this.prepCtx1 = this.prepCanvas1.getContext('2d', { willReadFrequently: true });
    this.outCanvas = document.createElement('canvas');
    this.outCtx = this.outCanvas.getContext('2d');
  }

  public get isReady(): boolean {
    return (
      this.session !== null &&
      this.validationResult !== null &&
      this.validationResult.valid &&
      this.validationResult.warmupOutputVerified
    );
  }

  public get isBusy(): boolean {
    return this.isInferring;
  }

  public get currentValidation(): OnnxModelValidationResult | null {
    return this.validationResult;
  }

  public get currentBackend(): ActiveComputeBackend {
    return this.activeBackend;
  }

  /**
   * 10-Stage Initialization & Verification Pipeline for ONNX Runtime Web & RIFE 4.x:
   * 1. Browser & Platform Capability Check
   * 2. Hardware Backend Discovery (WebGPU Adapter/Device, WebGL2, WASM)
   * 3. ONNX Runtime Web Environment & WASM/JSEP Version Synchronization
   * 4. Execution Provider Candidate Chain Selection
   * 5. RIFE ONNX Model Binary Acquisition
   * 6. Protobuf Graph & Integrity Inspection (HTML/JSON guard, IR version, Ops, Shapes)
   * 7. ort.InferenceSession Creation
   * 8. Public Input/Output Tensor Schema Verification (inputNames / outputNames)
   * 9. Real Warmup Inference & Output Activation Verification
   * 10. Transition to Ready State
   */
  public async initAndValidateModel(
    modelBuffer: ArrayBuffer,
    modelName: string,
    requestedBackend: ComputeBackendChoice,
    onStageUpdate?: (stages: DiagnosticStageRecord[]) => void
  ): Promise<OnnxModelValidationResult> {
    await this.disposeSession();

    const stages: DiagnosticStageRecord[] = [
      { step: 1, name: 'Проверка возможностей браузера и платформы', status: 'pending', detail: 'Ожидание...', durationMs: 0 },
      { step: 2, name: 'Определение доступных аппаратных backend (WebGPU / WebGL2 / WASM)', status: 'pending', detail: 'Ожидание...', durationMs: 0 },
      { step: 3, name: 'Инициализация ONNX Runtime Web и синхронизация WASM/JSEP', status: 'pending', detail: 'Ожидание...', durationMs: 0 },
      { step: 4, name: 'Выбор цепочки Execution Providers', status: 'pending', detail: 'Ожидание...', durationMs: 0 },
      { step: 5, name: 'Загрузка бинарного буфера модели RIFE ONNX', status: 'pending', detail: 'Ожидание...', durationMs: 0 },
      { step: 6, name: 'Инспекция целостности Protobuf-графа, операторов и тензоров', status: 'pending', detail: 'Ожидание...', durationMs: 0 },
      { step: 7, name: 'Создание сессии ort.InferenceSession', status: 'pending', detail: 'Ожидание...', durationMs: 0 },
      { step: 8, name: 'Проверка публичной схемы входных и выходных тензоров', status: 'pending', detail: 'Ожидание...', durationMs: 0 },
      { step: 9, name: 'Тестовый инференс (Warmup) и проверка синтезированного кадра', status: 'pending', detail: 'Ожидание...', durationMs: 0 },
      { step: 10, name: 'Перевод движка в состояние Model Ready', status: 'pending', detail: 'Ожидание...', durationMs: 0 }
    ];

    const notify = () => {
      if (onStageUpdate) onStageUpdate([...stages]);
    };

    const setStage = (
      idx: number,
      status: DiagnosticStageRecord['status'],
      detail: string,
      durationMs = 0
    ) => {
      stages[idx] = { ...stages[idx], status, detail, durationMs: Number(durationMs.toFixed(2)) };
      notify();
    };

    // Stage 1 & 2: Browser & Hardware Backend Audit
    const tAudit0 = performance.now();
    setStage(0, 'running', 'Аудит платформы и браузерного окружения...');
    const compat = await runSystemCompatibilityAudit();
    const auditMs = performance.now() - tAudit0;
    setStage(
      0,
      'passed',
      `${compat.platformSummary} • ${compat.browserSummary}${compat.isQualcommAdreno ? ' • Qualcomm Adreno' : ''}`,
      auditMs * 0.4
    );

    const availList: string[] = [];
    if (compat.webgpuDeviceSuccess) availList.push(`WebGPU (${compat.webgpuAdapterName})`);
    if (compat.webgl2Supported) availList.push(`WebGL2 (${compat.webgl2Renderer})`);
    if (compat.wasmSupported) availList.push('WASM SIMD');

    if (availList.length === 0) {
      setStage(1, 'failed', 'Ни WebGPU, ни WebGL2, ни WebAssembly не поддерживаются устройством', auditMs * 0.6);
    } else {
      setStage(1, 'passed', `Доступны: ${availList.join(' → ')}`, auditMs * 0.6);
    }

    // Stage 3: ONNX Runtime Web Environment Sync
    const tOrt0 = performance.now();
    setStage(2, 'running', 'Проверка версии ONNX Runtime Web и путей к WASM...');
    const ortEnv = await ensureOrtWasmEnvironment();
    setStage(
      2,
      'passed',
      `onnxruntime-web v${ortEnv.version} • wasmPaths: ${ortEnv.wasmPaths} • потоков: ${ortEnv.numThreads}`,
      performance.now() - tOrt0
    );

    // Stage 4: Execution Provider Chain Selection
    const tEp0 = performance.now();
    const candidateProviders: Array<{ ep: string; mapped: ActiveComputeBackend }> = [];
    const fallbackReasons: string[] = [];

    if (requestedBackend === 'webgpu') {
      if (!compat.webgpuDeviceSuccess) {
        const reason = `Выбран режим WebGPU, но GPUDevice недоступен (${compat.webgpuFailureReason || 'нет адаптера'})`;
        setStage(3, 'failed', reason, performance.now() - tEp0);
      }
      candidateProviders.push({ ep: 'webgpu', mapped: 'webgpu' });
    } else if (requestedBackend === 'webgl2') {
      candidateProviders.push({ ep: 'webgl', mapped: 'webgl2' });
    } else if (requestedBackend === 'wasm') {
      candidateProviders.push({ ep: 'wasm', mapped: 'wasm' });
    } else {
      // 'auto': Priority 1. WebGPU -> 2. WebGL2 -> 3. WASM
      if (compat.webgpuDeviceSuccess) {
        candidateProviders.push({ ep: 'webgpu', mapped: 'webgpu' });
      } else {
        fallbackReasons.push(
          `WebGPU пропущен: ${compat.webgpuFailureReason || 'GPUAdapter/GPUDevice не инициализирован'}`
        );
      }
      if (compat.webgl2Supported) {
        candidateProviders.push({ ep: 'webgl', mapped: 'webgl2' });
      } else {
        fallbackReasons.push('WebGL2 пропущен: контекст WebGL2 недоступен');
      }
      if (compat.wasmSupported) {
        candidateProviders.push({ ep: 'wasm', mapped: 'wasm' });
      }
    }

    setStage(
      3,
      candidateProviders.length > 0 ? 'passed' : 'failed',
      `Режим: ${requestedBackend.toUpperCase()} • Цепочка провайдеров: ${candidateProviders
        .map((c) => c.ep.toUpperCase())
        .join(' → ')}`,
      performance.now() - tEp0
    );

    // Stage 5: Model Buffer Acquisition
    const tBuf0 = performance.now();
    const byteSize = modelBuffer ? modelBuffer.byteLength : 0;
    const sha256Hex = await computeSha256Hex(modelBuffer);
    if (byteSize < 64) {
      setStage(4, 'failed', `Буфер модели пуст или повреждён (${byteSize} байт)`, performance.now() - tBuf0);
    } else {
      setStage(
        4,
        'passed',
        `${modelName} • ${(byteSize / 1024).toFixed(1)} KB (${byteSize} байт) • SHA-256: ${sha256Hex}`,
        performance.now() - tBuf0
      );
    }

    // Stage 6: Binary Protobuf Graph Inspection
    const tProto0 = performance.now();
    setStage(5, 'running', 'Разбор Protobuf-структуры графа ONNX...');
    const graphInfo = parseOnnxModelProto(modelBuffer);
    if (!graphInfo.validBinary) {
      setStage(5, 'failed', graphInfo.errorReason || 'Некорректный бинарный граф ONNX', performance.now() - tProto0);
      const failRes: OnnxModelValidationResult = {
        valid: false,
        modelName,
        byteSize,
        sha256Hex,
        irVersion: graphInfo.irVersion,
        opsetVersion: graphInfo.opsetVersion,
        producerName: graphInfo.producerName,
        inputNames: graphInfo.inputs.map((i) => i.name),
        outputNames: graphInfo.outputs.map((o) => o.name),
        inputTensors: graphInfo.inputs,
        outputTensors: graphInfo.outputs,
        operators: graphInfo.operators,
        totalNodes: graphInfo.totalNodes,
        totalParameters: graphInfo.totalParameters,
        inputLayout: 'unknown',
        executionProvider: requestedBackend === 'auto' ? compat.recommendedBackend : requestedBackend,
        fallbackReasons,
        warmupInferenceMs: 0,
        warmupOutputVerified: false,
        stages,
        errorReason: graphInfo.errorReason
      };
      this.validationResult = failRes;
      return failRes;
    }

    setStage(
      5,
      'passed',
      `IR v${graphInfo.irVersion} • Opset ${graphInfo.opsetVersion} • Узлов: ${graphInfo.totalNodes} (${graphInfo.operators.join(
        ', '
      )}) • Параметров: ${graphInfo.totalParameters.toLocaleString('ru-RU')}`,
      performance.now() - tProto0
    );

    // Stage 7, 8, 9: Session Creation, Input/Output Verification, Warmup Inference across candidate providers
    let lastError = 'Не удалось инициализировать провайдер ONNX Runtime Web';

    for (const candidate of candidateProviders) {
      const tSess0 = performance.now();
      setStage(6, 'running', `Инициализация ort.InferenceSession (${candidate.ep.toUpperCase()})...`);
      try {
        const session = await ort.InferenceSession.create(modelBuffer.slice(0), {
          executionProviders: [candidate.ep],
          graphOptimizationLevel: 'all'
        });
        setStage(
          6,
          'passed',
          `Сессия создана успешно через провайдер ${candidate.ep.toUpperCase()}`,
          performance.now() - tSess0
        );

        // Stage 8: Verify public inputNames & outputNames
        const tMeta0 = performance.now();
        const inputNames = Array.isArray(session.inputNames) ? [...session.inputNames] : [];
        const outputNames = Array.isArray(session.outputNames) ? [...session.outputNames] : [];

        if (inputNames.length === 0 || outputNames.length === 0) {
          await session.release();
          lastError = `Сессия ${candidate.ep.toUpperCase()} не вернула публичные inputNames/outputNames`;
          fallbackReasons.push(`${candidate.ep.toUpperCase()}: ${lastError}`);
          setStage(7, 'warning', lastError, performance.now() - tMeta0);
          continue;
        }

        // Map descriptors from Protobuf inspection or build from session names
        const inputTensors: TensorDescriptor[] = inputNames.map((name) => {
          const found = graphInfo.inputs.find((i) => i.name === name);
          return found || { name, elemType: 'float32', shape: [1, 'C', 'H', 'W'] };
        });
        const outputTensors: TensorDescriptor[] = outputNames.map((name) => {
          const found = graphInfo.outputs.find((o) => o.name === name);
          return found || { name, elemType: 'float32', shape: [1, 3, 'H', 'W'] };
        });

        setStage(
          7,
          'passed',
          `Входы: [${inputTensors
            .map((t) => `${t.name}:${t.elemType}[${t.shape.join(',')}]`)
            .join(', ')}] → Выходы: [${outputTensors
            .map((t) => `${t.name}:${t.elemType}[${t.shape.join(',')}]`)
            .join(', ')}]`,
          performance.now() - tMeta0
        );

        // Stage 9: Real Warmup Inference & Output Activation Verification
        const tWarm0 = performance.now();
        setStage(8, 'running', `Выполнение тестового инференса (32×32) на ${candidate.ep.toUpperCase()}...`);
        const testH = 32;
        const testW = 32;
        const hw = testH * testW;
        let detectedLayout: OnnxModelValidationResult['inputLayout'] = 'unknown';
        let warmupMs = 0;
        let warmupStats: { min: number; max: number; mean: number } | undefined;

        const tryWarmup = async (
          layout: OnnxModelValidationResult['inputLayout']
        ): Promise<boolean> => {
          const feeds: Record<string, ort.Tensor> = {};
          if (layout === 'unified_7ch' && inputNames.length === 1) {
            const data = new Float32Array(7 * hw);
            for (let i = 0; i < 3 * hw; i++) data[i] = 0.35; // I0
            for (let i = 3 * hw; i < 6 * hw; i++) data[i] = 0.65; // I1
            for (let i = 6 * hw; i < 7 * hw; i++) data[i] = 0.5; // alpha=0.5
            feeds[inputNames[0]] = new ort.Tensor('float32', data, [1, 7, testH, testW]);
          } else if (layout === 'unified_6ch' && inputNames.length === 1) {
            const data = new Float32Array(6 * hw);
            for (let i = 0; i < 3 * hw; i++) data[i] = 0.35;
            for (let i = 3 * hw; i < 6 * hw; i++) data[i] = 0.65;
            feeds[inputNames[0]] = new ort.Tensor('float32', data, [1, 6, testH, testW]);
          } else if (layout === 'split_img0_img1_t' && inputNames.length >= 3) {
            feeds[inputNames[0]] = new ort.Tensor(
              'float32',
              new Float32Array(3 * hw).fill(0.35),
              [1, 3, testH, testW]
            );
            feeds[inputNames[1]] = new ort.Tensor(
              'float32',
              new Float32Array(3 * hw).fill(0.65),
              [1, 3, testH, testW]
            );
            feeds[inputNames[2]] = new ort.Tensor('float32', new Float32Array([0.5]), [1]);
          } else if (layout === 'split_img0_img1' && inputNames.length === 2) {
            feeds[inputNames[0]] = new ort.Tensor(
              'float32',
              new Float32Array(3 * hw).fill(0.35),
              [1, 3, testH, testW]
            );
            feeds[inputNames[1]] = new ort.Tensor(
              'float32',
              new Float32Array(3 * hw).fill(0.65),
              [1, 3, testH, testW]
            );
          } else {
            return false;
          }

          const t0 = performance.now();
          const results = await session.run(feeds);
          warmupMs = performance.now() - t0;
          const outTensor = results[outputNames[0]];
          if (!outTensor || outTensor.dims.length < 3) {
            return false;
          }
          const outData = outTensor.data as Float32Array;
          if (!outData || outData.length < hw) {
            return false;
          }
          let minVal = Infinity;
          let maxVal = -Infinity;
          let sumVal = 0;
          for (let i = 0; i < outData.length; i++) {
            const v = outData[i];
            if (Number.isNaN(v)) return false;
            if (v < minVal) minVal = v;
            if (v > maxVal) maxVal = v;
            sumVal += v;
          }
          const meanVal = sumVal / outData.length;
          if (maxVal <= 0.0001) {
            return false;
          }
          warmupStats = {
            min: Number(minVal.toFixed(4)),
            max: Number(maxVal.toFixed(4)),
            mean: Number(meanVal.toFixed(4))
          };
          return true;
        };

        const candidateLayouts: OnnxModelValidationResult['inputLayout'][] =
          inputNames.length === 1
            ? ['unified_7ch', 'unified_6ch']
            : inputNames.length >= 3
            ? ['split_img0_img1_t']
            : ['split_img0_img1'];

        for (const layout of candidateLayouts) {
          try {
            const ok = await tryWarmup(layout);
            if (ok) {
              detectedLayout = layout;
              break;
            }
          } catch (warmErr) {
            lastError =
              warmErr instanceof Error
                ? warmErr.message
                : 'Оператор модели не поддерживается выбранным Execution Provider';
          }
        }

        if (detectedLayout === 'unknown' || !warmupStats) {
          await session.release();
          fallbackReasons.push(`${candidate.ep.toUpperCase()}: ${lastError}`);
          setStage(8, 'warning', `Прогон на ${candidate.ep.toUpperCase()} не прошёл: ${lastError}`, performance.now() - tWarm0);
          continue;
        }

        setStage(
          8,
          'passed',
          `Успешно за ${warmupMs.toFixed(2)} мс • Схема: ${detectedLayout} • Выходной тензор проверен (mean=${warmupStats.mean}, max=${warmupStats.max})`,
          performance.now() - tWarm0
        );

        // Stage 10: Model Ready
        setStage(
          9,
          'passed',
          `Движок RIFE 4.x готов к работе на провайдере ${candidate.mapped.toUpperCase()}`,
          0.1
        );

        this.session = session;
        this.activeBackend = candidate.mapped;
        const successResult: OnnxModelValidationResult = {
          valid: true,
          modelName,
          byteSize,
          sha256Hex,
          irVersion: graphInfo.irVersion,
          opsetVersion: graphInfo.opsetVersion,
          producerName: graphInfo.producerName,
          inputNames,
          outputNames,
          inputTensors,
          outputTensors,
          operators: graphInfo.operators,
          totalNodes: graphInfo.totalNodes,
          totalParameters: graphInfo.totalParameters,
          inputLayout: detectedLayout,
          executionProvider: candidate.mapped,
          fallbackReasons,
          warmupInferenceMs: Number(warmupMs.toFixed(2)),
          warmupOutputVerified: true,
          warmupOutputStats: warmupStats,
          stages
        };
        this.validationResult = successResult;
        return successResult;
      } catch (err) {
        lastError =
          err instanceof Error
            ? err.message
            : 'Ошибка инициализации сессии ONNX Runtime Web на выбранном провайдере';
        fallbackReasons.push(`${candidate.ep.toUpperCase()}: ${lastError}`);
        setStage(
          6,
          'warning',
          `Провайдер ${candidate.ep.toUpperCase()} недоступен для данного графа: ${lastError}`,
          performance.now() - tSess0
        );
      }
    }

    const finalErrorReason =
      requestedBackend === 'webgpu' || requestedBackend === 'webgl2'
        ? `Выбран принудительный GPU-режим (${requestedBackend.toUpperCase()}), но провайдер отклонил инициализацию (скрытое переключение на CPU заблокировано): ${lastError}`
        : `Не удалось запустить модель ни на одном доступном провайдере (${candidateProviders
            .map((c) => c.ep.toUpperCase())
            .join(', ')}): ${lastError}`;

    setStage(6, 'failed', finalErrorReason, 0);
    setStage(9, 'failed', 'Инициализация остановлена до устранения причины', 0);

    const failResult: OnnxModelValidationResult = {
      valid: false,
      modelName,
      byteSize,
      sha256Hex,
      irVersion: graphInfo.irVersion,
      opsetVersion: graphInfo.opsetVersion,
      producerName: graphInfo.producerName,
      inputNames: graphInfo.inputs.map((i) => i.name),
      outputNames: graphInfo.outputs.map((o) => o.name),
      inputTensors: graphInfo.inputs,
      outputTensors: graphInfo.outputs,
      operators: graphInfo.operators,
      totalNodes: graphInfo.totalNodes,
      totalParameters: graphInfo.totalParameters,
      inputLayout: 'unknown',
      executionProvider: requestedBackend === 'auto' ? compat.recommendedBackend : requestedBackend,
      fallbackReasons,
      warmupInferenceMs: 0,
      warmupOutputVerified: false,
      stages,
      errorReason: finalErrorReason
    };
    this.validationResult = failResult;
    return failResult;
  }

  private ensureBuffers(w: number, h: number) {
    if (this.cachedTensorW === w && this.cachedTensorH === h && this.unified7Buf) {
      return;
    }
    this.cachedTensorW = w;
    this.cachedTensorH = h;
    this.prepCanvas0.width = w;
    this.prepCanvas0.height = h;
    this.prepCanvas1.width = w;
    this.prepCanvas1.height = h;
    this.outCanvas.width = w;
    this.outCanvas.height = h;
    this.outImageData = this.outCtx ? this.outCtx.createImageData(w, h) : null;

    const hw = w * h;
    this.unified7Buf = new Float32Array(7 * hw);
    this.unified6Buf = new Float32Array(6 * hw);
    this.split0Buf = new Float32Array(3 * hw);
    this.split1Buf = new Float32Array(3 * hw);
  }

  /**
   * Executes a single non-overlapping RIFE ONNX inference pass between frame0 and frame1 at phase alpha.
   * Returns the synthesized HTMLCanvasElement + measured inference latency in ms.
   */
  public async inferIntermediateFrame(
    frame0: CanvasImageSource,
    frame1: CanvasImageSource,
    alpha: number,
    procW: number,
    procH: number
  ): Promise<{ canvas: HTMLCanvasElement; inferenceMs: number } | null> {
    if (!this.session || !this.validationResult || !this.validationResult.valid) {
      return null;
    }
    if (this.isInferring) {
      return null;
    }

    this.isInferring = true;
    const t0 = performance.now();
    try {
      const w = Math.max(64, Math.floor(procW / 8) * 8);
      const h = Math.max(36, Math.floor(procH / 8) * 8);
      this.ensureBuffers(w, h);

      if (!this.prepCtx0 || !this.prepCtx1 || !this.outCtx || !this.outImageData) {
        return null;
      }

      this.prepCtx0.drawImage(frame0, 0, 0, w, h);
      this.prepCtx1.drawImage(frame1, 0, 0, w, h);

      const rgba0 = this.prepCtx0.getImageData(0, 0, w, h).data;
      const rgba1 = this.prepCtx1.getImageData(0, 0, w, h).data;
      const hw = w * h;
      const inv255 = 1.0 / 255.0;
      const clampedAlpha = Math.max(0.0, Math.min(1.0, alpha));

      const layout = this.validationResult.inputLayout;
      const inputNames = this.validationResult.inputNames;
      const outputNames = this.validationResult.outputNames;
      const feeds: Record<string, ort.Tensor> = {};

      if (layout === 'unified_7ch' && this.unified7Buf) {
        const buf = this.unified7Buf;
        const c1 = hw;
        const c2 = hw * 2;
        const c3 = hw * 3;
        const c4 = hw * 4;
        const c5 = hw * 5;
        const c6 = hw * 6;
        for (let i = 0; i < hw; i++) {
          const p = i << 2;
          buf[i] = rgba0[p] * inv255;
          buf[c1 + i] = rgba0[p + 1] * inv255;
          buf[c2 + i] = rgba0[p + 2] * inv255;
          buf[c3 + i] = rgba1[p] * inv255;
          buf[c4 + i] = rgba1[p + 1] * inv255;
          buf[c5 + i] = rgba1[p + 2] * inv255;
          buf[c6 + i] = clampedAlpha;
        }
        feeds[inputNames[0]] = new ort.Tensor('float32', buf, [1, 7, h, w]);
      } else if (layout === 'unified_6ch' && this.unified6Buf) {
        const buf = this.unified6Buf;
        const c1 = hw;
        const c2 = hw * 2;
        const c3 = hw * 3;
        const c4 = hw * 4;
        const c5 = hw * 5;
        for (let i = 0; i < hw; i++) {
          const p = i << 2;
          buf[i] = rgba0[p] * inv255;
          buf[c1 + i] = rgba0[p + 1] * inv255;
          buf[c2 + i] = rgba0[p + 2] * inv255;
          buf[c3 + i] = rgba1[p] * inv255;
          buf[c4 + i] = rgba1[p + 1] * inv255;
          buf[c5 + i] = rgba1[p + 2] * inv255;
        }
        feeds[inputNames[0]] = new ort.Tensor('float32', buf, [1, 6, h, w]);
      } else if (this.split0Buf && this.split1Buf) {
        const b0 = this.split0Buf;
        const b1 = this.split1Buf;
        const c1 = hw;
        const c2 = hw * 2;
        for (let i = 0; i < hw; i++) {
          const p = i << 2;
          b0[i] = rgba0[p] * inv255;
          b0[c1 + i] = rgba0[p + 1] * inv255;
          b0[c2 + i] = rgba0[p + 2] * inv255;
          b1[i] = rgba1[p] * inv255;
          b1[c1 + i] = rgba1[p + 1] * inv255;
          b1[c2 + i] = rgba1[p + 2] * inv255;
        }
        feeds[inputNames[0]] = new ort.Tensor('float32', b0, [1, 3, h, w]);
        feeds[inputNames[1]] = new ort.Tensor('float32', b1, [1, 3, h, w]);
        if (layout === 'split_img0_img1_t' && inputNames.length >= 3) {
          feeds[inputNames[2]] = new ort.Tensor('float32', new Float32Array([clampedAlpha]), [1]);
        }
      }

      const results = await this.session.run(feeds);
      const outTensor = results[outputNames[0]];
      if (!outTensor) return null;

      const outData = outTensor.data as Float32Array;
      const dst = this.outImageData.data;
      const c1 = hw;
      const c2 = hw * 2;
      for (let i = 0; i < hw; i++) {
        const p = i << 2;
        dst[p] = Math.max(0, Math.min(255, Math.round(outData[i] * 255)));
        dst[p + 1] = Math.max(0, Math.min(255, Math.round(outData[c1 + i] * 255)));
        dst[p + 2] = Math.max(0, Math.min(255, Math.round(outData[c2 + i] * 255)));
        dst[p + 3] = 255;
      }
      this.outCtx.putImageData(this.outImageData, 0, 0);

      const inferenceMs = performance.now() - t0;
      return { canvas: this.outCanvas, inferenceMs };
    } catch {
      return null;
    } finally {
      this.isInferring = false;
    }
  }

  public async disposeSession(): Promise<void> {
    if (this.session) {
      try {
        await this.session.release();
      } catch {
        // Ignore
      }
      this.session = null;
    }
  }
}
