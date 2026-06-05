import { state } from './state.js';
import { loadConfig, applyConfig } from './config.js';
import { parseSrt } from './srt-parser.js';
import { generateColors } from './utils.js';
import { idbGet, idbSet } from './idb.js';

// ── Crypto helpers ─────────────────────────────────────────────────────────────

async function digest(data) {
  const buf = await crypto.subtle.digest('SHA-256', data);
  return [...new Uint8Array(buf)].map(b => b.toString(16).padStart(2, '0')).join('');
}

export async function hashFile(file, maxBytes = Infinity) {
  const slice = maxBytes < Infinity ? file.slice(0, maxBytes) : file;
  return digest(await slice.arrayBuffer());
}

export async function computePairId(videoHash, srtHash) {
  return digest(new TextEncoder().encode(videoHash + srtHash));
}

// ── Load project from configHandle ────────────────────────────────────────────

export async function loadProject() {
  const cfg = await loadConfig();

  // Resolve folder handles from IDB
  state.folders = [];
  for (const fe of (cfg.folders ?? [])) {
    let handle = null;
    const stored = await idbGet(fe.idbKey);
    if (stored) {
      const perm = await stored.queryPermission({ mode: 'readwrite' });
      handle = (perm === 'granted' ||
        await stored.requestPermission({ mode: 'readwrite' }) === 'granted')
        ? stored : null;
    }
    state.folders.push({
      idbKey:          fe.idbKey,
      name:            fe.name ?? stored?.name ?? 'Unknown folder',
      handle,
      editorDisplayed: fe.editorDisplayed ?? true,
    });
  }

  const folderByKey = Object.fromEntries(state.folders.map(f => [f.idbKey, f]));

  // Resolve pairs
  state.tracks       = [];
  state.orphanedPairs = [];
  const videos = cfg.videos ?? [];
  const colors = generateColors(videos.length);

  for (let i = 0; i < videos.length; i++) {
    const v      = videos[i];
    const folder = folderByKey[v.folderIdbKey];
    const track  = await resolvePair(v, folder?.handle ?? null, colors[i]);
    if (track.status === 'full' || track.status === 'gps-only') {
      state.tracks.push(track);
    } else {
      state.orphanedPairs.push(track);
    }
  }

  // Re-apply color overrides from saved config (must happen after tracks built)
  // applyConfig handles this via colorOverrides
  applyConfig(cfg);

  // Post resolved tracks to server (for external tooling)
  fetch('/api/tracks', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ videos: state.tracks }),
  }).catch(() => {});

  return cfg;
}

// ── Resolve a single pair ─────────────────────────────────────────────────────

export async function resolvePair(v, folderHandle, color = 'hsl(0,72%,58%)') {
  const base = {
    pairId:       v.pairId ?? '',
    displayName:  v.displayName,
    name:         v.displayName,   // compat alias used by render.js, interactions.js
    folderIdbKey: v.folderIdbKey,
    videoFile:    v.videoFile,
    srtFile:      v.srtFile,
    videoHash:    v.videoHash ?? '',
    srtHash:      v.srtHash ?? '',
    file:         v.videoFile,     // compat alias used by legacy code
    color,
    videoHandle: null,
    srtHandle:   null,
    points:      [],
    status:      'orphaned',
  };

  if (!folderHandle) return base;

  // Try to get SRT handle
  let srtHandle = null;
  try { srtHandle = await folderHandle.getFileHandle(v.srtFile); } catch { /* missing */ }

  // Try to get video handle
  let videoHandle = null;
  try { videoHandle = await folderHandle.getFileHandle(v.videoFile); } catch { /* missing */ }

  if (!srtHandle) {
    return { ...base, videoHandle, status: videoHandle ? 'error' : 'orphaned' };
  }

  // Parse SRT
  const srtFile = await srtHandle.getFile();
  const points  = await parseSrt(srtFile);

  return {
    ...base,
    srtHandle,
    videoHandle,
    points,
    status: videoHandle ? 'full' : 'gps-only',
  };
}

// ── Scan a directory and build new pairs ──────────────────────────────────────

export async function scanFolder(dirHandle) {
  const movFiles = [], srtFiles = [];
  for await (const [name, fh] of dirHandle.entries()) {
    if (fh.kind !== 'file') continue;
    const lo = name.toLowerCase();
    if (lo.endsWith('.mov') || lo.endsWith('.mp4') || lo.endsWith('.avi')) movFiles.push(name);
    else if (lo.endsWith('.srt')) srtFiles.push(name);
  }

  // Auto-pair by stem
  const pairs = [];
  const usedSrts = new Set();
  for (const mov of movFiles.sort()) {
    const stem = mov.replace(/\.[^.]+$/, '');
    const srt  = srtFiles.find(s => s.replace(/\.[^.]+$/, '') === stem);
    if (!srt) continue;
    usedSrts.add(srt);
    pairs.push({ videoFile: mov, srtFile: srt });
  }

  return pairs;
}

// ── Hash a new pair (for pairId and adoption) ─────────────────────────────────

export async function hashPair(dirHandle, videoFile, srtFile) {
  const [vf, sf] = await Promise.all([
    dirHandle.getFileHandle(videoFile).then(h => h.getFile()),
    dirHandle.getFileHandle(srtFile).then(h => h.getFile()),
  ]);
  const [videoHash, srtHash] = await Promise.all([
    hashFile(vf, 4 * 1024 * 1024),
    hashFile(sf),
  ]);
  const pairId = await computePairId(videoHash, srtHash);
  return { videoHash, srtHash, pairId };
}

// ── Persist a new folder handle to IDB ───────────────────────────────────────

export async function registerFolder(dirHandle) {
  const idbKey = `folder-${crypto.randomUUID()}`;
  await idbSet(idbKey, dirHandle);
  return idbKey;
}
