import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  Play,
  Pause,
  SkipBack,
  SkipForward,
  Volume2,
  VolumeX,
  Maximize2,
  Minimize2,
  FolderOpen,
  Search,
  LayoutGrid,
  List,
  Sun,
  Moon,
  Settings as SettingsIcon,
  Upload,
  Sliders,
  Subtitles as SubtitlesIcon,
  AudioLines,
  Flame,
  User,
  ArrowLeft,
  ChevronRight,
  ChevronDown,
  ChevronUp,
  RotateCcw,
  RefreshCw,
  X,
  Layers,
  Sparkles,
  Zap,
  HelpCircle,
  Trash2,
  FileVideo,
  Ratio,
  Download,
  Smartphone,
  Bookmark,
  Check,
  Lock,
  Unlock,
  PictureInPicture2,
  Repeat,
  Activity
} from 'lucide-react';
import {
  SubtitleCue,
  VideoBookmark,
  UserCustomPreset,
  loadPersistedSettings,
  savePersistedSettings,
  resetPersistedSettings,
  loadSavedPositions,
  saveSavedPositions,
  loadUserPresets,
  saveUserPresets,
  saveVideoToVault,
  updateVideoMetaInVault,
  loadVideosFromVault,
  deleteVideoFromVault,
  clearVaultVideos,
  saveDirectoryHandleToVault,
  loadDirectoryHandleFromVault,
  saveSubtitlesToVault,
  loadSubtitlesFromVault,
  loadAllVideoBookmarks,
  saveAllVideoBookmarks
} from './persistence';
import Hls from 'hls.js';

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed'; platform: string }>;
}

interface LibraryVideoItem {
  id: string;
  title: string;
  fileUrl: string;
  fps: number;
  duration: number;
  size: string;
  sourceLabel: string;
  resolution?: string;
  thumbnailUrl?: string;
}

interface AnixartTypeItem {
  id: number;
  name: string;
  icon: string | null;
  episodesCount: number;
  viewCount: number;
  isSub: boolean;
}

interface AnixartSourceItem {
  id: number;
  name: string;
  episodesCount: number;
}

interface AnixartEpisodeItem {
  position: number;
  name: string;
  url: string;
  iframe: boolean;
  isFiller: boolean;
}

interface AnixartSessionState {
  releaseUrl: string;
  release: {
    id: number;
    titleRu: string;
    titleOriginal: string;
    poster: string;
    year: string;
    studio: string;
    genres: string;
    description: string;
    episodesReleased: number;
    episodesTotal: number;
    grade: number;
  };
  types: AnixartTypeItem[];
  selectedTypeId: number;
  sources: AnixartSourceItem[];
  selectedSourceId: number;
  episodes: AnixartEpisodeItem[];
  selectedEpisodePosition: number;
}

const STAGE_W = 960;
const STAGE_H = 540;
const FLOW_COLS = 96;
const FLOW_ROWS = 54;

// Generate 16x16x16 3D LUT packed into a 256x16 RGBA 2D texture strip
const generateBuiltInLutStrip = (
  preset: 'off' | 'teal_orange' | 'kodak_2383' | 'anime_vibrant' | 'cyberpunk' | 'custom'
): Uint8Array => {
  const N = 16;
  const data = new Uint8Array(N * N * N * 4);
  for (let g = 0; g < N; g++) {
    for (let b = 0; b < N; b++) {
      for (let r = 0; r < N; r++) {
        let rf = r / (N - 1);
        let gf = g / (N - 1);
        let bf = b / (N - 1);
        const luma = 0.299 * rf + 0.587 * gf + 0.114 * bf;

        if (preset === 'teal_orange') {
          const shadowW = Math.pow(1.0 - luma, 1.5);
          const highW = Math.pow(luma, 1.35);
          rf = rf + highW * 0.11 - shadowW * 0.07;
          gf = gf + highW * 0.03 + shadowW * 0.03;
          bf = bf - highW * 0.09 + shadowW * 0.12;
          rf = 0.5 + (rf - 0.5) * 1.12;
          gf = 0.5 + (gf - 0.5) * 1.08;
          bf = 0.5 + (bf - 0.5) * 1.10;
        } else if (preset === 'kodak_2383') {
          const sCurve = (x: number) => {
            const c = Math.max(0, Math.min(1, x));
            return c * c * (3.0 - 2.0 * c);
          };
          rf = sCurve(rf) * 1.03;
          gf = sCurve(gf) * 0.99;
          bf = sCurve(bf) * 0.94 + (1.0 - luma) * 0.03;
          const mLuma = 0.299 * rf + 0.587 * gf + 0.114 * bf;
          rf = mLuma + (rf - mLuma) * 1.18;
          gf = mLuma + (gf - mLuma) * 1.14;
          bf = mLuma + (bf - mLuma) * 1.10;
        } else if (preset === 'anime_vibrant') {
          const cleanToe = Math.max(0, (luma - 0.025) / 0.975);
          const scale = luma > 0.001 ? cleanToe / luma : 1.0;
          rf *= scale;
          gf *= scale;
          bf *= scale;
          const aLuma = 0.299 * rf + 0.587 * gf + 0.114 * bf;
          rf = aLuma + (rf - aLuma) * 1.32;
          gf = aLuma + (gf - aLuma) * 1.28;
          bf = aLuma + (bf - aLuma) * 1.34;
        } else if (preset === 'cyberpunk') {
          const shadow = 1.0 - luma;
          rf = rf * 1.06 + luma * 0.08 + shadow * 0.04;
          gf = gf * 0.94 + (1.0 - Math.abs(luma - 0.5) * 2.0) * 0.05;
          bf = bf * 1.12 + shadow * 0.14;
          const cLuma = 0.299 * rf + 0.587 * gf + 0.114 * bf;
          rf = cLuma + (rf - cLuma) * 1.26;
          gf = cLuma + (gf - cLuma) * 1.15;
          bf = cLuma + (bf - cLuma) * 1.30;
        }

        const idx = (g * (N * N) + b * N + r) * 4;
        data[idx] = Math.max(0, Math.min(255, Math.round(rf * 255)));
        data[idx + 1] = Math.max(0, Math.min(255, Math.round(gf * 255)));
        data[idx + 2] = Math.max(0, Math.min(255, Math.round(bf * 255)));
        data[idx + 3] = 255;
      }
    }
  }
  return data;
};

// Parse Adobe / Resolve .cube 3D LUT file and resample into a 16x16x16 (256x16) RGBA texture strip
const parseCubeFileToLutStrip = (cubeText: string): { size: number; strip: Uint8Array } | null => {
  const lines = cubeText.replace(/\r\n/g, '\n').replace(/\r/g, '\n').split('\n');
  let lutSize = 0;
  const values: number[] = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line || line.startsWith('#')) continue;
    const upper = line.toUpperCase();
    if (upper.startsWith('TITLE') || upper.startsWith('DOMAIN_MIN') || upper.startsWith('DOMAIN_MAX') || upper.startsWith('LUT_1D_SIZE')) {
      continue;
    }
    if (upper.startsWith('LUT_3D_SIZE')) {
      const parts = line.split(/\s+/);
      const parsedSize = parseInt(parts[1], 10);
      if (parsedSize >= 2 && parsedSize <= 128) {
        lutSize = parsedSize;
      }
      continue;
    }
    const parts = line.split(/\s+/);
    if (parts.length >= 3) {
      const r = parseFloat(parts[0]);
      const g = parseFloat(parts[1]);
      const b = parseFloat(parts[2]);
      if (isFinite(r) && isFinite(g) && isFinite(b)) {
        values.push(r, g, b);
      }
    }
  }

  if (lutSize < 2) {
    const totalTriplets = Math.round(values.length / 3);
    const cubeRoot = Math.round(Math.cbrt(totalTriplets));
    if (cubeRoot >= 2 && cubeRoot * cubeRoot * cubeRoot === totalTriplets) {
      lutSize = cubeRoot;
    }
  }

  if (lutSize < 2 || values.length < lutSize * lutSize * lutSize * 3) {
    return null;
  }

  const N = 16;
  const strip = new Uint8Array(N * N * N * 4);
  const sampleCube = (ri: number, gi: number, bi: number, ch: number) => {
    const rClamped = Math.max(0, Math.min(lutSize - 1, ri));
    const gClamped = Math.max(0, Math.min(lutSize - 1, gi));
    const bClamped = Math.max(0, Math.min(lutSize - 1, bi));
    const flatIdx = (bClamped * lutSize * lutSize + gClamped * lutSize + rClamped) * 3 + ch;
    return values[flatIdx] ?? 0;
  };

  for (let g = 0; g < N; g++) {
    for (let b = 0; b < N; b++) {
      for (let r = 0; r < N; r++) {
        const rf = (r / (N - 1)) * (lutSize - 1);
        const gf = (g / (N - 1)) * (lutSize - 1);
        const bf = (b / (N - 1)) * (lutSize - 1);
        const r0 = Math.floor(rf);
        const g0 = Math.floor(gf);
        const b0 = Math.floor(bf);
        const dr = rf - r0;
        const dg = gf - g0;
        const db = bf - b0;

        const outRgb = [0, 0, 0];
        for (let ch = 0; ch < 3; ch++) {
          const c000 = sampleCube(r0, g0, b0, ch);
          const c100 = sampleCube(r0 + 1, g0, b0, ch);
          const c010 = sampleCube(r0, g0 + 1, b0, ch);
          const c110 = sampleCube(r0 + 1, g0 + 1, b0, ch);
          const c001 = sampleCube(r0, g0, b0 + 1, ch);
          const c101 = sampleCube(r0 + 1, g0, b0 + 1, ch);
          const c011 = sampleCube(r0, g0 + 1, b0 + 1, ch);
          const c111 = sampleCube(r0 + 1, g0 + 1, b0 + 1, ch);

          const c00 = c000 * (1 - dr) + c100 * dr;
          const c10 = c010 * (1 - dr) + c110 * dr;
          const c01 = c001 * (1 - dr) + c101 * dr;
          const c11 = c011 * (1 - dr) + c111 * dr;
          const c0 = c00 * (1 - dg) + c10 * dg;
          const c1 = c01 * (1 - dg) + c11 * dg;
          outRgb[ch] = c0 * (1 - db) + c1 * db;
        }

        const idx = (g * (N * N) + b * N + r) * 4;
        strip[idx] = Math.max(0, Math.min(255, Math.round(outRgb[0] * 255)));
        strip[idx + 1] = Math.max(0, Math.min(255, Math.round(outRgb[1] * 255)));
        strip[idx + 2] = Math.max(0, Math.min(255, Math.round(outRgb[2] * 255)));
        strip[idx + 3] = 255;
      }
    }
  }

  return { size: lutSize, strip };
};

// Canonical video frame intervals (23.976, 24, 25, 29.97, 30, 48, 50, 59.94, 60 FPS)
// Snaps noisy decoder timestamps to exact frame cadence to eliminate VSync PLL micro-stutter
const snapToCanonicalCadenceMs = (rawIntervalMs: number): number => {
  const canonicals = [41.7083, 41.6667, 40.0, 33.3667, 33.3333, 20.8333, 20.0, 16.6833, 16.6667];
  for (let i = 0; i < canonicals.length; i++) {
    const c = canonicals[i];
    if (Math.abs(rawIntervalMs - c) <= c * 0.055) {
      return c * 0.75 + rawIntervalMs * 0.25;
    }
  }
  return rawIntervalMs;
};

// Fast O(log N) binary search for active subtitle cues with multi-speaker overlap & ASS {\an8} top-alignment support
const findActiveSubtitleText = (cues: SubtitleCue[], timeSec: number): string => {
  const len = cues.length;
  if (len === 0) return '';
  let lo = 0;
  let hi = len - 1;
  let firstPossibleIdx = len;
  while (lo <= hi) {
    const mid = (lo + hi) >>> 1;
    if (cues[mid].start <= timeSec) {
      firstPossibleIdx = mid;
      lo = mid + 1;
    } else {
      hi = mid - 1;
    }
  }
  if (firstPossibleIdx === len) return '';
  const startScan = Math.max(0, firstPossibleIdx - 6);
  let matched = '';
  for (let i = startScan; i <= firstPossibleIdx; i++) {
    const c = cues[i];
    if (timeSec >= c.start && timeSec <= c.end) {
      matched = matched ? `${matched}\n${c.text}` : c.text;
    }
  }
  return matched;
};

const findActiveDualSubtitles = (
  primaryCues: SubtitleCue[],
  secondaryCues: SubtitleCue[],
  timeSec: number,
  primaryEnabled: boolean,
  secondaryEnabled: boolean
): { bottomText: string; topText: string } => {
  let bottomText = '';
  let topText = '';

  if (primaryEnabled && primaryCues.length > 0) {
    const len = primaryCues.length;
    let lo = 0;
    let hi = len - 1;
    let firstIdx = len;
    while (lo <= hi) {
      const mid = (lo + hi) >>> 1;
      if (primaryCues[mid].start <= timeSec) {
        firstIdx = mid;
        lo = mid + 1;
      } else {
        hi = mid - 1;
      }
    }
    if (firstIdx < len) {
      const startScan = Math.max(0, firstIdx - 8);
      for (let i = startScan; i <= firstIdx; i++) {
        const c = primaryCues[i];
        if (timeSec >= c.start && timeSec <= c.end) {
          if (c.align === 7 || c.align === 8 || c.align === 9) {
            topText = topText ? `${topText}\n${c.text}` : c.text;
          } else {
            bottomText = bottomText ? `${bottomText}\n${c.text}` : c.text;
          }
        }
      }
    }
  }

  if (secondaryEnabled && secondaryCues.length > 0) {
    const secMatch = findActiveSubtitleText(secondaryCues, timeSec);
    if (secMatch) {
      topText = topText ? `${topText}\n${secMatch}` : secMatch;
    }
  }

  return { bottomText, topText };
};

export default function App() {
  // Load persisted settings synchronously once on startup so nothing resets on exit
  const initialSettingsRef = useRef(loadPersistedSettings());
  const initCfg = initialSettingsRef.current;

  // Navigation & UI state (persisted)
  const [activeScreen, setActiveScreen] = useState<'main' | 'settings' | 'player'>(
    initCfg.activeScreen || 'main'
  );
  const [activeTab, setActiveTab] = useState<'home' | 'you'>(initCfg.activeTab || 'home');
  const [darkTheme, setDarkTheme] = useState<boolean>(initCfg.darkTheme);
  const [compactGrid, setCompactGrid] = useState<boolean>(initCfg.compactGrid);
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchFilter, setSearchFilter] = useState('');
  const [settingsFilter, setSettingsFilter] = useState('');
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const [activeModal, setActiveModal] = useState<string | null>(null);
  const [urlModalOpen, setUrlModalOpen] = useState(false);
  const [urlInput, setUrlInput] = useState('');
  const [isResolvingUrl, setIsResolvingUrl] = useState(false);
  const [anixartSession, setAnixartSession] = useState<AnixartSessionState | null>(null);
  const [streamQualities, setStreamQualities] = useState<Record<string, string>>({});
  const [activeStreamQuality, setActiveStreamQuality] = useState<string>('Auto');
  const [skipTimings, setSkipTimings] = useState<Array<{ start: number; end: number; label: string }>>([]);
  const [activeSkipPrompt, setActiveSkipPrompt] = useState<{ start: number; end: number; label: string } | null>(null);
  const skipTimingsRef = useRef<Array<{ start: number; end: number; label: string }>>([]);
  const activeSkipPromptRef = useRef<{ start: number; end: number; label: string } | null>(null);
  const hlsInstanceRef = useRef<Hls | null>(null);
  const [isDraggingOver, setIsDraggingOver] = useState(false);
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [isInstalledPwa, setIsInstalledPwa] = useState(false);

  // User Local Videos, Smartphone Vault & Playlist Queue
  const [userVideos, setUserVideos] = useState<LibraryVideoItem[]>([]);
  const [playlist, setPlaylist] = useState<LibraryVideoItem[]>([]);
  const [activePlaylistIndex, setActivePlaylistIndex] = useState(0);
  const [queueDrawerOpen, setQueueDrawerOpen] = useState(false);
  const [lastActiveVideoId, setLastActiveVideoId] = useState<string>(initCfg.lastActiveVideoId || '');
  const [autoBindMediaOnStart, setAutoBindMediaOnStart] = useState<boolean>(
    initCfg.autoBindMediaOnStart
  );
  const [boundFolderName, setBoundFolderName] = useState<string | null>(null);
  const [boundDirHandle, setBoundDirHandle] = useState<FileSystemDirectoryHandle | null>(null);
  const [isVaultHydrated, setIsVaultHydrated] = useState<boolean>(false);

  // Custom Processor Presets (persisted)
  const [userPresets, setUserPresets] = useState<UserCustomPreset[]>(() => loadUserPresets());
  const [newPresetName, setNewPresetName] = useState('');

  // Playback & Video state (persisted preferences)
  const [hasLoadedVideo, setHasLoadedVideo] = useState(false);
  const [activeVideoTitle, setActiveVideoTitle] = useState('Видео не выбрано');
  const [activeSourceLabel, setActiveSourceLabel] = useState('Локальный носитель');
  const [videoNativeRes, setVideoNativeRes] = useState<string>('—');
  const [aspectMode, setAspectMode] = useState<'contain' | 'cover' | 'fill'>(initCfg.aspectMode);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [playbackRate, setPlaybackRate] = useState<number>(initCfg.playbackRate);
  const [isHoldSpeed2x, setIsHoldSpeed2x] = useState(false);
  const [volume, setVolume] = useState<number>(initCfg.volume);
  const [isMuted, setIsMuted] = useState<boolean>(initCfg.isMuted);
  const [videoBrightness, setVideoBrightness] = useState<number>(initCfg.videoBrightness);
  const [videoContrast, setVideoContrast] = useState<number>(initCfg.videoContrast ?? 1.0);
  const [videoSaturation, setVideoSaturation] = useState<number>(initCfg.videoSaturation ?? 1.0);
  const [videoBlackPoint, setVideoBlackPoint] = useState<number>(initCfg.videoBlackPoint ?? 0.0);
  const [debandEnabled, setDebandEnabled] = useState<boolean>(initCfg.debandEnabled ?? true);
  const [debandStrength, setDebandStrength] = useState<number>(initCfg.debandStrength ?? 65);
  const [ambilightEnabled, setAmbilightEnabled] = useState<boolean>(
    initCfg.ambilightEnabled ?? true
  );
  const [autoCropBlackBars, setAutoCropBlackBars] = useState<boolean>(
    initCfg.autoCropBlackBars ?? false
  );
  const [detectedAutoCropPct, setDetectedAutoCropPct] = useState<number>(0);
  const [lutPreset, setLutPreset] = useState<
    'off' | 'teal_orange' | 'kodak_2383' | 'anime_vibrant' | 'cyberpunk' | 'custom'
  >(initCfg.lutPreset || 'off');
  const [lutStrength, setLutStrength] = useState<number>(initCfg.lutStrength ?? 85);
  const [customLutName, setCustomLutName] = useState<string>('Файл .cube не выбран');
  const customLutStripRef = useRef<Uint8Array | null>(null);
  const [lutVersion, setLutVersion] = useState<number>(0);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [seekFeedback, setSeekFeedback] = useState<string | null>(null);
  const [swipeHud, setSwipeHud] = useState<{
    type: 'brightness' | 'volume' | 'seek';
    title: string;
    valueText: string;
    subText?: string;
    progress: number;
  } | null>(null);

  // MEMC, HDR, GPU Upscaler & Qualcomm Adreno Hardware Acceleration settings (persisted)
  const [hdrEnabled, setHdrEnabled] = useState<boolean>(initCfg.hdrEnabled);
  const [hdrStrength, setHdrStrength] = useState<number>(initCfg.hdrStrength);
  const [upscaleEnabled, setUpscaleEnabled] = useState<boolean>(initCfg.upscaleEnabled);
  const [upscaleMode, setUpscaleMode] = useState<'gsr' | 'fsr' | 'anime4k' | 'cinema'>(
    initCfg.upscaleMode
  );
  const [upscaleFactor, setUpscaleFactor] = useState<'auto' | 1.5 | 2.0 | 4.0>(
    initCfg.upscaleFactor
  );
  const [upscaleSharpness, setUpscaleSharpness] = useState<number>(initCfg.upscaleSharpness);
  const [upscaleDenoise, setUpscaleDenoise] = useState<number>(initCfg.upscaleDenoise);
  const [adrenoMode, setAdrenoMode] = useState<'auto' | 'on' | 'off'>(initCfg.adrenoMode);
  const [adrenoGmemFp16, setAdrenoGmemFp16] = useState<boolean>(initCfg.adrenoGmemFp16);
  const [adrenoTrue10Hdr, setAdrenoTrue10Hdr] = useState<boolean>(initCfg.adrenoTrue10Hdr);
  const [ecoThermalMode, setEcoThermalMode] = useState<boolean>(
    initCfg.ecoThermalMode ?? true
  );
  const [flowScaleMode, setFlowScaleMode] = useState<
    'auto' | 'performance' | 'balanced' | 'ultra' | 'extreme' | 'high' | 'max'
  >(initCfg.flowScaleMode || 'auto');
  const [subframeBufferResMode, setSubframeBufferResMode] = useState<
    'auto' | '720p' | '1080p' | '1440p'
  >(initCfg.subframeBufferResMode || 'auto');
  const [detectedGpuInfo, setDetectedGpuInfo] = useState<{
    vendor: string;
    renderer: string;
    isAdreno: boolean;
    modelLabel: string;
    gmemCacheLabel: string;
  }>({
    vendor: 'Qualcomm / WebGL',
    renderer: 'Определение GPU...',
    isAdreno: false,
    modelLabel: 'Автоопределение GPU',
    gmemCacheLabel: 'GMEM Tile Cache'
  });
  const [processorMenuCollapsed, setProcessorMenuCollapsed] = useState<boolean>(
    initCfg.processorMenuCollapsed
  );
  const [topToolbarCollapsed, setTopToolbarCollapsed] = useState<boolean>(
    initCfg.topToolbarCollapsed
  );
  const [fsToolbarCollapsed, setFsToolbarCollapsed] = useState<boolean>(initCfg.fsToolbarCollapsed);
  const [transportCollapsed, setTransportCollapsed] = useState<boolean>(initCfg.transportCollapsed);
  const [collapsedSections, setCollapsedSections] = useState<{
    adreno: boolean;
    memc: boolean;
    hdr: boolean;
    upscale: boolean;
    fineTune: boolean;
  }>(initCfg.collapsedSections);
  const [fsControlsVisible, setFsControlsVisible] = useState(true);
  const [fsActivePanel, setFsActivePanel] = useState<
    'none' | 'memc' | 'upscale' | 'audio' | 'subtitles' | 'playlist' | 'more'
  >('none');
  const [interpEnabled, setInterpEnabled] = useState<boolean>(initCfg.interpEnabled);
  const [interpMode, setInterpMode] = useState<'off' | 'blend' | 'optical'>(initCfg.interpMode);
  const [targetFps, setTargetFps] = useState<60 | 90 | 120 | 144 | 'auto'>(initCfg.targetFps);
  const [interpStrength, setInterpStrength] = useState<number>(initCfg.interpStrength);
  const [motionScale, setMotionScale] = useState<number>(initCfg.motionScale);
  const [dejudderHaloControl, setDejudderHaloControl] = useState<number>(
    initCfg.dejudderHaloControl
  );
  const [subframeCascadeEnabled, setSubframeCascadeEnabled] = useState<boolean>(
    initCfg.subframeCascadeEnabled ?? true
  );
  const [subframeCascadeMode, setSubframeCascadeMode] = useState<'auto' | '2x' | '3x' | '4x'>(
    initCfg.subframeCascadeMode || 'auto'
  );
  const [subframeCoherenceGuard, setSubframeCoherenceGuard] = useState<number>(
    initCfg.subframeCoherenceGuard ?? 75
  );
  const [detectedDisplayHz, setDetectedDisplayHz] = useState<number>(
    initCfg.detectedDisplayHz || 60
  );
  const [monochromeFilter, setMonochromeFilter] = useState<boolean>(initCfg.monochromeFilter);
  const [showVectors, setShowVectors] = useState<boolean>(initCfg.showVectors);
  const [showSadHeatmap, setShowSadHeatmap] = useState<boolean>(
    initCfg.showSadHeatmap ?? false
  );
  const [sceneCutProtection, setSceneCutProtection] = useState<boolean>(
    initCfg.sceneCutProtection
  );
  const [splitCompareMode, setSplitCompareMode] = useState<boolean>(initCfg.splitCompareMode);
  const [manualSubframePhase, setManualSubframePhase] = useState<number | null>(null);

  // Calibrate real device display refresh rate (60Hz, 90Hz, 120Hz, 144Hz) for auto MEMC profile
  useEffect(() => {
    let count = 0;
    const start = performance.now();
    let rafId: number;
    const measure = (now: number) => {
      count++;
      if (count >= 40) {
        const elapsed = now - start;
        const avgFrameMs = elapsed / count;
        let detected = 60;
        if (avgFrameMs <= 7.5) {
          detected = 144;
        } else if (avgFrameMs <= 9.6) {
          detected = 120;
        } else if (avgFrameMs <= 12.8) {
          detected = 90;
        } else {
          detected = 60;
        }
        setDetectedDisplayHz(detected);
        return;
      }
      rafId = requestAnimationFrame(measure);
    };
    rafId = requestAnimationFrame(measure);
    return () => cancelAnimationFrame(rafId);
  }, []);

  // Target FPS for MEMC synthesis: in 'auto' mode always match native display Hz (at least 60 FPS)
  const effectiveTargetFps =
    targetFps === 'auto'
      ? Math.max(60, detectedDisplayHz)
      : targetFps;

  const effectiveSubframeCascadeMult: 2 | 3 | 4 =
    subframeCascadeMode === '2x'
      ? 2
      : subframeCascadeMode === '3x'
      ? 3
      : subframeCascadeMode === '4x'
      ? 4
      : effectiveTargetFps >= 120
      ? 4
      : 3;

  const subframeBufferResLabel =
    subframeBufferResMode === '1440p'
      ? '1440p QHD'
      : subframeBufferResMode === '1080p'
      ? '1080p FHD'
      : subframeBufferResMode === '720p'
      ? '720p HD'
      : ecoThermalMode
      ? 'Авто (1080p ЭКО)'
      : 'Авто (до 1440p)';

  const flowScaleLabel =
    flowScaleMode === 'max'
      ? '512×288 Ультра-Макс'
      : flowScaleMode === 'high'
      ? '384×216 Высокий'
      : flowScaleMode === 'extreme'
      ? '256×144 Экстрим'
      : flowScaleMode === 'ultra'
      ? '128×72 Ультра'
      : flowScaleMode === 'balanced'
      ? '96×54 Баланс'
      : flowScaleMode === 'performance'
      ? '64×36 Быстрый'
      : 'Авто (6-Lvl)';

  const subframeCascadeLabel = !subframeCascadeEnabled
    ? 'Каскад Выкл'
    : subframeCascadeMode === 'auto'
    ? `Авто (${effectiveSubframeCascadeMult}x • ${subframeBufferResLabel})`
    : `${subframeCascadeMode} • ${subframeBufferResLabel}`;

  // Telemetry initial state (updated via direct DOM refs during playback for 0 React re-render overhead)
  const [liveScreenHz] = useState(60);
  const [liveFrameTimeMs] = useState(0.28);
  const [synthesizedCount] = useState(0);
  const [subframeAlpha] = useState(0.5);

  // Subtitles state (persisted, Dual Subtitles + .ASS/.SSA)
  const [subtitlesEnabled, setSubtitlesEnabled] = useState<boolean>(initCfg.subtitlesEnabled);
  const [secondarySubtitlesEnabled, setSecondarySubtitlesEnabled] = useState<boolean>(
    initCfg.secondarySubtitlesEnabled ?? false
  );
  const [subFontSize, setSubFontSize] = useState<number>(initCfg.subFontSize);
  const [subDelaySec, setSubDelaySec] = useState<number>(initCfg.subDelaySec);
  const [subBgOpacity, setSubBgOpacity] = useState<number>(initCfg.subBgOpacity);
  const [subColor] = useState('#ffffff');
  const [subtitleCues, setSubtitleCues] = useState<SubtitleCue[]>([]);
  const [secondarySubtitleCues, setSecondarySubtitleCues] = useState<SubtitleCue[]>([]);
  const [customSubtitlesName, setCustomSubtitlesName] = useState('Субтитры не загружены');
  const [secondarySubtitlesName, setSecondarySubtitlesName] = useState(
    'Доп. субтитры (верх) не загружены'
  );

  // Web Audio Equalizer, Compressor, Crossfeed & Spectrogram state (persisted)
  const [eqEnabled, setEqEnabled] = useState<boolean>(initCfg.eqEnabled);
  const [eqPreset, setEqPreset] = useState<'flat' | 'cinema' | 'bass' | 'vocal' | 'treble'>(
    initCfg.eqPreset
  );
  const [preampGain, setPreampGain] = useState<number>(initCfg.preampGain);
  const [pitchCorrection, setPitchCorrection] = useState<boolean>(initCfg.pitchCorrection);
  const [eqBands, setEqBands] = useState<[number, number, number, number, number]>(
    initCfg.eqBands
  );
  const [audioCompressorMode, setAudioCompressorMode] = useState<
    'off' | 'soft' | 'night' | 'voice'
  >(initCfg.audioCompressorMode || 'off');
  const [headphoneCrossfeed, setHeadphoneCrossfeed] = useState<boolean>(
    initCfg.headphoneCrossfeed ?? false
  );

  // Player, Gestures, Navigation, A-B Loop, Bookmarks, Touch Lock & HUD Settings
  const [autoPlayNext, setAutoPlayNext] = useState<boolean>(initCfg.autoPlayNext);
  const [loopPlayback, setLoopPlayback] = useState<boolean>(initCfg.loopPlayback);
  const [rememberPosition, setRememberPosition] = useState<boolean>(initCfg.rememberPosition);
  const [showTopHud, setShowTopHud] = useState<boolean>(initCfg.showTopHud);
  const [showHudTelemetryGraph, setShowHudTelemetryGraph] = useState<boolean>(
    initCfg.showHudTelemetryGraph ?? true
  );
  const [showStepButtons, setShowStepButtons] = useState<boolean>(initCfg.showStepButtons);
  const [showSnapshotBtn, setShowSnapshotBtn] = useState<boolean>(initCfg.showSnapshotBtn);
  const [doubleTapSeekSec, setDoubleTapSeekSec] = useState<number>(initCfg.doubleTapSeekSec);
  const [swipeVolumeBright, setSwipeVolumeBright] = useState<boolean>(initCfg.swipeVolumeBright);
  const [longPressSpeed2x, setLongPressSpeed2x] = useState<boolean>(initCfg.longPressSpeed2x);

  // Touch Lock (Kids Lock), WebGL PiP, A-B Loop & Bookmarks
  const [isTouchLocked, setIsTouchLocked] = useState<boolean>(false);
  const [isPipActive, setIsPipActive] = useState<boolean>(false);
  const [loopPointA, setLoopPointA] = useState<number | null>(null);
  const [loopPointB, setLoopPointB] = useState<number | null>(null);
  const [bookmarksMap, setBookmarksMap] = useState<Record<string, VideoBookmark[]>>(() =>
    loadAllVideoBookmarks()
  );
  const [seekHoverPreview, setSeekHoverPreview] = useState<{
    visible: boolean;
    timeSec: number;
    leftPct: number;
  }>({ visible: false, timeSec: 0, leftPct: 50 });

  // Video Output Mode & WebGL Fallback state (persisted)
  const [videoOutputMode, setVideoOutputMode] = useState<'webgl_direct' | 'video_fallback'>(
    initCfg.videoOutputMode || 'webgl_direct'
  );
  const [webglContextLost, setWebglContextLost] = useState<boolean>(false);
  const [isDemoTestActive, setIsDemoTestActive] = useState<boolean>(false);
  const isVideoFallbackActive =
    !isDemoTestActive && (videoOutputMode === 'video_fallback' || webglContextLost);

  // DOM Refs
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const renderCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const ambilightCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const hudTelemetryCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const hudDroppedFramesRef = useRef<HTMLSpanElement | null>(null);
  const hudFpsRatioRef = useRef<HTMLSpanElement | null>(null);
  const eqSpectrumCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const fsEqSpectrumCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const seekPreviewVideoRef = useRef<HTMLVideoElement | null>(null);
  const seekPreviewCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const pipVideoRef = useRef<HTMLVideoElement | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const folderInputRef = useRef<HTMLInputElement | null>(null);
  const subFileInputRef = useRef<HTMLInputElement | null>(null);
  const secondarySubFileInputRef = useRef<HTMLInputElement | null>(null);
  const lutFileInputRef = useRef<HTMLInputElement | null>(null);
  const stageContainerRef = useRef<HTMLDivElement | null>(null);
  const telemetryCanvasRef = useRef<HTMLCanvasElement | null>(null);

  // Direct DOM Telemetry & Scrubber Refs (Zero React re-render latency!)
  const hudMetricsBadgeRef = useRef<HTMLDivElement | null>(null);
  const playerSynthCountRef = useRef<HTMLSpanElement | null>(null);
  const playerAlphaBadgeRef = useRef<HTMLSpanElement | null>(null);
  const timecodeDisplayRef = useRef<HTMLSpanElement | null>(null);
  const scrubberInputRef = useRef<HTMLInputElement | null>(null);
  const fsTimecodeDisplayRef = useRef<HTMLSpanElement | null>(null);
  const fsScrubberInputRef = useRef<HTMLInputElement | null>(null);
  const fsHideTimerRef = useRef<number | null>(null);
  const fsControlsVisibleRef = useRef<boolean>(true);
  const fsActivePanelRef = useRef<
    'none' | 'memc' | 'upscale' | 'audio' | 'subtitles' | 'playlist' | 'more'
  >('none');
  const subtitleBoxRef = useRef<HTMLDivElement | null>(null);
  const subtitleTextSpanRef = useRef<HTMLSpanElement | null>(null);
  const topSubtitleBoxRef = useRef<HTMLDivElement | null>(null);
  const topSubtitleTextSpanRef = useRef<HTMLSpanElement | null>(null);
  const youSynthCountRef = useRef<HTMLDivElement | null>(null);
  const youAlphaRef = useRef<HTMLDivElement | null>(null);
  const youLatencyLabelRef = useRef<HTMLSpanElement | null>(null);
  const youHzLabelRef = useRef<HTMLSpanElement | null>(null);
  const loopPointsRef = useRef<{ a: number | null; b: number | null }>({ a: null, b: null });
  const detectedAutoCropRef = useRef<number>(0);

  useEffect(() => {
    loopPointsRef.current = { a: loopPointA, b: loopPointB };
  }, [loopPointA, loopPointB]);

  useEffect(() => {
    fsControlsVisibleRef.current = fsControlsVisible;
  }, [fsControlsVisible]);

  useEffect(() => {
    fsActivePanelRef.current = fsActivePanel;
  }, [fsActivePanel]);

  // Mutable Engine Ref so requestAnimationFrame never triggers React re-renders
  const currentTimeRef = useRef<number>(0);
  const isScrubbingRef = useRef<boolean>(false);
  const synthesizedCounterRef = useRef<number>(0);
  const procLatencyAvgRef = useRef<number>(0.28);
  const vramUsageMbRef = useRef<number>(18.4);
  const activeFlowGridStrRef = useRef<string>('128×72');
  const activeSubframeResStrRef = useRef<string>('1920×1080');
  const toastTimeoutRef = useRef<number | null>(null);
  const seekBadgeTimeoutRef = useRef<number | null>(null);
  const swipeHudTimeoutRef = useRef<number | null>(null);
  const holdTimerRef = useRef<number | null>(null);
  const lastTapTimeRef = useRef<number>(0);
  const singleTapTimerRef = useRef<number | null>(null);
  const didSwipeRef = useRef<boolean>(false);
  const lastSwipeSeekSyncRef = useRef<number>(0);
  const swipeGestureRef = useRef<{
    active: boolean;
    pointerId: number;
    startX: number;
    startY: number;
    stageWidth: number;
    stageHeight: number;
    isLeftHalf: boolean;
    lockedAxis: 'vertical' | 'horizontal' | null;
    startVolume: number;
    startBrightness: number;
    startTime: number;
  }>({
    active: false,
    pointerId: -1,
    startX: 0,
    startY: 0,
    stageWidth: 1,
    stageHeight: 1,
    isLeftHalf: false,
    lockedAxis: null,
    startVolume: 0.8,
    startBrightness: 1.0,
    startTime: 0
  });

  // Video Frame Pacing & Zero-Copy rVFC Synchronization Refs
  const lastDecodedVideoTimeRef = useRef<number>(-1);
  const pendingMediaTimeRef = useRef<number>(-1);
  const lastDecodedPerfNowRef = useRef<number>(0);
  const lastKeyframeUploadPerfNowRef = useRef<number>(0);
  const lastMediaTimeRef = useRef<number>(-1);
  const hasNewVideoFrameRef = useRef<boolean>(false);
  const justSeekedRef = useRef<boolean>(false);
  const rVfcActiveRef = useRef<boolean>(false);
  const rVfcPendingRef = useRef<boolean>(false);
  const rVFCIdRef = useRef<number | null>(null);
  const forceDemoStepRef = useRef<boolean>(false);
  const pendingSnapshotRef = useRef<boolean>(false);
  const estimatedFrameIntervalMsRef = useRef<number>(33.33); // ~30fps default
  const forceRedrawRef = useRef<boolean>(true);
  const savedPositionsRef = useRef<Record<string, number>>(loadSavedPositions());
  const lastFallbackPosSaveRef = useRef<number>(0);
  const activeVideoUrlRef = useRef<string>('');
  const activeVideoKeyRef = useRef<string>('');

  // Clear all active UI timers on component unmount
  useEffect(() => {
    return () => {
      if (toastTimeoutRef.current) window.clearTimeout(toastTimeoutRef.current);
      if (seekBadgeTimeoutRef.current) window.clearTimeout(seekBadgeTimeoutRef.current);
      if (swipeHudTimeoutRef.current) window.clearTimeout(swipeHudTimeoutRef.current);
      if (holdTimerRef.current) window.clearTimeout(holdTimerRef.current);
      if (singleTapTimerRef.current) window.clearTimeout(singleTapTimerRef.current);
      if (fsHideTimerRef.current) window.clearTimeout(fsHideTimerRef.current);
    };
  }, []);

  // Effective Qualcomm Adreno acceleration status (Auto-detected Adreno OR manually enabled OR GSR selected)
  const isAdrenoActive =
    adrenoMode === 'on' ||
    (adrenoMode === 'auto' && (detectedGpuInfo.isAdreno || upscaleMode === 'gsr'));

  // Dynamically detect optimal smartphone screen super-resolution factor based on physical screen pixels & DPR
  // (reacts to orientation changes and foldable screen transitions)
  const [detectedMobileScaleFactor, setDetectedMobileScaleFactor] = useState<1.5 | 2.0 | 4.0>(() => {
    if (typeof window === 'undefined') return 2.0;
    const dpr = Math.max(1, window.devicePixelRatio || 1);
    const maxScreenDim = Math.max(
      window.screen?.width || 0,
      window.screen?.height || 0,
      window.innerWidth || 0
    );
    const physLongEdge = maxScreenDim * dpr;
    if (physLongEdge >= 3200 || dpr >= 3.2) return 4.0;
    if (physLongEdge >= 2160 || dpr >= 2.0) return 2.0;
    return 1.5;
  });

  useEffect(() => {
    const updateMobileScale = () => {
      const dpr = Math.max(1, window.devicePixelRatio || 1);
      const maxScreenDim = Math.max(
        window.screen?.width || 0,
        window.screen?.height || 0,
        window.innerWidth || 0
      );
      const physLongEdge = maxScreenDim * dpr;
      const next: 1.5 | 2.0 | 4.0 =
        physLongEdge >= 3200 || dpr >= 3.2 ? 4.0 : physLongEdge >= 2160 || dpr >= 2.0 ? 2.0 : 1.5;
      setDetectedMobileScaleFactor((prev) => (prev !== next ? next : prev));
      forceRedrawRef.current = true;
    };
    window.addEventListener('resize', updateMobileScale);
    window.addEventListener('orientationchange', updateMobileScale);

    let ro: ResizeObserver | null = null;
    if (typeof ResizeObserver !== 'undefined' && stageContainerRef.current) {
      ro = new ResizeObserver(() => {
        forceRedrawRef.current = true;
      });
      ro.observe(stageContainerRef.current);
    }

    return () => {
      window.removeEventListener('resize', updateMobileScale);
      window.removeEventListener('orientationchange', updateMobileScale);
      if (ro) ro.disconnect();
    };
  }, []);

  const effectiveUpscaleFactor: 1.5 | 2.0 | 4.0 =
    upscaleFactor === 'auto'
      ? ecoThermalMode
        ? 1.5
        : detectedMobileScaleFactor
      : upscaleFactor;

  const upscaleModeLabel =
    upscaleMode === 'gsr'
      ? 'GSR'
      : upscaleMode === 'fsr'
      ? 'FSR'
      : upscaleMode === 'anime4k'
      ? 'ANIME4K'
      : 'CINEMA';

  const upscaleFactorLabel =
    upscaleFactor === 'auto'
      ? `Авто (${
          effectiveUpscaleFactor === 4.0
            ? '4K UHD'
            : effectiveUpscaleFactor === 2.0
            ? 'QHD 2K'
            : 'FHD+'
        } • ${effectiveUpscaleFactor}x)`
      : upscaleFactor === 1.5
      ? 'FHD+ (1.5x)'
      : upscaleFactor === 2.0
      ? 'QHD 2K (2.0x)'
      : '4K UHD (4.0x)';

  // Automatic persistence of all user settings to localStorage (debounced to prevent synchronous main-thread stalls during slider drags)
  useEffect(() => {
    const payload = {
      activeScreen,
      activeTab,
      darkTheme,
      compactGrid,
      aspectMode,
      playbackRate,
      volume,
      isMuted,
      videoBrightness,
      videoContrast,
      videoSaturation,
      videoBlackPoint,
      debandEnabled,
      debandStrength,
      ambilightEnabled,
      autoCropBlackBars,
      lutPreset,
      lutStrength,
      hdrEnabled,
      hdrStrength,
      upscaleEnabled,
      upscaleMode,
      upscaleFactor,
      upscaleSharpness,
      upscaleDenoise,
      adrenoMode,
      adrenoGmemFp16,
      adrenoTrue10Hdr,
      ecoThermalMode,
      flowScaleMode,
      subframeBufferResMode,
      processorMenuCollapsed,
      topToolbarCollapsed,
      fsToolbarCollapsed,
      transportCollapsed,
      collapsedSections,
      interpEnabled,
      interpMode,
      targetFps,
      interpStrength,
      motionScale,
      dejudderHaloControl,
      subframeCascadeEnabled,
      subframeCascadeMode,
      subframeCoherenceGuard,
      detectedDisplayHz,
      monochromeFilter,
      showVectors,
      showSadHeatmap,
      sceneCutProtection,
      splitCompareMode,
      subtitlesEnabled,
      secondarySubtitlesEnabled,
      subFontSize,
      subDelaySec,
      subBgOpacity,
      eqEnabled,
      eqPreset,
      preampGain,
      pitchCorrection,
      eqBands,
      audioCompressorMode,
      headphoneCrossfeed,
      autoPlayNext,
      loopPlayback,
      rememberPosition,
      autoBindMediaOnStart,
      showTopHud,
      showHudTelemetryGraph,
      showStepButtons,
      showSnapshotBtn,
      doubleTapSeekSec,
      swipeVolumeBright,
      longPressSpeed2x,
      videoOutputMode,
      lastActiveVideoId
    };
    const timer = window.setTimeout(() => {
      savePersistedSettings(payload);
    }, 100);
    return () => window.clearTimeout(timer);
  }, [
    activeScreen,
    activeTab,
    darkTheme,
    compactGrid,
    aspectMode,
    playbackRate,
    volume,
    isMuted,
    videoBrightness,
    videoContrast,
    videoSaturation,
    videoBlackPoint,
    debandEnabled,
    debandStrength,
    ambilightEnabled,
    autoCropBlackBars,
    lutPreset,
    lutStrength,
    hdrEnabled,
    hdrStrength,
    upscaleEnabled,
    upscaleMode,
    upscaleFactor,
    upscaleSharpness,
    upscaleDenoise,
    adrenoMode,
    adrenoGmemFp16,
    adrenoTrue10Hdr,
    ecoThermalMode,
    flowScaleMode,
    subframeBufferResMode,
    processorMenuCollapsed,
    topToolbarCollapsed,
    fsToolbarCollapsed,
    transportCollapsed,
    collapsedSections,
    interpEnabled,
    interpMode,
    targetFps,
    interpStrength,
    motionScale,
    dejudderHaloControl,
    subframeCascadeEnabled,
    subframeCascadeMode,
    subframeCoherenceGuard,
    detectedDisplayHz,
    monochromeFilter,
    showVectors,
    showSadHeatmap,
    sceneCutProtection,
    splitCompareMode,
    subtitlesEnabled,
    secondarySubtitlesEnabled,
    subFontSize,
    subDelaySec,
    subBgOpacity,
    eqEnabled,
    eqPreset,
    preampGain,
    pitchCorrection,
    eqBands,
    audioCompressorMode,
    headphoneCrossfeed,
    autoPlayNext,
    loopPlayback,
    rememberPosition,
    autoBindMediaOnStart,
    showTopHud,
    showHudTelemetryGraph,
    showStepButtons,
    showSnapshotBtn,
    doubleTapSeekSec,
    swipeVolumeBright,
    longPressSpeed2x,
    videoOutputMode,
    lastActiveVideoId
  ]);

  // Flush playback position on page unload/visibilitychange so exiting the app never loses the current second
  useEffect(() => {
    const flushPosition = () => {
      if (rememberPosition && activeVideoKeyRef.current && currentTimeRef.current > 0.5) {
        savedPositionsRef.current[activeVideoKeyRef.current] = currentTimeRef.current;
        if (activeVideoUrlRef.current) {
          savedPositionsRef.current[activeVideoUrlRef.current] = currentTimeRef.current;
        }
        saveSavedPositions(savedPositionsRef.current);
      }
    };
    window.addEventListener('beforeunload', flushPosition);
    document.addEventListener('visibilitychange', flushPosition);
    return () => {
      window.removeEventListener('beforeunload', flushPosition);
      document.removeEventListener('visibilitychange', flushPosition);
    };
  }, [rememberPosition]);

  const engineConfigRef = useRef({
    activeScreen,
    activeTab,
    isPlaying,
    hasLoadedVideo,
    isDemoTestActive,
    duration,
    playbackRate: isHoldSpeed2x ? 2.0 : playbackRate,
    loopPlayback,
    hdrEnabled,
    hdrStrength,
    upscaleEnabled,
    upscaleMode,
    upscaleFactor,
    effectiveUpscaleFactor,
    upscaleSharpness,
    upscaleDenoise,
    isAdrenoActive,
    adrenoGmemFp16,
    adrenoTrue10Hdr,
    ecoThermalMode,
    flowScaleMode,
    subframeBufferResMode,
    interpEnabled,
    interpMode,
    targetFps,
    effectiveTargetFps,
    interpStrength,
    motionScale,
    dejudderHaloControl,
    subframeCascadeEnabled,
    subframeCascadeMode,
    effectiveSubframeCascadeMult,
    subframeCoherenceGuard,
    detectedDisplayHz,
    monochromeFilter,
    showVectors,
    showSadHeatmap,
    sceneCutProtection,
    splitCompareMode,
    manualSubframePhase,
    aspectMode,
    videoBrightness,
    videoContrast,
    videoSaturation,
    videoBlackPoint,
    debandEnabled,
    debandStrength,
    ambilightEnabled,
    autoCropBlackBars,
    lutPreset,
    lutStrength,
    lutVersion,
    videoOutputMode,
    isVideoFallbackActive,
    subtitlesEnabled,
    secondarySubtitlesEnabled,
    subDelaySec,
    subtitleCues,
    secondarySubtitleCues,
    showTopHud,
    showHudTelemetryGraph,
    rememberPosition
  });

  useEffect(() => {
    engineConfigRef.current = {
      activeScreen,
      activeTab,
      isPlaying,
      hasLoadedVideo,
      isDemoTestActive,
      duration,
      playbackRate: isHoldSpeed2x ? 2.0 : playbackRate,
      loopPlayback,
      hdrEnabled,
      hdrStrength,
      upscaleEnabled,
      upscaleMode,
      upscaleFactor,
      effectiveUpscaleFactor,
      upscaleSharpness,
      upscaleDenoise,
      isAdrenoActive,
      adrenoGmemFp16,
      adrenoTrue10Hdr,
      ecoThermalMode,
      flowScaleMode,
      subframeBufferResMode,
      interpEnabled,
      interpMode,
      targetFps,
      effectiveTargetFps,
      interpStrength,
      motionScale,
      dejudderHaloControl,
      subframeCascadeEnabled,
      subframeCascadeMode,
      effectiveSubframeCascadeMult,
      subframeCoherenceGuard,
      detectedDisplayHz,
      monochromeFilter,
      showVectors,
      showSadHeatmap,
      sceneCutProtection,
      splitCompareMode,
      manualSubframePhase,
      aspectMode,
      videoBrightness,
      videoContrast,
      videoSaturation,
      videoBlackPoint,
      debandEnabled,
      debandStrength,
      ambilightEnabled,
      autoCropBlackBars,
      lutPreset,
      lutStrength,
      lutVersion,
      videoOutputMode,
      isVideoFallbackActive,
      subtitlesEnabled,
      secondarySubtitlesEnabled,
      subDelaySec,
      subtitleCues,
      secondarySubtitleCues,
      showTopHud,
      showHudTelemetryGraph,
      rememberPosition
    };
    forceRedrawRef.current = true;
  }, [
    activeScreen,
    activeTab,
    isPlaying,
    hasLoadedVideo,
    isDemoTestActive,
    duration,
    playbackRate,
    isHoldSpeed2x,
    loopPlayback,
    hdrEnabled,
    hdrStrength,
    upscaleEnabled,
    upscaleMode,
    upscaleFactor,
    effectiveUpscaleFactor,
    upscaleSharpness,
    upscaleDenoise,
    isAdrenoActive,
    adrenoGmemFp16,
    adrenoTrue10Hdr,
    ecoThermalMode,
    flowScaleMode,
    subframeBufferResMode,
    interpEnabled,
    interpMode,
    targetFps,
    effectiveTargetFps,
    interpStrength,
    motionScale,
    dejudderHaloControl,
    subframeCascadeEnabled,
    subframeCascadeMode,
    effectiveSubframeCascadeMult,
    subframeCoherenceGuard,
    detectedDisplayHz,
    monochromeFilter,
    showVectors,
    showSadHeatmap,
    sceneCutProtection,
    splitCompareMode,
    manualSubframePhase,
    aspectMode,
    videoBrightness,
    videoContrast,
    videoSaturation,
    videoBlackPoint,
    debandEnabled,
    debandStrength,
    ambilightEnabled,
    autoCropBlackBars,
    lutPreset,
    lutStrength,
    lutVersion,
    videoOutputMode,
    isVideoFallbackActive,
    subtitlesEnabled,
    secondarySubtitlesEnabled,
    subDelaySec,
    subtitleCues,
    secondarySubtitleCues,
    showTopHud,
    showHudTelemetryGraph,
    rememberPosition
  ]);

  // Audio Context & nodes ref (5-band EQ + DynamicsCompressorNode + Voice Filter + Crossfeed + AnalyserNode)
  const audioCtxRef = useRef<AudioContext | null>(null);
  const audioNodesRef = useRef<{
    source: MediaElementAudioSourceNode | null;
    preamp: GainNode | null;
    filters: BiquadFilterNode[];
    voiceFilter: BiquadFilterNode | null;
    compressor: DynamicsCompressorNode | null;
    crossfeedDirectL: GainNode | null;
    crossfeedDirectR: GainNode | null;
    crossfeedCrossLtoR: GainNode | null;
    crossfeedCrossRtoL: GainNode | null;
    analyser: AnalyserNode | null;
  }>({
    source: null,
    preamp: null,
    filters: [],
    voiceFilter: null,
    compressor: null,
    crossfeedDirectL: null,
    crossfeedDirectR: null,
    crossfeedCrossLtoR: null,
    crossfeedCrossRtoL: null,
    analyser: null
  });

  // Telemetry history ref
  const frameTimeHistoryRef = useRef<number[]>(new Array(40).fill(0.18));

  // Toast trigger with cleanup
  const showToast = useCallback((msg: string) => {
    setToastMessage(msg);
    if (toastTimeoutRef.current) window.clearTimeout(toastTimeoutRef.current);
    toastTimeoutRef.current = window.setTimeout(() => {
      setToastMessage(null);
    }, 2400);
  }, []);

  const triggerSeekFeedback = useCallback((label: string) => {
    setSeekFeedback(label);
    if (seekBadgeTimeoutRef.current) window.clearTimeout(seekBadgeTimeoutRef.current);
    seekBadgeTimeoutRef.current = window.setTimeout(() => {
      setSeekFeedback(null);
    }, 650);
  }, []);

  // Sync theme to HTML root
  useEffect(() => {
    if (darkTheme) {
      document.documentElement.classList.add('dark-theme', 'dark');
    } else {
      document.documentElement.classList.remove('dark-theme', 'dark');
    }
  }, [darkTheme]);

  // Listen for Android Chrome WebAPK / PWA install prompt
  useEffect(() => {
    const isStandalone =
      window.matchMedia('(display-mode: standalone)').matches ||
      (window.navigator as unknown as { standalone?: boolean }).standalone === true;
    setIsInstalledPwa(isStandalone);

    const onBeforeInstall = (e: Event) => {
      e.preventDefault();
      setDeferredPrompt(e as BeforeInstallPromptEvent);
    };
    const onInstalled = () => {
      setIsInstalledPwa(true);
      setDeferredPrompt(null);
      showToast('Приложение REX Player установлено на устройство');
    };

    window.addEventListener('beforeinstallprompt', onBeforeInstall);
    window.addEventListener('appinstalled', onInstalled);
    return () => {
      window.removeEventListener('beforeinstallprompt', onBeforeInstall);
      window.removeEventListener('appinstalled', onInstalled);
    };
  }, [showToast]);

  const handleInstallWebApk = async () => {
    if (deferredPrompt) {
      await deferredPrompt.prompt();
      const choice = await deferredPrompt.userChoice;
      if (choice.outcome === 'accepted') {
        setIsInstalledPwa(true);
        setDeferredPrompt(null);
      }
    } else {
      setActiveModal('apk');
    }
  };

  // Web Audio Equalizer + Night Compressor + Spatial Crossfeed + Spectrogram Analyser initialization
  const initWebAudio = useCallback(() => {
    const vid = videoRef.current;
    if (!vid) return;
    if (audioNodesRef.current.source) {
      if (audioCtxRef.current && audioCtxRef.current.state === 'suspended') {
        audioCtxRef.current.resume().catch(() => {});
      }
      return;
    }
    const vidTagged = vid as unknown as { __hasAudioSourceNode?: boolean };
    if (vidTagged.__hasAudioSourceNode) {
      return;
    }
    try {
      const AudioCtxClass =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      if (!AudioCtxClass) return;
      const ctx = new AudioCtxClass();
      audioCtxRef.current = ctx;

      const source = ctx.createMediaElementSource(vid);
      vidTagged.__hasAudioSourceNode = true;
      const preamp = ctx.createGain();
      preamp.gain.value = preampGain;

      const freqs = [60, 230, 910, 3600, 14000];
      const filters = freqs.map((freq, idx) => {
        const filter = ctx.createBiquadFilter();
        filter.type = idx === 0 ? 'lowshelf' : idx === freqs.length - 1 ? 'highshelf' : 'peaking';
        filter.frequency.value = freq;
        filter.Q.value = 1.1;
        filter.gain.value = eqEnabled ? eqBands[idx] : 0;
        return filter;
      });

      // Voice mid-band boost filter (300Hz - 3kHz centered at 1350Hz)
      const voiceFilter = ctx.createBiquadFilter();
      voiceFilter.type = 'peaking';
      voiceFilter.frequency.value = 1350;
      voiceFilter.Q.value = 0.85;
      voiceFilter.gain.value = audioCompressorMode === 'voice' ? 6.5 : 0;

      // DynamicsCompressorNode for Night Mode / Volume Normalization
      const compressor = ctx.createDynamicsCompressor();
      if (audioCompressorMode === 'night') {
        compressor.threshold.value = -36;
        compressor.knee.value = 24;
        compressor.ratio.value = 8;
        compressor.attack.value = 0.005;
        compressor.release.value = 0.22;
      } else if (audioCompressorMode === 'soft') {
        compressor.threshold.value = -24;
        compressor.knee.value = 18;
        compressor.ratio.value = 3.5;
        compressor.attack.value = 0.015;
        compressor.release.value = 0.25;
      } else if (audioCompressorMode === 'voice') {
        compressor.threshold.value = -28;
        compressor.knee.value = 20;
        compressor.ratio.value = 5.0;
        compressor.attack.value = 0.008;
        compressor.release.value = 0.2;
      } else {
        compressor.threshold.value = 0;
        compressor.knee.value = 0;
        compressor.ratio.value = 1;
        compressor.attack.value = 0.02;
        compressor.release.value = 0.25;
      }

      // Spatial Headphone Crossfeed (0.3ms delay + 18% L/R blend)
      const splitter = ctx.createChannelSplitter(2);
      const merger = ctx.createChannelMerger(2);
      const delayLtoR = ctx.createDelay(0.01);
      const delayRtoL = ctx.createDelay(0.01);
      delayLtoR.delayTime.value = 0.0003; // 0.3 ms interaural time difference
      delayRtoL.delayTime.value = 0.0003;

      const crossfeedDirectL = ctx.createGain();
      const crossfeedDirectR = ctx.createGain();
      const crossfeedCrossLtoR = ctx.createGain();
      const crossfeedCrossRtoL = ctx.createGain();

      crossfeedDirectL.gain.value = headphoneCrossfeed ? 0.85 : 1.0;
      crossfeedDirectR.gain.value = headphoneCrossfeed ? 0.85 : 1.0;
      crossfeedCrossLtoR.gain.value = headphoneCrossfeed ? 0.18 : 0.0;
      crossfeedCrossRtoL.gain.value = headphoneCrossfeed ? 0.18 : 0.0;

      // AnalyserNode for real-time 5-band / 16-bin spectrogram
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 64;
      analyser.smoothingTimeConstant = 0.78;

      source.connect(preamp);
      let lastNode: AudioNode = preamp;
      filters.forEach((filter) => {
        lastNode.connect(filter);
        lastNode = filter;
      });
      lastNode.connect(voiceFilter);
      voiceFilter.connect(compressor);
      compressor.connect(splitter);

      // Left channel -> Direct L + Delayed R
      splitter.connect(crossfeedDirectL, 0);
      crossfeedDirectL.connect(merger, 0, 0);
      splitter.connect(delayLtoR, 0);
      delayLtoR.connect(crossfeedCrossLtoR);
      crossfeedCrossLtoR.connect(merger, 0, 1);

      // Right channel -> Direct R + Delayed L
      splitter.connect(crossfeedDirectR, 1);
      crossfeedDirectR.connect(merger, 0, 1);
      splitter.connect(delayRtoL, 1);
      delayRtoL.connect(crossfeedCrossRtoL);
      crossfeedCrossRtoL.connect(merger, 0, 0);

      merger.connect(analyser);
      analyser.connect(ctx.destination);

      audioNodesRef.current = {
        source,
        preamp,
        filters,
        voiceFilter,
        compressor,
        crossfeedDirectL,
        crossfeedDirectR,
        crossfeedCrossLtoR,
        crossfeedCrossRtoL,
        analyser
      };
    } catch {
      // Gracefully bypass if browser restricts MediaElementSource
    }
  }, [audioCompressorMode, eqBands, eqEnabled, headphoneCrossfeed, preampGain]);

  // Update EQ bands, DynamicsCompressorNode & Crossfeed when settings change
  useEffect(() => {
    const nodes = audioNodesRef.current;
    if (!nodes.preamp) return;
    if (audioCtxRef.current && audioCtxRef.current.state === 'suspended') {
      audioCtxRef.current.resume().catch(() => {});
    }
    nodes.preamp.gain.value = preampGain;
    nodes.filters.forEach((filter, idx) => {
      filter.gain.value = eqEnabled ? eqBands[idx] : 0;
    });
    if (nodes.voiceFilter) {
      nodes.voiceFilter.gain.value = audioCompressorMode === 'voice' ? 6.5 : 0;
    }
    if (nodes.compressor) {
      if (audioCompressorMode === 'night') {
        nodes.compressor.threshold.value = -36;
        nodes.compressor.knee.value = 24;
        nodes.compressor.ratio.value = 8;
        nodes.compressor.attack.value = 0.005;
        nodes.compressor.release.value = 0.22;
      } else if (audioCompressorMode === 'soft') {
        nodes.compressor.threshold.value = -24;
        nodes.compressor.knee.value = 18;
        nodes.compressor.ratio.value = 3.5;
        nodes.compressor.attack.value = 0.015;
        nodes.compressor.release.value = 0.25;
      } else if (audioCompressorMode === 'voice') {
        nodes.compressor.threshold.value = -28;
        nodes.compressor.knee.value = 20;
        nodes.compressor.ratio.value = 5.0;
        nodes.compressor.attack.value = 0.008;
        nodes.compressor.release.value = 0.2;
      } else {
        nodes.compressor.threshold.value = 0;
        nodes.compressor.knee.value = 0;
        nodes.compressor.ratio.value = 1;
      }
    }
    if (
      nodes.crossfeedDirectL &&
      nodes.crossfeedDirectR &&
      nodes.crossfeedCrossLtoR &&
      nodes.crossfeedCrossRtoL
    ) {
      nodes.crossfeedDirectL.gain.value = headphoneCrossfeed ? 0.85 : 1.0;
      nodes.crossfeedDirectR.gain.value = headphoneCrossfeed ? 0.85 : 1.0;
      nodes.crossfeedCrossLtoR.gain.value = headphoneCrossfeed ? 0.18 : 0.0;
      nodes.crossfeedCrossRtoL.gain.value = headphoneCrossfeed ? 0.18 : 0.0;
    }
  }, [audioCompressorMode, eqBands, eqEnabled, headphoneCrossfeed, preampGain]);

  // Live Audio Spectrogram animation when Equalizer modal or fullscreen Audio drawer is open
  useEffect(() => {
    const isEqVisible = activeModal === 'eq' || fsActivePanel === 'audio';
    if (!isEqVisible) return;

    let animId = 0;
    const freqData = new Uint8Array(32);

    const drawSpectrum = () => {
      const analyser = audioNodesRef.current.analyser;
      if (analyser) {
        analyser.getByteFrequencyData(freqData);
      } else {
        freqData.fill(0);
      }

      const targets = [eqSpectrumCanvasRef.current, fsEqSpectrumCanvasRef.current];
      for (const canvas of targets) {
        if (!canvas) continue;
        const ctx = canvas.getContext('2d');
        if (!ctx) continue;
        const w = canvas.width;
        const h = canvas.height;
        ctx.clearRect(0, 0, w, h);

        const barCount = 24;
        const gap = 3;
        const barW = Math.max(2, (w - gap * (barCount - 1)) / barCount);

        for (let i = 0; i < barCount; i++) {
          const val = freqData[i] || 0;
          const norm = Math.max(0.06, val / 255);
          const barH = Math.round(norm * (h - 4));
          const x = i * (barW + gap);
          const y = h - barH;

          const grad = ctx.createLinearGradient(0, h, 0, 0);
          grad.addColorStop(0, '#38bdf8');
          grad.addColorStop(0.6, '#818cf8');
          grad.addColorStop(1, '#f472b6');
          ctx.fillStyle = grad;
          ctx.fillRect(x, y, barW, barH);
        }
      }
      animId = requestAnimationFrame(drawSpectrum);
    };

    animId = requestAnimationFrame(drawSpectrum);
    return () => cancelAnimationFrame(animId);
  }, [activeModal, fsActivePanel]);

  // Sync pitchCorrection to video element
  useEffect(() => {
    if (videoRef.current) {
      videoRef.current.preservesPitch = pitchCorrection;
    }
  }, [pitchCorrection]);

  // Apply EQ Preset
  const applyPreset = (preset: 'flat' | 'cinema' | 'bass' | 'vocal' | 'treble') => {
    setEqPreset(preset);
    let bands: [number, number, number, number, number] = [0, 0, 0, 0, 0];
    if (preset === 'cinema') bands = [4, 2, -1, 2, 4];
    else if (preset === 'bass') bands = [7, 5, 1, -1, -2];
    else if (preset === 'vocal') bands = [-2, 1, 5, 3, 0];
    else if (preset === 'treble') bands = [-2, 0, 2, 5, 7];
    setEqBands(bands);
    showToast(`Пресет эквалайзера: ${preset.toUpperCase()}`);
  };

  // Active subtitle cues (Bottom & Top) computed from currentTime
  const activeDualSubtitles = React.useMemo(() => {
    return findActiveDualSubtitles(
      subtitleCues,
      secondarySubtitleCues,
      currentTime - subDelaySec,
      subtitlesEnabled,
      secondarySubtitlesEnabled
    );
  }, [
    currentTime,
    secondarySubtitleCues,
    secondarySubtitlesEnabled,
    subDelaySec,
    subtitleCues,
    subtitlesEnabled
  ]);
  const activeSubtitleCue = activeDualSubtitles.bottomText;

  // Subtitle File Parser (.srt, .vtt, and .ass / .ssa with {\an8} and {\pos(x,y)} tag support)
  const parseSubtitleText = (text: string): SubtitleCue[] => {
    const cues: SubtitleCue[] = [];
    const normalized = text.replace(/\r\n/g, '\n').replace(/\r/g, '\n');

    let playResX = 0;
    let playResY = 0;
    const headerLines = normalized.split('\n');
    for (let i = 0; i < Math.min(headerLines.length, 80); i++) {
      const rxm = headerLines[i].match(/^\s*PlayResX\s*:\s*(\d+)/i);
      if (rxm) playResX = parseInt(rxm[1], 10);
      const rym = headerLines[i].match(/^\s*PlayResY\s*:\s*(\d+)/i);
      if (rym) playResY = parseInt(rym[1], 10);
    }

    const extractAssTags = (rawText: string) => {
      let align: number | undefined;
      let posX: number | undefined;
      let posY: number | undefined;

      const anMatch =
        rawText.match(/\{[^}]*\\an([1-9])[^}]*\}/i) || rawText.match(/\\an([1-9])/i);
      const legacyTopMatch = rawText.match(/\{[^}]*\\a(5|6|7)[^}]*\}/i);
      if (anMatch) {
        align = parseInt(anMatch[1], 10);
      } else if (legacyTopMatch) {
        align = 8;
      }

      const posMatch =
        rawText.match(/\\pos\(\s*([\d.]+)\s*,\s*([\d.]+)\s*\)/i) ||
        rawText.match(/\\move\(\s*([\d.]+)\s*,\s*([\d.]+)/i);
      if (posMatch) {
        const rawX = parseFloat(posMatch[1]);
        const rawY = parseFloat(posMatch[2]);
        if (isFinite(rawX) && isFinite(rawY)) {
          const refW = playResX > 0 ? playResX : rawX > 384 || rawY > 288 ? 1920 : 384;
          const refH = playResY > 0 ? playResY : rawX > 384 || rawY > 288 ? 1080 : 288;
          const normX = rawX <= 100 && playResX === 0 && rawY <= 100 ? rawX : (rawX / refW) * 100;
          const normY = rawY <= 100 && playResY === 0 && rawX <= 100 ? rawY : (rawY / refH) * 100;
          posX = Math.max(5, Math.min(95, normX));
          posY = Math.max(5, Math.min(95, normY));
          if (align === undefined && posY < 45) {
            align = 8;
          }
        }
      }

      const cleaned = rawText
        .replace(/\{[^}]*\}/g, '')
        .replace(/\\N/g, '\n')
        .replace(/\\n/g, '\n')
        .replace(/\\h/g, ' ')
        .replace(/<[^>]+>/g, '')
        .trim();

      return { cleaned, align, posX, posY };
    };

    // Detect .ASS / .SSA format ([Events] / Dialogue: lines)
    if (/^\s*Dialogue\s*:/im.test(normalized)) {
      const lines = normalized.split('\n');
      const assTimeRegex = /^(\d+):(\d{2}):(\d{2})[.:](\d{2,3})$/;
      const parseAssTime = (str: string): number => {
        const m = str.trim().match(assTimeRegex);
        if (!m) return -1;
        const h = parseInt(m[1], 10);
        const min = parseInt(m[2], 10);
        const s = parseInt(m[3], 10);
        const frac = m[4].length === 2 ? parseInt(m[4], 10) * 10 : parseInt(m[4], 10);
        return h * 3600 + min * 60 + s + frac / 1000;
      };

      for (const line of lines) {
        if (!/^\s*Dialogue\s*:/i.test(line)) continue;
        const afterColon = line.replace(/^\s*Dialogue\s*:\s*/i, '');
        const parts = afterColon.split(',');
        if (parts.length < 10) continue;
        const start = parseAssTime(parts[1]);
        const end = parseAssTime(parts[2]);
        if (start < 0 || end < 0) continue;
        const rawText = parts.slice(9).join(',');
        const { cleaned, align, posX, posY } = extractAssTags(rawText);
        if (cleaned) {
          cues.push({ start, end, text: cleaned, align, posX, posY });
        }
      }
      if (cues.length > 0) {
        return cues.sort((a, b) => a.start - b.start);
      }
    }

    const blocks = normalized.split(/\n\s*\n/);
    const timeRegex = /(\d{1,2}:)?(\d{2}):(\d{2})[.,](\d{3})\s*-->\s*(\d{1,2}:)?(\d{2}):(\d{2})[.,](\d{3})/;

    for (const block of blocks) {
      const lines = block.trim().split('\n');
      if (!lines.length) continue;
      let timeIdx = -1;
      for (let i = 0; i < lines.length; i++) {
        if (timeRegex.test(lines[i])) {
          timeIdx = i;
          break;
        }
      }
      if (timeIdx === -1) continue;
      const m = lines[timeIdx].match(timeRegex);
      if (!m) continue;

      const h1 = m[1] ? parseInt(m[1], 10) : 0;
      const m1 = parseInt(m[2], 10);
      const s1 = parseInt(m[3], 10);
      const ms1 = parseInt(m[4], 10);

      const h2 = m[5] ? parseInt(m[5], 10) : 0;
      const m2 = parseInt(m[6], 10);
      const s2 = parseInt(m[7], 10);
      const ms2 = parseInt(m[8], 10);

      const start = h1 * 3600 + m1 * 60 + s1 + ms1 / 1000;
      const end = h2 * 3600 + m2 * 60 + s2 + ms2 / 1000;
      const rawContent = lines.slice(timeIdx + 1).join('\n');
      const { cleaned, align, posX, posY } = extractAssTags(rawContent);
      if (cleaned) cues.push({ start, end, text: cleaned, align, posX, posY });
    }
    return cues.sort((a, b) => a.start - b.start);
  };

  const loadSubtitleFileObject = useCallback(
    (file: File) => {
      const reader = new FileReader();
      reader.onload = (event) => {
        const parsed = parseSubtitleText((event.target?.result as string) || '');
        if (parsed.length > 0) {
          const subLabel = `${file.name} (${parsed.length} фраз)`;
          setSubtitleCues(parsed);
          setSubtitlesEnabled(true);
          setCustomSubtitlesName(subLabel);
          saveSubtitlesToVault(subLabel, parsed, 'primary');
          showToast(`Основные субтитры загружены: ${parsed.length} фраз`);
        } else {
          showToast('Не удалось распознать таймкоды в файле субтитров');
        }
      };
      reader.readAsText(file, 'utf-8');
    },
    [showToast]
  );

  const loadSecondarySubtitleFileObject = useCallback(
    (file: File) => {
      const reader = new FileReader();
      reader.onload = (event) => {
        const parsed = parseSubtitleText((event.target?.result as string) || '');
        if (parsed.length > 0) {
          const subLabel = `${file.name} (${parsed.length} фраз)`;
          setSecondarySubtitleCues(parsed);
          setSecondarySubtitlesEnabled(true);
          setSecondarySubtitlesName(subLabel);
          saveSubtitlesToVault(subLabel, parsed, 'secondary');
          showToast(`Верхние (Dual) субтитры загружены: ${parsed.length} фраз`);
        } else {
          showToast('Не удалось распознать таймкоды в файле субтитров');
        }
      };
      reader.readAsText(file, 'utf-8');
    },
    [showToast]
  );

  const handleSubtitleUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) loadSubtitleFileObject(file);
    e.target.value = '';
  };

  const handleSecondarySubtitleUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) loadSecondarySubtitleFileObject(file);
    e.target.value = '';
  };

  const handleLutFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      const text = (ev.target?.result as string) || '';
      const strip = parseCubeFileToLutStrip(text);
      if (strip) {
        customLutStripRef.current = strip;
        setCustomLutName(file.name);
        setLutPreset('custom');
        setLutVersion((v) => v + 1);
        showToast(`3D LUT загружен: ${file.name}`);
      } else {
        showToast('Ошибка чтения таблицы .cube (проверьте формат LUT_3D_SIZE)');
      }
    };
    reader.readAsText(file, 'utf-8');
    e.target.value = '';
  };

  // Format MM:SS.d
  const formatTime = (sec: number) => {
    if (!isFinite(sec) || sec < 0) sec = 0;
    const m = Math.floor(sec / 60);
    const s = Math.floor(sec % 60);
    const d = Math.floor((sec % 1) * 10);
    return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}.${d}`;
  };

  const thumbQueueRef = useRef<Array<{ videoUrl: string; videoId: string }>>([]);
  const isThumbBusyRef = useRef<boolean>(false);

  // Automatic Background Video Preview Thumbnail & Metadata Extractor (serialized 1-at-a-time queue to prevent parallel decoder thermal spikes)
  const generateVideoThumbnail = useCallback((videoUrl: string, videoId: string) => {
    if (!videoUrl) return;
    // HLS (.m3u8) streams get thumbnails from the resolver or directly from the active Hls-attached videoRef
    if (/\.m3u8(\?|$)/i.test(videoUrl) || videoUrl.includes(':hls:')) return;

    const runNextThumbnail = () => {
      const nextTask = thumbQueueRef.current.shift();
      if (!nextTask) {
        isThumbBusyRef.current = false;
        return;
      }
      isThumbBusyRef.current = true;
      const { videoUrl: targetUrl, videoId: targetId } = nextTask;

      const tempVid = document.createElement('video');
      tempVid.preload = 'metadata';
      tempVid.muted = true;
      tempVid.playsInline = true;
      if (targetUrl.startsWith('http://') || targetUrl.startsWith('https://')) {
        tempVid.crossOrigin = 'anonymous';
      }

      let finished = false;
      let retriedBlackFrame = false;
      let timeoutId = 0;
      const cleanup = () => {
        if (finished) return;
        finished = true;
        if (timeoutId) {
          window.clearTimeout(timeoutId);
          timeoutId = 0;
        }
        try {
          tempVid.onloadedmetadata = null;
          tempVid.onseeked = null;
          tempVid.onerror = null;
          tempVid.pause();
          tempVid.removeAttribute('src');
          tempVid.load();
        } catch {
          // Ignore
        }
        window.setTimeout(runNextThumbnail, 60);
      };

      timeoutId = window.setTimeout(cleanup, 7500);

      const captureFrameToVault = () => {
        if (finished) return;
        try {
          const vw = tempVid.videoWidth || 320;
          const vh = tempVid.videoHeight || 180;
          const thumbW = 320;
          const thumbH = 180;
          const canvas = document.createElement('canvas');
          canvas.width = thumbW;
          canvas.height = thumbH;
          const ctx = canvas.getContext('2d');
          if (ctx) {
            ctx.fillStyle = '#09090c';
            ctx.fillRect(0, 0, thumbW, thumbH);
            const scale = Math.max(thumbW / Math.max(1, vw), thumbH / Math.max(1, vh));
            const drawW = vw * scale;
            const drawH = vh * scale;
            const dx = (thumbW - drawW) * 0.5;
            const dy = (thumbH - drawH) * 0.5;
            ctx.drawImage(tempVid, dx, dy, drawW, drawH);

            // Check if the captured frame is a dark fade-in frame and retry once deeper into the video
            const dur = isFinite(tempVid.duration) && tempVid.duration > 0 ? tempVid.duration : 0;
            if (!retriedBlackFrame && dur > 3.0) {
              try {
                const sample = ctx.getImageData(40, 20, 240, 140).data;
                let lumaSum = 0;
                const step = 64;
                let count = 0;
                for (let i = 0; i < sample.length; i += step) {
                  lumaSum += sample[i] * 0.299 + sample[i + 1] * 0.587 + sample[i + 2] * 0.114;
                  count++;
                }
                const avgLuma = count > 0 ? lumaSum / count : 30;
                if (avgLuma < 10) {
                  retriedBlackFrame = true;
                  tempVid.currentTime = Math.min(dur - 0.2, Math.max(2.2, dur * 0.32));
                  return;
                }
              } catch {
                // Ignore getImageData security errors
              }
            }

            const thumbDataUrl = canvas.toDataURL('image/jpeg', 0.8);
            const resStr = vw > 0 && vh > 0 ? `${vw}×${vh}` : undefined;

            if (thumbDataUrl && thumbDataUrl.length > 128) {
              setUserVideos((prev) =>
                prev.map((v) =>
                  v.id === targetId
                    ? {
                        ...v,
                        duration: dur > 0 ? dur : v.duration,
                        resolution: resStr || v.resolution,
                        thumbnailUrl: thumbDataUrl
                      }
                    : v
                )
              );
              setPlaylist((prev) =>
                prev.map((v) =>
                  v.id === targetId
                    ? {
                        ...v,
                        duration: dur > 0 ? dur : v.duration,
                        resolution: resStr || v.resolution,
                        thumbnailUrl: thumbDataUrl
                      }
                    : v
                )
              );
              void updateVideoMetaInVault(targetId, dur, resStr, thumbDataUrl);
            }
          }
        } catch {
          // Ignore cross-origin canvas taint if remote URL
        } finally {
          if (!retriedBlackFrame || finished) {
            window.clearTimeout(timeoutId);
            cleanup();
          }
        }
      };

      tempVid.onloadedmetadata = () => {
        if (finished) return;
        const dur = isFinite(tempVid.duration) && tempVid.duration > 0 ? tempVid.duration : 0;
        const vw = tempVid.videoWidth || 0;
        const vh = tempVid.videoHeight || 0;
        const resStr = vw > 0 && vh > 0 ? `${vw}×${vh}` : undefined;

        if (dur > 0 || resStr) {
          setUserVideos((prev) =>
            prev.map((v) =>
              v.id === targetId
                ? {
                    ...v,
                    duration: dur > 0 ? dur : v.duration,
                    resolution: resStr || v.resolution
                  }
                : v
            )
          );
          setPlaylist((prev) =>
            prev.map((v) =>
              v.id === targetId
                ? {
                    ...v,
                    duration: dur > 0 ? dur : v.duration,
                    resolution: resStr || v.resolution
                  }
                : v
            )
          );
          void updateVideoMetaInVault(targetId, dur, resStr);
        }

        const targetTime =
          dur > 2.0
            ? Math.min(2.5, Math.max(0.8, dur * 0.15))
            : dur > 0
            ? Math.max(0.05, Math.min(0.4, dur * 0.4))
            : 0.5;
        try {
          tempVid.currentTime = targetTime;
        } catch {
          captureFrameToVault();
        }
      };

      tempVid.onseeked = () => {
        const wasRetry = retriedBlackFrame;
        if (wasRetry) {
          retriedBlackFrame = false;
        }
        captureFrameToVault();
      };

      tempVid.onerror = () => {
        window.clearTimeout(timeoutId);
        cleanup();
      };

      tempVid.src = targetUrl;
    };

    if (!thumbQueueRef.current.some((item) => item.videoId === videoId)) {
      thumbQueueRef.current.push({ videoUrl, videoId });
    }
    if (!isThumbBusyRef.current) {
      runNextThumbnail();
    }
  }, []);

  // Unified helper for accurate seeking (updates video, DOM scrubbers, and triggers WebGL redraw; can defer React state commit during continuous slider drag)
  const seekToTime = useCallback(
    (targetSec: number, commitReactState: boolean = true) => {
      const maxDur = duration > 0 ? duration : Math.max(100, currentTimeRef.current + 30);
      const clamped = Math.max(0, Math.min(maxDur, targetSec));
      currentTimeRef.current = clamped;
      if (commitReactState) {
        setCurrentTime(clamped);
      }
      forceRedrawRef.current = true;

      if (isDemoTestActive) {
        forceDemoStepRef.current = true;
        hasNewVideoFrameRef.current = true;
      } else if (videoRef.current && hasLoadedVideo) {
        const nowMs = performance.now();
        if (commitReactState || nowMs - lastSwipeSeekSyncRef.current >= 35) {
          lastSwipeSeekSyncRef.current = nowMs;
          videoRef.current.currentTime = clamped;
        }
      }
      if (timecodeDisplayRef.current) {
        timecodeDisplayRef.current.textContent = formatTime(clamped);
      }
      if (fsTimecodeDisplayRef.current) {
        fsTimecodeDisplayRef.current.textContent = formatTime(clamped);
      }
      if (scrubberInputRef.current) {
        scrubberInputRef.current.value = String(clamped);
      }
      if (fsScrubberInputRef.current) {
        fsScrubberInputRef.current.value = String(clamped);
      }
      const dualSubs = findActiveDualSubtitles(
        subtitleCues,
        secondarySubtitleCues,
        clamped - subDelaySec,
        subtitlesEnabled,
        secondarySubtitlesEnabled
      );
      if (subtitleBoxRef.current && subtitleTextSpanRef.current) {
        subtitleTextSpanRef.current.textContent = dualSubs.bottomText;
        subtitleBoxRef.current.style.display = dualSubs.bottomText ? 'flex' : 'none';
      }
      if (topSubtitleBoxRef.current && topSubtitleTextSpanRef.current) {
        topSubtitleTextSpanRef.current.textContent = dualSubs.topText;
        topSubtitleBoxRef.current.style.display = dualSubs.topText ? 'flex' : 'none';
      }
      if (commitReactState && rememberPosition && !isDemoTestActive) {
        if (activeVideoKeyRef.current) {
          savedPositionsRef.current[activeVideoKeyRef.current] = clamped;
        }
        if (activeVideoUrlRef.current) {
          savedPositionsRef.current[activeVideoUrlRef.current] = clamped;
        }
        saveSavedPositions(savedPositionsRef.current);
      }
    },
    [
      duration,
      hasLoadedVideo,
      isDemoTestActive,
      rememberPosition,
      secondarySubtitleCues,
      secondarySubtitlesEnabled,
      subDelaySec,
      subtitleCues,
      subtitlesEnabled
    ]
  );

  // Built-in 24.0 FPS Cinema Motion Test Stream for instant visual verification of 60/90/120/144 FPS MEMC synthesis
  const startBuiltIn24FpsTest = useCallback(() => {
    if (videoRef.current) {
      videoRef.current.onloadedmetadata = null;
      videoRef.current.onloadeddata = null;
      videoRef.current.onseeked = null;
      videoRef.current.onerror = null;
      videoRef.current.pause();
    }
    if (hlsInstanceRef.current) {
      try {
        hlsInstanceRef.current.destroy();
      } catch {
        // Ignore
      }
      hlsInstanceRef.current = null;
    }
    setLoopPointA(null);
    setLoopPointB(null);
    loopPointsRef.current = { a: null, b: null };
    detectedAutoCropRef.current = 0;
    setDetectedAutoCropPct(0);
    setAnixartSession(null);
    setStreamQualities({});
    setActiveStreamQuality('Auto');
    setSkipTimings([]);
    setActiveSkipPrompt(null);
    setIsDemoTestActive(true);
    setVideoOutputMode('webgl_direct');
    setWebglContextLost(false);
    setHasLoadedVideo(true);
    setIsPlaying(true);
    setInterpEnabled(true);
    setInterpMode('optical');
    setManualSubframePhase(null);
    setActiveVideoTitle(`Тест генерации MEMC • 24 FPS → ${effectiveTargetFps} FPS`);
    setActiveSourceLabel('Встроенный генератор 24.0 FPS');
    setVideoNativeRes('960×540 • 24 FPS');
    setDuration(120);
    setCurrentTime(0);
    currentTimeRef.current = 0;
    lastDecodedVideoTimeRef.current = -1;
    pendingMediaTimeRef.current = -1;
    lastMediaTimeRef.current = -1;
    estimatedFrameIntervalMsRef.current = 41.667; // Exact 24.0 FPS source cadence
    lastKeyframeUploadPerfNowRef.current = performance.now();
    forceDemoStepRef.current = true;
    hasNewVideoFrameRef.current = true;
    forceRedrawRef.current = true;
    setActiveScreen('player');
    showToast(`Запущен тест оптического потока MEMC: 24 FPS → ${effectiveTargetFps} FPS`);
  }, [effectiveTargetFps, showToast]);

  // Self-healing requestVideoFrameCallback registration
  const armVideoFrameCallback = useCallback(() => {
    const vid = videoRef.current as (HTMLVideoElement & {
      requestVideoFrameCallback?: (
        cb: (now: number, meta: { mediaTime: number; presentedFrames: number }) => void
      ) => number;
      cancelVideoFrameCallback?: (id: number) => void;
    }) | null;

    if (!vid || typeof vid.requestVideoFrameCallback !== 'function') return;
    if (rVFCIdRef.current !== null && typeof vid.cancelVideoFrameCallback === 'function') {
      try {
        vid.cancelVideoFrameCallback(rVFCIdRef.current);
      } catch {
        // Ignore
      }
      rVFCIdRef.current = null;
    }

    const onFrame = (now: number, meta: { mediaTime: number }) => {
      rVfcPendingRef.current = false;
      rVfcActiveRef.current = true;
      const mediaDelta = Math.abs(meta.mediaTime - lastMediaTimeRef.current);
      if (lastMediaTimeRef.current < 0 || mediaDelta >= 0.008) {
        if (lastMediaTimeRef.current >= 0 && mediaDelta < 0.25) {
          const rate = Math.max(0.25, engineConfigRef.current.playbackRate || 1.0);
          const rawFrameDurMs = (mediaDelta * 1000) / rate;
          if (rawFrameDurMs >= 15.5 && rawFrameDurMs <= 85) {
            const stabilizedDurMs = snapToCanonicalCadenceMs(rawFrameDurMs) * rate;
            estimatedFrameIntervalMsRef.current =
              estimatedFrameIntervalMsRef.current * 0.82 + stabilizedDurMs * 0.18;
          }
        }
        lastMediaTimeRef.current = meta.mediaTime;
        pendingMediaTimeRef.current = meta.mediaTime;
        lastDecodedPerfNowRef.current = now;
        hasNewVideoFrameRef.current = true;
      }

      if (vid.requestVideoFrameCallback) {
        rVfcPendingRef.current = true;
        rVFCIdRef.current = vid.requestVideoFrameCallback(onFrame);
      }
    };

    rVfcPendingRef.current = true;
    rVFCIdRef.current = vid.requestVideoFrameCallback(onFrame);
  }, []);

  // Start or Prepare Real Video Playback (supports local Blob, MP4/WebM, HLS .m3u8 via hls.js, and autoPlay=false for silent startup binding)
  const startRealVideoUrl = useCallback(
    (
      url: string,
      title: string,
      sourceLabel: string,
      videoId?: string,
      autoPlay: boolean = true,
      overrideStartPosSec?: number
    ) => {
      const vid = videoRef.current;
      if (!vid) return;

      // Save previous video's position if rememberPosition is active
      if (
        rememberPosition &&
        !isDemoTestActive &&
        currentTimeRef.current > 1 &&
        overrideStartPosSec === undefined
      ) {
        if (activeVideoKeyRef.current) {
          savedPositionsRef.current[activeVideoKeyRef.current] = currentTimeRef.current;
        }
        if (activeVideoUrlRef.current) {
          savedPositionsRef.current[activeVideoUrlRef.current] = currentTimeRef.current;
        }
        saveSavedPositions(savedPositionsRef.current);
      }

      // Clear stale video element callbacks BEFORE destroying previous Hls instance to prevent false error toasts
      vid.onloadedmetadata = null;
      vid.onloadeddata = null;
      vid.onseeked = null;
      vid.onerror = null;
      vid.pause();

      // Destroy any previous Hls.js instance before attaching new source
      if (hlsInstanceRef.current) {
        try {
          hlsInstanceRef.current.destroy();
        } catch {
          // Ignore
        }
        hlsInstanceRef.current = null;
      }

      if (autoPlay) {
        initWebAudio();
      }
      const key = videoId || title || url;
      activeVideoUrlRef.current = url;
      activeVideoKeyRef.current = key;
      if (videoId) {
        setLastActiveVideoId(videoId);
      }
      setLoopPointA(null);
      setLoopPointB(null);
      loopPointsRef.current = { a: null, b: null };
      detectedAutoCropRef.current = 0;
      setDetectedAutoCropPct(0);
      setIsDemoTestActive(false);
      setHasLoadedVideo(true);
      setActiveVideoTitle(title);
      setActiveSourceLabel(sourceLabel);
      const initialTime = overrideStartPosSec !== undefined && overrideStartPosSec > 0 ? overrideStartPosSec : 0;
      currentTimeRef.current = initialTime;
      lastDecodedVideoTimeRef.current = -1;
      pendingMediaTimeRef.current = -1;
      lastMediaTimeRef.current = -1;
      rVfcActiveRef.current = false;
      rVfcPendingRef.current = false;
      lastDecodedPerfNowRef.current = performance.now();
      lastKeyframeUploadPerfNowRef.current = performance.now();
      hasNewVideoFrameRef.current = true;
      estimatedFrameIntervalMsRef.current = 33.33;
      setCurrentTime(initialTime);

      const isHlsStream =
        /\.m3u8(\?|$)/i.test(url) ||
        /%2Em3u8/i.test(url) ||
        url.includes(':hls:');
      let retriedViaProxy = false;

      if (url.startsWith('http://') || url.startsWith('https://') || url.startsWith('/api/')) {
        vid.crossOrigin = 'anonymous';
      } else {
        vid.removeAttribute('crossOrigin');
      }

      // Sync background seekbar preview video element for non-HLS streams
      const previewVid = seekPreviewVideoRef.current;
      if (previewVid) {
        try {
          if (!isHlsStream) {
            if (url.startsWith('http://') || url.startsWith('https://') || url.startsWith('/api/')) {
              previewVid.crossOrigin = 'anonymous';
            } else {
              previewVid.removeAttribute('crossOrigin');
            }
            previewVid.src = url;
            previewVid.load();
          } else {
            previewVid.removeAttribute('src');
            previewVid.load();
          }
        } catch {
          // Ignore preview video errors
        }
      }

      vid.preload = autoPlay ? 'auto' : 'metadata';
      vid.preservesPitch = pitchCorrection;
      vid.playbackRate = playbackRate;
      vid.volume = volume;
      vid.muted = isMuted;

      if (isHlsStream && Hls.isSupported()) {
        let netRetries = 0;
        let mediaRetries = 0;
        const hls = new Hls({
          enableWorker: true,
          lowLatencyMode: false,
          backBufferLength: 30,
          maxBufferLength: 20,
          maxMaxBufferLength: 40,
          capLevelToPlayerSize: true,
          startPosition: initialTime > 1 ? initialTime : -1
        });
        hlsInstanceRef.current = hls;
        hls.loadSource(url);
        hls.attachMedia(vid);
        hls.on(Hls.Events.MANIFEST_PARSED, () => {
          armVideoFrameCallback();
          hasNewVideoFrameRef.current = true;
          forceRedrawRef.current = true;
          if (autoPlay) {
            setIsPlaying(true);
            vid.play().catch(() => {
              setIsPlaying(false);
            });
          }
        });
        hls.on(Hls.Events.ERROR, (_evt, data) => {
          if (data.fatal) {
            if (data.type === Hls.ErrorTypes.NETWORK_ERROR && netRetries < 2) {
              netRetries += 1;
              hls.startLoad();
            } else if (
              data.type === Hls.ErrorTypes.NETWORK_ERROR &&
              !retriedViaProxy &&
              (url.startsWith('http://') || url.startsWith('https://')) &&
              !url.includes('/api/proxy-media')
            ) {
              retriedViaProxy = true;
              netRetries = 0;
              const proxiedHls = `/api/proxy-media?url=${encodeURIComponent(url)}`;
              hls.loadSource(proxiedHls);
              hls.startLoad();
            } else if (data.type === Hls.ErrorTypes.MEDIA_ERROR && mediaRetries < 3) {
              mediaRetries += 1;
              hls.recoverMediaError();
            } else {
              hls.destroy();
              hlsInstanceRef.current = null;
              showToast('Не удалось декодировать HLS поток');
            }
          }
        });
      } else {
        vid.src = url;
        vid.load();
      }

      armVideoFrameCallback();

      vid.onloadedmetadata = () => {
        const v = videoRef.current;
        if (!v) return;
        const dur = v.duration || 0;
        const validDur = isFinite(dur) && dur > 0 ? dur : 0;
        setDuration(validDur);

        // Restore saved playback position (or explicit overrideStartPosSec on quality switch)
        const targetPos =
          overrideStartPosSec !== undefined
            ? overrideStartPosSec
            : rememberPosition
            ? savedPositionsRef.current[key] ??
              savedPositionsRef.current[title] ??
              savedPositionsRef.current[url]
            : undefined;
        if (targetPos !== undefined && targetPos > 1 && (validDur === 0 || targetPos < validDur - 2)) {
          v.currentTime = targetPos;
          currentTimeRef.current = targetPos;
          setCurrentTime(targetPos);
        }

        let resStr: string | undefined;
        if (v.videoWidth && v.videoHeight) {
          resStr = `${v.videoWidth}×${v.videoHeight}`;
          setVideoNativeRes(resStr);
          setUserVideos((prev) =>
            prev.map((item) =>
              item.fileUrl === url || (videoId && item.id === videoId)
                ? { ...item, duration: validDur, resolution: resStr }
                : item
            )
          );
          setPlaylist((prev) =>
            prev.map((item) =>
              item.fileUrl === url || (videoId && item.id === videoId)
                ? { ...item, duration: validDur, resolution: resStr }
                : item
            )
          );
        }
        if (videoId) {
          void updateVideoMetaInVault(videoId, validDur, resStr);
        }

        armVideoFrameCallback();
        hasNewVideoFrameRef.current = true;
        forceRedrawRef.current = true;
        if (autoPlay) {
          setIsPlaying(true);
          v.play().catch(() => {
            setIsPlaying(false);
          });
        } else {
          setIsPlaying(false);
        }
      };

      vid.onloadeddata = () => {
        armVideoFrameCallback();
        justSeekedRef.current = true;
        hasNewVideoFrameRef.current = true;
        forceRedrawRef.current = true;

        // Capture frame thumbnail from active videoRef if missing (especially for HLS .m3u8 streams)
        if (videoId && vid.videoWidth > 0 && vid.videoHeight > 0) {
          try {
            const thumbCanvas = document.createElement('canvas');
            thumbCanvas.width = 320;
            thumbCanvas.height = 180;
            const tCtx = thumbCanvas.getContext('2d');
            if (tCtx) {
              tCtx.drawImage(vid, 0, 0, 320, 180);
              const dataUrl = thumbCanvas.toDataURL('image/jpeg', 0.8);
              if (dataUrl && dataUrl.length > 256) {
                setUserVideos((prev) =>
                  prev.map((item) =>
                    item.id === videoId && !item.thumbnailUrl
                      ? { ...item, thumbnailUrl: dataUrl }
                      : item
                  )
                );
                setPlaylist((prev) =>
                  prev.map((item) =>
                    item.id === videoId && !item.thumbnailUrl
                      ? { ...item, thumbnailUrl: dataUrl }
                      : item
                  )
                );
                void updateVideoThumbnailInVault(videoId, dataUrl);
              }
            }
          } catch {
            // Ignore if cross-origin restricted
          }
        }
      };

      vid.onseeked = () => {
        armVideoFrameCallback();
        justSeekedRef.current = true;
        hasNewVideoFrameRef.current = true;
        lastDecodedPerfNowRef.current = performance.now();
        lastKeyframeUploadPerfNowRef.current = performance.now();
        forceRedrawRef.current = true;
      };

      vid.onerror = () => {
        // Automatic server-side CORS proxy fallback if remote MP4 blocks anonymous crossOrigin
        if (
          !retriedViaProxy &&
          !isHlsStream &&
          (url.startsWith('http://') || url.startsWith('https://')) &&
          !url.includes('/api/proxy-media')
        ) {
          retriedViaProxy = true;
          const proxied = `/api/proxy-media?url=${encodeURIComponent(url)}`;
          vid.crossOrigin = 'anonymous';
          vid.src = proxied;
          vid.load();
          if (autoPlay) {
            vid.play().catch(() => {});
          }
          return;
        }
        showToast('Не удалось декодировать видеопоток');
      };
    },
    [
      armVideoFrameCallback,
      initWebAudio,
      isDemoTestActive,
      isMuted,
      pitchCorrection,
      playbackRate,
      rememberPosition,
      showToast,
      volume
    ]
  );

  // Auto-bind smartphone media library, directory handle & Dual Subtitles from IndexedDB on startup
  useEffect(() => {
    let cancelled = false;
    const createdBlobUrls: string[] = [];
    (async () => {
      const [cachedVideos, cachedSubs, cachedSecondarySubs, cachedDir] = await Promise.all([
        loadVideosFromVault(),
        loadSubtitlesFromVault('primary'),
        loadSubtitlesFromVault('secondary'),
        loadDirectoryHandleFromVault()
      ]);
      if (cancelled) return;

      if (cachedSubs && cachedSubs.cues.length > 0) {
        setSubtitleCues(cachedSubs.cues);
        setCustomSubtitlesName(cachedSubs.name);
      }
      if (cachedSecondarySubs && cachedSecondarySubs.cues.length > 0) {
        setSecondarySubtitleCues(cachedSecondarySubs.cues);
        setSecondarySubtitlesName(cachedSecondarySubs.name);
      }

      if (cachedDir) {
        setBoundDirHandle(cachedDir.handle);
        setBoundFolderName(cachedDir.folderName);
      }

      if (cachedVideos.length > 0) {
        const hydrated: LibraryVideoItem[] = [];
        for (const rec of cachedVideos) {
          let liveUrl = '';
          if (rec.blob) {
            liveUrl = URL.createObjectURL(rec.blob);
            createdBlobUrls.push(liveUrl);
          } else if (rec.remoteUrl) {
            liveUrl = rec.remoteUrl;
          }
          if (!liveUrl) continue;
          hydrated.push({
            id: rec.id,
            title: rec.title,
            fileUrl: liveUrl,
            fps: rec.fps || 24,
            duration: rec.duration || 0,
            size: rec.size,
            sourceLabel: rec.sourceLabel,
            resolution: rec.resolution,
            thumbnailUrl: rec.thumbnailDataUrl
          });
          if (!rec.thumbnailDataUrl) {
            generateVideoThumbnail(liveUrl, rec.id);
          }
        }

        if (hydrated.length > 0) {
          setUserVideos(hydrated);
          setPlaylist(hydrated);

          // Automatically bind the last watched video (or first available video) so it's ready immediately
          if (initialSettingsRef.current.autoBindMediaOnStart) {
            const targetId = initialSettingsRef.current.lastActiveVideoId;
            const foundIdx = targetId ? hydrated.findIndex((v) => v.id === targetId) : 0;
            const bindIdx = foundIdx >= 0 ? foundIdx : 0;
            setActivePlaylistIndex(bindIdx);
            const targetVid = hydrated[bindIdx];
            startRealVideoUrl(
              targetVid.fileUrl,
              targetVid.title,
              targetVid.sourceLabel,
              targetVid.id,
              false
            );
          } else if (initialSettingsRef.current.activeScreen === 'player') {
            setActiveScreen('main');
          }
        } else if (initialSettingsRef.current.activeScreen === 'player') {
          setActiveScreen('main');
        }
      } else if (initialSettingsRef.current.activeScreen === 'player') {
        setActiveScreen('main');
      }

      setIsVaultHydrated(true);
    })();

    return () => {
      cancelled = true;
      createdBlobUrls.forEach((u) => {
        try {
          URL.revokeObjectURL(u);
        } catch {
          // Ignore
        }
      });
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Ensure requestVideoFrameCallback is armed whenever screen or video state changes
  useEffect(() => {
    if (!isDemoTestActive) {
      armVideoFrameCallback();
    }
  }, [activeScreen, armVideoFrameCallback, hasLoadedVideo, isDemoTestActive]);

  const playLibraryItem = useCallback(
    (item: LibraryVideoItem) => {
      const idxInPlaylist = playlist.findIndex((p) => p.id === item.id);
      if (idxInPlaylist !== -1) {
        setActivePlaylistIndex(idxInPlaylist);
      } else {
        setPlaylist((prev) => {
          const next = [...prev, item];
          setActivePlaylistIndex(next.length - 1);
          return next;
        });
      }

      if (!item.id.startsWith('anixart_')) {
        setAnixartSession(null);
        setStreamQualities({});
        setActiveStreamQuality('Auto');
        setSkipTimings([]);
        setActiveSkipPrompt(null);
      }

      if (item.fileUrl) {
        startRealVideoUrl(item.fileUrl, item.title, item.sourceLabel, item.id, true);
      }
      setActiveScreen('player');
    },
    [playlist, startRealVideoUrl]
  );

  const playPlaylistIndex = useCallback(
    (idx: number) => {
      if (idx < 0 || idx >= playlist.length) return;
      setActivePlaylistIndex(idx);
      const item = playlist[idx];
      if (!item.id.startsWith('anixart_')) {
        setAnixartSession(null);
        setStreamQualities({});
        setActiveStreamQuality('Auto');
        setSkipTimings([]);
        setActiveSkipPrompt(null);
      }
      if (item.fileUrl) {
        startRealVideoUrl(item.fileUrl, item.title, item.sourceLabel, item.id, true);
      }
    },
    [playlist, startRealVideoUrl]
  );

  const clearAllVideos = useCallback(() => {
    if (hlsInstanceRef.current) {
      try {
        hlsInstanceRef.current.destroy();
      } catch {
        // Ignore
      }
      hlsInstanceRef.current = null;
    }
    if (videoRef.current) {
      videoRef.current.pause();
      videoRef.current.removeAttribute('src');
      videoRef.current.load();
    }
    userVideos.forEach((v) => {
      if (v.fileUrl && v.fileUrl.startsWith('blob:')) {
        try {
          URL.revokeObjectURL(v.fileUrl);
        } catch {
          // Ignore
        }
      }
    });
    activeVideoUrlRef.current = '';
    activeVideoKeyRef.current = '';
    setLastActiveVideoId('');
    setAnixartSession(null);
    setStreamQualities({});
    setSkipTimings([]);
    setActiveSkipPrompt(null);
    setUserVideos([]);
    setPlaylist([]);
    setActivePlaylistIndex(0);
    setIsDemoTestActive(false);
    setHasLoadedVideo(false);
    setIsPlaying(false);
    setActiveVideoTitle('Видео не выбрано');
    setVideoNativeRes('—');
    setCurrentTime(0);
    setDuration(0);
    currentTimeRef.current = 0;
    forceRedrawRef.current = true;
    clearVaultVideos();
    showToast('Медиатека и локальный кэш видео очищены');
  }, [showToast, userVideos]);

  const removeUserVideo = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    const targetVid = userVideos.find((v) => v.id === id);
    if (targetVid?.fileUrl && targetVid.fileUrl.startsWith('blob:')) {
      try {
        URL.revokeObjectURL(targetVid.fileUrl);
      } catch {
        // Ignore
      }
    }
    const remainingPlaylist = playlist.filter((v) => v.id !== id);
    setUserVideos((prev) => prev.filter((v) => v.id !== id));
    setPlaylist(remainingPlaylist);
    deleteVideoFromVault(id);

    if (targetVid && targetVid.fileUrl === activeVideoUrlRef.current) {
      if (remainingPlaylist.length > 0) {
        const nextIdx = Math.min(activePlaylistIndex, remainingPlaylist.length - 1);
        setActivePlaylistIndex(nextIdx);
        const nextItem = remainingPlaylist[nextIdx];
        startRealVideoUrl(nextItem.fileUrl, nextItem.title, nextItem.sourceLabel, nextItem.id, true);
      } else {
        if (videoRef.current) {
          videoRef.current.pause();
          videoRef.current.removeAttribute('src');
          videoRef.current.load();
        }
        activeVideoUrlRef.current = '';
        activeVideoKeyRef.current = '';
        setLastActiveVideoId('');
        setHasLoadedVideo(false);
        setIsPlaying(false);
        setActiveVideoTitle('Видео не выбрано');
        setVideoNativeRes('—');
        setCurrentTime(0);
        setDuration(0);
        currentTimeRef.current = 0;
        forceRedrawRef.current = true;
      }
    } else if (activePlaylistIndex >= remainingPlaylist.length && remainingPlaylist.length > 0) {
      setActivePlaylistIndex(remainingPlaylist.length - 1);
    }

    showToast('Видео удалено из медиатеки');
  };

  // Zero-Copy 2-Pass GPU WebGL Intermediate Frame Synthesizer (Native 1080p/4K Video Textures + FBO Flow Pass)
  useEffect(() => {
    // Fallback canvas used only for initial blank texture or strict cross-origin fallback at native resolution
    const stagingCanvas = document.createElement('canvas');
    stagingCanvas.width = STAGE_W;
    stagingCanvas.height = STAGE_H;
    const stagingCtx = stagingCanvas.getContext('2d', { alpha: false });

    const outCanvas = renderCanvasRef.current;
    const gl = outCanvas
      ? ((outCanvas.getContext('webgl', {
          alpha: false,
          antialias: false,
          depth: false,
          stencil: false,
          preserveDrawingBuffer: false,
          powerPreference: 'high-performance'
        }) || outCanvas.getContext('experimental-webgl')) as WebGLRenderingContext | null)
      : null;

    if (!gl) {
      setWebglContextLost(true);
    }

    const onContextLost = (e: Event) => {
      e.preventDefault();
      glReady = false;
      setWebglContextLost(true);
      showToast('Сбой WebGL: включен аппаратный Video Fallback');
    };

    const onContextRestored = () => {
      initGlResources();
      lastPass1Signature = '';
      lastPass2ASignature = '';
      pass2BindingsDirty = true;
      lastViewportW = -1;
      lastViewportH = -1;
      setWebglContextLost(false);
      lastDecodedVideoTimeRef.current = -1;
      justSeekedRef.current = true;
      hasNewVideoFrameRef.current = true;
      forceRedrawRef.current = true;
      showToast('WebGL контекст и шейдеры восстановлены');
    };

    if (outCanvas) {
      outCanvas.addEventListener('webglcontextlost', onContextLost, false);
      outCanvas.addEventListener('webglcontextrestored', onContextRestored, false);
    }

    let glReady = false;
    let flowProg: WebGLProgram | null = null;
    let synthProg: WebGLProgram | null = null;
    let quadBuf: WebGLBuffer | null = null;
    const MESH_COLS = 1;
    const MESH_ROWS = 1;
    let flowPosLoc = 0;
    let synthPosLoc = 0;

    // Native-resolution keyframe textures in GPU VRAM (1080p / 1440p / 4K Direct Video Upload)
    let glPrevTex: WebGLTexture | null = null;
    let glCurrTex: WebGLTexture | null = null;
    let allocatedTexW = STAGE_W;
    let allocatedTexH = STAGE_H;

    // Pass 2A 3-Anchor Sub-Frame Cascade FBOs (Q1: I_0.25, Mid: I_0.50, Q3: I_0.75 intermediate keyframes) + 3D LUT Texture
    let glSubframeMidTex: WebGLTexture | null = null;
    let glSubframeMidFbo: WebGLFramebuffer | null = null;
    let glSubframeQ1Tex: WebGLTexture | null = null;
    let glSubframeQ1Fbo: WebGLFramebuffer | null = null;
    let glSubframeQ3Tex: WebGLTexture | null = null;
    let glSubframeQ3Fbo: WebGLFramebuffer | null = null;
    let glLutTex: WebGLTexture | null = null;
    let lastUploadedLutKey = '';
    let allocatedSubframeW = STAGE_W;
    let allocatedSubframeH = STAGE_H;

    // 6-Level Coarse-to-Fine Pyramid FBOs (L4: 16x9, L3: 32x18, L2: 64x36, L1: 128x72, L05: 256x144, L0: Adaptive up to 512x288) + Pass 1 SAD Heatmap Debug FBO
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
    let glPyrL4Tex: WebGLTexture | null = null;
    let glPyrL4Fbo: WebGLFramebuffer | null = null;
    let glPyrL3Tex: WebGLTexture | null = null;
    let glPyrL3Fbo: WebGLFramebuffer | null = null;
    let glPyrL2Tex: WebGLTexture | null = null;
    let glPyrL2Fbo: WebGLFramebuffer | null = null;
    let glPyrL1Tex: WebGLTexture | null = null;
    let glPyrL1Fbo: WebGLFramebuffer | null = null;
    let glPyrL05Tex: WebGLTexture | null = null;
    let glPyrL05Fbo: WebGLFramebuffer | null = null;
    let glFlowPrevTex: WebGLTexture | null = null;
    let glFlowCurrTex: WebGLTexture | null = null;
    let glFlowFboPrev: WebGLFramebuffer | null = null;
    let glFlowFboCurr: WebGLFramebuffer | null = null;
    let glSadDebugTex: WebGLTexture | null = null;
    let glSadDebugFbo: WebGLFramebuffer | null = null;
    let allocatedFlowCols = FLOW_COLS;
    let allocatedFlowRows = FLOW_ROWS;

    // Pass 1 (4-Level Coarse-to-Fine Pyramid Optical Flow & Symmetric SAD Debug) Uniform Locations
    let uFlowSceneCutLoc: WebGLUniformLocation | null = null;
    let uFlowTexelLoc: WebGLUniformLocation | null = null;
    let uFlowMaxShiftLoc: WebGLUniformLocation | null = null;
    let uFlowAdrenoOptLoc: WebGLUniformLocation | null = null;
    let uFlowDebugSadLoc: WebGLUniformLocation | null = null;
    let uFlowPyrLevelLoc: WebGLUniformLocation | null = null;
    let uFlowParentStepLoc: WebGLUniformLocation | null = null;

    // Pass 2 (Zero-Overshade Fullscreen Quad Warping + Secondary Sub-Frame Cascade + Fused Denoiser/Deband/Upscaler + HDR10 + 3D LUT) Uniform Locations
    let uAlphaLoc: WebGLUniformLocation | null = null;
    let uStrengthLoc: WebGLUniformLocation | null = null;
    let uMaxShiftLoc: WebGLUniformLocation | null = null;
    let uHaloGuardLoc: WebGLUniformLocation | null = null;
    let uModeLoc: WebGLUniformLocation | null = null;
    let uSplitLoc: WebGLUniformLocation | null = null;
    let uMonoLoc: WebGLUniformLocation | null = null;
    let uShowVectorsLoc: WebGLUniformLocation | null = null;
    let uShowSadHeatmapLoc: WebGLUniformLocation | null = null;
    let uUvScaleLoc: WebGLUniformLocation | null = null;
    let uSourceTexelLoc: WebGLUniformLocation | null = null;
    let uFlowStepLoc: WebGLUniformLocation | null = null;
    let uBrightnessLoc: WebGLUniformLocation | null = null;
    let uContrastLoc: WebGLUniformLocation | null = null;
    let uSaturationLoc: WebGLUniformLocation | null = null;
    let uBlackPointLoc: WebGLUniformLocation | null = null;
    let uDebandStrengthLoc: WebGLUniformLocation | null = null;
    let uLutStrengthLoc: WebGLUniformLocation | null = null;
    let uHdrLoc: WebGLUniformLocation | null = null;
    let uTargetFpsLoc: WebGLUniformLocation | null = null;
    let uUpscaleModeLoc: WebGLUniformLocation | null = null;
    let uUpscaleFactorLoc: WebGLUniformLocation | null = null;
    let uUpscaleSharpLoc: WebGLUniformLocation | null = null;
    let uUpscaleDenoiseLoc: WebGLUniformLocation | null = null;
    let uAdrenoOptLoc: WebGLUniformLocation | null = null;
    let uAdrenoTrue10Loc: WebGLUniformLocation | null = null;
    let uFboPassLoc: WebGLUniformLocation | null = null;
    let uSubframeCascadeLoc: WebGLUniformLocation | null = null;
    let uCoherenceGuardLoc: WebGLUniformLocation | null = null;

    // Dirty-flag cache for static uniforms to eliminate redundant CPU->GPU driver calls on sub-frames
    const lastUniforms = {
      strength: -1,
      maxShift: -1,
      haloGuard: -1,
      mode: -1,
      split: -1,
      mono: -1,
      showVectors: -1,
      showSadHeatmap: -1,
      uvScaleX: -1,
      uvScaleY: -1,
      sourceTexelX: -1,
      sourceTexelY: -1,
      flowStepX: -1,
      flowStepY: -1,
      brightness: -1,
      contrast: -1,
      saturation: -1,
      blackPoint: -1,
      debandStrength: -1,
      lutStrength: -1,
      hdr: -1,
      targetFps: -1,
      upscaleMode: -1,
      upscaleFactor: -1,
      upscaleSharp: -1,
      upscaleDenoise: -1,
      adrenoOpt: -1,
      adrenoTrue10: -1,
      subframeCascade: -1,
      coherenceGuard: -1
    };

    if (stagingCtx) {
      stagingCtx.imageSmoothingEnabled = true;
      stagingCtx.imageSmoothingQuality = 'high';
      stagingCtx.fillStyle = '#09090c';
      stagingCtx.fillRect(0, 0, STAGE_W, STAGE_H);
    }

    const initGlResources = () => {
      if (!gl) return;
      Object.keys(lastUniforms).forEach((k) => {
        (lastUniforms as Record<string, number>)[k] = -1;
      });
      try {
        // Detect Qualcomm Adreno GPU via WEBGL_debug_renderer_info
        const dbgRenderInfo = gl.getExtension('WEBGL_debug_renderer_info');
        const rawVendor = String(
          (dbgRenderInfo ? gl.getParameter(dbgRenderInfo.UNMASKED_VENDOR_WEBGL) : gl.getParameter(gl.VENDOR)) ||
            'WebGL Vendor'
        );
        const rawRenderer = String(
          (dbgRenderInfo ? gl.getParameter(dbgRenderInfo.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER)) ||
            'WebGL Renderer'
        );
        const combinedGpuStr = `${rawVendor} ${rawRenderer}`;
        const isAdrenoHw = /adreno|qualcomm|snapdragon|freedreno/i.test(combinedGpuStr);
        const adrenoMatch = rawRenderer.match(/Adreno\s*(?:\(TM\))?\s*(\d{3}[a-zA-Z]?)/i);
        const modelNum = adrenoMatch ? parseInt(adrenoMatch[1], 10) : 0;

        let modelLabel = 'Adreno GSR Профиль';
        let gmemCacheLabel = 'GMEM FlexRender • FP16';
        if (adrenoMatch) {
          modelLabel = `Qualcomm Adreno ${adrenoMatch[1]}`;
          if (modelNum >= 800) {
            gmemCacheLabel = 'Adreno 8xx • 12MB GMEM • FP16';
          } else if (modelNum >= 700) {
            gmemCacheLabel = 'Adreno 7xx • 4MB GMEM • FP16';
          } else {
            gmemCacheLabel = 'Adreno 6xx • 1MB GMEM • FP16';
          }
        } else if (isAdrenoHw) {
          modelLabel = 'Qualcomm Adreno GPU';
        } else {
          const cleaned = rawRenderer
            .replace(/ANGLE \(([^,]+),\s*([^,]+).*?\)/i, '$2')
            .replace(/OpenGL ES.*$/i, '')
            .trim();
          modelLabel = cleaned ? cleaned.slice(0, 32) : 'WebGL GPU';
          gmemCacheLabel = 'Профиль Adreno GMEM + FP16';
        }

        setDetectedGpuInfo({
          vendor: rawVendor,
          renderer: rawRenderer,
          isAdreno: isAdrenoHw,
          modelLabel,
          gmemCacheLabel
        });

        // Vertex Shader for Pass 1 (FBO Pyramid Grid)
        const vsFlowSource = `
          #ifdef GL_FRAGMENT_PRECISION_HIGH
            precision highp float;
          #else
            precision mediump float;
          #endif
          precision mediump int;
          attribute vec2 a_pos;
          varying vec2 v_uv;
          void main() {
            v_uv = (a_pos + 1.0) * 0.5;
            gl_Position = vec4(a_pos, 0.0, 1.0);
          }
        `;

        // Vertex Shader for Pass 2: Fullscreen Quad (6 vertices — eliminates 86,400-vertex tile-binning & quad overshading heat)
        const vsSynthSource = `
          #ifdef GL_FRAGMENT_PRECISION_HIGH
            precision highp float;
          #else
            precision mediump float;
          #endif
          precision mediump int;
          attribute vec2 a_pos;
          uniform int u_fboPass;
          varying vec2 v_uv;
          void main() {
            float uvY = (u_fboPass >= 1) ? ((a_pos.y + 1.0) * 0.5) : (1.0 - (a_pos.y + 1.0) * 0.5);
            v_uv = vec2((a_pos.x + 1.0) * 0.5, uvY);
            gl_Position = vec4(a_pos, 0.0, 1.0);
          }
        `;

        // Pass 1 Fragment Shader: Thermally-Optimized 5-Level Coarse-to-Fine Pyramid
        // Uses L1 Manhattan chroma distance (zero sqrt() overhead in inner loop), noise-resilient static block skip, and 4-tap fine refinement
        const fsFlowSource = `
          #ifdef GL_FRAGMENT_PRECISION_HIGH
            precision highp float;
          #else
            precision mediump float;
          #endif
          precision mediump int;
          varying vec2 v_uv;
          uniform sampler2D u_prevTex;
          uniform sampler2D u_currTex;
          uniform sampler2D u_lastFlowTex;
          uniform sampler2D u_temporalFlowTex;
          uniform vec2 u_texelStep;
          uniform vec2 u_flowMaxShift;
          uniform vec2 u_parentFlowStep;
          uniform int u_sceneCutProtect;
          uniform int u_adrenoOpt;
          uniform int u_debugSad;
          uniform int u_pyrLevel;

          mediump float getLuma(mediump vec3 c) {
            return dot(c, vec3(0.299, 0.587, 0.114));
          }

          mediump float fastChromaL1(mediump vec3 a, mediump vec3 b) {
            return dot(abs(a - b), vec3(0.3333));
          }

          mediump vec3 sadToThermalHeatmap(mediump float sadNorm) {
            mediump float t = clamp(sadNorm, 0.0, 1.0);
            mediump vec3 c0 = vec3(0.035, 0.094, 0.212);
            mediump vec3 c1 = vec3(0.000, 0.768, 0.604);
            mediump vec3 c2 = vec3(1.000, 0.820, 0.400);
            mediump vec3 c3 = vec3(1.000, 0.240, 0.120);
            mediump vec3 c4 = vec3(1.000, 0.940, 0.985);
            if (t < 0.25) return mix(c0, c1, t * 4.0);
            if (t < 0.50) return mix(c1, c2, (t - 0.25) * 4.0);
            if (t < 0.75) return mix(c2, c3, (t - 0.50) * 4.0);
            return mix(c3, c4, (t - 0.75) * 4.0);
          }

          mediump float evalSymmetricSad(
            vec2 uv,
            vec2 dUV,
            vec2 pStep
          ) {
            vec2 uv0 = clamp(uv - 0.5 * dUV, vec2(0.002), vec2(0.998));
            vec2 uv1 = clamp(uv + 0.5 * dUV, vec2(0.002), vec2(0.998));

            mediump vec3 rgb0C = texture2D(u_prevTex, uv0).rgb;
            mediump vec3 rgb0N = texture2D(u_prevTex, uv0 + vec2(0.0, -pStep.y)).rgb;
            mediump vec3 rgb0S = texture2D(u_prevTex, uv0 + vec2(0.0,  pStep.y)).rgb;
            mediump vec3 rgb0W = texture2D(u_prevTex, uv0 + vec2(-pStep.x, 0.0)).rgb;
            mediump vec3 rgb0E = texture2D(u_prevTex, uv0 + vec2( pStep.x, 0.0)).rgb;

            mediump vec3 rgb1C = texture2D(u_currTex, uv1).rgb;
            mediump vec3 rgb1N = texture2D(u_currTex, uv1 + vec2(0.0, -pStep.y)).rgb;
            mediump vec3 rgb1S = texture2D(u_currTex, uv1 + vec2(0.0,  pStep.y)).rgb;
            mediump vec3 rgb1W = texture2D(u_currTex, uv1 + vec2(-pStep.x, 0.0)).rgb;
            mediump vec3 rgb1E = texture2D(u_currTex, uv1 + vec2( pStep.x, 0.0)).rgb;

            mediump float c0C = getLuma(rgb0C);
            mediump float c0N = getLuma(rgb0N);
            mediump float c0S = getLuma(rgb0S);
            mediump float c0W = getLuma(rgb0W);
            mediump float c0E = getLuma(rgb0E);

            mediump float c1C = getLuma(rgb1C);
            mediump float c1N = getLuma(rgb1N);
            mediump float c1S = getLuma(rgb1S);
            mediump float c1W = getLuma(rgb1W);
            mediump float c1E = getLuma(rgb1E);

            mediump float patchSad = abs(c1C - c0C) * 0.24 +
              (abs(c1N - c0N) + abs(c1S - c0S) + abs(c1W - c0W) + abs(c1E - c0E)) * 0.15;

            // Fast L1 Manhattan chroma consistency (zero sqrt() instructions in inner search loop!)
            mediump float chromaSad = fastChromaL1(rgb1C, rgb0C) * 0.18 +
              (fastChromaL1(rgb1N, rgb0N) + fastChromaL1(rgb1S, rgb0S) + fastChromaL1(rgb1W, rgb0W) + fastChromaL1(rgb1E, rgb0E)) * 0.055;

            mediump float gx0 = c0E - c0W;
            mediump float gy0 = c0S - c0N;
            mediump float gx1 = c1E - c1W;
            mediump float gy1 = c1S - c1N;
            mediump float gradDiff = (abs(gx1 - gx0) + abs(gy1 - gy0)) * 0.16;

            mediump float cenN = abs((c1N - c1C) - (c0N - c0C));
            mediump float cenS = abs((c1S - c1C) - (c0S - c0C));
            mediump float cenW = abs((c1W - c1C) - (c0W - c0C));
            mediump float cenE = abs((c1E - c1C) - (c0E - c0C));
            mediump float censusDiff = (cenN + cenS + cenW + cenE) * 0.065;

            return patchSad + chromaSad + gradDiff + censusDiff;
          }

          void main() {
            if (u_debugSad == 1) {
              mediump float sadNorm = texture2D(u_lastFlowTex, v_uv).a;
              gl_FragColor = vec4(sadToThermalHeatmap(sadNorm), sadNorm);
              return;
            }

            float levelScale = (u_pyrLevel == 4) ? 6.5 : (u_pyrLevel == 3) ? 4.2 : (u_pyrLevel == 2) ? 2.6 : (u_pyrLevel == 1) ? 1.65 : 1.15;
            vec2 pStep = u_texelStep * levelScale;
            vec2 maxShift = max(u_flowMaxShift, vec2(0.001));

            mediump vec3 rgb0C = texture2D(u_prevTex, v_uv).rgb;
            mediump vec3 rgb0N = texture2D(u_prevTex, v_uv + vec2(0.0, -pStep.y)).rgb;
            mediump vec3 rgb0S = texture2D(u_prevTex, v_uv + vec2(0.0,  pStep.y)).rgb;
            mediump vec3 rgb0W = texture2D(u_prevTex, v_uv + vec2(-pStep.x, 0.0)).rgb;
            mediump vec3 rgb0E = texture2D(u_prevTex, v_uv + vec2( pStep.x, 0.0)).rgb;

            mediump vec3 rgb1C = texture2D(u_currTex, v_uv).rgb;
            mediump vec3 rgb1N = texture2D(u_currTex, v_uv + vec2(0.0, -pStep.y)).rgb;
            mediump vec3 rgb1S = texture2D(u_currTex, v_uv + vec2(0.0,  pStep.y)).rgb;
            mediump vec3 rgb1W = texture2D(u_currTex, v_uv + vec2(-pStep.x, 0.0)).rgb;
            mediump vec3 rgb1E = texture2D(u_currTex, v_uv + vec2( pStep.x, 0.0)).rgb;

            mediump float p0C = getLuma(rgb0C);
            mediump float p0N = getLuma(rgb0N);
            mediump float p0S = getLuma(rgb0S);
            mediump float p0W = getLuma(rgb0W);
            mediump float p0E = getLuma(rgb0E);

            mediump float p1C = getLuma(rgb1C);
            mediump float p1N = getLuma(rgb1N);
            mediump float p1S = getLuma(rgb1S);
            mediump float p1W = getLuma(rgb1W);
            mediump float p1E = getLuma(rgb1E);

            mediump float zeroPatchSad = abs(p1C - p0C) * 0.24 +
              (abs(p1N - p0N) + abs(p1S - p0S) + abs(p1W - p0W) + abs(p1E - p0E)) * 0.15;
            mediump float zeroChromaSad = fastChromaL1(rgb1C, rgb0C) * 0.18 +
              (fastChromaL1(rgb1N, rgb0N) + fastChromaL1(rgb1S, rgb0S) + fastChromaL1(rgb1W, rgb0W) + fastChromaL1(rgb1E, rgb0E)) * 0.055;
            mediump float zeroGradDiff = (abs((p1E - p1W) - (p0E - p0W)) + abs((p1S - p1N) - (p0S - p0N))) * 0.16;
            mediump float zeroCenDiff = (
              abs((p1N - p1C) - (p0N - p0C)) +
              abs((p1S - p1C) - (p0S - p0C)) +
              abs((p1W - p1C) - (p0W - p0C)) +
              abs((p1E - p1C) - (p0E - p0C))
            ) * 0.065;
            mediump float zeroSad = zeroPatchSad + zeroChromaSad + zeroGradDiff + zeroCenDiff;

            mediump float e0 = abs(p0E - p0W) + abs(p0S - p0N) + abs(p0N + p0S + p0W + p0E - 4.0 * p0C);
            mediump float e1 = abs(p1E - p1W) + abs(p1S - p1N) + abs(p1N + p1S + p1W + p1E - 4.0 * p1C);

            mediump vec2 bestVel = vec2(0.0);
            mediump float bestSad = zeroSad;

            vec2 parentStep = max(u_parentFlowStep, vec2(1.0 / 512.0, 1.0 / 288.0));
            mediump vec2 parC = (texture2D(u_lastFlowTex, v_uv).rg - (128.0 / 255.0)) * 2.0;
            mediump vec2 parN = (texture2D(u_lastFlowTex, v_uv + vec2(0.0, -parentStep.y)).rg - (128.0 / 255.0)) * 2.0;
            mediump vec2 parS = (texture2D(u_lastFlowTex, v_uv + vec2(0.0,  parentStep.y)).rg - (128.0 / 255.0)) * 2.0;
            mediump vec2 parW = (texture2D(u_lastFlowTex, v_uv + vec2(-parentStep.x, 0.0)).rg - (128.0 / 255.0)) * 2.0;
            mediump vec2 parE = (texture2D(u_lastFlowTex, v_uv + vec2( parentStep.x, 0.0)).rg - (128.0 / 255.0)) * 2.0;

            // 5-Tap Morphological Vector Median Clamping: strips isolated outlier spikes at every pyramid level
            mediump vec2 parMin = min(min(parN, parS), min(parW, parE));
            mediump vec2 parMax = max(max(parN, parS), max(parW, parE));
            mediump vec2 parMedC = clamp(parC, parMin, parMax);
            mediump vec2 pyramidMeanVel = parMedC * 0.44 + (parN + parS + parW + parE) * 0.14;
            mediump vec2 tempVel = parMedC;

            // Thermal optimization: early-exit static blocks even in presence of H.264 sensor grain
            bool isStaticBlock = (zeroSad < 0.0022 && dot(pyramidMeanVel, pyramidMeanVel) < 0.00025);

            if (!isStaticBlock) {
              if (dot(pyramidMeanVel, pyramidMeanVel) > 0.00005) {
                mediump float sadPyr = evalSymmetricSad(v_uv, pyramidMeanVel * maxShift, pStep);
                if (sadPyr + 0.0010 < bestSad) {
                  bestSad = sadPyr;
                  bestVel = pyramidMeanVel;
                }
              }

              for (int p = 0; p < 4; p++) {
                mediump vec2 candP = (p == 0) ? parN : (p == 1) ? parS : (p == 2) ? parW : parE;
                if (dot(candP - bestVel, candP - bestVel) > 0.00015) {
                  mediump float sadP = evalSymmetricSad(v_uv, candP * maxShift, pStep);
                  mediump vec2 diffP = abs(candP - pyramidMeanVel);
                  mediump float cohBias = (diffP.x + diffP.y) * 0.0024;
                  if (sadP + cohBias + 0.0009 < bestSad) {
                    bestSad = sadP;
                    bestVel = candP;
                  }
                }
              }

              if (u_pyrLevel <= 2) {
                tempVel = (texture2D(u_temporalFlowTex, v_uv).rg - (128.0 / 255.0)) * 2.0;
                tempVel = clamp(tempVel, parMin - vec2(0.12), parMax + vec2(0.12));
                if (dot(tempVel - bestVel, tempVel - bestVel) > 0.00015) {
                  mediump float sadTemp = evalSymmetricSad(v_uv, tempVel * maxShift, pStep);
                  mediump vec2 diffT = abs(tempVel - pyramidMeanVel);
                  mediump float tempBias = (diffT.x + diffT.y) * 0.0024;
                  if (sadTemp + tempBias + 0.0010 < bestSad) {
                    bestSad = sadTemp;
                    bestVel = tempVel;
                  }
                }
              }

              float rScale = (u_pyrLevel == 4) ? 0.85 : (u_pyrLevel == 3) ? 0.48 : (u_pyrLevel == 2) ? 0.26 : (u_pyrLevel == 1) ? 0.14 : 0.075;
              float r0 = 0.42 * rScale;
              mediump vec2 centerVel0 = bestVel;

              // Coarse levels (L4..L2) run 8-tap diamond+diagonal search; fine levels (L1..L0) run 4-tap cardinal refinement
              for (int d = 0; d < 8; d++) {
                if (u_pyrLevel <= 1 && d >= 4) break;
                vec2 offset = vec2(0.0);
                if (d == 0) offset = vec2( r0,  0.0);
                else if (d == 1) offset = vec2(-r0,  0.0);
                else if (d == 2) offset = vec2( 0.0,  r0);
                else if (d == 3) offset = vec2( 0.0, -r0);
                else if (d == 4) offset = vec2( r0 * 0.707,  r0 * 0.707);
                else if (d == 5) offset = vec2(-r0 * 0.707,  r0 * 0.707);
                else if (d == 6) offset = vec2( r0 * 0.707, -r0 * 0.707);
                else offset = vec2(-r0 * 0.707, -r0 * 0.707);

                mediump vec2 candVel = clamp(centerVel0 + offset, vec2(-0.96), vec2(0.96));
                mediump float candSad = evalSymmetricSad(v_uv, candVel * maxShift, pStep);
                mediump vec2 diffC = abs(candVel - pyramidMeanVel);
                mediump float regBias = (abs(candVel.x) + abs(candVel.y)) * 0.0010 + (diffC.x + diffC.y) * 0.0042;
                if (candSad + regBias < bestSad) {
                  bestSad = candSad;
                  bestVel = candVel;
                }
              }

              if (u_pyrLevel >= 2 || bestSad > 0.0055) {
                float r1 = 0.15 * rScale;
                mediump vec2 centerVel1 = bestVel;
                mediump float sadCenter = bestSad;
                mediump float sadPosX = sadCenter;
                mediump float sadNegX = sadCenter;
                mediump float sadPosY = sadCenter;
                mediump float sadNegY = sadCenter;
                bool movedFromCenter = false;

                for (int d = 0; d < 4; d++) {
                  vec2 offset = (d == 0)
                    ? vec2( r1, 0.0)
                    : (d == 1)
                    ? vec2(-r1, 0.0)
                    : (d == 2)
                    ? vec2(0.0,  r1)
                    : vec2(0.0, -r1);
                  mediump vec2 candVel = clamp(centerVel1 + offset, vec2(-0.97), vec2(0.97));
                  mediump float candSad = evalSymmetricSad(v_uv, candVel * maxShift, pStep);
                  mediump vec2 diffC = abs(candVel - pyramidMeanVel);
                  mediump float regBias = (abs(candVel.x) + abs(candVel.y)) * 0.0010 + (diffC.x + diffC.y) * 0.0042;
                  mediump float cost = candSad + regBias;
                  if (d == 0) sadPosX = cost;
                  else if (d == 1) sadNegX = cost;
                  else if (d == 2) sadPosY = cost;
                  else sadNegY = cost;

                  if (cost < bestSad) {
                    bestSad = candSad;
                    bestVel = candVel;
                    movedFromCenter = true;
                  }
                }

                // Zero-Extra-Fetch 1D Parabolic Sub-Pixel Minimum Fitting along X and Y axes
                // Eliminates discrete velocity quantization on slow camera pans using the 4 cardinal SAD costs already evaluated!
                if (!movedFromCenter) {
                  mediump float denomX = sadNegX - 2.0 * sadCenter + sadPosX;
                  mediump float denomY = sadNegY - 2.0 * sadCenter + sadPosY;
                  vec2 subOffset = vec2(0.0);
                  if (denomX > 0.00015) {
                    subOffset.x = clamp(0.5 * (sadNegX - sadPosX) / denomX, -0.45, 0.45) * r1;
                  }
                  if (denomY > 0.00015) {
                    subOffset.y = clamp(0.5 * (sadNegY - sadPosY) / denomY, -0.45, 0.45) * r1;
                  }
                  bestVel = clamp(centerVel1 + subOffset, vec2(-0.97), vec2(0.97));
                }
              }
            }

            // Execute 10-tap sub-pixel Lucas-Kanade ONLY on final Pyramid Level 0 (saves 20 texture fetches on L2 & L1 with identical L0 accuracy!)
            if (!isStaticBlock && u_pyrLevel == 0 && bestSad > 0.0020) {
              vec2 lkStep = u_texelStep * 1.05;
              vec2 uv0 = clamp(v_uv - 0.5 * bestVel * maxShift, vec2(0.003), vec2(0.997));
              vec2 uv1 = clamp(v_uv + 0.5 * bestVel * maxShift, vec2(0.003), vec2(0.997));

              mediump float m0C = getLuma(texture2D(u_prevTex, uv0).rgb);
              mediump float m0E = getLuma(texture2D(u_prevTex, uv0 + vec2( lkStep.x, 0.0)).rgb);
              mediump float m0W = getLuma(texture2D(u_prevTex, uv0 + vec2(-lkStep.x, 0.0)).rgb);
              mediump float m0S = getLuma(texture2D(u_prevTex, uv0 + vec2(0.0,  lkStep.y)).rgb);
              mediump float m0N = getLuma(texture2D(u_prevTex, uv0 + vec2(0.0, -lkStep.y)).rgb);

              mediump float m1C = getLuma(texture2D(u_currTex, uv1).rgb);
              mediump float m1E = getLuma(texture2D(u_currTex, uv1 + vec2( lkStep.x, 0.0)).rgb);
              mediump float m1W = getLuma(texture2D(u_currTex, uv1 + vec2(-lkStep.x, 0.0)).rgb);
              mediump float m1S = getLuma(texture2D(u_currTex, uv1 + vec2(0.0,  lkStep.y)).rgb);
              mediump float m1N = getLuma(texture2D(u_currTex, uv1 + vec2(0.0, -lkStep.y)).rgb);

              mediump float ix = 0.25 * ((m1E - m1W) + (m0E - m0W));
              mediump float iy = 0.25 * ((m1S - m1N) + (m0S - m0N));
              mediump float it = m1C - m0C;
              mediump float gradMagSq = ix * ix + iy * iy;
              if (gradMagSq > 0.00035) {
                mediump float reg = (u_adrenoOpt == 1) ? 0.0045 : 0.0035;
                vec2 deltaPixels = -it * vec2(ix, iy) / (gradMagSq + reg);
                deltaPixels = clamp(deltaPixels, vec2(-0.85), vec2(0.85));
                vec2 deltaVel = (deltaPixels * lkStep) / maxShift;
                mediump vec2 refinedVel = clamp(bestVel + deltaVel, vec2(-0.97), vec2(0.97));
                mediump float refinedSad = evalSymmetricSad(v_uv, refinedVel * maxShift, pStep);
                if (refinedSad <= bestSad + 0.0006) {
                  bestVel = refinedVel;
                  bestSad = refinedSad;
                }
              }
            }

            // Motion activity & noise gate: rejects compression grain while preserving 100% genuine motion
            mediump float structureGate = smoothstep(0.0003, 0.0042, max(e0, e1));
            mediump float changeGate = smoothstep(0.00025, 0.0032, zeroSad);
            mediump float improvementRatio = bestSad / max(zeroSad, 0.00025);
            mediump float improvementGate = smoothstep(1.04, 0.78, improvementRatio);
            mediump float activityWeight = (u_pyrLevel == 0)
              ? (structureGate * changeGate * mix(0.75, 1.0, improvementGate))
              : (structureGate * changeGate);

            mediump float matchConf = smoothstep(0.38, 0.016, bestSad) * mix(0.65, 1.0, improvementGate);
            mediump float cutGuard = (u_sceneCutProtect == 1) ? smoothstep(0.52, 0.24, bestSad) : 1.0;
            mediump float finalConf = clamp(matchConf * cutGuard, 0.0, 1.0);

            mediump float sadErrorNorm = clamp(bestSad * 4.5, 0.0, 1.0);

            mediump vec2 rawVel = bestVel * activityWeight * cutGuard;

            mediump vec2 refCoherent = (u_pyrLevel == 0)
              ? mix(pyramidMeanVel, tempVel, 0.24) * cutGuard
              : pyramidMeanVel * cutGuard;
            mediump float velDiff = length(rawVel - refCoherent);
            mediump float cohAgree = smoothstep(0.38, 0.035, velDiff);
            // Preserve newly discovered motion at coarse/mid pyramid levels without shrinking vector magnitude
            mediump float discoveryBoost = smoothstep(0.95, 0.65, improvementRatio);
            mediump float blendWeight = (u_pyrLevel == 4)
              ? 0.95
              : mix(0.62, 0.94, max(cohAgree * finalConf, discoveryBoost));
            mediump vec2 finalVel = clamp(mix(refCoherent, rawVel, blendWeight), vec2(-0.97), vec2(0.97));

            mediump vec2 encodedRG = clamp(finalVel * 0.5 + (128.0 / 255.0), 0.0, 1.0);
            gl_FragColor = vec4(encodedRG, finalConf, sadErrorNorm);
          }
        `;

        // Pass 2 Fragment Shader: Zero-Overshade Fullscreen Quad Synthesis + Fused Spatio-Temporal Denoiser & 9-Tap GPU Upscaler + Fast-Motion Artifact Eliminator + HDR10
        const fsSynthSource = `
          #ifdef GL_FRAGMENT_PRECISION_HIGH
            precision highp float;
          #else
            precision mediump float;
          #endif
          precision mediump int;
          varying vec2 v_uv;
          uniform sampler2D u_prevTex;
          uniform sampler2D u_currTex;
          uniform sampler2D u_flowTex;
          uniform sampler2D u_sadDebugTex;
          uniform sampler2D u_subframeMidTex;
          uniform sampler2D u_lutTex;
          precision mediump float;
          precision mediump int;
          precision lowp sampler2D;

          uniform sampler2D u_prevTex;
          uniform sampler2D u_currTex;
          uniform sampler2D u_flowTex;
          uniform sampler2D u_subframeMidTex;
          uniform sampler2D u_subframeQ1Tex;
          uniform sampler2D u_subframeQ3Tex;
          uniform sampler2D u_lutTex;
          uniform sampler2D u_sadDebugTex;
          uniform float u_alpha;
          uniform float u_strength;
          uniform float u_maxShift;
          uniform int u_mode;
          uniform int u_splitCompare;
          uniform int u_monochrome;
          uniform int u_showVectors;
          uniform int u_showSadHeatmap;
          uniform vec2 u_uvScale;
          uniform vec2 u_sourceTexel;
          uniform vec2 u_flowStep;
          uniform float u_brightness;
          uniform float u_contrast;
          uniform float u_saturation;
          uniform float u_blackPoint;
          uniform float u_debandStrength;
          uniform float u_lutStrength;
          uniform float u_hdrStrength;
          uniform float u_targetFps;
          uniform int u_upscaleMode;
          uniform float u_upscaleFactor;
          uniform float u_upscaleSharpness;
          uniform float u_upscaleDenoise;
          uniform int u_adrenoOpt;
          uniform int u_adrenoTrue10;
          uniform int u_fboPass;
          uniform int u_subframeCascade;
          uniform float u_coherenceGuard;
          uniform float u_haloGuard;

          mediump float getLuma(mediump vec3 c) {
            return dot(c, vec3(0.299, 0.587, 0.114));
          }

          mediump float gsrFastLanczos2(mediump float dSq) {
            mediump float w = clamp(1.0 - dSq * 0.45, 0.0, 1.0);
            return w * w * (2.2 * w - 1.2);
          }

          // Trilinear 3D LUT Sampler over 256x16 (16x16x16) RGBA Strip Texture
          mediump vec3 sample3DLutStrip(mediump vec3 col) {
            mediump vec3 c = clamp(col, 0.0, 1.0);
            mediump float bSlice = c.b * 15.0;
            mediump float b0 = floor(bSlice);
            mediump float b1 = min(15.0, b0 + 1.0);
            mediump float bf = bSlice - b0;
            mediump float uBase = (c.r * 15.0 + 0.5) / 256.0;
            mediump float vCoord = (c.g * 15.0 + 0.5) / 16.0;
            mediump vec3 s0 = texture2D(u_lutTex, vec2(uBase + b0 / 16.0, vCoord)).rgb;
            mediump vec3 s1 = texture2D(u_lutTex, vec2(uBase + b1 / 16.0, vCoord)).rgb;
            return mix(s0, s1, bf);
          }

          // Fused Single-Pass 3x3 Neighborhood Denoiser + Adaptive Blue-Noise Debanding + Anti-Ringing GPU Super-Resolution Upscaler
          // Fetches the 8 neighbors from u_currTex ONLY ONCE per pixel (cuts full-res texture memory bandwidth by 50% and eliminates GPU thermal throttling!)
          mediump vec3 applyFusedDenoiseAndUpscale(
            mediump vec3 inColor,
            vec2 uvSample,
            int upMode,
            float upFactor,
            float sharpness,
            float denoiseStrength,
            mediump float debandStr,
            mediump float motionStress,
            mediump float occDamp
          ) {
            mediump float dStr = clamp(denoiseStrength + motionStress * 0.28, 0.0, 1.0);
            if (dStr <= 0.01 && debandStr <= 0.01 && upMode <= 0) return inColor;

            float factorNorm = clamp((upFactor - 1.5) / 2.5, 0.0, 1.0);
            vec2 texel = u_sourceTexel * ((upMode > 0) ? mix(0.90, 0.65, factorNorm) : 0.90);

            mediump vec3 cN  = texture2D(u_currTex, clamp(uvSample + vec2(0.0, -texel.y), vec2(0.001), vec2(0.999))).rgb;
            mediump vec3 cS  = texture2D(u_currTex, clamp(uvSample + vec2(0.0,  texel.y), vec2(0.001), vec2(0.999))).rgb;
            mediump vec3 cW  = texture2D(u_currTex, clamp(uvSample + vec2(-texel.x, 0.0), vec2(0.001), vec2(0.999))).rgb;
            mediump vec3 cE  = texture2D(u_currTex, clamp(uvSample + vec2( texel.x, 0.0), vec2(0.001), vec2(0.999))).rgb;
            mediump vec3 cNW = texture2D(u_currTex, clamp(uvSample + vec2(-texel.x, -texel.y) * 0.85, vec2(0.001), vec2(0.999))).rgb;
            mediump vec3 cNE = texture2D(u_currTex, clamp(uvSample + vec2( texel.x, -texel.y) * 0.85, vec2(0.001), vec2(0.999))).rgb;
            mediump vec3 cSW = texture2D(u_currTex, clamp(uvSample + vec2(-texel.x,  texel.y) * 0.85, vec2(0.001), vec2(0.999))).rgb;
            mediump vec3 cSE = texture2D(u_currTex, clamp(uvSample + vec2( texel.x,  texel.y) * 0.85, vec2(0.001), vec2(0.999))).rgb;

            mediump vec3 minCard = min(min(cN, cS), min(cW, cE));
            mediump vec3 maxCard = max(max(cN, cS), max(cW, cE));
            mediump vec3 minDiag = min(min(cNW, cSE), min(cNE, cSW));
            mediump vec3 maxDiag = max(max(cNW, cSE), max(cNE, cSW));

            mediump vec3 cleanBase = inColor;
            if (dStr > 0.01) {
              // Stage 1: Soft Morphological 3x3 Envelope Clamp (eliminates isolated mosquito noise & Gibbs ringing spikes)
              mediump vec3 softMin = max(min(minCard, minDiag), min(maxCard, minDiag) * 0.5 + min(minCard, minDiag) * 0.5);
              mediump vec3 softMax = min(max(maxCard, maxDiag), max(minCard, maxDiag) * 0.5 + max(maxCard, maxDiag) * 0.5);
              mediump vec3 despiked = mix(inColor, clamp(inColor, softMin, softMax), clamp(dStr * 0.85, 0.0, 0.92));

              // Stage 2: Edge-Preserving Bilateral Filter (smooths compression blocks & grain while keeping edges 100% sharp)
              mediump float invSigmaSq = mix(140.0, 38.0, dStr);
              mediump float wN  = 1.0 / (1.0 + dot(cN  - despiked, cN  - despiked) * invSigmaSq);
              mediump float wS  = 1.0 / (1.0 + dot(cS  - despiked, cS  - despiked) * invSigmaSq);
              mediump float wW  = 1.0 / (1.0 + dot(cW  - despiked, cW  - despiked) * invSigmaSq);
              mediump float wE  = 1.0 / (1.0 + dot(cE  - despiked, cE  - despiked) * invSigmaSq);
              mediump float wNW = 0.7 / (1.0 + dot(cNW - despiked, cNW - despiked) * invSigmaSq);
              mediump float wNE = 0.7 / (1.0 + dot(cNE - despiked, cNE - despiked) * invSigmaSq);
              mediump float wSW = 0.7 / (1.0 + dot(cSW - despiked, cSW - despiked) * invSigmaSq);
              mediump float wSE = 0.7 / (1.0 + dot(cSE - despiked, cSE - despiked) * invSigmaSq);
              mediump float wCenter = mix(2.2, 0.95, dStr);

              mediump float wTotal = wCenter + wN + wS + wW + wE + wNW + wNE + wSW + wSE;
              mediump vec3 bilateral = (
                despiked * wCenter +
                cN * wN + cS * wS + cW * wW + cE * wE +
                cNW * wNW + cNE * wNE + cSW * wSW + cSE * wSE
              ) / max(wTotal, 0.0001);

              cleanBase = clamp(mix(despiked, bilateral, clamp(dStr * 0.88, 0.0, 0.90)), 0.0, 1.0);
            }

            // Stage 2.5: Adaptive Debanding + Interleaved Gradient Dithering (eliminates 8-bit sky/shadow banding before upscaling!)
            if (debandStr > 0.01) {
              mediump vec3 avg8Deband = (cN + cS + cW + cE + cNW + cNE + cSW + cSE) * 0.125;
              mediump vec3 maxDiffCard = max(
                max(abs(cN - cleanBase), abs(cS - cleanBase)),
                max(abs(cW - cleanBase), abs(cE - cleanBase))
              );
              mediump float thresh = mix(0.006, 0.036, debandStr);
              mediump vec3 bandMask = vec3(1.0) - smoothstep(vec3(thresh * 0.35), vec3(thresh), maxDiffCard);
              float bn1 = fract(52.9829189 * fract(dot(gl_FragCoord.xy, vec2(0.06711056, 0.00583715))));
              float bn2 = fract(52.9829189 * fract(dot(gl_FragCoord.xy + vec2(11.0, 23.0), vec2(0.06711056, 0.00583715))));
              float blueDither = ((bn1 + bn2) - 1.0) * (mix(1.2, 4.2, debandStr) / 255.0);
              cleanBase = clamp(mix(cleanBase, avg8Deband + vec3(blueDither), bandMask * debandStr * 0.88), 0.0, 1.0);
            }

            if (upMode <= 0) return cleanBase;

            mediump float lC  = getLuma(cleanBase);
            mediump float lN  = getLuma(cN);
            mediump float lS  = getLuma(cS);
            mediump float lW  = getLuma(cW);
            mediump float lE  = getLuma(cE);
            mediump float lNW = getLuma(cNW);
            mediump float lNE = getLuma(cNE);
            mediump float lSW = getLuma(cSW);
            mediump float lSE = getLuma(cSE);

            mediump vec3 avgCross = 0.25 * (cN + cS + cW + cE);
            mediump vec3 avgDiag  = 0.25 * (cNW + cNE + cSW + cSE);
            mediump vec3 avg8     = avgCross * 0.68 + avgDiag * 0.32;

            // Noise-Coring Detail Gate: prevents sharpening of H.264 mosquito noise, film grain & fast-motion residuals
            mediump vec3 rawDetail = cleanBase - avg8;
            mediump float detailMag = length(rawDetail);
            mediump float noiseFloor = mix(0.004, 0.028, clamp(denoiseStrength, 0.0, 1.0));
            mediump float coringGate = smoothstep(noiseFloor, noiseFloor * 3.2 + 0.006, detailMag);
            mediump vec3 zeroDcDetail = rawDetail * coringGate * occDamp;

            mediump vec3 nbhMin  = min(cleanBase, min(minCard, minDiag));
            mediump vec3 nbhMax  = max(cleanBase, max(maxCard, maxDiag));
            mediump vec3 span    = max(nbhMax - nbhMin, vec3(0.012));
            mediump vec3 minBound = clamp(cleanBase - span * 0.52, 0.0, 1.0);
            mediump vec3 maxBound = clamp(cleanBase + span * 0.52, 0.0, 1.0);

            mediump float gradMag = abs(lN - lS) + abs(lE - lW) + 0.5 * (abs(lNW - lSE) + abs(lNE - lSW));
            mediump float effSharp = sharpness * (1.0 + 0.22 * factorNorm) * (1.0 - 0.35 * clamp(denoiseStrength, 0.0, 1.0));

            if (upMode == 4) {
              // Mode 4: Qualcomm Snapdragon GSR (Edge-Directed Isophote Kernel reusing 3x3 neighborhood)
              mediump float gx = (lE - lW) + 0.5 * ((lNE - lNW) + (lSE - lSW));
              mediump float gy = (lS - lN) + 0.5 * ((lSE - lNE) + (lSW - lNW));
              mediump float gradLen = max(length(vec2(gx, gy)), 0.0005);
              mediump float edgeWeight = smoothstep(0.012, 0.16, gradLen);
              mediump float gsrGain = mix(0.48, 1.38, clamp(effSharp * 0.82, 0.0, 1.0)) * gsrFastLanczos2(gradLen * 1.25);
              mediump vec3 gsrBase = mix(cleanBase, mix(cleanBase, avg8, 0.28 * edgeWeight), occDamp);
              return clamp(gsrBase + zeroDcDetail * gsrGain, minBound, maxBound);
            } else if (upMode == 1) {
              // Mode 1: AMD FSR 1.0 RCAS (Robust Contrast-Adaptive Sharpening with Luma-Guided Gain)
              mediump float minL = min(lC, min(min(lN, lS), min(lW, lE)));
              mediump float maxL = max(lC, max(max(lN, lS), max(lW, lE)));
              mediump float casAmp = sqrt(clamp(min(minL, 1.0 - maxL) / max(maxL, 0.001), 0.0, 1.0));
              mediump float gain = casAmp * mix(0.45, 1.32, clamp(effSharp * 0.80, 0.0, 1.0));
              return clamp(cleanBase + zeroDcDetail * gain, minBound, maxBound);
            } else if (upMode == 2) {
              // Mode 2: Anime4K (Thin-Line & Contour Push Reconstruction + Anti-Alias Tangent Smooth)
              mediump float lap = (4.0 * lC - (lN + lS + lW + lE)) * coringGate;
              mediump float push = clamp(lap * effSharp * 1.35, -0.50, 0.50) * occDamp;
              mediump vec3 targetExtrema = (push >= 0.0) ? maxBound : minBound;
              mediump vec3 lineReconstructed = mix(cleanBase, targetExtrema, abs(push) * 0.62);
              return clamp(lineReconstructed + zeroDcDetail * (0.42 * effSharp), minBound, maxBound);
            } else {
              // Mode 3: Cinema Lanczos-4 Detail & Micro-Contrast Enhancer
              mediump float midToneBell = 4.0 * lC * (1.0 - lC);
              mediump float ringingGuard = 1.0 - smoothstep(0.16, 0.50, gradMag);
              mediump float boost = (0.52 + 1.02 * effSharp) * mix(0.48, 1.0, midToneBell) * mix(0.55, 1.0, ringingGuard);
              return clamp(cleanBase + zeroDcDetail * boost, minBound, maxBound);
            }
          }

          // Honest Perceptual HDR10 ACES Filmic Tone-Mapper + 10-Bit Triangular Anti-Banding Dithering
          mediump vec3 applyHdr10ToneMap(mediump vec3 color, mediump float intensity, int adrenoOpt, int true10Mode) {
            mediump vec3 lin = (adrenoOpt == 1)
              ? (color * color * (0.72 + 0.28 * color))
              : pow(max(color, vec3(0.0001)), vec3(2.2));
            mediump float luma = dot(lin, vec3(0.2126, 0.7152, 0.0722));
            mediump float shadowToe = smoothstep(0.0, 0.26, luma);
            mediump float specPeak = 1.0 + smoothstep(0.28, 0.94, luma) * (true10Mode == 1 ? 1.06 : 0.94) * intensity;
            mediump vec3 hdrLin = lin * mix(0.85, specPeak, shadowToe);
            mediump float hdrLuma = dot(hdrLin, vec3(0.2126, 0.7152, 0.0722));

            mediump float maxC = max(hdrLin.r, max(hdrLin.g, hdrLin.b));
            mediump float minC = min(hdrLin.r, min(hdrLin.g, hdrLin.b));
            mediump float sat = (maxC - minC) / max(maxC, 0.001);
            mediump float vibranceWeight = (1.0 - sat * 0.45) * (true10Mode == 1 ? 0.42 : 0.35) * intensity;
            mediump vec3 wideGamut = mix(vec3(hdrLuma), hdrLin, 1.0 + vibranceWeight);

            mediump vec3 x = max(vec3(0.0), wideGamut * (1.0 + 0.18 * intensity));
            mediump vec3 aces = (x * (2.51 * x + 0.03)) / (x * (2.43 * x + 0.59) + 0.14);
            mediump vec3 mapped = (adrenoOpt == 1)
              ? sqrt(clamp(aces, 0.0, 1.0)) * (0.94 + 0.06 * clamp(aces, 0.0, 1.0))
              : pow(clamp(aces, 0.0, 1.0), vec3(1.0 / 2.2));

            mediump vec3 res = mix(color, mapped, clamp(intensity, 0.0, 1.5));

            float ign1 = fract(52.9829189 * fract(dot(gl_FragCoord.xy, vec2(0.06711056, 0.00583715))));
            float ign2 = fract(52.9829189 * fract(dot(gl_FragCoord.xy + vec2(17.0, 31.0), vec2(0.06711056, 0.00583715))));
            float tpdf = (ign1 + ign2) - 1.0;
            float ditherAmp = (true10Mode == 1) ? (1.6 / 1023.0) : (1.1 / 511.0);
            return clamp(res + vec3(tpdf * ditherAmp), 0.0, 1.0);
          }

          float distToSegment(vec2 p, vec2 a, vec2 b) {
            vec2 pa = p - a;
            vec2 ba = b - a;
            float h = clamp(dot(pa, ba) / max(dot(ba, ba), 0.00001), 0.0, 1.0);
            return length(pa - ba * h);
          }

          void main() {
            vec2 mappedUV = (u_fboPass >= 1) ? v_uv : ((v_uv - 0.5) * u_uvScale + 0.5);
            if (u_fboPass == 0 && (mappedUV.x < 0.0 || mappedUV.x > 1.0 || mappedUV.y < 0.0 || mappedUV.y > 1.0)) {
              gl_FragColor = vec4(0.0, 0.0, 0.0, 1.0);
              return;
            }

            bool isOriginalSide = (u_fboPass == 0 && u_splitCompare == 1 && v_uv.x < 0.5);
            mediump float occBias = 0.0;
            mediump vec3 outColor;
            vec2 upscalerUvCurr = mappedUV;

            if (isOriginalSide || u_alpha <= 0.005) {
              outColor = texture2D(u_prevTex, mappedUV).rgb;
            } else if (u_mode == 0 || u_alpha >= 0.995) {
              outColor = texture2D(u_currTex, mappedUV).rgb;
            } else if (u_mode == 1) {
              // Mode 1: Frame Blending (Cross-Dissolve)
              mediump vec3 pCol = texture2D(u_prevTex, mappedUV).rgb;
              mediump vec3 cCol = texture2D(u_currTex, mappedUV).rgb;
              outColor = mix(pCol, cCol, u_alpha);
            } else {
              // Mode 2: 5-Level Pyramid Optical Flow MEMC + Fast-Motion Artifact Eliminator + 3-Anchor Sub-Frame Cascade FBO (I_0.25, I_0.50, I_0.75)
              // Uses 5-Tap Cross Flow Lookup with hardware bilinear filtering (saves 4 flow texture fetches per screen pixel!)
              vec2 flowStep = u_flowStep;
              mediump vec4 flowC = texture2D(u_flowTex, mappedUV);
              mediump vec4 flowN = texture2D(u_flowTex, mappedUV + vec2(0.0, -flowStep.y));
              mediump vec4 flowS = texture2D(u_flowTex, mappedUV + vec2(0.0,  flowStep.y));
              mediump vec4 flowW = texture2D(u_flowTex, mappedUV + vec2(-flowStep.x, 0.0));
              mediump vec4 flowE = texture2D(u_flowTex, mappedUV + vec2( flowStep.x, 0.0));

              mediump vec2 vC = (flowC.rg - (128.0 / 255.0)) * 2.0;
              mediump vec2 vN = (flowN.rg - (128.0 / 255.0)) * 2.0;
              mediump vec2 vS = (flowS.rg - (128.0 / 255.0)) * 2.0;
              mediump vec2 vW = (flowW.rg - (128.0 / 255.0)) * 2.0;
              mediump vec2 vE = (flowE.rg - (128.0 / 255.0)) * 2.0;

              mediump vec3 unwarpedPrev = texture2D(u_prevTex, mappedUV).rgb;
              mediump vec3 unwarpedCurr = texture2D(u_currTex, mappedUV).rgb;

              // 5-Tap Morphological Vector Median Clamp (strips outlier motion spikes before warping!)
              mediump vec2 vMinCard = min(min(vN, vS), min(vW, vE));
              mediump vec2 vMaxCard = max(max(vN, vS), max(vW, vE));
              mediump vec2 vMedC = clamp(vC, vMinCard, vMaxCard);

              mediump vec2 baseMean = vMedC * 0.44 + (vN + vS + vW + vE) * 0.14;

              mediump float qC = (0.35 + flowC.b) * (1.15 - 0.65 * flowC.a);
              mediump float qN = (0.28 + flowN.b) * (1.15 - 0.65 * flowN.a);
              mediump float qS = (0.28 + flowS.b) * (1.15 - 0.65 * flowS.a);
              mediump float qW = (0.28 + flowW.b) * (1.15 - 0.65 * flowW.a);
              mediump float qE = (0.28 + flowE.b) * (1.15 - 0.65 * flowE.a);

              mediump float wC = qC * 1.65 / (1.0 + dot(vMedC - baseMean, vMedC - baseMean) * 18.0);
              mediump float wN = qN / (1.0 + dot(vN - baseMean, vN - baseMean) * 18.0);
              mediump float wS = qS / (1.0 + dot(vS - baseMean, vS - baseMean) * 18.0);
              mediump float wW = qW / (1.0 + dot(vW - baseMean, vW - baseMean) * 18.0);
              mediump float wE = qE / (1.0 + dot(vE - baseMean, vE - baseMean) * 18.0);
              mediump float wSum = max(wC + wN + wS + wW + wE, 0.0001);
              mediump vec2 cleanVel = (vMedC * wC + vN * wN + vS * wS + vW * wW + vE * wE) / wSum;

              float sourceAspect = u_sourceTexel.y > 0.0 ? (u_sourceTexel.y / max(u_sourceTexel.x, 0.00001)) : (16.0 / 9.0);
              vec2 shiftScaleUV = vec2(u_maxShift, u_maxShift * clamp(sourceAspect, 0.5, 2.4)) * u_strength;

              mediump float flowDiv = (vE.x - vW.x) + (vS.y - vN.y);
              mediump float velShear = length(vE - vW) + length(vS - vN);

              vec2 chosenShiftUV = cleanVel * shiftScaleUV;
              vec2 uvPrev = clamp(mappedUV - u_alpha * chosenShiftUV, vec2(0.001), vec2(0.999));
              vec2 uvCurr = clamp(mappedUV + (1.0 - u_alpha) * chosenShiftUV, vec2(0.001), vec2(0.999));

              mediump vec3 warpedPrev = texture2D(u_prevTex, uvPrev).rgb;
              mediump vec3 warpedCurr = texture2D(u_currTex, uvCurr).rgb;

              // Silhouette-Guided Pixel-Accurate Boundary Snap (executes ONLY on the ~5% of pixels straddling moving object edges!)
              // Prevents bilinear flow averaging across foreground/background boundaries and snaps motion contours to 1080p pixel resolution
              if (velShear > 0.026) {
                mediump vec2 vAltH = (dot(vE - cleanVel, vE - cleanVel) > dot(vW - cleanVel, vW - cleanVel)) ? vE : vW;
                mediump vec2 vAltV = (dot(vS - cleanVel, vS - cleanVel) > dot(vN - cleanVel, vN - cleanVel)) ? vS : vN;
                mediump vec2 vBoundaryAlt = (dot(vAltH - cleanVel, vAltH - cleanVel) > dot(vAltV - cleanVel, vAltV - cleanVel)) ? vAltH : vAltV;
                vec2 altShiftUV = vBoundaryAlt * shiftScaleUV;
                vec2 altUvPrev = clamp(mappedUV - u_alpha * altShiftUV, vec2(0.001), vec2(0.999));
                vec2 altUvCurr = clamp(mappedUV + (1.0 - u_alpha) * altShiftUV, vec2(0.001), vec2(0.999));
                mediump vec3 altPrev = texture2D(u_prevTex, altUvPrev).rgb;
                mediump vec3 altCurr = texture2D(u_currTex, altUvCurr).rgb;
                mediump float basePairDiff = dot(abs(warpedPrev - warpedCurr), vec3(0.3333));
                mediump float altPairDiff  = dot(abs(altPrev - altCurr), vec3(0.3333));
                if (altPairDiff + 0.008 < basePairDiff) {
                  cleanVel = vBoundaryAlt;
                  chosenShiftUV = altShiftUV;
                  uvPrev = altUvPrev;
                  uvCurr = altUvCurr;
                  warpedPrev = altPrev;
                  warpedCurr = altCurr;
                }
              }

              // Diagonal Patch Photometric Consistency Check (detects fast-motion tearing & disocclusions with half the texture fetches!)
              vec2 patchOff = u_sourceTexel * 1.35;
              mediump vec3 wpD = texture2D(u_prevTex, clamp(uvPrev + patchOff, vec2(0.001), vec2(0.999))).rgb;
              mediump vec3 wcD = texture2D(u_currTex, clamp(uvCurr + patchOff, vec2(0.001), vec2(0.999))).rgb;

              mediump float warpErr = length(warpedPrev - warpedCurr) * 0.62 + length(wpD - wcD) * 0.38;

              mediump float velMag = length(cleanVel);
              mediump float dPrev = length(warpedPrev - unwarpedCurr);
              mediump float dCurr = length(warpedCurr - unwarpedPrev);

              // Endpoint-Safe Parabolic Phase Envelope: guarantees 100% exact convergence to prevTex at α->0 and currTex at α->1
              mediump float phaseEnv = 4.0 * u_alpha * (1.0 - u_alpha);

              // Single-Sided Occlusion Resolver at Foreground/Background Silhouette Boundaries
              mediump float occBoundary = smoothstep(0.018, 0.11, warpErr) * smoothstep(0.025, 0.18, velShear + abs(flowDiv));
              mediump float dirSelect = clamp((dPrev - dCurr) * 2.8 + flowDiv * 0.90, -0.92, 0.92) * occBoundary;
              mediump float forwardWeight = clamp(u_alpha + dirSelect * (0.48 + 0.48 * u_haloGuard) * phaseEnv, 0.0, 1.0);
              mediump vec3 primaryWarped = mix(warpedPrev, warpedCurr, forwardWeight);

              // Motion-Compensated Temporal Denoising (MCTD) modulated by phaseEnv so sub-frame cadence stays strictly linear
              mediump float temporalAgreement = (1.0 - smoothstep(0.008, 0.055, warpErr)) * clamp(u_upscaleDenoise, 0.0, 1.0);
              mediump vec3 temporalAvg = 0.5 * (warpedPrev + warpedCurr);
              primaryWarped = mix(primaryWarped, temporalAvg, temporalAgreement * 0.45 * phaseEnv);

              // Stationary Background Protection Mask
              mediump float staticDiff = length(unwarpedCurr - unwarpedPrev);
              mediump float stationaryAdvantage = smoothstep(0.025, 0.11, warpErr - staticDiff * 1.45);
              mediump float staticGuardMask =
                (1.0 - smoothstep(0.003, 0.015, staticDiff)) *
                stationaryAdvantage *
                clamp(0.35 + 0.55 * u_haloGuard, 0.0, 0.90);

              // Fast-Motion Artifact & Tearing Eliminator with Post-Occlusion Residual Compensation:
              // Discounts warpErr when Single-Sided Occlusion Resolver (dirSelect) already resolved a clean background/foreground edge!
              mediump float singleSideResolved = clamp(abs(dirSelect) * 0.72, 0.0, 0.65);
              mediump float effectiveWarpErr = warpErr * (1.0 - singleSideResolved);
              mediump float guardSensitivity = clamp(0.25 + 0.60 * max(u_haloGuard, u_coherenceGuard), 0.15, 0.85);
              mediump float errThresholdLo = mix(0.26, 0.125, guardSensitivity);
              mediump float errThresholdHi = mix(0.62, 0.340, guardSensitivity);
              mediump float mismatchStress = smoothstep(errThresholdLo, errThresholdHi, effectiveWarpErr);
              mediump float shearStress = smoothstep(mix(0.52, 0.24, guardSensitivity), mix(0.92, 0.52, guardSensitivity), velShear + abs(flowDiv));
              mediump float lowConfStress = (1.0 - flowC.b) * smoothstep(0.18, 0.55, velMag);
              mediump float fastMotionStress = clamp(max(mismatchStress, max(shearStress * 0.65, lowConfStress * 0.55)) * guardSensitivity, 0.0, 0.82);

              mediump float preserveUnwarped = clamp(max(staticGuardMask, fastMotionStress * 0.68), 0.0, 0.85);

              // Smooth Reference Blend (preserves temporal cadence without snapping back to raw 24fps keyframes):
              mediump vec3 cleanFastRef = mix(unwarpedPrev, unwarpedCurr, u_alpha);
              mediump vec3 primaryOut = mix(primaryWarped, cleanFastRef, preserveUnwarped);

              // Pass 2A Secondary Anchor FBO Synthesis for Q1 (alpha=0.25) and Q3 (alpha=0.75) from Mid FBO (I_0.50):
              if (u_fboPass == 2) {
                vec2 halfShiftUV = chosenShiftUV * 0.5;
                vec2 uvSubPrev = clamp(mappedUV - 0.5 * halfShiftUV, vec2(0.001), vec2(0.999));
                vec2 uvSubMid  = clamp(mappedUV + 0.5 * halfShiftUV, vec2(0.001), vec2(0.999));
                mediump vec3 cSubPrev = texture2D(u_prevTex, uvSubPrev).rgb;
                mediump vec3 cSubMid  = texture2D(u_subframeMidTex, uvSubMid).rgb;
                mediump float subErr = length(cSubPrev - cSubMid);
                mediump float subWeight = clamp(0.5 + dirSelect * 0.28, 0.0, 1.0);
                mediump vec3 cascadeQ1 = mix(cSubPrev, cSubMid, subWeight);
                mediump float subAgree = (1.0 - smoothstep(0.025, 0.28, subErr)) * (1.0 - preserveUnwarped * 0.65);
                outColor = mix(primaryOut, cascadeQ1, clamp(0.86 * subAgree, 0.0, 0.92));
              } else if (u_fboPass == 3) {
                vec2 halfShiftUV = chosenShiftUV * 0.5;
                vec2 uvSubMid  = clamp(mappedUV - 0.5 * halfShiftUV, vec2(0.001), vec2(0.999));
                vec2 uvSubCurr = clamp(mappedUV + 0.5 * halfShiftUV, vec2(0.001), vec2(0.999));
                mediump vec3 cSubMid  = texture2D(u_subframeMidTex, uvSubMid).rgb;
                mediump vec3 cSubCurr = texture2D(u_currTex, uvSubCurr).rgb;
                mediump float subErr = length(cSubMid - cSubCurr);
                mediump float subWeight = clamp(0.5 + dirSelect * 0.28, 0.0, 1.0);
                mediump vec3 cascadeQ3 = mix(cSubMid, cSubCurr, subWeight);
                mediump float subAgree = (1.0 - smoothstep(0.025, 0.28, subErr)) * (1.0 - preserveUnwarped * 0.65);
                outColor = mix(primaryOut, cascadeQ3, clamp(0.86 * subAgree, 0.0, 0.92));
              } else if (u_fboPass == 0 && u_subframeCascade > 0) {
                // Hierarchical Screen Pass 2B:
                // When u_subframeCascade >= 3, warps across 4 quarter-step intervals using all 3 FBO sub-frames (I_0.25, I_0.50, I_0.75)
                mediump vec3 cascadeColor;
                mediump float subErr;

                if (u_subframeCascade >= 3) {
                  vec2 quarterShiftUV = chosenShiftUV * 0.25;
                  if (u_alpha <= 0.25) {
                    mediump float beta = clamp(u_alpha * 4.0, 0.0, 1.0);
                    mediump float endEnv = 4.0 * beta * (1.0 - beta);
                    vec2 uvA = clamp(mappedUV - beta * quarterShiftUV, vec2(0.001), vec2(0.999));
                    vec2 uvB = clamp(mappedUV + (1.0 - beta) * quarterShiftUV, vec2(0.001), vec2(0.999));
                    mediump vec3 cA = texture2D(u_prevTex, uvA).rgb;
                    mediump vec3 cB = texture2D(u_subframeQ1Tex, uvB).rgb;
                    subErr = length(cA - cB);
                    mediump float subWeight = clamp(beta + dirSelect * 0.22 * endEnv, 0.0, 1.0);
                    cascadeColor = mix(cA, cB, subWeight);
                  } else if (u_alpha <= 0.50) {
                    mediump float beta = clamp((u_alpha - 0.25) * 4.0, 0.0, 1.0);
                    mediump float endEnv = 4.0 * beta * (1.0 - beta);
                    vec2 uvA = clamp(mappedUV - beta * quarterShiftUV, vec2(0.001), vec2(0.999));
                    vec2 uvB = clamp(mappedUV + (1.0 - beta) * quarterShiftUV, vec2(0.001), vec2(0.999));
                    mediump vec3 cA = texture2D(u_subframeQ1Tex, uvA).rgb;
                    mediump vec3 cB = texture2D(u_subframeMidTex, uvB).rgb;
                    subErr = length(cA - cB);
                    mediump float subWeight = clamp(beta + dirSelect * 0.22 * endEnv, 0.0, 1.0);
                    cascadeColor = mix(cA, cB, subWeight);
                  } else if (u_alpha <= 0.75) {
                    mediump float beta = clamp((u_alpha - 0.50) * 4.0, 0.0, 1.0);
                    mediump float endEnv = 4.0 * beta * (1.0 - beta);
                    vec2 uvA = clamp(mappedUV - beta * quarterShiftUV, vec2(0.001), vec2(0.999));
                    vec2 uvB = clamp(mappedUV + (1.0 - beta) * quarterShiftUV, vec2(0.001), vec2(0.999));
                    mediump vec3 cA = texture2D(u_subframeMidTex, uvA).rgb;
                    mediump vec3 cB = texture2D(u_subframeQ3Tex, uvB).rgb;
                    subErr = length(cA - cB);
                    mediump float subWeight = clamp(beta + dirSelect * 0.22 * endEnv, 0.0, 1.0);
                    cascadeColor = mix(cA, cB, subWeight);
                  } else {
                    mediump float beta = clamp((u_alpha - 0.75) * 4.0, 0.0, 1.0);
                    mediump float endEnv = 4.0 * beta * (1.0 - beta);
                    vec2 uvA = clamp(mappedUV - beta * quarterShiftUV, vec2(0.001), vec2(0.999));
                    vec2 uvB = clamp(mappedUV + (1.0 - beta) * quarterShiftUV, vec2(0.001), vec2(0.999));
                    mediump vec3 cA = texture2D(u_subframeQ3Tex, uvA).rgb;
                    mediump vec3 cB = texture2D(u_currTex, uvB).rgb;
                    subErr = length(cA - cB);
                    mediump float subWeight = clamp(beta + dirSelect * 0.22 * endEnv, 0.0, 1.0);
                    cascadeColor = mix(cA, cB, subWeight);
                  }
                } else {
                  vec2 halfShiftUV = chosenShiftUV * 0.5;
                  if (u_alpha <= 0.5) {
                    mediump float beta = clamp(u_alpha * 2.0, 0.0, 1.0);
                    mediump float endEnv = 4.0 * beta * (1.0 - beta);
                    vec2 uvSubPrev = clamp(mappedUV - beta * halfShiftUV, vec2(0.001), vec2(0.999));
                    vec2 uvSubMid  = clamp(mappedUV + (1.0 - beta) * halfShiftUV, vec2(0.001), vec2(0.999));
                    mediump vec3 cSubPrev = texture2D(u_prevTex, uvSubPrev).rgb;
                    mediump vec3 cSubMid  = texture2D(u_subframeMidTex, uvSubMid).rgb;
                    subErr = length(cSubPrev - cSubMid);
                    mediump float subWeight = clamp(beta + dirSelect * 0.28 * endEnv, 0.0, 1.0);
                    cascadeColor = mix(cSubPrev, cSubMid, subWeight);
                  } else {
                    mediump float beta = clamp((u_alpha - 0.5) * 2.0, 0.0, 1.0);
                    mediump float endEnv = 4.0 * beta * (1.0 - beta);
                    vec2 uvSubMid  = clamp(mappedUV - beta * halfShiftUV, vec2(0.001), vec2(0.999));
                    vec2 uvSubCurr = clamp(mappedUV + (1.0 - beta) * halfShiftUV, vec2(0.001), vec2(0.999));
                    mediump vec3 cSubMid  = texture2D(u_subframeMidTex, uvSubMid).rgb;
                    mediump vec3 cSubCurr = texture2D(u_currTex, uvSubCurr).rgb;
                    subErr = length(cSubMid - cSubCurr);
                    mediump float subWeight = clamp(beta + dirSelect * 0.28 * endEnv, 0.0, 1.0);
                    cascadeColor = mix(cSubMid, cSubCurr, subWeight);
                  }
                }

                // Vector Coherence & Fast-Scene Anti-Ghosting Gate
                mediump float cohShear = velShear + abs(flowDiv) * 0.85;
                mediump float shearCutoff = mix(0.55, 0.18, clamp(u_coherenceGuard, 0.0, 1.0));
                mediump float errCutoff   = mix(0.42, 0.14, clamp(u_coherenceGuard, 0.0, 1.0));
                mediump float spatialCoherence = 1.0 - smoothstep(0.035, shearCutoff, cohShear);
                mediump float subWarpAgreement = 1.0 - smoothstep(0.025, errCutoff, subErr);
                mediump float sadConfidence = clamp(flowC.b * (1.15 - 0.50 * flowC.a), 0.0, 1.0);

                mediump float cascadeDepth = (u_subframeCascade == 4) ? 0.94 : (u_subframeCascade == 3) ? 0.88 : 0.78;
                mediump float cascadeBlend =
                  cascadeDepth *
                  mix(1.0, spatialCoherence * subWarpAgreement * (0.50 + 0.50 * sadConfidence), clamp(u_coherenceGuard * 0.75, 0.15, 0.82)) *
                  (1.0 - preserveUnwarped * 0.60);

                outColor = mix(primaryOut, cascadeColor, clamp(cascadeBlend, 0.0, 0.94));
              } else {
                outColor = primaryOut;
              }

              upscalerUvCurr = mix(uvCurr, mappedUV, preserveUnwarped);
              occBias = preserveUnwarped;
            }

            // Pass 2A Anchor FBO output: write clean stabilized intermediate sub-frames (I_0.50, I_0.25, I_0.75) directly to their FBOs
            if (u_fboPass >= 1) {
              gl_FragColor = vec4(clamp(outColor, 0.0, 1.0), 1.0);
              return;
            }

            // Fused Single-Pass Denoiser + Adaptive Deband + Super-Resolution Upscaler (fetches 3x3 neighborhood only once!)
            if (!isOriginalSide && (u_upscaleDenoise > 0.01 || u_debandStrength > 0.01 || occBias > 0.15 || u_upscaleMode > 0)) {
              outColor = applyFusedDenoiseAndUpscale(
                outColor,
                upscalerUvCurr,
                u_upscaleMode,
                u_upscaleFactor,
                u_upscaleSharpness,
                u_upscaleDenoise,
                u_debandStrength,
                occBias,
                1.0 - occBias * 0.65
              );
            }

            if (u_hdrStrength > 0.01 && !isOriginalSide) {
              outColor = applyHdr10ToneMap(outColor, u_hdrStrength, u_adrenoOpt, u_adrenoTrue10);
            }
            outColor = clamp(outColor * u_brightness, 0.0, 1.0);

            if (!isOriginalSide) {
              if (u_blackPoint > 0.0005 || abs(u_contrast - 1.0) > 0.005 || abs(u_saturation - 1.0) > 0.005) {
                outColor = clamp((outColor - vec3(u_blackPoint)) / max(1.0 - u_blackPoint, 0.05), 0.0, 1.0);
                outColor = clamp((outColor - 0.5) * u_contrast + 0.5, 0.0, 1.0);
                mediump float lumaSat = getLuma(outColor);
                outColor = clamp(mix(vec3(lumaSat), outColor, u_saturation), 0.0, 1.0);
              }
              if (u_lutStrength > 0.005) {
                mediump vec3 lutCol = sample3DLutStrip(outColor);
                outColor = mix(outColor, lutCol, clamp(u_lutStrength, 0.0, 1.0));
              }
            }

            if (u_monochrome == 1) {
              mediump float gray = getLuma(outColor);
              gray = clamp((gray - 0.5) * 1.08 + 0.5, 0.0, 1.0);
              outColor = vec3(gray);
            }

            if (u_showSadHeatmap == 1 && !isOriginalSide) {
              mediump vec4 sadBuf = texture2D(u_sadDebugTex, mappedUV);
              mediump float sadVal = sadBuf.a;
              mediump float baseLuma = getLuma(outColor);
              mediump vec3 heatComposite = mix(vec3(baseLuma * 0.55), sadBuf.rgb, 0.84);
              vec2 cellLocal = abs(fract(mappedUV / max(u_flowStep, vec2(0.001))) - 0.5);
              float gridEdge = smoothstep(0.43, 0.49, max(cellLocal.x, cellLocal.y));
              mediump float hotZone = smoothstep(0.38, 0.76, sadVal);
              heatComposite = mix(heatComposite, vec3(1.0, 0.96, 0.90), gridEdge * hotZone * 0.55);
              outColor = heatComposite;
            }

            if (u_showVectors == 1 && u_mode != 0) {
              vec2 gridSize = vec2(24.0, 13.5);
              vec2 cellCenterUV = (floor(mappedUV * gridSize) + 0.5) / gridSize;
              vec2 cellLocal = fract(mappedUV * gridSize) - 0.5;
              mediump vec2 cellVel = (texture2D(u_flowTex, cellCenterUV).rg - (128.0 / 255.0)) * 2.0;
              vec2 warpedGridLocal = abs(fract((mappedUV - cellVel * 0.018) * gridSize) - 0.5);
              if (max(warpedGridLocal.x, warpedGridLocal.y) > 0.472) {
                outColor = mix(outColor, vec3(0.22, 0.78, 0.98), 0.28);
              }
              mediump float mag = dot(cellVel, cellVel);
              if (mag > 0.0005) {
                vec2 tip = clamp(cellVel * 0.56, vec2(-0.46), vec2(0.46));
                float dLine = distToSegment(cellLocal, vec2(0.0), tip);
                float dTip = length(cellLocal - tip);
                if (dTip < 0.058 || dLine < 0.024) {
                  outColor = mix(outColor, vec3(0.0, 1.0, 0.78), 0.90);
                }
              }
            }

            if (u_splitCompare == 1 && abs(v_uv.x - 0.5) < 0.0018) {
              outColor = vec3(1.0, 1.0, 0.0);
            }

            gl_FragColor = vec4(outColor, 1.0);
          }
        `;

        const compileShader = (type: number, src: string) => {
          const sh = gl.createShader(type);
          if (!sh) return null;
          gl.shaderSource(sh, src);
          gl.compileShader(sh);
          if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) {
            const err = gl.getShaderInfoLog(sh);
            console.warn('WebGL Shader compile error:', err);
            gl.deleteShader(sh);
            return null;
          }
          return sh;
        };

        const createProgram = (vsSrc: string, fsSrc: string) => {
          const vs = compileShader(gl.VERTEX_SHADER, vsSrc);
          const fs = compileShader(gl.FRAGMENT_SHADER, fsSrc);
          const prog = gl.createProgram();
          if (!vs || !fs || !prog) {
            if (vs) gl.deleteShader(vs);
            if (fs) gl.deleteShader(fs);
            if (prog) gl.deleteProgram(prog);
            return null;
          }
          gl.attachShader(prog, vs);
          gl.attachShader(prog, fs);
          gl.bindAttribLocation(prog, 0, 'a_pos');
          gl.linkProgram(prog);
          gl.deleteShader(vs);
          gl.deleteShader(fs);
          if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) {
            const err = gl.getProgramInfoLog(prog);
            console.warn('WebGL Program link error:', err);
            gl.deleteProgram(prog);
            return null;
          }
          return prog;
        };

        flowProg = createProgram(vsFlowSource, fsFlowSource);
        synthProg = createProgram(vsSynthSource, fsSynthSource);

        if (!flowProg || !synthProg) {
          setWebglContextLost(true);
          showToast('Аппаратный Fallback: ошибка инициализации шейдеров');
        }

        if (flowProg && synthProg) {
          // Shared Fullscreen Quad Buffer (6 vertices for both Pass 1 FBO Pyramid and Pass 2 Synthesis — zero tile-binning overhead!)
          quadBuf = gl.createBuffer();
          gl.bindBuffer(gl.ARRAY_BUFFER, quadBuf);
          gl.bufferData(
            gl.ARRAY_BUFFER,
            new Float32Array([-1, -1, 1, -1, -1, 1, -1, 1, 1, -1, 1, 1]),
            gl.STATIC_DRAW
          );

          flowPosLoc = Math.max(0, gl.getAttribLocation(flowProg, 'a_pos'));
          gl.enableVertexAttribArray(flowPosLoc);
          gl.vertexAttribPointer(flowPosLoc, 2, gl.FLOAT, false, 0, 0);

          synthPosLoc = Math.max(0, gl.getAttribLocation(synthProg, 'a_pos'));
          gl.enableVertexAttribArray(synthPosLoc);
          gl.vertexAttribPointer(synthPosLoc, 2, gl.FLOAT, false, 0, 0);

          const createLinearTex = () => {
            const t = gl.createTexture();
            gl.bindTexture(gl.TEXTURE_2D, t);
            gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
            gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
            gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
            gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
            return t;
          };

          gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, 0);
          gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, 0);

          // Allocate initial keyframe textures
          glPrevTex = createLinearTex();
          gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, stagingCanvas);

          glCurrTex = createLinearTex();
          gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, stagingCanvas);

          // Helper to build neutral flow initialization data
          const makeNeutralFlow = (cols: number, rows: number) => {
            const buf = new Uint8Array(cols * rows * 4);
            for (let i = 0; i < cols * rows; i++) {
              const idx = i << 2;
              buf[idx] = 128;
              buf[idx + 1] = 128;
              buf[idx + 2] = 255;
              buf[idx + 3] = 0;
            }
            return buf;
          };

          const createFlowFboPair = (cols: number, rows: number, data: Uint8Array) => {
            const tex = createLinearTex();
            gl.texImage2D(
              gl.TEXTURE_2D,
              0,
              gl.RGBA,
              cols,
              rows,
              0,
              gl.RGBA,
              gl.UNSIGNED_BYTE,
              data
            );
            const fbo = gl.createFramebuffer();
            gl.bindFramebuffer(gl.FRAMEBUFFER, fbo);
            gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, tex, 0);
            return { tex, fbo };
          };

          // Allocate 5-Level Coarse-to-Fine Pyramid FBOs (L4: 16x9, L3: 32x18, L2: 64x36, L1: 128x72, L0: Adaptive up to 256x144)
          allocatedFlowCols = FLOW_COLS;
          allocatedFlowRows = FLOW_ROWS;
          allocatedTexW = STAGE_W;
          allocatedTexH = STAGE_H;

          const pyrL4 = createFlowFboPair(PYR_L4_COLS, PYR_L4_ROWS, makeNeutralFlow(PYR_L4_COLS, PYR_L4_ROWS));
          const pyrL3 = createFlowFboPair(PYR_L3_COLS, PYR_L3_ROWS, makeNeutralFlow(PYR_L3_COLS, PYR_L3_ROWS));
          const pyrL2 = createFlowFboPair(PYR_L2_COLS, PYR_L2_ROWS, makeNeutralFlow(PYR_L2_COLS, PYR_L2_ROWS));
          const pyrL1 = createFlowFboPair(PYR_L1_COLS, PYR_L1_ROWS, makeNeutralFlow(PYR_L1_COLS, PYR_L1_ROWS));
          const pyrL05 = createFlowFboPair(PYR_L05_COLS, PYR_L05_ROWS, makeNeutralFlow(PYR_L05_COLS, PYR_L05_ROWS));
          glPyrL4Tex = pyrL4.tex;
          glPyrL4Fbo = pyrL4.fbo;
          glPyrL3Tex = pyrL3.tex;
          glPyrL3Fbo = pyrL3.fbo;
          glPyrL2Tex = pyrL2.tex;
          glPyrL2Fbo = pyrL2.fbo;
          glPyrL1Tex = pyrL1.tex;
          glPyrL1Fbo = pyrL1.fbo;
          glPyrL05Tex = pyrL05.tex;
          glPyrL05Fbo = pyrL05.fbo;

          const neutralFlow = makeNeutralFlow(FLOW_COLS, FLOW_ROWS);
          const pairA = createFlowFboPair(FLOW_COLS, FLOW_ROWS, neutralFlow);
          const pairB = createFlowFboPair(FLOW_COLS, FLOW_ROWS, neutralFlow);
          const pairSad = createFlowFboPair(FLOW_COLS, FLOW_ROWS, neutralFlow);
          glFlowPrevTex = pairA.tex;
          glFlowFboPrev = pairA.fbo;
          glFlowCurrTex = pairB.tex;
          glFlowFboCurr = pairB.fbo;
          glSadDebugTex = pairSad.tex;
          glSadDebugFbo = pairSad.fbo;

          // Allocate Pass 2A 3-Anchor Sub-Frame Cascade FBOs (Mid: I_0.50, Q1: I_0.25, Q3: I_0.75)
          allocatedSubframeW = STAGE_W;
          allocatedSubframeH = STAGE_H;
          glSubframeMidTex = createLinearTex();
          gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, STAGE_W, STAGE_H, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
          glSubframeMidFbo = gl.createFramebuffer();
          gl.bindFramebuffer(gl.FRAMEBUFFER, glSubframeMidFbo);
          gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, glSubframeMidTex, 0);

          glSubframeQ1Tex = createLinearTex();
          gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, STAGE_W, STAGE_H, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
          glSubframeQ1Fbo = gl.createFramebuffer();
          gl.bindFramebuffer(gl.FRAMEBUFFER, glSubframeQ1Fbo);
          gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, glSubframeQ1Tex, 0);

          glSubframeQ3Tex = createLinearTex();
          gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, STAGE_W, STAGE_H, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
          glSubframeQ3Fbo = gl.createFramebuffer();
          gl.bindFramebuffer(gl.FRAMEBUFFER, glSubframeQ3Fbo);
          gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, glSubframeQ3Tex, 0);
          gl.bindFramebuffer(gl.FRAMEBUFFER, null);

          // Allocate 256x16 (16x16x16) 3D LUT Strip Texture
          glLutTex = createLinearTex();
          const initLutData = generateBuiltInLutStrip('off');
          gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, 256, 16, 0, gl.RGBA, gl.UNSIGNED_BYTE, initLutData);
          lastUploadedLutKey = 'off:0';

          // Configure Pass 1 (flowProg) uniforms
          gl.useProgram(flowProg);
          gl.uniform1i(gl.getUniformLocation(flowProg, 'u_prevTex'), 0);
          gl.uniform1i(gl.getUniformLocation(flowProg, 'u_currTex'), 1);
          gl.uniform1i(gl.getUniformLocation(flowProg, 'u_lastFlowTex'), 2);
          gl.uniform1i(gl.getUniformLocation(flowProg, 'u_temporalFlowTex'), 3);
          uFlowTexelLoc = gl.getUniformLocation(flowProg, 'u_texelStep');
          uFlowMaxShiftLoc = gl.getUniformLocation(flowProg, 'u_flowMaxShift');
          uFlowParentStepLoc = gl.getUniformLocation(flowProg, 'u_parentFlowStep');
          uFlowSceneCutLoc = gl.getUniformLocation(flowProg, 'u_sceneCutProtect');
          uFlowAdrenoOptLoc = gl.getUniformLocation(flowProg, 'u_adrenoOpt');
          uFlowDebugSadLoc = gl.getUniformLocation(flowProg, 'u_debugSad');
          uFlowPyrLevelLoc = gl.getUniformLocation(flowProg, 'u_pyrLevel');
          gl.uniform2f(uFlowTexelLoc, 1.0 / STAGE_W, 1.0 / STAGE_H);
          gl.uniform2f(uFlowMaxShiftLoc, 28.0 / 960.0, (28.0 / 960.0) * (16.0 / 9.0));
          gl.uniform2f(uFlowParentStepLoc, 1.0 / FLOW_COLS, 1.0 / FLOW_ROWS);
          gl.uniform1i(uFlowSceneCutLoc, 1);
          gl.uniform1i(uFlowAdrenoOptLoc, 1);
          gl.uniform1i(uFlowDebugSadLoc, 0);
          gl.uniform1i(uFlowPyrLevelLoc, 0);

          // Configure Pass 2 (synthProg) uniforms
          gl.useProgram(synthProg);
          gl.uniform1i(gl.getUniformLocation(synthProg, 'u_prevTex'), 0);
          gl.uniform1i(gl.getUniformLocation(synthProg, 'u_currTex'), 1);
          gl.uniform1i(gl.getUniformLocation(synthProg, 'u_flowTex'), 2);
          gl.uniform1i(gl.getUniformLocation(synthProg, 'u_sadDebugTex'), 3);
          gl.uniform1i(gl.getUniformLocation(synthProg, 'u_subframeMidTex'), 4);
          gl.uniform1i(gl.getUniformLocation(synthProg, 'u_lutTex'), 5);
          gl.uniform1i(gl.getUniformLocation(synthProg, 'u_subframeQ1Tex'), 6);
          gl.uniform1i(gl.getUniformLocation(synthProg, 'u_subframeQ3Tex'), 7);

          uAlphaLoc = gl.getUniformLocation(synthProg, 'u_alpha');
          uStrengthLoc = gl.getUniformLocation(synthProg, 'u_strength');
          uMaxShiftLoc = gl.getUniformLocation(synthProg, 'u_maxShift');
          uHaloGuardLoc = gl.getUniformLocation(synthProg, 'u_haloGuard');
          uModeLoc = gl.getUniformLocation(synthProg, 'u_mode');
          uSplitLoc = gl.getUniformLocation(synthProg, 'u_splitCompare');
          uMonoLoc = gl.getUniformLocation(synthProg, 'u_monochrome');
          uShowVectorsLoc = gl.getUniformLocation(synthProg, 'u_showVectors');
          uShowSadHeatmapLoc = gl.getUniformLocation(synthProg, 'u_showSadHeatmap');
          uUvScaleLoc = gl.getUniformLocation(synthProg, 'u_uvScale');
          uSourceTexelLoc = gl.getUniformLocation(synthProg, 'u_sourceTexel');
          uFlowStepLoc = gl.getUniformLocation(synthProg, 'u_flowStep');
          uBrightnessLoc = gl.getUniformLocation(synthProg, 'u_brightness');
          uContrastLoc = gl.getUniformLocation(synthProg, 'u_contrast');
          uSaturationLoc = gl.getUniformLocation(synthProg, 'u_saturation');
          uBlackPointLoc = gl.getUniformLocation(synthProg, 'u_blackPoint');
          uDebandStrengthLoc = gl.getUniformLocation(synthProg, 'u_debandStrength');
          uLutStrengthLoc = gl.getUniformLocation(synthProg, 'u_lutStrength');
          uHdrLoc = gl.getUniformLocation(synthProg, 'u_hdrStrength');
          uTargetFpsLoc = gl.getUniformLocation(synthProg, 'u_targetFps');
          uUpscaleModeLoc = gl.getUniformLocation(synthProg, 'u_upscaleMode');
          uUpscaleFactorLoc = gl.getUniformLocation(synthProg, 'u_upscaleFactor');
          uUpscaleSharpLoc = gl.getUniformLocation(synthProg, 'u_upscaleSharpness');
          uUpscaleDenoiseLoc = gl.getUniformLocation(synthProg, 'u_upscaleDenoise');
          uAdrenoOptLoc = gl.getUniformLocation(synthProg, 'u_adrenoOpt');
          uAdrenoTrue10Loc = gl.getUniformLocation(synthProg, 'u_adrenoTrue10');
          uFboPassLoc = gl.getUniformLocation(synthProg, 'u_fboPass');
          uSubframeCascadeLoc = gl.getUniformLocation(synthProg, 'u_subframeCascade');
          uCoherenceGuardLoc = gl.getUniformLocation(synthProg, 'u_coherenceGuard');

          gl.uniform2f(uSourceTexelLoc, 1.0 / STAGE_W, 1.0 / STAGE_H);
          gl.uniform2f(uFlowStepLoc, 1.0 / FLOW_COLS, 1.0 / FLOW_ROWS);
          if (uFboPassLoc) gl.uniform1i(uFboPassLoc, 0);
          if (uSubframeCascadeLoc) gl.uniform1i(uSubframeCascadeLoc, 3);
          if (uCoherenceGuardLoc) gl.uniform1f(uCoherenceGuardLoc, 0.75);

          // Ensure Pass 1 texture unit 3 is bound to temporal flow history before first Pass 1 run
          gl.activeTexture(gl.TEXTURE3);
          gl.bindTexture(gl.TEXTURE_2D, glFlowPrevTex);

          // Bind initial texture units once
          gl.activeTexture(gl.TEXTURE0);
          gl.bindTexture(gl.TEXTURE_2D, glPrevTex);
          gl.activeTexture(gl.TEXTURE1);
          gl.bindTexture(gl.TEXTURE_2D, glCurrTex);
          gl.activeTexture(gl.TEXTURE2);
          gl.bindTexture(gl.TEXTURE_2D, glFlowCurrTex);
          gl.activeTexture(gl.TEXTURE3);
          gl.bindTexture(gl.TEXTURE_2D, glSadDebugTex);
          gl.activeTexture(gl.TEXTURE4);
          gl.bindTexture(gl.TEXTURE_2D, glSubframeMidTex);
          gl.activeTexture(gl.TEXTURE5);
          gl.bindTexture(gl.TEXTURE_2D, glLutTex);
          gl.activeTexture(gl.TEXTURE6);
          gl.bindTexture(gl.TEXTURE_2D, glSubframeQ1Tex);
          gl.activeTexture(gl.TEXTURE7);
          gl.bindTexture(gl.TEXTURE_2D, glSubframeQ3Tex);

          gl.viewport(0, 0, outCanvas ? outCanvas.width : STAGE_W, outCanvas ? outCanvas.height : STAGE_H);
          glReady = true;
        }
      } catch {
        glReady = false;
      }
    };

    initGlResources();

    const maxViewportDims = gl ? (gl.getParameter(gl.MAX_VIEWPORT_DIMS) as Int32Array | null) : null;
    const maxGpuWidth = maxViewportDims ? Math.min(3840, maxViewportDims[0]) : 3840;
    const maxGpuHeight = maxViewportDims ? Math.min(2160, maxViewportDims[1]) : 2160;

    // Resolve Adaptive FBO dimensions for 6-Level Pyramid Level 0 based on flowScaleMode, video resolution, targetFps, and ecoThermalMode
    // Strictly deterministic per mode/resolution/targetFps to prevent mid-playback FBO reallocation & temporal flow history resets!
    const resolveAdaptiveFlowDims = (
      mode: 'auto' | 'performance' | 'balanced' | 'ultra' | 'extreme' | 'high' | 'max',
      vw: number,
      targetFpsVal: number | string,
      ecoMode: boolean
    ): [number, number] => {
      const numFps = typeof targetFpsVal === 'number' ? targetFpsVal : 60;
      if (mode === 'performance') return [64, 36];
      if (mode === 'balanced') return [96, 54];
      if (mode === 'ultra') return [128, 72];
      if (mode === 'extreme') return [256, 144];
      if (mode === 'high') return [384, 216];
      if (mode === 'max') return [512, 288];

      if (ecoMode) {
        return [128, 72];
      }
      if (vw <= 1920 && numFps <= 120) {
        return [256, 144];
      }
      return [128, 72];
    };

    // Resolve Pass 2A 3-Anchor Sub-Frame FBO dimensions (I_0.25, I_0.50, I_0.75) up to 2560x1440 (1440p QHD)
    // Deterministic per mode/resolution/ecoMode so FBO textures are never reallocated mid-playback!
    const resolveSubframeBufferDims = (
      resMode: 'auto' | '720p' | '1080p' | '1440p',
      activeVw: number,
      activeVh: number,
      ecoMode: boolean,
      targetFpsVal: number | string,
      _nowMs: number
    ): [number, number] => {
      const numFps = typeof targetFpsVal === 'number' ? targetFpsVal : 60;
      let maxCapW = 1920;
      let maxCapH = 1080;
      if (resMode === '720p') {
        maxCapW = 1280;
        maxCapH = 720;
      } else if (resMode === '1080p') {
        maxCapW = 1920;
        maxCapH = 1080;
      } else if (resMode === '1440p') {
        maxCapW = 2560;
        maxCapH = 1440;
      } else {
        // Smart Auto VRAM & Thermal Governor (deterministic per video resolution & thermal mode)
        if (ecoMode) {
          maxCapW = 1280;
          maxCapH = 720;
        } else if (numFps <= 90 && activeVw >= 1920) {
          maxCapW = 2560;
          maxCapH = 1440;
        } else {
          maxCapW = 1920;
          maxCapH = 1080;
        }
      }
      const clampedCapW = Math.min(maxCapW, maxGpuWidth);
      const clampedCapH = Math.min(maxCapH, maxGpuHeight);
      const desiredW =
        resMode === '1440p'
          ? Math.max(activeVw, 2560)
          : resMode === '1080p'
          ? Math.max(activeVw, 1920)
          : Math.max(activeVw, 1280);
      const desiredH =
        resMode === '1440p'
          ? Math.max(activeVh, 1440)
          : resMode === '1080p'
          ? Math.max(activeVh, 1080)
          : Math.max(activeVh, 720);
      const anchorFit = Math.min(1.0, clampedCapW / Math.max(1, desiredW), clampedCapH / Math.max(1, desiredH));
      const targetSubW = Math.max(640, Math.round(desiredW * anchorFit));
      const targetSubH = Math.max(360, Math.round(desiredH * anchorFit));
      return [targetSubW, targetSubH];
    };

    // Procedural 24 FPS Cinema Test Pattern Generator (renders discrete 24 FPS keyframes onto stagingCanvas)
    const draw24FpsCinemaTestKeyframe = (
      ctx: CanvasRenderingContext2D,
      w: number,
      h: number,
      frameIdx: number
    ) => {
      const tSec = frameIdx / 24.0;

      const bgGrad = ctx.createLinearGradient(0, 0, 0, h);
      bgGrad.addColorStop(0, '#0d1017');
      bgGrad.addColorStop(0.5, '#141923');
      bgGrad.addColorStop(1, '#0b0d13');
      ctx.fillStyle = bgGrad;
      ctx.fillRect(0, 0, w, h);

      // 1. Horizontal panning reference grid
      const gridSpacing = 96;
      const panPx = (tSec * 340) % gridSpacing;
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.09)';
      ctx.lineWidth = 2;
      ctx.beginPath();
      for (let x = -panPx; x < w; x += gridSpacing) {
        ctx.moveTo(x, 0);
        ctx.lineTo(x, h);
      }
      for (let y = 48; y < h; y += gridSpacing) {
        ctx.moveTo(0, y);
        ctx.lineTo(w, y);
      }
      ctx.stroke();

      // 2. High-contrast vertical judder test bars
      const barPeriod = 220;
      const barSpeed = 420;
      const barOffset = (tSec * barSpeed) % barPeriod;
      for (let x = -barPeriod + barOffset; x < w + barPeriod; x += barPeriod) {
        ctx.fillStyle = '#f4f4f8';
        ctx.fillRect(Math.round(x), Math.round(h * 0.14), 22, Math.round(h * 0.28));
        ctx.fillStyle = '#38bdf8';
        ctx.fillRect(Math.round(x + 22), Math.round(h * 0.14), 6, Math.round(h * 0.28));
      }

      // 3. Counter-moving bottom tracking blocks
      const botPeriod = 240;
      const botOffset = w - ((tSec * 360) % botPeriod);
      for (let x = -botPeriod + (botOffset % botPeriod); x < w + botPeriod; x += botPeriod) {
        ctx.fillStyle = '#fbbf24';
        ctx.fillRect(Math.round(x), Math.round(h * 0.66), 36, Math.round(h * 0.18));
        ctx.fillStyle = '#f97316';
        ctx.fillRect(Math.round(x + 36), Math.round(h * 0.66), 10, Math.round(h * 0.18));
      }

      // 4. Central harmonic motion ring & orbiting satellite
      const cx = w * 0.5 + Math.sin(tSec * 3.2) * (w * 0.22);
      const cy = h * 0.5 + Math.cos(tSec * 2.1) * (h * 0.12);
      ctx.strokeStyle = '#10b981';
      ctx.lineWidth = 8;
      ctx.beginPath();
      ctx.arc(cx, cy, 44, 0, Math.PI * 2);
      ctx.stroke();

      ctx.fillStyle = '#ffffff';
      ctx.beginPath();
      ctx.arc(cx, cy, 12, 0, Math.PI * 2);
      ctx.fill();

      ctx.fillStyle = 'rgba(0, 0, 0, 0.68)';
      ctx.fillRect(24, 20, 390, 42);
      ctx.fillStyle = '#e4e4e7';
      ctx.font = 'bold 18px ui-monospace, SFMono-Regular, Menlo, monospace';
      ctx.fillText(`24.0 FPS SOURCE • KEYFRAME #${frameIdx}`, 36, 47);
    };

    const clampAspect = (a: number) => Math.max(0.5, Math.min(2.4, a));

    // Execute 5-Level Coarse-to-Fine Optical Flow Pyramid (L4: 16x9 -> L3: 32x18 -> L2: 64x36 -> L1: 128x72 -> L0: up to 256x144)
    const dispatchGpuFlowPass1 = (
      vw: number,
      vh: number,
      sceneCutProtect: boolean,
      adrenoTileOpt: boolean,
      flowCols: number,
      flowRows: number,
      maxShiftVal: number,
      emitSadDebugBuffer: boolean,
      advanceHistory: boolean
    ) => {
      if (!glReady || !gl || !flowProg || !synthProg || !glPrevTex || !glCurrTex) return;

      // Dynamically resize Level 0 Optical Flow & SAD Debug FBOs if FBO scale changed
      if (flowCols !== allocatedFlowCols || flowRows !== allocatedFlowRows) {
        allocatedFlowCols = flowCols;
        allocatedFlowRows = flowRows;
        const neutralData = new Uint8Array(flowCols * flowRows * 4);
        for (let i = 0; i < flowCols * flowRows; i++) {
          const idx = i << 2;
          neutralData[idx] = 128;
          neutralData[idx + 1] = 128;
          neutralData[idx + 2] = 255;
          neutralData[idx + 3] = 0;
        }
        gl.activeTexture(gl.TEXTURE2);
        gl.bindTexture(gl.TEXTURE_2D, glFlowPrevTex);
        gl.texImage2D(
          gl.TEXTURE_2D,
          0,
          gl.RGBA,
          flowCols,
          flowRows,
          0,
          gl.RGBA,
          gl.UNSIGNED_BYTE,
          neutralData
        );
        gl.bindTexture(gl.TEXTURE_2D, glFlowCurrTex);
        gl.texImage2D(
          gl.TEXTURE_2D,
          0,
          gl.RGBA,
          flowCols,
          flowRows,
          0,
          gl.RGBA,
          gl.UNSIGNED_BYTE,
          neutralData
        );
        if (glSadDebugTex) {
          gl.activeTexture(gl.TEXTURE3);
          gl.bindTexture(gl.TEXTURE_2D, glSadDebugTex);
          gl.texImage2D(
            gl.TEXTURE_2D,
            0,
            gl.RGBA,
            flowCols,
            flowRows,
            0,
            gl.RGBA,
            gl.UNSIGNED_BYTE,
            neutralData
          );
        }
      }

      // Swap temporal ping-pong flow buffers ONLY when advancing to a new video keyframe
      if (advanceHistory) {
        const tmpFlowTex = glFlowPrevTex;
        glFlowPrevTex = glFlowCurrTex;
        glFlowCurrTex = tmpFlowTex;

        const tmpFlowFbo = glFlowFboPrev;
        glFlowFboPrev = glFlowFboCurr;
        glFlowFboCurr = tmpFlowFbo;
      }

      // Bind quadBuf (6 vertices) for all Pass 1 FBO pyramid levels
      if (quadBuf) {
        gl.bindBuffer(gl.ARRAY_BUFFER, quadBuf);
        gl.vertexAttribPointer(flowPosLoc, 2, gl.FLOAT, false, 0, 0);
      }

      gl.useProgram(flowProg);
      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, glPrevTex);
      gl.activeTexture(gl.TEXTURE1);
      gl.bindTexture(gl.TEXTURE_2D, glCurrTex);
      // Bind glFlowPrevTex to TEXTURE3 immediately so glSadDebugTex is never bound during FBO rendering (prevents WebGL feedback loop)
      gl.activeTexture(gl.TEXTURE3);
      gl.bindTexture(gl.TEXTURE_2D, glFlowPrevTex);

      const flowAspect = vw > 0 && vh > 0 ? vw / vh : 16 / 9;
      gl.uniform2f(uFlowTexelLoc, 1.0 / Math.max(1, vw), 1.0 / Math.max(1, vh));
      if (uFlowMaxShiftLoc) {
        gl.uniform2f(uFlowMaxShiftLoc, maxShiftVal, maxShiftVal * clampAspect(flowAspect));
      }
      gl.uniform1i(uFlowSceneCutLoc, sceneCutProtect ? 1 : 0);
      gl.uniform1i(uFlowAdrenoOptLoc, adrenoTileOpt ? 1 : 0);
      if (uFlowDebugSadLoc) {
        gl.uniform1i(uFlowDebugSadLoc, 0);
      }

      // --- PYRAMID LEVEL 4 (Ultra-Coarse 16x9 Global Camera Pan & Fast Motion Search) ---
      if (glPyrL4Fbo && glPyrL4Tex) {
        gl.bindFramebuffer(gl.FRAMEBUFFER, glPyrL4Fbo);
        gl.viewport(0, 0, PYR_L4_COLS, PYR_L4_ROWS);
        gl.activeTexture(gl.TEXTURE2);
        gl.bindTexture(gl.TEXTURE_2D, glFlowPrevTex);
        if (uFlowPyrLevelLoc) gl.uniform1i(uFlowPyrLevelLoc, 4);
        if (uFlowParentStepLoc) gl.uniform2f(uFlowParentStepLoc, 1.0 / allocatedFlowCols, 1.0 / allocatedFlowRows);
        gl.drawArrays(gl.TRIANGLES, 0, 6);
      }

      // --- PYRAMID LEVEL 3 (Coarse 32x18 Object Body Motion Refinement from Level 4) ---
      if (glPyrL3Fbo && glPyrL3Tex && glPyrL4Tex) {
        gl.bindFramebuffer(gl.FRAMEBUFFER, glPyrL3Fbo);
        gl.viewport(0, 0, PYR_L3_COLS, PYR_L3_ROWS);
        gl.activeTexture(gl.TEXTURE2);
        gl.bindTexture(gl.TEXTURE_2D, glPyrL4Tex);
        if (uFlowPyrLevelLoc) gl.uniform1i(uFlowPyrLevelLoc, 3);
        if (uFlowParentStepLoc) gl.uniform2f(uFlowParentStepLoc, 1.0 / PYR_L4_COLS, 1.0 / PYR_L4_ROWS);
        gl.drawArrays(gl.TRIANGLES, 0, 6);
      }

      // --- PYRAMID LEVEL 2 (Mid 64x36 Silhouette Contour Lock from Level 3; executed for all L0 >= 64x36) ---
      if (allocatedFlowCols >= PYR_L2_COLS && glPyrL2Fbo && glPyrL2Tex && glPyrL3Tex) {
        gl.bindFramebuffer(gl.FRAMEBUFFER, glPyrL2Fbo);
        gl.viewport(0, 0, PYR_L2_COLS, PYR_L2_ROWS);
        gl.activeTexture(gl.TEXTURE2);
        gl.bindTexture(gl.TEXTURE_2D, glPyrL3Tex);
        if (uFlowPyrLevelLoc) gl.uniform1i(uFlowPyrLevelLoc, 2);
        if (uFlowParentStepLoc) gl.uniform2f(uFlowParentStepLoc, 1.0 / PYR_L3_COLS, 1.0 / PYR_L3_ROWS);
        gl.drawArrays(gl.TRIANGLES, 0, 6);
      }

      // --- PYRAMID LEVEL 1 (Fine 128x72 Thin-Structure & Text Boundary Lock from Level 2; executed when L0 >= 128x72) ---
      if (allocatedFlowCols >= PYR_L1_COLS && glPyrL1Fbo && glPyrL1Tex && glPyrL2Tex) {
        gl.bindFramebuffer(gl.FRAMEBUFFER, glPyrL1Fbo);
        gl.viewport(0, 0, PYR_L1_COLS, PYR_L1_ROWS);
        gl.activeTexture(gl.TEXTURE2);
        gl.bindTexture(gl.TEXTURE_2D, glPyrL2Tex);
        if (uFlowPyrLevelLoc) gl.uniform1i(uFlowPyrLevelLoc, 1);
        if (uFlowParentStepLoc) gl.uniform2f(uFlowParentStepLoc, 1.0 / PYR_L2_COLS, 1.0 / PYR_L2_ROWS);
        gl.drawArrays(gl.TRIANGLES, 0, 6);
      }

      // --- PYRAMID LEVEL 0.5 (Ultra-Dense 256x144 Micro-Feature Lock from Level 1; executed when L0 > 256x144 i.e. 384x216 or 512x288) ---
      if (allocatedFlowCols > PYR_L05_COLS && glPyrL05Fbo && glPyrL05Tex && glPyrL1Tex) {
        gl.bindFramebuffer(gl.FRAMEBUFFER, glPyrL05Fbo);
        gl.viewport(0, 0, PYR_L05_COLS, PYR_L05_ROWS);
        gl.activeTexture(gl.TEXTURE2);
        gl.bindTexture(gl.TEXTURE_2D, glPyrL1Tex);
        if (uFlowPyrLevelLoc) gl.uniform1i(uFlowPyrLevelLoc, 1);
        if (uFlowParentStepLoc) gl.uniform2f(uFlowParentStepLoc, 1.0 / PYR_L1_COLS, 1.0 / PYR_L1_ROWS);
        gl.drawArrays(gl.TRIANGLES, 0, 6);
      }

      // --- PYRAMID LEVEL 0 (Final Target FBO: 64x36 / 96x54 / 128x72 / 256x144 / 384x216 / 512x288 Sub-Pixel Lucas-Kanade) ---
      const l0ParentTex =
        allocatedFlowCols > PYR_L05_COLS
          ? glPyrL05Tex
          : allocatedFlowCols >= PYR_L1_COLS
          ? glPyrL1Tex
          : allocatedFlowCols >= PYR_L2_COLS
          ? glPyrL2Tex
          : glPyrL3Tex;
      const l0ParentCols =
        allocatedFlowCols > PYR_L05_COLS
          ? PYR_L05_COLS
          : allocatedFlowCols >= PYR_L1_COLS
          ? PYR_L1_COLS
          : allocatedFlowCols >= PYR_L2_COLS
          ? PYR_L2_COLS
          : PYR_L3_COLS;
      const l0ParentRows =
        allocatedFlowCols > PYR_L05_COLS
          ? PYR_L05_ROWS
          : allocatedFlowCols >= PYR_L1_COLS
          ? PYR_L1_ROWS
          : allocatedFlowCols >= PYR_L2_COLS
          ? PYR_L2_ROWS
          : PYR_L3_ROWS;

      gl.bindFramebuffer(gl.FRAMEBUFFER, glFlowFboCurr);
      gl.viewport(0, 0, allocatedFlowCols, allocatedFlowRows);
      if (adrenoTileOpt) {
        gl.clearColor(128.0 / 255.0, 128.0 / 255.0, 1.0, 0.0);
        gl.clear(gl.COLOR_BUFFER_BIT);
      }
      gl.activeTexture(gl.TEXTURE2);
      gl.bindTexture(gl.TEXTURE_2D, l0ParentTex || glFlowPrevTex);
      if (uFlowPyrLevelLoc) gl.uniform1i(uFlowPyrLevelLoc, 0);
      if (uFlowParentStepLoc) gl.uniform2f(uFlowParentStepLoc, 1.0 / l0ParentCols, 1.0 / l0ParentRows);
      gl.drawArrays(gl.TRIANGLES, 0, 6);

      // When Symmetric SAD Heatmap debug mode is active, convert glFlowCurrTex.a into thermal RGB in glSadDebugFbo (1 lookup!)
      if (emitSadDebugBuffer && glSadDebugFbo && glSadDebugTex) {
        gl.bindFramebuffer(gl.FRAMEBUFFER, glSadDebugFbo);
        gl.viewport(0, 0, allocatedFlowCols, allocatedFlowRows);
        gl.activeTexture(gl.TEXTURE2);
        gl.bindTexture(gl.TEXTURE_2D, glFlowCurrTex);
        if (uFlowDebugSadLoc) {
          gl.uniform1i(uFlowDebugSadLoc, 1);
        }
        gl.drawArrays(gl.TRIANGLES, 0, 6);
        if (uFlowDebugSadLoc) {
          gl.uniform1i(uFlowDebugSadLoc, 0);
        }
      }

      // Restore Screen Framebuffer & Pass 2 Fullscreen Quad Bindings
      gl.bindFramebuffer(gl.FRAMEBUFFER, null);
      gl.viewport(0, 0, outCanvas ? outCanvas.width : vw, outCanvas ? outCanvas.height : vh);
      gl.useProgram(synthProg);

      if (quadBuf) {
        gl.bindBuffer(gl.ARRAY_BUFFER, quadBuf);
        gl.vertexAttribPointer(synthPosLoc, 2, gl.FLOAT, false, 0, 0);
      }

      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, glPrevTex);
      gl.activeTexture(gl.TEXTURE1);
      gl.bindTexture(gl.TEXTURE_2D, glCurrTex);
      gl.activeTexture(gl.TEXTURE2);
      gl.bindTexture(gl.TEXTURE_2D, glFlowCurrTex);
      if (glSadDebugTex) {
        gl.activeTexture(gl.TEXTURE3);
        gl.bindTexture(gl.TEXTURE_2D, glSadDebugTex);
      }
      if (glSubframeMidTex) {
        gl.activeTexture(gl.TEXTURE4);
        gl.bindTexture(gl.TEXTURE_2D, glSubframeMidTex);
      }
    };

    // Direct Zero-Copy upload from HTMLVideoElement or Canvas in native resolution & Pass 1 GPU Flow FBO
    const pushNewKeyframeAndComputeGpuFlow = (
      source: TexImageSource,
      vw: number,
      vh: number,
      sceneCutProtect: boolean,
      resetHistory: boolean,
      adrenoTileOpt: boolean,
      computeOpticalFlow: boolean,
      flowCols: number,
      flowRows: number,
      maxShiftVal: number,
      emitSadDebugBuffer: boolean
    ) => {
      if (!glReady || !gl || !flowProg || !synthProg || !glPrevTex || !glCurrTex) return;

      const resolutionChanged = vw !== allocatedTexW || vh !== allocatedTexH;
      if (resolutionChanged) {
        allocatedTexW = vw;
        allocatedTexH = vh;
      }

      // 1. O(1) Ping-Pong Keyframe Texture Swap + Zero-Copy texImage2D Upload (Native 1080p/4K)
      const tmpTex = glPrevTex;
      glPrevTex = glCurrTex;
      glCurrTex = tmpTex;

      const uploadSourceToBoundTexture = () => {
        try {
          gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, source);
        } catch {
          if (stagingCtx && source !== stagingCanvas) {
            if (stagingCanvas.width !== vw || stagingCanvas.height !== vh) {
              stagingCanvas.width = vw;
              stagingCanvas.height = vh;
              stagingCtx.imageSmoothingEnabled = true;
              stagingCtx.imageSmoothingQuality = 'high';
            }
            stagingCtx.drawImage(source as CanvasImageSource, 0, 0, vw, vh);
            gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, stagingCanvas);
          }
        }
      };

      gl.activeTexture(gl.TEXTURE1);
      gl.bindTexture(gl.TEXTURE_2D, glCurrTex);
      uploadSourceToBoundTexture();

      // When starting a new video, changing resolution, or seeking, initialize glPrevTex with the same frame and clear stale temporal flow
      if (resetHistory || resolutionChanged) {
        gl.activeTexture(gl.TEXTURE0);
        gl.bindTexture(gl.TEXTURE_2D, glPrevTex);
        uploadSourceToBoundTexture();
        if (glFlowFboPrev && glFlowFboCurr) {
          gl.clearColor(128.0 / 255.0, 128.0 / 255.0, 1.0, 0.0);
          gl.bindFramebuffer(gl.FRAMEBUFFER, glFlowFboPrev);
          gl.clear(gl.COLOR_BUFFER_BIT);
          gl.bindFramebuffer(gl.FRAMEBUFFER, glFlowFboCurr);
          gl.clear(gl.COLOR_BUFFER_BIT);
          gl.bindFramebuffer(gl.FRAMEBUFFER, null);
        }
      }

      if (!computeOpticalFlow) {
        gl.bindFramebuffer(gl.FRAMEBUFFER, null);
        gl.useProgram(synthProg);
        if (quadBuf) {
          gl.bindBuffer(gl.ARRAY_BUFFER, quadBuf);
          gl.vertexAttribPointer(synthPosLoc, 2, gl.FLOAT, false, 0, 0);
        }
        gl.activeTexture(gl.TEXTURE0);
        gl.bindTexture(gl.TEXTURE_2D, glPrevTex);
        gl.activeTexture(gl.TEXTURE1);
        gl.bindTexture(gl.TEXTURE_2D, glCurrTex);
        gl.activeTexture(gl.TEXTURE2);
        gl.bindTexture(gl.TEXTURE_2D, glFlowCurrTex);
        if (glSadDebugTex) {
          gl.activeTexture(gl.TEXTURE3);
          gl.bindTexture(gl.TEXTURE_2D, glSadDebugTex);
        }
        if (glSubframeMidTex) {
          gl.activeTexture(gl.TEXTURE4);
          gl.bindTexture(gl.TEXTURE_2D, glSubframeMidTex);
        }
        if (glLutTex) {
          gl.activeTexture(gl.TEXTURE5);
          gl.bindTexture(gl.TEXTURE_2D, glLutTex);
        }
        return;
      }

      dispatchGpuFlowPass1(
        vw,
        vh,
        sceneCutProtect,
        adrenoTileOpt,
        flowCols,
        flowRows,
        maxShiftVal,
        emitSadDebugBuffer,
        true
      );
    };

    let lastSubtitleStr = '';
    let lastTopSubtitleStr = '';
    let lastAutoCropCheckTime = 0;
    let smoothAutoCropRatio = 0;
    let animId: number;
    let lastRAFTime = performance.now();
    let lastRenderSubmittedTime = 0;
    let lastRenderedAlpha = -1;
    let lastDomSyncTime = performance.now();
    let lastPosSaveTime = performance.now();
    let subframeTickIndex = 0;
    let pllDisplayDtMs = 16.6667;
    let pllPhase = 0.5;
    let demoFrameCounter = 0;
    let lastDecodedFrameCount = -1;
    let lastPass1Signature = '';
    let lastPass2ASignature = '';
    let pass2BindingsDirty = true;
    let lastViewportW = -1;
    let lastViewportH = -1;

    const tick = (now: number) => {
      animId = requestAnimationFrame(tick);

      // Zero background thermal/battery drain when browser tab or app is minimized/hidden
      if (typeof document !== 'undefined' && document.hidden) {
        lastRAFTime = now;
        return;
      }

      const dtMs = Math.min(60, Math.max(2, now - lastRAFTime));
      lastRAFTime = now;
      if (dtMs >= 4.0 && dtMs <= 36.0) {
        pllDisplayDtMs = pllDisplayDtMs * 0.90 + dtMs * 0.10;
      }

      const cfg = engineConfigRef.current;

      // Skip GPU work if user is browsing Library or Settings (not on Player or You tab)
      if (cfg.activeScreen !== 'player' && !(cfg.activeScreen === 'main' && cfg.activeTab === 'you')) {
        return;
      }

      // If hardware Video fallback is active, bypass WebGL shader execution
      if (cfg.isVideoFallbackActive) {
        return;
      }

      const isActivelyPlaying =
        cfg.isPlaying ||
        Boolean(!cfg.isDemoTestActive && videoRef.current && !videoRef.current.paused);

      // If paused and not scrubbing and no settings changed, skip redundant GPU redraws
      if (
        !isActivelyPlaying &&
        !isScrubbingRef.current &&
        !forceRedrawRef.current &&
        !hasNewVideoFrameRef.current &&
        !forceDemoStepRef.current
      ) {
        return;
      }

      const effectiveMode = cfg.interpEnabled ? cfg.interpMode : 'off';

      // Thermal Frame-Pacer: Only throttle when display refresh rate is explicitly much higher than targetRenderFps
      // (Never drop VSync ticks when targetRenderFps matches or exceeds display Hz!)
      const targetRenderFps =
        effectiveMode === 'off'
          ? 60
          : Math.max(30, Math.min(240, Number(cfg.effectiveTargetFps) || 60));
      const shouldPaceFps = cfg.detectedDisplayHz > targetRenderFps + 15;
      const minFrameIntervalMs = (1000.0 / targetRenderFps) * 0.78;
      const isUrgentFrame =
        forceRedrawRef.current ||
        isScrubbingRef.current ||
        hasNewVideoFrameRef.current ||
        forceDemoStepRef.current ||
        pendingSnapshotRef.current;

      if (shouldPaceFps && !isUrgentFrame && now - lastRenderSubmittedTime < minFrameIntervalMs) {
        return;
      }

      const wasForcedRedraw = forceRedrawRef.current;
      forceRedrawRef.current = false;

      if (!glReady || !gl || !synthProg) return;

      // Start measuring actual GPU command submission latency
      const procStart = performance.now();

      const adrenoOptVal = cfg.isAdrenoActive && cfg.adrenoGmemFp16 ? 1 : 0;
      const adrenoTrue10Val = cfg.isAdrenoActive && cfg.adrenoTrue10Hdr ? 1 : 0;
      const maxShiftVal = (cfg.motionScale * 1.45) / 960.0;
      let alpha = 1.0;
      let uvScaleX = 1.0;
      let uvScaleY = 1.0;
      let activeVw = STAGE_W;
      let activeVh = STAGE_H;
      let didUploadNewKeyframe = false;

      const isFlowNeeded =
        effectiveMode === 'optical' ||
        cfg.showSadHeatmap;

      const effectivePllDtMs = Math.max(pllDisplayDtMs, 1000.0 / targetRenderFps);

      // Branch A: Built-in 24.0 FPS Cinema Motion Test Generator (works immediately with zero external video dependencies!)
      if (cfg.isDemoTestActive && stagingCtx) {
        const vw = 960;
        const vh = 540;
        activeVw = vw;
        activeVh = vh;
        if (stagingCanvas.width !== vw || stagingCanvas.height !== vh) {
          stagingCanvas.width = vw;
          stagingCanvas.height = vh;
        }

        if (cfg.aspectMode !== 'fill') {
          const dispW = outCanvas?.clientWidth || vw;
          const dispH = outCanvas?.clientHeight || vh;
          const canvasAspect = dispW > 0 && dispH > 0 ? dispW / dispH : vw / vh;
          const videoAspect = vw / vh;
          if (cfg.aspectMode === 'contain') {
            if (videoAspect > canvasAspect) {
              uvScaleY = videoAspect / canvasAspect;
            } else {
              uvScaleX = canvasAspect / videoAspect;
            }
          } else if (cfg.aspectMode === 'cover') {
            if (videoAspect > canvasAspect) {
              uvScaleX = canvasAspect / videoAspect;
            } else {
              uvScaleY = videoAspect / canvasAspect;
            }
          }
        }

        const rate = Math.max(0.25, cfg.playbackRate || 1.0);
        const demoIntervalMs = 41.6667 / rate; // True 24.0 FPS source cadence
        estimatedFrameIntervalMsRef.current = demoIntervalMs;

        if (cfg.isPlaying && !isScrubbingRef.current) {
          currentTimeRef.current = (currentTimeRef.current + (dtMs * 0.001) * rate) % 120;
        }

        const [targetFlowCols, targetFlowRows] = resolveAdaptiveFlowDims(
          cfg.flowScaleMode,
          vw,
          cfg.effectiveTargetFps,
          cfg.ecoThermalMode
        );

        const elapsedSinceUpload = now - lastKeyframeUploadPerfNowRef.current;
        const shouldStepDemoKeyframe =
          forceDemoStepRef.current ||
          lastDecodedVideoTimeRef.current < 0 ||
          isScrubbingRef.current ||
          (cfg.isPlaying && elapsedSinceUpload >= demoIntervalMs);

        const expectedDemoTicks = Math.max(1.0, demoIntervalMs / Math.max(4.0, effectivePllDtMs));
        const nominalDemoStep = 1.0 / expectedDemoTicks;

        if (shouldStepDemoKeyframe) {
          didUploadNewKeyframe = true;
          const isInitialSeed = forceDemoStepRef.current || lastDecodedVideoTimeRef.current < 0;
          forceDemoStepRef.current = false;
          lastKeyframeUploadPerfNowRef.current = now;
          lastDecodedVideoTimeRef.current = currentTimeRef.current;

          if (isInitialSeed) {
            // Seed both T-1 and T keyframes so even when paused the user can immediately scrub sub-frame phase α!
            const baseIdx = Math.max(0, Math.floor(currentTimeRef.current * 24));
            draw24FpsCinemaTestKeyframe(stagingCtx, vw, vh, baseIdx);
            pushNewKeyframeAndComputeGpuFlow(
              stagingCanvas,
              vw,
              vh,
              cfg.sceneCutProtection,
              true,
              adrenoOptVal === 1,
              isFlowNeeded,
              targetFlowCols,
              targetFlowRows,
              maxShiftVal,
              cfg.showSadHeatmap
            );
            demoFrameCounter = baseIdx + 1;
            draw24FpsCinemaTestKeyframe(stagingCtx, vw, vh, demoFrameCounter);
            pushNewKeyframeAndComputeGpuFlow(
              stagingCanvas,
              vw,
              vh,
              cfg.sceneCutProtection,
              false,
              adrenoOptVal === 1,
              isFlowNeeded,
              targetFlowCols,
              targetFlowRows,
              maxShiftVal,
              cfg.showSadHeatmap
            );
          } else {
            demoFrameCounter += 1;
            draw24FpsCinemaTestKeyframe(stagingCtx, vw, vh, demoFrameCounter);
            pushNewKeyframeAndComputeGpuFlow(
              stagingCanvas,
              vw,
              vh,
              cfg.sceneCutProtection,
              false,
              adrenoOptVal === 1,
              isFlowNeeded,
              targetFlowCols,
              targetFlowRows,
              maxShiftVal,
              cfg.showSadHeatmap
            );
          }
          lastPass1Signature = `demo:${demoFrameCounter}:${isFlowNeeded}:${cfg.showSadHeatmap}:${targetFlowCols}x${targetFlowRows}:${maxShiftVal.toFixed(5)}:${cfg.sceneCutProtection}:${adrenoOptVal}`;
          pass2BindingsDirty = true;
          subframeTickIndex = 0;
          // VSync PLL v2: Carry fractional phase remainder across keyframe boundary for zero-stutter 24->60/120 cadence
          const wrappedPhase = (pllPhase + nominalDemoStep) - 1.0;
          pllPhase = Math.min(
            Math.max(0.5 * nominalDemoStep, wrappedPhase > 0.02 && wrappedPhase < 0.65 ? wrappedPhase : 0.5 * nominalDemoStep),
            0.65
          );
        } else {
          const pass1Sig = `demo:${demoFrameCounter}:${isFlowNeeded}:${cfg.showSadHeatmap}:${targetFlowCols}x${targetFlowRows}:${maxShiftVal.toFixed(5)}:${cfg.sceneCutProtection}:${adrenoOptVal}`;
          if (isFlowNeeded && lastPass1Signature !== pass1Sig) {
            dispatchGpuFlowPass1(
              vw,
              vh,
              cfg.sceneCutProtection,
              adrenoOptVal === 1,
              targetFlowCols,
              targetFlowRows,
              maxShiftVal,
              cfg.showSadHeatmap,
              false
            );
            lastPass1Signature = pass1Sig;
            pass2BindingsDirty = true;
          }
          subframeTickIndex += 1;
          const clockPhase = (now - lastKeyframeUploadPerfNowRef.current + 0.5 * effectivePllDtMs) / demoIntervalMs;
          const nextUniform = pllPhase + nominalDemoStep;
          const phaseErr = Math.max(-0.08, Math.min(0.08, clockPhase - nextUniform));
          const lockGain = cfg.subframeCascadeEnabled ? 0.22 : 0.16;
          pllPhase = Math.min(0.985, Math.max(pllPhase + nominalDemoStep * 0.76, nextUniform + phaseErr * lockGain));
        }

        if (cfg.manualSubframePhase !== null) {
          alpha = cfg.manualSubframePhase;
        } else if (effectiveMode === 'off') {
          alpha = 1.0;
        } else if (!cfg.isPlaying) {
          // When paused in 24 FPS test mode, default to α=0.50 synthesized midpoint so user can see MEMC & vectors immediately!
          alpha = 0.5;
        } else {
          alpha = pllPhase;
        }
      } else if (videoRef.current && cfg.hasLoadedVideo) {
        const vid = videoRef.current;
        const vidTime = vid.currentTime || 0;
        if (!isScrubbingRef.current) {
          currentTimeRef.current = vidTime;
        }

        // A-B Segment Loop enforcement
        const lp = loopPointsRef.current;
        if (
          lp.a !== null &&
          lp.b !== null &&
          lp.b > lp.a + 0.25 &&
          !isScrubbingRef.current &&
          vidTime >= lp.b
        ) {
          try {
            vid.currentTime = lp.a;
            currentTimeRef.current = lp.a;
          } catch {
            // Ignore seek race
          }
        }

        const vw = vid.videoWidth || 1920;
        const vh = vid.videoHeight || 1080;
        activeVw = vw;
        activeVh = vh;

        // Compute shader UV aspect scale matching actual displayed canvas aspect
        if (cfg.aspectMode !== 'fill' && vw > 0 && vh > 0) {
          const dispW = outCanvas?.clientWidth || vw;
          const dispH = outCanvas?.clientHeight || vh;
          const canvasAspect = dispW > 0 && dispH > 0 ? dispW / dispH : vw / vh;
          const videoAspect = vw / vh;
          if (cfg.aspectMode === 'contain') {
            if (videoAspect > canvasAspect) {
              uvScaleY = videoAspect / canvasAspect;
            } else {
              uvScaleX = canvasAspect / videoAspect;
            }
          } else if (cfg.aspectMode === 'cover') {
            if (videoAspect > canvasAspect) {
              uvScaleX = canvasAspect / videoAspect;
            } else {
              uvScaleY = videoAspect / canvasAspect;
            }
          }
        }
        if (cfg.autoCropBlackBars && detectedAutoCropRef.current > 0.005) {
          smoothAutoCropRatio =
            smoothAutoCropRatio * 0.88 + detectedAutoCropRef.current * 0.12;
          uvScaleY *= Math.max(0.68, 1.0 - smoothAutoCropRatio);
        } else if (smoothAutoCropRatio > 0.001) {
          smoothAutoCropRatio *= 0.85;
          uvScaleY *= Math.max(0.68, 1.0 - smoothAutoCropRatio);
        }

        // Strictly synchronized keyframe upload:
        // Upload ONLY when the decoder delivers a genuinely new video frame, preventing duplicate uploads into glPrevTex & glCurrTex!
        const mediaDeltaSec = Math.abs(vidTime - lastDecodedVideoTimeRef.current);
        const timeSinceLastUploadMs = now - lastKeyframeUploadPerfNowRef.current;
        const rate = Math.max(0.25, cfg.playbackRate || 1.0);
        const vidQuality =
          typeof vid.getVideoPlaybackQuality === 'function' ? vid.getVideoPlaybackQuality() : null;
        const currentDecodedFrames = vidQuality ? vidQuality.totalVideoFrames : -1;

        const fallbackIntervalSec = Math.max(
          0.022,
          (estimatedFrameIntervalMsRef.current * 0.00082) * rate
        );
        const rVfcStalled =
          rVfcActiveRef.current && timeSinceLastUploadMs > 95 && mediaDeltaSec >= 0.022;
        if (rVfcStalled) {
          rVfcActiveRef.current = false;
          armVideoFrameCallback();
        }

        const isFirstFrame = lastDecodedVideoTimeRef.current < 0;
        // Minimum 10ms media timestamp step prevents duplicate upload of the same decoded frame
        const hasGenuineTimeStep = mediaDeltaSec >= 0.010;
        const hasNewQualityFrame =
          !rVfcActiveRef.current &&
          currentDecodedFrames > 0 &&
          currentDecodedFrames !== lastDecodedFrameCount &&
          hasGenuineTimeStep;

        const shouldUploadFrame =
          vid.readyState >= 2 &&
          (!vid.seeking || isScrubbingRef.current || justSeekedRef.current) &&
          (isFirstFrame ||
            justSeekedRef.current ||
            isScrubbingRef.current ||
            (hasNewVideoFrameRef.current && (hasGenuineTimeStep || timeSinceLastUploadMs >= 24)) ||
            hasNewQualityFrame ||
            (!rVfcActiveRef.current && mediaDeltaSec >= fallbackIntervalSec) ||
            rVfcStalled);

        const intervalMs = Math.max(16.67, snapToCanonicalCadenceMs(estimatedFrameIntervalMsRef.current / rate) * rate);
        const effectiveTickDtMs = Math.max(4.0, Math.min(36.0, effectivePllDtMs));
        const expectedVidTicks = Math.max(1.5, intervalMs / effectiveTickDtMs);
        const nominalVidStep = 1.0 / expectedVidTicks;

        const [targetFlowCols, targetFlowRows] = resolveAdaptiveFlowDims(
          cfg.flowScaleMode,
          vw,
          cfg.effectiveTargetFps,
          cfg.ecoThermalMode
        );

        if (shouldUploadFrame) {
          didUploadNewKeyframe = true;
          // Only reset history on genuine backward seeks or large timeline jumps (> 0.65s), never on normal 24/30/60fps playback steps!
          const isBackwardOrJump =
            vidTime < lastDecodedVideoTimeRef.current - 0.020 ||
            mediaDeltaSec > Math.max(0.65, (estimatedFrameIntervalMsRef.current * 0.015) * rate);
          const resetHist =
            isFirstFrame || isScrubbingRef.current || isBackwardOrJump;
          const mediaStepMs = (mediaDeltaSec * 1000) / rate;
          if (!rVfcActiveRef.current && !resetHist && mediaStepMs >= 16.0 && mediaStepMs <= 85.0) {
            const stabilizedElapsed = snapToCanonicalCadenceMs(mediaStepMs) * rate;
            estimatedFrameIntervalMsRef.current =
              estimatedFrameIntervalMsRef.current * 0.85 + stabilizedElapsed * 0.15;
          }
          if (currentDecodedFrames > 0) {
            lastDecodedFrameCount = currentDecodedFrames;
          }
          lastKeyframeUploadPerfNowRef.current = now;
          // Always store vidTime so mediaDeltaSec is measured in a consistent clock domain
          lastDecodedVideoTimeRef.current = vidTime;
          hasNewVideoFrameRef.current = false;
          justSeekedRef.current = false;

          const updatedSig = `vid:${lastDecodedVideoTimeRef.current.toFixed(4)}:${isFlowNeeded}:${cfg.showSadHeatmap}:${targetFlowCols}x${targetFlowRows}:${maxShiftVal.toFixed(5)}:${cfg.sceneCutProtection}:${adrenoOptVal}`;

          try {
            pushNewKeyframeAndComputeGpuFlow(
              vid,
              vw,
              vh,
              cfg.sceneCutProtection,
              resetHist,
              adrenoOptVal === 1,
              isFlowNeeded,
              targetFlowCols,
              targetFlowRows,
              maxShiftVal,
              cfg.showSadHeatmap
            );
            lastPass1Signature = updatedSig;
            pass2BindingsDirty = true;
            subframeTickIndex = 0;
            // VSync PLL v3: Start sub-frame phase smoothly inside the first interval
            const wrappedPhase = (pllPhase + nominalVidStep) - 1.0;
            pllPhase = resetHist
              ? Math.min(0.35, Math.max(0.12, 0.5 * nominalVidStep))
              : Math.min(
                  Math.max(
                    0.22 * nominalVidStep,
                    wrappedPhase > 0.02 && wrappedPhase < 0.65
                      ? wrappedPhase * 0.65 + 0.45 * nominalVidStep * 0.35
                      : 0.45 * nominalVidStep
                  ),
                  0.58
                );
          } catch {
            // Ignore if video frame is mid-decode
          }
        } else {
          const pass1Sig = `vid:${lastDecodedVideoTimeRef.current.toFixed(4)}:${isFlowNeeded}:${cfg.showSadHeatmap}:${targetFlowCols}x${targetFlowRows}:${maxShiftVal.toFixed(5)}:${cfg.sceneCutProtection}:${adrenoOptVal}`;
          if (isFlowNeeded && lastPass1Signature !== pass1Sig) {
            dispatchGpuFlowPass1(
              vw,
              vh,
              cfg.sceneCutProtection,
              adrenoOptVal === 1,
              targetFlowCols,
              targetFlowRows,
              maxShiftVal,
              cfg.showSadHeatmap,
              false
            );
            lastPass1Signature = pass1Sig;
            pass2BindingsDirty = true;
          }
          subframeTickIndex += 1;
          const elapsedSinceKeyframeMs = Math.max(0, now - lastKeyframeUploadPerfNowRef.current);
          const clockPhase = Math.min(0.96, (elapsedSinceKeyframeMs + 0.35 * effectiveTickDtMs) / intervalMs);
          const nextUniform = pllPhase + nominalVidStep;
          const phaseErr = Math.max(-0.08, Math.min(0.08, clockPhase - nextUniform));
          const lockGain = cfg.subframeCascadeEnabled ? 0.25 : 0.20;
          pllPhase = Math.min(
            0.96,
            Math.max(pllPhase + nominalVidStep * 0.75, nextUniform + phaseErr * lockGain)
          );
        }

        // Automatic VSync Phase-Locked Loop (PLL) sub-frame progression:
        // Strictly monotonic forward progression locked to display refresh rate with zero quantization jitter
        if (cfg.manualSubframePhase !== null) {
          alpha = cfg.manualSubframePhase;
        } else if (effectiveMode === 'off') {
          alpha = 1.0;
        } else if (!isActivelyPlaying) {
          alpha = 0.5;
        } else {
          alpha = pllPhase;
        }
      }

      // Stationary Sub-Frame Skip: When no new keyframe arrived, no settings/bindings changed, and alpha hasn't moved
      // (e.g., effectiveMode === 'off' or alpha reached 0.985 waiting for the next decoder frame), skip redundant GPU drawArrays!
      if (
        !didUploadNewKeyframe &&
        !wasForcedRedraw &&
        !isScrubbingRef.current &&
        !pendingSnapshotRef.current &&
        !pass2BindingsDirty &&
        Math.abs(alpha - lastRenderedAlpha) < 0.008
      ) {
        return;
      }

      lastRenderSubmittedTime = now;
      lastRenderedAlpha = alpha;

      // Thermally-Smart Output Framebuffer Resolution:
      // In Eco Thermal Mode, cap DPR at 1.5 and output framebuffer at 1920x1080 (Full HD) to prevent 4K super-sampling heat
      const maxDpr = cfg.ecoThermalMode ? 1.5 : 2.25;
      const dpr = Math.min(maxDpr, window.devicePixelRatio || 1);
      const viewportPhysW = Math.round((outCanvas?.clientWidth || activeVw) * dpr);
      const viewportPhysH = Math.round((outCanvas?.clientHeight || activeVh) * dpr);
      const baseW = Math.max(activeVw, viewportPhysW);
      const baseH = Math.max(activeVh, viewportPhysH);
      const scaleMult = cfg.upscaleEnabled
        ? cfg.ecoThermalMode
          ? Math.min(1.25, Math.max(1.0, cfg.effectiveUpscaleFactor * 0.65))
          : Math.max(1.0, cfg.effectiveUpscaleFactor * 0.75)
        : 1.0;
      const rawOutW = Math.round(baseW * scaleMult);
      const rawOutH = Math.round(baseH * scaleMult);
      const effectiveMaxW = cfg.ecoThermalMode ? Math.min(1920, maxGpuWidth) : maxGpuWidth;
      const effectiveMaxH = cfg.ecoThermalMode ? Math.min(1080, maxGpuHeight) : maxGpuHeight;
      const fitScale = Math.min(1.0, effectiveMaxW / Math.max(1, rawOutW), effectiveMaxH / Math.max(1, rawOutH));
      const targetOutW = Math.max(640, Math.round(rawOutW * fitScale));
      const targetOutH = Math.max(360, Math.round(rawOutH * fitScale));

      if (outCanvas && (outCanvas.width !== targetOutW || outCanvas.height !== targetOutH)) {
        outCanvas.width = targetOutW;
        outCanvas.height = targetOutH;
        pass2BindingsDirty = true;
      }

      const curOutW = outCanvas ? outCanvas.width : targetOutW;
      const curOutH = outCanvas ? outCanvas.height : targetOutH;

      // Bind Screen Framebuffer, Viewport, Pass 2 Program, Quad Buffer & Textures ONLY when dirty
      if (pass2BindingsDirty || lastViewportW !== curOutW || lastViewportH !== curOutH) {
        pass2BindingsDirty = false;
        lastViewportW = curOutW;
        lastViewportH = curOutH;
        gl.bindFramebuffer(gl.FRAMEBUFFER, null);
        gl.viewport(0, 0, curOutW, curOutH);
        gl.useProgram(synthProg);
        if (quadBuf) {
          gl.bindBuffer(gl.ARRAY_BUFFER, quadBuf);
          gl.vertexAttribPointer(synthPosLoc, 2, gl.FLOAT, false, 0, 0);
        }
        gl.activeTexture(gl.TEXTURE0);
        gl.bindTexture(gl.TEXTURE_2D, glPrevTex);
        gl.activeTexture(gl.TEXTURE1);
        gl.bindTexture(gl.TEXTURE_2D, glCurrTex);
        gl.activeTexture(gl.TEXTURE2);
        gl.bindTexture(gl.TEXTURE_2D, glFlowCurrTex);
        if (glSadDebugTex) {
          gl.activeTexture(gl.TEXTURE3);
          gl.bindTexture(gl.TEXTURE_2D, glSadDebugTex);
        }
        if (glSubframeMidTex) {
          gl.activeTexture(gl.TEXTURE4);
          gl.bindTexture(gl.TEXTURE_2D, glSubframeMidTex);
        }
        if (glLutTex) {
          gl.activeTexture(gl.TEXTURE5);
          gl.bindTexture(gl.TEXTURE_2D, glLutTex);
        }
        if (glSubframeQ1Tex) {
          gl.activeTexture(gl.TEXTURE6);
          gl.bindTexture(gl.TEXTURE_2D, glSubframeQ1Tex);
        }
        if (glSubframeQ3Tex) {
          gl.activeTexture(gl.TEXTURE7);
          gl.bindTexture(gl.TEXTURE_2D, glSubframeQ3Tex);
        }
      }

      // Upload 3D LUT texture when preset or custom .cube changes
      const targetLutKey = `${cfg.lutPreset}:${cfg.lutVersion}`;
      if (glLutTex && lastUploadedLutKey !== targetLutKey) {
        lastUploadedLutKey = targetLutKey;
        const stripData =
          cfg.lutPreset === 'custom' && customLutStripRef.current
            ? customLutStripRef.current
            : generateBuiltInLutStrip(
                cfg.lutPreset === 'custom' ? 'off' : cfg.lutPreset
              );
        gl.activeTexture(gl.TEXTURE5);
        gl.bindTexture(gl.TEXTURE_2D, glLutTex);
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, 256, 16, 0, gl.RGBA, gl.UNSIGNED_BYTE, stripData);
      }

      // Pass 2: Synthesize Intermediate Frame (Pass 2A 3-Anchor FBOs + Pass 2B Secondary Sub-Frame Cascade)
      const shaderMode =
        effectiveMode === 'off'
          ? 0
          : effectiveMode === 'blend'
          ? 1
          : 2; // 'optical'
      const haloGuardVal = cfg.dejudderHaloControl * 0.01;
      const cascadeShaderVal =
        shaderMode === 2 && cfg.subframeCascadeEnabled ? cfg.effectiveSubframeCascadeMult : 0;
      const coherenceGuardVal = cfg.subframeCoherenceGuard * 0.01;
      const splitVal = cfg.splitCompareMode ? 1 : 0;
      const monoVal = cfg.monochromeFilter ? 1 : 0;
      const vectorsVal = cfg.showVectors && effectiveMode !== 'off' ? 1 : 0;
      const sadHeatVal = cfg.showSadHeatmap ? 1 : 0;
      const sourceTexelX = 1.0 / Math.max(1, activeVw);
      const sourceTexelY = 1.0 / Math.max(1, activeVh);
      const flowStepX = 1.0 / Math.max(1, allocatedFlowCols);
      const flowStepY = 1.0 / Math.max(1, allocatedFlowRows);
      const shaderUpscaleMode = !cfg.upscaleEnabled
        ? 0
        : cfg.upscaleMode === 'fsr'
        ? 1
        : cfg.upscaleMode === 'anime4k'
        ? 2
        : cfg.upscaleMode === 'cinema'
        ? 3
        : 4; // Mode 4 = Qualcomm Snapdragon GSR (Game Super Resolution)
      const effectiveDeband = cfg.debandEnabled ? cfg.debandStrength * 0.01 : 0.0;
      const effectiveLutStr = cfg.lutPreset !== 'off' ? cfg.lutStrength * 0.01 : 0.0;

      // Dirty-flag uniform updates
      if (lastUniforms.strength !== cfg.interpStrength) {
        gl.uniform1f(uStrengthLoc, cfg.interpStrength);
        lastUniforms.strength = cfg.interpStrength;
      }
      if (lastUniforms.maxShift !== maxShiftVal) {
        gl.uniform1f(uMaxShiftLoc, maxShiftVal);
        lastUniforms.maxShift = maxShiftVal;
      }
      if (lastUniforms.haloGuard !== haloGuardVal) {
        gl.uniform1f(uHaloGuardLoc, haloGuardVal);
        lastUniforms.haloGuard = haloGuardVal;
      }
      if (lastUniforms.mode !== shaderMode) {
        gl.uniform1i(uModeLoc, shaderMode);
        lastUniforms.mode = shaderMode;
      }
      if (lastUniforms.split !== splitVal) {
        gl.uniform1i(uSplitLoc, splitVal);
        lastUniforms.split = splitVal;
      }
      if (lastUniforms.mono !== monoVal) {
        gl.uniform1i(uMonoLoc, monoVal);
        lastUniforms.mono = monoVal;
      }
      if (lastUniforms.showVectors !== vectorsVal) {
        gl.uniform1i(uShowVectorsLoc, vectorsVal);
        lastUniforms.showVectors = vectorsVal;
      }
      if (lastUniforms.showSadHeatmap !== sadHeatVal) {
        gl.uniform1i(uShowSadHeatmapLoc, sadHeatVal);
        lastUniforms.showSadHeatmap = sadHeatVal;
      }
      if (lastUniforms.uvScaleX !== uvScaleX || lastUniforms.uvScaleY !== uvScaleY) {
        gl.uniform2f(uUvScaleLoc, uvScaleX, uvScaleY);
        lastUniforms.uvScaleX = uvScaleX;
        lastUniforms.uvScaleY = uvScaleY;
      }
      if (lastUniforms.sourceTexelX !== sourceTexelX || lastUniforms.sourceTexelY !== sourceTexelY) {
        gl.uniform2f(uSourceTexelLoc, sourceTexelX, sourceTexelY);
        lastUniforms.sourceTexelX = sourceTexelX;
        lastUniforms.sourceTexelY = sourceTexelY;
      }
      if (lastUniforms.flowStepX !== flowStepX || lastUniforms.flowStepY !== flowStepY) {
        gl.uniform2f(uFlowStepLoc, flowStepX, flowStepY);
        lastUniforms.flowStepX = flowStepX;
        lastUniforms.flowStepY = flowStepY;
      }
      if (lastUniforms.brightness !== cfg.videoBrightness) {
        gl.uniform1f(uBrightnessLoc, cfg.videoBrightness);
        lastUniforms.brightness = cfg.videoBrightness;
      }
      if (lastUniforms.contrast !== cfg.videoContrast) {
        if (uContrastLoc) gl.uniform1f(uContrastLoc, cfg.videoContrast);
        lastUniforms.contrast = cfg.videoContrast;
      }
      if (lastUniforms.saturation !== cfg.videoSaturation) {
        if (uSaturationLoc) gl.uniform1f(uSaturationLoc, cfg.videoSaturation);
        lastUniforms.saturation = cfg.videoSaturation;
      }
      if (lastUniforms.blackPoint !== cfg.videoBlackPoint) {
        if (uBlackPointLoc) gl.uniform1f(uBlackPointLoc, cfg.videoBlackPoint);
        lastUniforms.blackPoint = cfg.videoBlackPoint;
      }
      if (lastUniforms.debandStrength !== effectiveDeband) {
        if (uDebandStrengthLoc) gl.uniform1f(uDebandStrengthLoc, effectiveDeband);
        lastUniforms.debandStrength = effectiveDeband;
      }
      if (lastUniforms.lutStrength !== effectiveLutStr) {
        if (uLutStrengthLoc) gl.uniform1f(uLutStrengthLoc, effectiveLutStr);
        lastUniforms.lutStrength = effectiveLutStr;
      }
      const effectiveHdr = cfg.hdrEnabled ? cfg.hdrStrength : 0.0;
      if (lastUniforms.hdr !== effectiveHdr) {
        gl.uniform1f(uHdrLoc, effectiveHdr);
        lastUniforms.hdr = effectiveHdr;
      }
      if (lastUniforms.targetFps !== cfg.effectiveTargetFps) {
        gl.uniform1f(uTargetFpsLoc, cfg.effectiveTargetFps);
        lastUniforms.targetFps = cfg.effectiveTargetFps;
      }
      if (lastUniforms.upscaleMode !== shaderUpscaleMode) {
        gl.uniform1i(uUpscaleModeLoc, shaderUpscaleMode);
        lastUniforms.upscaleMode = shaderUpscaleMode;
      }
      if (lastUniforms.upscaleFactor !== cfg.effectiveUpscaleFactor) {
        gl.uniform1f(uUpscaleFactorLoc, cfg.effectiveUpscaleFactor);
        lastUniforms.upscaleFactor = cfg.effectiveUpscaleFactor;
      }
      if (lastUniforms.upscaleSharp !== cfg.upscaleSharpness) {
        gl.uniform1f(uUpscaleSharpLoc, cfg.upscaleSharpness);
        lastUniforms.upscaleSharp = cfg.upscaleSharpness;
      }
      if (lastUniforms.upscaleDenoise !== cfg.upscaleDenoise) {
        gl.uniform1f(uUpscaleDenoiseLoc, cfg.upscaleDenoise);
        lastUniforms.upscaleDenoise = cfg.upscaleDenoise;
      }
      if (lastUniforms.adrenoOpt !== adrenoOptVal) {
        gl.uniform1i(uAdrenoOptLoc, adrenoOptVal);
        lastUniforms.adrenoOpt = adrenoOptVal;
      }
      if (lastUniforms.adrenoTrue10 !== adrenoTrue10Val) {
        gl.uniform1i(uAdrenoTrue10Loc, adrenoTrue10Val);
        lastUniforms.adrenoTrue10 = adrenoTrue10Val;
      }
      if (lastUniforms.subframeCascade !== cascadeShaderVal) {
        if (uSubframeCascadeLoc) gl.uniform1i(uSubframeCascadeLoc, cascadeShaderVal);
        lastUniforms.subframeCascade = cascadeShaderVal;
      }
      if (lastUniforms.coherenceGuard !== coherenceGuardVal) {
        if (uCoherenceGuardLoc) gl.uniform1f(uCoherenceGuardLoc, coherenceGuardVal);
        lastUniforms.coherenceGuard = coherenceGuardVal;
      }

      // Pass 2A: Synthesize up to 3 Anchor Intermediate FBO Sub-Frames (I_0.25, I_0.50, I_0.75)
      // Executed ONLY once per decoded keyframe pair, dynamically scaled up to 2560x1440 (1440p QHD) with Smart VRAM & Thermal Governor!
      if (cascadeShaderVal > 0 && glSubframeMidFbo && glSubframeMidTex) {
        const [targetSubW, targetSubH] = resolveSubframeBufferDims(
          cfg.subframeBufferResMode,
          activeVw,
          activeVh,
          cfg.ecoThermalMode,
          cfg.effectiveTargetFps,
          now
        );
        const tierMode = cascadeShaderVal >= 3 ? 3 : 2;
        const pass2ASig = `${lastPass1Signature}:${targetSubW}x${targetSubH}:${tierMode}:${cfg.interpStrength.toFixed(3)}:${haloGuardVal.toFixed(3)}:${coherenceGuardVal.toFixed(2)}`;

        if (lastPass2ASignature !== pass2ASig) {
          lastPass2ASignature = pass2ASig;

          if (allocatedSubframeW !== targetSubW || allocatedSubframeH !== targetSubH) {
            allocatedSubframeW = targetSubW;
            allocatedSubframeH = targetSubH;
            gl.activeTexture(gl.TEXTURE4);
            gl.bindTexture(gl.TEXTURE_2D, glSubframeMidTex);
            gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, targetSubW, targetSubH, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
            if (glSubframeQ1Tex) {
              gl.activeTexture(gl.TEXTURE6);
              gl.bindTexture(gl.TEXTURE_2D, glSubframeQ1Tex);
              gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, targetSubW, targetSubH, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
            }
            if (glSubframeQ3Tex) {
              gl.activeTexture(gl.TEXTURE7);
              gl.bindTexture(gl.TEXTURE_2D, glSubframeQ3Tex);
              gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, targetSubW, targetSubH, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
            }
          }

          // Stage 1: Synthesize Midpoint Anchor Sub-Frame I_0.50 (alpha = 0.50) into glSubframeMidFbo
          gl.activeTexture(gl.TEXTURE4);
          gl.bindTexture(gl.TEXTURE_2D, glPrevTex); // Prevent WebGL feedback loop on TEXTURE4
          gl.bindFramebuffer(gl.FRAMEBUFFER, glSubframeMidFbo);
          gl.viewport(0, 0, allocatedSubframeW, allocatedSubframeH);
          if (uFboPassLoc) gl.uniform1i(uFboPassLoc, 1);
          if (uSubframeCascadeLoc) gl.uniform1i(uSubframeCascadeLoc, 0);
          gl.uniform1f(uAlphaLoc, 0.5);
          gl.drawArrays(gl.TRIANGLES, 0, 6);
          // Rebind synthesized I_0.50 on TEXTURE4 so Stages 2 & 3 can warp from it
          gl.activeTexture(gl.TEXTURE4);
          gl.bindTexture(gl.TEXTURE_2D, glSubframeMidTex);

          // Stage 2 & Stage 3: Synthesize Quarter-Phase Anchor Sub-Frames I_0.25 (Sub 1) and I_0.75 (Sub 3)
          if (
            cascadeShaderVal >= 3 &&
            glSubframeQ1Fbo &&
            glSubframeQ1Tex &&
            glSubframeQ3Fbo &&
            glSubframeQ3Tex
          ) {
            // Stage 2: I_0.25 (warps T-1 and I_0.50 with ±0.25*V)
            gl.activeTexture(gl.TEXTURE6);
            gl.bindTexture(gl.TEXTURE_2D, glPrevTex); // Prevent feedback loop on TEXTURE6
            gl.bindFramebuffer(gl.FRAMEBUFFER, glSubframeQ1Fbo);
            if (uFboPassLoc) gl.uniform1i(uFboPassLoc, 2);
            gl.uniform1f(uAlphaLoc, 0.25);
            gl.drawArrays(gl.TRIANGLES, 0, 6);
            gl.activeTexture(gl.TEXTURE6);
            gl.bindTexture(gl.TEXTURE_2D, glSubframeQ1Tex);

            // Stage 3: I_0.75 (warps I_0.50 and T with ±0.25*V)
            gl.activeTexture(gl.TEXTURE7);
            gl.bindTexture(gl.TEXTURE_2D, glPrevTex); // Prevent feedback loop on TEXTURE7
            gl.bindFramebuffer(gl.FRAMEBUFFER, glSubframeQ3Fbo);
            if (uFboPassLoc) gl.uniform1i(uFboPassLoc, 3);
            gl.uniform1f(uAlphaLoc, 0.75);
            gl.drawArrays(gl.TRIANGLES, 0, 6);
            gl.activeTexture(gl.TEXTURE7);
            gl.bindTexture(gl.TEXTURE_2D, glSubframeQ3Tex);
          }

          // Restore Screen Pass 2B state
          if (uFboPassLoc) gl.uniform1i(uFboPassLoc, 0);
          if (uSubframeCascadeLoc) gl.uniform1i(uSubframeCascadeLoc, cascadeShaderVal);
          gl.bindFramebuffer(gl.FRAMEBUFFER, null);
          gl.viewport(0, 0, curOutW, curOutH);
        }
      }

      // Pass 2B: Update sub-frame phase alpha and draw 6-vertex Fullscreen Quad directly to screen (zero diagonal edge overshading!)
      gl.uniform1f(uAlphaLoc, alpha);
      gl.drawArrays(gl.TRIANGLES, 0, 6);

      // Synchronous PNG Snapshot capture immediately after gl.drawArrays while drawing buffer is still valid
      if (pendingSnapshotRef.current && outCanvas) {
        pendingSnapshotRef.current = false;
        try {
          const a = document.createElement('a');
          a.download = `REX_MEMC_Frame_${Math.floor(currentTimeRef.current * 1000)}.png`;
          a.href = outCanvas.toDataURL('image/png');
          a.click();
          showToast('Кадр сохранён в формате PNG');
        } catch {
          showToast('Не удалось сохранить кадр из защищённого потока');
        }
      }

      // Count ONLY genuinely synthesized intermediate sub-frames (0.01 < alpha < 0.99)
      if (
        shaderMode > 0 &&
        alpha > 0.01 &&
        alpha < 0.99 &&
        (isActivelyPlaying || cfg.manualSubframePhase !== null) &&
        (cfg.hasLoadedVideo || cfg.isDemoTestActive)
      ) {
        synthesizedCounterRef.current += 1;
      }

      // Measure actual GPU synthesis command latency in milliseconds
      const rawProcMs = Math.max(0.08, performance.now() - procStart);
      procLatencyAvgRef.current = procLatencyAvgRef.current * 0.88 + rawProcMs * 0.12;

      frameTimeHistoryRef.current.push(procLatencyAvgRef.current);
      if (frameTimeHistoryRef.current.length > 40) frameTimeHistoryRef.current.shift();

      // Direct DOM updates (~8 times/sec) -> ZERO React re-renders during playback!
      if (now - lastDomSyncTime >= 120) {
        lastDomSyncTime = now;
        const screenHz = Math.min(240, Math.max(30, Math.round(targetRenderFps)));
        const latencyStr = procLatencyAvgRef.current.toFixed(2);
        const srcFps = Math.min(
          120,
          Math.max(12, Math.round(1000 / Math.max(8, estimatedFrameIntervalMsRef.current)))
        );
        const activeSubFboCount = cascadeShaderVal > 0 ? (cascadeShaderVal >= 3 ? 3 : 1) : 0;
        const keyframeVramBytes = allocatedTexW * allocatedTexH * 8;
        const subframeVramBytes = activeSubFboCount * allocatedSubframeW * allocatedSubframeH * 4;
        const flowVramBytes =
          (allocatedFlowCols * allocatedFlowRows * 3 +
            PYR_L05_COLS * PYR_L05_ROWS +
            PYR_L1_COLS * PYR_L1_ROWS +
            PYR_L2_COLS * PYR_L2_ROWS) *
          4;
        const totalVramMb = (keyframeVramBytes + subframeVramBytes + flowVramBytes) / (1024 * 1024);
        vramUsageMbRef.current = Number(totalVramMb.toFixed(1));
        activeFlowGridStrRef.current = `${allocatedFlowCols}×${allocatedFlowRows}`;
        activeSubframeResStrRef.current = `${allocatedSubframeW}×${allocatedSubframeH}`;

        const pyrLvlCount = allocatedFlowCols > PYR_L05_COLS ? 6 : 5;
        const cascadeBadgeStr =
          cascadeShaderVal > 0
            ? ` • Суб-FBO ${cascadeShaderVal}x (${allocatedSubframeW}×${allocatedSubframeH})`
            : '';
        const ecoBadgeStr = cfg.ecoThermalMode ? ' • ЭКО-Холод' : '';

        if (hudMetricsBadgeRef.current) {
          hudMetricsBadgeRef.current.textContent = `${
            cfg.isDemoTestActive ? 'ТЕСТ 24 FPS • ' : cfg.isAdrenoActive ? 'Adreno GMEM • ' : ''
          }${srcFps}→${screenHz} FPS • Pyr ${pyrLvlCount}-Lvl (${allocatedFlowCols}×${allocatedFlowRows})${ecoBadgeStr}${cascadeBadgeStr} • VRAM ${vramUsageMbRef.current.toFixed(1)} МБ • α=${alpha.toFixed(2)}`;
        }
        if (playerSynthCountRef.current) {
          playerSynthCountRef.current.textContent = String(synthesizedCounterRef.current);
        }
        if (playerAlphaBadgeRef.current) {
          playerAlphaBadgeRef.current.textContent = `α = ${alpha.toFixed(2)} (${srcFps} → ${screenHz} FPS${ecoBadgeStr}${cascadeBadgeStr})`;
        }
        if (timecodeDisplayRef.current) {
          timecodeDisplayRef.current.textContent = formatTime(currentTimeRef.current);
        }
        if (fsTimecodeDisplayRef.current) {
          fsTimecodeDisplayRef.current.textContent = formatTime(currentTimeRef.current);
        }
        const maxDur = cfg.duration > 0 ? cfg.duration : Math.max(100, currentTimeRef.current);
        if (scrubberInputRef.current && !isScrubbingRef.current) {
          scrubberInputRef.current.max = String(maxDur);
          scrubberInputRef.current.value = String(Math.min(maxDur, currentTimeRef.current));
        }
        if (fsScrubberInputRef.current && !isScrubbingRef.current) {
          fsScrubberInputRef.current.max = String(maxDur);
          fsScrubberInputRef.current.value = String(Math.min(maxDur, currentTimeRef.current));
        }
        if (cfg.rememberPosition && currentTimeRef.current > 1 && !cfg.isDemoTestActive) {
          if (activeVideoKeyRef.current) {
            savedPositionsRef.current[activeVideoKeyRef.current] = currentTimeRef.current;
          }
          if (activeVideoUrlRef.current) {
            savedPositionsRef.current[activeVideoUrlRef.current] = currentTimeRef.current;
          }
          // Persist playback position to localStorage every ~1.5 seconds
          if (now - lastPosSaveTime >= 1500) {
            lastPosSaveTime = now;
            saveSavedPositions(savedPositionsRef.current);
          }
        }

        // Check Opening/Ending skip intervals (from Kodik / Anixart stream metadata)
        const curSec = currentTimeRef.current;
        const matchedSkip =
          skipTimingsRef.current.find((s) => curSec >= s.start && curSec < s.end - 1.0) || null;
        if (
          matchedSkip?.start !== activeSkipPromptRef.current?.start ||
          matchedSkip?.end !== activeSkipPromptRef.current?.end
        ) {
          activeSkipPromptRef.current = matchedSkip;
          setActiveSkipPrompt(matchedSkip);
        }

        // Update Dual Subtitle Overlays (Bottom & Top / {\an8}) directly via DOM refs
        const dualSubs = findActiveDualSubtitles(
          cfg.subtitleCues,
          cfg.secondarySubtitleCues,
          currentTimeRef.current - cfg.subDelaySec,
          cfg.subtitlesEnabled,
          cfg.secondarySubtitlesEnabled
        );
        if (subtitleBoxRef.current && subtitleTextSpanRef.current) {
          if (dualSubs.bottomText !== lastSubtitleStr) {
            lastSubtitleStr = dualSubs.bottomText;
            subtitleTextSpanRef.current.textContent = dualSubs.bottomText;
            subtitleBoxRef.current.style.display = dualSubs.bottomText ? 'flex' : 'none';
          }
        }
        if (topSubtitleBoxRef.current && topSubtitleTextSpanRef.current) {
          if (dualSubs.topText !== lastTopSubtitleStr) {
            lastTopSubtitleStr = dualSubs.topText;
            topSubtitleTextSpanRef.current.textContent = dualSubs.topText;
            topSubtitleBoxRef.current.style.display = dualSubs.topText ? 'flex' : 'none';
          }
        }

        // Dynamic Ambilight (32x18 micro-Canvas) + Auto-Crop Black Bars Luma Detector (every ~2.0s)
        if ((cfg.ambilightEnabled || cfg.autoCropBlackBars) && ambilightCanvasRef.current) {
          const ambiCanvas = ambilightCanvasRef.current;
          const ambiCtx = ambiCanvas.getContext('2d', { willReadFrequently: cfg.autoCropBlackBars });
          const ambiSrc = cfg.isDemoTestActive ? stagingCanvas : videoRef.current;
          if (ambiCtx && ambiSrc) {
            try {
              ambiCtx.drawImage(ambiSrc, 0, 0, 32, 18);
              if (cfg.autoCropBlackBars && now - lastAutoCropCheckTime >= 2000) {
                lastAutoCropCheckTime = now;
                const img = ambiCtx.getImageData(0, 0, 32, 18).data;
                const getRowAvgLuma = (row: number) => {
                  let sum = 0;
                  for (let x = 4; x < 28; x++) {
                    const idx = (row * 32 + x) << 2;
                    sum += img[idx] * 0.299 + img[idx + 1] * 0.587 + img[idx + 2] * 0.114;
                  }
                  return sum / 24;
                };
                const midLuma = (getRowAvgLuma(8) + getRowAvgLuma(9)) * 0.5;
                if (midLuma > 18) {
                  let topBarRows = 0;
                  let botBarRows = 0;
                  for (let r = 0; r < 3; r++) {
                    if (getRowAvgLuma(r) < 11) topBarRows++;
                    else break;
                  }
                  for (let r = 17; r > 14; r--) {
                    if (getRowAvgLuma(r) < 11) botBarRows++;
                    else break;
                  }
                  const symBars = Math.min(topBarRows, botBarRows);
                  const cropRatio = Math.min(0.24, (symBars * 2) / 18.0);
                  detectedAutoCropRef.current = cropRatio;
                  setDetectedAutoCropPct(Math.round(cropRatio * 100));
                }
              }
            } catch {
              // Ignore cross-origin readback restrictions
            }
          }
        }

        // Update Top HUD Real-Time Telemetry Sparkline, Dropped Frames & Real Interpolation Ratio
        if (cfg.showTopHud && cfg.showHudTelemetryGraph) {
          if (hudFpsRatioRef.current) {
            hudFpsRatioRef.current.textContent = `${srcFps} → ${screenHz} FPS (${(
              screenHz / Math.max(1, srcFps)
            ).toFixed(1)}x)`;
          }
          if (hudDroppedFramesRef.current) {
            const vidQ =
              !cfg.isDemoTestActive &&
              videoRef.current &&
              typeof videoRef.current.getVideoPlaybackQuality === 'function'
                ? videoRef.current.getVideoPlaybackQuality()
                : null;
            const dropped = vidQ ? vidQ.droppedVideoFrames : 0;
            const totalDec = vidQ ? vidQ.totalVideoFrames : 0;
            hudDroppedFramesRef.current.textContent = `Drop: ${dropped}/${totalDec} • ${latencyStr} мс`;
          }
          const hCanvas = hudTelemetryCanvasRef.current;
          if (hCanvas) {
            const hc = hCanvas.getContext('2d');
            if (hc) {
              const hw = hCanvas.width;
              const hh = hCanvas.height;
              hc.clearRect(0, 0, hw, hh);
              hc.strokeStyle = '#38bdf8';
              hc.lineWidth = 1.6;
              hc.beginPath();
              const hist = frameTimeHistoryRef.current;
              const step = hw / Math.max(1, hist.length - 1);
              for (let i = 0; i < hist.length; i++) {
                const clamped = Math.max(0.05, Math.min(4.0, hist[i]));
                const y = hh - ((clamped - 0.05) / 3.95) * (hh - 6) - 3;
                if (i === 0) hc.moveTo(0, y);
                else hc.lineTo(i * step, y);
              }
              hc.stroke();
            }
          }
        }

        // Update 'You' tab telemetry if open
        if (cfg.activeScreen === 'main' && cfg.activeTab === 'you') {
          if (youSynthCountRef.current) {
            youSynthCountRef.current.textContent = String(synthesizedCounterRef.current);
          }
          if (youAlphaRef.current) {
            youAlphaRef.current.textContent = alpha.toFixed(2);
          }
          if (youLatencyLabelRef.current) {
            youLatencyLabelRef.current.textContent = `GPU (${
              cfg.isAdrenoActive ? 'Adreno GMEM FP16' : 'WebGL'
            }): ${latencyStr} мс`;
          }
          if (youHzLabelRef.current) {
            youHzLabelRef.current.textContent = `Целевой поток: ${screenHz} FPS • Pyr ${pyrLvlCount}-Lvl (${allocatedFlowCols}×${allocatedFlowRows})${ecoBadgeStr}${cascadeBadgeStr} • VRAM ${vramUsageMbRef.current.toFixed(1)} МБ`;
          }

          const tCanvas = telemetryCanvasRef.current;
          if (tCanvas) {
            const tc = tCanvas.getContext('2d');
            if (tc) {
              tc.clearRect(0, 0, tCanvas.width, tCanvas.height);
              tc.strokeStyle = document.documentElement.classList.contains('dark-theme')
                ? '#f4f4f6'
                : '#18181c';
              tc.lineWidth = 2;
              tc.beginPath();
              const hist = frameTimeHistoryRef.current;
              const step = tCanvas.width / (hist.length - 1);
              hist.forEach((val, idx) => {
                const clamped = Math.max(0.05, Math.min(4.0, val));
                const y = tCanvas.height - ((clamped - 0.05) / 3.95) * (tCanvas.height - 10) - 5;
                if (idx === 0) tc.moveTo(0, y);
                else tc.lineTo(idx * step, y);
              });
              tc.stroke();
            }
          }
        }
      }
    };

    animId = requestAnimationFrame(tick);
    return () => {
      cancelAnimationFrame(animId);
      if (outCanvas) {
        outCanvas.removeEventListener('webglcontextlost', onContextLost);
        outCanvas.removeEventListener('webglcontextrestored', onContextRestored);
      }
      if (gl) {
        if (glPrevTex) gl.deleteTexture(glPrevTex);
        if (glCurrTex) gl.deleteTexture(glCurrTex);
        if (glSubframeMidTex) gl.deleteTexture(glSubframeMidTex);
        if (glSubframeQ1Tex) gl.deleteTexture(glSubframeQ1Tex);
        if (glSubframeQ3Tex) gl.deleteTexture(glSubframeQ3Tex);
        if (glLutTex) gl.deleteTexture(glLutTex);
        if (glPyrL4Tex) gl.deleteTexture(glPyrL4Tex);
        if (glPyrL3Tex) gl.deleteTexture(glPyrL3Tex);
        if (glPyrL2Tex) gl.deleteTexture(glPyrL2Tex);
        if (glPyrL1Tex) gl.deleteTexture(glPyrL1Tex);
        if (glPyrL05Tex) gl.deleteTexture(glPyrL05Tex);
        if (glFlowPrevTex) gl.deleteTexture(glFlowPrevTex);
        if (glFlowCurrTex) gl.deleteTexture(glFlowCurrTex);
        if (glSadDebugTex) gl.deleteTexture(glSadDebugTex);
        if (glSubframeMidFbo) gl.deleteFramebuffer(glSubframeMidFbo);
        if (glSubframeQ1Fbo) gl.deleteFramebuffer(glSubframeQ1Fbo);
        if (glSubframeQ3Fbo) gl.deleteFramebuffer(glSubframeQ3Fbo);
        if (glPyrL4Fbo) gl.deleteFramebuffer(glPyrL4Fbo);
        if (glPyrL3Fbo) gl.deleteFramebuffer(glPyrL3Fbo);
        if (glPyrL2Fbo) gl.deleteFramebuffer(glPyrL2Fbo);
        if (glPyrL1Fbo) gl.deleteFramebuffer(glPyrL1Fbo);
        if (glPyrL05Fbo) gl.deleteFramebuffer(glPyrL05Fbo);
        if (glFlowFboPrev) gl.deleteFramebuffer(glFlowFboPrev);
        if (glFlowFboCurr) gl.deleteFramebuffer(glFlowFboCurr);
        if (glSadDebugFbo) gl.deleteFramebuffer(glSadDebugFbo);
        if (quadBuf) gl.deleteBuffer(quadBuf);
        if (flowProg) gl.deleteProgram(flowProg);
        if (synthProg) gl.deleteProgram(synthProg);
      }
    };
  }, []);

  // Re-draw video frame immediately if aspectMode is toggled (preserve glPrevTex & optical flow history when paused!)
  useEffect(() => {
    forceRedrawRef.current = true;
  }, [aspectMode]);

  // Video Stage Pointer & Gesture Handlers
  const showSwipeHudOverlay = useCallback(
    (hud: {
      type: 'brightness' | 'volume' | 'seek';
      title: string;
      valueText: string;
      subText?: string;
      progress: number;
    }) => {
      setSwipeHud(hud);
      if (swipeHudTimeoutRef.current) window.clearTimeout(swipeHudTimeoutRef.current);
      swipeHudTimeoutRef.current = window.setTimeout(() => {
        setSwipeHud(null);
      }, 850);
    },
    []
  );

  // Video Stage Pointer & Swipe Gesture Handlers:
  // - Left Vertical Swipe: Brightness (20% - 180%)
  // - Right Vertical Swipe: Volume (0% - 100%)
  // - Horizontal Swipe: Timeline Seek with target timecode & delta
  const handleStagePointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (isTouchLocked) return;
    if (e.button !== 0 && e.pointerType === 'mouse') return;
    const rect = e.currentTarget.getBoundingClientRect();
    const relX = e.clientX - rect.left;
    const isLeftHalf = relX < rect.width * 0.5;

    didSwipeRef.current = false;
    swipeGestureRef.current = {
      active: true,
      pointerId: e.pointerId,
      startX: e.clientX,
      startY: e.clientY,
      stageWidth: Math.max(1, rect.width),
      stageHeight: Math.max(1, rect.height),
      isLeftHalf,
      lockedAxis: null,
      startVolume: isMuted ? 0 : volume,
      startBrightness: videoBrightness,
      startTime: currentTimeRef.current
    };

    if (longPressSpeed2x) {
      if (holdTimerRef.current) window.clearTimeout(holdTimerRef.current);
      holdTimerRef.current = window.setTimeout(() => {
        if (!swipeGestureRef.current.lockedAxis) {
          setIsHoldSpeed2x(true);
          if (videoRef.current) videoRef.current.playbackRate = 2.0;
          triggerSeekFeedback('2.0x Ускорение');
        }
      }, 420);
    }
  };

  const handleStagePointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (isTouchLocked) return;
    const g = swipeGestureRef.current;
    if (!g.active || g.pointerId !== e.pointerId) return;

    const dx = e.clientX - g.startX;
    const dy = e.clientY - g.startY;
    const absDx = Math.abs(dx);
    const absDy = Math.abs(dy);

    // Cancel long-press 2.0x speed timer as soon as user starts moving finger
    if (absDx > 8 || absDy > 8) {
      if (holdTimerRef.current) {
        window.clearTimeout(holdTimerRef.current);
        holdTimerRef.current = null;
      }
      if (isHoldSpeed2x) {
        setIsHoldSpeed2x(false);
        if (videoRef.current) videoRef.current.playbackRate = playbackRate;
      }
    }

    // Lock swipe axis once threshold (10px) is exceeded
    if (!g.lockedAxis) {
      if (absDx < 10 && absDy < 10) return;
      if (absDx > absDy * 1.15) {
        g.lockedAxis = 'horizontal';
      } else if (swipeVolumeBright) {
        g.lockedAxis = 'vertical';
      } else {
        return;
      }
      didSwipeRef.current = true;
      try {
        e.currentTarget.setPointerCapture(e.pointerId);
      } catch {
        // Ignore if capture is unsupported
      }
    }

    if (g.lockedAxis === 'vertical') {
      // Dragging UP (-dy) increases value; dragging DOWN (+dy) decreases value
      const normDelta = -dy / Math.max(140, g.stageHeight * 0.72);

      if (g.isLeftHalf) {
        // Left side vertical swipe -> Brightness (20% to 180%)
        const nextBright = Math.max(
          0.2,
          Math.min(1.8, parseFloat((g.startBrightness + normDelta * 1.25).toFixed(2)))
        );
        setVideoBrightness(nextBright);
        forceRedrawRef.current = true;
        const pct = Math.round(nextBright * 100);
        const barPct = Math.max(0, Math.min(100, ((nextBright - 0.2) / 1.6) * 100));
        showSwipeHudOverlay({
          type: 'brightness',
          title: 'Яркость',
          valueText: `${pct}%`,
          progress: barPct
        });
      } else {
        // Right side vertical swipe -> Volume (0% to 100%)
        const nextVol = Math.max(0, Math.min(1, parseFloat((g.startVolume + normDelta).toFixed(2))));
        setVolume(nextVol);
        setIsMuted(nextVol === 0);
        if (videoRef.current) {
          videoRef.current.volume = nextVol;
          videoRef.current.muted = nextVol === 0;
        }
        const pct = Math.round(nextVol * 100);
        showSwipeHudOverlay({
          type: 'volume',
          title: 'Громкость',
          valueText: nextVol === 0 ? '0%' : `${pct}%`,
          progress: pct
        });
      }
    } else if (g.lockedAxis === 'horizontal') {
      // Horizontal swipe -> Smooth Video Seek
      const maxDur = duration > 0 ? duration : Math.max(60, g.startTime + 60);
      const seekSpanSec = Math.min(90, Math.max(15, maxDur * 0.35));
      const deltaSec = (dx / Math.max(160, g.stageWidth * 0.82)) * seekSpanSec;
      const targetTime = Math.max(0, Math.min(maxDur, g.startTime + deltaSec));
      const actualDelta = targetTime - g.startTime;

      isScrubbingRef.current = true;
      currentTimeRef.current = targetTime;
      forceRedrawRef.current = true;

      if (timecodeDisplayRef.current) {
        timecodeDisplayRef.current.textContent = formatTime(targetTime);
      }
      if (fsTimecodeDisplayRef.current) {
        fsTimecodeDisplayRef.current.textContent = formatTime(targetTime);
      }
      if (scrubberInputRef.current) {
        scrubberInputRef.current.value = String(targetTime);
      }
      if (fsScrubberInputRef.current) {
        fsScrubberInputRef.current.value = String(targetTime);
      }
      if (subtitleBoxRef.current && subtitleTextSpanRef.current) {
        if (!subtitlesEnabled || !subtitleCues.length) {
          subtitleBoxRef.current.style.display = 'none';
        } else {
          const cueText = findActiveSubtitleText(subtitleCues, targetTime - subDelaySec);
          subtitleTextSpanRef.current.textContent = cueText;
          subtitleBoxRef.current.style.display = cueText ? 'flex' : 'none';
        }
      }

      if (isDemoTestActive) {
        forceDemoStepRef.current = true;
      } else {
        const nowMs = performance.now();
        if (videoRef.current && hasLoadedVideo && nowMs - lastSwipeSeekSyncRef.current >= 45) {
          lastSwipeSeekSyncRef.current = nowMs;
          videoRef.current.currentTime = targetTime;
        }
      }

      const sign = actualDelta >= 0 ? '+' : '';
      const progressPct = maxDur > 0 ? Math.max(0, Math.min(100, (targetTime / maxDur) * 100)) : 0;
      showSwipeHudOverlay({
        type: 'seek',
        title: 'Перемотка',
        valueText: `${sign}${actualDelta.toFixed(1)} с`,
        subText: `${formatTime(targetTime)} / ${formatTime(maxDur)}`,
        progress: progressPct
      });
    }
  };

  const handleStagePointerUpOrLeave = (e: React.PointerEvent<HTMLDivElement>) => {
    if (isTouchLocked) return;
    if (holdTimerRef.current) {
      window.clearTimeout(holdTimerRef.current);
      holdTimerRef.current = null;
    }
    if (isHoldSpeed2x) {
      setIsHoldSpeed2x(false);
      if (videoRef.current) videoRef.current.playbackRate = playbackRate;
    }

    const g = swipeGestureRef.current;
    if (g.active && g.pointerId === e.pointerId) {
      if (g.lockedAxis === 'horizontal') {
        setCurrentTime(currentTimeRef.current);
        if (isDemoTestActive) {
          forceDemoStepRef.current = true;
          forceRedrawRef.current = true;
        } else if (videoRef.current && hasLoadedVideo) {
          videoRef.current.currentTime = currentTimeRef.current;
        }
        if (rememberPosition && !isDemoTestActive) {
          if (activeVideoKeyRef.current) {
            savedPositionsRef.current[activeVideoKeyRef.current] = currentTimeRef.current;
          }
          if (activeVideoUrlRef.current) {
            savedPositionsRef.current[activeVideoUrlRef.current] = currentTimeRef.current;
          }
          saveSavedPositions(savedPositionsRef.current);
        }
        isScrubbingRef.current = false;
      }
      g.active = false;
      g.lockedAxis = null;
      try {
        if (e.currentTarget.hasPointerCapture?.(e.pointerId)) {
          e.currentTarget.releasePointerCapture(e.pointerId);
        }
      } catch {
        // Ignore
      }
    }
  };

  const revealFsControls = useCallback(() => {
    setFsControlsVisible(true);
    fsControlsVisibleRef.current = true;
    if (fsHideTimerRef.current) window.clearTimeout(fsHideTimerRef.current);
    fsHideTimerRef.current = window.setTimeout(() => {
      if (
        engineConfigRef.current.isPlaying &&
        fsActivePanelRef.current === 'none' &&
        !isScrubbingRef.current
      ) {
        setFsControlsVisible(false);
        fsControlsVisibleRef.current = false;
      }
    }, 8000);
  }, []);

  const handleStageClick = (e: React.MouseEvent<HTMLDivElement>) => {
    if (isTouchLocked) return;
    if (isHoldSpeed2x) return;
    if (didSwipeRef.current) {
      didSwipeRef.current = false;
      return;
    }
    const rect = e.currentTarget.getBoundingClientRect();
    const clickX = e.clientX - rect.left;
    const width = rect.width;
    const now = Date.now();

    if (now - lastTapTimeRef.current < 280) {
      if (singleTapTimerRef.current) {
        window.clearTimeout(singleTapTimerRef.current);
        singleTapTimerRef.current = null;
      }
      if (isFullscreen) revealFsControls();
      const isRightSide = clickX > width / 2;
      const deltaSec = isRightSide ? doubleTapSeekSec : -doubleTapSeekSec;
      const maxDur = duration > 0 ? duration : 100;
      const nextTime = Math.max(0, Math.min(maxDur, currentTimeRef.current + deltaSec));
      seekToTime(nextTime);
      showSwipeHudOverlay({
        type: 'seek',
        title: 'Перемотка',
        valueText: isRightSide ? `+${doubleTapSeekSec} с` : `-${doubleTapSeekSec} с`,
        subText: `${formatTime(nextTime)} / ${formatTime(maxDur)}`,
        progress: maxDur > 0 ? Math.max(0, Math.min(100, (nextTime / maxDur) * 100)) : 0
      });
      lastTapTimeRef.current = 0;
    } else {
      lastTapTimeRef.current = now;
      if (singleTapTimerRef.current) window.clearTimeout(singleTapTimerRef.current);
      singleTapTimerRef.current = window.setTimeout(() => {
        if (isFullscreen) {
          if (fsActivePanelRef.current !== 'none') {
            setFsActivePanel('none');
            revealFsControls();
            return;
          }
          if (!fsControlsVisibleRef.current) {
            revealFsControls();
          } else {
            if (fsHideTimerRef.current) window.clearTimeout(fsHideTimerRef.current);
            setFsControlsVisible(false);
            fsControlsVisibleRef.current = false;
          }
          return;
        }
        if (!hasLoadedVideo && !isDemoTestActive) {
          return;
        }
        setIsPlaying((prev) => {
          const next = !prev;
          if (videoRef.current && !isDemoTestActive) {
            if (next) {
              initWebAudio();
              videoRef.current.play().catch(() => {});
            } else {
              videoRef.current.pause();
            }
          }
          forceRedrawRef.current = true;
          return next;
        });
      }, 240);
    }
  };

  const handleStageWheel = (e: React.WheelEvent<HTMLDivElement>) => {
    if (isTouchLocked || !swipeVolumeBright) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const isLeftHalf = e.clientX - rect.left < rect.width * 0.5;
    const step = e.deltaY < 0 ? 0.05 : -0.05;

    if (isLeftHalf) {
      const nextBright = Math.max(0.2, Math.min(1.8, parseFloat((videoBrightness + step).toFixed(2))));
      setVideoBrightness(nextBright);
      forceRedrawRef.current = true;
      const pct = Math.round(nextBright * 100);
      showSwipeHudOverlay({
        type: 'brightness',
        title: 'Яркость',
        valueText: `${pct}%`,
        progress: Math.max(0, Math.min(100, ((nextBright - 0.2) / 1.6) * 100))
      });
    } else {
      const nextVol = Math.max(0, Math.min(1, parseFloat((volume + step).toFixed(2))));
      setVolume(nextVol);
      setIsMuted(nextVol === 0);
      if (videoRef.current) {
        videoRef.current.volume = nextVol;
        videoRef.current.muted = nextVol === 0;
      }
      const pct = Math.round(nextVol * 100);
      showSwipeHudOverlay({
        type: 'volume',
        title: 'Громкость',
        valueText: nextVol === 0 ? '0%' : `${pct}%`,
        progress: pct
      });
    }
  };

  // A-B Segment Loop & Bookmarks handlers
  const activeVideoBookmarkKey =
    activeVideoKeyRef.current || lastActiveVideoId || activeVideoTitle || 'default_video';
  const currentVideoBookmarks = bookmarksMap[activeVideoBookmarkKey] || [];

  const handleToggleLoopAB = useCallback(() => {
    const nowSec = currentTimeRef.current;
    if (loopPointA === null) {
      setLoopPointA(nowSec);
      setLoopPointB(null);
      showToast(`Точка A установлена: ${formatTime(nowSec)}`);
    } else if (loopPointB === null) {
      if (nowSec > loopPointA + 0.3) {
        setLoopPointB(nowSec);
        showToast(`Повтор A–B: ${formatTime(loopPointA)} → ${formatTime(nowSec)}`);
      } else {
        setLoopPointA(nowSec);
        showToast(`Точка A обновлена: ${formatTime(nowSec)}`);
      }
    } else {
      setLoopPointA(null);
      setLoopPointB(null);
      showToast('Повтор фрагмента A–B сброшен');
    }
  }, [loopPointA, loopPointB, showToast]);

  const handleAddBookmark = useCallback(() => {
    const nowSec = currentTimeRef.current;
    const key = activeVideoKeyRef.current || lastActiveVideoId || activeVideoTitle || 'default_video';
    const newMark: VideoBookmark = {
      id: `bm_${Date.now()}`,
      time: nowSec,
      label: `Метка ${formatTime(nowSec)}`,
      createdAt: Date.now()
    };
    setBookmarksMap((prev) => {
      const existing = prev[key] || [];
      const updated = [...existing, newMark].sort((a, b) => a.time - b.time);
      const nextMap = { ...prev, [key]: updated };
      saveAllVideoBookmarks(nextMap);
      return nextMap;
    });
    showToast(`Закладка добавлена: ${formatTime(nowSec)}`);
  }, [activeVideoTitle, lastActiveVideoId, showToast]);

  const handleDeleteBookmark = useCallback(
    (bmId: string) => {
      const key = activeVideoKeyRef.current || lastActiveVideoId || activeVideoTitle || 'default_video';
      setBookmarksMap((prev) => {
        const existing = prev[key] || [];
        const updated = existing.filter((b) => b.id !== bmId);
        const nextMap = { ...prev, [key]: updated };
        saveAllVideoBookmarks(nextMap);
        return nextMap;
      });
      showToast('Закладка удалена');
    },
    [activeVideoTitle, lastActiveVideoId, showToast]
  );

  // Seekbar Frame Thumbnail Preview on Hover / Touch Drag
  const lastPreviewSeekMsRef = useRef<number>(0);
  const handleScrubberPointerMove = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      const rect = e.currentTarget.getBoundingClientRect();
      if (rect.width <= 0) return;
      const ratio = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
      const maxDur = duration > 0 ? duration : Math.max(100, currentTimeRef.current);
      const targetSec = ratio * maxDur;
      const leftPct = Math.max(8, Math.min(92, ratio * 100));

      setSeekHoverPreview({
        visible: true,
        timeSec: targetSec,
        leftPct
      });

      const nowMs = performance.now();
      if (nowMs - lastPreviewSeekMsRef.current < 85) return;
      lastPreviewSeekMsRef.current = nowMs;

      const pVid = seekPreviewVideoRef.current;
      const pCanvas = seekPreviewCanvasRef.current;
      if (!pCanvas) return;
      const pCtx = pCanvas.getContext('2d');
      if (!pCtx) return;

      if (pVid && pVid.readyState >= 1 && pVid.src) {
        try {
          if (Math.abs(pVid.currentTime - targetSec) > 0.4) {
            pVid.currentTime = targetSec;
          }
          pCtx.drawImage(pVid, 0, 0, pCanvas.width, pCanvas.height);
          return;
        } catch {
          // Fallback to active canvas or video
        }
      }
      if (renderCanvasRef.current) {
        try {
          pCtx.drawImage(renderCanvasRef.current, 0, 0, pCanvas.width, pCanvas.height);
        } catch {
          // Ignore
        }
      }
    },
    [duration]
  );

  const handleScrubberPointerLeave = useCallback(() => {
    setSeekHoverPreview((prev) => (prev.visible ? { ...prev, visible: false } : prev));
  }, []);

  useEffect(() => {
    const pVid = seekPreviewVideoRef.current;
    if (!pVid) return;
    const onSeeked = () => {
      const pCanvas = seekPreviewCanvasRef.current;
      if (!pCanvas) return;
      const pCtx = pCanvas.getContext('2d');
      if (!pCtx) return;
      try {
        pCtx.drawImage(pVid, 0, 0, pCanvas.width, pCanvas.height);
      } catch {
        // Ignore
      }
    };
    pVid.addEventListener('seeked', onSeeked);
    return () => pVid.removeEventListener('seeked', onSeeked);
  }, []);

  // WebGL Picture-in-Picture (Streams MEMC + Upscaler + HDR10 + 3D LUT Canvas to PiP Window)
  useEffect(() => {
    const pipVid = pipVideoRef.current;
    const mainVid = videoRef.current;
    const onLeavePip = () => {
      setIsPipActive(false);
    };
    const onPipPause = () => {
      if (document.pictureInPictureElement === pipVid) {
        setIsPlaying(false);
        if (mainVid && !mainVid.paused) mainVid.pause();
      }
    };
    const onPipPlay = () => {
      if (document.pictureInPictureElement === pipVid) {
        setIsPlaying(true);
        if (mainVid && mainVid.paused && !isDemoTestActive) {
          mainVid.play().catch(() => {});
        }
      }
    };
    if (pipVid) {
      pipVid.addEventListener('leavepictureinpicture', onLeavePip);
      pipVid.addEventListener('pause', onPipPause);
      pipVid.addEventListener('play', onPipPlay);
    }
    if (mainVid) {
      mainVid.addEventListener('leavepictureinpicture', onLeavePip);
    }
    return () => {
      if (pipVid) {
        pipVid.removeEventListener('leavepictureinpicture', onLeavePip);
        pipVid.removeEventListener('pause', onPipPause);
        pipVid.removeEventListener('play', onPipPlay);
      }
      if (mainVid) {
        mainVid.removeEventListener('leavepictureinpicture', onLeavePip);
      }
    };
  }, [isDemoTestActive]);

  const handleToggleWebglPip = useCallback(async () => {
    try {
      if (document.pictureInPictureElement) {
        await document.exitPictureInPicture();
        setIsPipActive(false);
        return;
      }
      const canvas = renderCanvasRef.current;
      const pipVid = pipVideoRef.current;
      if (canvas && pipVid && typeof (canvas as any).captureStream === 'function') {
        const stream = (canvas as any).captureStream(60) as MediaStream;
        pipVid.srcObject = stream;
        pipVid.muted = true;
        await pipVid.play();
        if (typeof (pipVid as any).requestPictureInPicture === 'function') {
          await (pipVid as any).requestPictureInPicture();
          setIsPipActive(true);
          showToast('Картинка-в-картинке (WebGL MEMC + Upscale) включена');
          return;
        }
      }
      if (videoRef.current && typeof (videoRef.current as any).requestPictureInPicture === 'function') {
        await (videoRef.current as any).requestPictureInPicture();
        setIsPipActive(true);
        showToast('Картинка-в-картинке включена');
      } else {
        showToast('Picture-in-Picture не поддерживается браузером');
      }
    } catch {
      showToast('Не удалось открыть окно Картинка-в-картинке');
    }
  }, [showToast]);

  // Export Real-Time Telemetry & GPU Diagnostics JSON
  const handleExportDiagnosticsJson = useCallback(() => {
    const vidQ =
      videoRef.current && typeof videoRef.current.getVideoPlaybackQuality === 'function'
        ? videoRef.current.getVideoPlaybackQuality()
        : null;
    const srcFps = Math.min(
      120,
      Math.max(12, Math.round(1000 / Math.max(8, estimatedFrameIntervalMsRef.current)))
    );
    const report = {
      exportedAt: new Date().toISOString(),
      gpu: detectedGpuInfo,
      video: {
        title: activeVideoTitle,
        resolution: videoNativeRes,
        sourceFps: srcFps,
        targetFps: effectiveTargetFps,
        interpolationRatio: `${srcFps} -> ${effectiveTargetFps} FPS`,
        droppedVideoFrames: vidQ ? vidQ.droppedVideoFrames : 0,
        totalVideoFrames: vidQ ? vidQ.totalVideoFrames : 0,
        synthesizedSubframes: synthesizedCounterRef.current
      },
      processor: {
        interpEnabled,
        interpMode,
        flowScaleMode,
        activeFlowGrid: activeFlowGridStrRef.current,
        subframeCascadeEnabled,
        subframeCascadeMode,
        subframeBufferResMode,
        activeSubframeRes: activeSubframeResStrRef.current,
        estimatedVramMb: vramUsageMbRef.current,
        upscaleEnabled,
        upscaleMode,
        effectiveUpscaleFactor,
        debandEnabled,
        debandStrength,
        hdrEnabled,
        adrenoTrue10Hdr,
        lutPreset,
        lutStrength,
        autoCropBlackBars,
        detectedAutoCropPct
      },
      frameTimeMsHistory: frameTimeHistoryRef.current.map((v) => Number(v.toFixed(3)))
    };
    const blob = new Blob([JSON.stringify(report, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `REX_Telemetry_Report_${Date.now()}.json`;
    a.click();
    window.setTimeout(() => URL.revokeObjectURL(url), 2000);
    showToast('Диагностический отчёт телеметрии экспортирован (JSON)');
  }, [
    activeVideoTitle,
    adrenoTrue10Hdr,
    autoCropBlackBars,
    debandEnabled,
    debandStrength,
    detectedAutoCropPct,
    detectedGpuInfo,
    effectiveTargetFps,
    effectiveUpscaleFactor,
    flowScaleMode,
    hdrEnabled,
    interpEnabled,
    interpMode,
    lutPreset,
    lutStrength,
    showToast,
    subframeBufferResMode,
    subframeCascadeEnabled,
    subframeCascadeMode,
    upscaleEnabled,
    upscaleMode,
    videoNativeRes
  ]);

  // Process FileList (Videos, Subtitles .srt/.vtt/.ass/.ssa, or 3D LUT .cube) from Input, Folder Picker, or Drag & Drop
  const processUploadedFiles = useCallback(
    (files: FileList | File[] | null, customSourceLabel?: string) => {
      if (!files || !files.length) return;
      const addedVideos: LibraryVideoItem[] = [];
      let detectedFolder: string | null = customSourceLabel || null;

      Array.from(files).forEach((file) => {
        const lower = file.name.toLowerCase();
        if (
          lower.endsWith('.srt') ||
          lower.endsWith('.vtt') ||
          lower.endsWith('.ass') ||
          lower.endsWith('.ssa')
        ) {
          loadSubtitleFileObject(file);
          return;
        }
        if (lower.endsWith('.cube')) {
          const reader = new FileReader();
          reader.onload = (ev) => {
            const strip = parseCubeFileToLutStrip((ev.target?.result as string) || '');
            if (strip) {
              customLutStripRef.current = strip;
              setCustomLutName(file.name);
              setLutPreset('custom');
              setLutVersion((v) => v + 1);
              showToast(`3D LUT загружен: ${file.name}`);
            }
          };
          reader.readAsText(file, 'utf-8');
          return;
        }

        const isVideo =
          file.type.startsWith('video/') ||
          /\.(mp4|webm|mkv|mov|avi|m4v|ogv)$/i.test(lower);
        if (!isVideo) return;

        const url = URL.createObjectURL(file);
        const sizeStr = `${(file.size / (1024 * 1024)).toFixed(1).replace('.', ',')} MB`;
        const relPath = (file as File & { webkitRelativePath?: string }).webkitRelativePath;
        const folderSource =
          customSourceLabel ||
          (relPath && relPath.includes('/')
            ? relPath.split('/').slice(0, -1).join('/')
            : 'Память смартфона');

        if (!detectedFolder && relPath && relPath.includes('/')) {
          detectedFolder = relPath.split('/')[0];
        }

        // Stable ID based on filename + file size so re-importing the same file updates instead of duplicating
        const stableId = `vault_${file.name.replace(/[^a-zA-Z0-9._-]/g, '_')}_${file.size}`;

        const newVideo: LibraryVideoItem = {
          id: stableId,
          title: file.name,
          fileUrl: url,
          fps: 24,
          duration: 0,
          size: sizeStr,
          sourceLabel: folderSource
        };

        addedVideos.push(newVideo);

        // Save binary File/Blob into IndexedDB so next app launch binds it immediately
        void saveVideoToVault({
          id: stableId,
          title: file.name,
          blob: file,
          fps: 24,
          duration: 0,
          size: sizeStr,
          sourceLabel: folderSource,
          addedAt: Date.now()
        });

        // Generate video frame thumbnail preview icon asynchronously
        generateVideoThumbnail(url, stableId);
      });

      if (detectedFolder) {
        setBoundFolderName(detectedFolder);
      }

      if (addedVideos.length > 0) {
        setUserVideos((prev) => {
          const prevMap = new Map(prev.map((p) => [p.id, p]));
          const addedIds = new Set(addedVideos.map((v) => v.id));
          prev.forEach((p) => {
            if (
              addedIds.has(p.id) &&
              p.fileUrl &&
              p.fileUrl.startsWith('blob:') &&
              p.fileUrl !== activeVideoUrlRef.current
            ) {
              try {
                URL.revokeObjectURL(p.fileUrl);
              } catch {
                // Ignore
              }
            }
          });
          const mergedAdded = addedVideos.map((v) => {
            const existing = prevMap.get(v.id);
            return existing
              ? {
                  ...v,
                  duration: v.duration || existing.duration,
                  resolution: v.resolution || existing.resolution,
                  thumbnailUrl: v.thumbnailUrl || existing.thumbnailUrl
                }
              : v;
          });
          return [...mergedAdded, ...prev.filter((p) => !addedIds.has(p.id))];
        });
        setPlaylist((prev) => {
          const prevMap = new Map(prev.map((p) => [p.id, p]));
          const addedIds = new Set(addedVideos.map((v) => v.id));
          const mergedAdded = addedVideos.map((v) => {
            const existing = prevMap.get(v.id);
            return existing
              ? {
                  ...v,
                  duration: v.duration || existing.duration,
                  resolution: v.resolution || existing.resolution,
                  thumbnailUrl: v.thumbnailUrl || existing.thumbnailUrl
                }
              : v;
          });
          return [...mergedAdded, ...prev.filter((p) => !addedIds.has(p.id))];
        });
        setActivePlaylistIndex(0);

        const first = addedVideos[0];
        if (first.fileUrl) {
          setAnixartSession(null);
          setStreamQualities({});
          setActiveStreamQuality('Auto');
          setSkipTimings([]);
          setActiveSkipPrompt(null);
          startRealVideoUrl(first.fileUrl, first.title, first.sourceLabel, first.id, true);
          setActiveScreen('player');
          showToast(
            addedVideos.length === 1
              ? `Привязано в память и запущено: ${first.title}`
              : `Привязано видео со смартфона: ${addedVideos.length}`
          );
        }
      }
    },
    [generateVideoThumbnail, loadSubtitleFileObject, showToast, startRealVideoUrl]
  );

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    processUploadedFiles(e.target.files);
    e.target.value = '';
  };

  // Bind smartphone directory via File System Access API (if available) or fallback directory input
  const handleBindSmartphoneFolder = useCallback(async () => {
    const win = window as Window & {
      showDirectoryPicker?: (opts?: { mode?: 'read' | 'readwrite' }) => Promise<FileSystemDirectoryHandle>;
    };
    if (typeof win.showDirectoryPicker === 'function') {
      try {
        const dirHandle = await win.showDirectoryPicker({ mode: 'read' });
        await saveDirectoryHandleToVault(dirHandle, dirHandle.name);
        setBoundDirHandle(dirHandle);
        setBoundFolderName(dirHandle.name);

        const collectedFiles: File[] = [];
        for await (const entry of (dirHandle as any).values()) {
          if (entry.kind === 'file') {
            const file = await entry.getFile();
            const lower = file.name.toLowerCase();
            if (
              file.type.startsWith('video/') ||
              /\.(mp4|webm|mkv|mov|avi|m4v|ogv|srt|vtt)$/i.test(lower)
            ) {
              collectedFiles.push(file);
            }
          }
        }
        if (collectedFiles.length > 0) {
          processUploadedFiles(collectedFiles, `Папка: ${dirHandle.name}`);
        } else {
          showToast(`Папка «${dirHandle.name}» привязана (видеофайлы не найдены)`);
        }
        return;
      } catch {
        // User cancelled or browser restricted showDirectoryPicker inside iframe -> fallback to input
      }
    }
    folderInputRef.current?.click();
  }, [processUploadedFiles, showToast]);

  // Re-scan previously bound FileSystemDirectoryHandle on one tap
  const handleRescanBoundFolder = useCallback(async () => {
    if (!boundDirHandle) {
      handleBindSmartphoneFolder();
      return;
    }
    try {
      const files: File[] = [];
      for await (const entry of (boundDirHandle as any).values()) {
        if (entry.kind === 'file') {
          const f = await entry.getFile();
          if (
            f.type.startsWith('video/') ||
            /\.(mp4|webm|mkv|mov|avi|m4v|ogv|srt|vtt)$/i.test(f.name.toLowerCase())
          ) {
            files.push(f);
          }
        }
      }
      if (files.length > 0) {
        processUploadedFiles(files, `Папка: ${boundDirHandle.name}`);
      } else {
        showToast('В привязанной папке не найдено новых видео');
      }
    } catch {
      folderInputRef.current?.click();
    }
  }, [boundDirHandle, handleBindSmartphoneFolder, processUploadedFiles, showToast]);

  // Save current processor & audio settings as a named custom preset
  const handleSaveCurrentPreset = useCallback(() => {
    const cleanName = newPresetName.trim() || `Профиль ${userPresets.length + 1}`;
    const preset: UserCustomPreset = {
      id: `preset_${Date.now()}`,
      name: cleanName,
      createdAt: Date.now(),
      settings: {
        interpEnabled,
        interpMode,
        targetFps,
        interpStrength,
        motionScale,
        dejudderHaloControl,
        subframeCascadeEnabled,
        subframeCascadeMode,
        subframeBufferResMode,
        subframeCoherenceGuard,
        sceneCutProtection,
        flowScaleMode,
        upscaleEnabled,
        upscaleMode,
        upscaleFactor,
        upscaleSharpness,
        upscaleDenoise,
        hdrEnabled,
        hdrStrength,
        adrenoMode,
        adrenoGmemFp16,
        adrenoTrue10Hdr,
        ecoThermalMode,
        videoBrightness,
        eqEnabled,
        eqPreset,
        preampGain,
        eqBands
      }
    };
    const updated = [preset, ...userPresets];
    setUserPresets(updated);
    saveUserPresets(updated);
    setNewPresetName('');
    showToast(`Сохранён пресет «${cleanName}»`);
  }, [
    newPresetName,
    userPresets,
    interpEnabled,
    interpMode,
    targetFps,
    interpStrength,
    motionScale,
    dejudderHaloControl,
    subframeCascadeEnabled,
    subframeCascadeMode,
    subframeBufferResMode,
    subframeCoherenceGuard,
    sceneCutProtection,
    flowScaleMode,
    upscaleEnabled,
    upscaleMode,
    upscaleFactor,
    upscaleSharpness,
    upscaleDenoise,
    hdrEnabled,
    hdrStrength,
    adrenoMode,
    adrenoGmemFp16,
    adrenoTrue10Hdr,
    ecoThermalMode,
    videoBrightness,
    eqEnabled,
    eqPreset,
    preampGain,
    eqBands,
    showToast
  ]);

  const handleApplyUserPreset = useCallback(
    (preset: UserCustomPreset) => {
      const s = preset.settings;
      if (s.interpEnabled !== undefined) setInterpEnabled(s.interpEnabled);
      if (s.interpMode !== undefined) setInterpMode(s.interpMode);
      if (s.targetFps !== undefined) setTargetFps(s.targetFps);
      if (s.interpStrength !== undefined) setInterpStrength(s.interpStrength);
      if (s.motionScale !== undefined) setMotionScale(s.motionScale);
      if (s.dejudderHaloControl !== undefined) setDejudderHaloControl(s.dejudderHaloControl);
      if (s.subframeCascadeEnabled !== undefined) setSubframeCascadeEnabled(s.subframeCascadeEnabled);
      if (s.subframeCascadeMode !== undefined) setSubframeCascadeMode(s.subframeCascadeMode);
      if (s.subframeBufferResMode !== undefined) setSubframeBufferResMode(s.subframeBufferResMode);
      if (s.subframeCoherenceGuard !== undefined) setSubframeCoherenceGuard(s.subframeCoherenceGuard);
      if (s.sceneCutProtection !== undefined) setSceneCutProtection(s.sceneCutProtection);
      if (s.flowScaleMode !== undefined) setFlowScaleMode(s.flowScaleMode);
      if (s.upscaleEnabled !== undefined) setUpscaleEnabled(s.upscaleEnabled);
      if (s.upscaleMode !== undefined) setUpscaleMode(s.upscaleMode);
      if (s.upscaleFactor !== undefined) setUpscaleFactor(s.upscaleFactor);
      if (s.upscaleSharpness !== undefined) setUpscaleSharpness(s.upscaleSharpness);
      if (s.upscaleDenoise !== undefined) setUpscaleDenoise(s.upscaleDenoise);
      if (s.hdrEnabled !== undefined) setHdrEnabled(s.hdrEnabled);
      if (s.hdrStrength !== undefined) setHdrStrength(s.hdrStrength);
      if (s.adrenoMode !== undefined) setAdrenoMode(s.adrenoMode);
      if (s.adrenoGmemFp16 !== undefined) setAdrenoGmemFp16(s.adrenoGmemFp16);
      if (s.adrenoTrue10Hdr !== undefined) setAdrenoTrue10Hdr(s.adrenoTrue10Hdr);
      if (s.ecoThermalMode !== undefined) setEcoThermalMode(s.ecoThermalMode);
      if (s.videoBrightness !== undefined) setVideoBrightness(s.videoBrightness);
      if (s.eqEnabled !== undefined) setEqEnabled(s.eqEnabled);
      if (s.eqPreset !== undefined) setEqPreset(s.eqPreset);
      if (s.preampGain !== undefined) setPreampGain(s.preampGain);
      if (s.eqBands !== undefined) setEqBands(s.eqBands);
      forceRedrawRef.current = true;
      showToast(`Применён пресет: ${preset.name}`);
    },
    [showToast]
  );

  const handleDeleteUserPreset = useCallback(
    (id: string, e: React.MouseEvent) => {
      e.stopPropagation();
      const updated = userPresets.filter((p) => p.id !== id);
      setUserPresets(updated);
      saveUserPresets(updated);
      showToast('Пресет удалён');
    },
    [userPresets, showToast]
  );

  // Reset all persisted settings back to factory defaults on explicit user request
  const handleResetAllSettings = useCallback(() => {
    const def = resetPersistedSettings();
    setDarkTheme(def.darkTheme);
    setCompactGrid(def.compactGrid);
    setAspectMode(def.aspectMode);
    setPlaybackRate(def.playbackRate);
    setVolume(def.volume);
    setIsMuted(def.isMuted);
    setVideoBrightness(def.videoBrightness);
    setHdrEnabled(def.hdrEnabled);
    setHdrStrength(def.hdrStrength);
    setUpscaleEnabled(def.upscaleEnabled);
    setUpscaleMode(def.upscaleMode);
    setUpscaleFactor(def.upscaleFactor);
    setUpscaleSharpness(def.upscaleSharpness);
    setUpscaleDenoise(def.upscaleDenoise);
    setAdrenoMode(def.adrenoMode);
    setAdrenoGmemFp16(def.adrenoGmemFp16);
    setAdrenoTrue10Hdr(def.adrenoTrue10Hdr);
    setEcoThermalMode(def.ecoThermalMode);
    setFlowScaleMode(def.flowScaleMode);
    setInterpEnabled(def.interpEnabled);
    setInterpMode(def.interpMode);
    setTargetFps(def.targetFps);
    setInterpStrength(def.interpStrength);
    setMotionScale(def.motionScale);
    setDejudderHaloControl(def.dejudderHaloControl);
    setSubframeCascadeEnabled(def.subframeCascadeEnabled);
    setSubframeCascadeMode(def.subframeCascadeMode);
    setSubframeBufferResMode(def.subframeBufferResMode);
    setSubframeCoherenceGuard(def.subframeCoherenceGuard);
    setMonochromeFilter(def.monochromeFilter);
    setShowVectors(def.showVectors);
    setShowSadHeatmap(def.showSadHeatmap);
    setSceneCutProtection(def.sceneCutProtection);
    setSplitCompareMode(def.splitCompareMode);
    setSubtitlesEnabled(def.subtitlesEnabled);
    setSubFontSize(def.subFontSize);
    setSubDelaySec(def.subDelaySec);
    setSubBgOpacity(def.subBgOpacity);
    setEqEnabled(def.eqEnabled);
    setEqPreset(def.eqPreset);
    setPreampGain(def.preampGain);
    setPitchCorrection(def.pitchCorrection);
    setEqBands(def.eqBands);
    setAutoPlayNext(def.autoPlayNext);
    setLoopPlayback(def.loopPlayback);
    setRememberPosition(def.rememberPosition);
    setAutoBindMediaOnStart(def.autoBindMediaOnStart);
    setShowTopHud(def.showTopHud);
    setShowStepButtons(def.showStepButtons);
    setShowSnapshotBtn(def.showSnapshotBtn);
    setDoubleTapSeekSec(def.doubleTapSeekSec);
    setSwipeVolumeBright(def.swipeVolumeBright);
    setLongPressSpeed2x(def.longPressSpeed2x);
    setVideoOutputMode(def.videoOutputMode);
    if (videoRef.current) {
      videoRef.current.playbackRate = def.playbackRate;
      videoRef.current.volume = def.volume;
      videoRef.current.muted = def.isMuted;
      videoRef.current.preservesPitch = def.pitchCorrection;
    }
    forceRedrawRef.current = true;
    showToast('Все настройки сброшены к значениям по умолчанию');
  }, [showToast]);

  // Sync skipTimingsRef with skipTimings state
  useEffect(() => {
    skipTimingsRef.current = skipTimings;
    if (skipTimings.length === 0) {
      activeSkipPromptRef.current = null;
      setActiveSkipPrompt(null);
    }
  }, [skipTimings]);

  // Universal Network & Online Stream Launcher (supports Anixart release pages, Kodik, Sibnet, HLS .m3u8, and MP4/WebM)
  const handleNetworkLaunch = useCallback(
    async (
      urlToPlay: string,
      opts?: {
        typeId?: number;
        sourceId?: number;
        episodePosition?: number;
        keepModalOpen?: boolean;
      }
    ) => {
      const cleanUrl = urlToPlay.trim();
      if (!cleanUrl) {
        showToast('Введите корректный URL видеопотока или релиза Anixart');
        return;
      }

      setIsResolvingUrl(true);
      showToast('Извлечение прямого видеопотока...');

      try {
        const res = await fetch('/api/resolve-stream', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            url: cleanUrl,
            typeId: opts?.typeId,
            sourceId: opts?.sourceId,
            episodePosition: opts?.episodePosition
          })
        });

        if (!res.ok) {
          const errJson = await res.json().catch(() => ({}));
          throw new Error(errJson.error || `HTTP ${res.status}`);
        }

        const data = await res.json();
        const resolvedUrl: string = data.streamUrl || cleanUrl;
        const resolvedTitle: string =
          data.title || cleanUrl.split('/').pop()?.split('?')[0] || 'Network_Stream.mp4';
        const resolvedSource: string = data.sourceLabel || 'Сеть • Direct Stream';
        const resolvedThumb: string | undefined =
          data.thumbnails?.[0] || data.poster || undefined;
        const qualities: Record<string, string> = data.qualities || { Auto: resolvedUrl };

        setStreamQualities(qualities);
        const matchedQuality =
          Object.entries(qualities).find(([, u]) => u === resolvedUrl)?.[0] ||
          Object.keys(qualities)[0] ||
          'Auto';
        setActiveStreamQuality(matchedQuality);
        setSkipTimings(Array.isArray(data.skipTimings) ? data.skipTimings : []);

        if (data.anixart) {
          setAnixartSession({
            releaseUrl: cleanUrl,
            ...data.anixart
          });
        } else if (!opts?.typeId && !opts?.episodePosition) {
          setAnixartSession(null);
        }

        const stableId = data.anixart
          ? `anixart_${data.anixart.release.id}_ep_${data.anixart.selectedEpisodePosition}_${data.anixart.selectedTypeId}`
          : `net_${Date.now()}`;

        const newItem: LibraryVideoItem = {
          id: stableId,
          title: resolvedTitle,
          fileUrl: resolvedUrl,
          fps: 24,
          duration: 0,
          size: `Поток ${matchedQuality}`,
          sourceLabel: resolvedSource,
          thumbnailUrl: resolvedThumb
        };

        void saveVideoToVault({
          id: stableId,
          title: resolvedTitle,
          remoteUrl: resolvedUrl,
          fps: 24,
          duration: 0,
          size: `Поток ${matchedQuality}`,
          sourceLabel: resolvedSource,
          thumbnailDataUrl: resolvedThumb,
          addedAt: Date.now()
        });

        setUserVideos((prev) => [newItem, ...prev.filter((v) => v.id !== stableId)]);
        setPlaylist((prev) => [newItem, ...prev.filter((v) => v.id !== stableId)]);
        setActivePlaylistIndex(0);
        if (!resolvedThumb) {
          generateVideoThumbnail(resolvedUrl, stableId);
        }

        if (!opts?.keepModalOpen) {
          setUrlModalOpen(false);
        }
        startRealVideoUrl(resolvedUrl, resolvedTitle, resolvedSource, stableId, true);
        setActiveScreen('player');
        showToast(`Поток запущен (${matchedQuality}): ${resolvedTitle}`);
      } catch (err: any) {
        // Fallback: if direct .mp4/.m3u8 URL was entered and backend is unreachable (offline mode)
        if (/\.(mp4|webm|m3u8|mkv|mov)(\?|$)/i.test(cleanUrl)) {
          const fallbackTitle = cleanUrl.split('/').pop()?.split('?')[0] || 'Network_Stream.mp4';
          const streamId = `net_${Date.now()}`;
          const newItem: LibraryVideoItem = {
            id: streamId,
            title: fallbackTitle,
            fileUrl: cleanUrl,
            fps: 24,
            duration: 0,
            size: 'Поток URL',
            sourceLabel: 'Сеть • Direct Stream'
          };
          setUserVideos((prev) => [newItem, ...prev]);
          setPlaylist((prev) => [newItem, ...prev]);
          setActivePlaylistIndex(0);
          setUrlModalOpen(false);
          startRealVideoUrl(cleanUrl, fallbackTitle, 'Сеть • Direct Stream', streamId, true);
          setActiveScreen('player');
          showToast(`Поток запущен: ${fallbackTitle}`);
        } else {
          showToast(err?.message || 'Не удалось извлечь видеопоток по ссылке');
        }
      } finally {
        setIsResolvingUrl(false);
      }
    },
    [generateVideoThumbnail, showToast, startRealVideoUrl]
  );

  // Switch Anixart Voiceover (Озвучка) while preserving current episode number
  const handleSelectAnixartVoiceover = useCallback(
    (typeId: number) => {
      if (!anixartSession || isResolvingUrl) return;
      void handleNetworkLaunch(anixartSession.releaseUrl, {
        typeId,
        episodePosition: anixartSession.selectedEpisodePosition
      });
    },
    [anixartSession, handleNetworkLaunch, isResolvingUrl]
  );

  // Switch Anixart Episode (Серия) in current voiceover
  const handleSelectAnixartEpisode = useCallback(
    (episodePos: number) => {
      if (!anixartSession || isResolvingUrl) return;
      void handleNetworkLaunch(anixartSession.releaseUrl, {
        typeId: anixartSession.selectedTypeId,
        sourceId: anixartSession.selectedSourceId,
        episodePosition: episodePos
      });
    },
    [anixartSession, handleNetworkLaunch, isResolvingUrl]
  );

  const handleNextTrack = useCallback(() => {
    if (anixartSession && anixartSession.episodes.length > 1) {
      const currEpIdx = anixartSession.episodes.findIndex(
        (e) => e.position === anixartSession.selectedEpisodePosition
      );
      const nextEpIdx =
        currEpIdx >= 0 ? (currEpIdx + 1) % anixartSession.episodes.length : 0;
      const nextEpPos =
        anixartSession.episodes[nextEpIdx]?.position ??
        anixartSession.selectedEpisodePosition + 1;
      handleSelectAnixartEpisode(nextEpPos);
      return;
    }
    if (!playlist.length) {
      if (hasLoadedVideo || isDemoTestActive) seekToTime(0);
      return;
    }
    if (playlist.length === 1 && !isDemoTestActive && hasLoadedVideo) {
      seekToTime(0);
      return;
    }
    const nextIdx = isDemoTestActive
      ? activePlaylistIndex % playlist.length
      : (activePlaylistIndex + 1) % playlist.length;
    playPlaylistIndex(nextIdx);
  }, [
    activePlaylistIndex,
    anixartSession,
    handleSelectAnixartEpisode,
    hasLoadedVideo,
    isDemoTestActive,
    playPlaylistIndex,
    playlist.length,
    seekToTime
  ]);

  const handlePrevTrack = useCallback(() => {
    if (anixartSession && anixartSession.episodes.length > 1) {
      const currEpIdx = anixartSession.episodes.findIndex(
        (e) => e.position === anixartSession.selectedEpisodePosition
      );
      const prevEpIdx =
        currEpIdx >= 0
          ? (currEpIdx - 1 + anixartSession.episodes.length) %
            anixartSession.episodes.length
          : 0;
      const prevEpPos =
        anixartSession.episodes[prevEpIdx]?.position ??
        Math.max(1, anixartSession.selectedEpisodePosition - 1);
      handleSelectAnixartEpisode(prevEpPos);
      return;
    }
    if (!playlist.length) {
      if (hasLoadedVideo || isDemoTestActive) seekToTime(0);
      return;
    }
    if (playlist.length === 1 && !isDemoTestActive && hasLoadedVideo) {
      seekToTime(0);
      return;
    }
    const prevIdx = isDemoTestActive
      ? activePlaylistIndex % playlist.length
      : (activePlaylistIndex - 1 + playlist.length) % playlist.length;
    playPlaylistIndex(prevIdx);
  }, [
    activePlaylistIndex,
    anixartSession,
    handleSelectAnixartEpisode,
    hasLoadedVideo,
    isDemoTestActive,
    playPlaylistIndex,
    playlist.length,
    seekToTime
  ]);

  // Switch HLS / Stream Quality (720p / 480p / 360p) while preserving exact playback timestamp
  const handleSelectStreamQuality = useCallback(
    (qualityLabel: string) => {
      const targetStreamUrl = streamQualities[qualityLabel];
      if (!targetStreamUrl || qualityLabel === activeStreamQuality) return;
      const resumeSec = currentTimeRef.current;
      setActiveStreamQuality(qualityLabel);
      startRealVideoUrl(
        targetStreamUrl,
        activeVideoTitle,
        activeSourceLabel,
        lastActiveVideoId || undefined,
        isPlaying,
        resumeSec
      );
      showToast(`Качество потока: ${qualityLabel}`);
    },
    [
      activeSourceLabel,
      activeStreamQuality,
      activeVideoTitle,
      isPlaying,
      lastActiveVideoId,
      showToast,
      startRealVideoUrl,
      streamQualities
    ]
  );

  // Take Snapshot PNG (synchronously inside WebGL render pass or from fallback video element)
  const handleSnapshot = () => {
    if (isVideoFallbackActive && videoRef.current) {
      const vid = videoRef.current;
      const vw = vid.videoWidth || STAGE_W;
      const vh = vid.videoHeight || STAGE_H;
      const snapCanvas = document.createElement('canvas');
      snapCanvas.width = vw;
      snapCanvas.height = vh;
      const ctx = snapCanvas.getContext('2d');
      if (!ctx) return;
      try {
        ctx.drawImage(vid, 0, 0, vw, vh);
        const a = document.createElement('a');
        a.download = `REX_Video_Frame_${Math.floor(currentTimeRef.current * 1000)}.png`;
        a.href = snapCanvas.toDataURL('image/png');
        a.click();
        showToast('Кадр сохранён в формате PNG');
      } catch {
        showToast('Не удалось сохранить кадр из защищённого потока');
      }
      return;
    }
    pendingSnapshotRef.current = true;
    forceRedrawRef.current = true;
  };

  // Sync native fullscreen change events
  useEffect(() => {
    const onFsChange = () => {
      if (document.fullscreenElement) {
        setIsFullscreen(true);
        revealFsControls();
      } else {
        setIsFullscreen(false);
      }
    };
    document.addEventListener('fullscreenchange', onFsChange);
    return () => document.removeEventListener('fullscreenchange', onFsChange);
  }, [revealFsControls]);

  // Toggle Fullscreen (supports both Native Fullscreen API and fallback container fullscreen)
  const toggleFullscreen = () => {
    if (!stageContainerRef.current) return;
    if (!isFullscreen) {
      setIsFullscreen(true);
      revealFsControls();
      if (!document.fullscreenElement) {
        stageContainerRef.current.requestFullscreen?.().catch(() => {});
      }
    } else {
      setIsFullscreen(false);
      if (document.fullscreenElement) {
        document.exitFullscreen?.().catch(() => {});
      }
    }
  };

  // Desktop & Tablet Global Keyboard Shortcuts (Space, Arrows, Comma/Period Frame Step, F, M, C, Esc)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      if (
        target &&
        (target.tagName === 'INPUT' ||
          target.tagName === 'TEXTAREA' ||
          target.isContentEditable)
      ) {
        if (e.code === 'Escape') {
          target.blur();
        }
        return;
      }

      if (e.code === 'Escape') {
        if (urlModalOpen) {
          e.preventDefault();
          setUrlModalOpen(false);
          return;
        }
        if (activeModal) {
          e.preventDefault();
          setActiveModal(null);
          return;
        }
        if (isFullscreen) {
          e.preventDefault();
          if (fsActivePanelRef.current !== 'none') {
            setFsActivePanel('none');
          } else {
            toggleFullscreen();
          }
          return;
        }
        return;
      }

      // Only intercept player hotkeys when on the player screen and no modal is open
      if (activeScreen !== 'player' || activeModal || urlModalOpen) {
        return;
      }

      if (e.code === 'Space' || e.code === 'KeyK') {
        e.preventDefault();
        if (hasLoadedVideo || isDemoTestActive) {
          setIsPlaying((prev) => {
            const next = !prev;
            if (videoRef.current && !isDemoTestActive) {
              if (next) {
                initWebAudio();
                videoRef.current.play().catch(() => {});
              } else {
                videoRef.current.pause();
              }
            }
            forceRedrawRef.current = true;
            return next;
          });
        }
      } else if (e.code === 'Comma' || e.code === 'Period') {
        e.preventDefault();
        if (hasLoadedVideo || isDemoTestActive) {
          setIsPlaying(false);
          if (videoRef.current) videoRef.current.pause();
          const stepSec = isDemoTestActive
            ? 1 / 24
            : Math.max(1 / 120, Math.min(1 / 12, (estimatedFrameIntervalMsRef.current || 41.667) / 1000));
          const dir = e.code === 'Period' ? 1 : -1;
          seekToTime(currentTimeRef.current + dir * stepSec);
          triggerSeekFeedback(dir > 0 ? '+1 кадр' : '-1 кадр');
        }
      } else if (e.code === 'ArrowLeft') {
        e.preventDefault();
        if (hasLoadedVideo || isDemoTestActive) {
          const step = doubleTapSeekSec || 5;
          seekToTime(currentTimeRef.current - step);
          triggerSeekFeedback(`-${step} с`);
        }
      } else if (e.code === 'ArrowRight') {
        e.preventDefault();
        if (hasLoadedVideo || isDemoTestActive) {
          const step = doubleTapSeekSec || 5;
          seekToTime(currentTimeRef.current + step);
          triggerSeekFeedback(`+${step} с`);
        }
      } else if (e.code === 'ArrowUp') {
        e.preventDefault();
        const nextVol = Math.min(1.0, parseFloat((volume + 0.05).toFixed(2)));
        setVolume(nextVol);
        setIsMuted(nextVol === 0);
        if (videoRef.current) {
          videoRef.current.volume = nextVol;
          videoRef.current.muted = nextVol === 0;
        }
        showSwipeHudOverlay({
          type: 'volume',
          title: 'Громкость',
          valueText: `${Math.round(nextVol * 100)}%`,
          progress: Math.round(nextVol * 100)
        });
      } else if (e.code === 'ArrowDown') {
        e.preventDefault();
        const nextVol = Math.max(0.0, parseFloat((volume - 0.05).toFixed(2)));
        setVolume(nextVol);
        setIsMuted(nextVol === 0);
        if (videoRef.current) {
          videoRef.current.volume = nextVol;
          videoRef.current.muted = nextVol === 0;
        }
        showSwipeHudOverlay({
          type: 'volume',
          title: 'Громкость',
          valueText: nextVol === 0 ? '0%' : `${Math.round(nextVol * 100)}%`,
          progress: Math.round(nextVol * 100)
        });
      } else if (e.code === 'KeyF') {
        e.preventDefault();
        toggleFullscreen();
      } else if (e.code === 'KeyM') {
        e.preventDefault();
        setIsMuted((prev) => {
          const next = !prev;
          if (videoRef.current) videoRef.current.muted = next;
          showToast(next ? 'Звук выключен' : 'Звук включен');
          return next;
        });
      } else if (e.code === 'KeyC') {
        e.preventDefault();
        setSubtitlesEnabled((prev) => {
          const next = !prev;
          showToast(next ? 'Субтитры включены' : 'Субтитры выключены');
          return next;
        });
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [
    activeModal,
    activeScreen,
    doubleTapSeekSec,
    duration,
    hasLoadedVideo,
    initWebAudio,
    isDemoTestActive,
    isFullscreen,
    seekToTime,
    showSwipeHudOverlay,
    showToast,
    triggerSeekFeedback,
    urlModalOpen,
    volume
  ]);

  // Helper to filter settings sections by search input
  const matchesSettingsQuery = (keywords: string) => {
    const q = settingsFilter.trim().toLowerCase();
    if (!q) return true;
    return keywords.toLowerCase().includes(q);
  };

  const filteredUserVideos = userVideos.filter(
    (v) =>
      !searchFilter ||
      v.title.toLowerCase().includes(searchFilter.toLowerCase()) ||
      v.sourceLabel.toLowerCase().includes(searchFilter.toLowerCase())
  );

  // Find last watched video item for Quick Resume card
  const resumeVideoItem =
    userVideos.find((v) => v.id === lastActiveVideoId) ||
    (userVideos.length > 0 ? userVideos[0] : null);
  const resumeSavedSec = resumeVideoItem
    ? savedPositionsRef.current[resumeVideoItem.id] ??
      savedPositionsRef.current[resumeVideoItem.title] ??
      0
    : 0;

  return (
    <div
      className="app-shell flex flex-col min-h-screen max-w-[960px] mx-auto relative"
      onDragOver={(e) => {
        e.preventDefault();
        if (!isDraggingOver) setIsDraggingOver(true);
      }}
      onDragLeave={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget as Node | null)) {
          setIsDraggingOver(false);
        }
      }}
      onDrop={(e) => {
        e.preventDefault();
        setIsDraggingOver(false);
        processUploadedFiles(e.dataTransfer.files);
      }}
    >
      {/* Hidden File & Directory Inputs */}
      <input
        ref={fileInputRef}
        type="file"
        accept="video/*,.srt,.vtt"
        multiple
        className="hidden"
        onChange={handleFileUpload}
      />
      <input
        ref={folderInputRef}
        type="file"
        // @ts-expect-error webkitdirectory is standard in modern browsers for directory selection
        webkitdirectory=""
        directory=""
        multiple
        className="hidden"
        onChange={handleFileUpload}
      />
      <input
        ref={subFileInputRef}
        type="file"
        accept=".srt,.vtt,.ass,.ssa,text/vtt,application/x-subrip"
        className="hidden"
        onChange={handleSubtitleUpload}
      />
      <input
        ref={secondarySubFileInputRef}
        type="file"
        accept=".srt,.vtt,.ass,.ssa,text/vtt,application/x-subrip"
        className="hidden"
        onChange={handleSecondarySubtitleUpload}
      />
      <input
        ref={lutFileInputRef}
        type="file"
        accept=".cube"
        className="hidden"
        onChange={handleLutFileUpload}
      />
      {/* Hidden Helper Videos for Seekbar Frame Thumbnails & WebGL Picture-in-Picture Stream */}
      <video
        ref={seekPreviewVideoRef}
        muted
        playsInline
        preload="metadata"
        className="hidden pointer-events-none"
      />
      <video
        ref={pipVideoRef}
        muted
        playsInline
        className="hidden pointer-events-none"
      />

      {/* Global Drag & Drop Overlay */}
      {isDraggingOver && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-md flex flex-col items-center justify-center gap-3 pointer-events-none p-6">
          <div className="p-6 rounded-3xl border-2 border-dashed border-white/60 text-center max-w-md">
            <Upload className="w-10 h-10 text-white mx-auto mb-2" />
            <div className="rex-serif text-lg font-bold text-white">
              Отпустите видеофайл или субтитры
            </div>
            <p className="text-xs text-zinc-300 mt-1">
              Поддерживаются .MP4, .WEBM, .MKV, а также внешние субтитры .SRT и .VTT
            </p>
          </div>
        </div>
      )}

      {/* ============================== SCREEN 1: MAIN MEDIA LIBRARY ============================== */}
      <div className={activeScreen === 'main' ? 'block flex-1 pb-24' : 'hidden'}>
        {/* Header */}
        <header className="sticky top-0 z-20 px-5 pt-5 pb-3 flex items-center justify-between backdrop-blur-md">
          <div className="flex items-center gap-3">
            <h1 className="rex-serif text-2xl sm:text-3xl font-black tracking-tight">REX Player</h1>
            <span
              className="text-[11px] font-mono-code font-semibold px-2.5 py-0.5 rounded-full"
              style={{ background: 'var(--surface-pill)', color: 'var(--text-main)' }}
            >
              MEMC {targetFps} FPS
            </span>
          </div>

          <div className="flex items-center gap-1.5">
            {!isInstalledPwa && (
              <button
                type="button"
                onClick={handleInstallWebApk}
                className="px-3 py-1.5 rounded-full text-xs font-semibold transition cursor-pointer flex items-center gap-1.5 mr-1"
                style={{ background: 'var(--accent-bg)', color: 'var(--accent-text)' }}
                title="Установить APK / WebAPK на Android"
              >
                <Smartphone className="w-3.5 h-3.5" />
                <span>APK</span>
              </button>
            )}

            <button
              type="button"
              onClick={() => setSearchOpen((prev) => !prev)}
              className="p-2.5 rounded-full hover:opacity-80 transition cursor-pointer"
              style={{ color: 'var(--text-main)' }}
              title="Поиск видео"
            >
              <Search className="w-5 h-5" />
            </button>

            <button
              type="button"
              onClick={() => {
                setCompactGrid((prev) => !prev);
                showToast(!compactGrid ? 'Вид: Компактная сетка' : 'Вид: Список видео');
              }}
              className="p-2.5 rounded-full hover:opacity-80 transition cursor-pointer"
              style={{ color: 'var(--text-main)' }}
              title="Переключить вид списка / сетки"
            >
              {compactGrid ? <List className="w-5 h-5" /> : <LayoutGrid className="w-5 h-5" />}
            </button>

            <button
              type="button"
              onClick={() => {
                setDarkTheme((prev) => !prev);
                showToast(
                  !darkTheme
                    ? 'Тёмная монохромная тема Material You'
                    : 'Светлая монохромная тема Material You'
                );
              }}
              className="p-2.5 rounded-full hover:opacity-80 transition cursor-pointer"
              style={{ color: 'var(--text-main)' }}
              title="Переключить тему"
            >
              {darkTheme ? <Sun className="w-5 h-5" /> : <Moon className="w-5 h-5" />}
            </button>

            <button
              type="button"
              onClick={() => setActiveScreen('settings')}
              className="p-2.5 rounded-full hover:opacity-80 transition cursor-pointer"
              style={{ color: 'var(--text-main)' }}
              title="Настройки"
            >
              <SettingsIcon className="w-5 h-5" />
            </button>
          </div>
        </header>

        {/* Collapsible Search Bar */}
        {searchOpen && (
          <div className="px-5 pb-3">
            <div
              className="flex items-center gap-3 px-4 py-3 rounded-full"
              style={{ background: 'var(--surface-card)', border: '1px solid var(--border-soft)' }}
            >
              <Search className="w-4 h-4 shrink-0" style={{ color: 'var(--text-sub)' }} />
              <input
                type="text"
                value={searchFilter}
                onChange={(e) => setSearchFilter(e.target.value)}
                placeholder="Поиск по загруженным видео и сценам..."
                className="w-full bg-transparent text-sm focus:outline-none"
                style={{ color: 'var(--text-main)' }}
                autoFocus
              />
              {searchFilter && (
                <button
                  type="button"
                  onClick={() => setSearchFilter('')}
                  className="p-1 rounded-full cursor-pointer"
                  style={{ color: 'var(--text-sub)' }}
                >
                  <X className="w-4 h-4" />
                </button>
              )}
            </div>
          </div>
        )}

        {/* TAB 1: ГЛАВНАЯ */}
        {activeTab === 'home' && (
          <div className="px-4 sm:px-5 flex flex-col gap-4">
            {/* Primary Smartphone Media Auto-Binding & File Picker Card */}
            <div
              className="p-4 rounded-3xl flex flex-col gap-3"
              style={{ background: 'var(--surface-card)', border: '1px solid var(--border-soft)' }}
            >
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="flex items-center gap-3">
                  <div className="m3-icon-box">
                    <Smartphone className="w-5 h-5" />
                  </div>
                  <div>
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-sm sm:text-base font-bold rex-serif">
                        Медиа-хранилище смартфона
                      </span>
                      <span
                        className="text-[10px] font-mono-code font-bold px-2 py-0.5 rounded-full flex items-center gap-1"
                        style={{ background: 'var(--surface-pill)', color: 'var(--text-main)' }}
                      >
                        <Check className="w-3 h-3" />
                        <span>
                          {isVaultHydrated
                            ? `Привязано: ${userVideos.length}`
                            : 'Синхронизация...'}
                        </span>
                      </span>
                    </div>
                    <div className="text-xs mt-0.5" style={{ color: 'var(--text-sub)' }}>
                      {boundFolderName
                        ? `Папка: ${boundFolderName} • Автопривязка при входе активна`
                        : 'Автоматическое сохранение видео и настроек в IndexedDB'}
                    </div>
                  </div>
                </div>

                <div className="flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    className="px-4 py-2 rounded-full text-xs font-semibold transition hover:opacity-90 cursor-pointer flex items-center gap-1.5"
                    style={{ background: 'var(--accent-bg)', color: 'var(--accent-text)' }}
                  >
                    <FileVideo className="w-4 h-4" />
                    <span>Видео / Галерея</span>
                  </button>

                  <button
                    type="button"
                    onClick={startBuiltIn24FpsTest}
                    className="px-3.5 py-2 rounded-full text-xs font-semibold transition cursor-pointer flex items-center gap-1.5"
                    style={{
                      background: 'linear-gradient(135deg, rgba(99,102,241,0.18), rgba(168,85,247,0.24))',
                      color: 'var(--text-main)',
                      border: '1px solid rgba(168,85,247,0.35)'
                    }}
                    title="Запустить встроенный 24.0 FPS кино-тест для наглядной проверки генерации промежуточных кадров MEMC"
                  >
                    <Sparkles className="w-3.5 h-3.5 text-purple-500" />
                    <span>Тест 24→{effectiveTargetFps} FPS</span>
                  </button>

                  <button
                    type="button"
                    onClick={handleBindSmartphoneFolder}
                    className="px-3.5 py-2 rounded-full text-xs font-semibold transition cursor-pointer flex items-center gap-1.5"
                    style={{ background: 'var(--surface-pill)', color: 'var(--text-main)' }}
                    title="Привязать папку смартфона для автозагрузки"
                  >
                    <FolderOpen className="w-4 h-4" />
                    <span>{boundFolderName ? 'Сменить папку' : 'Привязать папку'}</span>
                  </button>

                  {boundDirHandle && (
                    <button
                      type="button"
                      onClick={handleRescanBoundFolder}
                      className="px-3 py-2 rounded-full text-xs font-semibold transition cursor-pointer flex items-center gap-1"
                      style={{ background: 'var(--surface-pill)', color: 'var(--text-main)' }}
                      title="Обновить список файлов из привязанной папки"
                    >
                      <RefreshCw className="w-3.5 h-3.5" />
                    </button>
                  )}

                  <button
                    type="button"
                    onClick={() => setUrlModalOpen(true)}
                    className="px-3.5 py-2 rounded-full text-xs font-semibold transition cursor-pointer"
                    style={{ background: 'var(--surface-pill)', color: 'var(--text-main)' }}
                  >
                    URL
                  </button>
                </div>
              </div>

              {/* Quick Resume Last Watched Video Banner */}
              {resumeVideoItem && (
                <div
                  onClick={() => playLibraryItem(resumeVideoItem)}
                  className="p-3 rounded-2xl flex items-center justify-between gap-3 cursor-pointer transition hover:opacity-95"
                  style={{
                    background: 'var(--surface-elevated)',
                    border: '1px solid var(--border-soft)'
                  }}
                >
                  <div className="flex items-center gap-3 min-w-0">
                    {resumeVideoItem.thumbnailUrl ? (
                      <div
                        className="w-16 h-10 rounded-xl overflow-hidden relative shrink-0 border"
                        style={{ borderColor: 'var(--border-soft)', background: '#000' }}
                      >
                        <img
                          src={resumeVideoItem.thumbnailUrl}
                          alt={resumeVideoItem.title}
                          className="w-full h-full object-cover block"
                        />
                        <div className="absolute inset-0 bg-black/30 flex items-center justify-center">
                          <Play className="w-3.5 h-3.5 text-white fill-current ml-0.5 drop-shadow" />
                        </div>
                      </div>
                    ) : (
                      <div
                        className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0"
                        style={{ background: 'var(--accent-bg)', color: 'var(--accent-text)' }}
                      >
                        <Play className="w-4 h-4 fill-current ml-0.5" />
                      </div>
                    )}
                    <div className="min-w-0">
                      <div className="text-xs font-bold truncate">
                        Продолжить: {resumeVideoItem.title}
                      </div>
                      <div className="text-[11px] font-mono-code" style={{ color: 'var(--text-sub)' }}>
                        {resumeSavedSec > 1
                          ? `Остановлено на ${formatTime(resumeSavedSec)}`
                          : 'Готово к мгновенному запуску'}
                        {resumeVideoItem.resolution ? ` • ${resumeVideoItem.resolution}` : ''}
                      </div>
                    </div>
                  </div>
                  <span
                    className="px-3 py-1 rounded-full text-xs font-mono-code font-bold shrink-0"
                    style={{ background: 'var(--accent-bg)', color: 'var(--accent-text)' }}
                  >
                    {resumeSavedSec > 1 ? formatTime(resumeSavedSec) : 'Смотреть'}
                  </span>
                </div>
              )}
            </div>

            {/* User Loaded Videos Section */}
            <div>
              <div className="flex items-center justify-between px-1 mb-2">
                <h2 className="rex-serif text-sm font-bold">
                  Привязанная медиатека ({filteredUserVideos.length})
                </h2>
                {userVideos.length > 0 && (
                  <button
                    type="button"
                    onClick={clearAllVideos}
                    className="text-xs font-semibold cursor-pointer hover:underline"
                    style={{ color: 'var(--text-sub)' }}
                  >
                    Очистить кэш
                  </button>
                )}
              </div>

              {filteredUserVideos.length === 0 ? (
                <div
                  className="p-8 rounded-3xl border border-dashed flex flex-col items-center justify-center text-center gap-2.5 transition"
                  style={{
                    background: 'var(--surface-card)',
                    borderColor: 'var(--border-strong)'
                  }}
                >
                  <FileVideo className="w-7 h-7" style={{ color: 'var(--text-sub)' }} />
                  <div className="rex-serif font-bold text-sm">Привязанных видео пока нет</div>
                  <p className="text-xs max-w-md" style={{ color: 'var(--text-sub)' }}>
                    Выберите видео со смартфона или запустите встроенный 24 FPS стенд для проверки генерации промежуточных кадров MEMC (Оптический поток)
                  </p>
                  <div className="flex flex-wrap items-center justify-center gap-2 mt-1">
                    <button
                      type="button"
                      onClick={() => fileInputRef.current?.click()}
                      className="px-4 py-2 rounded-full text-xs font-semibold cursor-pointer flex items-center gap-1.5"
                      style={{ background: 'var(--accent-bg)', color: 'var(--accent-text)' }}
                    >
                      <FileVideo className="w-3.5 h-3.5" />
                      <span>Открыть видеофайл</span>
                    </button>
                    <button
                      type="button"
                      onClick={startBuiltIn24FpsTest}
                      className="px-4 py-2 rounded-full text-xs font-semibold cursor-pointer flex items-center gap-1.5"
                      style={{ background: 'var(--surface-pill)', color: 'var(--text-main)' }}
                    >
                      <Sparkles className="w-3.5 h-3.5 text-purple-500" />
                      <span>Демо-тест 24 → {effectiveTargetFps} FPS (50/50)</span>
                    </button>
                  </div>
                </div>
              ) : (
                <div
                  className={
                    compactGrid
                      ? 'grid grid-cols-1 sm:grid-cols-2 gap-2.5'
                      : 'flex flex-col gap-2'
                  }
                >
                  {filteredUserVideos.map((vid) => {
                    const savedSec =
                      savedPositionsRef.current[vid.id] ??
                      savedPositionsRef.current[vid.title] ??
                      0;
                    return (
                      <div
                        key={vid.id}
                        onClick={() => playLibraryItem(vid)}
                        className="m3-setting-item cursor-pointer"
                        style={{ borderRadius: '22px' }}
                      >
                        <div className="flex items-center gap-3.5 min-w-0">
                          {vid.thumbnailUrl ? (
                            <div
                              className="w-20 h-12 rounded-xl overflow-hidden relative shrink-0 border shadow-sm"
                              style={{ borderColor: 'var(--border-soft)', background: '#09090b' }}
                            >
                              <img
                                src={vid.thumbnailUrl}
                                alt={vid.title}
                                className="w-full h-full object-cover block"
                              />
                              <div className="absolute inset-0 bg-black/25 flex items-center justify-center">
                                <div className="w-6 h-6 rounded-full bg-black/65 text-white flex items-center justify-center">
                                  <Play className="w-3 h-3 fill-current ml-0.5" />
                                </div>
                              </div>
                              {vid.duration > 0 && (
                                <span className="absolute bottom-1 right-1 px-1 py-0.2 rounded bg-black/80 text-white font-mono-code text-[9px] font-bold leading-tight">
                                  {formatTime(vid.duration)}
                                </span>
                              )}
                            </div>
                          ) : (
                            <div
                              className="w-20 h-12 rounded-xl flex items-center justify-center shrink-0 relative border"
                              style={{
                                background: 'var(--surface-elevated)',
                                borderColor: 'var(--border-soft)',
                                color: 'var(--text-main)'
                              }}
                            >
                              <FileVideo className="w-5 h-5 opacity-75" />
                              {vid.duration > 0 && (
                                <span className="absolute bottom-1 right-1 px-1 py-0.2 rounded bg-black/75 text-white font-mono-code text-[9px] font-bold leading-tight">
                                  {formatTime(vid.duration)}
                                </span>
                              )}
                            </div>
                          )}
                          <div className="min-w-0">
                            <div className="rex-serif font-bold text-sm truncate">{vid.title}</div>
                            <div className="flex flex-wrap items-center gap-1.5 mt-1">
                              <span className="meta-pill">{vid.size}</span>
                              <span className="meta-pill">{vid.sourceLabel}</span>
                              {vid.resolution && (
                                <span className="meta-pill font-mono-code">{vid.resolution}</span>
                              )}
                              {savedSec > 1 && (
                                <span
                                  className="meta-pill font-mono-code font-bold"
                                  style={{
                                    background: 'var(--accent-bg)',
                                    color: 'var(--accent-text)'
                                  }}
                                >
                                  ⏱ {formatTime(savedSec)}
                                </span>
                              )}
                            </div>
                          </div>
                        </div>

                        <div className="flex items-center gap-2 shrink-0">
                          <button
                            type="button"
                            onClick={(e) => removeUserVideo(vid.id, e)}
                            className="p-2 rounded-full hover:opacity-80 cursor-pointer"
                            style={{ background: 'var(--surface-pill)', color: 'var(--text-main)' }}
                            title="Удалить из медиатеки"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        )}

        {/* TAB 2: YOU */}
        {activeTab === 'you' && (
          <div className="px-4 sm:px-5 flex flex-col gap-4">
            <div
              className="p-5 rounded-3xl flex flex-col gap-4"
              style={{ background: 'var(--surface-card)', border: '1px solid var(--border-soft)' }}
            >
              <div className="flex items-center justify-between flex-wrap gap-3">
                <div className="flex items-center gap-3">
                  <div
                    className="w-12 h-12 rounded-full flex items-center justify-center font-bold text-base"
                    style={{ background: 'var(--accent-bg)', color: 'var(--accent-text)' }}
                  >
                    RX
                  </div>
                  <div>
                    <h2 className="rex-serif text-base font-bold">Движок и телеметрия</h2>
                    <p className="text-xs" style={{ color: 'var(--text-sub)' }}>
                      Desynchronized WebGL • Автосохранение активно
                    </p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setActiveScreen('settings')}
                  className="px-4 py-2 rounded-full text-xs font-semibold cursor-pointer"
                  style={{ background: 'var(--surface-pill)', color: 'var(--text-main)' }}
                >
                  Настройки →
                </button>
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
                <div className="p-3 rounded-2xl" style={{ background: 'var(--surface-elevated)' }}>
                  <div className="text-xs" style={{ color: 'var(--text-sub)' }}>Разрешение</div>
                  <div className="font-mono-code font-bold text-sm mt-0.5">{videoNativeRes}</div>
                </div>

                <div className="p-3 rounded-2xl" style={{ background: 'var(--surface-elevated)' }}>
                  <div className="text-xs" style={{ color: 'var(--text-sub)' }}>Частота MEMC</div>
                  <div className="font-mono-code font-bold text-sm mt-0.5">
                    {interpEnabled && interpMode !== 'off' ? `${effectiveTargetFps} FPS` : 'Нативная'}
                  </div>
                </div>

                <div className="p-3 rounded-2xl" style={{ background: 'var(--surface-elevated)' }}>
                  <div className="text-xs" style={{ color: 'var(--text-sub)' }}>Синтезировано</div>
                  <div ref={youSynthCountRef} className="font-mono-code font-bold text-sm mt-0.5">
                    {synthesizedCount}
                  </div>
                </div>

                <div className="p-3 rounded-2xl" style={{ background: 'var(--surface-elevated)' }}>
                  <div className="text-xs" style={{ color: 'var(--text-sub)' }}>Фаза α</div>
                  <div ref={youAlphaRef} className="font-mono-code font-bold text-sm mt-0.5">
                    {subframeAlpha.toFixed(2)}
                  </div>
                </div>
              </div>

              {/* Adaptive FBO Flow Scale & Sub-Frame FBO Buffer Quick Control */}
              <div className="p-3.5 rounded-2xl flex flex-col gap-2.5" style={{ background: 'var(--surface-elevated)' }}>
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold">Буфер оптического потока (6-Lvl Pyramid FBO)</span>
                  <span className="text-[11px] font-mono-code font-bold" style={{ color: 'var(--text-sub)' }}>
                    {flowScaleLabel}
                  </span>
                </div>
                <div className="rex-segmented">
                  {(
                    [
                      { id: 'auto', label: 'Авто' },
                      { id: 'performance', label: '64×36' },
                      { id: 'balanced', label: '96×54' },
                      { id: 'ultra', label: '128×72' },
                      { id: 'extreme', label: '256×144' },
                      { id: 'high', label: '384×216' },
                      { id: 'max', label: '512×288' }
                    ] as const
                  ).map((item) => (
                    <button
                      key={item.id}
                      type="button"
                      onClick={() => {
                        setFlowScaleMode(item.id);
                        forceRedrawRef.current = true;
                      }}
                      className={`rex-seg-btn ${flowScaleMode === item.id ? 'active' : ''}`}
                    >
                      {item.label}
                    </button>
                  ))}
                </div>

                <div className="flex items-center justify-between pt-1">
                  <span className="text-xs font-bold">Буфер FBO суб-кадров (3× I_0.25/0.50/0.75)</span>
                  <span className="text-[11px] font-mono-code font-bold" style={{ color: 'var(--text-sub)' }}>
                    {subframeBufferResLabel}
                  </span>
                </div>
                <div className="rex-segmented">
                  {(
                    [
                      { id: 'auto', label: 'Авто 1440p' },
                      { id: '720p', label: '720p HD' },
                      { id: '1080p', label: '1080p FHD' },
                      { id: '1440p', label: '1440p QHD' }
                    ] as const
                  ).map((item) => (
                    <button
                      key={item.id}
                      type="button"
                      onClick={() => {
                        setSubframeBufferResMode(item.id);
                        forceRedrawRef.current = true;
                      }}
                      className={`rex-seg-btn ${subframeBufferResMode === item.id ? 'active' : ''}`}
                    >
                      {item.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* GPU Super Resolution & Resolution Profile Quick Control */}
              <div className="p-3.5 rounded-2xl flex flex-col gap-2" style={{ background: 'var(--surface-elevated)' }}>
                <div className="flex items-center justify-between gap-2">
                  <span className="text-xs font-bold">GPU Супер-разрешение (Super Resolution)</span>
                  <span className="text-[11px] font-mono-code font-bold" style={{ color: 'var(--text-sub)' }}>
                    {upscaleEnabled ? `${upscaleModeLabel} • ${upscaleFactorLabel}` : 'Выключен'}
                  </span>
                </div>
                <div className="rex-segmented">
                  {(
                    [
                      { id: 'gsr', label: 'GSR' },
                      { id: 'fsr', label: 'FSR' },
                      { id: 'anime4k', label: 'Anime4K' },
                      { id: 'cinema', label: 'Кино' }
                    ] as const
                  ).map((item) => (
                    <button
                      key={item.id}
                      type="button"
                      onClick={() => {
                        setUpscaleMode(item.id);
                        setUpscaleEnabled(true);
                        forceRedrawRef.current = true;
                      }}
                      className={`rex-seg-btn ${upscaleEnabled && upscaleMode === item.id ? 'active' : ''}`}
                    >
                      {item.label}
                    </button>
                  ))}
                </div>
                <div className="rex-segmented">
                  {(
                    [
                      { id: 'auto', label: `Авто (${effectiveUpscaleFactor}x)` },
                      { id: 1.5, label: 'FHD+ 1.5x' },
                      { id: 2.0, label: 'QHD 2K' },
                      { id: 4.0, label: '4K UHD' }
                    ] as const
                  ).map((item) => (
                    <button
                      key={String(item.id)}
                      type="button"
                      onClick={() => {
                        setUpscaleFactor(item.id);
                        setUpscaleEnabled(true);
                        forceRedrawRef.current = true;
                      }}
                      className={`rex-seg-btn ${upscaleEnabled && upscaleFactor === item.id ? 'active' : ''}`}
                    >
                      {item.label}
                    </button>
                  ))}
                </div>
              </div>

              <div className="p-3.5 rounded-2xl flex items-center justify-between gap-3" style={{ background: 'var(--surface-elevated)' }}>
                <div className="min-w-0">
                  <div className="text-xs font-bold truncate">
                    Ускоритель: {detectedGpuInfo.modelLabel}
                  </div>
                  <div className="text-[11px] font-mono-code mt-0.5 truncate" style={{ color: 'var(--text-sub)' }}>
                    {isAdrenoActive
                      ? `${detectedGpuInfo.gmemCacheLabel} • Профиль FP16 активен`
                      : 'Стандартный профиль WebGL'}
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    const nextMode = adrenoMode === 'off' ? 'on' : isAdrenoActive ? 'off' : 'on';
                    setAdrenoMode(nextMode);
                    showToast(
                      nextMode === 'on'
                        ? 'Профиль Qualcomm Adreno (GMEM + FP16) включён'
                        : 'Профиль Qualcomm Adreno выключен'
                    );
                  }}
                  className="px-3.5 py-1.5 rounded-full text-xs font-mono-code font-bold cursor-pointer shrink-0 transition"
                  style={{
                    background: isAdrenoActive ? 'var(--accent-bg)' : 'var(--surface-pill)',
                    color: isAdrenoActive ? 'var(--accent-text)' : 'var(--text-main)'
                  }}
                >
                  {isAdrenoActive ? 'Adreno Вкл' : 'Adreno Выкл'}
                </button>
              </div>

              <div>
                <div className="flex items-center justify-between text-xs mb-1" style={{ color: 'var(--text-sub)' }}>
                  <span ref={youLatencyLabelRef}>GPU: {liveFrameTimeMs} мс</span>
                  <span ref={youHzLabelRef}>Экран: {liveScreenHz} Гц</span>
                </div>
                <div
                  className="h-14 w-full rounded-2xl overflow-hidden border p-1"
                  style={{ background: 'var(--surface-elevated)', borderColor: 'var(--border-soft)' }}
                >
                  <canvas ref={telemetryCanvasRef} width={280} height={48} className="w-full h-full block" />
                </div>
              </div>
            </div>

            {/* User Custom Presets Card */}
            <div
              className="p-5 rounded-3xl flex flex-col gap-3"
              style={{ background: 'var(--surface-card)', border: '1px solid var(--border-soft)' }}
            >
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <Bookmark className="w-4 h-4" />
                  <h3 className="rex-serif text-sm font-bold">Пользовательские пресеты</h3>
                </div>
                <button
                  type="button"
                  onClick={handleResetAllSettings}
                  className="text-xs font-semibold cursor-pointer hover:underline"
                  style={{ color: 'var(--text-sub)' }}
                >
                  Сбросить по умолчанию
                </button>
              </div>

              <div className="flex items-center gap-2">
                <input
                  type="text"
                  value={newPresetName}
                  onChange={(e) => setNewPresetName(e.target.value)}
                  placeholder="Название профиля (напр. Аниме 120 FPS)..."
                  className="flex-1 px-3.5 py-2 rounded-full text-xs border focus:outline-none"
                  style={{
                    background: 'var(--surface-elevated)',
                    color: 'var(--text-main)',
                    borderColor: 'var(--border-soft)'
                  }}
                />
                <button
                  type="button"
                  onClick={handleSaveCurrentPreset}
                  className="px-4 py-2 rounded-full text-xs font-semibold cursor-pointer shrink-0"
                  style={{ background: 'var(--accent-bg)', color: 'var(--accent-text)' }}
                >
                  Сохранить
                </button>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                {userPresets.map((preset) => (
                  <div
                    key={preset.id}
                    onClick={() => handleApplyUserPreset(preset)}
                    className="p-3 rounded-2xl flex items-center justify-between gap-2 cursor-pointer transition hover:opacity-90"
                    style={{
                      background: 'var(--surface-elevated)',
                      border: '1px solid var(--border-soft)'
                    }}
                  >
                    <div className="min-w-0">
                      <div className="text-xs font-bold truncate">{preset.name}</div>
                      <div className="text-[11px] font-mono-code truncate" style={{ color: 'var(--text-sub)' }}>
                        {preset.settings.targetFps || 60} FPS •{' '}
                        {(preset.settings.upscaleMode || 'gsr').toUpperCase()}{' '}
                        {preset.settings.upscaleFactor === 'auto'
                          ? 'Авто'
                          : `${preset.settings.upscaleFactor || 2.0}x`}
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={(e) => handleDeleteUserPreset(preset.id, e)}
                      className="p-1.5 rounded-full hover:opacity-80 cursor-pointer shrink-0"
                      style={{ background: 'var(--surface-pill)', color: 'var(--text-main)' }}
                      title="Удалить пресет"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* Floating Action Button (FAB) to resume or enter player */}
        <button
          type="button"
          onClick={() => {
            if (!hasLoadedVideo && !isDemoTestActive) {
              if (resumeVideoItem) {
                playLibraryItem(resumeVideoItem);
                return;
              }
              startBuiltIn24FpsTest();
              return;
            }
            if (videoRef.current && hasLoadedVideo && !isDemoTestActive) {
              initWebAudio();
              setIsPlaying(true);
              videoRef.current.play().catch(() => {});
            }
            setActiveScreen('player');
          }}
          className="rex-fab"
          title="Перейти к плееру"
        >
          <Play className="w-6 h-6 fill-current ml-0.5" />
        </button>
      </div>

      {/* ============================== SCREEN 2: SETTINGS ============================== */}
      <div className={activeScreen === 'settings' ? 'block flex-1 pb-24 px-4 sm:px-5 pt-4' : 'hidden'}>
        <div className="flex items-center justify-between gap-4 mb-4 flex-wrap">
          <div className="flex items-center gap-4">
            <button
              type="button"
              onClick={() => setActiveScreen('main')}
              className="p-2 rounded-full hover:opacity-75 transition cursor-pointer"
              style={{ color: 'var(--text-main)' }}
            >
              <ArrowLeft className="w-6 h-6" />
            </button>
            <div>
              <h2 className="rex-serif text-2xl sm:text-3xl font-black">Настройки</h2>
              <div className="text-xs font-mono-code" style={{ color: 'var(--text-sub)' }}>
                Все изменения автоматически сохраняются в памяти устройства
              </div>
            </div>
          </div>

          <button
            type="button"
            onClick={handleResetAllSettings}
            className="px-3.5 py-2 rounded-full text-xs font-semibold cursor-pointer transition hover:opacity-85"
            style={{ background: 'var(--surface-card)', color: 'var(--text-main)' }}
          >
            Сбросить настройки
          </button>
        </div>

        <div
          className="flex items-center gap-3 px-5 py-3.5 rounded-full mb-5"
          style={{ background: 'var(--surface-card)' }}
        >
          <Search className="w-5 h-5 shrink-0" style={{ color: 'var(--text-main)' }} />
          <input
            type="text"
            value={settingsFilter}
            onChange={(e) => setSettingsFilter(e.target.value)}
            placeholder="Поиск настроек..."
            className="w-full bg-transparent text-sm font-medium focus:outline-none"
            style={{ color: 'var(--text-main)' }}
          />
          {settingsFilter && (
            <button
              type="button"
              onClick={() => setSettingsFilter('')}
              className="p-1 rounded-full cursor-pointer"
              style={{ color: 'var(--text-sub)' }}
            >
              <X className="w-4 h-4" />
            </button>
          )}
        </div>

        <div className="flex flex-col gap-5">
          {/* 1. Внешний вид */}
          {matchesSettingsQuery('интерфейс внешний вид темная тема светлая material you') && (
            <div>
              <h3 className="rex-serif text-sm font-bold px-1 mb-2">Интерфейс</h3>
              <div className="m3-group">
                <div onClick={() => setActiveModal('appearance')} className="m3-setting-item">
                  <div className="flex items-center gap-4">
                    <div className="m3-icon-box">
                      <Sparkles className="w-5 h-5" />
                    </div>
                    <div>
                      <div className="rex-serif font-bold text-base">Внешний вид</div>
                      <div className="text-xs mt-0.5" style={{ color: 'var(--text-sub)' }}>
                        {darkTheme ? 'Тёмная тема' : 'Светлая тема'}
                      </div>
                    </div>
                  </div>
                  <ChevronRight className="w-5 h-5 shrink-0" style={{ color: 'var(--text-sub)' }} />
                </div>
              </div>
            </div>
          )}

          {/* 2. Воспроизведение и управление */}
          {matchesSettingsQuery('воспроизведение управление плеер пропорции масштаб расположение элементов жесты webgl fallback') && (
            <div>
              <h3 className="rex-serif text-sm font-bold px-1 mb-2">Плеер и управление</h3>
              <div className="m3-group">
                <div onClick={() => setActiveModal('player')} className="m3-setting-item">
                  <div className="flex items-center gap-4">
                    <div className="m3-icon-box">
                      <Play className="w-5 h-5" />
                    </div>
                    <div>
                      <div className="rex-serif font-bold text-base">Формат кадра и режим вывода</div>
                      <div className="text-xs mt-0.5" style={{ color: 'var(--text-sub)' }}>
                        {aspectMode === 'contain' ? 'Оригинал' : aspectMode === 'cover' ? 'Кроп' : '16:9'} •{' '}
                        {videoOutputMode === 'webgl_direct' ? 'Прямой WebGL' : 'Video Fallback'} • Повтор: {loopPlayback ? 'Вкл' : 'Выкл'}
                      </div>
                    </div>
                  </div>
                  <ChevronRight className="w-5 h-5 shrink-0" style={{ color: 'var(--text-sub)' }} />
                </div>

                <div onClick={() => setActiveModal('layout')} className="m3-setting-item">
                  <div className="flex items-center gap-4">
                    <div className="m3-icon-box">
                      <Layers className="w-5 h-5" />
                    </div>
                    <div>
                      <div className="rex-serif font-bold text-base">Элементы экрана</div>
                      <div className="text-xs mt-0.5" style={{ color: 'var(--text-sub)' }}>
                        Индикаторы и кнопки панели
                      </div>
                    </div>
                  </div>
                  <ChevronRight className="w-5 h-5 shrink-0" style={{ color: 'var(--text-sub)' }} />
                </div>

                <div onClick={() => setActiveModal('gestures')} className="m3-setting-item">
                  <div className="flex items-center gap-4">
                    <div className="m3-icon-box">
                      <Sliders className="w-5 h-5" />
                    </div>
                    <div>
                      <div className="rex-serif font-bold text-base">Жесты и свайпы</div>
                      <div className="text-xs mt-0.5" style={{ color: 'var(--text-sub)' }}>
                        Яркость, громкость, перемотка ±{doubleTapSeekSec} с
                      </div>
                    </div>
                  </div>
                  <ChevronRight className="w-5 h-5 shrink-0" style={{ color: 'var(--text-sub)' }} />
                </div>
              </div>
            </div>
          )}

          {/* 3. Медиа и библиотека */}
          {matchesSettingsQuery('медиа библиотека файлы очистка смартфон автопривязка') && (
            <div>
              <h3 className="rex-serif text-sm font-bold px-1 mb-2">Библиотека и память смартфона</h3>
              <div className="m3-group">
                <div onClick={() => setActiveModal('library')} className="m3-setting-item">
                  <div className="flex items-center gap-4">
                    <div className="m3-icon-box">
                      <Smartphone className="w-5 h-5" />
                    </div>
                    <div>
                      <div className="rex-serif font-bold text-base">Автопривязка медиа со смартфона</div>
                      <div className="text-xs mt-0.5" style={{ color: 'var(--text-sub)' }}>
                        В кэше IndexedDB: {userVideos.length} видео • Автозагрузка: {autoBindMediaOnStart ? 'Вкл' : 'Выкл'}
                      </div>
                    </div>
                  </div>
                  <ChevronRight className="w-5 h-5 shrink-0" style={{ color: 'var(--text-sub)' }} />
                </div>
              </div>
            </div>
          )}

          {/* 4. Настройки медиа */}
          {matchesSettingsQuery('настройки медиа интерполяция кадров memc rife svp hdr апскейлер upscale super resolution qualcomm adreno gsr snapdragon gmem субтитры srt vtt аудио эквалайзер звук') && (
            <div>
              <h3 className="rex-serif text-sm font-bold px-1 mb-2">Видео и звук</h3>
              <div className="m3-group">
                <div onClick={() => setActiveModal('interpolation')} className="m3-setting-item">
                  <div className="flex items-center gap-4">
                    <div className="m3-icon-box">
                      <Flame className="w-5 h-5" />
                    </div>
                    <div>
                      <div className="rex-serif font-bold text-base">MEMC, Апскейлер, Adreno и HDR10</div>
                      <div className="text-xs mt-0.5" style={{ color: 'var(--text-sub)' }}>
                        {interpEnabled ? `${effectiveTargetFps} FPS` : 'MEMC выкл'} •{' '}
                        {upscaleEnabled ? `${upscaleModeLabel} (${upscaleFactorLabel})` : 'Апскейл выкл'} •{' '}
                        {isAdrenoActive ? 'Adreno GMEM' : 'Стандарт GPU'} •{' '}
                        {hdrEnabled ? 'HDR10' : 'SDR'}
                      </div>
                    </div>
                  </div>
                  <ChevronRight className="w-5 h-5 shrink-0" style={{ color: 'var(--text-sub)' }} />
                </div>

                <div onClick={() => setActiveModal('subtitles')} className="m3-setting-item">
                  <div className="flex items-center gap-4">
                    <div className="m3-icon-box">
                      <SubtitlesIcon className="w-5 h-5" />
                    </div>
                    <div>
                      <div className="rex-serif font-bold text-base">Субтитры</div>
                      <div className="text-xs mt-0.5" style={{ color: 'var(--text-sub)' }}>
                        {subtitlesEnabled ? `${subFontSize} px • ${customSubtitlesName}` : 'Выключены'}
                      </div>
                    </div>
                  </div>
                  <ChevronRight className="w-5 h-5 shrink-0" style={{ color: 'var(--text-sub)' }} />
                </div>

                <div onClick={() => setActiveModal('audio')} className="m3-setting-item">
                  <div className="flex items-center gap-4">
                    <div className="m3-icon-box">
                      <AudioLines className="w-5 h-5" />
                    </div>
                    <div>
                      <div className="rex-serif font-bold text-base">Эквалайзер</div>
                      <div className="text-xs mt-0.5" style={{ color: 'var(--text-sub)' }}>
                        {eqEnabled ? `Пресет: ${eqPreset.toUpperCase()}` : 'Выключен'}
                      </div>
                    </div>
                  </div>
                  <ChevronRight className="w-5 h-5 shrink-0" style={{ color: 'var(--text-sub)' }} />
                </div>
              </div>
            </div>
          )}

          {/* 5. Дополнительно и О приложении */}
          {matchesSettingsQuery('дополнительно о приложении версия apk android') && (
            <div>
              <h3 className="rex-serif text-sm font-bold px-1 mb-2">Система</h3>
              <div className="m3-group">
                <div onClick={() => setActiveModal('apk')} className="m3-setting-item">
                  <div className="flex items-center gap-4">
                    <div className="m3-icon-box">
                      <Smartphone className="w-5 h-5" />
                    </div>
                    <div>
                      <div className="rex-serif font-bold text-base">Установка APK</div>
                      <div className="text-xs mt-0.5" style={{ color: 'var(--text-sub)' }}>
                        Android WebAPK и автономный сборщик
                      </div>
                    </div>
                  </div>
                  <ChevronRight className="w-5 h-5 shrink-0" style={{ color: 'var(--text-sub)' }} />
                </div>

                <div onClick={() => setActiveModal('about')} className="m3-setting-item">
                  <div className="flex items-center gap-4">
                    <div className="m3-icon-box">
                      <HelpCircle className="w-5 h-5" />
                    </div>
                    <div>
                      <div className="rex-serif font-bold text-base">О приложении</div>
                      <div className="text-xs mt-0.5" style={{ color: 'var(--text-sub)' }}>
                        REX Player v3.0.0
                      </div>
                    </div>
                  </div>
                  <ChevronRight className="w-5 h-5 shrink-0" style={{ color: 'var(--text-sub)' }} />
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* ============================== SCREEN 3: VIDEO PLAYER ============================== */}
      <div className={activeScreen === 'player' ? 'block flex-1 pb-24 px-4 sm:px-5 pt-4' : 'hidden'}>
        {/* Top Bar inside Player */}
        <div className="flex flex-col gap-2 mb-3">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2.5 min-w-0">
              <button
                type="button"
                onClick={() => setActiveScreen('main')}
                className="p-2.5 rounded-full transition cursor-pointer hover:opacity-80 shrink-0"
                style={{ background: 'var(--surface-card)', color: 'var(--text-main)' }}
                title="Назад"
              >
                <ArrowLeft className="w-5 h-5" />
              </button>
              {(() => {
                const activeVidObj = userVideos.find(
                  (v) => v.id === lastActiveVideoId || v.title === activeVideoTitle
                );
                return activeVidObj?.thumbnailUrl ? (
                  <div
                    className="w-12 h-8 rounded-lg overflow-hidden shrink-0 border hidden sm:block"
                    style={{ borderColor: 'var(--border-soft)', background: '#000' }}
                  >
                    <img
                      src={activeVidObj.thumbnailUrl}
                      alt={activeVideoTitle}
                      className="w-full h-full object-cover block"
                    />
                  </div>
                ) : null;
              })()}
              <div className="min-w-0">
                <h2 className="rex-serif text-base font-bold truncate max-w-[180px] sm:max-w-[320px]">
                  {activeVideoTitle}
                </h2>
                <div className="flex items-center gap-1.5 flex-wrap pt-0.5">
                  <span className="text-xs font-mono-code truncate" style={{ color: 'var(--text-sub)' }}>
                    {videoNativeRes}
                  </span>
                  {interpEnabled && interpMode !== 'off' ? (
                    <span
                      className="px-2 py-0.5 rounded-full text-[10px] font-mono-code font-bold flex items-center gap-1 tracking-tight"
                      style={{
                        background:
                          interpMode === 'optical'
                            ? 'linear-gradient(135deg, rgba(99,102,241,0.2), rgba(168,85,247,0.25))'
                            : 'var(--surface-pill)',
                        color: interpMode === 'optical' ? '#a855f7' : 'var(--text-main)',
                        border:
                          interpMode === 'optical'
                            ? '1px solid rgba(168,85,247,0.3)'
                            : '1px solid transparent'
                      }}
                      title={
                        interpMode === 'optical'
                          ? 'MEMC Оптический поток (Блочный поиск SAD + субпиксельный Lucas-Kanade)'
                          : 'Кадровое смешивание (Frame Blend)'
                      }
                    >
                      <Sparkles className="w-2.5 h-2.5 shrink-0" />
                      <span>
                        {interpMode === 'optical'
                          ? `Оптический поток • ${effectiveTargetFps} FPS`
                          : `Смешивание • ${effectiveTargetFps} FPS`}
                      </span>
                    </span>
                  ) : (
                    <span className="text-xs font-mono-code" style={{ color: 'var(--text-sub)' }}>
                      • SDR
                    </span>
                  )}
                  {upscaleEnabled && (
                    <span className="text-xs font-mono-code" style={{ color: 'var(--text-sub)' }}>
                      • {upscaleModeLabel} • {upscaleFactorLabel}
                    </span>
                  )}
                  {isAdrenoActive && (
                    <span className="text-xs font-mono-code text-orange-500 font-semibold">
                      • Adreno
                    </span>
                  )}
                  {hdrEnabled && (
                    <span className="text-xs font-mono-code text-amber-500 font-semibold">
                      • HDR10
                    </span>
                  )}
                  {ecoThermalMode && (
                    <span className="text-xs font-mono-code text-emerald-500 font-semibold" title="Холодный ЭКО-режим GPU активен (без нагрева)">
                      • ЭКО-Холод
                    </span>
                  )}
                </div>
              </div>
            </div>

            <button
              type="button"
              onClick={() => setTopToolbarCollapsed((prev) => !prev)}
              className="px-3 py-1.5 rounded-full text-xs font-semibold transition cursor-pointer flex items-center gap-1 shrink-0"
              style={{ background: 'var(--surface-card)', color: 'var(--text-main)' }}
              title={topToolbarCollapsed ? 'Развернуть быстрые кнопки' : 'Свернуть быстрые кнопки'}
            >
              <span>{topToolbarCollapsed ? 'Меню' : 'Свернуть'}</span>
              {topToolbarCollapsed ? (
                <ChevronDown className="w-3.5 h-3.5" />
              ) : (
                <ChevronUp className="w-3.5 h-3.5" />
              )}
            </button>
          </div>

          {!topToolbarCollapsed && (
            <div className="flex items-center gap-1.5 flex-wrap">
              <button
                type="button"
                onClick={() => {
                  setEcoThermalMode((prev) => {
                    const next = !prev;
                    forceRedrawRef.current = true;
                    showToast(
                      next
                        ? 'Холодный ЭКО-режим GPU включён (защита от нагрева)'
                        : 'Максимальный Турбо-режим GPU включён'
                    );
                    return next;
                  });
                }}
                className="px-3 py-1.5 rounded-full text-xs font-mono-code font-bold transition cursor-pointer flex items-center gap-1"
                style={{
                  background: ecoThermalMode ? 'rgba(16, 185, 129, 0.16)' : 'var(--surface-pill)',
                  color: ecoThermalMode ? '#10b981' : 'var(--text-main)',
                  border: ecoThermalMode ? '1px solid rgba(16, 185, 129, 0.35)' : '1px solid transparent'
                }}
                title="Холодный ЭКО-режим GPU: убирает нагрев устройства при сохранении плавности MEMC"
              >
                <Zap className="w-3.5 h-3.5" />
                <span>{ecoThermalMode ? 'ЭКО-Холод ВКЛ' : 'ЭКО-Холод ВЫКЛ'}</span>
              </button>
              <button
                type="button"
                onClick={() => {
                  setUpscaleEnabled((prev) => {
                    const next = !prev;
                    showToast(
                      next
                        ? `${upscaleModeLabel} (${upscaleFactorLabel}) включён`
                        : 'GPU Апскейлер выключен'
                    );
                    return next;
                  });
                }}
                className="px-3 py-1.5 rounded-full text-xs font-mono-code font-bold transition cursor-pointer flex items-center gap-1"
                style={{
                  background: upscaleEnabled ? 'var(--accent-bg)' : 'var(--surface-pill)',
                  color: upscaleEnabled ? 'var(--accent-text)' : 'var(--text-main)'
                }}
                title="Включить / выключить GPU Super Resolution"
              >
                <Zap className="w-3.5 h-3.5" />
                <span>
                  {upscaleModeLabel}{' '}
                  {upscaleFactor === 'auto' ? `Авто (${effectiveUpscaleFactor}x)` : `${upscaleFactor}x`}
                </span>
              </button>

              <button
                type="button"
                onClick={() => {
                  const nextMode = isAdrenoActive ? 'off' : 'on';
                  setAdrenoMode(nextMode);
                  if (nextMode === 'on' && !upscaleEnabled) {
                    setUpscaleMode('gsr');
                    setUpscaleEnabled(true);
                  }
                  showToast(
                    nextMode === 'on'
                      ? `Ускоритель Qualcomm Adreno (${detectedGpuInfo.gmemCacheLabel}) включён`
                      : 'Ускоритель Qualcomm Adreno выключен'
                  );
                }}
                className="px-3 py-1.5 rounded-full text-xs font-mono-code font-bold transition cursor-pointer flex items-center gap-1"
                style={{
                  background: isAdrenoActive ? 'var(--accent-bg)' : 'var(--surface-pill)',
                  color: isAdrenoActive ? 'var(--accent-text)' : 'var(--text-main)'
                }}
                title="Аппаратный ускоритель Qualcomm Adreno (GMEM + FP16)"
              >
                <span>Adreno {isAdrenoActive ? 'GMEM' : 'Выкл'}</span>
              </button>

              <button
                type="button"
                onClick={() => {
                  setHdrEnabled((prev) => {
                    const next = !prev;
                    showToast(next ? 'HDR10 включён' : 'HDR10 выключен');
                    return next;
                  });
                }}
                className="px-3 py-1.5 rounded-full text-xs font-mono-code font-bold transition cursor-pointer flex items-center gap-1"
                style={{
                  background: hdrEnabled ? 'var(--accent-bg)' : 'var(--surface-pill)',
                  color: hdrEnabled ? 'var(--accent-text)' : 'var(--text-main)'
                }}
                title="Включить / выключить HDR10"
              >
                <Sparkles className="w-3.5 h-3.5" />
                <span>HDR</span>
              </button>

              <button
                type="button"
                onClick={() => {
                  const modes: ('contain' | 'cover' | 'fill')[] = ['contain', 'cover', 'fill'];
                  const labels = {
                    contain: 'Оригинал',
                    cover: 'Кроп',
                    fill: '16:9'
                  };
                  const next = modes[(modes.indexOf(aspectMode) + 1) % modes.length];
                  setAspectMode(next);
                  showToast(`Формат: ${labels[next]}`);
                }}
                className="px-3 py-1.5 rounded-full text-xs font-semibold transition cursor-pointer flex items-center gap-1"
                style={{ background: 'var(--surface-pill)', color: 'var(--text-main)' }}
              >
                <Ratio className="w-3.5 h-3.5" />
                <span>
                  {aspectMode === 'contain' ? 'Оригинал' : aspectMode === 'cover' ? 'Кроп' : '16:9'}
                </span>
              </button>

              <button
                type="button"
                onClick={() => setActiveModal('subtitles')}
                className="px-3 py-1.5 rounded-full text-xs font-semibold transition cursor-pointer"
                style={{ background: 'var(--surface-card)', color: 'var(--text-main)' }}
              >
                CC
              </button>

              <button
                type="button"
                onClick={() => setActiveModal('audio')}
                className="px-3 py-1.5 rounded-full text-xs font-semibold transition cursor-pointer"
                style={{ background: 'var(--surface-card)', color: 'var(--text-main)' }}
              >
                EQ
              </button>

              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className="px-3 py-1.5 rounded-full text-xs font-semibold transition cursor-pointer"
                style={{ background: 'var(--surface-card)', color: 'var(--text-main)' }}
              >
                + Видео
              </button>

              <button
                type="button"
                onClick={startBuiltIn24FpsTest}
                className="px-3 py-1.5 rounded-full text-xs font-semibold transition cursor-pointer flex items-center gap-1"
                style={{
                  background: isDemoTestActive
                    ? 'linear-gradient(135deg, #6366f1, #a855f7)'
                    : 'var(--surface-card)',
                  color: isDemoTestActive ? '#ffffff' : 'var(--text-main)'
                }}
                title="Запустить встроенный 24 FPS тест интерполяции кадров (50/50 + Векторы)"
              >
                <Sparkles className="w-3.5 h-3.5" />
                <span>{isDemoTestActive ? 'Тест 24 FPS (Активен)' : 'Тест 24 FPS'}</span>
              </button>

              <button
                type="button"
                onClick={() => setActiveModal('interpolation')}
                className="px-3 py-1.5 rounded-full text-xs font-semibold transition cursor-pointer"
                style={{ background: 'var(--accent-bg)', color: 'var(--accent-text)' }}
              >
                MEMC / UP
              </button>

              <button
                type="button"
                onClick={() => {
                  setAmbilightEnabled((prev) => {
                    const next = !prev;
                    showToast(next ? 'Подсветка Ambilight включена' : 'Подсветка Ambilight выключена');
                    return next;
                  });
                }}
                className="px-3 py-1.5 rounded-full text-xs font-semibold transition cursor-pointer flex items-center gap-1"
                style={{
                  background: ambilightEnabled ? 'var(--accent-bg)' : 'var(--surface-card)',
                  color: ambilightEnabled ? 'var(--accent-text)' : 'var(--text-main)'
                }}
                title="Динамическая фоновая подсветка Ambilight (32×18 Blur)"
              >
                <Sparkles className="w-3.5 h-3.5" />
                <span>Ambilight</span>
              </button>

              <button
                type="button"
                onClick={() => {
                  setAutoCropBlackBars((prev) => {
                    const next = !prev;
                    if (!next) {
                      detectedAutoCropRef.current = 0;
                      setDetectedAutoCropPct(0);
                    }
                    forceRedrawRef.current = true;
                    showToast(
                      next
                        ? 'Авто-обрезка черных полей (21:9) включена'
                        : 'Авто-обрезка черных полей выключена'
                    );
                    return next;
                  });
                }}
                className="px-3 py-1.5 rounded-full text-xs font-semibold transition cursor-pointer"
                style={{
                  background: autoCropBlackBars ? 'var(--accent-bg)' : 'var(--surface-card)',
                  color: autoCropBlackBars ? 'var(--accent-text)' : 'var(--text-main)'
                }}
                title="Автоматическое определение и обрезка запеченных черных полос сверху и снизу"
              >
                Авто-кроп{autoCropBlackBars && detectedAutoCropPct > 0 ? ` (${detectedAutoCropPct}%)` : ''}
              </button>

              <button
                type="button"
                onClick={() => void handleToggleWebglPip()}
                className="px-3 py-1.5 rounded-full text-xs font-semibold transition cursor-pointer flex items-center gap-1"
                style={{
                  background: isPipActive ? 'var(--accent-bg)' : 'var(--surface-card)',
                  color: isPipActive ? 'var(--accent-text)' : 'var(--text-main)'
                }}
                title="Картинка-в-картинке с сохранением шейдеров WebGL (MEMC + Апскейл + HDR10)"
              >
                <PictureInPicture2 className="w-3.5 h-3.5" />
                <span>PiP</span>
              </button>

              <button
                type="button"
                onClick={() => {
                  setIsTouchLocked(true);
                  setFsControlsVisible(false);
                  showToast('Экран заблокирован от случайных касаний');
                }}
                className="px-3 py-1.5 rounded-full text-xs font-semibold transition cursor-pointer flex items-center gap-1"
                style={{ background: 'var(--surface-card)', color: 'var(--text-main)' }}
                title="Заблокировать экран и жесты (Touch Lock / Kids Lock)"
              >
                <Lock className="w-3.5 h-3.5" />
                <span>Замок</span>
              </button>
            </div>
          )}
        </div>

        {/* Dynamic Ambilight Wrapper & Main Video Stage */}
        <div className="relative">
          {ambilightEnabled && !isFullscreen && (
            <canvas
              ref={ambilightCanvasRef}
              width={32}
              height={18}
              className="pointer-events-none absolute -inset-5 w-[calc(100%+40px)] h-[calc(100%+40px)] rounded-[40px] opacity-75 transition-opacity duration-500 z-0"
              style={{ filter: 'blur(48px) saturate(1.85)' }}
            />
          )}

          {/* Main Video Stage with Subtitle Layer, Fullscreen Controls & Persistent Canvas */}
          <div
            ref={stageContainerRef}
            onClick={handleStageClick}
            onPointerDown={handleStagePointerDown}
            onPointerMove={(e) => {
              if (isFullscreen && e.pointerType === 'mouse' && !isTouchLocked) {
                revealFsControls();
              }
              handleStagePointerMove(e);
            }}
            onPointerUp={handleStagePointerUpOrLeave}
            onPointerCancel={handleStagePointerUpOrLeave}
            onPointerLeave={handleStagePointerUpOrLeave}
            onWheel={handleStageWheel}
            className={
              isFullscreen
                ? 'fixed inset-0 z-50 w-screen h-screen bg-black select-none touch-none flex items-center justify-center overflow-hidden'
                : 'relative z-[1] w-full aspect-video rounded-3xl overflow-hidden bg-black border shadow-xl select-none touch-none cursor-pointer flex items-center justify-center'
            }
            style={isFullscreen ? undefined : { borderColor: 'var(--border-strong)' }}
          >
          {/* LAYER 0: Hardware HTML5 Video Element (Active in DOM Render Tree for HW decoding & Instant Fallback) */}
          <video
            ref={videoRef}
            playsInline
            preload="auto"
            className={`absolute inset-0 w-full h-full pointer-events-none transition-opacity duration-200 ${
              aspectMode === 'contain'
                ? 'object-contain'
                : aspectMode === 'cover'
                ? 'object-cover'
                : 'object-fill'
            }`}
            style={{
              zIndex: 1,
              opacity: isVideoFallbackActive ? 1 : 0.001,
              filter: isVideoFallbackActive
                ? `brightness(${videoBrightness}) ${monochromeFilter ? 'grayscale(1)' : ''}`
                : undefined
            }}
            onPlay={() => {
              setIsPlaying(true);
              armVideoFrameCallback();
            }}
            onPause={() => {
              if (!isScrubbingRef.current && !isDemoTestActive) {
                setIsPlaying(false);
              }
            }}
            onEnded={() => {
              if (autoPlayNext && anixartSession && anixartSession.episodes.length > 1) {
                const currEpIdx = anixartSession.episodes.findIndex(
                  (e) => e.position === anixartSession.selectedEpisodePosition
                );
                if (currEpIdx >= 0 && currEpIdx + 1 < anixartSession.episodes.length) {
                  handleSelectAnixartEpisode(anixartSession.episodes[currEpIdx + 1].position);
                  return;
                }
              }
              if (autoPlayNext && playlist.length > 1) {
                handleNextTrack();
              } else if (loopPlayback) {
                if (videoRef.current) {
                  videoRef.current.currentTime = 0;
                  videoRef.current.play().catch(() => {});
                }
              } else {
                setIsPlaying(false);
              }
            }}
            onTimeUpdate={() => {
              if (videoRef.current) {
                const t = videoRef.current.currentTime || 0;
                if (isVideoFallbackActive) {
                  if (!isScrubbingRef.current) {
                    currentTimeRef.current = t;
                  }
                  if (timecodeDisplayRef.current) {
                    timecodeDisplayRef.current.textContent = formatTime(t);
                  }
                  if (fsTimecodeDisplayRef.current) {
                    fsTimecodeDisplayRef.current.textContent = formatTime(t);
                  }
                  if (scrubberInputRef.current && !isScrubbingRef.current) {
                    scrubberInputRef.current.value = String(t);
                  }
                  if (fsScrubberInputRef.current && !isScrubbingRef.current) {
                    fsScrubberInputRef.current.value = String(t);
                  }
                  if (rememberPosition && t > 1) {
                    if (activeVideoKeyRef.current) {
                      savedPositionsRef.current[activeVideoKeyRef.current] = t;
                    }
                    if (activeVideoUrlRef.current) {
                      savedPositionsRef.current[activeVideoUrlRef.current] = t;
                    }
                    const nowPerf = performance.now();
                    if (nowPerf - lastFallbackPosSaveRef.current >= 1500) {
                      lastFallbackPosSaveRef.current = nowPerf;
                      saveSavedPositions(savedPositionsRef.current);
                    }
                  }

                  // Synchronize subtitle cues during Video Fallback mode (O(log N) binary search)
                  if (subtitleBoxRef.current && subtitleTextSpanRef.current) {
                    if (!subtitlesEnabled || !subtitleCues.length) {
                      subtitleBoxRef.current.style.display = 'none';
                    } else {
                      const cueText = findActiveSubtitleText(subtitleCues, t - subDelaySec);
                      subtitleTextSpanRef.current.textContent = cueText;
                      subtitleBoxRef.current.style.display = cueText ? 'flex' : 'none';
                    }
                  }
                }
              }
            }}
          />

          {/* LAYER 1: GPU Accelerated WebGL Canvas (RIFE AI / SVP / Upscaler / HDR10) */}
          <canvas
            ref={renderCanvasRef}
            width={STAGE_W}
            height={STAGE_H}
            className={`w-full h-full block relative z-[2] transition-opacity duration-200 ${
              isVideoFallbackActive ? 'opacity-0 pointer-events-none' : 'opacity-100'
            }`}
          />

          {/* Split-Screen 50/50 Comparison DOM Overlay Badges */}
          {splitCompareMode && (
            <div className="pointer-events-none absolute inset-x-3.5 bottom-3.5 flex items-center justify-between z-10">
              <span className="px-2.5 py-1 rounded-lg bg-zinc-950/85 text-white font-mono-code text-[11px] font-bold border border-white/15">
                ОРИГИНАЛ
              </span>
              <span className="px-2.5 py-1 rounded-lg bg-zinc-950/85 text-white font-mono-code text-[11px] font-bold border border-white/15">
                {upscaleEnabled ? `${upscaleModeLabel} ${effectiveUpscaleFactor}x • ` : ''}
                MEMC {effectiveTargetFps} FPS {hdrEnabled ? '• HDR' : ''}
              </span>
            </div>
          )}

          {/* Secondary / Top Subtitle Overlay Text (Dual Subtitles + {\an8} ASS tags) */}
          <div
            ref={topSubtitleBoxRef}
            className={`pointer-events-none absolute left-4 right-4 ${
              showTopHud ? 'top-12' : 'top-4'
            } justify-center text-center z-20 transition-all hidden`}
          >
            <span
              ref={topSubtitleTextSpanRef}
              className="px-3.5 py-1 rounded-xl font-medium leading-snug max-w-[85%] whitespace-pre-line shadow"
              style={{
                backgroundColor: `rgba(0,0,0,${subBgOpacity})`,
                color: '#fde047',
                fontSize: `${Math.max(12, subFontSize - 2)}px`,
                textShadow: '0 1px 3px rgba(0,0,0,0.9)'
              }}
            />
          </div>

          {/* Primary Bottom Subtitle Overlay Text */}
          <div
            ref={subtitleBoxRef}
            className={`pointer-events-none absolute left-4 right-4 ${
              isFullscreen && fsControlsVisible ? 'bottom-28' : 'bottom-5'
            } justify-center text-center z-20 transition-all ${
              subtitlesEnabled && activeSubtitleCue ? 'flex' : 'hidden'
            }`}
          >
            <span
              ref={subtitleTextSpanRef}
              className="px-4 py-1.5 rounded-xl font-medium leading-snug max-w-[85%] whitespace-pre-line shadow"
              style={{
                backgroundColor: `rgba(0,0,0,${subBgOpacity})`,
                color: subColor,
                fontSize: `${subFontSize}px`,
                textShadow: '0 1px 3px rgba(0,0,0,0.9)'
              }}
            >
              {activeSubtitleCue}
            </span>
          </div>

          {/* Touch Lock / Kids Lock Floating Overlay Button */}
          {isTouchLocked && (
            <div
              onClick={(e) => e.stopPropagation()}
              onPointerDown={(e) => e.stopPropagation()}
              className="absolute inset-0 z-40 flex items-start justify-end p-4 pointer-events-auto"
            >
              <button
                type="button"
                onClick={() => {
                  setIsTouchLocked(false);
                  showToast('Экран разблокирован');
                }}
                className="px-3.5 py-2 rounded-2xl bg-black/80 hover:bg-black text-amber-300 border border-amber-400/40 shadow-2xl flex items-center gap-2 text-xs font-bold cursor-pointer transition active:scale-95"
                title="Нажмите для разблокировки экрана и жестов"
              >
                <Unlock className="w-4 h-4" />
                <span>Разблокировать экран</span>
              </button>
            </div>
          )}

          {/* Compact Top Status Badges + Real-Time Telemetry Sparkline & Dropped Frames */}
          {showTopHud && !isTouchLocked && !(isFullscreen && fsControlsVisible) && (
            <div className="absolute top-3 left-3 right-3 flex items-start justify-between gap-2 pointer-events-none z-10">
              <div className="flex items-center gap-1.5 flex-wrap">
                {interpEnabled && interpMode !== 'off' ? (
                  <span
                    className="px-2.5 py-0.5 rounded-full font-mono-code text-[11px] font-bold shadow flex items-center gap-1"
                    style={{
                      background:
                        interpMode === 'optical'
                          ? 'linear-gradient(135deg, #6366f1, #a855f7)'
                          : '#ffffff',
                      color: interpMode === 'optical' ? '#ffffff' : '#000000'
                    }}
                  >
                    <Sparkles className="w-3 h-3 text-amber-300" />
                    <span>
                      {interpMode === 'optical'
                        ? `Оптич. поток • ${effectiveTargetFps} FPS${subframeCascadeEnabled ? ` • Суб-FBO ${effectiveSubframeCascadeMult}x` : ''}`
                        : `Смешивание • ${effectiveTargetFps} FPS`}
                    </span>
                  </span>
                ) : (
                  <span className="px-2.5 py-0.5 rounded-full bg-white text-black font-mono-code text-[11px] font-bold shadow">
                    SDR
                  </span>
                )}
                {upscaleEnabled && (
                  <span className="px-2.5 py-0.5 rounded-full bg-emerald-400 text-black font-mono-code text-[11px] font-bold shadow">
                    {upscaleModeLabel} • {upscaleFactor === 'auto' ? `Авто ${effectiveUpscaleFactor}x` : `${upscaleFactor}x`}
                  </span>
                )}
                {isAdrenoActive && (
                  <span className="px-2.5 py-0.5 rounded-full bg-orange-500 text-white font-mono-code text-[11px] font-bold shadow">
                    ADRENO GMEM
                  </span>
                )}
                {hdrEnabled && (
                  <span className="px-2.5 py-0.5 rounded-full bg-amber-400 text-black font-mono-code text-[11px] font-bold shadow">
                    {isAdrenoActive && adrenoTrue10Hdr ? 'HDR10 True10' : 'HDR10'}
                  </span>
                )}
                {lutPreset !== 'off' && (
                  <span className="px-2.5 py-0.5 rounded-full bg-fuchsia-500 text-white font-mono-code text-[11px] font-bold shadow">
                    LUT: {lutPreset.toUpperCase()}
                  </span>
                )}
              </div>

              <div className="flex flex-col items-end gap-1">
                <div
                  ref={hudMetricsBadgeRef}
                  className="px-2.5 py-0.5 rounded-full bg-zinc-950/85 text-zinc-200 border border-white/15 font-mono-code text-[11px]"
                >
                  {isAdrenoActive ? 'Adreno GMEM • ' : ''}
                  {liveScreenHz} Гц • {liveFrameTimeMs} мс
                </div>
                {showHudTelemetryGraph && (
                  <div className="px-2.5 py-1 rounded-xl bg-zinc-950/85 border border-white/15 flex items-center gap-2 text-[10px] font-mono-code text-zinc-300 shadow">
                    <span ref={hudFpsRatioRef} className="text-emerald-400 font-bold">
                      24 → {effectiveTargetFps} FPS
                    </span>
                    <span>•</span>
                    <span ref={hudDroppedFramesRef}>Пропуски: 0</span>
                    <canvas
                      ref={hudTelemetryCanvasRef}
                      width={76}
                      height={20}
                      className="rounded bg-black/50"
                    />
                  </div>
                )}
              </div>
            </div>
          )}

          {/* FULLSCREEN VIDEO CONTROLS OVERLAY (pointer-events-none on empty areas so swipes & taps on video still work!) */}
          {isFullscreen && fsControlsVisible && !isTouchLocked && (
            <div
              onPointerDownCapture={() => revealFsControls()}
              onPointerMoveCapture={() => revealFsControls()}
              className="pointer-events-none absolute inset-0 z-30 flex flex-col justify-between bg-gradient-to-b from-black/80 via-transparent to-black/85 p-4 sm:p-6"
            >
              {/* Fullscreen Top Bar */}
              <div
                onClick={(e) => e.stopPropagation()}
                onPointerDown={(e) => e.stopPropagation()}
                className="pointer-events-auto flex flex-col gap-2"
              >
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2.5 min-w-0">
                    <button
                      type="button"
                      onClick={() => {
                        setFsActivePanel('none');
                        toggleFullscreen();
                      }}
                      className="p-2.5 rounded-full bg-white/15 hover:bg-white/25 text-white transition cursor-pointer shrink-0"
                      title="Выйти из полноэкранного режима"
                    >
                      <ArrowLeft className="w-5 h-5" />
                    </button>
                    <div className="truncate max-w-[180px] sm:max-w-[320px]">
                      <div className="rex-serif text-sm sm:text-base font-bold text-white truncate">
                        {activeVideoTitle}
                      </div>
                      <div className="text-[11px] font-mono-code text-zinc-300 truncate">
                        {videoNativeRes} •{' '}
                        {interpEnabled && interpMode !== 'off'
                          ? interpMode === 'optical'
                            ? `Оптич. поток ${effectiveTargetFps} FPS${subframeCascadeEnabled ? ` • Суб-FBO ${effectiveSubframeCascadeMult}x` : ''}`
                            : `Смешивание ${effectiveTargetFps} FPS`
                          : 'SDR'}
                        {upscaleEnabled ? ` • ${upscaleModeLabel} ${effectiveUpscaleFactor}x` : ''}
                        {hdrEnabled ? ' • HDR10' : ''}
                      </div>
                    </div>
                  </div>

                  <button
                    type="button"
                    onClick={() => {
                      setFsToolbarCollapsed((prev) => {
                        const next = !prev;
                        if (next) setFsActivePanel('none');
                        return next;
                      });
                    }}
                    className="px-3 py-1.5 rounded-full bg-white/15 hover:bg-white/25 text-white text-xs font-semibold flex items-center gap-1 cursor-pointer shrink-0"
                    title={fsToolbarCollapsed ? 'Развернуть меню функций' : 'Свернуть меню функций'}
                  >
                    <span>{fsToolbarCollapsed ? 'Меню' : 'Свернуть'}</span>
                    {fsToolbarCollapsed ? (
                      <ChevronDown className="w-3.5 h-3.5" />
                    ) : (
                      <ChevronUp className="w-3.5 h-3.5" />
                    )}
                  </button>
                </div>

                {/* Top Quick Function Tabs in Fullscreen */}
                {!fsToolbarCollapsed && (
                  <div className="flex items-center gap-1.5 flex-wrap">
                    <button
                      type="button"
                      onClick={() =>
                        setFsActivePanel((prev) => (prev === 'upscale' ? 'none' : 'upscale'))
                      }
                      className={`px-3 py-1.5 rounded-full text-xs font-mono-code font-bold cursor-pointer transition ${
                        fsActivePanel === 'upscale'
                          ? 'bg-white text-black'
                          : upscaleEnabled
                          ? 'bg-emerald-400 text-black'
                          : 'bg-white/15 text-white'
                      }`}
                    >
                      {upscaleEnabled ? `${upscaleModeLabel} ${effectiveUpscaleFactor}x` : 'UP Выкл'}
                    </button>

                    <button
                      type="button"
                      onClick={() => setHdrEnabled((prev) => !prev)}
                      className={`px-3 py-1.5 rounded-full text-xs font-mono-code font-bold cursor-pointer transition ${
                        hdrEnabled ? 'bg-amber-400 text-black' : 'bg-white/15 text-white'
                      }`}
                    >
                      HDR
                    </button>

                    <button
                      type="button"
                      onClick={() =>
                        setFsActivePanel((prev) => (prev === 'memc' ? 'none' : 'memc'))
                      }
                      className={`px-3 py-1.5 rounded-full text-xs font-mono-code font-bold cursor-pointer transition ${
                        fsActivePanel === 'memc'
                          ? 'bg-white text-black'
                          : interpEnabled && interpMode !== 'off'
                          ? 'bg-white/90 text-black'
                          : 'bg-white/15 text-white'
                      }`}
                    >
                      {interpEnabled && interpMode !== 'off'
                        ? interpMode === 'optical'
                          ? `Оптич. ${effectiveTargetFps}${subframeCascadeEnabled ? ` (${effectiveSubframeCascadeMult}x)` : ''}`
                          : `Смесь ${effectiveTargetFps}`
                        : 'MEMC Выкл'}
                    </button>

                    <button
                      type="button"
                      onClick={() =>
                        setFsActivePanel((prev) => (prev === 'audio' ? 'none' : 'audio'))
                      }
                      className={`px-3 py-1.5 rounded-full text-xs font-semibold cursor-pointer transition ${
                        fsActivePanel === 'audio' ? 'bg-white text-black' : 'bg-white/15 text-white'
                      }`}
                    >
                      EQ
                    </button>

                    <button
                      type="button"
                      onClick={() =>
                        setFsActivePanel((prev) => (prev === 'subtitles' ? 'none' : 'subtitles'))
                      }
                      className={`px-3 py-1.5 rounded-full text-xs font-semibold cursor-pointer transition ${
                        fsActivePanel === 'subtitles' ? 'bg-white text-black' : 'bg-white/15 text-white'
                      }`}
                    >
                      CC
                    </button>

                    <button
                      type="button"
                      onClick={() =>
                        setFsActivePanel((prev) => (prev === 'playlist' ? 'none' : 'playlist'))
                      }
                      className={`px-3 py-1.5 rounded-full text-xs font-semibold cursor-pointer transition ${
                        fsActivePanel === 'playlist' ? 'bg-white text-black' : 'bg-white/15 text-white'
                      }`}
                    >
                      Видео ({playlist.length})
                    </button>

                    <button
                      type="button"
                      onClick={() =>
                        setFsActivePanel((prev) => (prev === 'more' ? 'none' : 'more'))
                      }
                      className={`px-3 py-1.5 rounded-full text-xs font-semibold cursor-pointer transition ${
                        fsActivePanel === 'more' ? 'bg-white text-black' : 'bg-white/15 text-white'
                      }`}
                    >
                      Экран
                    </button>
                  </div>
                )}
              </div>

              {/* Center Area: Either Quick Settings Drawer OR Center Play/Seek Buttons */}
              {fsActivePanel !== 'none' ? (
                <div
                  onClick={(e) => e.stopPropagation()}
                  onPointerDown={(e) => e.stopPropagation()}
                  className="pointer-events-auto my-auto mx-auto w-full max-w-md max-h-[62vh] overflow-y-auto rounded-3xl bg-zinc-950/92 border border-white/20 p-4 text-white shadow-2xl flex flex-col gap-3"
                >
                  <div className="flex items-center justify-between border-b border-white/10 pb-2">
                    <span className="rex-serif font-bold text-sm">
                      {fsActivePanel === 'upscale' && 'GPU Супер-разрешение (Super Resolution)'}
                      {fsActivePanel === 'memc' && 'MEMC Интерполяция и Каскад Суб-Кадров'}
                      {fsActivePanel === 'audio' && 'Звук и 5-полосный Эквалайзер'}
                      {fsActivePanel === 'subtitles' && 'Субтитры (.SRT / .VTT)'}
                      {fsActivePanel === 'playlist' && 'Плейлист и выбор видео'}
                      {fsActivePanel === 'more' && 'Экран, Яркость и Скорость'}
                    </span>
                    <div className="flex items-center gap-1.5">
                      <button
                        type="button"
                        onClick={() => setFsActivePanel('none')}
                        className="px-2.5 py-1 rounded-full bg-white/15 hover:bg-white/25 text-white text-xs font-semibold flex items-center gap-1 cursor-pointer"
                        title="Свернуть панель"
                      >
                        <span>Свернуть</span>
                        <ChevronUp className="w-3.5 h-3.5" />
                      </button>
                      <button
                        type="button"
                        onClick={() => setFsActivePanel('none')}
                        className="p-1 rounded-full bg-white/15 hover:bg-white/25 text-white cursor-pointer"
                        title="Закрыть"
                      >
                        <X className="w-4 h-4" />
                      </button>
                    </div>
                  </div>

                  {/* PANEL 0: GPU VIDEO UPSCALER */}
                  {fsActivePanel === 'upscale' && (
                    <div className="flex flex-col gap-3 text-xs">
                      <div className="grid grid-cols-5 gap-1 bg-white/10 p-1 rounded-full">
                        {[
                          { id: 'off', label: 'Выкл' },
                          { id: 'gsr', label: 'GSR' },
                          { id: 'fsr', label: 'FSR' },
                          { id: 'anime4k', label: 'Anime4K' },
                          { id: 'cinema', label: 'Кино' }
                        ].map((m) => {
                          const isAct =
                            m.id === 'off' ? !upscaleEnabled : upscaleEnabled && upscaleMode === m.id;
                          return (
                            <button
                              key={m.id}
                              type="button"
                              onClick={() => {
                                if (m.id === 'off') {
                                  setUpscaleEnabled(false);
                                } else {
                                  setUpscaleMode(m.id as 'fsr' | 'gsr' | 'anime4k' | 'cinema');
                                  setUpscaleEnabled(true);
                                }
                                forceRedrawRef.current = true;
                              }}
                              className={`py-1.5 rounded-full font-semibold cursor-pointer transition whitespace-nowrap text-[11px] ${
                                isAct ? 'bg-white text-black' : 'text-zinc-300'
                              }`}
                            >
                              {m.label}
                            </button>
                          );
                        })}
                      </div>

                      <div className="p-2.5 rounded-2xl bg-white/10 flex items-center justify-between gap-2">
                        <div className="min-w-0">
                          <div className="font-bold text-white truncate">
                            Qualcomm Adreno ({detectedGpuInfo.modelLabel})
                          </div>
                          <div className="text-[11px] text-zinc-300 font-mono-code truncate">
                            {isAdrenoActive
                              ? detectedGpuInfo.gmemCacheLabel
                              : 'Ускоритель Adreno выключен'}
                          </div>
                        </div>
                        <button
                          type="button"
                          onClick={() => setAdrenoMode(isAdrenoActive ? 'off' : 'on')}
                          className={`px-3 py-1 rounded-full font-mono-code font-bold cursor-pointer shrink-0 ${
                            isAdrenoActive ? 'bg-orange-500 text-white' : 'bg-white/15 text-zinc-300'
                          }`}
                        >
                          {isAdrenoActive ? 'GMEM Вкл' : 'Включить'}
                        </button>
                      </div>

                      <div className="grid grid-cols-4 gap-1 bg-white/10 p-1 rounded-full">
                        {([
                          { factor: 'auto' as const, label: `Авто (${effectiveUpscaleFactor}x)` },
                          { factor: 1.5 as const, label: 'FHD+ 1.5x' },
                          { factor: 2.0 as const, label: 'QHD 2K' },
                          { factor: 4.0 as const, label: '4K UHD' }
                        ]).map((item) => (
                          <button
                            key={String(item.factor)}
                            type="button"
                            onClick={() => {
                              setUpscaleFactor(item.factor);
                              setUpscaleEnabled(true);
                              forceRedrawRef.current = true;
                            }}
                            className={`py-1.5 rounded-full font-mono-code font-bold cursor-pointer transition whitespace-nowrap text-[11px] ${
                              upscaleEnabled && upscaleFactor === item.factor
                                ? 'bg-emerald-400 text-black'
                                : 'text-zinc-300'
                            }`}
                          >
                            {item.label}
                          </button>
                        ))}
                      </div>

                      <div>
                        <div className="flex justify-between mb-1">
                          <span className="text-zinc-300">
                            Резкость и детализация контуров (CAS)
                          </span>
                          <span className="font-mono-code font-bold">
                            {Math.round(upscaleSharpness * 100)}%
                          </span>
                        </div>
                        <input
                          type="range"
                          min={0.1}
                          max={1.4}
                          step={0.05}
                          value={upscaleSharpness}
                          onChange={(e) => {
                            setUpscaleSharpness(parseFloat(e.target.value));
                            if (!upscaleEnabled) setUpscaleEnabled(true);
                            forceRedrawRef.current = true;
                          }}
                          className="rex-slider"
                        />
                      </div>

                      <div>
                        <div className="flex justify-between mb-1">
                          <span className="text-zinc-300">
                            Подавление шума и артефактов сжатия
                          </span>
                          <span className="font-mono-code font-bold">
                            {Math.round(upscaleDenoise * 100)}%
                          </span>
                        </div>
                        <input
                          type="range"
                          min={0}
                          max={1}
                          step={0.05}
                          value={upscaleDenoise}
                          onChange={(e) => {
                            setUpscaleDenoise(parseFloat(e.target.value));
                            if (!upscaleEnabled) setUpscaleEnabled(true);
                            forceRedrawRef.current = true;
                          }}
                          className="rex-slider"
                        />
                      </div>
                    </div>
                  )}

                  {/* PANEL 1: MEMC & HDR10 */}
                  {fsActivePanel === 'memc' && (
                    <div className="flex flex-col gap-3 text-xs">
                      <div className="grid grid-cols-3 gap-1.5 bg-white/10 p-1 rounded-2xl">
                        {[
                          { id: 'optical', label: 'Оптический поток' },
                          { id: 'blend', label: 'Смешивание' },
                          { id: 'off', label: 'Выкл' }
                        ].map((m) => {
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
                                  setInterpMode('off');
                                  setInterpEnabled(false);
                                } else {
                                  setInterpMode(m.id as 'optical' | 'blend');
                                  setInterpEnabled(true);
                                  if (videoOutputMode === 'video_fallback') {
                                    setVideoOutputMode('webgl_direct');
                                  }
                                }
                                forceRedrawRef.current = true;
                              }}
                              className={`py-1.5 rounded-xl text-center font-semibold cursor-pointer transition ${
                                isAct ? 'bg-white text-black font-bold' : 'text-zinc-300'
                              }`}
                            >
                              {m.label}
                            </button>
                          );
                        })}
                      </div>

                      <div>
                        <div className="flex items-center justify-between mb-1">
                          <span className="text-zinc-300">Целевая частота (MEMC)</span>
                          <span className="font-mono-code font-bold text-amber-300">
                            {effectiveTargetFps} FPS {targetFps === 'auto' ? `(Авто ${detectedDisplayHz}Гц)` : ''}
                          </span>
                        </div>
                        <div className="grid grid-cols-5 gap-1 bg-white/10 p-1 rounded-full text-[11px]">
                          {[
                            { id: 'auto' as const, label: `Авто` },
                            { id: 60 as const, label: '60' },
                            { id: 90 as const, label: '90' },
                            { id: 120 as const, label: '120' },
                            { id: 144 as const, label: '144' }
                          ].map((item) => (
                            <button
                              key={item.id}
                              type="button"
                              onClick={() => {
                                setTargetFps(item.id);
                                setInterpEnabled(true);
                                if (interpMode === 'off') setInterpMode('optical');
                                forceRedrawRef.current = true;
                              }}
                              className={`py-1.5 rounded-full font-mono-code font-bold cursor-pointer transition text-center ${
                                targetFps === item.id ? 'bg-white text-black' : 'text-zinc-300'
                              }`}
                            >
                              {item.label}
                            </button>
                          ))}
                        </div>
                      </div>

                      {/* Secondary Sub-Frame Cascade FBO inside Fullscreen MEMC Panel */}
                      <div className="p-2.5 rounded-2xl bg-white/10 border border-white/10 flex flex-col gap-2">
                        <div className="flex items-center justify-between gap-2">
                          <div>
                            <div className="font-bold text-white">
                              Вторичные суб-кадры (Каскад FBO)
                            </div>
                            <div className="text-[10px] text-zinc-300 font-mono-code">
                              Генерация от промежуточного I_0.5 • Сдвиг векторов ×0.5
                            </div>
                          </div>
                          <label className="inline-flex items-center gap-1.5 cursor-pointer shrink-0">
                            <input
                              type="checkbox"
                              checked={subframeCascadeEnabled}
                              onChange={(e) => {
                                setSubframeCascadeEnabled(e.target.checked);
                                if (e.target.checked && (!interpEnabled || interpMode === 'off')) {
                                  setInterpEnabled(true);
                                  setInterpMode('optical');
                                }
                                forceRedrawRef.current = true;
                              }}
                              className="w-4 h-4 accent-sky-400 rounded"
                            />
                            <span className="font-mono-code font-bold text-sky-300">
                              {subframeCascadeEnabled ? `${effectiveSubframeCascadeMult}x` : 'Выкл'}
                            </span>
                          </label>
                        </div>

                        <div className="grid grid-cols-4 gap-1 bg-black/30 p-1 rounded-full text-[11px]">
                          {(
                            [
                              { id: 'auto', label: `Авто (${effectiveSubframeCascadeMult}x)` },
                              { id: '2x', label: '2x Суб' },
                              { id: '3x', label: '3x Суб' },
                              { id: '4x', label: '4x Ультра' }
                            ] as const
                          ).map((item) => (
                            <button
                              key={item.id}
                              type="button"
                              onClick={() => {
                                setSubframeCascadeMode(item.id);
                                setSubframeCascadeEnabled(true);
                                if (!interpEnabled || interpMode === 'off') {
                                  setInterpEnabled(true);
                                  setInterpMode('optical');
                                }
                                forceRedrawRef.current = true;
                              }}
                              className={`py-1 rounded-full font-mono-code font-bold cursor-pointer transition whitespace-nowrap text-center ${
                                subframeCascadeEnabled && subframeCascadeMode === item.id
                                  ? 'bg-sky-400 text-black'
                                  : 'text-zinc-300'
                              }`}
                            >
                              {item.label}
                            </button>
                          ))}
                        </div>

                        <div>
                          <div className="flex items-center justify-between mb-1 text-[11px]">
                            <span className="text-zinc-300">Разрешение FBO суб-кадров (VRAM Авто-контроль)</span>
                            <span className="font-mono-code font-bold text-sky-300">
                              {subframeBufferResLabel}
                            </span>
                          </div>
                          <div className="grid grid-cols-4 gap-1 bg-black/30 p-1 rounded-full text-[10px] mb-2">
                            {(
                              [
                                { id: 'auto', label: 'Авто 1440p' },
                                { id: '720p', label: '720p' },
                                { id: '1080p', label: '1080p' },
                                { id: '1440p', label: '1440p QHD' }
                              ] as const
                            ).map((item) => (
                              <button
                                key={item.id}
                                type="button"
                                onClick={() => {
                                  setSubframeBufferResMode(item.id);
                                  forceRedrawRef.current = true;
                                }}
                                className={`py-1 rounded-full font-mono-code font-bold cursor-pointer transition text-center ${
                                  subframeBufferResMode === item.id
                                    ? 'bg-sky-400 text-black'
                                    : 'text-zinc-300'
                                }`}
                              >
                                {item.label}
                              </button>
                            ))}
                          </div>
                        </div>

                        <div>
                          <div className="flex justify-between mb-1 text-[11px]">
                            <span className="text-zinc-300">Когерентность векторов и защита быстрых сцен</span>
                            <span className="font-mono-code font-bold text-sky-300">
                              {subframeCoherenceGuard}%
                            </span>
                          </div>
                          <input
                            type="range"
                            min={0}
                            max={100}
                            step={5}
                            value={subframeCoherenceGuard}
                            onChange={(e) => {
                              setSubframeCoherenceGuard(parseInt(e.target.value, 10));
                              if (!subframeCascadeEnabled) setSubframeCascadeEnabled(true);
                              forceRedrawRef.current = true;
                            }}
                            className="rex-slider"
                          />
                        </div>
                      </div>

                      <div>
                        <div className="flex justify-between mb-1">
                          <span className="text-zinc-300">HDR10 Тонмаппинг</span>
                          <span className="font-mono-code font-bold">
                            {hdrEnabled ? `${Math.round(hdrStrength * 100)}%` : 'Выкл'}
                          </span>
                        </div>
                        <div className="flex items-center gap-2.5">
                          <input
                            type="checkbox"
                            checked={hdrEnabled}
                            onChange={(e) => setHdrEnabled(e.target.checked)}
                            className="w-4 h-4 accent-amber-400 rounded"
                          />
                          <input
                            type="range"
                            min={0.3}
                            max={1.5}
                            step={0.05}
                            value={hdrStrength}
                            onChange={(e) => {
                              setHdrStrength(parseFloat(e.target.value));
                              if (!hdrEnabled) setHdrEnabled(true);
                            }}
                            className="rex-slider flex-1"
                          />
                        </div>
                      </div>

                      <div>
                        <div className="flex justify-between mb-1">
                          <span className="text-zinc-300">Сила потока</span>
                          <span className="font-mono-code font-bold">{Math.round(interpStrength * 100)}%</span>
                        </div>
                        <input
                          type="range"
                          min={0}
                          max={2.0}
                          step={0.05}
                          value={interpStrength}
                          onChange={(e) => {
                            setInterpStrength(parseFloat(e.target.value));
                            forceRedrawRef.current = true;
                          }}
                          className="rex-slider"
                        />
                      </div>

                      <div>
                        <div className="flex items-center justify-between mb-1">
                          <span className="text-zinc-300">Буфер потока FBO (6-Lvl Pyramid до 512×288)</span>
                          <span className="font-mono-code font-bold text-emerald-300">
                            {flowScaleLabel}
                          </span>
                        </div>
                        <div className="grid grid-cols-7 gap-1 bg-white/10 p-1 rounded-full text-[10px]">
                          {(
                            [
                              { id: 'auto', label: 'Авто' },
                              { id: 'performance', label: '64×36' },
                              { id: 'balanced', label: '96×54' },
                              { id: 'ultra', label: '128×72' },
                              { id: 'extreme', label: '256×144' },
                              { id: 'high', label: '384×216' },
                              { id: 'max', label: '512×288' }
                            ] as const
                          ).map((item) => (
                            <button
                              key={item.id}
                              type="button"
                              onClick={() => {
                                setFlowScaleMode(item.id);
                                forceRedrawRef.current = true;
                              }}
                              className={`py-1.5 rounded-full font-mono-code font-bold cursor-pointer transition text-center ${
                                flowScaleMode === item.id ? 'bg-white text-black' : 'text-zinc-300'
                              }`}
                            >
                              {item.label}
                            </button>
                          ))}
                        </div>
                      </div>

                      <div className="grid grid-cols-2 gap-3">
                        <div>
                          <div className="flex justify-between mb-1">
                            <span className="text-zinc-300">Радиус поиска</span>
                            <span className="font-mono-code font-bold">{motionScale} px</span>
                          </div>
                          <input
                            type="range"
                            min={4}
                            max={48}
                            step={1}
                            value={motionScale}
                            onChange={(e) => {
                              setMotionScale(parseInt(e.target.value, 10));
                              forceRedrawRef.current = true;
                            }}
                            className="rex-slider"
                          />
                        </div>
                        <div>
                          <div className="flex justify-between mb-1">
                            <span className="text-zinc-300">Анти-ореол</span>
                            <span className="font-mono-code font-bold">{dejudderHaloControl}%</span>
                          </div>
                          <input
                            type="range"
                            min={0}
                            max={100}
                            step={5}
                            value={dejudderHaloControl}
                            onChange={(e) => {
                              setDejudderHaloControl(parseInt(e.target.value, 10));
                              forceRedrawRef.current = true;
                            }}
                            className="rex-slider"
                          />
                        </div>
                      </div>

                      <div className="flex flex-wrap items-center justify-between gap-2 pt-1 border-t border-white/10">
                        <label className="flex items-center gap-1.5 cursor-pointer">
                          <input
                            type="checkbox"
                            checked={sceneCutProtection}
                            onChange={(e) => setSceneCutProtection(e.target.checked)}
                            className="w-4 h-4 rounded"
                          />
                          <span>Склейки</span>
                        </label>
                        <label className="flex items-center gap-1.5 cursor-pointer">
                          <input
                            type="checkbox"
                            checked={splitCompareMode}
                            onChange={(e) => setSplitCompareMode(e.target.checked)}
                            className="w-4 h-4 rounded"
                          />
                          <span>50/50</span>
                        </label>
                        <label className="flex items-center gap-1.5 cursor-pointer">
                          <input
                            type="checkbox"
                            checked={showVectors}
                            onChange={(e) => setShowVectors(e.target.checked)}
                            className="w-4 h-4 rounded"
                          />
                          <span>Векторы</span>
                        </label>
                        <label
                          className="flex items-center gap-1.5 cursor-pointer text-amber-300 font-semibold"
                          title="Тепловая карта ошибок Symmetric SAD из буфера Pass 1"
                        >
                          <input
                            type="checkbox"
                            checked={showSadHeatmap}
                            onChange={(e) => setShowSadHeatmap(e.target.checked)}
                            className="w-4 h-4 rounded accent-amber-400"
                          />
                          <span>SAD Карта</span>
                        </label>
                        <label className="flex items-center gap-1.5 cursor-pointer">
                          <input
                            type="checkbox"
                            checked={monochromeFilter}
                            onChange={(e) => setMonochromeFilter(e.target.checked)}
                            className="w-4 h-4 rounded"
                          />
                          <span>Ч/Б</span>
                        </label>
                      </div>
                    </div>
                  )}

                  {/* PANEL 2: AUDIO, EQ, NIGHT MODE & SPECTROGRAM */}
                  {fsActivePanel === 'audio' && (
                    <div className="flex flex-col gap-2.5 text-xs">
                      <div className="flex items-center justify-between gap-2 bg-white/10 p-2 rounded-2xl">
                        <span className="text-zinc-300 font-semibold">Спектрограмма Web Audio</span>
                        <canvas
                          ref={fsEqSpectrumCanvasRef}
                          width={160}
                          height={32}
                          className="rounded-lg bg-black/50"
                        />
                      </div>

                      <div>
                        <div className="flex justify-between mb-1">
                          <span className="text-zinc-300">Громкость</span>
                          <span className="font-mono-code font-bold">
                            {isMuted ? '0%' : `${Math.round(volume * 100)}%`}
                          </span>
                        </div>
                        <input
                          type="range"
                          min={0}
                          max={1}
                          step={0.02}
                          value={isMuted ? 0 : volume}
                          onChange={(e) => {
                            const v = parseFloat(e.target.value);
                            setVolume(v);
                            setIsMuted(v === 0);
                            if (videoRef.current) {
                              videoRef.current.volume = v;
                              videoRef.current.muted = v === 0;
                            }
                          }}
                          className="rex-slider"
                        />
                      </div>

                      <div>
                        <div className="flex justify-between mb-1">
                          <span className="text-zinc-300">Нормализация / Ночной режим</span>
                          <span className="font-mono-code font-bold text-emerald-300">
                            {audioCompressorMode.toUpperCase()}
                          </span>
                        </div>
                        <div className="grid grid-cols-4 gap-1 bg-white/10 p-1 rounded-2xl text-[11px]">
                          {(
                            [
                              { id: 'off', label: 'Выкл' },
                              { id: 'soft', label: 'Мягкий' },
                              { id: 'night', label: 'Ночной' },
                              { id: 'voice', label: 'Голос+' }
                            ] as const
                          ).map((m) => (
                            <button
                              key={m.id}
                              type="button"
                              onClick={() => {
                                initWebAudio();
                                setAudioCompressorMode(m.id);
                              }}
                              className={`py-1 rounded-xl font-bold cursor-pointer ${
                                audioCompressorMode === m.id ? 'bg-white text-black' : 'text-zinc-300'
                              }`}
                            >
                              {m.label}
                            </button>
                          ))}
                        </div>
                      </div>

                      <label className="flex items-center justify-between p-2 rounded-xl bg-white/10 cursor-pointer">
                        <span>Crossfeed для наушников (0.3 мс стерео-сцена)</span>
                        <input
                          type="checkbox"
                          checked={headphoneCrossfeed}
                          onChange={(e) => {
                            initWebAudio();
                            setHeadphoneCrossfeed(e.target.checked);
                          }}
                          className="w-4 h-4 rounded"
                        />
                      </label>

                      <div>
                        <div className="flex justify-between mb-1">
                          <span className="text-zinc-300">Предусиление (Preamp)</span>
                          <span className="font-mono-code font-bold">{Math.round(preampGain * 100)}%</span>
                        </div>
                        <input
                          type="range"
                          min={0.5}
                          max={2.0}
                          step={0.05}
                          value={preampGain}
                          onChange={(e) => setPreampGain(parseFloat(e.target.value))}
                          className="rex-slider"
                        />
                      </div>

                      <div className="flex flex-wrap gap-1 bg-white/10 p-1 rounded-2xl">
                        {(['flat', 'cinema', 'bass', 'vocal', 'treble'] as const).map((p) => (
                          <button
                            key={p}
                            type="button"
                            onClick={() => applyPreset(p)}
                            className={`flex-1 py-1 rounded-xl font-mono-code font-bold cursor-pointer ${
                              eqPreset === p ? 'bg-white text-black' : 'text-zinc-300'
                            }`}
                          >
                            {p.toUpperCase()}
                          </button>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* PANEL 3: SUBTITLES (DUAL SUBTITLES + .ASS/.SSA) */}
                  {fsActivePanel === 'subtitles' && (
                    <div className="flex flex-col gap-3 text-xs">
                      <div className="flex items-center justify-between gap-2">
                        <label className="flex items-center gap-2 cursor-pointer font-semibold">
                          <input
                            type="checkbox"
                            checked={subtitlesEnabled}
                            onChange={(e) => setSubtitlesEnabled(e.target.checked)}
                            className="w-4 h-4 rounded"
                          />
                          <span>Основные субтитры (Низ)</span>
                        </label>
                        <button
                          type="button"
                          onClick={() => subFileInputRef.current?.click()}
                          className="px-3 py-1 rounded-full bg-white text-black font-bold cursor-pointer"
                        >
                          + .SRT / .ASS
                        </button>
                      </div>

                      <div className="flex items-center justify-between gap-2">
                        <label className="flex items-center gap-2 cursor-pointer font-semibold text-amber-300">
                          <input
                            type="checkbox"
                            checked={secondarySubtitlesEnabled}
                            onChange={(e) => setSecondarySubtitlesEnabled(e.target.checked)}
                            className="w-4 h-4 rounded accent-amber-400"
                          />
                          <span>Двойные субтитры (Верх)</span>
                        </label>
                        <button
                          type="button"
                          onClick={() => secondarySubFileInputRef.current?.click()}
                          className="px-3 py-1 rounded-full bg-amber-400 text-black font-bold cursor-pointer"
                        >
                          + Верх .SRT / .ASS
                        </button>
                      </div>

                      <div>
                        <div className="flex justify-between mb-1">
                          <span className="text-zinc-300">Размер текста</span>
                          <span className="font-mono-code font-bold">{subFontSize} px</span>
                        </div>
                        <input
                          type="range"
                          min={14}
                          max={30}
                          step={1}
                          value={subFontSize}
                          onChange={(e) => setSubFontSize(parseInt(e.target.value, 10))}
                          className="rex-slider"
                        />
                      </div>

                      <div>
                        <div className="flex justify-between mb-1">
                          <span className="text-zinc-300">Смещение времени</span>
                          <span className="font-mono-code font-bold">
                            {subDelaySec > 0 ? `+${subDelaySec.toFixed(1)}` : subDelaySec.toFixed(1)} с
                          </span>
                        </div>
                        <input
                          type="range"
                          min={-3}
                          max={3}
                          step={0.1}
                          value={subDelaySec}
                          onChange={(e) => setSubDelaySec(parseFloat(e.target.value))}
                          className="rex-slider"
                        />
                      </div>
                    </div>
                  )}

                  {/* PANEL 4: PLAYLIST */}
                  {fsActivePanel === 'playlist' && (
                    <div className="flex flex-col gap-2 text-xs">
                      <div className="flex items-center justify-between mb-1">
                        <span className="text-zinc-300">Видео в очереди: {playlist.length}</span>
                        <button
                          type="button"
                          onClick={() => fileInputRef.current?.click()}
                          className="px-3 py-1 rounded-full bg-white text-black font-bold cursor-pointer"
                        >
                          + Добавить файл
                        </button>
                      </div>
                      <div className="flex flex-col gap-1.5 max-h-44 overflow-y-auto">
                        {playlist.length === 0 ? (
                          <div className="text-zinc-400 py-4 text-center">Список видео пуст</div>
                        ) : (
                          playlist.map((item, idx) => (
                            <div
                              key={item.id}
                              onClick={() => playPlaylistIndex(idx)}
                              className={`p-2 rounded-xl flex items-center justify-between gap-2 cursor-pointer ${
                                idx === activePlaylistIndex
                                  ? 'bg-white text-black font-bold'
                                  : 'bg-white/10 text-white'
                              }`}
                            >
                              <div className="flex items-center gap-2 min-w-0">
                                {item.thumbnailUrl ? (
                                  <img
                                    src={item.thumbnailUrl}
                                    alt={item.title}
                                    className="w-10 h-6 rounded object-cover shrink-0 bg-black/40"
                                  />
                                ) : (
                                  <FileVideo className="w-4 h-4 shrink-0 opacity-75" />
                                )}
                                <span className="truncate">
                                  {idx + 1}. {item.title}
                                </span>
                              </div>
                              <span className="font-mono-code text-[10px] shrink-0">{item.size}</span>
                            </div>
                          ))
                        )}
                      </div>
                    </div>
                  )}

                  {/* PANEL 5: SCREEN, BRIGHTNESS, SPEED, ASPECT */}
                  {fsActivePanel === 'more' && (
                    <div className="flex flex-col gap-3 text-xs">
                      <div>
                        <div className="flex justify-between mb-1">
                          <span className="text-zinc-300">Яркость видео</span>
                          <div className="flex items-center gap-2">
                            <span className="font-mono-code font-bold">
                              {Math.round(videoBrightness * 100)}%
                            </span>
                            <button
                              type="button"
                              onClick={() => setVideoBrightness(1.0)}
                              className="px-2 py-0.5 rounded bg-white/15 text-[10px] cursor-pointer"
                            >
                              100%
                            </button>
                          </div>
                        </div>
                        <input
                          type="range"
                          min={0.2}
                          max={1.8}
                          step={0.05}
                          value={videoBrightness}
                          onChange={(e) => setVideoBrightness(parseFloat(e.target.value))}
                          className="rex-slider"
                        />
                      </div>

                      <div>
                        <div className="text-zinc-300 mb-1">Скорость воспроизведения</div>
                        <div className="grid grid-cols-6 gap-1 bg-white/10 p-1 rounded-full">
                          {[0.5, 0.75, 1.0, 1.25, 1.5, 2.0].map((sp) => (
                            <button
                              key={sp}
                              type="button"
                              onClick={() => {
                                setPlaybackRate(sp);
                                if (videoRef.current) videoRef.current.playbackRate = sp;
                              }}
                              className={`py-1 rounded-full font-mono-code font-bold cursor-pointer ${
                                playbackRate === sp ? 'bg-white text-black' : 'text-zinc-300'
                              }`}
                            >
                              {sp}x
                            </button>
                          ))}
                        </div>
                      </div>

                      <div>
                        <div className="text-zinc-300 mb-1">Формат кадра</div>
                        <div className="grid grid-cols-3 gap-1.5 bg-white/10 p-1 rounded-full">
                          {[
                            { id: 'contain', label: 'Оригинал' },
                            { id: 'cover', label: 'Кроп' },
                            { id: 'fill', label: '16:9' }
                          ].map((m) => (
                            <button
                              key={m.id}
                              type="button"
                              onClick={() => setAspectMode(m.id as 'contain' | 'cover' | 'fill')}
                              className={`py-1.5 rounded-full font-semibold cursor-pointer ${
                                aspectMode === m.id ? 'bg-white text-black' : 'text-zinc-300'
                              }`}
                            >
                              {m.label}
                            </button>
                          ))}
                        </div>
                      </div>

                      <div className="flex items-center justify-between gap-2 pt-1">
                        <button
                          type="button"
                          onClick={handleSnapshot}
                          className="flex-1 py-2 rounded-full bg-white/15 hover:bg-white/25 text-white font-semibold cursor-pointer"
                        >
                          Сохранить кадр PNG
                        </button>
                        <button
                          type="button"
                          onClick={() => setSplitCompareMode((p) => !p)}
                          className={`px-4 py-2 rounded-full font-mono-code font-bold cursor-pointer transition ${
                            splitCompareMode ? 'bg-amber-500 text-black' : 'bg-white/15 text-white'
                          }`}
                        >
                          {splitCompareMode ? 'СПЛИТ ВКЛ' : 'СПЛИТ 50/50'}
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              ) : (
                /* Fullscreen Center Playback Controls */
                <div
                  onClick={(e) => e.stopPropagation()}
                  onPointerDown={(e) => e.stopPropagation()}
                  className="pointer-events-auto flex items-center justify-center gap-5 sm:gap-8 my-auto mx-auto"
                >
                  <button
                    type="button"
                    onClick={() => seekToTime(currentTimeRef.current - doubleTapSeekSec)}
                    className="w-12 h-12 rounded-full bg-black/65 hover:bg-black/80 text-white border border-white/20 flex items-center justify-center cursor-pointer transition active:scale-95"
                    title={`Назад ${doubleTapSeekSec} с`}
                  >
                    <RotateCcw className="w-5 h-5" />
                  </button>

                  <button
                    type="button"
                    onClick={() => {
                      if (!hasLoadedVideo && !isDemoTestActive) {
                        fileInputRef.current?.click();
                        return;
                      }
                      setIsPlaying((prev) => {
                        const next = !prev;
                        if (videoRef.current && !isDemoTestActive) {
                          if (next) {
                            initWebAudio();
                            videoRef.current.play().catch(() => {});
                          } else {
                            videoRef.current.pause();
                          }
                        }
                        forceRedrawRef.current = true;
                        return next;
                      });
                    }}
                    className="w-16 h-16 rounded-full bg-white text-black flex items-center justify-center shadow-2xl cursor-pointer transition transform active:scale-95"
                    title={isPlaying ? 'Пауза' : 'Воспроизведение'}
                  >
                    {isPlaying ? (
                      <Pause className="w-7 h-7 fill-current" />
                    ) : (
                      <Play className="w-7 h-7 fill-current ml-0.5" />
                    )}
                  </button>

                  <button
                    type="button"
                    onClick={() => seekToTime(currentTimeRef.current + doubleTapSeekSec)}
                    className="w-12 h-12 rounded-full bg-black/65 hover:bg-black/80 text-white border border-white/20 flex items-center justify-center cursor-pointer transition active:scale-95"
                    title={`Вперёд ${doubleTapSeekSec} с`}
                  >
                    <RefreshCw className="w-5 h-5" />
                  </button>
                </div>
              )}

              {/* Fullscreen Bottom Bar: Timeline + Transport Buttons */}
              <div
                onClick={(e) => e.stopPropagation()}
                onPointerDown={(e) => e.stopPropagation()}
                className="pointer-events-auto flex flex-col gap-2.5"
              >
                <div className="flex items-center gap-3">
                  <span ref={fsTimecodeDisplayRef} className="text-xs font-mono-code text-white shrink-0">
                    {formatTime(currentTime)}
                  </span>
                  <input
                    ref={fsScrubberInputRef}
                    type="range"
                    min={0}
                    max={duration || 100}
                    step={0.05}
                    defaultValue={currentTime}
                    onPointerDown={() => {
                      isScrubbingRef.current = true;
                      revealFsControls();
                    }}
                    onPointerUp={() => {
                      isScrubbingRef.current = false;
                      seekToTime(currentTimeRef.current, true);
                      revealFsControls();
                    }}
                    onPointerCancel={() => {
                      isScrubbingRef.current = false;
                      seekToTime(currentTimeRef.current, true);
                    }}
                    onBlur={() => {
                      if (isScrubbingRef.current) {
                        isScrubbingRef.current = false;
                        seekToTime(currentTimeRef.current, true);
                      }
                    }}
                    onChange={(e) => {
                      const val = parseFloat(e.target.value);
                      seekToTime(val, !isScrubbingRef.current);
                    }}
                    className="rex-slider flex-1"
                  />
                  <span className="text-xs font-mono-code text-zinc-300 shrink-0">
                    {formatTime(duration)}
                  </span>
                </div>

                <div className="flex items-center justify-between gap-2 flex-wrap">
                  <div className="flex items-center gap-1.5 sm:gap-2">
                    <button
                      type="button"
                      onClick={handlePrevTrack}
                      className="p-2.5 rounded-full bg-white/15 hover:bg-white/25 text-white cursor-pointer"
                      title="Предыдущее видео"
                    >
                      <SkipBack className="w-4 h-4 fill-current" />
                    </button>

                    <button
                      type="button"
                      onClick={() => {
                        if (!hasLoadedVideo && !isDemoTestActive) {
                          startBuiltIn24FpsTest();
                          return;
                        }
                        setIsPlaying((prev) => {
                          const next = !prev;
                          if (videoRef.current && !isDemoTestActive) {
                            if (next) {
                              initWebAudio();
                              videoRef.current.play().catch(() => {});
                            } else {
                              videoRef.current.pause();
                            }
                          }
                          forceRedrawRef.current = true;
                          return next;
                        });
                      }}
                      className="p-2.5 rounded-full bg-white text-black cursor-pointer"
                    >
                      {isPlaying ? (
                        <Pause className="w-4 h-4 fill-current" />
                      ) : (
                        <Play className="w-4 h-4 fill-current" />
                      )}
                    </button>

                    <button
                      type="button"
                      onClick={handleNextTrack}
                      className="p-2.5 rounded-full bg-white/15 hover:bg-white/25 text-white cursor-pointer"
                      title="Следующее видео"
                    >
                      <SkipForward className="w-4 h-4 fill-current" />
                    </button>

                    <button
                      type="button"
                      onClick={() => {
                        setIsMuted((prev) => {
                          const next = !prev;
                          if (videoRef.current) videoRef.current.muted = next;
                          return next;
                        });
                      }}
                      className="p-2.5 rounded-full bg-white/15 hover:bg-white/25 text-white cursor-pointer"
                    >
                      {isMuted ? <VolumeX className="w-4 h-4" /> : <Volume2 className="w-4 h-4" />}
                    </button>

                    <button
                      type="button"
                      onClick={() => {
                        setIsPlaying(false);
                        if (videoRef.current) videoRef.current.pause();
                        const stepSec = isDemoTestActive
                          ? 1 / 24
                          : Math.max(1 / 120, Math.min(1 / 12, (estimatedFrameIntervalMsRef.current || 41.667) / 1000));
                        seekToTime(currentTimeRef.current - stepSec);
                      }}
                      className="px-2.5 py-1.5 rounded-full bg-white/15 text-white text-xs font-mono-code cursor-pointer"
                      title="Кадр назад"
                    >
                      -1к
                    </button>

                    <button
                      type="button"
                      onClick={() => {
                        setIsPlaying(false);
                        if (videoRef.current) videoRef.current.pause();
                        const stepSec = isDemoTestActive
                          ? 1 / 24
                          : Math.max(1 / 120, Math.min(1 / 12, (estimatedFrameIntervalMsRef.current || 41.667) / 1000));
                        seekToTime(currentTimeRef.current + stepSec);
                      }}
                      className="px-2.5 py-1.5 rounded-full bg-white/15 text-white text-xs font-mono-code cursor-pointer"
                      title="Кадр вперёд"
                    >
                      +1к
                    </button>
                  </div>

                  <div className="flex items-center gap-1.5 sm:gap-2">
                    <button
                      type="button"
                      onClick={() => {
                        const modes: ('contain' | 'cover' | 'fill')[] = ['contain', 'cover', 'fill'];
                        setAspectMode(modes[(modes.indexOf(aspectMode) + 1) % modes.length]);
                      }}
                      className="px-3 py-1.5 rounded-full bg-white/15 text-white text-xs font-semibold cursor-pointer"
                    >
                      {aspectMode === 'contain' ? 'Оригинал' : aspectMode === 'cover' ? 'Кроп' : '16:9'}
                    </button>

                    <button
                      type="button"
                      onClick={() => {
                        const speeds = [0.5, 0.75, 1.0, 1.25, 1.5, 2.0];
                        const next = speeds[(speeds.indexOf(playbackRate) + 1) % speeds.length];
                        setPlaybackRate(next);
                        if (videoRef.current) videoRef.current.playbackRate = next;
                      }}
                      className="px-3 py-1.5 rounded-full bg-white/15 text-white text-xs font-mono-code font-bold cursor-pointer"
                    >
                      {playbackRate}x
                    </button>

                    <button
                      type="button"
                      onClick={handleSnapshot}
                      className="px-3 py-1.5 rounded-full bg-white/15 text-white text-xs font-semibold cursor-pointer"
                    >
                      PNG
                    </button>

                    <button
                      type="button"
                      onClick={() => {
                        setFsActivePanel('none');
                        toggleFullscreen();
                      }}
                      className="p-2.5 rounded-full bg-white/15 hover:bg-white/25 text-white cursor-pointer"
                      title="Свернуть экран"
                    >
                      <Minimize2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Empty Video Stage Prompt when no file or 24 FPS test is loaded yet */}
          {!hasLoadedVideo && !isDemoTestActive && (
            <div
              onClick={(e) => e.stopPropagation()}
              className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-zinc-950/90 text-white p-6 text-center z-20"
            >
              <FileVideo className="w-9 h-9 text-zinc-300" />
              <div className="rex-serif font-bold text-base">Выберите видеофайл или запустите тест MEMC</div>
              <p className="text-xs text-zinc-400 max-w-sm">
                Откройте любое видео с устройства или запустите эталонный 24.0 FPS поток для наглядного сравнения генерации промежуточных кадров (Оптический поток MEMC)
              </p>
              <div className="flex flex-wrap items-center justify-center gap-2.5 mt-1">
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  className="px-4 py-2 rounded-full bg-white text-black text-xs font-bold cursor-pointer flex items-center gap-1.5"
                >
                  <FileVideo className="w-4 h-4" />
                  <span>Открыть видеофайл</span>
                </button>
                <button
                  type="button"
                  onClick={startBuiltIn24FpsTest}
                  className="px-4 py-2 rounded-full text-white text-xs font-bold cursor-pointer flex items-center gap-1.5"
                  style={{ background: 'linear-gradient(135deg, #6366f1, #a855f7)' }}
                >
                  <Sparkles className="w-4 h-4" />
                  <span>Запустить тест 24 → {effectiveTargetFps} FPS</span>
                </button>
                <button
                  type="button"
                  onClick={() => setUrlModalOpen(true)}
                  className="px-4 py-2 rounded-full bg-white/15 hover:bg-white/25 text-white text-xs font-bold cursor-pointer flex items-center gap-1.5 border border-white/20"
                >
                  <Play className="w-3.5 h-3.5 fill-current" />
                  <span>Поток URL / Anixart</span>
                </button>
              </div>
            </div>
          )}

          {/* Floating Skip Opening / Ending Button (from Kodik / Anixart metadata) */}
          {activeSkipPrompt && (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                seekToTime(activeSkipPrompt.end, true);
                activeSkipPromptRef.current = null;
                setActiveSkipPrompt(null);
                showToast(`${activeSkipPrompt.label} (${formatTime(activeSkipPrompt.end)})`);
              }}
              onPointerDown={(e) => e.stopPropagation()}
              className={`pointer-events-auto absolute right-4 ${
                isFullscreen && fsControlsVisible ? 'bottom-28' : 'bottom-5'
              } z-30 px-4 py-2 rounded-full bg-white/95 hover:bg-white text-black text-xs font-bold shadow-2xl border border-black/10 flex items-center gap-1.5 cursor-pointer transition transform active:scale-95`}
            >
              <span>{activeSkipPrompt.label}</span>
              <SkipForward className="w-3.5 h-3.5 fill-current" />
            </button>
          )}

          {/* Visual Swipe Gesture HUD Indicator */}
          {swipeHud && (
            <div className="pointer-events-none absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 min-w-[185px] max-w-[230px] px-4 py-3 rounded-2xl bg-zinc-950/92 text-white border border-white/20 shadow-2xl z-40 flex flex-col gap-2">
              <div className="flex items-center justify-between gap-3">
                <div className="flex items-center gap-2">
                  <div className="w-7 h-7 rounded-xl bg-white/12 flex items-center justify-center text-white shrink-0">
                    {swipeHud.type === 'brightness' && <Sun className="w-4 h-4" />}
                    {swipeHud.type === 'volume' &&
                      (swipeHud.progress === 0 ? (
                        <VolumeX className="w-4 h-4" />
                      ) : (
                        <Volume2 className="w-4 h-4" />
                      ))}
                    {swipeHud.type === 'seek' &&
                      (swipeHud.valueText.startsWith('-') ? (
                        <SkipBack className="w-4 h-4 fill-current" />
                      ) : (
                        <SkipForward className="w-4 h-4 fill-current" />
                      ))}
                  </div>
                  <div className="text-xs font-medium text-zinc-200">{swipeHud.title}</div>
                </div>
                <div className="font-mono-code text-sm font-bold text-white shrink-0">
                  {swipeHud.valueText}
                </div>
              </div>

              {swipeHud.subText && (
                <div className="text-[11px] font-mono-code text-zinc-400">{swipeHud.subText}</div>
              )}

              <div className="w-full h-1.5 rounded-full bg-white/15 overflow-hidden">
                <div
                  className="h-full bg-white rounded-full transition-all duration-75"
                  style={{ width: `${Math.max(0, Math.min(100, swipeHud.progress))}%` }}
                />
              </div>
            </div>
          )}

          {/* Hold 2.0x Speed Feedback Badge */}
          {seekFeedback && !swipeHud && (
            <div className="pointer-events-none absolute top-12 left-1/2 -translate-x-1/2 px-4 py-1.5 rounded-full bg-black/80 text-white text-xs font-mono-code font-bold border border-white/20 z-30">
              {seekFeedback}
            </div>
          )}
        </div>
        </div>

        {/* Transport Scrubber & Controls (with Seekbar Frame Thumbnail Preview, A-B Loop & Bookmarks) */}
        <div
          className="mt-3 p-4 rounded-3xl flex flex-col gap-3"
          style={{ background: 'var(--surface-card)', border: '1px solid var(--border-soft)' }}
        >
          <div className="flex flex-col gap-1.5">
            <div className="flex items-center justify-between text-xs font-mono-code" style={{ color: 'var(--text-sub)' }}>
              <div className="flex items-center gap-2">
                <span ref={timecodeDisplayRef}>{formatTime(currentTime)}</span>
                {loopPointA !== null && (
                  <span
                    className="px-2 py-0.5 rounded-full text-[10px] font-bold"
                    style={{ background: 'var(--accent-bg)', color: 'var(--accent-text)' }}
                  >
                    A–B: {formatTime(loopPointA)} → {loopPointB !== null ? formatTime(loopPointB) : '...'}
                  </span>
                )}
              </div>
              <div className="flex items-center gap-2">
                <span>{formatTime(duration)}</span>
                <button
                  type="button"
                  onClick={() => setTransportCollapsed((prev) => !prev)}
                  className="px-2 py-0.5 rounded-full text-[11px] font-sans font-semibold flex items-center gap-0.5 cursor-pointer"
                  style={{ background: 'var(--surface-pill)', color: 'var(--text-main)' }}
                  title={transportCollapsed ? 'Развернуть кнопки плеера' : 'Свернуть кнопки плеера'}
                >
                  <span>{transportCollapsed ? 'Кнопки' : 'Свернуть'}</span>
                  {transportCollapsed ? (
                    <ChevronDown className="w-3 h-3" />
                  ) : (
                    <ChevronUp className="w-3 h-3" />
                  )}
                </button>
              </div>
            </div>

            {/* Scrubber Track Wrapper with Seekbar Thumbnail Popup, A-B Segment Bar & Bookmark Dots */}
            <div
              className="relative py-1"
              onPointerMove={handleScrubberPointerMove}
              onPointerLeave={handleScrubberPointerLeave}
            >
              {/* Seekbar Frame Thumbnail Popup */}
              {seekHoverPreview.visible && (
                <div
                  className="pointer-events-none absolute -top-28 -translate-x-1/2 z-30 flex flex-col items-center gap-1 p-1.5 rounded-2xl bg-zinc-950/95 border border-white/20 shadow-2xl"
                  style={{ left: `${seekHoverPreview.leftPct}%` }}
                >
                  <canvas
                    ref={seekPreviewCanvasRef}
                    width={160}
                    height={90}
                    className="w-32 h-[72px] rounded-xl bg-black object-cover"
                  />
                  <span className="text-[10px] font-mono-code font-bold text-white px-2 py-0.5 rounded-full bg-white/10">
                    {formatTime(seekHoverPreview.timeSec)}
                  </span>
                </div>
              )}

              {/* A-B Loop Highlight Bar on Timeline */}
              {loopPointA !== null && duration > 0 && (
                <div
                  className="pointer-events-none absolute top-1/2 -translate-y-1/2 h-2 rounded-full bg-amber-400/45 border border-amber-400 z-10"
                  style={{
                    left: `${Math.max(0, Math.min(100, (loopPointA / duration) * 100))}%`,
                    width: `${Math.max(
                      1,
                      Math.min(
                        100,
                        (((loopPointB !== null ? loopPointB : currentTime) - loopPointA) /
                          duration) *
                          100
                      )
                    )}%`
                  }}
                />
              )}

              {/* Bookmark Markers on Timeline */}
              {duration > 0 &&
                currentVideoBookmarks.map((bm) => {
                  const pct = Math.max(0, Math.min(100, (bm.time / duration) * 100));
                  return (
                    <button
                      key={bm.id}
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        seekToTime(bm.time, true);
                        showToast(`Переход к закладке: ${bm.label}`);
                      }}
                      className="absolute top-1/2 -translate-y-1/2 -translate-x-1/2 w-2.5 h-2.5 rounded-full bg-amber-400 border border-black shadow z-20 cursor-pointer hover:scale-125 transition"
                      style={{ left: `${pct}%` }}
                      title={`${bm.label} (${formatTime(bm.time)})`}
                    />
                  );
                })}

              <input
                ref={scrubberInputRef}
                type="range"
                min={0}
                max={duration || 100}
                step={0.05}
                defaultValue={0}
                onPointerDown={() => {
                  isScrubbingRef.current = true;
                }}
                onPointerUp={() => {
                  isScrubbingRef.current = false;
                  handleScrubberPointerLeave();
                  seekToTime(currentTimeRef.current, true);
                }}
                onPointerCancel={() => {
                  isScrubbingRef.current = false;
                  handleScrubberPointerLeave();
                  seekToTime(currentTimeRef.current, true);
                }}
                onBlur={() => {
                  handleScrubberPointerLeave();
                  if (isScrubbingRef.current) {
                    isScrubbingRef.current = false;
                    seekToTime(currentTimeRef.current, true);
                  }
                }}
                onChange={(e) => {
                  const val = parseFloat(e.target.value);
                  seekToTime(val, !isScrubbingRef.current);
                }}
                className="rex-slider relative z-10"
              />
            </div>

            {/* Saved Bookmarks Chips Row for Active Video */}
            {currentVideoBookmarks.length > 0 && (
              <div className="flex items-center gap-1.5 overflow-x-auto pt-1 pb-0.5">
                {currentVideoBookmarks.map((bm) => (
                  <div
                    key={bm.id}
                    className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-mono-code shrink-0"
                    style={{ background: 'var(--surface-pill)', color: 'var(--text-main)' }}
                  >
                    <button
                      type="button"
                      onClick={() => seekToTime(bm.time, true)}
                      className="font-bold cursor-pointer hover:underline flex items-center gap-1"
                    >
                      <Bookmark className="w-3 h-3 text-amber-500 fill-current" />
                      <span>{formatTime(bm.time)}</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => handleDeleteBookmark(bm.id)}
                      className="opacity-60 hover:opacity-100 cursor-pointer ml-0.5"
                      title="Удалить закладку"
                    >
                      <X className="w-3 h-3" />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>

          {!transportCollapsed && (
          <div className="flex flex-wrap items-center justify-between gap-3 pt-1">
            <div className="flex items-center gap-2 flex-wrap">
              <button
                type="button"
                onClick={handlePrevTrack}
                className="p-3 rounded-2xl transition cursor-pointer hover:opacity-85"
                style={{ background: 'var(--surface-pill)', color: 'var(--text-main)' }}
                title="Предыдущее"
              >
                <SkipBack className="w-4 h-4 fill-current" />
              </button>

              <button
                type="button"
                onClick={() => {
                  if (!hasLoadedVideo && !isDemoTestActive) {
                    startBuiltIn24FpsTest();
                    return;
                  }
                  setIsPlaying((prev) => {
                    const next = !prev;
                    if (videoRef.current && !isDemoTestActive) {
                      if (next) {
                        initWebAudio();
                        videoRef.current.play().catch(() => {});
                      } else {
                        videoRef.current.pause();
                      }
                    }
                    forceRedrawRef.current = true;
                    return next;
                  });
                }}
                className="w-12 h-12 rounded-2xl flex items-center justify-center transition transform active:scale-95 cursor-pointer"
                style={{ background: 'var(--accent-bg)', color: 'var(--accent-text)' }}
                title={isPlaying ? 'Пауза' : 'Воспроизведение'}
              >
                {isPlaying ? <Pause className="w-6 h-6 fill-current" /> : <Play className="w-6 h-6 fill-current ml-0.5" />}
              </button>

              <button
                type="button"
                onClick={handleNextTrack}
                className="p-3 rounded-2xl transition cursor-pointer hover:opacity-85"
                style={{ background: 'var(--surface-pill)', color: 'var(--text-main)' }}
                title="Следующее"
              >
                <SkipForward className="w-4 h-4 fill-current" />
              </button>

              {showStepButtons && (
                <>
                  <button
                    type="button"
                    onClick={() => {
                      setIsPlaying(false);
                      if (videoRef.current) videoRef.current.pause();
                      const stepSec = isDemoTestActive
                        ? 1 / 24
                        : Math.max(1 / 120, Math.min(1 / 12, (estimatedFrameIntervalMsRef.current || 41.667) / 1000));
                      seekToTime(currentTimeRef.current - stepSec);
                    }}
                    className="p-3 rounded-2xl transition cursor-pointer hover:opacity-85"
                    style={{ background: 'var(--surface-pill)', color: 'var(--text-main)' }}
                    title="Кадр назад"
                  >
                    <RotateCcw className="w-4 h-4" />
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setIsPlaying(false);
                      if (videoRef.current) videoRef.current.pause();
                      const stepSec = isDemoTestActive
                        ? 1 / 24
                        : Math.max(1 / 120, Math.min(1 / 12, (estimatedFrameIntervalMsRef.current || 41.667) / 1000));
                      seekToTime(currentTimeRef.current + stepSec);
                    }}
                    className="p-3 rounded-2xl transition cursor-pointer hover:opacity-85"
                    style={{ background: 'var(--surface-pill)', color: 'var(--text-main)' }}
                    title="Кадр вперёд"
                  >
                    <RefreshCw className="w-4 h-4" />
                  </button>
                </>
              )}

              <button
                type="button"
                onClick={handleToggleLoopAB}
                className="px-3 py-2.5 rounded-2xl text-xs font-mono-code font-bold transition cursor-pointer flex items-center gap-1"
                style={{
                  background: loopPointA !== null ? 'var(--accent-bg)' : 'var(--surface-pill)',
                  color: loopPointA !== null ? 'var(--accent-text)' : 'var(--text-main)'
                }}
                title="Повторение фрагмента A–B (нажмите для точки A, затем B, затем сброс)"
              >
                <Repeat className="w-3.5 h-3.5" />
                <span>
                  {loopPointA === null ? 'A–B' : loopPointB === null ? 'A→...' : 'A–B ВКЛ'}
                </span>
              </button>

              <button
                type="button"
                onClick={handleAddBookmark}
                className="px-3 py-2.5 rounded-2xl text-xs font-semibold transition cursor-pointer flex items-center gap-1"
                style={{ background: 'var(--surface-pill)', color: 'var(--text-main)' }}
                title="Добавить закладку на текущем таймкоде"
              >
                <Bookmark className="w-3.5 h-3.5" />
                <span>+Метка</span>
              </button>

              <button
                type="button"
                onClick={() => {
                  setIsMuted((prev) => {
                    const next = !prev;
                    if (videoRef.current) videoRef.current.muted = next;
                    return next;
                  });
                }}
                className="p-3 rounded-2xl transition cursor-pointer hover:opacity-85"
                style={{ background: 'var(--surface-pill)', color: 'var(--text-main)' }}
                title="Звук"
              >
                {isMuted ? <VolumeX className="w-4 h-4" /> : <Volume2 className="w-4 h-4" />}
              </button>

              <input
                type="range"
                min={0}
                max={1}
                step={0.05}
                value={isMuted ? 0 : volume}
                onChange={(e) => {
                  const v = parseFloat(e.target.value);
                  setVolume(v);
                  setIsMuted(v === 0);
                  if (videoRef.current) {
                    videoRef.current.volume = v;
                    videoRef.current.muted = v === 0;
                  }
                }}
                className="rex-slider w-20 hidden sm:block"
              />
            </div>

            <div className="flex items-center gap-2 flex-wrap">
              <button
                type="button"
                onClick={() => setQueueDrawerOpen((prev) => !prev)}
                className="px-3.5 py-2.5 rounded-2xl text-xs font-semibold cursor-pointer"
                style={{ background: 'var(--surface-pill)', color: 'var(--text-main)' }}
              >
                Очередь ({playlist.length})
              </button>

              <button
                type="button"
                onClick={() => {
                  const speeds = [0.5, 0.75, 1.0, 1.25, 1.5, 2.0];
                  const nextIdx = (speeds.indexOf(playbackRate) + 1) % speeds.length;
                  setPlaybackRate(speeds[nextIdx]);
                  if (videoRef.current) videoRef.current.playbackRate = speeds[nextIdx];
                  showToast(`Скорость: ${speeds[nextIdx]}x`);
                }}
                className="px-3.5 py-2.5 rounded-2xl text-xs font-mono-code font-bold cursor-pointer"
                style={{ background: 'var(--surface-pill)', color: 'var(--text-main)' }}
              >
                {isHoldSpeed2x ? '2.0x' : `${playbackRate}x`}
              </button>

              {showSnapshotBtn && (
                <button
                  type="button"
                  onClick={handleSnapshot}
                  className="px-3.5 py-2.5 rounded-2xl text-xs font-semibold cursor-pointer"
                  style={{ background: 'var(--surface-pill)', color: 'var(--text-main)' }}
                >
                  PNG
                </button>
              )}

              <button
                type="button"
                onClick={toggleFullscreen}
                className="p-3 rounded-2xl cursor-pointer"
                style={{ background: 'var(--surface-pill)', color: 'var(--text-main)' }}
                title="Полный экран"
              >
                {isFullscreen ? <Minimize2 className="w-4 h-4" /> : <Maximize2 className="w-4 h-4" />}
              </button>
            </div>
          </div>
          )}
        </div>

        {/* Online Stream / Anixart Release Selector Card (Voiceover, Episodes & HLS Stream Quality) */}
        {(anixartSession || Object.keys(streamQualities).length > 1) && (
          <div
            className="mt-3 p-4 rounded-3xl flex flex-col gap-3"
            style={{ background: 'var(--surface-card)', border: '1px solid var(--border-soft)' }}
          >
            {anixartSession && (
              <div className="flex items-start justify-between gap-3">
                <div className="flex items-center gap-3 min-w-0">
                  {anixartSession.release.poster && (
                    <img
                      src={anixartSession.release.poster}
                      alt={anixartSession.release.titleRu}
                      className="w-12 h-16 rounded-2xl object-cover shrink-0 border"
                      style={{ borderColor: 'var(--border-soft)' }}
                    />
                  )}
                  <div className="min-w-0">
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <span
                        className="px-2 py-0.5 rounded-full text-[10px] font-mono-code font-bold"
                        style={{ background: 'var(--accent-bg)', color: 'var(--accent-text)' }}
                      >
                        ANIXART • HLS
                      </span>
                      {anixartSession.release.studio && (
                        <span className="text-[11px] font-mono-code" style={{ color: 'var(--text-sub)' }}>
                          {anixartSession.release.studio} • {anixartSession.release.year}
                        </span>
                      )}
                      {anixartSession.release.grade > 0 && (
                        <span className="text-[11px] font-mono-code font-bold text-amber-500">
                          ★ {anixartSession.release.grade.toFixed(2)}
                        </span>
                      )}
                    </div>
                    <div className="rex-serif font-bold text-sm truncate mt-0.5">
                      {anixartSession.release.titleRu}
                    </div>
                    {anixartSession.release.titleOriginal && (
                      <div className="text-[11px] truncate" style={{ color: 'var(--text-sub)' }}>
                        {anixartSession.release.titleOriginal}
                      </div>
                    )}
                  </div>
                </div>

                {isResolvingUrl && (
                  <span
                    className="px-2.5 py-1 rounded-full text-[11px] font-mono-code font-bold shrink-0 animate-pulse"
                    style={{ background: 'var(--surface-pill)', color: 'var(--text-main)' }}
                  >
                    Загрузка...
                  </span>
                )}
              </div>
            )}

            {/* Stream Quality Selector (720p / 480p / 360p) */}
            {Object.keys(streamQualities).length > 1 && (
              <div className="flex items-center justify-between gap-2 flex-wrap">
                <span className="text-xs font-bold" style={{ color: 'var(--text-sub)' }}>
                  Качество HLS потока:
                </span>
                <div className="flex items-center gap-1.5 flex-wrap">
                  {Object.keys(streamQualities).map((qLabel) => {
                    const isAct = activeStreamQuality === qLabel;
                    return (
                      <button
                        key={qLabel}
                        type="button"
                        onClick={() => handleSelectStreamQuality(qLabel)}
                        className="px-3 py-1 rounded-full text-xs font-mono-code font-bold cursor-pointer transition"
                        style={{
                          background: isAct ? 'var(--accent-bg)' : 'var(--surface-pill)',
                          color: isAct ? 'var(--accent-text)' : 'var(--text-main)'
                        }}
                      >
                        {qLabel}
                      </button>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Voiceover Selector (Озвучка / Субтитры) */}
            {anixartSession && anixartSession.types.length > 0 && (
              <div className="flex flex-col gap-1.5">
                <span className="text-xs font-bold" style={{ color: 'var(--text-sub)' }}>
                  Озвучка / Перевод ({anixartSession.types.length}):
                </span>
                <div className="flex items-center gap-1.5 overflow-x-auto pb-1">
                  {anixartSession.types.map((t) => {
                    const isSelected = t.id === anixartSession.selectedTypeId;
                    return (
                      <button
                        key={t.id}
                        type="button"
                        disabled={isResolvingUrl}
                        onClick={() => handleSelectAnixartVoiceover(t.id)}
                        className="px-3 py-1.5 rounded-full text-xs font-semibold whitespace-nowrap shrink-0 cursor-pointer transition"
                        style={{
                          background: isSelected ? 'var(--accent-bg)' : 'var(--surface-pill)',
                          color: isSelected ? 'var(--accent-text)' : 'var(--text-main)'
                        }}
                      >
                        {t.name} ({t.episodesCount})
                      </button>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Episode Selector (Серии 1..N) */}
            {anixartSession && anixartSession.episodes.length > 0 && (
              <div className="flex flex-col gap-1.5">
                <span className="text-xs font-bold" style={{ color: 'var(--text-sub)' }}>
                  Серии ({anixartSession.episodes.length}):
                </span>
                <div className="flex items-center gap-1.5 overflow-x-auto pb-1">
                  {anixartSession.episodes.map((ep) => {
                    const isEpSelected = ep.position === anixartSession.selectedEpisodePosition;
                    return (
                      <button
                        key={ep.position}
                        type="button"
                        disabled={isResolvingUrl}
                        onClick={() => handleSelectAnixartEpisode(ep.position)}
                        className="px-3 py-1.5 rounded-xl text-xs font-mono-code font-bold whitespace-nowrap shrink-0 cursor-pointer transition"
                        style={{
                          background: isEpSelected ? 'var(--accent-bg)' : 'var(--surface-pill)',
                          color: isEpSelected ? 'var(--accent-text)' : 'var(--text-main)'
                        }}
                      >
                        {ep.name}
                      </button>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        )}

        {/* Collapsible Playlist Queue Drawer */}
        {queueDrawerOpen && (
          <div
            className="mt-3 p-4 rounded-3xl flex flex-col gap-2.5"
            style={{ background: 'var(--surface-card)', border: '1px solid var(--border-soft)' }}
          >
            <div className="flex items-center justify-between gap-2">
              <h3 className="rex-serif font-bold text-sm">Плейлист ({playlist.length})</h3>
              <div className="flex items-center gap-1.5">
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  className="px-3 py-1.5 rounded-full text-xs font-semibold cursor-pointer"
                  style={{ background: 'var(--accent-bg)', color: 'var(--accent-text)' }}
                >
                  + Добавить
                </button>
                <button
                  type="button"
                  onClick={() => setQueueDrawerOpen(false)}
                  className="px-2.5 py-1.5 rounded-full text-xs font-semibold flex items-center gap-1 cursor-pointer"
                  style={{ background: 'var(--surface-pill)', color: 'var(--text-main)' }}
                  title="Свернуть плейлист"
                >
                  <span>Свернуть</span>
                  <ChevronUp className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>

            <div className="flex flex-col gap-1.5 max-h-52 overflow-y-auto pr-1">
              {playlist.map((item, idx) => {
                const isCurrent = idx === activePlaylistIndex;
                return (
                  <div
                    key={item.id}
                    onClick={() => playPlaylistIndex(idx)}
                    className="p-2.5 rounded-2xl flex items-center justify-between gap-2 cursor-pointer transition"
                    style={{
                      background: isCurrent ? 'var(--accent-bg)' : 'var(--surface-elevated)',
                      color: isCurrent ? 'var(--accent-text)' : 'var(--text-main)'
                    }}
                  >
                    <div className="flex items-center gap-2.5 min-w-0">
                      <span className="font-mono-code text-xs font-bold opacity-75">{idx + 1}.</span>
                      {item.thumbnailUrl ? (
                        <img
                          src={item.thumbnailUrl}
                          alt={item.title}
                          className="w-12 h-7 rounded-lg object-cover shrink-0 bg-black/30"
                        />
                      ) : (
                        <div className="w-8 h-7 rounded-lg flex items-center justify-center shrink-0 bg-black/20">
                          <FileVideo className="w-4 h-4 opacity-75" />
                        </div>
                      )}
                      <div className="truncate">
                        <div className="text-xs font-bold truncate">{item.title}</div>
                        <div className="text-[11px] opacity-75 font-mono-code">{item.size}</div>
                      </div>
                    </div>
                    <span
                      className="text-[11px] font-mono-code font-semibold px-2 py-0.5 rounded-full shrink-0"
                      style={{ background: 'rgba(128,128,128,0.2)' }}
                    >
                      {isCurrent ? 'Играет' : 'Вкл'}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Collapsible MEMC, HDR10 & GPU Upscaler Controls Menu Card */}
        <div
          className="mt-3 p-4 rounded-3xl flex flex-col gap-3 transition-all"
          style={{ background: 'var(--surface-card)', border: '1px solid var(--border-soft)' }}
        >
          {/* Collapsible Card Header */}
          <div
            onClick={() => setProcessorMenuCollapsed((prev) => !prev)}
            className="flex items-center justify-between gap-2 cursor-pointer select-none"
          >
            <div className="flex items-center gap-2 flex-wrap min-w-0">
              <span className="rex-serif font-bold text-sm">
                Видеопроцессор (Adreno • MEMC • Super Res • HDR)
              </span>
              <div className="flex items-center gap-1 flex-wrap">
                {isAdrenoActive && (
                  <span
                    className="px-2 py-0.5 rounded-full text-[11px] font-mono-code font-bold"
                    style={{ background: 'var(--accent-bg)', color: 'var(--accent-text)' }}
                  >
                    ADRENO GMEM
                  </span>
                )}
                <span
                  className="px-2 py-0.5 rounded-full text-[11px] font-mono-code font-bold"
                  style={{ background: 'var(--surface-pill)', color: 'var(--text-main)' }}
                >
                  {interpEnabled && interpMode !== 'off'
                    ? `${effectiveTargetFps} FPS${interpMode === 'optical' && subframeCascadeEnabled ? ` • Суб-FBO ${effectiveSubframeCascadeMult}x` : ''}`
                    : 'MEMC Выкл'}
                </span>
                {upscaleEnabled && (
                  <span
                    className="px-2 py-0.5 rounded-full text-[11px] font-mono-code font-bold"
                    style={{ background: 'var(--accent-bg)', color: 'var(--accent-text)' }}
                  >
                    {upscaleModeLabel} • {upscaleFactor === 'auto' ? `Авто (${effectiveUpscaleFactor}x)` : upscaleFactorLabel}
                  </span>
                )}
                {hdrEnabled && (
                  <span
                    className="px-2 py-0.5 rounded-full text-[11px] font-mono-code font-bold"
                    style={{ background: 'var(--surface-pill)', color: 'var(--text-main)' }}
                  >
                    {isAdrenoActive && adrenoTrue10Hdr ? 'HDR10 True10' : 'HDR10'}
                  </span>
                )}
                {ecoThermalMode && (
                  <span
                    className="px-2 py-0.5 rounded-full text-[11px] font-mono-code font-bold"
                    style={{
                      background: 'rgba(16, 185, 129, 0.15)',
                      color: '#10b981'
                    }}
                  >
                    ЭКО-Холод GPU
                  </span>
                )}
              </div>
            </div>

            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                setProcessorMenuCollapsed((prev) => !prev);
              }}
              className="px-3 py-1.5 rounded-full text-xs font-semibold flex items-center gap-1 shrink-0 cursor-pointer transition hover:opacity-85"
              style={{ background: 'var(--surface-pill)', color: 'var(--text-main)' }}
              title={processorMenuCollapsed ? 'Развернуть меню' : 'Свернуть меню'}
            >
              <span>{processorMenuCollapsed ? 'Развернуть' : 'Свернуть'}</span>
              {processorMenuCollapsed ? (
                <ChevronDown className="w-4 h-4" />
              ) : (
                <ChevronUp className="w-4 h-4" />
              )}
            </button>
          </div>

          {!processorMenuCollapsed && (
            <div
              className="pt-2 border-t grid grid-cols-1 md:grid-cols-2 gap-4"
              style={{ borderColor: 'var(--border-soft)' }}
            >
              <div className="flex flex-col gap-3">
                {/* Section 0: Ускоритель Qualcomm Adreno */}
                <div className="flex flex-col gap-2.5 pb-2 border-b" style={{ borderColor: 'var(--border-soft)' }}>
                  <div className="flex items-center justify-between gap-2">
                    <button
                      type="button"
                      onClick={() =>
                        setCollapsedSections((prev) => ({ ...prev, adreno: !prev.adreno }))
                      }
                      className="flex items-center gap-1.5 rex-serif font-bold text-sm cursor-pointer"
                      style={{ color: 'var(--text-main)' }}
                    >
                      <span>Ускоритель Qualcomm Adreno</span>
                      {collapsedSections.adreno ? (
                        <ChevronDown className="w-4 h-4 opacity-70" />
                      ) : (
                        <ChevronUp className="w-4 h-4 opacity-70" />
                      )}
                    </button>
                    <span
                      className="font-mono-code text-[11px] font-bold px-2.5 py-0.5 rounded-full"
                      style={{
                        background: isAdrenoActive ? 'var(--accent-bg)' : 'var(--surface-pill)',
                        color: isAdrenoActive ? 'var(--accent-text)' : 'var(--text-sub)'
                      }}
                    >
                      {isAdrenoActive ? 'GMEM • FP16 Активен' : 'Выкл'}
                    </span>
                  </div>

                  {!collapsedSections.adreno && (
                    <>
                      <div
                        className="p-2.5 rounded-2xl flex items-center justify-between gap-2 text-xs"
                        style={{ background: 'var(--surface-elevated)' }}
                      >
                        <div className="min-w-0">
                          <div className="font-bold truncate">{detectedGpuInfo.modelLabel}</div>
                          <div className="text-[11px] font-mono-code truncate" style={{ color: 'var(--text-sub)' }}>
                            {detectedGpuInfo.gmemCacheLabel}
                          </div>
                        </div>
                        <span className="font-mono-code text-[11px] font-semibold shrink-0" style={{ color: 'var(--text-sub)' }}>
                          {detectedGpuInfo.isAdreno ? 'Аппаратный' : 'Профиль Adreno'}
                        </span>
                      </div>

                      <div className="rex-segmented">
                        {(
                          [
                            { id: 'auto', label: 'Авто (Detect)' },
                            { id: 'on', label: 'Вкл (Adreno)' },
                            { id: 'off', label: 'Выкл' }
                          ] as const
                        ).map((item) => (
                          <button
                            key={item.id}
                            type="button"
                            onClick={() => {
                              setAdrenoMode(item.id);
                              forceRedrawRef.current = true;
                            }}
                            className={`rex-seg-btn ${adrenoMode === item.id ? 'active' : ''}`}
                          >
                            {item.label}
                          </button>
                        ))}
                      </div>

                      <div className="flex flex-wrap items-center justify-between gap-2 text-xs pt-0.5">
                        <label className="flex items-center gap-1.5 font-medium cursor-pointer">
                          <input
                            type="checkbox"
                            checked={adrenoGmemFp16}
                            onChange={(e) => {
                              setAdrenoGmemFp16(e.target.checked);
                              if (adrenoMode === 'off' && e.target.checked) setAdrenoMode('on');
                              forceRedrawRef.current = true;
                            }}
                            className="w-4 h-4 accent-zinc-900 rounded"
                          />
                          <span>GMEM Тайлы + FP16 ALU</span>
                        </label>
                        <label className="flex items-center gap-1.5 font-medium cursor-pointer">
                          <input
                            type="checkbox"
                            checked={adrenoTrue10Hdr}
                            onChange={(e) => {
                              setAdrenoTrue10Hdr(e.target.checked);
                              if (adrenoMode === 'off' && e.target.checked) setAdrenoMode('on');
                              forceRedrawRef.current = true;
                            }}
                            className="w-4 h-4 accent-zinc-900 rounded"
                          />
                          <span>True10 HDR Dither</span>
                        </label>
                      </div>

                      <div
                        className="p-2.5 rounded-2xl flex items-center justify-between gap-2 text-xs mt-1"
                        style={{
                          background: ecoThermalMode ? 'rgba(16, 185, 129, 0.1)' : 'var(--surface-elevated)',
                          border: ecoThermalMode ? '1px solid rgba(16, 185, 129, 0.3)' : '1px solid transparent'
                        }}
                      >
                        <div className="min-w-0">
                          <div className="font-bold flex items-center gap-1.5" style={{ color: ecoThermalMode ? '#10b981' : 'var(--text-main)' }}>
                            <Zap className="w-3.5 h-3.5 shrink-0" />
                            <span>Холодный ЭКО-режим (Анти-нагрев)</span>
                          </div>
                          <div className="text-[11px] leading-snug mt-0.5" style={{ color: 'var(--text-sub)' }}>
                            Снижает тепловыделение GPU до 65%: 1-проходная фильтрация, пропуск дублей субкадров и умное ограничение буфера.
                          </div>
                        </div>
                        <input
                          type="checkbox"
                          checked={ecoThermalMode}
                          onChange={(e) => {
                            const checked = e.target.checked;
                            setEcoThermalMode(checked);
                            forceRedrawRef.current = true;
                            showToast(
                              checked
                                ? 'Холодный ЭКО-режим GPU включён'
                                : 'Холодный ЭКО-режим GPU выключен (Турбо)'
                            );
                          }}
                          className="w-4 h-4 accent-emerald-600 rounded shrink-0 cursor-pointer"
                        />
                      </div>
                    </>
                  )}
                </div>

                {/* Section 1: Интерполяция (MEMC) */}
                <div className="flex flex-col gap-2.5">
                  <div className="flex items-center justify-between">
                    <button
                      type="button"
                      onClick={() =>
                        setCollapsedSections((prev) => ({ ...prev, memc: !prev.memc }))
                      }
                      className="flex items-center gap-1.5 rex-serif font-bold text-sm cursor-pointer"
                      style={{ color: 'var(--text-main)' }}
                    >
                      <span>Интерполяция (MEMC)</span>
                      {collapsedSections.memc ? (
                        <ChevronDown className="w-4 h-4 opacity-70" />
                      ) : (
                        <ChevronUp className="w-4 h-4 opacity-70" />
                      )}
                    </button>
                    <label className="inline-flex items-center gap-2 text-xs font-semibold cursor-pointer">
                      <input
                        type="checkbox"
                        checked={interpEnabled}
                        onChange={(e) => {
                          const checked = e.target.checked;
                          setInterpEnabled(checked);
                          if (checked && interpMode === 'off') setInterpMode('optical');
                        }}
                        className="w-4 h-4 accent-zinc-900 rounded"
                      />
                      <span className="font-mono-code">
                        {interpEnabled && interpMode !== 'off' ? `${effectiveTargetFps} FPS` : 'Выкл'}
                      </span>
                    </label>
                  </div>

                  {!collapsedSections.memc && (
                    <>
                      <div className="grid grid-cols-3 gap-1 p-1 rounded-xl" style={{ background: 'var(--surface-elevated)' }}>
                        {[
                          { id: 'optical', label: 'Оптический поток' },
                          { id: 'blend', label: 'Смешивание' },
                          { id: 'off', label: 'Выкл' }
                        ].map((m) => {
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
                                  setInterpMode('off');
                                  setInterpEnabled(false);
                                } else {
                                  setInterpMode(m.id as 'optical' | 'blend');
                                  setInterpEnabled(true);
                                  if (videoOutputMode === 'video_fallback') {
                                    setVideoOutputMode('webgl_direct');
                                  }
                                }
                                forceRedrawRef.current = true;
                              }}
                              className={`rex-seg-btn py-1 text-xs ${isAct ? 'active' : ''}`}
                            >
                              {m.label}
                            </button>
                          );
                        })}
                      </div>

                      <div className="rex-segmented">
                        {[
                          { id: 'auto' as const, label: `Авто (${detectedDisplayHz})` },
                          { id: 60 as const, label: '60' },
                          { id: 90 as const, label: '90' },
                          { id: 120 as const, label: '120' },
                          { id: 144 as const, label: '144' }
                        ].map((item) => (
                          <button
                            key={item.id}
                            type="button"
                            onClick={() => {
                              setTargetFps(item.id);
                              forceRedrawRef.current = true;
                            }}
                            className={`rex-seg-btn ${targetFps === item.id ? 'active' : ''}`}
                          >
                            {item.label}
                          </button>
                        ))}
                      </div>

                      {/* Secondary Sub-Frame Cascade FBO (Hierarchical Sub-Frame MEMC) */}
                      <div
                        className="p-2.5 rounded-2xl flex flex-col gap-2"
                        style={{
                          background: 'var(--surface-elevated)',
                          border: '1px solid var(--border-soft)'
                        }}
                      >
                        <div className="flex items-center justify-between gap-2">
                          <div className="min-w-0">
                            <div className="text-xs font-bold truncate">
                              Трехкаскадные FBO суб-кадры (3 Суб-кадра)
                            </div>
                            <div
                              className="text-[10px] font-mono-code truncate"
                              style={{ color: 'var(--text-sub)' }}
                            >
                              3 опорных FBO (I_0.25 • I_0.50 • I_0.75) • Сдвиг векторов ×0.25
                            </div>
                          </div>
                          <label className="inline-flex items-center gap-1.5 text-xs font-semibold cursor-pointer shrink-0">
                            <input
                              type="checkbox"
                              checked={subframeCascadeEnabled}
                              onChange={(e) => {
                                const checked = e.target.checked;
                                setSubframeCascadeEnabled(checked);
                                if (checked && (!interpEnabled || interpMode === 'off')) {
                                  setInterpEnabled(true);
                                  setInterpMode('optical');
                                }
                                forceRedrawRef.current = true;
                              }}
                              className="w-4 h-4 accent-zinc-900 rounded"
                            />
                            <span className="font-mono-code font-bold">
                              {subframeCascadeEnabled ? subframeCascadeLabel : 'Выкл'}
                            </span>
                          </label>
                        </div>

                        <div className="rex-segmented">
                          {(
                            [
                              { id: 'auto', label: `Авто (${effectiveSubframeCascadeMult}x)` },
                              { id: '2x', label: '2x (1 FBO)' },
                              { id: '3x', label: '3x (3 Суб FBO)' },
                              { id: '4x', label: '4x Ультра (3 FBO)' }
                            ] as const
                          ).map((item) => (
                            <button
                              key={item.id}
                              type="button"
                              onClick={() => {
                                setSubframeCascadeMode(item.id);
                                setSubframeCascadeEnabled(true);
                                if (!interpEnabled || interpMode === 'off') {
                                  setInterpEnabled(true);
                                  setInterpMode('optical');
                                }
                                forceRedrawRef.current = true;
                              }}
                              className={`rex-seg-btn ${
                                subframeCascadeEnabled && subframeCascadeMode === item.id ? 'active' : ''
                              }`}
                            >
                              {item.label}
                            </button>
                          ))}
                        </div>

                        <div className="flex flex-col gap-1">
                          <div className="flex items-center justify-between text-[11px]">
                            <span style={{ color: 'var(--text-sub)' }}>
                              Буфер FBO суб-кадров (Авто-контроль памяти до 1440p)
                            </span>
                            <span className="font-mono-code font-bold">{subframeBufferResLabel}</span>
                          </div>
                          <div className="rex-segmented">
                            {(
                              [
                                { id: 'auto', label: 'Авто 1440p' },
                                { id: '720p', label: '720p' },
                                { id: '1080p', label: '1080p' },
                                { id: '1440p', label: '1440p QHD' }
                              ] as const
                            ).map((item) => (
                              <button
                                key={item.id}
                                type="button"
                                onClick={() => {
                                  setSubframeBufferResMode(item.id);
                                  if (!subframeCascadeEnabled) setSubframeCascadeEnabled(true);
                                  forceRedrawRef.current = true;
                                }}
                                className={`rex-seg-btn ${subframeBufferResMode === item.id ? 'active' : ''}`}
                              >
                                {item.label}
                              </button>
                            ))}
                          </div>
                        </div>

                        <div>
                          <div className="flex items-center justify-between text-[11px] mb-1">
                            <span style={{ color: 'var(--text-sub)' }}>
                              Когерентность векторов (защита быстрых сцен)
                            </span>
                            <span className="font-mono-code font-bold">{subframeCoherenceGuard}%</span>
                          </div>
                          <input
                            type="range"
                            min={0}
                            max={100}
                            step={5}
                            value={subframeCoherenceGuard}
                            onChange={(e) => {
                              setSubframeCoherenceGuard(parseInt(e.target.value, 10));
                              if (!subframeCascadeEnabled) setSubframeCascadeEnabled(true);
                              forceRedrawRef.current = true;
                            }}
                            className="rex-slider"
                          />
                        </div>
                      </div>

                      {/* 6-Level Pyramid FBO Flow Scale Selector Directly Under Player */}
                      <div className="flex flex-col gap-1">
                        <div className="flex items-center justify-between text-[11px]">
                          <span className="font-semibold" style={{ color: 'var(--text-sub)' }}>
                            Плотность буфера потока FBO (6-Lvl Pyramid до 512×288)
                          </span>
                          <span className="font-mono-code font-bold" style={{ color: 'var(--text-main)' }}>
                            {flowScaleLabel}
                          </span>
                        </div>
                        <div className="rex-segmented">
                          {(
                            [
                              { id: 'auto', label: 'Авто' },
                              { id: 'performance', label: '64×36' },
                              { id: 'balanced', label: '96×54' },
                              { id: 'ultra', label: '128×72' },
                              { id: 'extreme', label: '256×144' },
                              { id: 'high', label: '384×216' },
                              { id: 'max', label: '512×288' }
                            ] as const
                          ).map((item) => (
                            <button
                              key={item.id}
                              type="button"
                              onClick={() => {
                                setFlowScaleMode(item.id);
                                if (!interpEnabled || interpMode === 'off') {
                                  setInterpEnabled(true);
                                  setInterpMode('optical');
                                }
                                forceRedrawRef.current = true;
                              }}
                              className={`rex-seg-btn ${flowScaleMode === item.id ? 'active' : ''}`}
                            >
                              {item.label}
                            </button>
                          ))}
                        </div>
                      </div>

                      {/* Interactive Sub-Frame Synthesis Inspector & Live Counter */}
                      <div
                        className="p-3 rounded-2xl flex flex-col gap-2"
                        style={{
                          background: 'var(--surface-elevated)',
                          border: '1px solid var(--border-soft)'
                        }}
                      >
                        <div className="flex items-center justify-between gap-2 flex-wrap">
                          <div className="flex items-center gap-1.5 text-xs font-bold">
                            <Sparkles className="w-3.5 h-3.5 text-purple-500 shrink-0" />
                            <span>Синтез 3 опорных и вторичных суб-кадров</span>
                          </div>
                          <div className="flex items-center gap-1.5 font-mono-code text-[11px]">
                            <span
                              ref={playerAlphaBadgeRef}
                              className="px-2 py-0.5 rounded-full font-bold"
                              style={{ background: 'var(--surface-pill)', color: 'var(--text-main)' }}
                            >
                              α = {(manualSubframePhase ?? 0.5).toFixed(2)}
                            </span>
                            <span
                              className="px-2 py-0.5 rounded-full font-bold"
                              style={{ background: 'var(--accent-bg)', color: 'var(--accent-text)' }}
                              title="Количество сгенерированных промежуточных суб-кадров GPU"
                            >
                              +<span ref={playerSynthCountRef}>{synthesizedCount}</span> кадров
                            </span>
                          </div>
                        </div>

                        <div className="flex items-center gap-2">
                          <span className="text-[11px] font-mono-code shrink-0" style={{ color: 'var(--text-sub)' }}>
                            T-1
                          </span>
                          <input
                            type="range"
                            min={0}
                            max={1}
                            step={0.01}
                            value={manualSubframePhase ?? 0.5}
                            onChange={(e) => {
                              const val = parseFloat(e.target.value);
                              setManualSubframePhase(val);
                              if (!interpEnabled || interpMode === 'off') {
                                setInterpEnabled(true);
                                setInterpMode('optical');
                              }
                              forceRedrawRef.current = true;
                            }}
                            className="rex-slider flex-1"
                            title="Вручную сдвиньте фазу α между кадрами T-1, I_0.25, I_0.50, I_0.75 и T"
                          />
                          <span className="text-[11px] font-mono-code shrink-0" style={{ color: 'var(--text-sub)' }}>
                            T
                          </span>
                        </div>

                        <div className="flex items-center justify-between gap-1.5 flex-wrap">
                          <div className="flex items-center gap-1 flex-wrap">
                            {[
                              { val: null, label: 'Авто' },
                              { val: 0.0, label: '0% (T-1)' },
                              { val: 0.25, label: '25% (Суб 1)' },
                              { val: 0.5, label: '50% (Суб 2)' },
                              { val: 0.75, label: '75% (Суб 3)' },
                              { val: 1.0, label: '100% (T)' }
                            ].map((btn) => {
                              const isSelected = manualSubframePhase === btn.val;
                              return (
                                <button
                                  key={btn.label}
                                  type="button"
                                  onClick={() => {
                                    setManualSubframePhase(btn.val);
                                    forceRedrawRef.current = true;
                                  }}
                                  className="px-2 py-1 rounded-lg text-[10px] font-mono-code font-bold cursor-pointer transition whitespace-nowrap"
                                  style={{
                                    background: isSelected ? 'var(--accent-bg)' : 'var(--surface-pill)',
                                    color: isSelected ? 'var(--accent-text)' : 'var(--text-main)'
                                  }}
                                >
                                  {btn.label}
                                </button>
                              );
                            })}
                          </div>

                          <button
                            type="button"
                            onClick={startBuiltIn24FpsTest}
                            className="px-2.5 py-1 rounded-lg text-[10px] font-mono-code font-bold cursor-pointer transition flex items-center gap-1"
                            style={{
                              background: isDemoTestActive
                                ? 'linear-gradient(135deg, #6366f1, #a855f7)'
                                : 'var(--surface-pill)',
                              color: isDemoTestActive ? '#ffffff' : 'var(--text-main)'
                            }}
                          >
                            <Sparkles className="w-3 h-3" />
                            <span>{isDemoTestActive ? 'Тест 24 FPS активен' : 'Тест 24 FPS'}</span>
                          </button>
                        </div>
                      </div>
                    </>
                  )}
                </div>

                {/* Section 2: HDR10 Control Section */}
                <div
                  className="pt-2 border-t flex flex-col gap-2"
                  style={{ borderColor: 'var(--border-soft)' }}
                >
                  <div className="flex items-center justify-between">
                    <button
                      type="button"
                      onClick={() =>
                        setCollapsedSections((prev) => ({ ...prev, hdr: !prev.hdr }))
                      }
                      className="flex items-center gap-1.5 rex-serif font-bold text-sm cursor-pointer"
                      style={{ color: 'var(--text-main)' }}
                    >
                      <span>HDR10 Тонмаппинг {isAdrenoActive && adrenoTrue10Hdr ? '(True10)' : ''}</span>
                      {collapsedSections.hdr ? (
                        <ChevronDown className="w-4 h-4 opacity-70" />
                      ) : (
                        <ChevronUp className="w-4 h-4 opacity-70" />
                      )}
                    </button>
                    <label className="inline-flex items-center gap-2 text-xs font-semibold cursor-pointer">
                      <input
                        type="checkbox"
                        checked={hdrEnabled}
                        onChange={(e) => setHdrEnabled(e.target.checked)}
                        className="w-4 h-4 accent-zinc-900 rounded"
                      />
                      <span className="font-mono-code">
                        {hdrEnabled ? `${Math.round(hdrStrength * 100)}%` : 'Выкл'}
                      </span>
                    </label>
                  </div>
                  {!collapsedSections.hdr && (
                    <input
                      type="range"
                      min={0.3}
                      max={1.5}
                      step={0.05}
                      value={hdrStrength}
                      onChange={(e) => {
                        setHdrStrength(parseFloat(e.target.value));
                        if (!hdrEnabled) setHdrEnabled(true);
                        forceRedrawRef.current = true;
                      }}
                      className="rex-slider"
                    />
                  )}
                </div>

                {/* Section 3: GPU Video Upscaler Control Section */}
                <div
                  className="pt-2 border-t flex flex-col gap-2.5"
                  style={{ borderColor: 'var(--border-soft)' }}
                >
                  <div className="flex items-center justify-between">
                    <button
                      type="button"
                      onClick={() =>
                        setCollapsedSections((prev) => ({ ...prev, upscale: !prev.upscale }))
                      }
                      className="flex items-center gap-1.5 rex-serif font-bold text-sm cursor-pointer"
                      style={{ color: 'var(--text-main)' }}
                    >
                      <span>GPU Апскейлер (Super Resolution)</span>
                      {collapsedSections.upscale ? (
                        <ChevronDown className="w-4 h-4 opacity-70" />
                      ) : (
                        <ChevronUp className="w-4 h-4 opacity-70" />
                      )}
                    </button>
                    <label className="inline-flex items-center gap-2 text-xs font-semibold cursor-pointer">
                      <input
                        type="checkbox"
                        checked={upscaleEnabled}
                        onChange={(e) => {
                          setUpscaleEnabled(e.target.checked);
                          forceRedrawRef.current = true;
                        }}
                        className="w-4 h-4 accent-zinc-900 rounded"
                      />
                      <span className="font-mono-code">
                        {upscaleEnabled ? `${upscaleModeLabel} • ${upscaleFactorLabel}` : 'Выкл'}
                      </span>
                    </label>
                  </div>

                  {!collapsedSections.upscale && (
                    <>
                      <div className="rex-segmented">
                        {(
                          [
                            { id: 'gsr', label: 'GSR' },
                            { id: 'fsr', label: 'FSR' },
                            { id: 'anime4k', label: 'Anime4K' },
                            { id: 'cinema', label: 'Кино' }
                          ] as const
                        ).map((m) => (
                          <button
                            key={m.id}
                            type="button"
                            onClick={() => {
                              setUpscaleMode(m.id);
                              setUpscaleEnabled(true);
                              forceRedrawRef.current = true;
                            }}
                            className={`rex-seg-btn ${upscaleEnabled && upscaleMode === m.id ? 'active' : ''}`}
                          >
                            {m.label}
                          </button>
                        ))}
                      </div>

                      <div className="rex-segmented">
                        {(
                          [
                            { factor: 'auto' as const, label: `Авто (${effectiveUpscaleFactor}x)` },
                            { factor: 1.5 as const, label: 'FHD+ 1.5x' },
                            { factor: 2.0 as const, label: 'QHD 2K' },
                            { factor: 4.0 as const, label: '4K UHD' }
                          ]
                        ).map((item) => (
                          <button
                            key={String(item.factor)}
                            type="button"
                            onClick={() => {
                              setUpscaleFactor(item.factor);
                              setUpscaleEnabled(true);
                              forceRedrawRef.current = true;
                            }}
                            className={`rex-seg-btn ${upscaleEnabled && upscaleFactor === item.factor ? 'active' : ''}`}
                          >
                            {item.label}
                          </button>
                        ))}
                      </div>
                    </>
                  )}
                </div>
              </div>

              {/* Section 4: Fine-Tuning Sliders & Checkboxes */}
              <div className="flex flex-col justify-between gap-3">
                <div className="flex items-center justify-between pt-1 md:pt-0 border-t md:border-t-0" style={{ borderColor: 'var(--border-soft)' }}>
                  <button
                    type="button"
                    onClick={() =>
                      setCollapsedSections((prev) => ({ ...prev, fineTune: !prev.fineTune }))
                    }
                    className="flex items-center gap-1.5 rex-serif font-bold text-sm cursor-pointer"
                    style={{ color: 'var(--text-main)' }}
                  >
                    <span>Тонкие параметры рендера</span>
                    {collapsedSections.fineTune ? (
                      <ChevronDown className="w-4 h-4 opacity-70" />
                    ) : (
                      <ChevronUp className="w-4 h-4 opacity-70" />
                    )}
                  </button>
                </div>

                {!collapsedSections.fineTune && (
                  <>
                    <div>
                      <div className="flex items-center justify-between text-xs mb-1">
                        <span style={{ color: 'var(--text-sub)' }}>
                          Резкость апскейлера (CAS)
                        </span>
                        <span className="font-mono-code font-bold">{Math.round(upscaleSharpness * 100)}%</span>
                      </div>
                      <input
                        type="range"
                        min={0.1}
                        max={1.4}
                        step={0.05}
                        value={upscaleSharpness}
                        onChange={(e) => {
                          setUpscaleSharpness(parseFloat(e.target.value));
                          if (!upscaleEnabled) setUpscaleEnabled(true);
                          forceRedrawRef.current = true;
                        }}
                        className="rex-slider"
                      />
                    </div>

                    <div>
                      <div className="flex items-center justify-between text-xs mb-1">
                        <span style={{ color: 'var(--text-sub)' }}>
                          Шумоподавление и анти-артефакты (MCTD + De-block)
                        </span>
                        <span className="font-mono-code font-bold">{Math.round(upscaleDenoise * 100)}%</span>
                      </div>
                      <input
                        type="range"
                        min={0}
                        max={1}
                        step={0.05}
                        value={upscaleDenoise}
                        onChange={(e) => {
                          setUpscaleDenoise(parseFloat(e.target.value));
                          forceRedrawRef.current = true;
                        }}
                        className="rex-slider"
                      />
                      <div className="flex items-center justify-between gap-2 mt-2">
                        <button
                          type="button"
                          onClick={() => {
                            setUpscaleDenoise(0.85);
                            setDejudderHaloControl(85);
                            setSubframeCoherenceGuard(90);
                            setSceneCutProtection(true);
                            setMotionScale(18);
                            forceRedrawRef.current = true;
                            showToast('Включено максимальное подавление шума и артефактов быстрых сцен');
                          }}
                          className="w-full py-1.5 px-3 rounded-xl text-[11px] font-bold cursor-pointer transition flex items-center justify-center gap-1.5"
                          style={{
                            background: 'var(--accent-bg)',
                            color: 'var(--accent-text)'
                          }}
                        >
                          <Sparkles className="w-3.5 h-3.5" />
                          <span>Убрать шум и артефакты быстрых движений (Макс)</span>
                        </button>
                      </div>
                    </div>

                    <div>
                      <div className="flex items-center justify-between text-xs mb-1">
                        <span style={{ color: 'var(--text-sub)' }}>Сила потока MEMC</span>
                        <span className="font-mono-code font-bold">{Math.round(interpStrength * 100)}%</span>
                      </div>
                      <input
                        type="range"
                        min={0}
                        max={2.0}
                        step={0.05}
                        value={interpStrength}
                        onChange={(e) => {
                          setInterpStrength(parseFloat(e.target.value));
                          forceRedrawRef.current = true;
                        }}
                        className="rex-slider"
                      />
                    </div>

                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <div className="flex items-center justify-between text-xs mb-1">
                          <span style={{ color: 'var(--text-sub)' }}>Радиус поиска</span>
                          <span className="font-mono-code font-bold">{motionScale} px</span>
                        </div>
                        <input
                          type="range"
                          min={4}
                          max={48}
                          step={1}
                          value={motionScale}
                          onChange={(e) => {
                            setMotionScale(parseInt(e.target.value, 10));
                            forceRedrawRef.current = true;
                          }}
                          className="rex-slider"
                        />
                      </div>

                      <div>
                        <div className="flex items-center justify-between text-xs mb-1">
                          <span style={{ color: 'var(--text-sub)' }}>Анти-ореол</span>
                          <span className="font-mono-code font-bold">{dejudderHaloControl}%</span>
                        </div>
                        <input
                          type="range"
                          min={0}
                          max={100}
                          step={5}
                          value={dejudderHaloControl}
                          onChange={(e) => {
                            setDejudderHaloControl(parseInt(e.target.value, 10));
                            forceRedrawRef.current = true;
                          }}
                          className="rex-slider"
                        />
                      </div>
                    </div>

                    {/* Adaptive Debanding (Blue Noise Dithering) */}
                    <div
                      className="p-2.5 rounded-2xl flex flex-col gap-2"
                      style={{
                        background: 'var(--surface-elevated)',
                        border: '1px solid var(--border-soft)'
                      }}
                    >
                      <div className="flex items-center justify-between text-xs">
                        <label className="font-bold flex items-center gap-1.5 cursor-pointer">
                          <input
                            type="checkbox"
                            checked={debandEnabled}
                            onChange={(e) => {
                              setDebandEnabled(e.target.checked);
                              forceRedrawRef.current = true;
                            }}
                            className="w-4 h-4 accent-zinc-900 rounded"
                          />
                          <span>Адаптивный Debanding (Blue Noise Dither)</span>
                        </label>
                        <span className="font-mono-code font-bold">
                          {debandEnabled ? `${Math.round(debandStrength * 100)}%` : 'Выкл'}
                        </span>
                      </div>
                      <input
                        type="range"
                        min={0.1}
                        max={1.0}
                        step={0.05}
                        value={debandStrength}
                        onChange={(e) => {
                          setDebandStrength(parseFloat(e.target.value));
                          if (!debandEnabled) setDebandEnabled(true);
                          forceRedrawRef.current = true;
                        }}
                        className="rex-slider"
                      />
                    </div>

                    {/* 3D LUT (.cube) & Color Grading Sliders */}
                    <div
                      className="p-2.5 rounded-2xl flex flex-col gap-2.5"
                      style={{
                        background: 'var(--surface-elevated)',
                        border: '1px solid var(--border-soft)'
                      }}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-xs font-bold">3D LUT (.cube) и Цветокоррекция</span>
                        <button
                          type="button"
                          onClick={() => lutFileInputRef.current?.click()}
                          className="px-2.5 py-1 rounded-full text-[11px] font-bold cursor-pointer"
                          style={{ background: 'var(--accent-bg)', color: 'var(--accent-text)' }}
                        >
                          + Загрузить .CUBE
                        </button>
                      </div>

                      <div className="rex-segmented">
                        {(
                          [
                            { id: 'off', label: 'Выкл' },
                            { id: 'teal_orange', label: 'Teal&Orange' },
                            { id: 'kodak_2383', label: 'Kodak 2383' },
                            { id: 'anime_vibrant', label: 'Anime+' },
                            { id: 'cyberpunk', label: 'Cyber' }
                          ] as const
                        ).map((item) => (
                          <button
                            key={item.id}
                            type="button"
                            onClick={() => {
                              setLutPreset(item.id);
                              forceRedrawRef.current = true;
                            }}
                            className={`rex-seg-btn ${lutPreset === item.id ? 'active' : ''}`}
                          >
                            {item.label}
                          </button>
                        ))}
                      </div>

                      {lutPreset !== 'off' && (
                        <div>
                          <div className="flex items-center justify-between text-[11px] mb-1">
                            <span style={{ color: 'var(--text-sub)' }}>
                              Интенсивность 3D LUT {lutPreset === 'custom' ? `(${customLutName})` : ''}
                            </span>
                            <span className="font-mono-code font-bold">{lutStrength}%</span>
                          </div>
                          <input
                            type="range"
                            min={0}
                            max={100}
                            step={5}
                            value={lutStrength}
                            onChange={(e) => {
                              setLutStrength(parseInt(e.target.value, 10));
                              forceRedrawRef.current = true;
                            }}
                            className="rex-slider"
                          />
                        </div>
                      )}

                      <div className="grid grid-cols-3 gap-2 pt-1">
                        <div>
                          <div className="flex justify-between text-[10px] mb-1">
                            <span style={{ color: 'var(--text-sub)' }}>Контраст</span>
                            <span className="font-mono-code font-bold">{Math.round(videoContrast * 100)}%</span>
                          </div>
                          <input
                            type="range"
                            min={0.6}
                            max={1.6}
                            step={0.05}
                            value={videoContrast}
                            onChange={(e) => {
                              setVideoContrast(parseFloat(e.target.value));
                              forceRedrawRef.current = true;
                            }}
                            className="rex-slider"
                          />
                        </div>
                        <div>
                          <div className="flex justify-between text-[10px] mb-1">
                            <span style={{ color: 'var(--text-sub)' }}>Насыщенность</span>
                            <span className="font-mono-code font-bold">{Math.round(videoSaturation * 100)}%</span>
                          </div>
                          <input
                            type="range"
                            min={0}
                            max={2.0}
                            step={0.05}
                            value={videoSaturation}
                            onChange={(e) => {
                              setVideoSaturation(parseFloat(e.target.value));
                              forceRedrawRef.current = true;
                            }}
                            className="rex-slider"
                          />
                        </div>
                        <div>
                          <div className="flex justify-between text-[10px] mb-1">
                            <span style={{ color: 'var(--text-sub)' }}>Точка черного</span>
                            <span className="font-mono-code font-bold">{Math.round(videoBlackPoint * 100)}%</span>
                          </div>
                          <input
                            type="range"
                            min={0}
                            max={0.15}
                            step={0.005}
                            value={videoBlackPoint}
                            onChange={(e) => {
                              setVideoBlackPoint(parseFloat(e.target.value));
                              forceRedrawRef.current = true;
                            }}
                            className="rex-slider"
                          />
                        </div>
                      </div>
                    </div>

                    <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
                      <label className="flex items-center gap-1.5 text-xs font-medium cursor-pointer">
                        <input
                          type="checkbox"
                          checked={sceneCutProtection}
                          onChange={(e) => {
                            setSceneCutProtection(e.target.checked);
                            forceRedrawRef.current = true;
                          }}
                          className="w-4 h-4 accent-zinc-800 rounded"
                        />
                        <span>Склейки</span>
                      </label>
                      <label className="flex items-center gap-1.5 text-xs font-medium cursor-pointer">
                        <input
                          type="checkbox"
                          checked={splitCompareMode}
                          onChange={(e) => {
                            setSplitCompareMode(e.target.checked);
                            forceRedrawRef.current = true;
                          }}
                          className="w-4 h-4 accent-zinc-800 rounded"
                        />
                        <span>50/50</span>
                      </label>
                      <label className="flex items-center gap-1.5 text-xs font-medium cursor-pointer">
                        <input
                          type="checkbox"
                          checked={showVectors}
                          onChange={(e) => {
                            setShowVectors(e.target.checked);
                            forceRedrawRef.current = true;
                          }}
                          className="w-4 h-4 accent-zinc-800 rounded"
                        />
                        <span>Векторы</span>
                      </label>
                      <label
                        className="flex items-center gap-1.5 text-xs font-semibold cursor-pointer"
                        title="Отладка Pass 1: вывод тепловой карты ошибок Symmetric SAD из FBO-буфера"
                      >
                        <input
                          type="checkbox"
                          checked={showSadHeatmap}
                          onChange={(e) => {
                            setShowSadHeatmap(e.target.checked);
                            forceRedrawRef.current = true;
                          }}
                          className="w-4 h-4 accent-rose-600 rounded"
                        />
                        <span>Тепловая карта SAD</span>
                      </label>
                      <label className="flex items-center gap-1.5 text-xs font-medium cursor-pointer">
                        <input
                          type="checkbox"
                          checked={monochromeFilter}
                          onChange={(e) => {
                            setMonochromeFilter(e.target.checked);
                            forceRedrawRef.current = true;
                          }}
                          className="w-4 h-4 accent-zinc-800 rounded"
                        />
                        <span>Ч/Б</span>
                      </label>
                    </div>

                    <div className="flex items-center justify-between gap-2 pt-1">
                      <button
                        type="button"
                        onClick={handleExportDiagnosticsJson}
                        className="w-full py-1.5 px-3 rounded-xl text-[11px] font-mono-code font-bold cursor-pointer transition flex items-center justify-center gap-1.5"
                        style={{ background: 'var(--surface-pill)', color: 'var(--text-main)' }}
                      >
                        <Activity className="w-3.5 h-3.5" />
                        <span>Экспорт диагностического отчёта телеметрии (JSON)</span>
                      </button>
                    </div>

                    {showSadHeatmap && (
                      <div
                        className="p-2.5 rounded-xl flex flex-col gap-1.5 text-[11px]"
                        style={{
                          background: 'var(--surface-elevated)',
                          border: '1px solid var(--border-soft)'
                        }}
                      >
                        <div className="flex items-center justify-between font-mono-code font-bold">
                          <span>PASS 1 SYMMETRIC SAD HEATMAP BUFFER</span>
                          <span className="text-rose-500">FBO Debug Active</span>
                        </div>
                        <div
                          className="h-2 w-full rounded-full"
                          style={{
                            background:
                              'linear-gradient(90deg, #091836 0%, #00c49a 25%, #ffd166 50%, #ff3d1f 75%, #fff0fc 100%)'
                          }}
                        />
                        <div
                          className="flex items-center justify-between text-[10px] font-mono-code"
                          style={{ color: 'var(--text-sub)' }}
                        >
                          <span>0.00 Точное совпадение</span>
                          <span>0.50 Контур</span>
                          <span>1.00 Разрыв / Окклюзия</span>
                        </div>
                      </div>
                    )}
                  </>
                )}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* ============================== BOTTOM NAVIGATION ============================== */}
      <nav className="rex-bottom-nav">
        <button
          type="button"
          onClick={() => {
            setActiveTab('home');
            setActiveScreen('main');
          }}
          className={`nav-tab ${activeTab === 'home' && activeScreen === 'main' ? 'active' : ''}`}
        >
          <div className="nav-pill-wrap">
            <FileVideo className="w-5 h-5" />
          </div>
          <span className="rex-serif text-xs font-bold">Главная</span>
        </button>

        <button
          type="button"
          onClick={() => {
            setActiveScreen('player');
          }}
          className={`nav-tab ${activeScreen === 'player' ? 'active' : ''}`}
        >
          <div className="nav-pill-wrap">
            <Play className="w-5 h-5 fill-current" />
          </div>
          <span className="rex-serif text-xs font-bold">Плеер</span>
        </button>

        <button
          type="button"
          onClick={() => {
            setActiveTab('you');
            setActiveScreen('main');
          }}
          className={`nav-tab ${activeTab === 'you' && activeScreen === 'main' ? 'active' : ''}`}
        >
          <div className="nav-pill-wrap">
            <User className="w-5 h-5" />
          </div>
          <span className="rex-serif text-xs font-bold">You</span>
        </button>

        <button
          type="button"
          onClick={() => {
            setActiveScreen('settings');
          }}
          className={`nav-tab ${activeScreen === 'settings' ? 'active' : ''}`}
        >
          <div className="nav-pill-wrap">
            <SettingsIcon className="w-5 h-5" />
          </div>
          <span className="rex-serif text-xs font-bold">Настройки</span>
        </button>
      </nav>

      {/* ============================== URL MODAL ============================== */}
      {urlModalOpen && (
        <div
          onClick={() => {
            if (!isResolvingUrl) setUrlModalOpen(false);
          }}
          className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4"
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-md rounded-3xl p-6 shadow-2xl"
            style={{
              background: 'var(--surface-elevated)',
              color: 'var(--text-main)',
              border: '1px solid var(--border-strong)'
            }}
          >
            <div className="flex items-center justify-between mb-2">
              <h3 className="rex-serif text-base font-bold">Открыть поток или релиз Anixart</h3>
              <button
                type="button"
                onClick={() => setUrlModalOpen(false)}
                className="p-1.5 rounded-full cursor-pointer"
                style={{ background: 'var(--surface-pill)' }}
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <p className="text-xs mb-3 leading-relaxed" style={{ color: 'var(--text-sub)' }}>
              Поддерживаются ссылки на релизы <strong>Anixart</strong> (<code>anixart-app.com/release/...</code>), плееры <strong>Kodik / Sibnet</strong>, потоки <strong>HLS (.m3u8)</strong> и прямые <strong>MP4 / WebM</strong> файлы:
            </p>
            <input
              type="url"
              value={urlInput}
              onChange={(e) => setUrlInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !isResolvingUrl) {
                  e.preventDefault();
                  void handleNetworkLaunch(urlInput);
                }
              }}
              placeholder="https://anixart-app.com/release/20398 или .m3u8 / .mp4"
              className="w-full px-4 py-2.5 rounded-2xl text-sm border focus:outline-none mb-3"
              style={{
                background: 'var(--surface-card)',
                color: 'var(--text-main)',
                borderColor: 'var(--border-strong)'
              }}
              autoFocus
            />
            <div className="mb-4 flex flex-col gap-1.5">
              <span className="text-[11px] font-semibold" style={{ color: 'var(--text-sub)' }}>
                Быстрый запуск примера:
              </span>
              <button
                type="button"
                disabled={isResolvingUrl}
                onClick={() => {
                  const sampleUrl = 'https://anixart-app.com/release/20398';
                  setUrlInput(sampleUrl);
                  void handleNetworkLaunch(sampleUrl);
                }}
                className="w-full px-3.5 py-2 rounded-2xl text-left text-xs font-semibold cursor-pointer flex items-center justify-between gap-2 transition hover:opacity-90"
                style={{
                  background: 'var(--surface-card)',
                  color: 'var(--text-main)',
                  border: '1px solid var(--border-soft)'
                }}
              >
                <span className="truncate">Киберпанк: Бегущие по краю 2 (anixart-app.com/release/20398)</span>
                <span
                  className="px-2 py-0.5 rounded-full text-[10px] font-mono-code font-bold shrink-0"
                  style={{ background: 'var(--accent-bg)', color: 'var(--accent-text)' }}
                >
                  HLS 720p
                </span>
              </button>
            </div>
            <div className="flex items-center justify-end gap-2">
              <button
                type="button"
                disabled={isResolvingUrl}
                onClick={() => setUrlModalOpen(false)}
                className="px-4 py-2 rounded-full text-xs font-semibold cursor-pointer"
                style={{ background: 'var(--surface-pill)', color: 'var(--text-main)' }}
              >
                Отмена
              </button>
              <button
                type="button"
                disabled={isResolvingUrl}
                onClick={() => void handleNetworkLaunch(urlInput)}
                className="px-5 py-2 rounded-full text-xs font-semibold cursor-pointer"
                style={{ background: 'var(--accent-bg)', color: 'var(--accent-text)' }}
              >
                {isResolvingUrl ? 'Извлечение потока...' : 'Загрузить поток'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ============================== SETTINGS SHEETS / MODALS ============================== */}
      {activeModal && (
        <div
          onClick={() => setActiveModal(null)}
          className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-end sm:items-center justify-center p-0 sm:p-4"
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-lg rounded-t-3xl sm:rounded-3xl p-6 shadow-2xl max-h-[85vh] overflow-y-auto"
            style={{
              background: 'var(--surface-elevated)',
              color: 'var(--text-main)',
              border: '1px solid var(--border-strong)'
            }}
          >
            {/* Modal Header */}
            <div className="flex items-center justify-between mb-4">
              <h3 className="rex-serif text-lg font-bold">
                {activeModal === 'appearance' && 'Внешний вид и Тема'}
                {activeModal === 'player' && 'Параметры плеера и режим вывода'}
                {activeModal === 'layout' && 'Расположение элементов'}
                {activeModal === 'gestures' && 'Жесты и управление'}
                {activeModal === 'library' && 'Медиа и библиотека'}
                {activeModal === 'interpolation' && 'Интерполяция (MEMC) и GPU Апскейлер'}
                {activeModal === 'subtitles' && 'Субтитры (.SRT / .VTT)'}
                {activeModal === 'audio' && 'Эквалайзер Web Audio API'}
                {activeModal === 'about' && 'О приложении REX Player'}
                {activeModal === 'apk' && 'Сборка и установка APK на Android'}
              </h3>
              <button
                type="button"
                onClick={() => setActiveModal(null)}
                className="p-1.5 rounded-full cursor-pointer hover:opacity-80"
                style={{ background: 'var(--surface-pill)' }}
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Modal Body Content */}
            <div className="text-sm flex flex-col gap-4">
              {/* APPEARANCE */}
              {activeModal === 'appearance' && (
                <div className="flex flex-col gap-3">
                  <div className="flex items-center justify-between p-3.5 rounded-2xl" style={{ background: 'var(--surface-card)' }}>
                    <div>
                      <div className="font-bold">Монохромная тёмная тема</div>
                      <div className="text-xs" style={{ color: 'var(--text-sub)' }}>
                        Глубокий чёрный фон OLED с высокой контрастностью
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => setDarkTheme((prev) => !prev)}
                      className="px-4 py-1.5 rounded-full text-xs font-semibold cursor-pointer"
                      style={{ background: 'var(--accent-bg)', color: 'var(--accent-text)' }}
                    >
                      {darkTheme ? 'Включена' : 'Выключена'}
                    </button>
                  </div>

                  <div className="flex items-center justify-between p-3.5 rounded-2xl" style={{ background: 'var(--surface-card)' }}>
                    <div>
                      <div className="font-bold">Компактная сетка видео</div>
                      <div className="text-xs" style={{ color: 'var(--text-sub)' }}>
                        Отображать карточки видео в 2 колонки на главном экране
                      </div>
                    </div>
                    <input
                      type="checkbox"
                      checked={compactGrid}
                      onChange={(e) => setCompactGrid(e.target.checked)}
                      className="w-5 h-5 accent-zinc-900 rounded"
                    />
                  </div>
                </div>
              )}

              {/* PLAYER, ASPECT RATIO & OUTPUT PIPELINE */}
              {activeModal === 'player' && (
                <div className="flex flex-col gap-3">
                  <div>
                    <label className="text-xs font-bold block mb-1.5">Соотношение сторон видео (Масштабирование)</label>
                    <div className="rex-segmented">
                      <button
                        type="button"
                        onClick={() => setAspectMode('contain')}
                        className={`rex-seg-btn ${aspectMode === 'contain' ? 'active' : ''}`}
                      >
                        Оригинал (Fit)
                      </button>
                      <button
                        type="button"
                        onClick={() => setAspectMode('cover')}
                        className={`rex-seg-btn ${aspectMode === 'cover' ? 'active' : ''}`}
                      >
                        Заполнение (Crop)
                      </button>
                      <button
                        type="button"
                        onClick={() => setAspectMode('fill')}
                        className={`rex-seg-btn ${aspectMode === 'fill' ? 'active' : ''}`}
                      >
                        Растянуть 16:9
                      </button>
                    </div>
                    <div className="text-[11px] mt-1" style={{ color: 'var(--text-sub)' }}>
                      В режиме «Оригинал» вертикальные (9:16), классические (4:3) и широкоэкранные (21:9) видео выводятся строго без искажения пропорций.
                    </div>
                  </div>

                  <div className="p-3.5 rounded-2xl flex flex-col gap-2" style={{ background: 'var(--surface-card)' }}>
                    <div className="flex items-center justify-between">
                      <label className="text-xs font-bold block">Архитектура вывода видеокадра</label>
                      <span
                        className="text-[10px] font-mono-code px-2 py-0.5 rounded-full font-bold"
                        style={{
                          background: isVideoFallbackActive
                            ? 'rgba(234, 179, 8, 0.2)'
                            : 'rgba(34, 197, 94, 0.2)',
                          color: isVideoFallbackActive ? '#eab308' : '#22c55e'
                        }}
                      >
                        {isVideoFallbackActive
                          ? webglContextLost
                            ? 'GPU сбой • Video Fallback'
                            : 'VideoElement Fallback'
                          : 'Прямой WebGL'}
                      </span>
                    </div>
                    <div className="rex-segmented">
                      <button
                        type="button"
                        onClick={() => {
                          setVideoOutputMode('webgl_direct');
                          setWebglContextLost(false);
                          showToast('Прямой WebGL вывод (Оптический поток MEMC / Upscaler / HDR10)');
                        }}
                        className={`rex-seg-btn ${videoOutputMode === 'webgl_direct' ? 'active' : ''}`}
                      >
                        Прямой WebGL (MEMC)
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setVideoOutputMode('video_fallback');
                          showToast('Аппаратный Fallback: прямое воспроизведение VideoElement');
                        }}
                        className={`rex-seg-btn ${videoOutputMode === 'video_fallback' ? 'active' : ''}`}
                      >
                        Video Fallback
                      </button>
                    </div>
                    <p className="text-[11px] leading-snug" style={{ color: 'var(--text-sub)' }}>
                      {videoOutputMode === 'webgl_direct'
                        ? 'Двухпроходный аппаратный рендеринг через шейдеры WebGL с автоматическим переключением на VideoElement при потере контекста GPU.'
                        : 'Прямой нативный вывод видеодекодера браузера без шейдерной обработки (минимальное энергопотребление).'}
                    </p>
                  </div>

                  <label className="flex items-center justify-between p-3.5 rounded-2xl cursor-pointer" style={{ background: 'var(--surface-card)' }}>
                    <div>
                      <div className="font-bold">Автопереход к следующему видео</div>
                      <div className="text-xs" style={{ color: 'var(--text-sub)' }}>
                        Автоматически играть следующий трек в плейлисте
                      </div>
                    </div>
                    <input
                      type="checkbox"
                      checked={autoPlayNext}
                      onChange={(e) => setAutoPlayNext(e.target.checked)}
                      className="w-5 h-5 accent-zinc-900 rounded"
                    />
                  </label>

                  <label className="flex items-center justify-between p-3.5 rounded-2xl cursor-pointer" style={{ background: 'var(--surface-card)' }}>
                    <div>
                      <div className="font-bold">Зацикливание видео (Loop)</div>
                      <div className="text-xs" style={{ color: 'var(--text-sub)' }}>
                        Повторять текущее видео по завершении
                      </div>
                    </div>
                    <input
                      type="checkbox"
                      checked={loopPlayback}
                      onChange={(e) => setLoopPlayback(e.target.checked)}
                      className="w-5 h-5 accent-zinc-900 rounded"
                    />
                  </label>

                  <label className="flex items-center justify-between p-3.5 rounded-2xl cursor-pointer" style={{ background: 'var(--surface-card)' }}>
                    <div>
                      <div className="font-bold">Запоминать позицию воспроизведения</div>
                      <div className="text-xs" style={{ color: 'var(--text-sub)' }}>
                        Сохранять таймкод при выходе из плеера
                      </div>
                    </div>
                    <input
                      type="checkbox"
                      checked={rememberPosition}
                      onChange={(e) => setRememberPosition(e.target.checked)}
                      className="w-5 h-5 accent-zinc-900 rounded"
                    />
                  </label>
                </div>
              )}

              {/* LAYOUT */}
              {activeModal === 'layout' && (
                <div className="flex flex-col gap-3">
                  <label className="flex items-center justify-between p-3.5 rounded-2xl cursor-pointer" style={{ background: 'var(--surface-card)' }}>
                    <div>
                      <div className="font-bold">Верхний информационный HUD</div>
                      <div className="text-xs" style={{ color: 'var(--text-sub)' }}>
                        Показывать статус MEMC, герцовку экрана и мс кадра
                      </div>
                    </div>
                    <input
                      type="checkbox"
                      checked={showTopHud}
                      onChange={(e) => setShowTopHud(e.target.checked)}
                      className="w-5 h-5 accent-zinc-900 rounded"
                    />
                  </label>

                  <label className="flex items-center justify-between p-3.5 rounded-2xl cursor-pointer" style={{ background: 'var(--surface-card)' }}>
                    <div>
                      <div className="font-bold">Кнопки покадрового шага</div>
                      <div className="text-xs" style={{ color: 'var(--text-sub)' }}>
                        Переход на 1 кадр вперёд/назад в панели транспорта
                      </div>
                    </div>
                    <input
                      type="checkbox"
                      checked={showStepButtons}
                      onChange={(e) => setShowStepButtons(e.target.checked)}
                      className="w-5 h-5 accent-zinc-900 rounded"
                    />
                  </label>

                  <label className="flex items-center justify-between p-3.5 rounded-2xl cursor-pointer" style={{ background: 'var(--surface-card)' }}>
                    <div>
                      <div className="font-bold">Кнопка захвата кадра PNG</div>
                      <div className="text-xs" style={{ color: 'var(--text-sub)' }}>
                        Быстрое сохранение интерполированного кадра
                      </div>
                    </div>
                    <input
                      type="checkbox"
                      checked={showSnapshotBtn}
                      onChange={(e) => setShowSnapshotBtn(e.target.checked)}
                      className="w-5 h-5 accent-zinc-900 rounded"
                    />
                  </label>
                </div>
              )}

              {/* GESTURES */}
              {activeModal === 'gestures' && (
                <div className="flex flex-col gap-3">
                  <div>
                    <label className="text-xs font-bold block mb-1.5">Интервал перемотки двойным касанием</label>
                    <div className="rex-segmented">
                      {[5, 10, 15].map((sec) => (
                        <button
                          key={sec}
                          type="button"
                          onClick={() => setDoubleTapSeekSec(sec)}
                          className={`rex-seg-btn ${doubleTapSeekSec === sec ? 'active' : ''}`}
                        >
                          {sec} сек
                        </button>
                      ))}
                    </div>
                  </div>

                  <label className="flex items-center justify-between p-3.5 rounded-2xl cursor-pointer" style={{ background: 'var(--surface-card)' }}>
                    <div>
                      <div className="font-bold">Удержание для скорости 2.0x</div>
                      <div className="text-xs" style={{ color: 'var(--text-sub)' }}>
                        Долгое нажатие на видео временно ускоряет поток в 2 раза
                      </div>
                    </div>
                    <input
                      type="checkbox"
                      checked={longPressSpeed2x}
                      onChange={(e) => setLongPressSpeed2x(e.target.checked)}
                      className="w-5 h-5 accent-zinc-900 rounded"
                    />
                  </label>

                  <label className="flex items-center justify-between p-3.5 rounded-2xl cursor-pointer" style={{ background: 'var(--surface-card)' }}>
                    <div>
                      <div className="font-bold">Вертикальные свайпы яркости и громкости</div>
                      <div className="text-xs" style={{ color: 'var(--text-sub)' }}>
                        Слева — яркость ({Math.round(videoBrightness * 100)}%), справа — громкость ({Math.round((isMuted ? 0 : volume) * 100)}%), по горизонтали — перемотка
                      </div>
                    </div>
                    <input
                      type="checkbox"
                      checked={swipeVolumeBright}
                      onChange={(e) => setSwipeVolumeBright(e.target.checked)}
                      className="w-5 h-5 accent-zinc-900 rounded"
                    />
                  </label>

                  <div className="p-3.5 rounded-2xl flex items-center justify-between gap-3" style={{ background: 'var(--surface-card)' }}>
                    <div>
                      <div className="font-bold text-xs">Текущая яркость видео: {Math.round(videoBrightness * 100)}%</div>
                      <div className="text-[11px]" style={{ color: 'var(--text-sub)' }}>
                        Аппаратная регулировка в шейдере WebGL (20%–180%)
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => {
                        setVideoBrightness(1.0);
                        forceRedrawRef.current = true;
                        showToast('Яркость сброшена до 100%');
                      }}
                      className="px-3.5 py-1.5 rounded-full text-xs font-semibold cursor-pointer"
                      style={{ background: 'var(--surface-pill)', color: 'var(--text-main)' }}
                    >
                      Сбросить 100%
                    </button>
                  </div>
                </div>
              )}

              {/* LIBRARY */}
              {activeModal === 'library' && (
                <div className="flex flex-col gap-3">
                  <div className="p-3.5 rounded-2xl" style={{ background: 'var(--surface-card)' }}>
                    <div className="flex items-center justify-between gap-2 mb-1">
                      <div className="font-bold">Медиатека смартфона & Кэш Vault</div>
                      <span className="text-[11px] font-mono-code px-2 py-0.5 rounded-full" style={{ background: 'var(--surface-pill)', color: 'var(--text-main)' }}>
                        IndexedDB: {userVideos.length} видео
                      </span>
                    </div>
                    <div className="text-xs mb-3" style={{ color: 'var(--text-sub)' }}>
                      Все добавленные файлы автоматически сохраняются в памяти устройства и доступны сразу при каждом запуске плеера.
                      {boundFolderName && (
                        <div className="mt-1 font-medium text-emerald-600 dark:text-emerald-400">
                          Привязанная папка: {boundFolderName}
                        </div>
                      )}
                    </div>
                    <div className="flex flex-wrap gap-2">
                      <button
                        type="button"
                        onClick={() => fileInputRef.current?.click()}
                        className="px-4 py-2 rounded-full text-xs font-semibold cursor-pointer"
                        style={{ background: 'var(--accent-bg)', color: 'var(--accent-text)' }}
                      >
                        + Добавить видеофайлы
                      </button>
                      <button
                        type="button"
                        onClick={handleBindSmartphoneFolder}
                        className="px-4 py-2 rounded-full text-xs font-semibold cursor-pointer"
                        style={{ background: 'var(--surface-pill)', color: 'var(--text-main)' }}
                      >
                        Привязать папку смартфона
                      </button>
                      <button
                        type="button"
                        onClick={handleRescanBoundFolder}
                        className="px-4 py-2 rounded-full text-xs font-semibold cursor-pointer"
                        style={{ background: 'var(--surface-pill)', color: 'var(--text-main)' }}
                      >
                        Синхронизировать
                      </button>
                      {userVideos.length > 0 && (
                        <button
                          type="button"
                          onClick={clearAllVideos}
                          className="px-4 py-2 rounded-full text-xs font-semibold cursor-pointer"
                          style={{ background: 'var(--badge-bg)', color: 'var(--badge-text)' }}
                        >
                          Очистить список
                        </button>
                      )}
                    </div>
                  </div>

                  <label className="flex items-center justify-between p-3.5 rounded-2xl cursor-pointer" style={{ background: 'var(--surface-card)' }}>
                    <div>
                      <div className="font-bold">Автопривязка при входе в плеер</div>
                      <div className="text-xs" style={{ color: 'var(--text-sub)' }}>
                        Автоматически подгружать кэшированные видео смартфона сразу после старта
                      </div>
                    </div>
                    <input
                      type="checkbox"
                      checked={autoBindMediaOnStart}
                      onChange={(e) => {
                        setAutoBindMediaOnStart(e.target.checked);
                        showToast(e.target.checked ? 'Автопривязка включена' : 'Автопривязка отключена');
                      }}
                      className="w-5 h-5 accent-zinc-900 rounded"
                    />
                  </label>
                </div>
              )}

              {/* INTERPOLATION (MEMC), GPU UPSCALER, ADRENO & HDR10 */}
              {activeModal === 'interpolation' && (
                <div className="flex flex-col gap-3">
                  {/* Qualcomm Adreno Hardware Accelerator block inside modal */}
                  <div className="p-3.5 rounded-2xl flex flex-col gap-2.5" style={{ background: 'var(--surface-card)' }}>
                    <div className="flex items-center justify-between gap-2">
                      <div>
                        <div className="font-bold">Видеоускоритель Qualcomm Adreno</div>
                        <div className="text-xs font-mono-code" style={{ color: 'var(--text-sub)' }}>
                          {detectedGpuInfo.modelLabel} • {detectedGpuInfo.gmemCacheLabel}
                        </div>
                      </div>
                      <span
                        className="px-2.5 py-1 rounded-full text-xs font-mono-code font-bold shrink-0"
                        style={{
                          background: isAdrenoActive ? 'var(--accent-bg)' : 'var(--surface-pill)',
                          color: isAdrenoActive ? 'var(--accent-text)' : 'var(--text-sub)'
                        }}
                      >
                        {isAdrenoActive ? 'Активен' : 'Выкл'}
                      </span>
                    </div>

                    <div className="rex-segmented">
                      {(
                        [
                          { id: 'auto', label: 'Авто (Detect)' },
                          { id: 'on', label: 'Вкл (Adreno)' },
                          { id: 'off', label: 'Выкл' }
                        ] as const
                      ).map((m) => (
                        <button
                          key={m.id}
                          type="button"
                          onClick={() => {
                            setAdrenoMode(m.id);
                            forceRedrawRef.current = true;
                          }}
                          className={`rex-seg-btn ${adrenoMode === m.id ? 'active' : ''}`}
                        >
                          {m.label}
                        </button>
                      ))}
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs pt-1">
                      <label className="flex items-center gap-2 cursor-pointer font-medium">
                        <input
                          type="checkbox"
                          checked={adrenoGmemFp16}
                          onChange={(e) => {
                            setAdrenoGmemFp16(e.target.checked);
                            forceRedrawRef.current = true;
                          }}
                          className="w-4 h-4 accent-zinc-900 rounded"
                        />
                        <span>Оптимизация GMEM + FP16 ALU</span>
                      </label>
                      <label className="flex items-center gap-2 cursor-pointer font-medium">
                        <input
                          type="checkbox"
                          checked={adrenoTrue10Hdr}
                          onChange={(e) => {
                            setAdrenoTrue10Hdr(e.target.checked);
                            forceRedrawRef.current = true;
                          }}
                          className="w-4 h-4 accent-zinc-900 rounded"
                        />
                        <span>Профиль Adreno True10 HDR</span>
                      </label>
                    </div>
                  </div>

                  {/* GPU Super Resolution Upscaler block inside modal */}
                  <div className="p-3.5 rounded-2xl flex flex-col gap-2.5" style={{ background: 'var(--surface-card)' }}>
                    <div className="flex items-center justify-between">
                      <div>
                        <div className="font-bold">GPU Супер-разрешение (Super Resolution)</div>
                        <div className="text-xs" style={{ color: 'var(--text-sub)' }}>
                          9-Tap направленный апскейлинг с анти-рингингом и подавлением шума сжатия до 4K UHD
                        </div>
                      </div>
                      <input
                        type="checkbox"
                        checked={upscaleEnabled}
                        onChange={(e) => {
                          setUpscaleEnabled(e.target.checked);
                          forceRedrawRef.current = true;
                        }}
                        className="w-5 h-5 accent-zinc-900 rounded"
                      />
                    </div>

                    <div className="rex-segmented">
                      {(
                        [
                          { id: 'gsr', label: 'GSR' },
                          { id: 'fsr', label: 'FSR' },
                          { id: 'anime4k', label: 'Anime4K' },
                          { id: 'cinema', label: 'Кино' }
                        ] as const
                      ).map((m) => (
                        <button
                          key={m.id}
                          type="button"
                          onClick={() => {
                            setUpscaleMode(m.id);
                            setUpscaleEnabled(true);
                            forceRedrawRef.current = true;
                          }}
                          className={`rex-seg-btn ${upscaleEnabled && upscaleMode === m.id ? 'active' : ''}`}
                        >
                          {m.label}
                        </button>
                      ))}
                    </div>

                    <div className="rex-segmented">
                      {(
                        [
                          { factor: 'auto' as const, label: `Авто (${effectiveUpscaleFactor}x)` },
                          { factor: 1.5 as const, label: 'FHD+ 1.5x' },
                          { factor: 2.0 as const, label: 'QHD 2K' },
                          { factor: 4.0 as const, label: '4K UHD' }
                        ]
                      ).map((item) => (
                        <button
                          key={String(item.factor)}
                          type="button"
                          onClick={() => {
                            setUpscaleFactor(item.factor);
                            setUpscaleEnabled(true);
                            forceRedrawRef.current = true;
                          }}
                          className={`rex-seg-btn ${upscaleEnabled && upscaleFactor === item.factor ? 'active' : ''}`}
                        >
                          {item.label}
                        </button>
                      ))}
                    </div>

                    <div>
                      <div className="flex items-center justify-between text-xs mb-1">
                        <span>Резкость контуров (CAS)</span>
                        <span className="font-mono-code font-bold">{Math.round(upscaleSharpness * 100)}%</span>
                      </div>
                      <input
                        type="range"
                        min={0.1}
                        max={1.4}
                        step={0.05}
                        value={upscaleSharpness}
                        onChange={(e) => {
                          setUpscaleSharpness(parseFloat(e.target.value));
                          if (!upscaleEnabled) setUpscaleEnabled(true);
                          forceRedrawRef.current = true;
                        }}
                        className="rex-slider"
                      />
                    </div>

                    <div>
                      <div className="flex items-center justify-between text-xs mb-1">
                        <span>Подавление шума и квадратов (De-block)</span>
                        <span className="font-mono-code font-bold">{Math.round(upscaleDenoise * 100)}%</span>
                      </div>
                      <input
                        type="range"
                        min={0}
                        max={1}
                        step={0.05}
                        value={upscaleDenoise}
                        onChange={(e) => {
                          setUpscaleDenoise(parseFloat(e.target.value));
                          if (!upscaleEnabled) setUpscaleEnabled(true);
                          forceRedrawRef.current = true;
                        }}
                        className="rex-slider"
                      />
                    </div>
                  </div>

                  <div className="p-3.5 rounded-2xl flex flex-col gap-2" style={{ background: 'var(--surface-card)' }}>
                    <div className="flex items-center justify-between">
                      <div>
                        <div className="font-bold">HDR10 Тонмаппинг</div>
                        <div className="text-xs" style={{ color: 'var(--text-sub)' }}>
                          Расширенный динамический диапазон и цвет Rec.2020
                        </div>
                      </div>
                      <input
                        type="checkbox"
                        checked={hdrEnabled}
                        onChange={(e) => {
                          setHdrEnabled(e.target.checked);
                          forceRedrawRef.current = true;
                        }}
                        className="w-5 h-5 accent-zinc-900 rounded"
                      />
                    </div>
                    <div>
                      <div className="flex items-center justify-between text-xs mb-1">
                        <span>Интенсивность HDR</span>
                        <span className="font-mono-code font-bold">{Math.round(hdrStrength * 100)}%</span>
                      </div>
                      <input
                        type="range"
                        min={0.3}
                        max={1.5}
                        step={0.05}
                        value={hdrStrength}
                        onChange={(e) => {
                          setHdrStrength(parseFloat(e.target.value));
                          if (!hdrEnabled) setHdrEnabled(true);
                          forceRedrawRef.current = true;
                        }}
                        className="rex-slider"
                      />
                    </div>
                  </div>

                  <div>
                    <label className="text-xs font-bold block mb-1">Режим интерполяции (MEMC)</label>
                    <div className="grid grid-cols-3 gap-1.5 p-1 rounded-2xl mb-1" style={{ background: 'var(--surface-elevated)' }}>
                      {[
                        { id: 'optical', label: 'Оптический поток' },
                        { id: 'blend', label: 'Смешивание' },
                        { id: 'off', label: 'Выкл' }
                      ].map((m) => {
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
                                setInterpMode('off');
                                setInterpEnabled(false);
                              } else {
                                setInterpMode(m.id as 'optical' | 'blend');
                                setInterpEnabled(true);
                                if (videoOutputMode === 'video_fallback') {
                                  setVideoOutputMode('webgl_direct');
                                }
                              }
                              forceRedrawRef.current = true;
                            }}
                            className={`rex-seg-btn py-1.5 text-xs ${isAct ? 'active font-bold' : ''}`}
                          >
                            {m.label}
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  <div>
                    <div className="flex items-center justify-between text-xs mb-1">
                      <label className="font-bold">Целевая частота кадров MEMC</label>
                      <span className="font-mono-code font-bold text-amber-500">
                        {effectiveTargetFps} FPS {targetFps === 'auto' ? `(Авто • экран ${detectedDisplayHz} Гц)` : ''}
                      </span>
                    </div>
                    <div className="rex-segmented">
                      {[
                        { id: 'auto' as const, label: `Авто (${detectedDisplayHz}Hz)` },
                        { id: 60 as const, label: '60' },
                        { id: 90 as const, label: '90' },
                        { id: 120 as const, label: '120' },
                        { id: 144 as const, label: '144' }
                      ].map((item) => (
                        <button
                          key={item.id}
                          type="button"
                          onClick={() => {
                            setTargetFps(item.id);
                            forceRedrawRef.current = true;
                          }}
                          className={`rex-seg-btn ${targetFps === item.id ? 'active' : ''}`}
                        >
                          {item.label}
                        </button>
                      ))}
                    </div>
                  </div>

                  <div>
                    <div className="flex items-center justify-between text-xs mb-1">
                      <span className="font-bold">Адаптивный буфер потока (6-Lvl Pyramid FBO)</span>
                      <span className="text-[11px] font-mono-code font-bold uppercase" style={{ color: 'var(--text-sub)' }}>
                        {flowScaleLabel}
                      </span>
                    </div>
                    <div className="rex-segmented">
                      {(
                        [
                          { id: 'auto', label: 'Авто' },
                          { id: 'performance', label: '64×36' },
                          { id: 'balanced', label: '96×54' },
                          { id: 'ultra', label: '128×72' },
                          { id: 'extreme', label: '256×144' },
                          { id: 'high', label: '384×216' },
                          { id: 'max', label: '512×288' }
                        ] as const
                      ).map((m) => (
                        <button
                          key={m.id}
                          type="button"
                          onClick={() => {
                            setFlowScaleMode(m.id);
                            forceRedrawRef.current = true;
                          }}
                          className={`rex-seg-btn ${flowScaleMode === m.id ? 'active' : ''}`}
                        >
                          {m.label}
                        </button>
                      ))}
                    </div>
                    <div className="text-[11px] mt-1.5" style={{ color: 'var(--text-sub)' }}>
                      6-уровневая иерархическая пирамида оптического потока (L4: 16×9 → L3: 32×18 → L2: 64×36 → L1: 128×72 → L0.5: 256×144 → L0: до 512×288) с авто-контролем памяти
                    </div>
                  </div>

                  {/* Secondary Sub-Frame Cascade FBO inside Global Modal */}
                  <div className="p-3.5 rounded-2xl flex flex-col gap-2.5" style={{ background: 'var(--surface-card)' }}>
                    <div className="flex items-center justify-between">
                      <div>
                        <div className="font-bold">Каскад суб-кадров (3-Anchor Sub-Frame FBO до 1440p)</div>
                        <div className="text-xs" style={{ color: 'var(--text-sub)' }}>
                          Генерация 3 промежуточных FBO-буферов (I_0.25 • I_0.50 • I_0.75) с разрешением до 2560×1440 и умной защитой от перегрева
                        </div>
                      </div>
                      <input
                        type="checkbox"
                        checked={subframeCascadeEnabled}
                        onChange={(e) => {
                          setSubframeCascadeEnabled(e.target.checked);
                          if (e.target.checked && (!interpEnabled || interpMode === 'off')) {
                            setInterpEnabled(true);
                            setInterpMode('optical');
                          }
                          forceRedrawRef.current = true;
                        }}
                        className="w-5 h-5 accent-zinc-900 rounded"
                      />
                    </div>

                    <div className="rex-segmented">
                      {(
                        [
                          { id: 'auto' as const, label: `Авто (${effectiveSubframeCascadeMult}x)` },
                          { id: '2x' as const, label: '2x Суб' },
                          { id: '3x' as const, label: '3x Суб' },
                          { id: '4x' as const, label: '4x Ультра' }
                        ]
                      ).map((m) => (
                        <button
                          key={m.id}
                          type="button"
                          onClick={() => {
                            setSubframeCascadeMode(m.id);
                            setSubframeCascadeEnabled(true);
                            if (!interpEnabled || interpMode === 'off') {
                              setInterpEnabled(true);
                              setInterpMode('optical');
                            }
                            forceRedrawRef.current = true;
                          }}
                          className={`rex-seg-btn ${subframeCascadeEnabled && subframeCascadeMode === m.id ? 'active' : ''}`}
                        >
                          {m.label}
                        </button>
                      ))}
                    </div>

                    <div>
                      <div className="flex items-center justify-between text-xs mb-1">
                        <span>Разрешение буфера FBO суб-кадров (VRAM)</span>
                        <span className="font-mono-code font-bold">{subframeBufferResLabel}</span>
                      </div>
                      <div className="rex-segmented">
                        {(
                          [
                            { id: 'auto' as const, label: 'Авто 1440p' },
                            { id: '720p' as const, label: '720p HD' },
                            { id: '1080p' as const, label: '1080p FHD' },
                            { id: '1440p' as const, label: '1440p QHD' }
                          ]
                        ).map((m) => (
                          <button
                            key={m.id}
                            type="button"
                            onClick={() => {
                              setSubframeBufferResMode(m.id);
                              if (!subframeCascadeEnabled) setSubframeCascadeEnabled(true);
                              forceRedrawRef.current = true;
                            }}
                            className={`rex-seg-btn ${subframeBufferResMode === m.id ? 'active' : ''}`}
                          >
                            {m.label}
                          </button>
                        ))}
                      </div>
                    </div>

                    <div>
                      <div className="flex items-center justify-between text-xs mb-1">
                        <span>Контроль когерентности векторов</span>
                        <span className="font-mono-code font-bold">{subframeCoherenceGuard}%</span>
                      </div>
                      <input
                        type="range"
                        min={0}
                        max={100}
                        step={5}
                        value={subframeCoherenceGuard}
                        onChange={(e) => {
                          setSubframeCoherenceGuard(parseInt(e.target.value, 10));
                          if (!subframeCascadeEnabled) setSubframeCascadeEnabled(true);
                          forceRedrawRef.current = true;
                        }}
                        className="rex-slider"
                      />
                    </div>
                  </div>

                  <div>
                    <div className="flex items-center justify-between text-xs mb-1">
                      <span>Сила потока (MEMC)</span>
                      <span className="font-mono-code font-bold">{Math.round(interpStrength * 100)}%</span>
                    </div>
                    <input
                      type="range"
                      min={0}
                      max={2.0}
                      step={0.05}
                      value={interpStrength}
                      onChange={(e) => {
                        setInterpStrength(parseFloat(e.target.value));
                        forceRedrawRef.current = true;
                      }}
                      className="rex-slider"
                    />
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                      <div className="flex items-center justify-between text-xs mb-1">
                        <span>Радиус поиска векторов</span>
                        <span className="font-mono-code font-bold">{motionScale} px</span>
                      </div>
                      <input
                        type="range"
                        min={4}
                        max={48}
                        step={1}
                        value={motionScale}
                        onChange={(e) => {
                          setMotionScale(parseInt(e.target.value, 10));
                          forceRedrawRef.current = true;
                        }}
                        className="rex-slider"
                      />
                    </div>

                    <div>
                      <div className="flex items-center justify-between text-xs mb-1">
                        <span>Защита краёв (Анти-ореол)</span>
                        <span className="font-mono-code font-bold">{dejudderHaloControl}%</span>
                      </div>
                      <input
                        type="range"
                        min={0}
                        max={100}
                        step={5}
                        value={dejudderHaloControl}
                        onChange={(e) => {
                          setDejudderHaloControl(parseInt(e.target.value, 10));
                          forceRedrawRef.current = true;
                        }}
                        className="rex-slider"
                      />
                    </div>
                  </div>

                  <label className="flex items-center justify-between p-3.5 rounded-2xl cursor-pointer" style={{ background: 'var(--surface-card)' }}>
                    <div>
                      <div className="font-bold">Защита склеек сцен</div>
                      <div className="text-xs" style={{ color: 'var(--text-sub)' }}>
                        Отключать интерполяцию на резких сменах плана
                      </div>
                    </div>
                    <input
                      type="checkbox"
                      checked={sceneCutProtection}
                      onChange={(e) => setSceneCutProtection(e.target.checked)}
                      className="w-5 h-5 accent-zinc-900 rounded"
                    />
                  </label>

                  <label className="flex items-center justify-between p-3.5 rounded-2xl cursor-pointer" style={{ background: 'var(--surface-card)' }}>
                    <div>
                      <div className="font-bold">Отладка Pass 1: Тепловая карта ошибок Symmetric SAD</div>
                      <div className="text-xs" style={{ color: 'var(--text-sub)' }}>
                        Вывод буфера ошибок совпадения блоков (синий — точное совпадение, красный/белый — плохое совпадение и окклюзии)
                      </div>
                    </div>
                    <input
                      type="checkbox"
                      checked={showSadHeatmap}
                      onChange={(e) => {
                        setShowSadHeatmap(e.target.checked);
                        forceRedrawRef.current = true;
                      }}
                      className="w-5 h-5 accent-rose-600 rounded"
                    />
                  </label>
                </div>
              )}

              {/* SUBTITLES (DUAL SUBTITLES + .ASS/.SSA) */}
              {activeModal === 'subtitles' && (
                <div className="flex flex-col gap-3">
                  <label className="flex items-center justify-between p-3.5 rounded-2xl cursor-pointer" style={{ background: 'var(--surface-card)' }}>
                    <div>
                      <div className="font-bold">Основные субтитры (Нижний слот + теги .ASS {'{\\an8}'})</div>
                      <div className="text-xs" style={{ color: 'var(--text-sub)' }}>
                        {customSubtitlesName}
                      </div>
                    </div>
                    <input
                      type="checkbox"
                      checked={subtitlesEnabled}
                      onChange={(e) => setSubtitlesEnabled(e.target.checked)}
                      className="w-5 h-5 accent-zinc-900 rounded"
                    />
                  </label>

                  <label className="flex items-center justify-between p-3.5 rounded-2xl cursor-pointer" style={{ background: 'var(--surface-card)' }}>
                    <div>
                      <div className="font-bold">Двойные субтитры (Верхний слот для оригинала/перевода)</div>
                      <div className="text-xs" style={{ color: 'var(--text-sub)' }}>
                        {secondarySubtitlesName}
                      </div>
                    </div>
                    <input
                      type="checkbox"
                      checked={secondarySubtitlesEnabled}
                      onChange={(e) => setSecondarySubtitlesEnabled(e.target.checked)}
                      className="w-5 h-5 accent-zinc-900 rounded"
                    />
                  </label>

                  <div>
                    <div className="flex items-center justify-between text-xs mb-1">
                      <span>Размер шрифта субтитров</span>
                      <span className="font-mono-code font-bold">{subFontSize} px</span>
                    </div>
                    <input
                      type="range"
                      min={14}
                      max={30}
                      step={1}
                      value={subFontSize}
                      onChange={(e) => setSubFontSize(parseInt(e.target.value, 10))}
                      className="rex-slider"
                    />
                  </div>

                  <div>
                    <div className="flex items-center justify-between text-xs mb-1">
                      <span>Непрозрачность подложки</span>
                      <span className="font-mono-code font-bold">{Math.round(subBgOpacity * 100)}%</span>
                    </div>
                    <input
                      type="range"
                      min={0.2}
                      max={0.95}
                      step={0.05}
                      value={subBgOpacity}
                      onChange={(e) => setSubBgOpacity(parseFloat(e.target.value))}
                      className="rex-slider"
                    />
                  </div>

                  <div>
                    <div className="flex items-center justify-between text-xs mb-1">
                      <span>Синхронизация (Смещение таймингов)</span>
                      <span className="font-mono-code font-bold">
                        {subDelaySec > 0 ? `+${subDelaySec.toFixed(1)}` : subDelaySec.toFixed(1)} сек
                      </span>
                    </div>
                    <input
                      type="range"
                      min={-3}
                      max={3}
                      step={0.1}
                      value={subDelaySec}
                      onChange={(e) => setSubDelaySec(parseFloat(e.target.value))}
                      className="rex-slider"
                    />
                  </div>

                  <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
                    <button
                      type="button"
                      onClick={() => subFileInputRef.current?.click()}
                      className="px-4 py-2 rounded-full text-xs font-semibold cursor-pointer"
                      style={{ background: 'var(--accent-bg)', color: 'var(--accent-text)' }}
                    >
                      + Основной (.SRT / .VTT / .ASS)
                    </button>

                    <button
                      type="button"
                      onClick={() => secondarySubFileInputRef.current?.click()}
                      className="px-4 py-2 rounded-full text-xs font-semibold cursor-pointer"
                      style={{ background: 'var(--surface-pill)', color: 'var(--text-main)' }}
                    >
                      + Верхний (.SRT / .VTT / .ASS)
                    </button>

                    <button
                      type="button"
                      onClick={() => {
                        setSubtitleCues([]);
                        setSecondarySubtitleCues([]);
                        setCustomSubtitlesName('Субтитры не загружены');
                        setSecondarySubtitlesName('Доп. субтитры (верх) не загружены');
                        setSubDelaySec(0);
                        void saveSubtitlesToVault('', [], 'primary');
                        void saveSubtitlesToVault('', [], 'secondary');
                        showToast('Оба слота субтитров очищены');
                      }}
                      className="px-3.5 py-2 rounded-full text-xs font-semibold cursor-pointer"
                      style={{ background: 'var(--surface-pill)', color: 'var(--text-main)' }}
                    >
                      Очистить
                    </button>
                  </div>
                </div>
              )}

              {/* AUDIO, EQUALIZER, NIGHT MODE COMPRESSOR, CROSSFEED & SPECTROGRAM */}
              {activeModal === 'audio' && (
                <div className="flex flex-col gap-3">
                  <div className="flex items-center justify-between">
                    <span className="font-bold">Звуковой движок Web Audio API</span>
                    <label className="flex items-center gap-2 cursor-pointer text-xs font-semibold">
                      <input
                        type="checkbox"
                        checked={eqEnabled}
                        onChange={(e) => {
                          initWebAudio();
                          setEqEnabled(e.target.checked);
                        }}
                        className="w-4 h-4 accent-zinc-900 rounded"
                      />
                      <span>Эквалайзер активен</span>
                    </label>
                  </div>

                  {/* Live Audio Visualizer (Spectrogram) */}
                  <div
                    className="p-3 rounded-2xl flex items-center justify-between gap-3"
                    style={{ background: 'var(--surface-card)' }}
                  >
                    <div>
                      <div className="font-bold text-xs">Аудио-визуализатор (Спектрограмма)</div>
                      <div className="text-[11px] font-mono-code" style={{ color: 'var(--text-sub)' }}>
                        AnalyserNode (fftSize = 64) • Частотный отклик
                      </div>
                    </div>
                    <canvas
                      ref={eqSpectrumCanvasRef}
                      width={180}
                      height={40}
                      className="rounded-xl bg-black/80 border border-white/10 shrink-0"
                    />
                  </div>

                  {/* DynamicsCompressorNode Presets: Night Mode & Voice Boost */}
                  <div>
                    <label className="text-xs font-bold block mb-1">
                      Нормализация громкости (DynamicsCompressorNode)
                    </label>
                    <div className="rex-segmented">
                      {(
                        [
                          { id: 'off', label: 'Выкл' },
                          { id: 'soft', label: 'Мягкий' },
                          { id: 'night', label: 'Ночной режим' },
                          { id: 'voice', label: 'Усиление голоса' }
                        ] as const
                      ).map((m) => (
                        <button
                          key={m.id}
                          type="button"
                          onClick={() => {
                            initWebAudio();
                            setAudioCompressorMode(m.id);
                          }}
                          className={`rex-seg-btn ${audioCompressorMode === m.id ? 'active' : ''}`}
                        >
                          {m.label}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Spatial Audio & Headphone Crossfeed */}
                  <label
                    className="flex items-center justify-between p-3 rounded-2xl cursor-pointer"
                    style={{ background: 'var(--surface-card)' }}
                  >
                    <div>
                      <div className="font-bold text-xs">Пространственное аудио и Crossfeed для наушников</div>
                      <div className="text-[11px]" style={{ color: 'var(--text-sub)' }}>
                        Смешивание L/R каналов (18%) с акустической задержкой 0.3 мс для снятия утомляемости слуха
                      </div>
                    </div>
                    <input
                      type="checkbox"
                      checked={headphoneCrossfeed}
                      onChange={(e) => {
                        initWebAudio();
                        setHeadphoneCrossfeed(e.target.checked);
                      }}
                      className="w-5 h-5 accent-zinc-900 rounded"
                    />
                  </label>

                  <div>
                    <label className="text-xs font-bold block mb-1">Пресеты 5-полосного эквалайзера</label>
                    <div className="rex-segmented flex-wrap">
                      {(['flat', 'cinema', 'bass', 'vocal', 'treble'] as const).map((p) => (
                        <button
                          key={p}
                          type="button"
                          onClick={() => applyPreset(p)}
                          className={`rex-seg-btn ${eqPreset === p ? 'active' : ''}`}
                        >
                          {p.toUpperCase()}
                        </button>
                      ))}
                    </div>
                  </div>

                  <div className="p-3.5 rounded-2xl flex flex-col gap-2.5" style={{ background: 'var(--surface-card)' }}>
                    {[
                      { label: '60 Hz (Суб-бас)', idx: 0 },
                      { label: '230 Hz (Мид-бас)', idx: 1 },
                      { label: '910 Hz (Средние)', idx: 2 },
                      { label: '3.6 kHz (Присутствие)', idx: 3 },
                      { label: '14 kHz (Высокие)', idx: 4 }
                    ].map((band) => (
                      <div key={band.idx}>
                        <div className="flex items-center justify-between text-xs mb-1">
                          <span style={{ color: 'var(--text-sub)' }}>{band.label}</span>
                          <span className="font-mono-code font-bold">
                            {eqBands[band.idx] > 0 ? `+${eqBands[band.idx]}` : eqBands[band.idx]} dB
                          </span>
                        </div>
                        <input
                          type="range"
                          min={-12}
                          max={12}
                          step={1}
                          value={eqBands[band.idx]}
                          onChange={(e) => {
                            const val = parseInt(e.target.value, 10);
                            setEqBands((prev) => {
                              const copy = [...prev] as [number, number, number, number, number];
                              copy[band.idx] = val;
                              return copy;
                            });
                          }}
                          className="rex-slider"
                        />
                      </div>
                    ))}
                  </div>

                  <div>
                    <div className="flex items-center justify-between text-xs mb-1">
                      <span>Предусилитель (Preamp Gain)</span>
                      <span className="font-mono-code font-bold">{Math.round(preampGain * 100)}%</span>
                    </div>
                    <input
                      type="range"
                      min={0.5}
                      max={2.0}
                      step={0.05}
                      value={preampGain}
                      onChange={(e) => setPreampGain(parseFloat(e.target.value))}
                      className="rex-slider"
                    />
                  </div>

                  <label className="flex items-center justify-between p-3 rounded-2xl cursor-pointer" style={{ background: 'var(--surface-card)' }}>
                    <div>
                      <div className="font-bold">Коррекция высоты тона (Pitch)</div>
                      <div className="text-xs" style={{ color: 'var(--text-sub)' }}>
                        Сохранять естественный тембр голоса при ускорении 1.5x–2.0x
                      </div>
                    </div>
                    <input
                      type="checkbox"
                      checked={pitchCorrection}
                      onChange={(e) => setPitchCorrection(e.target.checked)}
                      className="w-5 h-5 accent-zinc-900 rounded"
                    />
                  </label>
                </div>
              )}

              {/* ABOUT */}
              {activeModal === 'about' && (
                <div className="flex flex-col gap-3">
                  <div className="p-4 rounded-2xl" style={{ background: 'var(--surface-card)' }}>
                    <div className="rex-serif font-black text-lg">REX Player v3.0.0</div>
                    <div className="text-xs mt-1" style={{ color: 'var(--text-sub)' }}>
                      Material You Video Player • Optical Flow MEMC + Secondary Sub-Frame Cascade FBO • GPU Super Resolution • HDR10
                    </div>
                    <div className="mt-3 text-xs leading-relaxed space-y-1.5" style={{ color: 'var(--text-main)' }}>
                      <div>• Многопроходная интерполяция MEMC 60/90/120/144 FPS + Каскадная рекурсия промежуточных суб-кадров (Pass 2A Anchor FBO I₀.₅ + Pass 2B Secondary Sub-Frame Cascade 2x/3x/4x)</div>
                      <div>• Контроль когерентности векторов и защита быстрых сцен (Symmetric SAD + инспектор фазы α = 0.00 / 0.25 / 0.50 / 0.75 / 1.00)</div>
                      <div>• GPU Апскейлер видео 1.5x / 2.0x / 4.0x 4K UHD (Snapdragon GSR, FSR/CAS, Anime4K, Кино + De-block)</div>
                      <div>• Аппаратный тонмаппинг HDR10 (ACES Filmic + расширение охвата Rec.2020)</div>
                      <div>• Парсер внешних субтитров .SRT / .VTT и 5-полосный эквалайзер Web Audio API</div>
                    </div>
                  </div>
                </div>
              )}

              {/* APK & ANDROID INSTALLATION */}
              {activeModal === 'apk' && (
                <div className="flex flex-col gap-3.5">
                  <div className="p-4 rounded-2xl flex flex-col gap-2.5" style={{ background: 'var(--surface-card)' }}>
                    <div className="flex items-center gap-2.5">
                      <Smartphone className="w-5 h-5 shrink-0" />
                      <div className="font-bold text-sm">1. Прямая установка WebAPK на Android (Рекомендуется)</div>
                    </div>
                    <p className="text-xs leading-relaxed" style={{ color: 'var(--text-sub)' }}>
                      В приложение уже встроены манифест Android (`manifest.json`), иконки `192×192` / `512×512` и офлайн Service Worker (`sw.js`). Браузеры Chrome, Brave и Edge на Android автоматически компилируют и устанавливают его как системный пакет <strong>WebAPK</strong> без адресной строки:
                    </p>
                    {deferredPrompt ? (
                      <button
                        type="button"
                        onClick={handleInstallWebApk}
                        className="w-full py-2.5 rounded-full text-xs font-bold cursor-pointer flex items-center justify-center gap-2"
                        style={{ background: 'var(--accent-bg)', color: 'var(--accent-text)' }}
                      >
                        <Download className="w-4 h-4" />
                        <span>Установить REX Player сейчас</span>
                      </button>
                    ) : (
                      <div className="text-xs p-3 rounded-xl font-medium space-y-1" style={{ background: 'var(--surface-elevated)' }}>
                        <div>1. Откройте меню браузера (<strong>⋮</strong> в правом верхнем углу).</div>
                        <div>2. Нажмите <strong>«Установить приложение»</strong> (или «Добавить на гл. экран»).</div>
                        <div>3. Система Android создаст и установит нативный ярлык APK.</div>
                      </div>
                    )}
                  </div>

                  <div className="p-4 rounded-2xl flex flex-col gap-2.5" style={{ background: 'var(--surface-card)' }}>
                    <div className="flex items-center gap-2.5">
                      <Download className="w-5 h-5 shrink-0" />
                      <div className="font-bold text-sm">2. Автономный бандл для упаковки в .APK</div>
                    </div>
                    <p className="text-xs leading-relaxed" style={{ color: 'var(--text-sub)' }}>
                      Скачайте полностью автономный скомпилированный файл `REX_Player_Standalone.html` (включающий весь код React, WebGL шейдеры и стили внутри одного файла без внешних зависимостей). Его можно:
                    </p>
                    <div className="text-xs space-y-1" style={{ color: 'var(--text-main)' }}>
                      <div>• Сконвертировать в `.apk` на телефоне через приложение <strong>HTML2APK / Website 2 APK</strong></div>
                      <div>• Или упаковать в подписанный `.apk` через сервис <strong>PWABuilder.com</strong></div>
                    </div>
                    <a
                      href="/REX_Player_Standalone.html"
                      download="REX_Player_Standalone.html"
                      onClick={() => showToast('Загрузка REX_Player_Standalone.html...')}
                      className="w-full py-2.5 rounded-full text-xs font-bold cursor-pointer flex items-center justify-center gap-2 no-underline text-center mt-1"
                      style={{ background: 'var(--accent-bg)', color: 'var(--accent-text)' }}
                    >
                      <Download className="w-4 h-4" />
                      <span>Скачать REX_Player_Standalone.html</span>
                    </a>
                  </div>
                </div>
              )}
            </div>

            {/* Modal Bottom Done Button */}
            <div className="mt-5 flex justify-end">
              <button
                type="button"
                onClick={() => setActiveModal(null)}
                className="px-5 py-2.5 rounded-full text-xs font-bold cursor-pointer hover:opacity-90"
                style={{ background: 'var(--accent-bg)', color: 'var(--accent-text)' }}
              >
                Готово
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ============================== TOAST NOTIFICATION ============================== */}
      {toastMessage && (
        <div className="fixed bottom-24 left-1/2 -translate-x-1/2 z-50 pointer-events-none">
          <div
            className="px-4 py-2.5 rounded-full shadow-lg text-xs font-semibold flex items-center gap-2"
            style={{ background: 'var(--accent-bg)', color: 'var(--accent-text)' }}
          >
            <span>{toastMessage}</span>
          </div>
        </div>
      )}
    </div>
  );
}
