import React, { useRef, useState } from 'react';
import {
  Activity,
  AlertTriangle,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  Cpu,
  Download,
  FileUp,
  Gauge,
  HardDrive,
  Layers,
  Play,
  RefreshCw,
  ShieldCheck,
  Sparkles,
  Trash2,
  Zap
} from 'lucide-react';
import {
  ComputeBackendChoice,
  DiagnosticStageRecord,
  EngineStatusIndicator,
  InterpolationMultiplierMode,
  OnnxModelValidationResult,
  PerformanceProfileMode,
  ProcessingResolutionMode,
  RifeEngineMode,
  SystemCompatibilityReport
} from './rifeOnnxEngine';
import { LivePerformanceStatistics } from './webCodecsPipeline';

export interface VideoEnhancementPanelProps {
  interpEnabled: boolean;
  onToggleInterp: (enabled: boolean) => void;
  multiplierMode: InterpolationMultiplierMode;
  onChangeMultiplier: (mode: InterpolationMultiplierMode) => void;
  performanceProfile: PerformanceProfileMode;
  onChangeProfile: (profile: PerformanceProfileMode) => void;
  processingResMode: ProcessingResolutionMode;
  onChangeProcessingRes: (res: ProcessingResolutionMode) => void;
  computeBackend: ComputeBackendChoice;
  onChangeComputeBackend: (backend: ComputeBackendChoice) => void;
  rifeEngineMode: RifeEngineMode;
  onChangeRifeEngineMode: (mode: RifeEngineMode) => void;
  autoPerfScaling: boolean;
  onToggleAutoPerfScaling: (enabled: boolean) => void;
  useWebCodecsDecoder: boolean;
  onToggleWebCodecsDecoder: (enabled: boolean) => void;
  compatibilityReport: SystemCompatibilityReport | null;
  onnxValidation: OnnxModelValidationResult | null;
  diagnosticStages: DiagnosticStageRecord[];
  isRunningDiagnostics: boolean;
  onRunDiagnostics: () => void;
  liveStats: LivePerformanceStatistics;
  modelLoadProgress: number | null;
  modelLoadStatusText: string;
  hasCachedCustomModel: boolean;
  onUploadOnnxFile: (file: File) => void;
  onDownloadOnnxUrl: (url: string) => void;
  onReloadEmbeddedOnnx: () => void;
  onClearCachedOnnx: () => void;
}

export const VideoEnhancementPanel: React.FC<VideoEnhancementPanelProps> = ({
  interpEnabled,
  onToggleInterp,
  multiplierMode,
  onChangeMultiplier,
  performanceProfile,
  onChangeProfile,
  processingResMode,
  onChangeProcessingRes,
  computeBackend,
  onChangeComputeBackend,
  rifeEngineMode,
  onChangeRifeEngineMode,
  autoPerfScaling,
  onToggleAutoPerfScaling,
  useWebCodecsDecoder,
  onToggleWebCodecsDecoder,
  compatibilityReport,
  onnxValidation,
  diagnosticStages,
  isRunningDiagnostics,
  onRunDiagnostics,
  liveStats,
  modelLoadProgress,
  modelLoadStatusText,
  hasCachedCustomModel,
  onUploadOnnxFile,
  onDownloadOnnxUrl,
  onReloadEmbeddedOnnx,
  onClearCachedOnnx
}) => {
  const onnxFileInputRef = useRef<HTMLInputElement | null>(null);
  const [customOnnxUrl, setCustomOnnxUrl] = useState('');
  const [showUrlLoader, setShowUrlLoader] = useState(false);
  const [diagnosticsExpanded, setDiagnosticsExpanded] = useState(false);

  const statusColorMap: Record<
    EngineStatusIndicator,
    { bg: string; text: string; border: string; subtitle: string }
  > = {
    'Initializing Model': {
      bg: 'var(--surface-elevated)',
      text: 'var(--text-main)',
      border: 'var(--border-soft)',
      subtitle: 'Инициализация сессии ONNX Runtime Web, проверка графа операторов и тестовый прогрев...'
    },
    'Model Ready': {
      bg: 'var(--surface-elevated)',
      text: 'var(--text-main)',
      border: 'var(--border-strong)',
      subtitle: 'Модель RIFE 4.x проверена тестовым инференсом и готова к генерации промежуточных кадров'
    },
    'GPU Processing': {
      bg: 'var(--surface-elevated)',
      text: 'var(--text-main)',
      border: 'var(--border-strong)',
      subtitle: 'Аппаратный синтез промежуточных кадров RIFE на GPU (Adreno / WebGPU / WebGL2)'
    },
    'CPU Processing': {
      bg: 'var(--surface-elevated)',
      text: 'var(--text-sub)',
      border: 'var(--border-soft)',
      subtitle: 'Выполнение модели RIFE в резервном режиме WebAssembly (CPU SIMD)'
    },
    'Unsupported Device': {
      bg: 'var(--surface-elevated)',
      text: 'var(--text-main)',
      border: 'var(--border-strong)',
      subtitle:
        onnxValidation?.errorReason ||
        compatibilityReport?.webgpuFailureReason ||
        'Не удалось инициализировать выбранный вычислительный режим'
    },
    'Performance Limited': {
      bg: 'var(--surface-elevated)',
      text: 'var(--text-sub)',
      border: 'var(--border-soft)',
      subtitle: liveStats.degradationReason || 'Автоматическое снижение нагрузки для защиты от пропуска кадров'
    }
  };

  const activeStatusStyle =
    statusColorMap[liveStats.engineStatus] || statusColorMap['Model Ready'];

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      onUploadOnnxFile(file);
      e.target.value = '';
    }
  };

  const stagesToRender =
    diagnosticStages && diagnosticStages.length > 0
      ? diagnosticStages
      : onnxValidation?.stages || [];

  return (
    <div
      className="mt-3 p-4 rounded-3xl flex flex-col gap-3.5 transition-all"
      style={{
        background: 'var(--surface-card)',
        border: '1px solid var(--border-soft)'
      }}
    >
      {/* Header Row */}
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <div className="flex items-center gap-2 min-w-0">
          <div
            className="w-8 h-8 rounded-2xl flex items-center justify-center shrink-0"
            style={{ background: 'var(--accent-bg)', color: 'var(--accent-text)' }}
          >
            <Sparkles className="w-4 h-4" />
          </div>
          <div className="min-w-0">
            <div className="rex-serif font-bold text-sm truncate">
              Video Enhancement • AI Frame Interpolation (RIFE 4.x)
            </div>
            <div className="text-[11px] truncate" style={{ color: 'var(--text-sub)' }}>
              Qualcomm Snapdragon & Adreno GPU • WebGPU • ONNX Runtime Web{' '}
              {compatibilityReport?.onnxRuntimeVersion ? `v${compatibilityReport.onnxRuntimeVersion}` : ''} • WebCodecs
            </div>
          </div>
        </div>

        {/* Master ON / OFF Switch (Touch-friendly >= 44px height) */}
        <button
          type="button"
          onClick={() => onToggleInterp(!interpEnabled)}
          className="min-h-[44px] px-4 py-2 rounded-2xl text-xs font-bold flex items-center gap-2 transition-all cursor-pointer shrink-0"
          style={{
            background: interpEnabled ? 'var(--accent-bg)' : 'var(--surface-pill)',
            color: interpEnabled ? 'var(--accent-text)' : 'var(--text-main)',
            border: '1px solid var(--border-soft)'
          }}
        >
          <Zap className="w-3.5 h-3.5" />
          <span>AI Frame Interpolation: {interpEnabled ? 'ON' : 'OFF'}</span>
        </button>
      </div>

      {/* Engine Status Banner */}
      <div
        className="p-3 rounded-2xl flex flex-col gap-1.5"
        style={{
          background: activeStatusStyle.bg,
          border: `1px solid ${activeStatusStyle.border}`
        }}
      >
        <div className="flex items-center justify-between gap-2 flex-wrap">
          <div className="flex items-center gap-2">
            {liveStats.engineStatus === 'Unsupported Device' ? (
              <AlertTriangle className="w-4 h-4 shrink-0" style={{ color: activeStatusStyle.text }} />
            ) : liveStats.engineStatus === 'Performance Limited' ? (
              <Gauge className="w-4 h-4 shrink-0" style={{ color: activeStatusStyle.text }} />
            ) : (
              <CheckCircle2 className="w-4 h-4 shrink-0" style={{ color: activeStatusStyle.text }} />
            )}
            <span
              className="text-xs font-bold font-mono-code"
              style={{ color: activeStatusStyle.text }}
            >
              Статус: {liveStats.engineStatus}
            </span>
          </div>
          <div className="flex items-center gap-2">
            <span
              className="text-[11px] font-mono-code font-semibold px-2 py-0.5 rounded-lg"
              style={{ background: 'var(--surface-pill)', color: activeStatusStyle.text }}
            >
              Backend: {liveStats.activeBackend.toUpperCase()}
            </span>
            {liveStats.engineStatus === 'Unsupported Device' && computeBackend !== 'auto' && (
              <button
                type="button"
                onClick={() => onChangeComputeBackend('auto')}
                className="px-2.5 py-1 rounded-lg text-[11px] font-bold cursor-pointer"
                style={{ background: 'var(--accent-bg)', color: 'var(--accent-text)' }}
              >
                Переключить в Auto
              </button>
            )}
          </div>
        </div>
        <div className="text-[11px] leading-snug" style={{ color: 'var(--text-main)' }}>
          {modelLoadProgress !== null
            ? `${modelLoadStatusText} (${modelLoadProgress}%)`
            : activeStatusStyle.subtitle}
        </div>
      </div>

      {/* Live Performance Statistics Grid */}
      <div
        className="p-3 rounded-2xl flex flex-col gap-2"
        style={{
          background: 'var(--surface-elevated)',
          border: '1px solid var(--border-soft)'
        }}
      >
        <div className="flex items-center justify-between gap-2 flex-wrap">
          <div className="flex items-center gap-1.5 text-xs font-bold">
            <Activity className="w-3.5 h-3.5" />
            <span>Статистика производительности в реальном времени</span>
          </div>
          <span className="text-[11px] font-mono-code tabular-nums" style={{ color: 'var(--text-sub)' }}>
            {liveStats.webCodecsActive ? 'Декодер: WebCodecs VideoFrame' : 'Декодер: HTMLVideoElement rVFC'}
          </span>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-center font-mono-code tabular-nums">
          <div
            className="p-2 rounded-xl flex flex-col gap-0.5"
            style={{ background: 'var(--surface-card)', border: '1px solid var(--border-soft)' }}
          >
            <span className="text-[10px]" style={{ color: 'var(--text-sub)' }}>
              Original → Target FPS
            </span>
            <span className="text-xs font-bold">
              {liveStats.originalFps} → {interpEnabled ? liveStats.targetFps : liveStats.originalFps} FPS (
              {interpEnabled ? `${liveStats.activeMultiplier}x` : '1x'})
            </span>
          </div>

          <div
            className="p-2 rounded-xl flex flex-col gap-0.5"
            style={{ background: 'var(--surface-card)', border: '1px solid var(--border-soft)' }}
          >
            <span className="text-[10px]" style={{ color: 'var(--text-sub)' }}>
              Inference / Latency
            </span>
            <span className="text-xs font-bold">
              {liveStats.inferenceTimeMs.toFixed(2)} мс / {liveStats.frameLatencyMs.toFixed(1)} мс
            </span>
          </div>

          <div
            className="p-2 rounded-xl flex flex-col gap-0.5"
            style={{ background: 'var(--surface-card)', border: '1px solid var(--border-soft)' }}
          >
            <span className="text-[10px]" style={{ color: 'var(--text-sub)' }}>
              Processing Resolution
            </span>
            <span className="text-xs font-bold">{liveStats.processingResolution}</span>
          </div>

          <div
            className="p-2 rounded-xl flex flex-col gap-0.5"
            style={{ background: 'var(--surface-card)', border: '1px solid var(--border-soft)' }}
          >
            <span className="text-[10px]" style={{ color: 'var(--text-sub)' }}>
              Dropped / Audio Sync
            </span>
            <span className="text-xs font-bold">
              {liveStats.droppedFrames} кадр • {liveStats.audioDriftMs.toFixed(1)} мс
            </span>
          </div>
        </div>
      </div>

      {/* Controls Grid: Multiplier, Profile, Processing Resolution, Backend */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        {/* 1. Interpolation Multiplier (Auto / 2x / 3x / 4x) */}
        <div
          className="p-3 rounded-2xl flex flex-col gap-2"
          style={{ background: 'var(--surface-elevated)', border: '1px solid var(--border-soft)' }}
        >
          <div className="flex items-center justify-between gap-2">
            <span className="text-xs font-bold">Коэффициент интерполяции (Target FPS)</span>
            <span className="text-[11px] font-mono-code tabular-nums" style={{ color: 'var(--text-sub)' }}>
              24→48/72/96 • 30→60/90/120 • 60→120
            </span>
          </div>
          <div className="grid grid-cols-4 gap-1.5">
            {(
              [
                { id: 'auto', label: 'Auto' },
                { id: 2, label: '2x' },
                { id: 3, label: '3x' },
                { id: 4, label: '4x' }
              ] as const
            ).map((item) => (
              <button
                key={String(item.id)}
                type="button"
                onClick={() => onChangeMultiplier(item.id)}
                className={`min-h-[44px] rounded-xl text-xs font-bold transition-all cursor-pointer ${
                  multiplierMode === item.id ? 'rex-seg-btn active' : 'rex-seg-btn'
                }`}
              >
                {item.label}
              </button>
            ))}
          </div>
        </div>

        {/* 2. Adreno Performance Mode (Performance / Balanced / Quality) */}
        <div
          className="p-3 rounded-2xl flex flex-col gap-2"
          style={{ background: 'var(--surface-elevated)', border: '1px solid var(--border-soft)' }}
        >
          <div className="flex items-center justify-between gap-2">
            <span className="text-xs font-bold">Профиль Qualcomm Adreno (Performance Mode)</span>
            <span className="text-[11px] font-mono-code" style={{ color: 'var(--text-sub)' }}>
              {performanceProfile === 'performance'
                ? 'Макс. FPS'
                : performanceProfile === 'balanced'
                ? 'Баланс GMEM'
                : 'Макс. качество'}
            </span>
          </div>
          <div className="grid grid-cols-3 gap-1.5">
            {(
              [
                { id: 'performance', label: 'Performance' },
                { id: 'balanced', label: 'Balanced' },
                { id: 'quality', label: 'Quality' }
              ] as const
            ).map((item) => (
              <button
                key={item.id}
                type="button"
                onClick={() => onChangeProfile(item.id)}
                className={`min-h-[44px] rounded-xl text-xs font-bold transition-all cursor-pointer ${
                  performanceProfile === item.id ? 'rex-seg-btn active' : 'rex-seg-btn'
                }`}
              >
                {item.label}
              </button>
            ))}
          </div>
        </div>

        {/* 3. Processing Resolution (Auto / 540p / 720p / 1080p) */}
        <div
          className="p-3 rounded-2xl flex flex-col gap-2"
          style={{ background: 'var(--surface-elevated)', border: '1px solid var(--border-soft)' }}
        >
          <div className="flex items-center justify-between gap-2">
            <span className="text-xs font-bold">Разрешение обработки RIFE (Processing Res)</span>
            <span className="text-[11px] font-mono-code tabular-nums" style={{ color: 'var(--text-sub)' }}>
              Активно: {liveStats.processingResolution}
            </span>
          </div>
          <div className="grid grid-cols-4 gap-1.5">
            {(
              [
                { id: 'auto', label: 'Auto' },
                { id: '540p', label: '540p' },
                { id: '720p', label: '720p' },
                { id: '1080p', label: '1080p' }
              ] as const
            ).map((item) => (
              <button
                key={item.id}
                type="button"
                onClick={() => onChangeProcessingRes(item.id)}
                className={`min-h-[44px] rounded-xl text-xs font-bold transition-all cursor-pointer ${
                  processingResMode === item.id ? 'rex-seg-btn active' : 'rex-seg-btn'
                }`}
              >
                {item.label}
              </button>
            ))}
          </div>
        </div>

        {/* 4. Compute Backend Selection (Auto / WebGPU / WebGL2 / WASM) */}
        <div
          className="p-3 rounded-2xl flex flex-col gap-2"
          style={{ background: 'var(--surface-elevated)', border: '1px solid var(--border-soft)' }}
        >
          <div className="flex items-center justify-between gap-2">
            <span className="text-xs font-bold">Вычислительное устройство (GPU / CPU Backend)</span>
            <span className="text-[11px] font-mono-code" style={{ color: 'var(--text-sub)' }}>
              {computeBackend === 'webgpu' || computeBackend === 'webgl2'
                ? 'Строгий GPU (без CPU)'
                : 'Авто-приоритет GPU'}
            </span>
          </div>
          <div className="grid grid-cols-4 gap-1.5">
            {(
              [
                { id: 'auto', label: 'Auto' },
                { id: 'webgpu', label: 'WebGPU' },
                { id: 'webgl2', label: 'WebGL2' },
                { id: 'wasm', label: 'WASM' }
              ] as const
            ).map((item) => (
              <button
                key={item.id}
                type="button"
                onClick={() => onChangeComputeBackend(item.id)}
                className={`min-h-[44px] rounded-xl text-xs font-bold transition-all cursor-pointer ${
                  computeBackend === item.id ? 'rex-seg-btn active' : 'rex-seg-btn'
                }`}
              >
                {item.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* RIFE Model Architecture Mode & ONNX File / URL Manager */}
      <div
        className="p-3 rounded-2xl flex flex-col gap-2.5"
        style={{ background: 'var(--surface-elevated)', border: '1px solid var(--border-soft)' }}
      >
        <div className="flex items-center justify-between gap-2 flex-wrap">
          <div className="flex items-center gap-1.5 text-xs font-bold">
            <Layers className="w-3.5 h-3.5" />
            <span>Выбор модели интерполяции RIFE 4.x и управление ONNX</span>
          </div>
          {onnxValidation && (
            <span
              className="text-[11px] font-mono-code px-2 py-0.5 rounded-lg tabular-nums"
              style={{
                background: 'var(--surface-pill)',
                color: 'var(--text-main)',
                border: '1px solid var(--border-soft)'
              }}
            >
              {onnxValidation.valid
                ? `ONNX Verified • ${onnxValidation.executionProvider.toUpperCase()} (${onnxValidation.warmupInferenceMs} мс)`
                : 'Ошибка валидации модели'}
            </span>
          )}
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
          <button
            type="button"
            onClick={() => onChangeRifeEngineMode('hybrid_webgpu_ifnet')}
            className={`min-h-[44px] px-3 py-2 rounded-xl text-xs font-bold flex items-center justify-between gap-2 cursor-pointer ${
              rifeEngineMode === 'hybrid_webgpu_ifnet' ? 'rex-seg-btn active' : 'rex-seg-btn'
            }`}
          >
            <span>Гибрид: WebGPU IFNet (WGSL FP16) + RIFE ONNX</span>
            <span className="text-[10px] font-mono-code opacity-80">60–144 FPS</span>
          </button>

          <button
            type="button"
            onClick={() => onChangeRifeEngineMode('onnx_runtime_rife')}
            className={`min-h-[44px] px-3 py-2 rounded-xl text-xs font-bold flex items-center justify-between gap-2 cursor-pointer ${
              rifeEngineMode === 'onnx_runtime_rife' ? 'rex-seg-btn active' : 'rex-seg-btn'
            }`}
          >
            <span>Прямой инференс: ONNX Runtime Web RIFE</span>
            <span className="text-[10px] font-mono-code opacity-80">
              {onnxValidation ? onnxValidation.modelName : 'RIFE 4.15 ONNX'}
            </span>
          </button>
        </div>

        {/* Validated ONNX Tensor & Graph Metadata Summary */}
        {onnxValidation && (
          <div
            className="p-2.5 rounded-xl text-[11px] font-mono-code flex flex-col gap-1 tabular-nums"
            style={{ background: 'var(--surface-card)', border: '1px solid var(--border-soft)' }}
          >
            <div className="flex items-center justify-between gap-2 flex-wrap">
              <span>
                Модель: <strong>{onnxValidation.modelName}</strong> (IR v{onnxValidation.irVersion} • Opset{' '}
                {onnxValidation.opsetVersion})
              </span>
              <span>
                Размер: {(onnxValidation.byteSize / 1024).toFixed(1)} KB (
                {onnxValidation.totalParameters.toLocaleString('ru-RU')} парам.) • SHA-256:{' '}
                {onnxValidation.sha256Hex}
              </span>
            </div>
            <div className="flex items-center justify-between gap-2 flex-wrap" style={{ color: 'var(--text-sub)' }}>
              <span>
                Входы:{' '}
                {onnxValidation.inputTensors.length > 0
                  ? onnxValidation.inputTensors
                      .map((t) => `${t.name}: ${t.elemType}[${t.shape.join(', ')}]`)
                      .join('; ')
                  : `[${onnxValidation.inputNames.join(', ')}]`}{' '}
                → Выходы:{' '}
                {onnxValidation.outputTensors.length > 0
                  ? onnxValidation.outputTensors
                      .map((t) => `${t.name}: ${t.elemType}[${t.shape.join(', ')}]`)
                      .join('; ')
                  : `[${onnxValidation.outputNames.join(', ')}]`}
              </span>
              <span>Схема: {onnxValidation.inputLayout}</span>
            </div>
            <div className="flex items-center justify-between gap-2 flex-wrap" style={{ color: 'var(--text-sub)' }}>
              <span>
                Операторы графа ({onnxValidation.totalNodes} узлов): [{onnxValidation.operators.join(', ')}]
              </span>
              {onnxValidation.warmupOutputStats && (
                <span>
                  Warmup тензор: min={onnxValidation.warmupOutputStats.min}, mean=
                  {onnxValidation.warmupOutputStats.mean}, max={onnxValidation.warmupOutputStats.max}
                </span>
              )}
            </div>
            {onnxValidation.errorReason && (
              <div className="font-semibold mt-0.5">{onnxValidation.errorReason}</div>
            )}
          </div>
        )}

        {/* Upload / URL Download / Reset Buttons */}
        <div className="flex items-center gap-2 flex-wrap">
          <input
            ref={onnxFileInputRef}
            type="file"
            accept=".onnx,application/octet-stream"
            onChange={handleFileChange}
            className="hidden"
          />
          <button
            type="button"
            onClick={() => onnxFileInputRef.current?.click()}
            className="min-h-[44px] px-3 py-1.5 rounded-xl text-xs font-bold flex items-center gap-1.5 cursor-pointer"
            style={{ background: 'var(--surface-card)', border: '1px solid var(--border-soft)' }}
          >
            <FileUp className="w-3.5 h-3.5" />
            <span>Загрузить .onnx файл (RIFE 4.x)</span>
          </button>

          <button
            type="button"
            onClick={() => setShowUrlLoader((prev) => !prev)}
            className="min-h-[44px] px-3 py-1.5 rounded-xl text-xs font-bold flex items-center gap-1.5 cursor-pointer"
            style={{ background: 'var(--surface-card)', border: '1px solid var(--border-soft)' }}
          >
            <Download className="w-3.5 h-3.5" />
            <span>Загрузить .onnx по URL</span>
          </button>

          <button
            type="button"
            onClick={onReloadEmbeddedOnnx}
            className="min-h-[44px] px-3 py-1.5 rounded-xl text-xs font-bold flex items-center gap-1.5 cursor-pointer"
            style={{ background: 'var(--surface-card)', border: '1px solid var(--border-soft)' }}
          >
            <RefreshCw className="w-3.5 h-3.5" />
            <span>Встроенная RIFE 4.15 Multi-Scale ONNX</span>
          </button>

          {hasCachedCustomModel && (
            <button
              type="button"
              onClick={onClearCachedOnnx}
              className="min-h-[44px] px-3 py-1.5 rounded-xl text-xs font-bold flex items-center gap-1.5 cursor-pointer"
              style={{ background: 'var(--surface-card)', border: '1px solid var(--border-soft)', color: 'var(--text-main)' }}
            >
              <Trash2 className="w-3.5 h-3.5" />
              <span>Очистить кэш IndexedDB</span>
            </button>
          )}
        </div>

        {showUrlLoader && (
          <div className="flex items-center gap-2 flex-wrap pt-1">
            <input
              type="url"
              value={customOnnxUrl}
              onChange={(e) => setCustomOnnxUrl(e.target.value)}
              placeholder="https://example.com/rife_v4.15_opt.onnx"
              className="flex-1 min-w-[200px] min-h-[44px] px-3 py-1.5 rounded-xl text-xs font-mono-code"
              style={{
                background: 'var(--surface-card)',
                border: '1px solid var(--border-soft)',
                color: 'var(--text-main)'
              }}
            />
            <button
              type="button"
              onClick={() => {
                if (customOnnxUrl.trim()) {
                  onDownloadOnnxUrl(customOnnxUrl.trim());
                }
              }}
              className="min-h-[44px] px-4 py-1.5 rounded-xl text-xs font-bold cursor-pointer"
              style={{ background: 'var(--accent-bg)', color: 'var(--accent-text)' }}
            >
              Скачать и проверить
            </button>
          </div>
        )}
      </div>

      {/* Hardware Protection & WebCodecs Toggles */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
        <button
          type="button"
          onClick={() => onToggleAutoPerfScaling(!autoPerfScaling)}
          className="min-h-[44px] p-3 rounded-2xl flex items-center justify-between gap-2 text-left cursor-pointer"
          style={{ background: 'var(--surface-elevated)', border: '1px solid var(--border-soft)' }}
        >
          <div className="flex items-center gap-2 min-w-0">
            <ShieldCheck className="w-4 h-4 shrink-0" />
            <div className="min-w-0">
              <div className="text-xs font-bold truncate">Авто-снижение нагрузки (Adreno Thermal Guard)</div>
              <div className="text-[11px] truncate" style={{ color: 'var(--text-sub)' }}>
                Защита от перегрузки GPU, пропуска кадров и рассинхрона аудио
              </div>
            </div>
          </div>
          <span className="text-xs font-mono-code font-bold shrink-0">
            {autoPerfScaling ? 'ВКЛ' : 'ВЫКЛ'}
          </span>
        </button>

        <button
          type="button"
          onClick={() => onToggleWebCodecsDecoder(!useWebCodecsDecoder)}
          className="min-h-[44px] p-3 rounded-2xl flex items-center justify-between gap-2 text-left cursor-pointer"
          style={{ background: 'var(--surface-elevated)', border: '1px solid var(--border-soft)' }}
        >
          <div className="flex items-center gap-2 min-w-0">
            <HardDrive className="w-4 h-4 shrink-0" />
            <div className="min-w-0">
              <div className="text-xs font-bold truncate">Аппаратный декодер WebCodecs VideoFrame</div>
              <div className="text-[11px] truncate" style={{ color: 'var(--text-sub)' }}>
                Прямой захват кадров с автоматическим освобождением GPU-памяти
              </div>
            </div>
          </div>
          <span className="text-xs font-mono-code font-bold shrink-0">
            {useWebCodecsDecoder ? 'ВКЛ' : 'ВЫКЛ'}
          </span>
        </button>
      </div>

      {/* Dedicated Full Diagnostics Console with Run Diagnostics Button */}
      <div
        className="p-3.5 rounded-2xl flex flex-col gap-3"
        style={{ background: 'var(--surface-elevated)', border: '1px solid var(--border-soft)' }}
      >
        <div className="flex items-center justify-between gap-2 flex-wrap">
          <div
            onClick={() => setDiagnosticsExpanded((prev) => !prev)}
            className="flex items-center gap-2 cursor-pointer select-none"
          >
            <Cpu className="w-4 h-4 shrink-0" />
            <div>
              <div className="text-xs font-bold">
                Diagnostics • Полная техническая диагностика GPU, ONNX Runtime и RIFE 4.x
              </div>
              <div className="text-[11px]" style={{ color: 'var(--text-sub)' }}>
                Проверка WebGPU Adapter/Device, версии ONNX Runtime Web, графа модели и тестового инференса
              </div>
            </div>
            {diagnosticsExpanded ? (
              <ChevronUp className="w-4 h-4 ml-1" />
            ) : (
              <ChevronDown className="w-4 h-4 ml-1" />
            )}
          </div>

          <button
            type="button"
            disabled={isRunningDiagnostics}
            onClick={onRunDiagnostics}
            className="min-h-[44px] px-4 py-2 rounded-xl text-xs font-bold flex items-center gap-2 cursor-pointer transition-all shrink-0"
            style={{
              background: 'var(--accent-bg)',
              color: 'var(--accent-text)',
              opacity: isRunningDiagnostics ? 0.7 : 1
            }}
          >
            {isRunningDiagnostics ? (
              <RefreshCw className="w-3.5 h-3.5 animate-spin" />
            ) : (
              <Play className="w-3.5 h-3.5" />
            )}
            <span>{isRunningDiagnostics ? 'Выполняется проверка...' : 'Run Diagnostics'}</span>
          </button>
        </div>

        {diagnosticsExpanded && compatibilityReport && (
          <div className="flex flex-col gap-3 pt-1">
            {/* Hardware, Platform & Backend Diagnostic Table */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2 text-[11px] font-mono-code tabular-nums">
              <div
                className="p-2.5 rounded-xl flex flex-col gap-1"
                style={{ background: 'var(--surface-card)', border: '1px solid var(--border-soft)' }}
              >
                <span className="opacity-70">Устройство и браузер</span>
                <span className="font-bold truncate">
                  {compatibilityReport.platformSummary} • {compatibilityReport.browserSummary}
                </span>
                <span className="opacity-80">
                  Qualcomm Adreno: {compatibilityReport.isQualcommAdreno ? 'Обнаружен' : 'Стандартный профиль'}
                </span>
              </div>

              <div
                className="p-2.5 rounded-xl flex flex-col gap-1"
                style={{ background: 'var(--surface-card)', border: '1px solid var(--border-soft)' }}
              >
                <span className="opacity-70">WebGPU & GPUAdapter / GPUDevice</span>
                <span className="font-bold truncate">
                  navigator.gpu: {compatibilityReport.webgpuAvailable ? 'Да' : 'Нет'} • Adapter:{' '}
                  {compatibilityReport.webgpuAdapterSuccess ? 'OK' : 'Нет'} • Device:{' '}
                  {compatibilityReport.webgpuDeviceSuccess ? 'OK' : 'Нет'}
                </span>
                <span className="opacity-80 truncate" title={compatibilityReport.webgpuAdapterName}>
                  GPU: {compatibilityReport.webgpuAdapterName}
                </span>
              </div>

              <div
                className="p-2.5 rounded-xl flex flex-col gap-1"
                style={{ background: 'var(--surface-card)', border: '1px solid var(--border-soft)' }}
              >
                <span className="opacity-70">ONNX Runtime Web & Backend</span>
                <span className="font-bold truncate">
                  v{compatibilityReport.onnxRuntimeVersion} • Активен:{' '}
                  {(onnxValidation?.executionProvider || compatibilityReport.recommendedBackend).toUpperCase()}
                </span>
                <span className="opacity-80 truncate" title={compatibilityReport.onnxWasmPathSource}>
                  WASM/JSEP: {compatibilityReport.onnxWasmPathSource}
                </span>
              </div>

              <div
                className="p-2.5 rounded-xl flex flex-col gap-1"
                style={{ background: 'var(--surface-card)', border: '1px solid var(--border-soft)' }}
              >
                <span className="opacity-70">Вычислительные возможности GPU</span>
                <span className="font-bold truncate">
                  FP16: {compatibilityReport.supportsShaderF16 ? 'shader-f16 OK' : 'FP32'} • VRAM ~
                  {compatibilityReport.estimatedVramBudgetMb} МБ
                </span>
                <span className="opacity-80 truncate">
                  WebGL2: {compatibilityReport.webgl2Supported ? 'OK' : 'Нет'} (
                  {compatibilityReport.webgl2Fp16Supported ? 'FP16' : 'RGBA8'}) • WASM:{' '}
                  {compatibilityReport.wasmSupported ? 'OK' : 'Нет'}
                </span>
              </div>

              <div
                className="p-2.5 rounded-xl flex flex-col gap-1"
                style={{ background: 'var(--surface-card)', border: '1px solid var(--border-soft)' }}
              >
                <span className="opacity-70">Статус модели RIFE ONNX</span>
                <span className="font-bold truncate">
                  {onnxValidation
                    ? `${onnxValidation.modelName} (${(onnxValidation.byteSize / 1024).toFixed(1)} KB)`
                    : 'Не загружена'}
                </span>
                <span className="opacity-80 truncate">
                  Операторы: {onnxValidation?.operators.join(', ') || '—'} (
                  {onnxValidation?.totalNodes || 0} узлов)
                </span>
              </div>

              <div
                className="p-2.5 rounded-xl flex flex-col gap-1"
                style={{ background: 'var(--surface-card)', border: '1px solid var(--border-soft)' }}
              >
                <span className="opacity-70">Результат тестового инференса</span>
                <span className="font-bold truncate">
                  {onnxValidation?.warmupOutputVerified
                    ? `Пройден успешно за ${onnxValidation.warmupInferenceMs} мс`
                    : 'Ожидание / Ошибка'}
                </span>
                <span className="opacity-80 truncate">
                  Входы: [{onnxValidation?.inputNames.join(', ') || '—'}] → Выходы: [
                  {onnxValidation?.outputNames.join(', ') || '—'}]
                </span>
              </div>
            </div>

            {/* Fallback Reasons Log (if any) */}
            {onnxValidation && onnxValidation.fallbackReasons.length > 0 && (
              <div
                className="p-2.5 rounded-xl text-[11px] font-mono-code flex flex-col gap-1"
                style={{
                  background: 'var(--surface-card)',
                  border: '1px solid var(--border-strong)'
                }}
              >
                <span className="font-bold">
                  Журнал переключения на резервный backend (Fallback Log):
                </span>
                {onnxValidation.fallbackReasons.map((reason, idx) => (
                  <span key={idx} className="leading-snug">
                    • {reason}
                  </span>
                ))}
              </div>
            )}

            {/* 10-Stage Initialization & Verification Pipeline Checklist */}
            {stagesToRender.length > 0 && (
              <div
                className="p-2.5 rounded-xl flex flex-col gap-1.5 text-[11px] font-mono-code tabular-nums"
                style={{ background: 'var(--surface-card)', border: '1px solid var(--border-soft)' }}
              >
                <div className="font-bold text-xs mb-0.5">
                  Последовательность запуска и проверки (10 этапов):
                </div>
                {stagesToRender.map((st) => {
                  const statusSymbol =
                    st.status === 'passed'
                      ? '✓'
                      : st.status === 'failed'
                      ? '✕'
                      : st.status === 'warning'
                      ? '!'
                      : st.status === 'running'
                      ? '…'
                      : '○';
                  return (
                    <div
                      key={st.step}
                      className="flex items-start justify-between gap-2 py-0.5 border-b last:border-b-0"
                      style={{ borderColor: 'var(--border-soft)' }}
                    >
                      <div className="flex items-start gap-2 min-w-0">
                        <span className="font-bold shrink-0">
                          [{statusSymbol}] {st.step}.
                        </span>
                        <div className="min-w-0">
                          <span className="font-semibold">{st.name}: </span>
                          <span style={{ color: 'var(--text-sub)' }}>{st.detail}</span>
                        </div>
                      </div>
                      {st.durationMs > 0 && (
                        <span className="shrink-0 opacity-75">{st.durationMs.toFixed(1)} мс</span>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
};
