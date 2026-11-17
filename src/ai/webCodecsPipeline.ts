import {
  ActiveComputeBackend,
  EngineStatusIndicator,
  InterpolationMultiplierMode,
  PerformanceProfileMode,
  ProcessingResolutionMode
} from './rifeOnnxEngine';

export interface LivePerformanceStatistics {
  originalFps: number;
  targetFps: number;
  actualRenderFps: number;
  activeMultiplier: 1 | 2 | 3 | 4;
  inferenceTimeMs: number;
  frameLatencyMs: number;
  audioDriftMs: number;
  activeBackend: ActiveComputeBackend;
  processingResolution: string;
  droppedFrames: number;
  webCodecsActive: boolean;
  degradationLevel: 0 | 1 | 2 | 3;
  degradationReason: string;
  engineStatus: EngineStatusIndicator;
}

export interface ResolvedInterpolationPlan {
  originalFps: number;
  multiplier: 1 | 2 | 3 | 4;
  targetFps: number;
  procWidth: number;
  procHeight: number;
  flowCols: number;
  flowRows: number;
  degradationLevel: 0 | 1 | 2 | 3;
  degradationReason: string;
  temporarilyBypassed: boolean;
}

/**
 * Computes canonical target FPS and multiplier according to source FPS (24 -> 48/72/96, 30 -> 60/90/120, 60 -> 120),
 * display refresh rate, and active performance governor cap.
 */
export function resolveCanonicalTargetFps(
  rawSourceFps: number,
  multiplierMode: InterpolationMultiplierMode,
  displayHz: number,
  profile: PerformanceProfileMode,
  autoScalingEnabled: boolean,
  degradationLevel: 0 | 1 | 2 | 3
): { canonicalSourceFps: number; multiplier: 1 | 2 | 3 | 4; targetFps: number } {
  // Snap source FPS to canonical cinema/broadcast cadences when close
  let canonicalSourceFps = Math.max(12, Math.min(120, Math.round(rawSourceFps || 24)));
  if (Math.abs(rawSourceFps - 24) <= 1.6) canonicalSourceFps = 24;
  else if (Math.abs(rawSourceFps - 25) <= 1.2) canonicalSourceFps = 25;
  else if (Math.abs(rawSourceFps - 30) <= 1.8) canonicalSourceFps = 30;
  else if (Math.abs(rawSourceFps - 48) <= 2.0) canonicalSourceFps = 48;
  else if (Math.abs(rawSourceFps - 60) <= 3.0) canonicalSourceFps = 60;

  let desiredMult: 2 | 3 | 4 = 2;
  if (multiplierMode === 'auto') {
    if (canonicalSourceFps >= 50) {
      desiredMult = 2; // 60 -> 120
    } else if (canonicalSourceFps >= 28) {
      // 30 -> 60 / 90 / 120 based on display Hz & profile
      if (displayHz >= 115 && profile === 'quality') desiredMult = 4;
      else if (displayHz >= 88 && profile !== 'performance') desiredMult = 3;
      else desiredMult = 2;
    } else {
      // 24 -> 48 / 72 / 96 based on display Hz & profile
      if (displayHz >= 92 && profile === 'quality') desiredMult = 4;
      else if (displayHz >= 70 && profile !== 'performance') desiredMult = 3;
      else desiredMult = 2;
    }
  } else {
    desiredMult = multiplierMode;
  }

  // Cap 60fps source to 2x (120fps max) per specification (60 -> 120)
  if (canonicalSourceFps >= 50 && desiredMult > 2) {
    desiredMult = 2;
  }

  // Apply automatic degradation step when GPU is overloaded
  let effectiveMult: 1 | 2 | 3 | 4 = desiredMult;
  if (autoScalingEnabled) {
    if (degradationLevel === 3) {
      effectiveMult = 1;
    } else if (degradationLevel === 2) {
      effectiveMult = desiredMult === 4 ? 3 : 2;
    }
  }

  const targetFps = canonicalSourceFps * effectiveMult;
  return {
    canonicalSourceFps,
    multiplier: effectiveMult,
    targetFps
  };
}

/**
 * Resolves processing resolution and optical flow grid dimensions optimized for Qualcomm Adreno tile GMEM cache.
 */
export function resolveProcessingDimensions(
  sourceW: number,
  sourceH: number,
  resMode: ProcessingResolutionMode,
  profile: PerformanceProfileMode,
  autoScalingEnabled: boolean,
  degradationLevel: 0 | 1 | 2 | 3,
  isAdreno: boolean
): { procWidth: number; procHeight: number; flowCols: number; flowRows: number; label: string } {
  const aspect = sourceW > 0 && sourceH > 0 ? sourceW / sourceH : 16 / 9;

  let baseH = 720;
  if (resMode === '540p') baseH = 540;
  else if (resMode === '720p') baseH = 720;
  else if (resMode === '1080p') baseH = 1080;
  else {
    // 'auto' based on profile & Adreno GMEM budget
    if (profile === 'performance') baseH = 540;
    else if (profile === 'balanced') baseH = 720;
    else baseH = isAdreno ? 720 : 1080;
  }

  // Step down processing resolution when auto-scaling governor detects GPU pressure
  if (autoScalingEnabled && degradationLevel >= 1) {
    if (baseH >= 1080) baseH = 720;
    else if (baseH >= 720) baseH = 540;
    else baseH = 360;
  }

  const clampedH = Math.min(sourceH || baseH, baseH);
  const clampedW = Math.max(320, Math.round((clampedH * aspect) / 8) * 8);

  // Align flow grid dimensions for 8x8 WebGPU workgroups on Adreno
  let flowCols = 256;
  if (profile === 'performance' || clampedH <= 540) {
    flowCols = 160;
  } else if (profile === 'balanced' || clampedH <= 720) {
    flowCols = 256;
  } else {
    flowCols = isAdreno ? 320 : 384;
  }

  if (autoScalingEnabled && degradationLevel >= 1) {
    flowCols = Math.max(128, Math.floor((flowCols * 0.72) / 8) * 8);
  }
  const flowRows = Math.max(72, Math.floor((flowCols / aspect) / 8) * 8);

  return {
    procWidth: clampedW,
    procHeight: clampedH,
    flowCols,
    flowRows,
    label: `${clampedW}×${clampedH}`
  };
}

/**
 * Hardware-accelerated WebCodecs VideoFrame extractor with deterministic GPU memory cleanup.
 * Extracts VideoFrame instances when supported by the browser, and guarantees .close() on every frame
 * so Adreno GPU memory never leaks during playback, seeking, or video switching.
 */
export class WebCodecsFrameExtractor {
  private lastExtractedTimestampUs = -1;
  private extractedFramesCount = 0;
  private activeWebCodecs = false;

  public get isWebCodecsActive(): boolean {
    return this.activeWebCodecs;
  }

  public get totalExtractedFrames(): number {
    return this.extractedFramesCount;
  }

  /**
   * Captures a hardware-backed WebCodecs VideoFrame from HTMLVideoElement when supported,
   * invokes the consumer callback (e.g. WebGPU importExternalTexture / copyExternalImageToTexture),
   * and immediately closes the VideoFrame to prevent VRAM leaks.
   */
  public captureAndConsumeVideoFrame(
    video: HTMLVideoElement,
    consumeFn: (frameSource: HTMLVideoElement, timestampUs: number, usedWebCodecs: boolean) => void
  ): boolean {
    const VideoFrameCtor = (
      window as unknown as {
        VideoFrame?: new (source: HTMLVideoElement) => {
          timestamp: number;
          codedWidth: number;
          codedHeight: number;
          close: () => void;
        };
      }
    ).VideoFrame;

    if (typeof VideoFrameCtor === 'function' && video.readyState >= 2) {
      let frame: {
        timestamp: number;
        codedWidth: number;
        codedHeight: number;
        close: () => void;
      } | null = null;
      try {
        frame = new VideoFrameCtor(video);
        const tsUs = typeof frame.timestamp === 'number' ? frame.timestamp : Math.round(video.currentTime * 1e6);
        this.lastExtractedTimestampUs = tsUs;
        this.extractedFramesCount += 1;
        this.activeWebCodecs = true;
        consumeFn(video, tsUs, true);
        return true;
      } catch {
        this.activeWebCodecs = false;
      } finally {
        if (frame) {
          try {
            frame.close();
          } catch {
            // Ignore close errors
          }
        }
      }
    }

    this.activeWebCodecs = false;
    const fallbackTsUs = Math.round((video.currentTime || 0) * 1e6);
    this.lastExtractedTimestampUs = fallbackTsUs;
    consumeFn(video, fallbackTsUs, false);
    return false;
  }

  public reset(): void {
    this.lastExtractedTimestampUs = -1;
    this.activeWebCodecs = false;
  }
}

/**
 * Automatic Performance & Audio Synchronization Governor for Qualcomm Adreno GPUs.
 * Monitors frame latency, inference time, and audio/video PTS drift, automatically scaling
 * down resolution, multiplier, or temporarily bypassing interpolation if the device cannot keep up.
 */
export class AdrenoPerformanceGovernor {
  private degradationLevel: 0 | 1 | 2 | 3 = 0;
  private degradationReason = 'Полная производительность';
  private overloadCounter = 0;
  private recoveryCounter = 0;
  private droppedFramesTotal = 0;
  private lastAudioSyncPerfMs = 0;
  private smoothedInferenceMs = 1.8;
  private smoothedFrameLatencyMs = 8.0;
  private smoothedAudioDriftMs = 0.0;

  public reset(): void {
    this.degradationLevel = 0;
    this.degradationReason = 'Полная производительность';
    this.overloadCounter = 0;
    this.recoveryCounter = 0;
    this.droppedFramesTotal = 0;
    this.smoothedAudioDriftMs = 0;
  }

  public recordDroppedFrame(count: number = 1): void {
    this.droppedFramesTotal += count;
  }

  public updateMetrics(
    inferenceMs: number,
    frameLatencyMs: number,
    targetFps: number,
    audioDriftMs: number,
    autoScalingEnabled: boolean
  ): {
    degradationLevel: 0 | 1 | 2 | 3;
    degradationReason: string;
    inferenceTimeMs: number;
    frameLatencyMs: number;
    audioDriftMs: number;
    droppedFrames: number;
  } {
    this.smoothedInferenceMs = this.smoothedInferenceMs * 0.85 + Math.max(0.2, inferenceMs) * 0.15;
    this.smoothedFrameLatencyMs =
      this.smoothedFrameLatencyMs * 0.85 + Math.max(0.5, frameLatencyMs) * 0.15;
    this.smoothedAudioDriftMs = this.smoothedAudioDriftMs * 0.8 + audioDriftMs * 0.2;

    if (!autoScalingEnabled) {
      this.degradationLevel = 0;
      this.degradationReason = 'Ручной режим (авто-снижение выкл.)';
      return {
        degradationLevel: 0,
        degradationReason: this.degradationReason,
        inferenceTimeMs: Number(this.smoothedInferenceMs.toFixed(2)),
        frameLatencyMs: Number(this.smoothedFrameLatencyMs.toFixed(1)),
        audioDriftMs: Number(this.smoothedAudioDriftMs.toFixed(1)),
        droppedFrames: this.droppedFramesTotal
      };
    }

    const budgetMs = 1000.0 / Math.max(24, targetFps);
    const isOverBudget =
      this.smoothedInferenceMs > budgetMs * 0.82 ||
      this.smoothedFrameLatencyMs > budgetMs * 1.35 ||
      Math.abs(this.smoothedAudioDriftMs) > 42;

    if (isOverBudget) {
      this.overloadCounter += 1;
      this.recoveryCounter = 0;
      if (this.overloadCounter >= 18) {
        this.overloadCounter = 0;
        if (Math.abs(this.smoothedAudioDriftMs) > 65) {
          this.degradationLevel = 3;
          this.degradationReason = 'Защита синхронизации аудио (временный байпас RIFE)';
        } else if (this.degradationLevel < 3) {
          this.degradationLevel = (this.degradationLevel + 1) as 0 | 1 | 2 | 3;
          if (this.degradationLevel === 1) {
            this.degradationReason = 'Снижено разрешение потока для удержания FPS';
          } else if (this.degradationLevel === 2) {
            this.degradationReason = 'Снижен множитель интерполяции (защита GPU от перегрузки)';
          } else {
            this.degradationReason = 'Временное отключение интерполяции (перегрузка GPU)';
          }
        }
      }
    } else {
      this.recoveryCounter += 1;
      this.overloadCounter = Math.max(0, this.overloadCounter - 1);
      if (this.degradationLevel > 0 && this.recoveryCounter >= 90) {
        this.recoveryCounter = 0;
        this.degradationLevel = (this.degradationLevel - 1) as 0 | 1 | 2 | 3;
        if (this.degradationLevel === 0) {
          this.degradationReason = 'Полная производительность';
        } else if (this.degradationLevel === 1) {
          this.degradationReason = 'Снижено разрешение потока для удержания FPS';
        } else {
          this.degradationReason = 'Снижен множитель интерполяции';
        }
      }
    }

    return {
      degradationLevel: this.degradationLevel,
      degradationReason: this.degradationReason,
      inferenceTimeMs: Number(this.smoothedInferenceMs.toFixed(2)),
      frameLatencyMs: Number(this.smoothedFrameLatencyMs.toFixed(1)),
      audioDriftMs: Number(this.smoothedAudioDriftMs.toFixed(1)),
      droppedFrames: this.droppedFramesTotal
    };
  }
}
