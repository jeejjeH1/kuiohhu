// IndexedDB persistence for designs (photos are kept inside each design's assets).
const DB = 'canva-lite', STORE = 'designs';
let dbp;

function db() {
  if (!dbp) {
    dbp = new Promise((res, rej) => {
      const r = indexedDB.open(DB, 1);
      r.onupgradeneeded = () => r.result.createObjectStore(STORE, { keyPath: 'id' });
      r.onsuccess = () => res(r.result);
      r.onerror = () => rej(r.error);
    });
  }
  return dbp;
}

async function tx(mode, fn) {
  const d = await db();
  return new Promise((res, rej) => {
    const t = d.transaction(STORE, mode);
    const out = fn(t.objectStore(STORE));
    t.oncomplete = () => res(out?.result);
    t.onerror = () => rej(t.error);
  });
}

export const saveDesign = (design) => tx('readwrite', (s) => s.put(design));
export const getDesign = (id) => tx('readonly', (s) => s.get(id));
export const deleteDesign = (id) => tx('readwrite', (s) => s.delete(id));
export async function listDesigns() {
  const all = (await tx('readonly', (s) => s.getAll())) || [];
  return all.sort((a, b) => b.updatedAt - a.updatedAt);
}

// Small key/value settings (theme, brand colors, recent colors).
export const settings = {
  get(k, def) {
    try { const v = localStorage.getItem('cl.' + k); return v == null ? def : JSON.parse(v); } catch { return def; }
  },
  set(k, v) {
    try { localStorage.setItem('cl.' + k, JSON.stringify(v)); } catch { /* storage unavailable */ }
  },
};
