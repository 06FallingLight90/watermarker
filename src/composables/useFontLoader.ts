import { ref } from "vue";
import { useWatermarkStore } from "@/stores/watermark";
import { useTauriCommands } from "@/composables/useTauriCommands";

/**
 * Composable for loading custom fonts via Tauri file dialog + FontFace API.
 * Handles system font list initialization and custom font file selection.
 */
export function useFontLoader() {
  const watermarkStore = useWatermarkStore();
  const { loadImageRaw, listSystemFonts } = useTauriCommands();

  const fontError = ref("");

  /** Load system font list (call once on app mount) */
  async function loadSystemFonts(): Promise<void> {
    if (watermarkStore.fontsLoaded) return;
    try {
      watermarkStore.systemFonts = await listSystemFonts();
      watermarkStore.fontsLoaded = true;
    } catch (e) {
      console.error("Failed to list system fonts:", e);
    }
  }

  /** Read TTF/OTF file bytes and register via FontFace API */
  async function loadFontFromPath(path: string): Promise<void> {
    const raw = await loadImageRaw(path);

    // Determine MIME from extension
    const ext = path.split(".").pop()?.toLowerCase();
    const mime = ext === "otf" ? "font/otf" : "font/ttf";

    // Derive font family name from filename
    const fileName = path.split(/[\\/]/).pop() ?? "CustomFont";
    const familyName = fileName.replace(/\.[^.]+$/, "").replace(/[^a-zA-Z0-9_-]/g, " ");

    // Register font via FontFace API
    const fontFace = new FontFace(familyName, `url(data:${mime};base64,${raw.base64})`);
    await fontFace.load();
    document.fonts.add(fontFace);

    watermarkStore.fontFamily = familyName;
    watermarkStore.fontPath = path;
  }

  /** Open native file dialog to browse for a font file */
  async function selectFont(): Promise<void> {
    fontError.value = "";
    try {
      const { open } = await import("@tauri-apps/plugin-dialog");
      const selected = await open({
        multiple: false,
        filters: [{ name: "Fonts", extensions: ["ttf", "otf", "ttc"] }],
      });
      if (!selected) return;
      await loadFontFromPath(selected as string);
    } catch (e) {
      fontError.value = `字体加载失败: ${e}`;
      console.error("Failed to load font:", e);
    }
  }

  /** Handler for <select> element font change events */
  async function onFontSelect(e: Event): Promise<void> {
    fontError.value = "";
    const path = (e.target as HTMLSelectElement).value;
    if (!path) {
      // Reset to system default
      watermarkStore.fontFamily = "Arial, sans-serif";
      return;
    }
    if (path === "__browse__") {
      await selectFont();
      return;
    }
    try {
      await loadFontFromPath(path);
    } catch (err) {
      fontError.value = `字体加载失败: ${err}`;
      console.error("Failed to load font:", err);
    }
  }

  return { fontError, loadSystemFonts, loadFontFromPath, selectFont, onFontSelect };
}
