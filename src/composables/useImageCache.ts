import { reactive } from "vue";
import { invoke } from "@tauri-apps/api/core";
import { loadImageFromBase64 } from "@/composables/useWatermarkDrawing";
import type { ImageInfo, ExifData } from "@/types";

// ── Types ──

export interface CachedImage {
  /** Preview-quality base64 (from load_image, JPEG Q75) */
  base64: string;
  /** Browser-decoded Image element, ready for Canvas drawing */
  img: HTMLImageElement;
  /** Cached EXIF metadata (null if unparseable) */
  exif: ExifData | null;
  width: number;
  height: number;
  format: string;
}

// ── Module-level singleton ──

const MAX_SIZE = 10;
const cache = new Map<string, CachedImage>();

/** Reactive preload progress — components can bind to this for UI feedback */
export const preloadProgress = reactive({
  current: 0,
  total: 0,
  isActive: false,
});

/**
 * Composable providing an LRU image cache.
 * Module-level singleton — all callers share the same cache instance.
 */
export function useImageCache() {
  /** Check whether a file path has a cached entry */
  function has(path: string): boolean {
    return cache.has(path);
  }

  /** Retrieve cached entry. On hit, promotes the entry to most-recently-used. */
  function get(path: string): CachedImage | undefined {
    const entry = cache.get(path);
    if (entry) {
      // LRU promotion: delete + re-insert at tail (Map iteration order = insertion order)
      cache.delete(path);
      cache.set(path, entry);
    }
    return entry;
  }

  /** Store a cached entry. Evicts the least-recently-used entry when over capacity. */
  function set(path: string, entry: CachedImage): void {
    // If already cached, delete first so re-insertion places it at tail
    if (cache.has(path)) {
      cache.delete(path);
    }
    cache.set(path, entry);
    // Evict oldest (first key in Map) when over capacity
    while (cache.size > MAX_SIZE) {
      const oldestKey = cache.keys().next().value as string;
      cache.delete(oldestKey);
    }
  }

  /** Remove a specific path from cache */
  function remove(path: string): void {
    cache.delete(path);
  }

  /** Clear all cached entries */
  function clear(): void {
    cache.clear();
  }

  /**
   * Preload a single image: Rust decode → browser decode → EXIF.
   * Errors are logged but do not throw — cache is best-effort.
   */
  async function preload(path: string): Promise<void> {
    try {
      // Already cached? Skip.
      if (cache.has(path)) return;

      // 1. Rust-side: decode file → preview base64 (JPEG Q75)
      const info = await invoke<ImageInfo>("load_image", { path });

      // 2. Browser-side: decode base64 → HTMLImageElement
      const img = await loadImageFromBase64(info.base64);

      // 3. EXIF (best-effort)
      let exif: ExifData | null = null;
      try {
        exif = await invoke<ExifData>("read_exif", { path });
      } catch {
        // EXIF is optional — proceed without it
      }

      const entry: CachedImage = {
        base64: info.base64,
        img,
        exif,
        width: info.width,
        height: info.height,
        format: info.format,
      };

      set(path, entry);
    } catch (e) {
      console.warn(`[ImageCache] Failed to preload "${path}":`, e);
    }
  }

  /**
   * Preload a batch of paths sequentially in the background.
   * Does NOT block the caller; errors are logged and skipped.
   * Returns immediately — preloading continues asynchronously.
   * Updates preloadProgress reactively so UI can display a progress bar.
   */
  function preloadAll(paths: string[]): void {
    // Reset progress for the new batch
    preloadProgress.current = 0;
    preloadProgress.total = paths.length;
    preloadProgress.isActive = paths.length > 0;

    (async () => {
      for (const p of paths) {
        await preload(p);
        preloadProgress.current++;
      }
      preloadProgress.isActive = false;
    })();
  }

  return { has, get, set, remove, clear, preload, preloadAll };
}
