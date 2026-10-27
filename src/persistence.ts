export interface SubtitleCue {
  start: number;
  end: number;
  text: string;
  align?: number; // 1..9 ASS alignment (\an8 = top center, \an2 = bottom center)
  posX?: number;
  posY?: number;
}

export interface VideoBookmark {
  id: string;
  time: number;
  label: string;
  createdAt: number;
}

export interface PersistedAppSettings {
  activeScreen: 'main' | 'settings' | 'player';
  activeTab: 'home' | 'you';
  darkTheme: boolean;
  compactGrid: boolean;
  aspectMode: 'contain' | 'cover' | 'fill';
  playbackRate: number;
  volume: number;
  isMuted: boolean;
  videoBrightness: number;
  videoContrast: number;
  videoSaturation: number;
  videoBlackPoint: number;
  debandEnabled: boolean;
  debandStrength: number;
  ambilightEnabled: boolean;
  autoCropBlackBars: boolean;
  lutPreset: 'off' | 'teal_orange' | 'kodak_2383' | 'anime_vibrant' | 'cyberpunk' | 'custom';
  lutStrength: number;
  hdrEnabled: boolean;
  hdrStrength: number;
  upscaleEnabled: boolean;
  upscaleMode: 'gsr' | 'fsr' | 'anime4k' | 'cinema';
  upscaleFactor: 'auto' | 1.5 | 2.0 | 4.0;
  upscaleSharpness: number;
  upscaleDenoise: number;
  adrenoMode: 'auto' | 'on' | 'off';
  adrenoGmemFp16: boolean;
  adrenoTrue10Hdr: boolean;
  ecoThermalMode: boolean;
  flowScaleMode: 'auto' | 'performance' | 'balanced' | 'ultra' | 'extreme' | 'high' | 'max';
  subframeBufferResMode: 'auto' | '720p' | '1080p' | '1440p';
  processorMenuCollapsed: boolean;
  topToolbarCollapsed: boolean;
  fsToolbarCollapsed: boolean;
  transportCollapsed: boolean;
  collapsedSections: {
    adreno: boolean;
    memc: boolean;
    hdr: boolean;
    upscale: boolean;
    fineTune: boolean;
  };
  interpEnabled: boolean;
  interpMode: 'off' | 'blend' | 'optical';
  targetFps: 60 | 90 | 120 | 144 | 'auto';
  interpStrength: number;
  motionScale: number;
  dejudderHaloControl: number;
  subframeCascadeEnabled: boolean;
  subframeCascadeMode: 'auto' | '2x' | '3x' | '4x';
  subframeCoherenceGuard: number;
  detectedDisplayHz: number;
  monochromeFilter: boolean;
  showVectors: boolean;
  showSadHeatmap: boolean;
  sceneCutProtection: boolean;
  splitCompareMode: boolean;
  subtitlesEnabled: boolean;
  secondarySubtitlesEnabled: boolean;
  subFontSize: number;
  subDelaySec: number;
  subBgOpacity: number;
  eqEnabled: boolean;
  eqPreset: 'flat' | 'cinema' | 'bass' | 'vocal' | 'treble';
  preampGain: number;
  pitchCorrection: boolean;
  eqBands: [number, number, number, number, number];
  audioCompressorMode: 'off' | 'soft' | 'night' | 'voice';
  headphoneCrossfeed: boolean;
  autoPlayNext: boolean;
  loopPlayback: boolean;
  rememberPosition: boolean;
  autoBindMediaOnStart: boolean;
  showTopHud: boolean;
  showHudTelemetryGraph: boolean;
  showStepButtons: boolean;
  showSnapshotBtn: boolean;
  doubleTapSeekSec: number;
  swipeVolumeBright: boolean;
  longPressSpeed2x: boolean;
  videoOutputMode: 'webgl_direct' | 'video_fallback';
  lastActiveVideoId: string;
}

export interface ProcessorPresetSettings {
  hdrEnabled: boolean;
  hdrStrength: number;
  upscaleEnabled: boolean;
  upscaleMode: 'gsr' | 'fsr' | 'anime4k' | 'cinema';
  upscaleFactor: 'auto' | 1.5 | 2.0 | 4.0;
  upscaleSharpness: number;
  upscaleDenoise: number;
  adrenoMode: 'auto' | 'on' | 'off';
  adrenoGmemFp16: boolean;
  adrenoTrue10Hdr: boolean;
  ecoThermalMode?: boolean;
  flowScaleMode: 'auto' | 'performance' | 'balanced' | 'ultra' | 'extreme' | 'high' | 'max';
  subframeBufferResMode?: 'auto' | '720p' | '1080p' | '1440p';
  interpEnabled: boolean;
  interpMode: 'off' | 'blend' | 'optical';
  targetFps: 60 | 90 | 120 | 144 | 'auto';
  interpStrength: number;
  motionScale: number;
  dejudderHaloControl: number;
  subframeCascadeEnabled?: boolean;
  subframeCascadeMode?: 'auto' | '2x' | '3x' | '4x';
  subframeCoherenceGuard?: number;
  sceneCutProtection: boolean;
  videoBrightness?: number;
  videoContrast?: number;
  videoSaturation?: number;
  videoBlackPoint?: number;
  debandEnabled?: boolean;
  debandStrength?: number;
  lutPreset?: 'off' | 'teal_orange' | 'kodak_2383' | 'anime_vibrant' | 'cyberpunk' | 'custom';
  lutStrength?: number;
  eqEnabled?: boolean;
  eqPreset?: 'flat' | 'cinema' | 'bass' | 'vocal' | 'treble';
  preampGain?: number;
  eqBands?: [number, number, number, number, number];
  audioCompressorMode?: 'off' | 'soft' | 'night' | 'voice';
  headphoneCrossfeed?: boolean;
}

export interface UserCustomPreset {
  id: string;
  name: string;
  createdAt: number;
  settings: ProcessorPresetSettings;
}

export interface CachedVideoRecord {
  id: string;
  title: string;
  blob?: Blob;
  remoteUrl?: string;
  fps: number;
  duration: number;
  size: string;
  sourceLabel: string;
  resolution?: string;
  thumbnailDataUrl?: string;
  addedAt: number;
}

const SETTINGS_STORAGE_KEY = 'rex_player_settings_v2';
const POSITIONS_STORAGE_KEY = 'rex_saved_positions_v2';
const PRESETS_STORAGE_KEY = 'rex_user_presets_v2';

export const DEFAULT_APP_SETTINGS: PersistedAppSettings = {
  activeScreen: 'main',
  activeTab: 'home',
  darkTheme: false,
  compactGrid: false,
  aspectMode: 'contain',
  playbackRate: 1.0,
  volume: 0.8,
  isMuted: false,
  videoBrightness: 1.0,
  videoContrast: 1.0,
  videoSaturation: 1.0,
  videoBlackPoint: 0.0,
  debandEnabled: true,
  debandStrength: 0.65,
  ambilightEnabled: true,
  autoCropBlackBars: false,
  lutPreset: 'off',
  lutStrength: 0.85,
  hdrEnabled: false,
  hdrStrength: 1.0,
  upscaleEnabled: true,
  upscaleMode: 'gsr',
  upscaleFactor: 'auto',
  upscaleSharpness: 0.85,
  upscaleDenoise: 0.65,
  adrenoMode: 'auto',
  adrenoGmemFp16: true,
  adrenoTrue10Hdr: true,
  ecoThermalMode: true,
  flowScaleMode: 'auto',
  subframeBufferResMode: 'auto',
  processorMenuCollapsed: false,
  topToolbarCollapsed: false,
  fsToolbarCollapsed: false,
  transportCollapsed: false,
  collapsedSections: {
    adreno: false,
    memc: false,
    hdr: false,
    upscale: false,
    fineTune: false
  },
  interpEnabled: true,
  interpMode: 'optical',
  targetFps: 'auto',
  interpStrength: 1.0,
  motionScale: 20,
  dejudderHaloControl: 70,
  subframeCascadeEnabled: true,
  subframeCascadeMode: 'auto',
  subframeCoherenceGuard: 75,
  detectedDisplayHz: 60,
  monochromeFilter: false,
  showVectors: false,
  showSadHeatmap: false,
  sceneCutProtection: true,
  splitCompareMode: false,
  subtitlesEnabled: true,
  secondarySubtitlesEnabled: true,
  subFontSize: 18,
  subDelaySec: 0.0,
  subBgOpacity: 0.72,
  eqEnabled: true,
  eqPreset: 'flat',
  preampGain: 1.0,
  pitchCorrection: true,
  eqBands: [0, 0, 0, 0, 0],
  audioCompressorMode: 'off',
  headphoneCrossfeed: false,
  autoPlayNext: true,
  loopPlayback: true,
  rememberPosition: true,
  autoBindMediaOnStart: true,
  showTopHud: true,
  showHudTelemetryGraph: true,
  showStepButtons: true,
  showSnapshotBtn: true,
  doubleTapSeekSec: 5,
  swipeVolumeBright: true,
  longPressSpeed2x: true,
  videoOutputMode: 'webgl_direct',
  lastActiveVideoId: ''
};

function sanitizeInterpMode(rawMode: unknown): 'off' | 'blend' | 'optical' {
  if (rawMode === 'off' || rawMode === 'blend' || rawMode === 'optical') {
    return rawMode;
  }
  return 'optical';
}

function sanitizeUpscaleMode(
  rawMode: unknown
): 'gsr' | 'fsr' | 'anime4k' | 'cinema' {
  if (
    rawMode === 'gsr' ||
    rawMode === 'fsr' ||
    rawMode === 'anime4k' ||
    rawMode === 'cinema'
  ) {
    return rawMode;
  }
  return 'gsr';
}

function sanitizeUpscaleFactor(rawFactor: unknown): 'auto' | 1.5 | 2.0 | 4.0 {
  if (
    rawFactor === 'auto' ||
    rawFactor === 1.5 ||
    rawFactor === 2.0 ||
    rawFactor === 4.0
  ) {
    return rawFactor;
  }
  return 'auto';
}

function sanitizeFlowScaleMode(
  rawMode: unknown
): 'auto' | 'performance' | 'balanced' | 'ultra' | 'extreme' | 'high' | 'max' {
  if (
    rawMode === 'auto' ||
    rawMode === 'performance' ||
    rawMode === 'balanced' ||
    rawMode === 'ultra' ||
    rawMode === 'extreme' ||
    rawMode === 'high' ||
    rawMode === 'max'
  ) {
    return rawMode;
  }
  return 'auto';
}

function sanitizeSubframeBufferResMode(
  rawMode: unknown
): 'auto' | '720p' | '1080p' | '1440p' {
  if (
    rawMode === 'auto' ||
    rawMode === '720p' ||
    rawMode === '1080p' ||
    rawMode === '1440p'
  ) {
    return rawMode;
  }
  return 'auto';
}

function sanitizeMotionScale(rawVal: unknown): number {
  if (typeof rawVal === 'number' && isFinite(rawVal)) {
    return Math.max(4, Math.min(48, Math.round(rawVal)));
  }
  return DEFAULT_APP_SETTINGS.motionScale;
}

function sanitizeSubframeCascadeMode(
  rawMode: unknown
): 'auto' | '2x' | '3x' | '4x' {
  if (rawMode === 'auto' || rawMode === '2x' || rawMode === '3x' || rawMode === '4x') {
    return rawMode;
  }
  return 'auto';
}

function sanitizeSubframeCoherenceGuard(rawVal: unknown): number {
  if (typeof rawVal === 'number' && isFinite(rawVal)) {
    return Math.max(0, Math.min(100, Math.round(rawVal)));
  }
  return DEFAULT_APP_SETTINGS.subframeCoherenceGuard;
}

export function loadPersistedSettings(): PersistedAppSettings {
  try {
    const raw = localStorage.getItem(SETTINGS_STORAGE_KEY);
    if (!raw) return DEFAULT_APP_SETTINGS;
    const parsed = JSON.parse(raw) as Partial<PersistedAppSettings> & {
      interpMode?: unknown;
      upscaleMode?: unknown;
      upscaleFactor?: unknown;
      flowScaleMode?: unknown;
      subframeBufferResMode?: unknown;
      motionScale?: unknown;
      subframeCascadeMode?: unknown;
      subframeCoherenceGuard?: unknown;
    };
    return {
      ...DEFAULT_APP_SETTINGS,
      ...parsed,
      interpMode: sanitizeInterpMode(parsed.interpMode),
      upscaleMode: sanitizeUpscaleMode(parsed.upscaleMode),
      upscaleFactor: sanitizeUpscaleFactor(parsed.upscaleFactor),
      flowScaleMode: sanitizeFlowScaleMode(parsed.flowScaleMode),
      subframeBufferResMode: sanitizeSubframeBufferResMode(parsed.subframeBufferResMode),
      motionScale: sanitizeMotionScale(parsed.motionScale),
      subframeCascadeMode: sanitizeSubframeCascadeMode(parsed.subframeCascadeMode),
      subframeCoherenceGuard: sanitizeSubframeCoherenceGuard(parsed.subframeCoherenceGuard),
      collapsedSections: {
        ...DEFAULT_APP_SETTINGS.collapsedSections,
        ...(parsed.collapsedSections || {})
      },
      eqBands:
        Array.isArray(parsed.eqBands) && parsed.eqBands.length === 5
          ? (parsed.eqBands as [number, number, number, number, number])
          : DEFAULT_APP_SETTINGS.eqBands
    };
  } catch {
    return DEFAULT_APP_SETTINGS;
  }
}

export function savePersistedSettings(settings: PersistedAppSettings): void {
  try {
    localStorage.setItem(SETTINGS_STORAGE_KEY, JSON.stringify(settings));
  } catch {
    // Ignore storage quota errors
  }
}

export function resetPersistedSettings(): PersistedAppSettings {
  try {
    localStorage.removeItem(SETTINGS_STORAGE_KEY);
  } catch {
    // Ignore
  }
  return { ...DEFAULT_APP_SETTINGS };
}

export function loadSavedPositions(): Record<string, number> {
  try {
    const raw = localStorage.getItem(POSITIONS_STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
}

export function saveSavedPositions(positions: Record<string, number>): void {
  try {
    localStorage.setItem(POSITIONS_STORAGE_KEY, JSON.stringify(positions));
  } catch {
    // Ignore
  }
}

export function loadUserPresets(): UserCustomPreset[] {
  try {
    const raw = localStorage.getItem(PRESETS_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.map((p: UserCustomPreset) => ({
      ...p,
      settings: {
        ...p.settings,
        interpMode: sanitizeInterpMode(p?.settings?.interpMode),
        upscaleMode: sanitizeUpscaleMode(p?.settings?.upscaleMode),
        upscaleFactor: sanitizeUpscaleFactor(p?.settings?.upscaleFactor),
        flowScaleMode: sanitizeFlowScaleMode(p?.settings?.flowScaleMode),
        subframeBufferResMode: sanitizeSubframeBufferResMode(p?.settings?.subframeBufferResMode),
        motionScale: sanitizeMotionScale(p?.settings?.motionScale),
        subframeCascadeMode: sanitizeSubframeCascadeMode(p?.settings?.subframeCascadeMode),
        subframeCoherenceGuard: sanitizeSubframeCoherenceGuard(p?.settings?.subframeCoherenceGuard)
      }
    }));
  } catch {
    return [];
  }
}

export function saveUserPresets(presets: UserCustomPreset[]): void {
  try {
    localStorage.setItem(PRESETS_STORAGE_KEY, JSON.stringify(presets));
  } catch {
    // Ignore
  }
}

// ============================================================================
// IndexedDB Smartphone Media Vault (rex_media_vault_v1)
// Automatically caches local smartphone video files, directory handles & subtitles
// ============================================================================

const DB_NAME = 'rex_media_vault_v1';
const DB_VERSION = 1;
const STORE_VIDEOS = 'videos';
const STORE_HANDLES = 'handles';
const STORE_SUBTITLES = 'subtitles';

let cachedVaultDbPromise: Promise<IDBDatabase> | null = null;

function openMediaVaultDb(): Promise<IDBDatabase> {
  if (cachedVaultDbPromise) {
    return cachedVaultDbPromise;
  }
  cachedVaultDbPromise = new Promise((resolve, reject) => {
    if (typeof indexedDB === 'undefined') {
      cachedVaultDbPromise = null;
      reject(new Error('IndexedDB not supported'));
      return;
    }
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE_VIDEOS)) {
        db.createObjectStore(STORE_VIDEOS, { keyPath: 'id' });
      }
      if (!db.objectStoreNames.contains(STORE_HANDLES)) {
        db.createObjectStore(STORE_HANDLES, { keyPath: 'id' });
      }
      if (!db.objectStoreNames.contains(STORE_SUBTITLES)) {
        db.createObjectStore(STORE_SUBTITLES, { keyPath: 'id' });
      }
    };
    req.onsuccess = () => {
      const db = req.result;
      db.onversionchange = () => {
        db.close();
        cachedVaultDbPromise = null;
      };
      db.onclose = () => {
        cachedVaultDbPromise = null;
      };
      resolve(db);
    };
    req.onerror = () => {
      cachedVaultDbPromise = null;
      reject(req.error);
    };
  });
  return cachedVaultDbPromise;
}

export async function saveVideoToVault(record: CachedVideoRecord): Promise<void> {
  try {
    const db = await openMediaVaultDb();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE_VIDEOS, 'readwrite');
      tx.objectStore(STORE_VIDEOS).put(record);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  } catch {
    // Gracefully ignore if private browsing or storage limit reached
  }
}

export async function updateVideoMetaInVault(
  id: string,
  duration?: number,
  resolution?: string,
  thumbnailDataUrl?: string
): Promise<void> {
  try {
    const db = await openMediaVaultDb();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE_VIDEOS, 'readwrite');
      const store = tx.objectStore(STORE_VIDEOS);
      const getReq = store.get(id);
      getReq.onsuccess = () => {
        const existing = getReq.result as CachedVideoRecord | undefined;
        if (existing) {
          store.put({
            ...existing,
            duration: duration && duration > 0 ? duration : existing.duration,
            resolution: resolution || existing.resolution,
            thumbnailDataUrl: thumbnailDataUrl || existing.thumbnailDataUrl
          });
        }
      };
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  } catch {
    // Ignore
  }
}

export async function loadVideosFromVault(): Promise<CachedVideoRecord[]> {
  try {
    const db = await openMediaVaultDb();
    const records = await new Promise<CachedVideoRecord[]>((resolve, reject) => {
      const tx = db.transaction(STORE_VIDEOS, 'readonly');
      const req = tx.objectStore(STORE_VIDEOS).getAll();
      req.onsuccess = () => resolve((req.result as CachedVideoRecord[]) || []);
      req.onerror = () => reject(req.error);
    });
    return records.sort((a, b) => b.addedAt - a.addedAt);
  } catch {
    return [];
  }
}

export async function deleteVideoFromVault(id: string): Promise<void> {
  try {
    const db = await openMediaVaultDb();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE_VIDEOS, 'readwrite');
      tx.objectStore(STORE_VIDEOS).delete(id);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  } catch {
    // Ignore
  }
}

export async function clearVaultVideos(): Promise<void> {
  try {
    const db = await openMediaVaultDb();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE_VIDEOS, 'readwrite');
      tx.objectStore(STORE_VIDEOS).clear();
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  } catch {
    // Ignore
  }
}

export async function saveDirectoryHandleToVault(
  handle: FileSystemDirectoryHandle,
  folderName: string
): Promise<void> {
  try {
    const db = await openMediaVaultDb();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE_HANDLES, 'readwrite');
      tx.objectStore(STORE_HANDLES).put({
        id: 'smartphone_dir',
        handle,
        folderName,
        updatedAt: Date.now()
      });
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  } catch {
    // Ignore
  }
}

export async function loadDirectoryHandleFromVault(): Promise<{
  handle: FileSystemDirectoryHandle;
  folderName: string;
} | null> {
  try {
    const db = await openMediaVaultDb();
    const res = await new Promise<{
      handle: FileSystemDirectoryHandle;
      folderName: string;
    } | null>((resolve, reject) => {
      const tx = db.transaction(STORE_HANDLES, 'readonly');
      const req = tx.objectStore(STORE_HANDLES).get('smartphone_dir');
      req.onsuccess = () => {
        if (req.result && req.result.handle) {
          resolve({
            handle: req.result.handle as FileSystemDirectoryHandle,
            folderName: String(req.result.folderName || 'Папка смартфона')
          });
        } else {
          resolve(null);
        }
      };
      req.onerror = () => reject(req.error);
    });
    return res;
  } catch {
    return null;
  }
}

export async function saveSubtitlesToVault(
  name: string,
  cues: SubtitleCue[],
  slot: 'primary' | 'secondary' = 'primary'
): Promise<void> {
  try {
    const db = await openMediaVaultDb();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE_SUBTITLES, 'readwrite');
      tx.objectStore(STORE_SUBTITLES).put({
        id: slot === 'secondary' ? 'secondary_subtitles' : 'last_subtitles',
        name,
        cues,
        updatedAt: Date.now()
      });
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  } catch {
    // Ignore
  }
}

export async function loadSubtitlesFromVault(
  slot: 'primary' | 'secondary' = 'primary'
): Promise<{
  name: string;
  cues: SubtitleCue[];
} | null> {
  try {
    const db = await openMediaVaultDb();
    const res = await new Promise<{ name: string; cues: SubtitleCue[] } | null>(
      (resolve, reject) => {
        const tx = db.transaction(STORE_SUBTITLES, 'readonly');
        const req = tx
          .objectStore(STORE_SUBTITLES)
          .get(slot === 'secondary' ? 'secondary_subtitles' : 'last_subtitles');
        req.onsuccess = () => {
          if (req.result && Array.isArray(req.result.cues) && req.result.cues.length > 0) {
            resolve({ name: String(req.result.name), cues: req.result.cues });
          } else {
            resolve(null);
          }
        };
        req.onerror = () => reject(req.error);
      }
    );
    return res;
  } catch {
    return null;
  }
}

const BOOKMARKS_STORAGE_KEY = 'rex_video_bookmarks_v1';

export function loadAllVideoBookmarks(): Record<string, VideoBookmark[]> {
  try {
    const raw = localStorage.getItem(BOOKMARKS_STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
}

export function saveAllVideoBookmarks(bookmarksMap: Record<string, VideoBookmark[]>): void {
  try {
    localStorage.setItem(BOOKMARKS_STORAGE_KEY, JSON.stringify(bookmarksMap));
  } catch {
    // Ignore
  }
}

