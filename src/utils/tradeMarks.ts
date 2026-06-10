/**
 * Camera manufacturer trade mark logo support.
 *
 * Maps EXIF camera_make to preloaded trade mark images for
 * Canon, Nikon, and Sony. Used by the EXIF watermark renderer
 * to replace camera-model text with the manufacturer's logo.
 */

import canonUrl from "@/assets/trade_marks/Canon.png";
import nikonUrl from "@/assets/trade_marks/Nikon.png";
import sonyUrl from "@/assets/trade_marks/SONY.png";

/** Canonical brand keys */
export type TradeMarkBrand = "Canon" | "Nikon" | "Sony";

/** Map brand → preloaded HTMLImageElement */
const tradeMarkImages = new Map<TradeMarkBrand, HTMLImageElement>();

/** Whether all trade mark images have finished loading */
let loaded = false;
let loadPromise: Promise<void> | null = null;

/** Mapping from camera_make substrings (lowercase) to brand keys */
const MAKE_LOOKUP: [string, TradeMarkBrand][] = [
  ["canon", "Canon"],
  ["nikon", "Nikon"],
  ["sony", "Sony"],
];

/**
 * Match an EXIF camera_make string to a known brand.
 * Returns the brand key, or null if no match.
 */
export function matchTradeMarkBrand(cameraMake: string | null | undefined): TradeMarkBrand | null {
  if (!cameraMake) return null;
  const lower = cameraMake.toLowerCase();
  for (const [pattern, brand] of MAKE_LOOKUP) {
    if (lower.includes(pattern)) return brand;
  }
  return null;
}

/**
 * Preload all trade mark images. Idempotent — subsequent calls
 * return the same promise.
 */
export async function preloadTradeMarks(): Promise<void> {
  if (loaded) return;
  if (loadPromise) return loadPromise;

  loadPromise = (async () => {
    const pairs: [TradeMarkBrand, string][] = [
      ["Canon", canonUrl],
      ["Nikon", nikonUrl],
      ["Sony", sonyUrl],
    ];
    await Promise.all(
      pairs.map(async ([brand, url]) => {
        const img = new Image();
        img.src = url;
        await img.decode();
        tradeMarkImages.set(brand, img);
      })
    );
    loaded = true;
  })();

  return loadPromise;
}

/**
 * Get the preloaded trade mark image for a given camera_make string.
 * Returns null if the make doesn't match a known brand or images aren't loaded yet.
 */
export function getTradeMarkImage(cameraMake: string | null | undefined): HTMLImageElement | null {
  if (!loaded || !cameraMake) return null;
  const brand = matchTradeMarkBrand(cameraMake);
  if (!brand) return null;
  return tradeMarkImages.get(brand) ?? null;
}

/**
 * Get brand display name from camera_make.
 * Returns null if the make doesn't match a known brand.
 */
export function getTradeMarkBrandName(cameraMake: string | null | undefined): string | null {
  const brand = matchTradeMarkBrand(cameraMake);
  return brand ?? null;
}
