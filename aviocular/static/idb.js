const DB_NAME    = 'aviocular';
const DB_VERSION = 1;
const STORE      = 'handles';

function openDb() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = e => e.target.result.createObjectStore(STORE);
    req.onsuccess       = e => resolve(e.target.result);
    req.onerror         = e => reject(e.target.error);
  });
}

function tx(mode, fn) {
  return openDb().then(db => new Promise((resolve, reject) => {
    const req = fn(db.transaction(STORE, mode).objectStore(STORE));
    req.onsuccess = e => resolve(e.target.result);
    req.onerror   = e => reject(e.target.error);
  }));
}

export const idbGet    = key        => tx('readonly',  s => s.get(key));
export const idbSet    = (key, val) => tx('readwrite', s => s.put(val, key));
export const idbDelete = key        => tx('readwrite', s => s.delete(key));

// Recent projects: [{name, handle}], capped at MAX_RECENT, deduplicated via isSameEntry
const MAX_RECENT = 5;
export async function idbPushRecent(handle) {
  const existing = await idbGet('recent') ?? [];
  const checks   = await Promise.all(existing.map(r => r.handle.isSameEntry(handle).catch(() => false)));
  const filtered = existing.filter((_, i) => !checks[i]);
  await idbSet('recent', [{ name: handle.name, handle }, ...filtered].slice(0, MAX_RECENT));
}
export const idbGetRecent = () => idbGet('recent').then(r => r ?? []);
