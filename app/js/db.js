// Tiny IndexedDB wrapper. Stores: kv (program, settings), sessions (by id).
const DB_NAME = 'gym-tracker';
const DB_VERSION = 1;
let dbp;

function open() {
  if (dbp) return dbp;
  dbp = new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains('kv')) db.createObjectStore('kv');
      if (!db.objectStoreNames.contains('sessions')) db.createObjectStore('sessions', { keyPath: 'id' });
    };
    req.onsuccess = () => {
      const db = req.result;
      db.onversionchange = () => db.close();
      resolve(db);
    };
    req.onerror = () => reject(req.error);
  });
  return dbp;
}

async function tx(store, mode, fn) {
  const db = await open();
  return new Promise((resolve, reject) => {
    const t = db.transaction(store, mode);
    let result;
    Promise.resolve(fn(t.objectStore(store), t)).then((r) => (result = r));
    t.oncomplete = () => resolve(result);
    t.onerror = () => reject(t.error);
    t.onabort = () => reject(t.error);
  });
}

const reqP = (req) => new Promise((res, rej) => { req.onsuccess = () => res(req.result); req.onerror = () => rej(req.error); });

export const getKV = (key) => tx('kv', 'readonly', (s) => reqP(s.get(key)));
export const setKV = (key, value) => tx('kv', 'readwrite', (s) => { s.put(value, key); });

export const getAllSessions = () => tx('sessions', 'readonly', (s) => reqP(s.getAll()));
export const putSession = (session) => tx('sessions', 'readwrite', (s) => { s.put(session); });
export const putSessions = (list) => tx('sessions', 'readwrite', (s) => { list.forEach((x) => s.put(x)); });
export const deleteSession = (id) => tx('sessions', 'readwrite', (s) => { s.delete(id); });

export async function clearAll() {
  await tx('sessions', 'readwrite', (s) => { s.clear(); });
  await tx('kv', 'readwrite', (s) => { s.clear(); });
}
