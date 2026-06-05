import { state } from './state.js';
import { saveConfig } from './config.js';
import { scanFolder, hashPair, resolvePair, registerFolder, loadProject } from './project.js';
import { generateColors } from './utils.js';
import { idbDelete } from './idb.js';

// Working copies for the editor session — committed only on Confirm.
let editorMode  = 'existing';   // 'new' | 'existing'
let editFolders = [];           // [{idbKey, name, handle, editorDisplayed}]
let editPairs   = [];           // [{...pair fields, inProject, folderName}]
let onConfirm   = null;
let onCancel    = null;

// ── Public API ─────────────────────────────────────────────────────────────────

export function openEditor(mode, confirmCallback, cancelCallback) {
  editorMode = mode;
  onConfirm  = confirmCallback;
  onCancel   = cancelCallback;

  // Deep-copy current state into working copies
  editFolders = state.folders.map(f => ({ ...f }));
  editPairs   = [
    ...state.tracks.map(t => ({ ...t, inProject: true })),
    ...state.orphanedPairs.map(t => ({ ...t, inProject: true })),
  ];

  document.getElementById('btnEditorConfirm').textContent = confirmLabel();
  renderEditor();
  document.getElementById('editorScreen').style.display = '';
}

// ── Rendering ──────────────────────────────────────────────────────────────────

function renderEditor() {
  renderFolderList();
  renderFileList();
  document.getElementById('btnEditorConfirm').textContent = confirmLabel();
}

function confirmLabel() {
  const n = editPairs.filter(p => p.inProject && (p.status === 'full' || p.status === 'gps-only')).length;
  return `Confirm (${n} clip${n !== 1 ? 's' : ''})`;
}

function folderStatus(f) {
  if (!f.handle) return '<span class="status-warn">⚠ unresolved</span>';
  return '<span class="status-ok">✓</span>';
}

function renderFolderList() {
  const list = document.getElementById('editorFolderList');
  list.innerHTML = '';
  for (const f of editFolders) {
    const row = document.createElement('div');
    row.className = 'editor-row';

    const chk = document.createElement('input');
    chk.type    = 'checkbox';
    chk.checked = f.editorDisplayed;
    chk.title   = 'Show in file list below';
    chk.addEventListener('change', () => { f.editorDisplayed = chk.checked; renderFileList(); });

    const name = document.createElement('span');
    name.className   = 'editor-cell name';
    name.textContent = f.name + '/';

    const status = document.createElement('span');
    status.className = 'editor-cell status';
    status.innerHTML = folderStatus(f);

    row.appendChild(chk);
    row.appendChild(name);
    row.appendChild(status);

    if (!f.handle) {
      const btnLink = document.createElement('button');
      btnLink.textContent = 'Link';
      btnLink.addEventListener('click', () => linkFolder(f));
      row.appendChild(btnLink);
    }

    const btnRemove = document.createElement('button');
    btnRemove.textContent = 'Remove';
    btnRemove.addEventListener('click', () => removeFolder(f));
    row.appendChild(btnRemove);

    list.appendChild(row);
  }
}

function renderFileList() {
  const list = document.getElementById('editorFileList');
  list.innerHTML = '';

  const shown   = editPairs.filter(p => {
    if (p.status === 'orphaned') return false;
    const folder = editFolders.find(f => f.idbKey === p.folderIdbKey);
    return folder?.editorDisplayed ?? true;
  }).sort((a, b) => a.displayName.localeCompare(b.displayName));

  const orphans = editPairs.filter(p => p.status === 'orphaned');

  for (const p of shown) appendPairRow(list, p, false);

  if (orphans.length) {
    const sep = document.createElement('div');
    sep.className   = 'editor-orphan-sep';
    sep.textContent = '─── Orphaned ───';
    list.appendChild(sep);
    for (const p of orphans) appendPairRow(list, p, true);
  }
}

function pairPathHint(p) {
  const folder = editFolders.find(f => f.idbKey === p.folderIdbKey);
  const fn = folder?.name ?? '?';
  return `${fn}/${p.videoFile}`;
}

function appendPairRow(list, p, isOrphan) {
  const row = document.createElement('div');
  row.className = 'editor-row';

  const chk = document.createElement('input');
  chk.type    = 'checkbox';
  chk.checked = p.inProject;
  chk.addEventListener('change', () => {
    if (!chk.checked && isOrphan) {
      if (!confirm(`Remove "${p.displayName}" from project? This cannot be undone.`)) {
        chk.checked = true; return;
      }
      editPairs = editPairs.filter(x => x !== p);
      renderFileList();
      renderEditor();
      return;
    }
    p.inProject = chk.checked;
    renderEditor();
  });

  const nameEl = document.createElement('span');
  nameEl.className   = 'editor-cell name';
  nameEl.textContent = p.displayName;

  const path = document.createElement('span');
  path.className   = 'editor-cell path';
  path.textContent = pairPathHint(p);

  const statusEl = document.createElement('span');
  statusEl.className = 'editor-cell pair-status';
  if (isOrphan) {
    statusEl.innerHTML = '<span class="status-warn" title="Folder not linked — use Add folder to re-link">orphaned</span>';
  } else {
    const pts    = p.points?.length ?? 0;
    const srtOk  = !!p.srtHandle;
    const vidOk  = !!p.videoHandle;
    statusEl.title = [
      `SRT:   ${srtOk  ? `${p.srtFile}  (${pts} pts)` : 'missing'}`,
      `Video: ${vidOk  ? p.videoFile                   : 'missing'}`,
    ].join('\n');
    statusEl.innerHTML =
      `<span class="${srtOk ? 'status-ok' : 'status-warn'}">srt ${srtOk ? '✓' : '⚠'}</span>` +
      `<span class="${vidOk ? 'status-ok' : 'status-warn'}">vid ${vidOk ? '✓' : '⚠'}</span>`;
  }

  const btnRename = document.createElement('button');
  btnRename.textContent = 'Rename';
  btnRename.addEventListener('click', () => startRename(nameEl, p));

  row.appendChild(chk);
  row.appendChild(nameEl);
  row.appendChild(path);
  row.appendChild(statusEl);
  row.appendChild(btnRename);
  list.appendChild(row);
}

function startRename(nameEl, p) {
  const input = document.createElement('input');
  input.type      = 'text';
  input.value     = p.displayName;
  input.className = 'editor-rename-input';
  nameEl.replaceWith(input);
  input.focus();
  input.select();
  const commit = () => {
    const val = input.value.trim() || p.displayName;
    p.displayName = val;
    p.name        = val;
    input.replaceWith(nameEl);
    nameEl.textContent = val;
    renderEditor();
  };
  input.addEventListener('blur',  commit);
  input.addEventListener('keydown', e => { if (e.key === 'Enter') commit(); });
}

// ── Folder operations ──────────────────────────────────────────────────────────

async function addFolder() {
  let dirHandle;
  try { dirHandle = await window.showDirectoryPicker({ mode: 'readwrite' }); }
  catch (e) { if (e.name !== 'AbortError') throw e; return; }

  const btn = document.getElementById('btnAddFolder');
  btn.disabled    = true;
  btn.textContent = 'Scanning…';

  try {
    const idbKey = await registerFolder(dirHandle);
    const folder = { idbKey, name: dirHandle.name, handle: dirHandle, editorDisplayed: true };
    editFolders.push(folder);

    const rawPairs = await scanFolder(dirHandle);
    const colors   = generateColors(rawPairs.length);

    // Resolve existing orphans by hash + add new pairs
    for (let i = 0; i < rawPairs.length; i++) {
      const { videoFile, srtFile } = rawPairs[i];
      const { videoHash, srtHash, pairId } = await hashPair(dirHandle, videoFile, srtFile);

      // Try to adopt an existing orphan
      const orphan = editPairs.find(p =>
        p.status === 'orphaned' && p.pairId === pairId
      );
      if (orphan) {
        orphan.folderIdbKey = idbKey;
        const resolved = await resolvePair(orphan, dirHandle, orphan.color);
        Object.assign(orphan, resolved);
        continue;
      }

      // New pair
      const vHandle = await dirHandle.getFileHandle(videoFile).catch(() => null);
      const sHandle = await dirHandle.getFileHandle(srtFile).catch(() => null);
      const srtFile2 = sHandle ? await sHandle.getFile() : null;
      const { parseSrt } = await import('./srt-parser.js');
      const points = srtFile2 ? await parseSrt(srtFile2) : [];

      editPairs.push({
        pairId,
        displayName:  videoFile.replace(/\.[^.]+$/, ''),
        name:         videoFile.replace(/\.[^.]+$/, ''),
        folderIdbKey: idbKey,
        videoFile,
        srtFile,
        videoHash,
        srtHash,
        file:         videoFile,
        color:        colors[i],
        videoHandle:  vHandle,
        srtHandle:    sHandle,
        points:       points ?? [],
        status:       vHandle && sHandle ? 'full' : (sHandle ? 'gps-only' : 'orphaned'),
        inProject:    true,
      });
    }
  } finally {
    btn.disabled    = false;
    btn.textContent = '+ Add folder';
  }

  renderEditor();
}

async function linkFolder(folder) {
  let dirHandle;
  try { dirHandle = await window.showDirectoryPicker({ mode: 'readwrite' }); }
  catch (e) { if (e.name !== 'AbortError') throw e; return; }

  folder.handle = dirHandle;
  folder.name   = dirHandle.name;
  await import('./idb.js').then(({ idbSet }) => idbSet(folder.idbKey, dirHandle));

  // Try to re-resolve pairs from this folder
  for (const p of editPairs.filter(p => p.folderIdbKey === folder.idbKey)) {
    const resolved = await resolvePair(p, dirHandle, p.color);
    Object.assign(p, resolved);
  }

  renderEditor();
}

async function removeFolder(folder) {
  const affected = editPairs.filter(p => p.folderIdbKey === folder.idbKey);
  if (affected.length) {
    if (!confirm(`Remove "${folder.name}/" and its ${affected.length} clip(s) from the project?`)) return;
    for (const p of affected) editPairs = editPairs.filter(x => x !== p);
  }
  editFolders = editFolders.filter(f => f !== folder);
  renderEditor();
}

// ── Confirm / Cancel ──────────────────────────────────────────────────────────

async function confirmEditor() {
  document.getElementById('btnEditorConfirm').disabled = true;

  // Commit working copies to state
  state.folders       = editFolders;
  state.tracks        = editPairs.filter(p => p.inProject && (p.status === 'full' || p.status === 'gps-only'));
  state.orphanedPairs = editPairs.filter(p => p.status === 'orphaned' && p.inProject);

  // Recolour tracks
  const colors = generateColors(state.tracks.length);
  state.tracks.forEach((t, i) => {
    if (!state.colorOverrides.has(t.name)) t.color = colors[i];
  });

  await saveConfig();

  if (onConfirm) await onConfirm();

  document.getElementById('editorScreen').style.display = 'none';
  document.getElementById('btnEditorConfirm').disabled = false;
}

async function cancelEditor() {
  document.getElementById('editorScreen').style.display = 'none';
  if (editorMode === 'new') {
    await idbDelete('config');
    state.configHandle = null;
  }
  if (onCancel) onCancel();
}

// ── Wire editor buttons ────────────────────────────────────────────────────────

document.getElementById('btnAddFolder').addEventListener('click', addFolder);
document.getElementById('btnEditorCancel').addEventListener('click', cancelEditor);
document.getElementById('btnEditorConfirm').addEventListener('click', confirmEditor);
