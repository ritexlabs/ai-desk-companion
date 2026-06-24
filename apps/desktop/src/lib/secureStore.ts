/**
 * Unified storage abstraction.
 *
 * In Tauri: uses @tauri-apps/plugin-store (encrypted JSON file in app-data).
 * In browser: uses localStorage (origin-sandboxed, existing behaviour).
 *
 * Both modes use the same API: synchronous get/set for reads after
 * initial load, async persist for writes.
 *
 * SECURITY CONTRACT — unchanged from Phase 1:
 *   Keys never appear in source files, .env files, or git history.
 *   All credentials live only in this store, never in JSX defaultValues
 *   or console.log calls.
 */

const isTauri = typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window;

// ── Tauri Store (lazy-loaded only when running inside Tauri) ──────────────────
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let _tauriStore: any = null;

async function _getTauriStore(): Promise<any> {
  if (!_tauriStore) {
    // vite-ignore: prevents Vite from bundling this at build time;
    // the module is only available at runtime inside the Tauri host.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const mod = await (import(/* @vite-ignore */ '@tauri-apps/plugin-store') as any);
    _tauriStore = await mod.Store.load('.robo-config.dat', { autoSave: false });
  }
  return _tauriStore;
}

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Read a value synchronously (after the store is hydrated on startup).
 * Falls back to localStorage in browser mode.
 */
export function storeGetSync(key: string): string | null {
  return localStorage.getItem(key);
}

/**
 * Persist a value. Async in Tauri (also mirrors to localStorage for sync reads),
 * sync-only in browser.
 */
export async function storePersist(key: string, value: string): Promise<void> {
  localStorage.setItem(key, value);          // always update sync cache
  if (isTauri) {
    const store = await _getTauriStore();
    await store.set(key, value);
    await store.save();
  }
}

/**
 * Delete a stored key.
 */
export async function storeDelete(key: string): Promise<void> {
  localStorage.removeItem(key);
  if (isTauri) {
    const store = await _getTauriStore();
    await store.delete(key);
    await store.save();
  }
}

/**
 * Hydrate localStorage from Tauri's encrypted store on first launch.
 * Call this once at app startup before any hooks read from localStorage.
 * No-op in browser mode.
 */
export async function hydrateFromTauriStore(): Promise<void> {
  if (!isTauri) return;
  const store = await _getTauriStore();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const entries: [string, any][] = await store.entries();
  for (const [key, value] of entries) {
    if (typeof value === 'string') {
      localStorage.setItem(key, value);
    }
  }
}
