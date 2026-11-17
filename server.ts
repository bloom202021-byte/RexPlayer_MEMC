import express from 'express';
import path from 'path';
import { createServer as createViteServer } from 'vite';

const ANIXART_UA =
  'AnixartApp/9.0 BETA 5-25062213 (Android 13; SDK 33; arm64-v8a; Xiaomi M2102J20SG; ru)';
const BROWSER_UA =
  'Mozilla/5.0 (Linux; Android 13; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Mobile Safari/537.36';

const ANIXART_API_BASES = [
  'https://api.anixart.tv',
  'https://api.anixart.app',
  'https://api-s.anixsekai.com'
];

async function fetchAnixartJson(endpointPath: string): Promise<any> {
  let lastErr: unknown = null;
  for (const base of ANIXART_API_BASES) {
    try {
      const res = await fetch(`${base}${endpointPath}`, {
        headers: {
          'User-Agent': ANIXART_UA,
          Accept: 'application/json'
        },
        signal: AbortSignal.timeout(9000)
      });
      if (res.ok) {
        return await res.json();
      }
    } catch (err) {
      lastErr = err;
    }
  }
  throw lastErr || new Error(`Failed to fetch Anixart path: ${endpointPath}`);
}

function decodeKodikSrc(encoded: string): string {
  if (!encoded) return '';
  if (encoded.includes('//')) {
    return encoded.startsWith('//') ? `https:${encoded}` : encoded;
  }
  const rotated = encoded.replace(/[a-zA-Z]/g, (ch) => {
    const code = ch.charCodeAt(0) + 18;
    const limit = ch <= 'Z' ? 90 : 122;
    return String.fromCharCode(limit >= code ? code : code - 26);
  });
  let decoded = '';
  try {
    decoded = Buffer.from(rotated, 'base64').toString('utf8');
  } catch {
    decoded = encoded;
  }
  if (decoded.startsWith('//')) {
    return `https:${decoded}`;
  }
  if (!decoded.startsWith('http://') && !decoded.startsWith('https://') && decoded.includes('.')) {
    return `https://${decoded.replace(/^\/+/, '')}`;
  }
  return decoded;
}

function parseKodikSkipTimings(skipStr: string): Array<{ start: number; end: number; label: string }> {
  if (!skipStr) return [];
  const toSec = (t: string) => {
    const parts = t.trim().split(':').map((n) => parseInt(n, 10) || 0);
    if (parts.length === 1) return parts[0];
    if (parts.length === 2) return parts[0] * 60 + parts[1];
    return parts[0] * 3600 + parts[1] * 60 + parts[2];
  };
  const segments = skipStr.split(',').map((s) => s.trim()).filter(Boolean);
  const result: Array<{ start: number; end: number; label: string }> = [];
  segments.forEach((seg, idx) => {
    const m = seg.match(/^([0-9:]+)-([0-9:]+)$/);
    if (m) {
      const start = toSec(m[1]);
      const end = toSec(m[2]);
      if (end > start) {
        result.push({
          start,
          end,
          label: idx === 0 ? 'Пропустить опенинг' : 'Пропустить эндинг'
        });
      }
    }
  });
  return result;
}

export async function resolveKodikIframeUrl(rawIframeUrl: string): Promise<{
  streamUrl: string;
  streamType: 'hls' | 'mp4';
  qualities: Record<string, string>;
  thumbnails: string[];
  skipTimings: Array<{ start: number; end: number; label: string }>;
  translationTitle?: string;
}> {
  let cleanEmbedUrl = rawIframeUrl.trim();
  if (cleanEmbedUrl.startsWith('//')) {
    cleanEmbedUrl = `https:${cleanEmbedUrl}`;
  }
  const parsedUrl = new URL(cleanEmbedUrl);
  // Strip IP-bound temporary query parameters (?d=...&s=...&ip=...) that cause 500 ds error on Kodik
  const baseEmbedUrl = `${parsedUrl.origin}${parsedUrl.pathname}`;

  const pageRes = await fetch(baseEmbedUrl, {
    headers: {
      'User-Agent': BROWSER_UA,
      Referer: `${parsedUrl.origin}/`,
      Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8'
    }
  });

  if (!pageRes.ok) {
    throw new Error(`Kodik embed page returned HTTP ${pageRes.status}`);
  }

  const html = await pageRes.text();

  const domain = html.match(/var\s+domain\s*=\s*"([^"]+)"/)?.[1] || parsedUrl.hostname;
  const d_sign = html.match(/var\s+d_sign\s*=\s*"([^"]+)"/)?.[1] || '';
  const pd = html.match(/var\s+pd\s*=\s*"([^"]+)"/)?.[1] || domain;
  const pd_sign = html.match(/var\s+pd_sign\s*=\s*"([^"]+)"/)?.[1] || d_sign;
  const ref = html.match(/var\s+ref\s*=\s*"([^"]*)"/)?.[1] || `${parsedUrl.origin}/`;
  const ref_sign = html.match(/var\s+ref_sign\s*=\s*"([^"]+)"/)?.[1] || '';

  const vType =
    html.match(/vInfo\.type\s*=\s*['"]([^'"]+)['"]/)?.[1] ||
    html.match(/var\s+type\s*=\s*['"]([^'"]+)['"]/)?.[1] ||
    'seria';
  const vId =
    html.match(/vInfo\.id\s*=\s*['"]([^'"]+)['"]/)?.[1] ||
    html.match(/var\s+videoId\s*=\s*['"]([^'"]+)['"]/)?.[1] ||
    '';
  const vHash =
    html.match(/vInfo\.hash\s*=\s*['"]([^'"]+)['"]/)?.[1] ||
    parsedUrl.pathname.split('/').filter(Boolean)[2] ||
    '';

  const translationTitle = html.match(/var\s+translationTitle\s*=\s*"([^"]+)"/)?.[1];

  const thumbMatches = html.match(/var\s+thumbnails\s*=\s*\[([\s\S]*?)\];/);
  const thumbnails: string[] = [];
  if (thumbMatches && thumbMatches[1]) {
    for (const m of thumbMatches[1].matchAll(/"(https?:\/\/[^"]+)"/g)) {
      thumbnails.push(m[1]);
    }
  }

  const skipRaw = html.match(/parseSkipButton\("([^"]+)"/)?.[1] || '';
  const skipTimings = parseKodikSkipTimings(skipRaw);

  const ftorBody = new URLSearchParams({
    d: domain,
    d_sign,
    pd,
    pd_sign,
    ref,
    ref_sign,
    bad_user: 'false',
    cdn_is_working: 'true',
    type: vType,
    id: vId,
    hash: vHash,
    info: '{}'
  });

  const ftorRes = await fetch(`${parsedUrl.origin}/ftor`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
      'X-Requested-With': 'XMLHttpRequest',
      Origin: parsedUrl.origin,
      Referer: baseEmbedUrl,
      'User-Agent': BROWSER_UA
    },
    body: ftorBody.toString()
  });

  if (!ftorRes.ok) {
    throw new Error(`Kodik /ftor endpoint returned HTTP ${ftorRes.status}`);
  }

  const ftorData: any = await ftorRes.json();
  const qualities: Record<string, string> = {};

  if (ftorData.links && typeof ftorData.links === 'object') {
    for (const [qKey, linkArr] of Object.entries(ftorData.links)) {
      if (Array.isArray(linkArr) && linkArr.length > 0 && linkArr[0]?.src) {
        const decodedUrl = decodeKodikSrc(String(linkArr[0].src));
        if (decodedUrl) {
          const label = qKey.endsWith('p') ? qKey : `${qKey}p`;
          qualities[label] = decodedUrl;
        }
      }
    }
  }

  const preferredOrder = ['1080p', '720p', '480p', '360p', '240p'];
  let bestStream = '';
  for (const q of preferredOrder) {
    if (qualities[q]) {
      bestStream = qualities[q];
      break;
    }
  }
  if (!bestStream) {
    const allVals = Object.values(qualities);
    if (allVals.length > 0) bestStream = allVals[allVals.length - 1];
  }

  if (!bestStream && ftorData.link) {
    bestStream = decodeKodikSrc(String(ftorData.link));
    if (bestStream) qualities['Auto'] = bestStream;
  }

  if (!bestStream) {
    throw new Error('Не удалось извлечь прямую ссылку потока из Kodik');
  }

  const isHls = bestStream.includes('.m3u8') || bestStream.includes(':hls:');
  return {
    streamUrl: bestStream,
    streamType: isHls ? 'hls' : 'mp4',
    qualities,
    thumbnails,
    skipTimings,
    translationTitle
  };
}

async function resolveSibnetUrl(sibnetUrl: string): Promise<{
  streamUrl: string;
  streamType: 'mp4';
  qualities: Record<string, string>;
}> {
  const res = await fetch(sibnetUrl, {
    headers: {
      'User-Agent': BROWSER_UA,
      Referer: 'https://video.sibnet.ru/'
    }
  });
  const html = await res.text();
  const relMatch = html.match(/player\.src\(\[\{src:\s*["']([^"']+\.mp4[^"']*)["']/i);
  if (!relMatch) {
    throw new Error('Не удалось извлечь MP4 поток из Sibnet');
  }
  const directPath = relMatch[1].startsWith('http')
    ? relMatch[1]
    : `https://video.sibnet.ru${relMatch[1]}`;
  const headRes = await fetch(directPath, {
    method: 'HEAD',
    headers: {
      'User-Agent': BROWSER_UA,
      Referer: sibnetUrl
    },
    redirect: 'follow'
  });
  const finalUrl = headRes.url || directPath;
  const proxiedUrl = `/api/proxy-media?url=${encodeURIComponent(finalUrl)}&referer=${encodeURIComponent('https://video.sibnet.ru/')}`;
  return {
    streamUrl: proxiedUrl,
    streamType: 'mp4',
    qualities: { '720p': proxiedUrl }
  };
}

function extractAnixartReleaseId(inputUrl: string): string | null {
  const m = inputUrl.match(/anixart(?:-app)?\.(?:com|tv)\/release\/(\d+)/i);
  if (m) return m[1];
  return null;
}

async function startServer() {
  const app = express();
  const PORT = 3000;

  app.use(express.json());

  // 0. Serve exact version-matched ONNX Runtime Web WASM & WebGPU JSEP binaries from node_modules
  const ortDistPath = path.join(process.cwd(), 'node_modules', 'onnxruntime-web', 'dist');
  app.use(
    '/ort-wasm',
    express.static(ortDistPath, {
      setHeaders: (res, filePath) => {
        res.setHeader('Access-Control-Allow-Origin', '*');
        res.setHeader('Cache-Control', 'public, max-age=3600');
        if (filePath.endsWith('.wasm')) {
          res.setHeader('Content-Type', 'application/wasm');
        } else if (filePath.endsWith('.mjs') || filePath.endsWith('.js')) {
          res.setHeader('Content-Type', 'text/javascript; charset=utf-8');
        }
      }
    })
  );

  // 1. Anixart Release & Episode Directory Endpoint
  app.get('/api/anixart/release/:releaseId', async (req, res) => {
    try {
      const { releaseId } = req.params;
      const requestedTypeId = req.query.typeId ? Number(req.query.typeId) : undefined;
      const requestedSourceId = req.query.sourceId ? Number(req.query.sourceId) : undefined;

      const [relData, typesData] = await Promise.all([
        fetchAnixartJson(`/release/${releaseId}`),
        fetchAnixartJson(`/episode/${releaseId}`)
      ]);

      const rel = relData?.release;
      if (!rel) {
        res.status(404).json({ error: 'Релиз Anixart не найден' });
        return;
      }

      const types = Array.isArray(typesData?.types)
        ? typesData.types.map((t: any) => ({
            id: t.id,
            name: t.name,
            icon: t.icon || null,
            episodesCount: t.episodes_count || 0,
            viewCount: t.view_count || 0,
            isSub: Boolean(t.is_sub)
          }))
        : [];

      let selectedTypeId = requestedTypeId;
      if (!selectedTypeId || !types.some((t: any) => t.id === selectedTypeId)) {
        selectedTypeId = types[0]?.id;
      }

      let sources: Array<{ id: number; name: string; episodesCount: number }> = [];
      let selectedSourceId = requestedSourceId;
      let episodes: Array<{
        position: number;
        name: string;
        url: string;
        iframe: boolean;
        isFiller: boolean;
      }> = [];

      if (selectedTypeId !== undefined) {
        const srcData = await fetchAnixartJson(`/episode/${releaseId}/${selectedTypeId}`);
        sources = Array.isArray(srcData?.sources)
          ? srcData.sources.map((s: any) => ({
              id: s.id,
              name: s.name,
              episodesCount: s.episodes_count || 0
            }))
          : [];

        if (!selectedSourceId || !sources.some((s) => s.id === selectedSourceId)) {
          // Prefer Kodik or direct sources first
          const preferred = sources.find((s) => /kodik|anilibria|direct/i.test(s.name)) || sources[0];
          selectedSourceId = preferred?.id;
        }

        if (selectedSourceId !== undefined) {
          const epData = await fetchAnixartJson(
            `/episode/${releaseId}/${selectedTypeId}/${selectedSourceId}`
          );
          episodes = Array.isArray(epData?.episodes)
            ? epData.episodes.map((ep: any) => ({
                position: ep.position,
                name: ep.name || `${ep.position} серия`,
                url: ep.url,
                iframe: Boolean(ep.iframe),
                isFiller: Boolean(ep.is_filler)
              }))
            : [];
        }
      }

      res.json({
        release: {
          id: rel.id,
          titleRu: rel.title_ru || rel.title_original || `Релиз #${rel.id}`,
          titleOriginal: rel.title_original || '',
          poster: rel.image || rel.poster || '',
          year: rel.year || '',
          studio: rel.studio || '',
          genres: rel.genres || '',
          description: rel.description || '',
          episodesReleased: rel.episodes_released || episodes.length,
          episodesTotal: rel.episodes_total || episodes.length,
          grade: rel.grade || 0
        },
        types,
        selectedTypeId: selectedTypeId ?? null,
        sources,
        selectedSourceId: selectedSourceId ?? null,
        episodes
      });
    } catch (err: any) {
      res.status(500).json({
        error: err?.message || 'Ошибка при получении данных релиза Anixart'
      });
    }
  });

  // 2. Universal Stream Resolver Endpoint (Anixart Release, Kodik, Sibnet, Direct HLS/MP4, or Webpage)
  app.post('/api/resolve-stream', async (req, res) => {
    try {
      const rawUrl = String(req.body?.url || '').trim();
      const reqTypeId = req.body?.typeId ? Number(req.body.typeId) : undefined;
      const reqSourceId = req.body?.sourceId ? Number(req.body.sourceId) : undefined;
      const reqEpisodePos = req.body?.episodePosition ? Number(req.body.episodePosition) : undefined;

      if (!rawUrl) {
        res.status(400).json({ error: 'URL не указан' });
        return;
      }

      // Case A: Anixart Release URL (e.g. https://anixart-app.com/release/20398)
      const releaseId = extractAnixartReleaseId(rawUrl);
      if (releaseId) {
        const [relData, typesData] = await Promise.all([
          fetchAnixartJson(`/release/${releaseId}`),
          fetchAnixartJson(`/episode/${releaseId}`)
        ]);

        const rel = relData?.release;
        if (!rel) {
          res.status(404).json({ error: `Релиз Anixart #${releaseId} не найден` });
          return;
        }

        const types = Array.isArray(typesData?.types)
          ? typesData.types.map((t: any) => ({
              id: t.id,
              name: t.name,
              icon: t.icon || null,
              episodesCount: t.episodes_count || 0,
              viewCount: t.view_count || 0,
              isSub: Boolean(t.is_sub)
            }))
          : [];

        if (types.length === 0) {
          res.status(404).json({ error: 'Для данного релиза еще нет доступных озвучек или серий' });
          return;
        }

        const chosenType =
          (reqTypeId ? types.find((t: any) => t.id === reqTypeId) : undefined) || types[0];
        const srcData = await fetchAnixartJson(`/episode/${releaseId}/${chosenType.id}`);
        const sources = Array.isArray(srcData?.sources)
          ? srcData.sources.map((s: any) => ({
              id: s.id,
              name: s.name,
              episodesCount: s.episodes_count || 0
            }))
          : [];

        if (sources.length === 0) {
          res.status(404).json({ error: 'Для выбранной озвучки не найдены источники видео' });
          return;
        }

        const orderedSources = [
          ...(reqSourceId ? sources.filter((s: any) => s.id === reqSourceId) : []),
          ...sources.filter((s: any) => /kodik|anilibria|direct/i.test(s.name) && s.id !== reqSourceId),
          ...sources.filter((s: any) => !/kodik|anilibria|direct/i.test(s.name) && s.id !== reqSourceId)
        ];

        let chosenSource = orderedSources[0] || sources[0];
        let episodes: Array<{
          position: number;
          name: string;
          url: string;
          iframe: boolean;
          isFiller: boolean;
        }> = [];
        let chosenEp: {
          position: number;
          name: string;
          url: string;
          iframe: boolean;
          isFiller: boolean;
        } | null = null;
        let resolvedStream: {
          streamUrl: string;
          streamType: 'hls' | 'mp4';
          qualities: Record<string, string>;
          thumbnails?: string[];
          skipTimings?: Array<{ start: number; end: number; label: string }>;
        } | null = null;
        let lastSourceErr: unknown = null;

        for (const candidateSource of orderedSources) {
          try {
            const epData = await fetchAnixartJson(
              `/episode/${releaseId}/${chosenType.id}/${candidateSource.id}`
            );
            const candidateEpisodes = Array.isArray(epData?.episodes)
              ? epData.episodes.map((ep: any) => ({
                  position: ep.position,
                  name: ep.name || `${ep.position} серия`,
                  url: ep.url,
                  iframe: Boolean(ep.iframe),
                  isFiller: Boolean(ep.is_filler)
                }))
              : [];

            if (candidateEpisodes.length === 0) continue;

            const candidateEp =
              (reqEpisodePos !== undefined
                ? candidateEpisodes.find((e: any) => e.position === reqEpisodePos)
                : undefined) || candidateEpisodes[0];

            let targetUrl = candidateEp.url;
            if (!targetUrl) {
              const targetData = await fetchAnixartJson(
                `/episode/target/${releaseId}/${candidateSource.id}/${candidateEp.position}`
              );
              targetUrl = targetData?.episode?.url || '';
            }
            if (!targetUrl) continue;

            if (/kodik|aniqit/i.test(targetUrl)) {
              resolvedStream = await resolveKodikIframeUrl(targetUrl);
            } else if (/sibnet\.ru/i.test(targetUrl)) {
              resolvedStream = await resolveSibnetUrl(targetUrl);
            } else {
              const isHls = targetUrl.includes('.m3u8') || targetUrl.includes(':hls:');
              resolvedStream = {
                streamUrl: targetUrl,
                streamType: isHls ? 'hls' : 'mp4',
                qualities: { Auto: targetUrl }
              };
            }

            chosenSource = candidateSource;
            episodes = candidateEpisodes;
            chosenEp = candidateEp;
            break;
          } catch (err) {
            lastSourceErr = err;
          }
        }

        if (!resolvedStream || !chosenEp) {
          res.status(502).json({
            error:
              (lastSourceErr as any)?.message ||
              'Не удалось извлечь видеопоток ни из одного источника для выбранной озвучки'
          });
          return;
        }

        const releaseTitle = rel.title_ru || rel.title_original || `Release ${releaseId}`;
        const fullTitle = `${releaseTitle} — ${chosenEp.name} (${chosenType.name})`;

        res.json({
          streamUrl: resolvedStream.streamUrl,
          streamType: resolvedStream.streamType,
          qualities: resolvedStream.qualities,
          title: fullTitle,
          sourceLabel: `Anixart • ${chosenType.name}`,
          poster: rel.image || rel.poster || resolvedStream.thumbnails?.[0] || '',
          thumbnails: resolvedStream.thumbnails || [],
          skipTimings: resolvedStream.skipTimings || [],
          anixart: {
            release: {
              id: rel.id,
              titleRu: releaseTitle,
              titleOriginal: rel.title_original || '',
              poster: rel.image || rel.poster || '',
              year: rel.year || '',
              studio: rel.studio || '',
              genres: rel.genres || '',
              description: rel.description || '',
              episodesReleased: rel.episodes_released || episodes.length,
              episodesTotal: rel.episodes_total || episodes.length,
              grade: rel.grade || 0
            },
            types,
            selectedTypeId: chosenType.id,
            sources,
            selectedSourceId: chosenSource.id,
            episodes,
            selectedEpisodePosition: chosenEp.position
          }
        });
        return;
      }

      // Case B: Direct Kodik / Aniqit Player Link
      if (/kodik(?:player|info|biz)?\.|aniqit\.com/i.test(rawUrl)) {
        const resolved = await resolveKodikIframeUrl(rawUrl);
        res.json({
          streamUrl: resolved.streamUrl,
          streamType: resolved.streamType,
          qualities: resolved.qualities,
          title: resolved.translationTitle
            ? `Kodik Stream (${resolved.translationTitle})`
            : 'Kodik HLS Stream',
          sourceLabel: 'Kodik • HLS Stream',
          poster: resolved.thumbnails?.[0] || '',
          thumbnails: resolved.thumbnails || [],
          skipTimings: resolved.skipTimings || []
        });
        return;
      }

      // Case C: Sibnet Link
      if (/sibnet\.ru/i.test(rawUrl)) {
        const resolved = await resolveSibnetUrl(rawUrl);
        res.json({
          streamUrl: resolved.streamUrl,
          streamType: resolved.streamType,
          qualities: resolved.qualities,
          title: 'Sibnet Video Stream',
          sourceLabel: 'Sibnet • MP4 Stream'
        });
        return;
      }

      // Case D: Direct .m3u8 or .mp4/.webm URL, or HTML page containing embedded video/iframe
      if (/\.(m3u8)(\?|$)/i.test(rawUrl) || rawUrl.includes(':hls:manifest')) {
        res.json({
          streamUrl: rawUrl,
          streamType: 'hls',
          qualities: { Auto: rawUrl },
          title: rawUrl.split('/').pop()?.split('?')[0] || 'HLS_Stream.m3u8',
          sourceLabel: 'Сеть • HLS Stream'
        });
        return;
      }

      if (/\.(mp4|webm|mkv|mov|m4v|ogv)(\?|$)/i.test(rawUrl)) {
        res.json({
          streamUrl: rawUrl,
          streamType: 'mp4',
          qualities: { Auto: rawUrl },
          title: rawUrl.split('/').pop()?.split('?')[0] || 'Video_Stream.mp4',
          sourceLabel: 'Сеть • Direct Stream'
        });
        return;
      }

      // Probe URL headers to see if it's a direct media stream or an HTML page with embedded player
      const probeRes = await fetch(rawUrl, {
        method: 'GET',
        headers: {
          'User-Agent': BROWSER_UA,
          Range: 'bytes=0-32768'
        }
      });
      const contentType = (probeRes.headers.get('content-type') || '').toLowerCase();

      if (
        contentType.includes('mpegurl') ||
        contentType.includes('vnd.apple.mpegurl') ||
        contentType.includes('x-mpegurl')
      ) {
        res.json({
          streamUrl: rawUrl,
          streamType: 'hls',
          qualities: { Auto: rawUrl },
          title: rawUrl.split('/').pop()?.split('?')[0] || 'HLS_Stream.m3u8',
          sourceLabel: 'Сеть • HLS Stream'
        });
        return;
      }

      if (contentType.startsWith('video/') || contentType.includes('octet-stream')) {
        const corsHeader = probeRes.headers.get('access-control-allow-origin');
        const finalUrl = corsHeader
          ? rawUrl
          : `/api/proxy-media?url=${encodeURIComponent(rawUrl)}`;
        res.json({
          streamUrl: finalUrl,
          streamType: 'mp4',
          qualities: { Auto: finalUrl },
          title: rawUrl.split('/').pop()?.split('?')[0] || 'Video_Stream.mp4',
          sourceLabel: 'Сеть • Direct Stream'
        });
        return;
      }

      if (contentType.includes('text/html')) {
        const htmlText = await probeRes.text();
        const pageTitle =
          htmlText.match(/<meta[^>]+property=["']og:title["'][^>]+content=["']([^"']+)["']/i)?.[1] ||
          htmlText.match(/<title>([^<]+)<\/title>/i)?.[1]?.trim() ||
          'Web Video Stream';
        const ogImage =
          htmlText.match(/<meta[^>]+property=["']og:image["'][^>]+content=["']([^"']+)["']/i)?.[1] ||
          '';

        // Check if page embeds a Kodik iframe
        const kodikIframe = htmlText.match(
          /(?:https?:)?\/\/(?:kodikplayer\.com|kodik\.info|kodik\.biz|aniqit\.com)\/(?:seria|video|season|episode)\/[^"'\s<>]+/i
        )?.[0];
        if (kodikIframe) {
          const resolved = await resolveKodikIframeUrl(kodikIframe);
          res.json({
            streamUrl: resolved.streamUrl,
            streamType: resolved.streamType,
            qualities: resolved.qualities,
            title: pageTitle,
            sourceLabel: 'Web • Kodik HLS',
            poster: ogImage || resolved.thumbnails?.[0] || '',
            thumbnails: resolved.thumbnails || [],
            skipTimings: resolved.skipTimings || []
          });
          return;
        }

        // Check if page contains a direct .m3u8 or .mp4 URL
        const m3u8Match = htmlText.match(/https?:\/\/[^"'\s<>]+\.m3u8(?:\?[^"'\s<>]*)?/i)?.[0];
        if (m3u8Match) {
          res.json({
            streamUrl: m3u8Match,
            streamType: 'hls',
            qualities: { Auto: m3u8Match },
            title: pageTitle,
            sourceLabel: 'Web • HLS Stream',
            poster: ogImage
          });
          return;
        }

        const mp4Match = htmlText.match(/https?:\/\/[^"'\s<>]+\.mp4(?:\?[^"'\s<>]*)?/i)?.[0];
        if (mp4Match) {
          res.json({
            streamUrl: mp4Match,
            streamType: 'mp4',
            qualities: { Auto: mp4Match },
            title: pageTitle,
            sourceLabel: 'Web • MP4 Stream',
            poster: ogImage
          });
          return;
        }
      }

      res.json({
        streamUrl: rawUrl,
        streamType: 'mp4',
        qualities: { Auto: rawUrl },
        title: rawUrl.split('/').pop()?.split('?')[0] || 'Network_Stream',
        sourceLabel: 'Сеть • Direct Stream'
      });
    } catch (err: any) {
      res.status(500).json({
        error: err?.message || 'Не удалось извлечь видеопоток по указанной ссылке'
      });
    }
  });

  // 3. CORS & Range Media Proxy for external streams or posters without Access-Control-Allow-Origin
  app.get('/api/proxy-media', async (req, res) => {
    try {
      const targetUrl = String(req.query.url || '').trim();
      const referer = String(req.query.referer || '').trim();
      if (!targetUrl || (!targetUrl.startsWith('http://') && !targetUrl.startsWith('https://'))) {
        res.status(400).send('Invalid target URL');
        return;
      }

      const headers: Record<string, string> = {
        'User-Agent': BROWSER_UA
      };
      if (referer) {
        headers['Referer'] = referer;
      }
      if (req.headers.range) {
        headers['Range'] = String(req.headers.range);
      }

      const upstream = await fetch(targetUrl, {
        method: 'GET',
        headers,
        redirect: 'follow'
      });

      res.status(upstream.status);
      res.setHeader('Access-Control-Allow-Origin', '*');
      const contentType = (upstream.headers.get('content-type') || '').toLowerCase();
      const isM3u8 =
        /\.m3u8(\?|$)/i.test(targetUrl) ||
        contentType.includes('mpegurl') ||
        contentType.includes('x-mpegurl');

      if (isM3u8 && upstream.ok) {
        const rawText = await upstream.text();
        const refParam = referer ? `&referer=${encodeURIComponent(referer)}` : '';
        const rewritten = rawText
          .split(/\r?\n/)
          .map((line) => {
            const trimmed = line.trim();
            if (!trimmed) return line;
            if (trimmed.startsWith('#')) {
              return line.replace(/URI="([^"]+)"/gi, (_m, uriVal) => {
                try {
                  const absUri = new URL(uriVal, targetUrl).toString();
                  return `URI="/api/proxy-media?url=${encodeURIComponent(absUri)}${refParam}"`;
                } catch {
                  return _m;
                }
              });
            }
            try {
              const absSeg = new URL(trimmed, targetUrl).toString();
              return `/api/proxy-media?url=${encodeURIComponent(absSeg)}${refParam}`;
            } catch {
              return line;
            }
          })
          .join('\n');

        res.setHeader('Content-Type', 'application/vnd.apple.mpegurl; charset=utf-8');
        res.send(rewritten);
        return;
      }

      const forwardHeaders = [
        'content-type',
        'content-length',
        'content-range',
        'accept-ranges',
        'cache-control'
      ];
      for (const h of forwardHeaders) {
        const val = upstream.headers.get(h);
        if (val) res.setHeader(h, val);
      }

      if (!upstream.body) {
        res.end();
        return;
      }

      const reader = upstream.body.getReader();
      req.on('close', () => {
        reader.cancel().catch(() => {});
      });

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        if (!res.writableEnded) {
          res.write(Buffer.from(value));
        }
      }
      if (!res.writableEnded) {
        res.end();
      }
    } catch {
      if (!res.headersSent) {
        res.status(502).send('Upstream media proxy error');
      } else if (!res.writableEnded) {
        res.end();
      }
    }
  });

  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa'
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*all', (_req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`REX Player Server running on http://0.0.0.0:${PORT}`);
  });
}

startServer();
