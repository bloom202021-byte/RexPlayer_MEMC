import React, { useState } from 'react';
import {
  ArrowLeft,
  Cpu,
  Layers,
  Zap,
  Sparkles,
  Sun,
  Activity,
  ChevronDown,
  ChevronUp,
  Play,
  Download,
  CheckCircle2,
  AlertTriangle,
  Sliders,
  RotateCcw,
  Upload
} from 'lucide-react';
import {
  VideoEnhancementPanel,
  VideoEnhancementPanelProps
} from '../ai/VideoEnhancementPanel';

export interface ExpertSettingsViewProps {
  onBack: () => void;
  returnLabel?: string;

  // Embedded VideoEnhancementPanel (RIFE 4.x, ONNX Runtime Web v1.31.1, 10-Stage Diagnostics)
  enhancementPanelProps: VideoEnhancementPanelProps;

  // Section B: MEMC / Optical Flow
  interpEnabled: boolean;
  onToggleInterpEnabled: (enabled: boolean) => void;
  interpMode: 'rife' | 'optical' | 'blend' | 'off';
  onChangeInterpMode: (mode: 'rife' | 'optical' | 'blend' | 'off') => void;
  targetFps: 'auto' | 60 | 90 | 120 | 144;
  onChangeTargetFps: (fps: 'auto' | 60 | 90 | 120 | 144) => void;
  effectiveTargetFps: number;
  detectedDisplayHz: number;
  flowScaleMode: 'auto' | 'performance' | 'balanced' | 'ultra' | 'extreme' | 'high' | 'max';
  onChangeFlowScaleMode: (
    mode: 'auto' | 'performance' | 'balanced' | 'ultra' | 'extreme' | 'high' | 'max'
  ) => void;
  flowScaleLabel: string;
  subframeCascadeEnabled: boolean;
  onToggleSubframeCascadeEnabled: (enabled: boolean) => void;
  subframeCascadeMode: 'auto' | '2x' | '3x' | '4x';
  onChangeSubframeCascadeMode: (mode: 'auto' | '2x' | '3x' | '4x') => void;
  effectiveSubframeCascadeMult: 2 | 3 | 4;
  subframeBufferResMode: 'auto' | '720p' | '1080p' | '1440p';
  onChangeSubframeBufferResMode: (mode: 'auto' | '720p' | '1080p' | '1440p') => void;
  subframeBufferResLabel: string;
  subframeCoherenceGuard: number;
  onChangeSubframeCoherenceGuard: (val: number) => void;
  motionScale: number;
  onChangeMotionScale: (val: number) => void;
  dejudderHaloControl: number;
  onChangeDejudderHaloControl: (val: number) => void;
  interpStrength: number;
  onChangeInterpStrength: (val: number) => void;
  sceneCutProtection: boolean;
  onToggleSceneCutProtection: (enabled: boolean) => void;
  splitCompareMode: boolean;
  onToggleSplitCompareMode: (enabled: boolean) => void;
  showVectors: boolean;
  onToggleShowVectors: (enabled: boolean) => void;
  showSadHeatmap: boolean;
  onToggleShowSadHeatmap: (enabled: boolean) => void;
  manualSubframePhase: number | null;
  onChangeManualSubframePhase: (val: number | null) => void;
  onStartDemo24FpsTest: () => void;
  isDemoTestActive: boolean;

  // Section C: Qualcomm Adreno
  detectedGpuInfo: {
    vendor: string;
    renderer: string;
    isAdreno: boolean;
    modelLabel: string;
    gmemCacheLabel: string;
  };
  activeGpuBackend: 'webgpu' | 'webgl2';
  webgpuSupportState: 'probing' | 'supported' | 'unavailable';
  adrenoMode: 'auto' | 'on' | 'off';
  onChangeAdrenoMode: (mode: 'auto' | 'on' | 'off') => void;
  isAdrenoActive: boolean;
  adrenoGmemFp16: boolean;
  onToggleAdrenoGmemFp16: (enabled: boolean) => void;
  adrenoTrue10Hdr: boolean;
  onToggleAdrenoTrue10Hdr: (enabled: boolean) => void;
  ecoThermalMode: boolean;
  onToggleEcoThermalMode: (enabled: boolean) => void;

  // Section D: Super Resolution
  upscaleEnabled: boolean;
  onToggleUpscaleEnabled: (enabled: boolean) => void;
  upscaleMode: 'gsr' | 'fsr' | 'anime4k' | 'cinema';
  onChangeUpscaleMode: (mode: 'gsr' | 'fsr' | 'anime4k' | 'cinema') => void;
  upscaleFactor: 'auto' | 1.5 | 2.0 | 4.0;
  onChangeUpscaleFactor: (factor: 'auto' | 1.5 | 2.0 | 4.0) => void;
  effectiveUpscaleFactor: number;
  upscaleSharpness: number;
  onChangeUpscaleSharpness: (val: number) => void;
  upscaleDenoise: number;
  onChangeUpscaleDenoise: (val: number) => void;
  onApplyMaxQualityPreset: () => void;

  // Section E: HDR / Color / 3D LUT
  hdrEnabled: boolean;
  onToggleHdrEnabled: (enabled: boolean) => void;
  hdrStrength: number;
  onChangeHdrStrength: (val: number) => void;
  debandEnabled: boolean;
  onToggleDebandEnabled: (enabled: boolean) => void;
  debandStrength: number;
  onChangeDebandStrength: (val: number) => void;
  lutPreset: 'off' | 'teal_orange' | 'kodak_2383' | 'anime_vibrant' | 'cyberpunk' | 'custom';
  onChangeLutPreset: (
    preset: 'off' | 'teal_orange' | 'kodak_2383' | 'anime_vibrant' | 'cyberpunk' | 'custom'
  ) => void;
  lutStrength: number;
  onChangeLutStrength: (val: number) => void;
  customLutName: string;
  onTriggerUploadLutFile: () => void;
  videoBrightness: number;
  onChangeVideoBrightness: (val: number) => void;
  videoContrast: number;
  onChangeVideoContrast: (val: number) => void;
  videoSaturation: number;
  onChangeVideoSaturation: (val: number) => void;
  videoBlackPoint: number;
  onChangeVideoBlackPoint: (val: number) => void;
  monochromeFilter: boolean;
  onToggleMonochromeFilter: (enabled: boolean) => void;
  onResetColorControls: () => void;

  // Section F: Diagnostics & Export
  onExportDiagnosticsJson: () => void;
}

type ExpertAccordionId = 'rife' | 'memc' | 'adreno' | 'sr' | 'hdr' | 'diagnostics';

export const ExpertSettingsView: React.FC<ExpertSettingsViewProps> = ({
  onBack,
  returnLabel = 'Назад',
  enhancementPanelProps,
  interpEnabled,
  onToggleInterpEnabled,
  interpMode,
  onChangeInterpMode,
  targetFps,
  onChangeTargetFps,
  effectiveTargetFps,
  detectedDisplayHz,
  flowScaleMode,
  onChangeFlowScaleMode,
  flowScaleLabel,
  subframeCascadeEnabled,
  onToggleSubframeCascadeEnabled,
  subframeCascadeMode,
  onChangeSubframeCascadeMode,
  effectiveSubframeCascadeMult,
  subframeBufferResMode,
  onChangeSubframeBufferResMode,
  subframeBufferResLabel,
  subframeCoherenceGuard,
  onChangeSubframeCoherenceGuard,
  motionScale,
  onChangeMotionScale,
  dejudderHaloControl,
  onChangeDejudderHaloControl,
  interpStrength,
  onChangeInterpStrength,
  sceneCutProtection,
  onToggleSceneCutProtection,
  splitCompareMode,
  onToggleSplitCompareMode,
  showVectors,
  onToggleShowVectors,
  showSadHeatmap,
  onToggleShowSadHeatmap,
  manualSubframePhase,
  onChangeManualSubframePhase,
  onStartDemo24FpsTest,
  isDemoTestActive,
  detectedGpuInfo,
  activeGpuBackend,
  webgpuSupportState,
  adrenoMode,
  onChangeAdrenoMode,
  isAdrenoActive,
  adrenoGmemFp16,
  onToggleAdrenoGmemFp16,
  adrenoTrue10Hdr,
  onToggleAdrenoTrue10Hdr,
  ecoThermalMode,
  onToggleEcoThermalMode,
  upscaleEnabled,
  onToggleUpscaleEnabled,
  upscaleMode,
  onChangeUpscaleMode,
  upscaleFactor,
  onChangeUpscaleFactor,
  effectiveUpscaleFactor,
  upscaleSharpness,
  onChangeUpscaleSharpness,
  upscaleDenoise,
  onChangeUpscaleDenoise,
  onApplyMaxQualityPreset,
  hdrEnabled,
  onToggleHdrEnabled,
  hdrStrength,
  onChangeHdrStrength,
  debandEnabled,
  onToggleDebandEnabled,
  debandStrength,
  onChangeDebandStrength,
  lutPreset,
  onChangeLutPreset,
  lutStrength,
  onChangeLutStrength,
  customLutName,
  onTriggerUploadLutFile,
  videoBrightness,
  onChangeVideoBrightness,
  videoContrast,
  onChangeVideoContrast,
  videoSaturation,
  onChangeVideoSaturation,
  videoBlackPoint,
  onChangeVideoBlackPoint,
  monochromeFilter,
  onToggleMonochromeFilter,
  onResetColorControls,
  onExportDiagnosticsJson
}) => {
  // All technical sections collapsed by default so the screen opens clean and structured
  const [openSections, setOpenSections] = useState<Record<ExpertAccordionId, boolean>>({
    rife: false,
    memc: false,
    adreno: false,
    sr: false,
    hdr: false,
    diagnostics: false
  });

  const toggleSection = (id: ExpertAccordionId) => {
    setOpenSections((prev) => ({ ...prev, [id]: !prev[id] }));
  };

  const { liveStats, onnxValidation, diagnosticStages, isRunningDiagnostics, onRunDiagnostics } =
    enhancementPanelProps;

  return (
    <div className="min-h-screen pb-24" style={{ background: 'var(--bg-app)', color: 'var(--text-main)' }}>
      {/* Top Bar */}
      <header
        className="sticky top-0 z-30 backdrop-blur-md px-4 py-3.5 flex items-center justify-between"
        style={{ background: 'var(--nav-bg)', borderBottom: '1px solid var(--border-soft)' }}
      >
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={onBack}
            className="px-3.5 py-2 rounded-xl flex items-center gap-2 text-xs font-semibold transition cursor-pointer"
            style={{ background: 'var(--surface-pill)', border: '1px solid var(--border-soft)', color: 'var(--text-main)' }}
          >
            <ArrowLeft className="w-4 h-4" />
            {returnLabel}
          </button>
          <div>
            <h1 className="text-base font-bold tracking-tight">Expert Settings</h1>
            <p className="text-[11px]" style={{ color: 'var(--text-sub)' }}>
              Инженерные параметры RIFE 4.x • MEMC • Qualcomm Adreno • Диагностика
            </p>
          </div>
        </div>
        <span
          className="px-2.5 py-1 rounded-full text-[11px] font-semibold hidden sm:inline-flex"
          style={{ background: 'var(--surface-pill)', border: '1px solid var(--border-soft)', color: 'var(--text-main)' }}
        >
          {detectedGpuInfo.modelLabel}
        </span>
      </header>

      <div className="max-w-3xl mx-auto p-4 space-y-3">
        {/* Compact Status Banner */}
        <div
          className="rounded-2xl p-4 flex flex-wrap items-center justify-between gap-3"
          style={{ background: 'var(--surface-card)', border: '1px solid var(--border-soft)' }}
        >
          <div className="flex items-center gap-3">
            <div
              className="w-10 h-10 rounded-2xl flex items-center justify-center"
              style={{ background: 'var(--accent-bg)', color: 'var(--accent-text)' }}
            >
              <Cpu className="w-5 h-5" />
            </div>
            <div>
              <div className="text-sm font-bold">
                {onnxValidation?.modelName || 'RIFE 4.15 IFNet Multi-Scale'}
              </div>
              <div className="text-xs" style={{ color: 'var(--text-sub)' }}>
                Backend:{' '}
                <span className="font-semibold" style={{ color: 'var(--text-main)' }}>
                  {liveStats.activeBackend.toUpperCase()}
                </span>{' '}
                • Статус:{' '}
                <span className="font-semibold" style={{ color: 'var(--text-main)' }}>
                  {liveStats.engineStatus}
                </span>{' '}
                • Выход:{' '}
                <span className="font-semibold" style={{ color: 'var(--text-main)' }}>
                  {effectiveTargetFps} FPS
                </span>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() =>
                setOpenSections({
                  rife: true,
                  memc: true,
                  adreno: true,
                  sr: true,
                  hdr: true,
                  diagnostics: true
                })
              }
              className="px-3 py-1.5 rounded-xl text-xs transition cursor-pointer"
              style={{ background: 'var(--surface-pill)', border: '1px solid var(--border-soft)', color: 'var(--text-main)' }}
            >
              Развернуть все
            </button>
            <button
              type="button"
              onClick={() =>
                setOpenSections({
                  rife: false,
                  memc: false,
                  adreno: false,
                  sr: false,
                  hdr: false,
                  diagnostics: false
                })
              }
              className="px-3 py-1.5 rounded-xl text-xs transition cursor-pointer"
              style={{ background: 'var(--surface-pill)', border: '1px solid var(--border-soft)', color: 'var(--text-main)' }}
            >
              Свернуть все
            </button>
          </div>
        </div>

        {/* ============================================================
            SECTION A: RIFE 4.x & ONNX Runtime Web
        ============================================================ */}
        <div
          className="rounded-2xl overflow-hidden"
          style={{ background: 'var(--surface-card)', border: '1px solid var(--border-soft)' }}
        >
          <button
            type="button"
            onClick={() => toggleSection('rife')}
            className="w-full p-4 flex items-center justify-between text-left transition cursor-pointer"
          >
            <div className="flex items-center gap-3">
              <div
                className="w-9 h-9 rounded-xl flex items-center justify-center"
                style={{ background: 'var(--surface-pill)', border: '1px solid var(--border-soft)', color: 'var(--text-main)' }}
              >
                <Zap className="w-4 h-4" />
              </div>
              <div>
                <div className="text-sm font-bold">RIFE 4.x & ONNX Runtime Web</div>
                <div className="text-xs" style={{ color: 'var(--text-sub)' }}>
                  Модель .onnx • Execution Provider (WebGPU / WebGL2 / WASM) • Инспекция графа
                </div>
              </div>
            </div>
            {openSections.rife ? (
              <ChevronUp className="w-4 h-4" style={{ color: 'var(--text-sub)' }} />
            ) : (
              <ChevronDown className="w-4 h-4" style={{ color: 'var(--text-sub)' }} />
            )}
          </button>

          {openSections.rife && (
            <div className="p-4 pt-2 border-t" style={{ borderColor: 'var(--border-soft)' }}>
              <VideoEnhancementPanel {...enhancementPanelProps} />
            </div>
          )}
        </div>

        {/* ============================================================
            SECTION B: MEMC & Optical Flow Pyramid
        ============================================================ */}
        <div
          className="rounded-2xl overflow-hidden"
          style={{ background: 'var(--surface-card)', border: '1px solid var(--border-soft)' }}
        >
          <button
            type="button"
            onClick={() => toggleSection('memc')}
            className="w-full p-4 flex items-center justify-between text-left transition cursor-pointer"
          >
            <div className="flex items-center gap-3">
              <div
                className="w-9 h-9 rounded-xl flex items-center justify-center"
                style={{ background: 'var(--surface-pill)', border: '1px solid var(--border-soft)', color: 'var(--text-main)' }}
              >
                <Layers className="w-4 h-4" />
              </div>
              <div>
                <div className="text-sm font-bold">MEMC & Optical Flow Pyramid</div>
                <div className="text-xs" style={{ color: 'var(--text-sub)' }}>
                  6-Level FBO пирамида ({flowScaleLabel}) • Каскад суб-кадров • Векторы движения
                </div>
              </div>
            </div>
            {openSections.memc ? (
              <ChevronUp className="w-4 h-4" style={{ color: 'var(--text-sub)' }} />
            ) : (
              <ChevronDown className="w-4 h-4" style={{ color: 'var(--text-sub)' }} />
            )}
          </button>

          {openSections.memc && (
            <div className="p-4 pt-2 border-t space-y-4" style={{ borderColor: 'var(--border-soft)' }}>
              {/* Shader Pipeline Mode */}
              <div className="space-y-1.5">
                <div className="text-xs" style={{ color: 'var(--text-sub)' }}>
                  Алгоритм синтеза промежуточных кадров
                </div>
                <div className="grid grid-cols-4 gap-1.5">
                  {(
                    [
                      { id: 'rife', label: 'RIFE 4.15' },
                      { id: 'optical', label: 'Optical Flow' },
                      { id: 'blend', label: 'Frame Blend' },
                      { id: 'off', label: 'Выкл' }
                    ] as const
                  ).map((m) => {
                    const isAct =
                      m.id === 'off'
                        ? !interpEnabled || interpMode === 'off'
                        : interpEnabled && interpMode === m.id;
                    return (
                      <button
                        key={m.id}
                        type="button"
                        onClick={() => {
                          if (m.id === 'off') {
                            onChangeInterpMode('off');
                            onToggleInterpEnabled(false);
                          } else {
                            onChangeInterpMode(m.id);
                            onToggleInterpEnabled(true);
                          }
                        }}
                        className={`py-2 rounded-xl text-xs font-semibold cursor-pointer ${
                          isAct ? 'rex-seg-btn active' : 'rex-seg-btn'
                        }`}
                      >
                        {m.label}
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Target FPS */}
              <div className="space-y-1.5">
                <div className="flex justify-between text-xs">
                  <span style={{ color: 'var(--text-sub)' }}>Целевая частота (Target FPS)</span>
                  <span className="font-mono font-bold">{effectiveTargetFps} FPS</span>
                </div>
                <div className="grid grid-cols-5 gap-1.5">
                  {(
                    [
                      { id: 'auto' as const, label: `Auto (${detectedDisplayHz})` },
                      { id: 60 as const, label: '60 FPS' },
                      { id: 90 as const, label: '90 FPS' },
                      { id: 120 as const, label: '120 FPS' },
                      { id: 144 as const, label: '144 FPS' }
                    ]
                  ).map((item) => (
                    <button
                      key={String(item.id)}
                      type="button"
                      onClick={() => onChangeTargetFps(item.id)}
                      className={`py-2 rounded-xl text-xs font-semibold cursor-pointer ${
                        targetFps === item.id ? 'rex-seg-btn active' : 'rex-seg-btn'
                      }`}
                    >
                      {item.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* 6-Level FBO Pyramid Density */}
              <div className="space-y-1.5">
                <div className="flex justify-between text-xs">
                  <span style={{ color: 'var(--text-sub)' }}>Плотность 6-уровневой FBO пирамиды</span>
                  <span className="font-mono font-bold">{flowScaleLabel}</span>
                </div>
                <div className="grid grid-cols-4 sm:grid-cols-7 gap-1.5">
                  {(
                    [
                      { id: 'auto', label: 'Auto' },
                      { id: 'performance', label: '64×36' },
                      { id: 'balanced', label: '96×54' },
                      { id: 'ultra', label: '128×72' },
                      { id: 'extreme', label: '256×144' },
                      { id: 'high', label: '384×216' },
                      { id: 'max', label: '512×288' }
                    ] as const
                  ).map((fs) => (
                    <button
                      key={fs.id}
                      type="button"
                      onClick={() => onChangeFlowScaleMode(fs.id)}
                      className={`py-1.5 rounded-lg text-xs font-semibold cursor-pointer ${
                        flowScaleMode === fs.id ? 'rex-seg-btn active' : 'rex-seg-btn'
                      }`}
                    >
                      {fs.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Sub-Frame Cascade & Buffer Resolution */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <div className="flex items-center justify-between">
                    <span className="text-xs" style={{ color: 'var(--text-sub)' }}>
                      3-Anchor Sub-Frame Cascade ({effectiveSubframeCascadeMult}x)
                    </span>
                    <button
                      type="button"
                      onClick={() => onToggleSubframeCascadeEnabled(!subframeCascadeEnabled)}
                      className="px-2 py-0.5 rounded text-[11px] font-bold cursor-pointer"
                      style={{
                        background: subframeCascadeEnabled ? 'var(--accent-bg)' : 'var(--surface-pill)',
                        color: subframeCascadeEnabled ? 'var(--accent-text)' : 'var(--text-sub)'
                      }}
                    >
                      {subframeCascadeEnabled ? 'ON' : 'OFF'}
                    </button>
                  </div>
                  <div className="grid grid-cols-4 gap-1.5">
                    {(['auto', '2x', '3x', '4x'] as const).map((cm) => (
                      <button
                        key={cm}
                        type="button"
                        onClick={() => {
                          onChangeSubframeCascadeMode(cm);
                          if (!subframeCascadeEnabled) onToggleSubframeCascadeEnabled(true);
                        }}
                        className={`py-1.5 rounded-lg text-xs font-semibold cursor-pointer ${
                          subframeCascadeMode === cm ? 'rex-seg-btn active' : 'rex-seg-btn'
                        }`}
                      >
                        {cm.toUpperCase()}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="space-y-1.5">
                  <div className="flex justify-between text-xs">
                    <span style={{ color: 'var(--text-sub)' }}>Разрешение каскадного FBO</span>
                    <span className="font-mono font-bold">{subframeBufferResLabel}</span>
                  </div>
                  <div className="grid grid-cols-4 gap-1.5">
                    {(['auto', '720p', '1080p', '1440p'] as const).map((res) => (
                      <button
                        key={res}
                        type="button"
                        onClick={() => onChangeSubframeBufferResMode(res)}
                        className={`py-1.5 rounded-lg text-xs font-semibold cursor-pointer ${
                          subframeBufferResMode === res ? 'rex-seg-btn active' : 'rex-seg-btn'
                        }`}
                      >
                        {res === 'auto' ? 'Auto' : res}
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              {/* Sliders: Coherence Guard, Motion Scale, Anti-Halo, Interp Strength */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
                <div className="space-y-1">
                  <div className="flex justify-between text-xs">
                    <span style={{ color: 'var(--text-sub)' }}>Vector Coherence Guard</span>
                    <span className="font-mono font-bold">{subframeCoherenceGuard}%</span>
                  </div>
                  <input
                    type="range"
                    min={0}
                    max={100}
                    step={5}
                    value={subframeCoherenceGuard}
                    onChange={(e) => onChangeSubframeCoherenceGuard(parseInt(e.target.value, 10))}
                    className="rex-slider"
                  />
                </div>

                <div className="space-y-1">
                  <div className="flex justify-between text-xs">
                    <span style={{ color: 'var(--text-sub)' }}>Радиус поиска движения (Motion Scale)</span>
                    <span className="font-mono font-bold">{motionScale} px</span>
                  </div>
                  <input
                    type="range"
                    min={4}
                    max={48}
                    step={1}
                    value={motionScale}
                    onChange={(e) => onChangeMotionScale(parseInt(e.target.value, 10))}
                    className="rex-slider"
                  />
                </div>

                <div className="space-y-1">
                  <div className="flex justify-between text-xs">
                    <span style={{ color: 'var(--text-sub)' }}>Подавление ореолов (Anti-Halo)</span>
                    <span className="font-mono font-bold">{dejudderHaloControl}%</span>
                  </div>
                  <input
                    type="range"
                    min={0}
                    max={100}
                    step={5}
                    value={dejudderHaloControl}
                    onChange={(e) => onChangeDejudderHaloControl(parseInt(e.target.value, 10))}
                    className="rex-slider"
                  />
                </div>

                <div className="space-y-1">
                  <div className="flex justify-between text-xs">
                    <span style={{ color: 'var(--text-sub)' }}>Интенсивность смешивания (Flow Strength)</span>
                    <span className="font-mono font-bold">{Math.round(interpStrength * 100)}%</span>
                  </div>
                  <input
                    type="range"
                    min={0}
                    max={2.0}
                    step={0.05}
                    value={interpStrength}
                    onChange={(e) => onChangeInterpStrength(parseFloat(e.target.value))}
                    className="rex-slider"
                  />
                </div>
              </div>

              {/* Debug Toggles & Sub-frame Phase Inspector */}
              <div className="flex flex-wrap gap-2 pt-1">
                <button
                  type="button"
                  onClick={() => onToggleSceneCutProtection(!sceneCutProtection)}
                  className="px-3 py-1.5 rounded-xl text-xs font-semibold cursor-pointer"
                  style={{
                    background: sceneCutProtection ? 'var(--accent-bg)' : 'var(--surface-pill)',
                    color: sceneCutProtection ? 'var(--accent-text)' : 'var(--text-sub)'
                  }}
                >
                  Scene Cut Protection: {sceneCutProtection ? 'ON' : 'OFF'}
                </button>
                <button
                  type="button"
                  onClick={() => onToggleSplitCompareMode(!splitCompareMode)}
                  className="px-3 py-1.5 rounded-xl text-xs font-semibold cursor-pointer"
                  style={{
                    background: splitCompareMode ? 'var(--accent-bg)' : 'var(--surface-pill)',
                    color: splitCompareMode ? 'var(--accent-text)' : 'var(--text-sub)'
                  }}
                >
                  50/50 Split Compare: {splitCompareMode ? 'ON' : 'OFF'}
                </button>
                <button
                  type="button"
                  onClick={() => onToggleShowVectors(!showVectors)}
                  className="px-3 py-1.5 rounded-xl text-xs font-semibold cursor-pointer"
                  style={{
                    background: showVectors ? 'var(--accent-bg)' : 'var(--surface-pill)',
                    color: showVectors ? 'var(--accent-text)' : 'var(--text-sub)'
                  }}
                >
                  Motion Vectors: {showVectors ? 'ON' : 'OFF'}
                </button>
                <button
                  type="button"
                  onClick={() => onToggleShowSadHeatmap(!showSadHeatmap)}
                  className="px-3 py-1.5 rounded-xl text-xs font-semibold cursor-pointer"
                  style={{
                    background: showSadHeatmap ? 'var(--accent-bg)' : 'var(--surface-pill)',
                    color: showSadHeatmap ? 'var(--accent-text)' : 'var(--text-sub)'
                  }}
                >
                  SAD Heatmap: {showSadHeatmap ? 'ON' : 'OFF'}
                </button>
                <button
                  type="button"
                  onClick={onStartDemo24FpsTest}
                  className="px-3 py-1.5 rounded-xl text-xs font-semibold cursor-pointer"
                  style={{
                    background: isDemoTestActive ? 'var(--accent-bg)' : 'var(--surface-pill)',
                    color: isDemoTestActive ? 'var(--accent-text)' : 'var(--text-main)'
                  }}
                >
                  {isDemoTestActive ? 'Демо 24 FPS активно' : 'Запустить стенд 24 FPS'}
                </button>
              </div>

              {/* Manual Sub-Frame Phase Inspector */}
              <div
                className="p-3 rounded-xl space-y-2"
                style={{ background: 'var(--surface-elevated)', border: '1px solid var(--border-soft)' }}
              >
                <div className="flex items-center justify-between text-xs">
                  <span style={{ color: 'var(--text-sub)' }}>Инспектор фазы субкадра (α)</span>
                  <span className="font-mono font-bold">
                    {manualSubframePhase === null
                      ? 'Авто (Динамическая фаза)'
                      : `α = ${manualSubframePhase.toFixed(2)}`}
                  </span>
                </div>
                <input
                  type="range"
                  min={0}
                  max={1}
                  step={0.01}
                  value={manualSubframePhase ?? 0.5}
                  onChange={(e) => onChangeManualSubframePhase(parseFloat(e.target.value))}
                  className="rex-slider"
                />
                <div className="flex flex-wrap gap-1.5">
                  {[
                    { val: null, label: 'Авто' },
                    { val: 0.0, label: '0% (T-1)' },
                    { val: 0.25, label: '25% (I_0.25)' },
                    { val: 0.5, label: '50% (I_0.50)' },
                    { val: 0.75, label: '75% (I_0.75)' },
                    { val: 1.0, label: '100% (T)' }
                  ].map((btn) => (
                    <button
                      key={btn.label}
                      type="button"
                      onClick={() => onChangeManualSubframePhase(btn.val)}
                      className="px-2.5 py-1 rounded-lg text-[11px] font-mono font-semibold cursor-pointer"
                      style={{
                        background: manualSubframePhase === btn.val ? 'var(--accent-bg)' : 'var(--surface-pill)',
                        color: manualSubframePhase === btn.val ? 'var(--accent-text)' : 'var(--text-sub)'
                      }}
                    >
                      {btn.label}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          )}
        </div>

        {/* ============================================================
            SECTION C: Qualcomm Adreno GPU & WebCodecs
        ============================================================ */}
        <div
          className="rounded-2xl overflow-hidden"
          style={{ background: 'var(--surface-card)', border: '1px solid var(--border-soft)' }}
        >
          <button
            type="button"
            onClick={() => toggleSection('adreno')}
            className="w-full p-4 flex items-center justify-between text-left transition cursor-pointer"
          >
            <div className="flex items-center gap-3">
              <div
                className="w-9 h-9 rounded-xl flex items-center justify-center"
                style={{ background: 'var(--surface-pill)', border: '1px solid var(--border-soft)', color: 'var(--text-main)' }}
              >
                <Cpu className="w-4 h-4" />
              </div>
              <div>
                <div className="text-sm font-bold">Qualcomm Adreno GPU & WebCodecs</div>
                <div className="text-xs" style={{ color: 'var(--text-sub)' }}>
                  {detectedGpuInfo.modelLabel} • GMEM Tile Cache • FP16 ALU • True10 HDR • ЭКО-Холод
                </div>
              </div>
            </div>
            {openSections.adreno ? (
              <ChevronUp className="w-4 h-4" style={{ color: 'var(--text-sub)' }} />
            ) : (
              <ChevronDown className="w-4 h-4" style={{ color: 'var(--text-sub)' }} />
            )}
          </button>

          {openSections.adreno && (
            <div className="p-4 pt-2 border-t space-y-4" style={{ borderColor: 'var(--border-soft)' }}>
              {/* Backend & Adreno Mode */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <label className="text-xs" style={{ color: 'var(--text-sub)' }}>
                    Вычислительный Backend ({activeGpuBackend.toUpperCase()})
                  </label>
                  <div className="grid grid-cols-4 gap-1.5">
                    {(['auto', 'webgpu', 'webgl2', 'wasm'] as const).map((b) => {
                      const disabledOpt = b === 'webgpu' && webgpuSupportState === 'unavailable';
                      return (
                        <button
                          key={b}
                          type="button"
                          disabled={disabledOpt}
                          onClick={() => enhancementPanelProps.onChangeComputeBackend(b)}
                          className={`py-2 rounded-xl text-xs font-semibold uppercase cursor-pointer ${
                            enhancementPanelProps.computeBackend === b
                              ? 'rex-seg-btn active'
                              : 'rex-seg-btn'
                          } ${disabledOpt ? 'opacity-40 cursor-not-allowed' : ''}`}
                        >
                          {b}
                        </button>
                      );
                    })}
                  </div>
                </div>

                <div className="space-y-1.5">
                  <label className="text-xs" style={{ color: 'var(--text-sub)' }}>
                    Профиль Qualcomm Adreno ({isAdrenoActive ? 'Активен' : 'Выкл'})
                  </label>
                  <div className="grid grid-cols-3 gap-1.5">
                    {(['auto', 'on', 'off'] as const).map((am) => (
                      <button
                        key={am}
                        type="button"
                        onClick={() => onChangeAdrenoMode(am)}
                        className={`py-2 rounded-xl text-xs font-semibold uppercase cursor-pointer ${
                          adrenoMode === am ? 'rex-seg-btn active' : 'rex-seg-btn'
                        }`}
                      >
                        {am}
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              {/* Adreno Hardware Toggles */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => onToggleAdrenoGmemFp16(!adrenoGmemFp16)}
                  className="p-3 rounded-xl text-left flex items-center justify-between cursor-pointer"
                  style={{
                    background: adrenoGmemFp16 ? 'var(--surface-elevated)' : 'var(--surface-card)',
                    border: adrenoGmemFp16
                      ? '1px solid var(--border-strong)'
                      : '1px solid var(--border-soft)'
                  }}
                >
                  <div>
                    <div className="text-xs font-semibold">Adreno GMEM Tile Cache + FP16</div>
                    <div className="text-[11px]" style={{ color: 'var(--text-sub)' }}>
                      {detectedGpuInfo.gmemCacheLabel}
                    </div>
                  </div>
                  <span className="text-xs font-bold">{adrenoGmemFp16 ? 'ON' : 'OFF'}</span>
                </button>

                <button
                  type="button"
                  onClick={() => onToggleAdrenoTrue10Hdr(!adrenoTrue10Hdr)}
                  className="p-3 rounded-xl text-left flex items-center justify-between cursor-pointer"
                  style={{
                    background: adrenoTrue10Hdr ? 'var(--surface-elevated)' : 'var(--surface-card)',
                    border: adrenoTrue10Hdr
                      ? '1px solid var(--border-strong)'
                      : '1px solid var(--border-soft)'
                  }}
                >
                  <div>
                    <div className="text-xs font-semibold">True10 HDR Blue-Noise Dither</div>
                    <div className="text-[11px]" style={{ color: 'var(--text-sub)' }}>
                      10-битная градация полутонов
                    </div>
                  </div>
                  <span className="text-xs font-bold">{adrenoTrue10Hdr ? 'ON' : 'OFF'}</span>
                </button>

                <button
                  type="button"
                  onClick={() => onToggleEcoThermalMode(!ecoThermalMode)}
                  className="p-3 rounded-xl text-left flex items-center justify-between cursor-pointer"
                  style={{
                    background: ecoThermalMode ? 'var(--surface-elevated)' : 'var(--surface-card)',
                    border: ecoThermalMode
                      ? '1px solid var(--border-strong)'
                      : '1px solid var(--border-soft)'
                  }}
                >
                  <div>
                    <div className="text-xs font-semibold">Холодный ЭКО-режим (Анти-нагрев)</div>
                    <div className="text-[11px]" style={{ color: 'var(--text-sub)' }}>
                      Снижение тепловыделения GPU до 65%
                    </div>
                  </div>
                  <span className="text-xs font-bold">{ecoThermalMode ? 'ON' : 'OFF'}</span>
                </button>

                <button
                  type="button"
                  onClick={() =>
                    enhancementPanelProps.onToggleAutoPerfScaling(
                      !enhancementPanelProps.autoPerfScaling
                    )
                  }
                  className="p-3 rounded-xl text-left flex items-center justify-between cursor-pointer"
                  style={{
                    background: enhancementPanelProps.autoPerfScaling
                      ? 'var(--surface-elevated)'
                      : 'var(--surface-card)',
                    border: enhancementPanelProps.autoPerfScaling
                      ? '1px solid var(--border-strong)'
                      : '1px solid var(--border-soft)'
                  }}
                >
                  <div>
                    <div className="text-xs font-semibold">Adreno Thermal Guard</div>
                    <div className="text-[11px]" style={{ color: 'var(--text-sub)' }}>
                      {liveStats.degradationReason}
                    </div>
                  </div>
                  <span className="text-xs font-bold">
                    {enhancementPanelProps.autoPerfScaling ? 'ON' : 'OFF'}
                  </span>
                </button>
              </div>
            </div>
          )}
        </div>

        {/* ============================================================
            SECTION D: GPU Super Resolution
        ============================================================ */}
        <div
          className="rounded-2xl overflow-hidden"
          style={{ background: 'var(--surface-card)', border: '1px solid var(--border-soft)' }}
        >
          <button
            type="button"
            onClick={() => toggleSection('sr')}
            className="w-full p-4 flex items-center justify-between text-left transition cursor-pointer"
          >
            <div className="flex items-center gap-3">
              <div
                className="w-9 h-9 rounded-xl flex items-center justify-center"
                style={{ background: 'var(--surface-pill)', border: '1px solid var(--border-soft)', color: 'var(--text-main)' }}
              >
                <Sparkles className="w-4 h-4" />
              </div>
              <div>
                <div className="text-sm font-bold">GPU Super Resolution</div>
                <div className="text-xs" style={{ color: 'var(--text-sub)' }}>
                  Snapdragon GSR • AMD FSR 1.0 • Anime4K • CAS Sharpness • Denoise
                </div>
              </div>
            </div>
            {openSections.sr ? (
              <ChevronUp className="w-4 h-4" style={{ color: 'var(--text-sub)' }} />
            ) : (
              <ChevronDown className="w-4 h-4" style={{ color: 'var(--text-sub)' }} />
            )}
          </button>

          {openSections.sr && (
            <div className="p-4 pt-2 border-t space-y-4" style={{ borderColor: 'var(--border-soft)' }}>
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold">Активация GPU Super Resolution</span>
                <button
                  type="button"
                  onClick={() => onToggleUpscaleEnabled(!upscaleEnabled)}
                  className="px-3.5 py-1 rounded-full text-xs font-bold cursor-pointer"
                  style={{
                    background: upscaleEnabled ? 'var(--accent-bg)' : 'var(--surface-pill)',
                    color: upscaleEnabled ? 'var(--accent-text)' : 'var(--text-sub)'
                  }}
                >
                  {upscaleEnabled ? 'ON' : 'OFF'}
                </button>
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                {(
                  [
                    { id: 'gsr', label: 'Snapdragon GSR' },
                    { id: 'fsr', label: 'AMD FSR 1.0' },
                    { id: 'anime4k', label: 'Anime4K CNN' },
                    { id: 'cinema', label: 'Cinema Lanczos' }
                  ] as const
                ).map((m) => (
                  <button
                    key={m.id}
                    type="button"
                    onClick={() => {
                      onChangeUpscaleMode(m.id);
                      if (!upscaleEnabled) onToggleUpscaleEnabled(true);
                    }}
                    className={`py-2 px-2.5 rounded-xl text-xs font-semibold cursor-pointer ${
                      upscaleMode === m.id && upscaleEnabled ? 'rex-seg-btn active' : 'rex-seg-btn'
                    }`}
                  >
                    {m.label}
                  </button>
                ))}
              </div>

              <div className="grid grid-cols-4 gap-2">
                {(['auto', 1.5, 2.0, 4.0] as const).map((f) => (
                  <button
                    key={String(f)}
                    type="button"
                    onClick={() => {
                      onChangeUpscaleFactor(f);
                      if (!upscaleEnabled) onToggleUpscaleEnabled(true);
                    }}
                    className={`py-2 rounded-xl text-xs font-semibold cursor-pointer ${
                      upscaleFactor === f && upscaleEnabled ? 'rex-seg-btn active' : 'rex-seg-btn'
                    }`}
                  >
                    {f === 'auto' ? `Auto (${effectiveUpscaleFactor}x)` : `${f}x`}
                  </button>
                ))}
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="space-y-1">
                  <div className="flex justify-between text-xs">
                    <span style={{ color: 'var(--text-sub)' }}>CAS Sharpness</span>
                    <span className="font-mono font-bold">
                      {Math.round(upscaleSharpness * 100)}%
                    </span>
                  </div>
                  <input
                    type="range"
                    min={0.1}
                    max={1.4}
                    step={0.05}
                    value={upscaleSharpness}
                    onChange={(e) => onChangeUpscaleSharpness(parseFloat(e.target.value))}
                    className="rex-slider"
                  />
                </div>

                <div className="space-y-1">
                  <div className="flex justify-between text-xs">
                    <span style={{ color: 'var(--text-sub)' }}>Temporal Denoise</span>
                    <span className="font-mono font-bold">
                      {Math.round(upscaleDenoise * 100)}%
                    </span>
                  </div>
                  <input
                    type="range"
                    min={0}
                    max={1}
                    step={0.05}
                    value={upscaleDenoise}
                    onChange={(e) => onChangeUpscaleDenoise(parseFloat(e.target.value))}
                    className="rex-slider"
                  />
                </div>
              </div>

              <button
                type="button"
                onClick={onApplyMaxQualityPreset}
                className="w-full py-2.5 px-4 rounded-xl text-xs font-semibold transition cursor-pointer"
                style={{
                  background: 'var(--accent-bg)',
                  color: 'var(--accent-text)'
                }}
              >
                Применить эталонный пресет «Максимум без артефактов»
              </button>
            </div>
          )}
        </div>

        {/* ============================================================
            SECTION E: HDR10, 3D LUT & Color Grading
        ============================================================ */}
        <div
          className="rounded-2xl overflow-hidden"
          style={{ background: 'var(--surface-card)', border: '1px solid var(--border-soft)' }}
        >
          <button
            type="button"
            onClick={() => toggleSection('hdr')}
            className="w-full p-4 flex items-center justify-between text-left transition cursor-pointer"
          >
            <div className="flex items-center gap-3">
              <div
                className="w-9 h-9 rounded-xl flex items-center justify-center"
                style={{ background: 'var(--surface-pill)', border: '1px solid var(--border-soft)', color: 'var(--text-main)' }}
              >
                <Sun className="w-4 h-4" />
              </div>
              <div>
                <div className="text-sm font-bold">HDR10, 3D LUT & Цветокоррекция</div>
                <div className="text-xs" style={{ color: 'var(--text-sub)' }}>
                  ACES Tone Mapping • Adaptive Debanding • 3D LUT (.cube) • Экспозиция и цвет
                </div>
              </div>
            </div>
            {openSections.hdr ? (
              <ChevronUp className="w-4 h-4" style={{ color: 'var(--text-sub)' }} />
            ) : (
              <ChevronDown className="w-4 h-4" style={{ color: 'var(--text-sub)' }} />
            )}
          </button>

          {openSections.hdr && (
            <div className="p-4 pt-2 border-t space-y-4" style={{ borderColor: 'var(--border-soft)' }}>
              {/* HDR10 & Debanding */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div
                  className="p-3 rounded-xl space-y-2"
                  style={{ background: 'var(--surface-elevated)', border: '1px solid var(--border-soft)' }}
                >
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-semibold">HDR10 Tone Mapping</span>
                    <button
                      type="button"
                      onClick={() => onToggleHdrEnabled(!hdrEnabled)}
                      className="px-2.5 py-0.5 rounded-full text-[11px] font-bold cursor-pointer"
                      style={{
                        background: hdrEnabled ? 'var(--accent-bg)' : 'var(--surface-pill)',
                        color: hdrEnabled ? 'var(--accent-text)' : 'var(--text-sub)'
                      }}
                    >
                      {hdrEnabled ? `ON (${Math.round(hdrStrength * 100)}%)` : 'OFF'}
                    </button>
                  </div>
                  <input
                    type="range"
                    min={0.3}
                    max={1.5}
                    step={0.05}
                    value={hdrStrength}
                    onChange={(e) => onChangeHdrStrength(parseFloat(e.target.value))}
                    className="rex-slider"
                  />
                </div>

                <div
                  className="p-3 rounded-xl space-y-2"
                  style={{ background: 'var(--surface-elevated)', border: '1px solid var(--border-soft)' }}
                >
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-semibold">Adaptive Debanding</span>
                    <button
                      type="button"
                      onClick={() => onToggleDebandEnabled(!debandEnabled)}
                      className="px-2.5 py-0.5 rounded-full text-[11px] font-bold cursor-pointer"
                      style={{
                        background: debandEnabled ? 'var(--accent-bg)' : 'var(--surface-pill)',
                        color: debandEnabled ? 'var(--accent-text)' : 'var(--text-sub)'
                      }}
                    >
                      {debandEnabled ? `ON (${debandStrength}%)` : 'OFF'}
                    </button>
                  </div>
                  <input
                    type="range"
                    min={10}
                    max={100}
                    step={5}
                    value={debandStrength}
                    onChange={(e) => onChangeDebandStrength(parseInt(e.target.value, 10))}
                    className="rex-slider"
                  />
                </div>
              </div>

              {/* 3D LUT (.cube) */}
              <div
                className="p-3 rounded-xl space-y-2.5"
                style={{ background: 'var(--surface-elevated)', border: '1px solid var(--border-soft)' }}
              >
                <div className="flex items-center justify-between">
                  <div>
                    <div className="text-xs font-semibold">
                      Кинематографический 3D LUT (.cube)
                    </div>
                    <div className="text-[11px]" style={{ color: 'var(--text-sub)' }}>
                      {customLutName}
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={onTriggerUploadLutFile}
                    className="px-2.5 py-1.5 rounded-lg text-xs flex items-center gap-1.5 cursor-pointer"
                    style={{ background: 'var(--surface-pill)', color: 'var(--text-main)' }}
                  >
                    <Upload className="w-3.5 h-3.5" />
                    Загрузить .cube
                  </button>
                </div>

                <div className="grid grid-cols-3 sm:grid-cols-6 gap-1.5">
                  {(
                    [
                      { id: 'off', label: 'Выкл' },
                      { id: 'teal_orange', label: 'Teal & Orange' },
                      { id: 'kodak_2383', label: 'Kodak 2383' },
                      { id: 'anime_vibrant', label: 'Anime' },
                      { id: 'cyberpunk', label: 'Cyberpunk' },
                      { id: 'custom', label: '.CUBE' }
                    ] as const
                  ).map((lp) => (
                    <button
                      key={lp.id}
                      type="button"
                      onClick={() => onChangeLutPreset(lp.id)}
                      className={`py-1.5 px-2 rounded-lg text-[11px] font-semibold cursor-pointer ${
                        lutPreset === lp.id ? 'rex-seg-btn active' : 'rex-seg-btn'
                      }`}
                    >
                      {lp.label}
                    </button>
                  ))}
                </div>

                {lutPreset !== 'off' && (
                  <div className="space-y-1">
                    <div className="flex justify-between text-xs">
                      <span style={{ color: 'var(--text-sub)' }}>Интенсивность 3D LUT</span>
                      <span className="font-mono font-bold">{lutStrength}%</span>
                    </div>
                    <input
                      type="range"
                      min={0}
                      max={100}
                      step={5}
                      value={lutStrength}
                      onChange={(e) => onChangeLutStrength(parseInt(e.target.value, 10))}
                      className="rex-slider"
                    />
                  </div>
                )}
              </div>

              {/* Color Controls */}
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-semibold flex items-center gap-1.5">
                    <Sliders className="w-3.5 h-3.5" />
                    Параметры цвета и экспозиции
                  </span>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => onToggleMonochromeFilter(!monochromeFilter)}
                      className="px-2.5 py-1 rounded-lg text-[11px] font-semibold cursor-pointer"
                      style={{
                        background: monochromeFilter ? 'var(--accent-bg)' : 'var(--surface-pill)',
                        color: monochromeFilter ? 'var(--accent-text)' : 'var(--text-main)'
                      }}
                    >
                      Ч/Б: {monochromeFilter ? 'ON' : 'OFF'}
                    </button>
                    <button
                      type="button"
                      onClick={onResetColorControls}
                      className="px-2.5 py-1 rounded-lg text-[11px] flex items-center gap-1 cursor-pointer"
                      style={{ background: 'var(--surface-pill)', color: 'var(--text-main)' }}
                    >
                      <RotateCcw className="w-3 h-3" />
                      Сброс
                    </button>
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <div className="flex justify-between text-xs">
                      <span style={{ color: 'var(--text-sub)' }}>Яркость</span>
                      <span className="font-mono font-bold">
                        {Math.round(videoBrightness * 100)}%
                      </span>
                    </div>
                    <input
                      type="range"
                      min={0.2}
                      max={1.8}
                      step={0.05}
                      value={videoBrightness}
                      onChange={(e) => onChangeVideoBrightness(parseFloat(e.target.value))}
                      className="rex-slider"
                    />
                  </div>
                  <div>
                    <div className="flex justify-between text-xs">
                      <span style={{ color: 'var(--text-sub)' }}>Контрастность</span>
                      <span className="font-mono font-bold">
                        {Math.round(videoContrast * 100)}%
                      </span>
                    </div>
                    <input
                      type="range"
                      min={0.5}
                      max={1.8}
                      step={0.05}
                      value={videoContrast}
                      onChange={(e) => onChangeVideoContrast(parseFloat(e.target.value))}
                      className="rex-slider"
                    />
                  </div>
                  <div>
                    <div className="flex justify-between text-xs">
                      <span style={{ color: 'var(--text-sub)' }}>Насыщенность</span>
                      <span className="font-mono font-bold">
                        {Math.round(videoSaturation * 100)}%
                      </span>
                    </div>
                    <input
                      type="range"
                      min={0}
                      max={2.0}
                      step={0.05}
                      value={videoSaturation}
                      onChange={(e) => onChangeVideoSaturation(parseFloat(e.target.value))}
                      className="rex-slider"
                    />
                  </div>
                  <div>
                    <div className="flex justify-between text-xs">
                      <span style={{ color: 'var(--text-sub)' }}>Уровень чёрного (OLED Black)</span>
                      <span className="font-mono font-bold">
                        {Math.round(videoBlackPoint * 100)}%
                      </span>
                    </div>
                    <input
                      type="range"
                      min={0}
                      max={0.25}
                      step={0.01}
                      value={videoBlackPoint}
                      onChange={(e) => onChangeVideoBlackPoint(parseFloat(e.target.value))}
                      className="rex-slider"
                    />
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* ============================================================
            SECTION F: Diagnostics & Telemetry
        ============================================================ */}
        <div
          className="rounded-2xl overflow-hidden"
          style={{ background: 'var(--surface-card)', border: '1px solid var(--border-soft)' }}
        >
          <button
            type="button"
            onClick={() => toggleSection('diagnostics')}
            className="w-full p-4 flex items-center justify-between text-left transition cursor-pointer"
          >
            <div className="flex items-center gap-3">
              <div
                className="w-9 h-9 rounded-xl flex items-center justify-center"
                style={{ background: 'var(--surface-pill)', border: '1px solid var(--border-soft)', color: 'var(--text-main)' }}
              >
                <Activity className="w-4 h-4" />
              </div>
              <div>
                <div className="text-sm font-bold">Diagnostics & Telemetry</div>
                <div className="text-xs" style={{ color: 'var(--text-sub)' }}>
                  Проверка 10 этапов GPU/ONNX • Телеметрия кадров • Экспорт JSON-отчёта
                </div>
              </div>
            </div>
            {openSections.diagnostics ? (
              <ChevronUp className="w-4 h-4" style={{ color: 'var(--text-sub)' }} />
            ) : (
              <ChevronDown className="w-4 h-4" style={{ color: 'var(--text-sub)' }} />
            )}
          </button>

          {openSections.diagnostics && (
            <div className="p-4 pt-2 border-t space-y-4" style={{ borderColor: 'var(--border-soft)' }}>
              {/* Live Metrics Summary */}
              <div className="grid grid-cols-2 sm:grid-cols-5 gap-2 text-xs">
                <div
                  className="p-2.5 rounded-xl"
                  style={{ background: 'var(--surface-elevated)', border: '1px solid var(--border-soft)' }}
                >
                  <div style={{ color: 'var(--text-sub)' }}>Исходный FPS</div>
                  <div className="text-sm font-bold font-mono">{liveStats.originalFps}</div>
                </div>
                <div
                  className="p-2.5 rounded-xl"
                  style={{ background: 'var(--surface-elevated)', border: '1px solid var(--border-soft)' }}
                >
                  <div style={{ color: 'var(--text-sub)' }}>Выходной FPS</div>
                  <div className="text-sm font-bold font-mono">{liveStats.actualRenderFps}</div>
                </div>
                <div
                  className="p-2.5 rounded-xl"
                  style={{ background: 'var(--surface-elevated)', border: '1px solid var(--border-soft)' }}
                >
                  <div style={{ color: 'var(--text-sub)' }}>Инференс RIFE</div>
                  <div className="text-sm font-bold font-mono">
                    {liveStats.inferenceTimeMs.toFixed(2)} ms
                  </div>
                </div>
                <div
                  className="p-2.5 rounded-xl"
                  style={{ background: 'var(--surface-elevated)', border: '1px solid var(--border-soft)' }}
                >
                  <div style={{ color: 'var(--text-sub)' }}>Разрешение AI</div>
                  <div className="text-sm font-bold font-mono">
                    {liveStats.processingResolution}
                  </div>
                </div>
                <div
                  className="p-2.5 rounded-xl"
                  style={{ background: 'var(--surface-elevated)', border: '1px solid var(--border-soft)' }}
                >
                  <div style={{ color: 'var(--text-sub)' }}>Пропуски</div>
                  <div className="text-sm font-bold font-mono">{liveStats.droppedFrames}</div>
                </div>
              </div>

              {/* Action Buttons */}
              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  disabled={isRunningDiagnostics}
                  onClick={onRunDiagnostics}
                  className="px-4 py-2 rounded-xl text-xs font-bold flex items-center gap-2 cursor-pointer"
                  style={{ background: 'var(--accent-bg)', color: 'var(--accent-text)' }}
                >
                  <Play className="w-3.5 h-3.5" />
                  {isRunningDiagnostics ? 'Выполняется тест...' : 'Run Diagnostics (10 этапов)'}
                </button>

                <button
                  type="button"
                  onClick={onExportDiagnosticsJson}
                  className="px-4 py-2 rounded-xl text-xs font-semibold flex items-center gap-2 cursor-pointer"
                  style={{ background: 'var(--surface-pill)', color: 'var(--text-main)' }}
                >
                  <Download className="w-3.5 h-3.5" />
                  Экспорт JSON-отчёта
                </button>
              </div>

              {/* 10-Stage Checklist */}
              {diagnosticStages.length > 0 && (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5 text-[11px]">
                  {diagnosticStages.map((st) => (
                    <div
                      key={st.step}
                      className="p-2.5 rounded-lg flex items-start gap-2"
                      style={{ background: 'var(--surface-elevated)', border: '1px solid var(--border-soft)' }}
                    >
                      {st.status === 'passed' ? (
                        <CheckCircle2 className="w-3.5 h-3.5 shrink-0 mt-0.5" />
                      ) : (
                        <AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-0.5 opacity-70" />
                      )}
                      <div className="min-w-0 flex-1">
                        <div className="font-semibold truncate">
                          {st.step}. {st.name} ({st.durationMs.toFixed(1)} ms)
                        </div>
                        <div className="truncate" style={{ color: 'var(--text-sub)' }}>
                          {st.detail}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
