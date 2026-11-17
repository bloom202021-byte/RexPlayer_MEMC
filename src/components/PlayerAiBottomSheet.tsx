import React, { useState } from 'react';
import {
  Sparkles,
  X,
  Zap,
  Cpu,
  Sliders,
  ChevronDown,
  ChevronUp,
  Settings2,
  Sun,
  Layers,
  Gauge
} from 'lucide-react';
import type { RifeEngineMode } from '../ai/rifeOnnxEngine';

export type UnifiedAiProfileId = 'auto' | 'performance' | 'balanced' | 'quality' | 'anime';

export interface PlayerAiBottomSheetProps {
  open: boolean;
  onClose: () => void;
  onOpenExpertSettings: () => void;

  // AI Frame Interpolation
  interpEnabled: boolean;
  onToggleInterpEnabled: (enabled: boolean) => void;
  interpMode: 'rife' | 'optical' | 'blend' | 'off';
  onChangeInterpMode: (mode: 'rife' | 'optical' | 'blend' | 'off') => void;
  rifeEngineMode: RifeEngineMode;
  onChangeRifeEngineMode: (mode: RifeEngineMode) => void;
  subframeCascadeEnabled: boolean;
  onChangeSubframeCascadeEnabled: (enabled: boolean) => void;
  subframeCascadeMode: 'auto' | '2x' | '3x' | '4x';
  onChangeSubframeCascadeMode: (mode: 'auto' | '2x' | '3x' | '4x') => void;

  // Target FPS (strictly valid values: 'auto' | 60 | 90 | 120 | 144)
  targetFps: 'auto' | 60 | 90 | 120 | 144;
  onChangeTargetFps: (fps: 'auto' | 60 | 90 | 120 | 144) => void;
  effectiveTargetFps: number;
  detectedDisplayHz: number;

  // AI Super Resolution
  upscaleEnabled: boolean;
  onToggleUpscaleEnabled: (enabled: boolean) => void;
  upscaleFactor: 'auto' | 1.5 | 2.0 | 4.0;
  onChangeUpscaleFactor: (factor: 'auto' | 1.5 | 2.0 | 4.0) => void;
  upscaleMode: 'gsr' | 'fsr' | 'anime4k' | 'cinema';
  onChangeUpscaleMode: (mode: 'gsr' | 'fsr' | 'anime4k' | 'cinema') => void;

  // Image Enhancement (Collapsible) — exact App.tsx state units
  upscaleSharpness: number; // 0.1 .. 1.4
  onChangeUpscaleSharpness: (val: number) => void;
  upscaleDenoise: number; // 0.0 .. 1.0
  onChangeUpscaleDenoise: (val: number) => void;
  debandEnabled: boolean;
  onToggleDebandEnabled: (enabled: boolean) => void;
  debandStrength: number; // 10 .. 100
  onChangeDebandStrength: (val: number) => void;
  hdrEnabled: boolean;
  onToggleHdrEnabled: (enabled: boolean) => void;
  hdrStrength: number; // 0.3 .. 1.5
  onChangeHdrStrength: (val: number) => void;

  // Unified Profile
  activeProfile: UnifiedAiProfileId;
  onApplyUnifiedProfile: (profile: UnifiedAiProfileId) => void;
}

export const PlayerAiBottomSheet: React.FC<PlayerAiBottomSheetProps> = ({
  open,
  onClose,
  onOpenExpertSettings,
  interpEnabled,
  onToggleInterpEnabled,
  interpMode,
  onChangeInterpMode,
  rifeEngineMode,
  onChangeRifeEngineMode,
  subframeCascadeEnabled,
  onChangeSubframeCascadeEnabled,
  onChangeSubframeCascadeMode,
  targetFps,
  onChangeTargetFps,
  effectiveTargetFps,
  detectedDisplayHz,
  upscaleEnabled,
  onToggleUpscaleEnabled,
  upscaleFactor,
  onChangeUpscaleFactor,
  upscaleMode,
  onChangeUpscaleMode,
  upscaleSharpness,
  onChangeUpscaleSharpness,
  upscaleDenoise,
  onChangeUpscaleDenoise,
  debandEnabled,
  onToggleDebandEnabled,
  debandStrength,
  onChangeDebandStrength,
  hdrEnabled,
  onToggleHdrEnabled,
  hdrStrength,
  onChangeHdrStrength,
  activeProfile,
  onApplyUnifiedProfile
}) => {
  const [imageEnhanceOpen, setImageEnhanceOpen] = useState(false);

  if (!open) return null;

  // Determine active simplified interpolation mode pill
  const currentInterpSelection: 'auto' | 'rife' | 'memc' | 'hybrid' =
    interpMode === 'optical'
      ? 'memc'
      : rifeEngineMode === 'onnx_runtime_rife'
        ? 'rife'
        : subframeCascadeEnabled
          ? 'hybrid'
          : 'auto';

  const handleSelectSimpleInterpMode = (sel: 'auto' | 'rife' | 'memc' | 'hybrid') => {
    if (!interpEnabled) {
      onToggleInterpEnabled(true);
    }
    if (sel === 'auto') {
      onChangeInterpMode('rife');
      onChangeRifeEngineMode('hybrid_webgpu_ifnet');
      onChangeSubframeCascadeEnabled(false);
      onChangeSubframeCascadeMode('auto');
    } else if (sel === 'rife') {
      onChangeInterpMode('rife');
      onChangeRifeEngineMode('onnx_runtime_rife');
    } else if (sel === 'memc') {
      onChangeInterpMode('optical');
    } else if (sel === 'hybrid') {
      onChangeInterpMode('rife');
      onChangeRifeEngineMode('hybrid_webgpu_ifnet');
      onChangeSubframeCascadeEnabled(true);
      onChangeSubframeCascadeMode('3x');
    }
  };

  const validTargetFpsOptions: Array<{ label: string; value: 'auto' | 60 | 90 | 120 | 144 }> = [
    { label: 'Auto', value: 'auto' },
    { label: '60 FPS', value: 60 },
    { label: '90 FPS', value: 90 },
    { label: '120 FPS', value: 120 },
    { label: '144 FPS', value: 144 }
  ];

  const activeFpsBadge =
    !interpEnabled || interpMode === 'off'
      ? 'Выкл'
      : targetFps === 'auto'
        ? `Auto (${effectiveTargetFps} FPS)`
        : `${targetFps} FPS`;

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/75 backdrop-blur-sm animate-fade-in"
      onClick={onClose}
    >
      <div
        className="w-full max-w-xl max-h-[85vh] overflow-y-auto rounded-t-3xl bg-[#0c0c0c] border-t border-white/15 text-white shadow-2xl p-5 pb-7 space-y-4"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Drag Handle */}
        <div className="w-10 h-1.5 rounded-full bg-white/25 mx-auto -mt-1 mb-1" />

        {/* Sheet Header */}
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-white text-black flex items-center justify-center shadow-lg">
              <Sparkles className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-base font-bold tracking-tight text-white">AI Enhancement</h3>
                <span className="px-2 py-0.5 rounded-full text-[11px] font-semibold bg-white/12 text-white border border-white/25">
                  {activeFpsBadge}
                </span>
              </div>
              <p className="text-xs text-neutral-400">
                Управление плавностью кадров и AI-апскейлом в реальном времени
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="w-9 h-9 rounded-full bg-white/10 hover:bg-white/20 flex items-center justify-center text-neutral-200 transition cursor-pointer"
            aria-label="Закрыть панель AI Enhancement"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* 1. Unified Processing Profiles */}
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold uppercase tracking-wider text-neutral-400 flex items-center gap-1.5">
              <Gauge className="w-3.5 h-3.5 text-white" />
              Профиль обработки
            </span>
            <span className="text-[11px] text-neutral-400">Быстрый пресет</span>
          </div>
          <div className="grid grid-cols-5 gap-1.5">
            {(
              [
                { id: 'auto', label: 'Auto' },
                { id: 'performance', label: 'Performance' },
                { id: 'balanced', label: 'Balanced' },
                { id: 'quality', label: 'Quality' },
                { id: 'anime', label: 'Anime' }
              ] as Array<{ id: UnifiedAiProfileId; label: string }>
            ).map((prof) => {
              const isSelected = activeProfile === prof.id;
              return (
                <button
                  key={prof.id}
                  type="button"
                  onClick={() => onApplyUnifiedProfile(prof.id)}
                  className={`py-2 px-1.5 rounded-xl text-xs font-semibold transition border cursor-pointer ${
                    isSelected
                      ? 'bg-white text-black border-white shadow-sm'
                      : 'bg-[#171717] text-neutral-300 border-white/10 hover:bg-white/10'
                  }`}
                >
                  {prof.label}
                </button>
              );
            })}
          </div>
        </div>

        {/* 2. AI Frame Interpolation */}
        <div className="rounded-2xl bg-[#141414] border border-white/10 p-4 space-y-3.5">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              <Zap className="w-4 h-4 text-white" />
              <div>
                <div className="text-sm font-semibold text-white">AI Frame Interpolation</div>
                <div className="text-[11px] text-neutral-400">
                  Генерация промежуточных кадров (экран {detectedDisplayHz} Гц)
                </div>
              </div>
            </div>
            <button
              type="button"
              onClick={() => onToggleInterpEnabled(!(interpEnabled && interpMode !== 'off'))}
              className={`px-3.5 py-1.5 rounded-full text-xs font-bold transition cursor-pointer ${
                interpEnabled && interpMode !== 'off'
                  ? 'bg-white text-black shadow-sm'
                  : 'bg-white/10 text-neutral-400'
              }`}
            >
              {interpEnabled && interpMode !== 'off' ? 'ON' : 'OFF'}
            </button>
          </div>

          {/* Mode Selector: Auto | RIFE 4.15 | MEMC Optical Flow | Hybrid */}
          <div className="space-y-1.5">
            <div className="text-[11px] font-medium text-neutral-400">Режим интерполяции</div>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-1.5">
              {(
                [
                  { id: 'auto', label: 'Auto' },
                  { id: 'rife', label: 'RIFE 4.15' },
                  { id: 'memc', label: 'MEMC Flow' },
                  { id: 'hybrid', label: 'Hybrid' }
                ] as const
              ).map((item) => {
                const active =
                  interpEnabled && interpMode !== 'off' && currentInterpSelection === item.id;
                return (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => handleSelectSimpleInterpMode(item.id)}
                    className={`py-2 px-2.5 rounded-xl text-xs font-semibold transition border cursor-pointer ${
                      active
                        ? 'bg-white text-black border-white'
                        : 'bg-[#0c0c0c] text-neutral-300 border-white/10 hover:bg-white/10'
                    }`}
                  >
                    {item.label}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Target FPS: Auto | 60 FPS | 90 FPS | 120 FPS | 144 FPS */}
          <div className="space-y-1.5">
            <div className="flex items-center justify-between text-[11px] text-neutral-400">
              <span>Целевая частота кадров (Target FPS)</span>
              <span className="text-white font-semibold">{activeFpsBadge}</span>
            </div>
            <div className="grid grid-cols-5 gap-1.5">
              {validTargetFpsOptions.map((opt) => {
                const isSelected = targetFps === opt.value;
                return (
                  <button
                    key={opt.label}
                    type="button"
                    onClick={() => {
                      if (!interpEnabled || interpMode === 'off') {
                        onToggleInterpEnabled(true);
                      }
                      onChangeTargetFps(opt.value);
                    }}
                    className={`py-2 px-1.5 rounded-xl text-xs font-semibold transition border cursor-pointer ${
                      isSelected
                        ? 'bg-white text-black border-white'
                        : 'bg-[#0c0c0c] text-neutral-300 border-white/10 hover:bg-white/10'
                    }`}
                  >
                    {opt.label}
                  </button>
                );
              })}
            </div>
          </div>
        </div>

        {/* 3. AI Super Resolution */}
        <div className="rounded-2xl bg-[#141414] border border-white/10 p-4 space-y-3.5">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              <Layers className="w-4 h-4 text-white" />
              <div>
                <div className="text-sm font-semibold text-white">AI Super Resolution</div>
                <div className="text-[11px] text-neutral-400">
                  Повышение чёткости и масштабирование разрешения
                </div>
              </div>
            </div>
            <button
              type="button"
              onClick={() => onToggleUpscaleEnabled(!upscaleEnabled)}
              className={`px-3.5 py-1.5 rounded-full text-xs font-bold transition cursor-pointer ${
                upscaleEnabled
                  ? 'bg-white text-black shadow-sm'
                  : 'bg-white/10 text-neutral-400'
              }`}
            >
              {upscaleEnabled ? 'ON' : 'OFF'}
            </button>
          </div>

          {/* Target Resolution: Auto | FHD | QHD | 4K */}
          <div className="space-y-1.5">
            <div className="text-[11px] font-medium text-neutral-400">Целевое разрешение</div>
            <div className="grid grid-cols-4 gap-1.5">
              {(
                [
                  { factor: 'auto', label: 'Auto' },
                  { factor: 1.5, label: 'FHD' },
                  { factor: 2.0, label: 'QHD' },
                  { factor: 4.0, label: '4K' }
                ] as const
              ).map((item) => {
                const active = upscaleEnabled && upscaleFactor === item.factor;
                return (
                  <button
                    key={String(item.factor)}
                    type="button"
                    onClick={() => {
                      if (!upscaleEnabled) onToggleUpscaleEnabled(true);
                      onChangeUpscaleFactor(item.factor);
                    }}
                    className={`py-2 px-2 rounded-xl text-xs font-semibold transition border cursor-pointer ${
                      active
                        ? 'bg-white text-black border-white'
                        : 'bg-[#0c0c0c] text-neutral-300 border-white/10 hover:bg-white/10'
                    }`}
                  >
                    {item.label}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Mode: Balanced | Performance | Quality | Anime */}
          <div className="space-y-1.5">
            <div className="text-[11px] font-medium text-neutral-400">Режим масштабирования</div>
            <div className="grid grid-cols-4 gap-1.5">
              {(
                [
                  { mode: 'gsr', label: 'Balanced' },
                  { mode: 'fsr', label: 'Performance' },
                  { mode: 'cinema', label: 'Quality' },
                  { mode: 'anime4k', label: 'Anime' }
                ] as const
              ).map((item) => {
                const active = upscaleEnabled && upscaleMode === item.mode;
                return (
                  <button
                    key={item.mode}
                    type="button"
                    onClick={() => {
                      if (!upscaleEnabled) onToggleUpscaleEnabled(true);
                      onChangeUpscaleMode(item.mode);
                    }}
                    className={`py-2 px-2 rounded-xl text-xs font-semibold transition border cursor-pointer ${
                      active
                        ? 'bg-white text-black border-white'
                        : 'bg-[#0c0c0c] text-neutral-300 border-white/10 hover:bg-white/10'
                    }`}
                  >
                    {item.label}
                  </button>
                );
              })}
            </div>
          </div>
        </div>

        {/* 4. Collapsible Image Enhancement (Sharpness, Denoise, Deblocking, HDR Tone Mapping) */}
        <div className="rounded-2xl bg-[#141414] border border-white/10 overflow-hidden">
          <button
            type="button"
            onClick={() => setImageEnhanceOpen((prev) => !prev)}
            className="w-full flex items-center justify-between p-4 text-left hover:bg-white/5 transition cursor-pointer"
          >
            <div className="flex items-center gap-2.5">
              <Sliders className="w-4 h-4 text-white" />
              <div>
                <div className="text-sm font-semibold text-white">
                  Дополнительная обработка изображения
                </div>
                <div className="text-[11px] text-neutral-400">
                  Sharpness • Denoise • Deblocking • HDR Tone Mapping
                </div>
              </div>
            </div>
            {imageEnhanceOpen ? (
              <ChevronUp className="w-4 h-4 text-neutral-400" />
            ) : (
              <ChevronDown className="w-4 h-4 text-neutral-400" />
            )}
          </button>

          {imageEnhanceOpen && (
            <div className="px-4 pb-4 pt-2 space-y-3.5 border-t border-white/10">
              {/* Sharpness (0.1 .. 1.4) */}
              <div className="space-y-1">
                <div className="flex justify-between text-xs">
                  <span className="text-neutral-300">Резкость (Sharpness)</span>
                  <span className="font-mono text-white">
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
                  className="w-full accent-white"
                />
              </div>

              {/* Denoise (0.0 .. 1.0) */}
              <div className="space-y-1">
                <div className="flex justify-between text-xs">
                  <span className="text-neutral-300">Шумоподавление (Denoise)</span>
                  <span className="font-mono text-white">
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
                  className="w-full accent-white"
                />
              </div>

              {/* Deblocking / Debanding (10 .. 100) */}
              <div className="space-y-1.5 pt-1">
                <div className="flex items-center justify-between">
                  <span className="text-xs text-neutral-300">Устранение бандинга (Deblocking)</span>
                  <button
                    type="button"
                    onClick={() => onToggleDebandEnabled(!debandEnabled)}
                    className={`px-2.5 py-0.5 rounded-full text-[11px] font-semibold cursor-pointer ${
                      debandEnabled
                        ? 'bg-white text-black'
                        : 'bg-white/10 text-neutral-400'
                    }`}
                  >
                    {debandEnabled ? `ON (${debandStrength}%)` : 'OFF'}
                  </button>
                </div>
                {debandEnabled && (
                  <input
                    type="range"
                    min={10}
                    max={100}
                    step={5}
                    value={debandStrength}
                    onChange={(e) => onChangeDebandStrength(parseInt(e.target.value, 10))}
                    className="w-full accent-white"
                  />
                )}
              </div>

              {/* HDR Tone Mapping (0.3 .. 1.5) */}
              <div className="space-y-1.5 pt-1">
                <div className="flex items-center justify-between">
                  <span className="text-xs text-neutral-300 flex items-center gap-1.5">
                    <Sun className="w-3.5 h-3.5 text-white" />
                    HDR10 Tone Mapping
                  </span>
                  <button
                    type="button"
                    onClick={() => onToggleHdrEnabled(!hdrEnabled)}
                    className={`px-2.5 py-0.5 rounded-full text-[11px] font-semibold cursor-pointer ${
                      hdrEnabled
                        ? 'bg-white text-black'
                        : 'bg-white/10 text-neutral-400'
                    }`}
                  >
                    {hdrEnabled ? `ON (${Math.round(hdrStrength * 100)}%)` : 'OFF'}
                  </button>
                </div>
                {hdrEnabled && (
                  <input
                    type="range"
                    min={0.3}
                    max={1.5}
                    step={0.05}
                    value={hdrStrength}
                    onChange={(e) => onChangeHdrStrength(parseFloat(e.target.value))}
                    className="w-full accent-white"
                  />
                )}
              </div>
            </div>
          )}
        </div>

        {/* 5. Open Dedicated Expert Settings Screen */}
        <button
          type="button"
          onClick={() => {
            onClose();
            onOpenExpertSettings();
          }}
          className="w-full py-3 px-4 rounded-2xl bg-[#181818] hover:bg-[#222222] border border-white/15 flex items-center justify-between text-xs font-semibold text-neutral-100 transition cursor-pointer"
        >
          <span className="flex items-center gap-2">
            <Cpu className="w-4 h-4 text-white" />
            Экспертные настройки (RIFE 4.x • Adreno • Диагностика)
          </span>
          <Settings2 className="w-4 h-4 text-neutral-400" />
        </button>
      </div>
    </div>
  );
};
