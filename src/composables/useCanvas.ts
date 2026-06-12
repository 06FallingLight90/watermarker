import { ref, watch } from "vue";
import { useImageStore } from "@/stores/image";
import { useWatermarkStore } from "@/stores/watermark";
import {
  loadImageFromBase64,
  renderWatermarkStatic,
} from "@/composables/useWatermarkDrawing";

// Re-export for consumers that need module-level export functions
export { renderFullRes, renderOffscreen, renderOffscreenWithConfig, loadImageFromBase64, type ExportFormat } from "@/composables/useWatermarkDrawing";

// ── Composable (for the visible preview canvas + reactivity) ──

export function useCanvas() {
  const imageStore = useImageStore();
  const watermarkStore = useWatermarkStore();

  const isLoading = ref(false);
  const canvasRef = ref<HTMLCanvasElement | null>(null);

  async function renderPreview(): Promise<void> {
    const canvas = canvasRef.value;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const img = imageStore.currentImage;
    if (!img) return;

    isLoading.value = true;

    const mainImg = await loadImageFromBase64(img.base64);

    const container = canvas.parentElement;
    const maxW = container?.clientWidth ?? 1280;
    const maxH = container?.clientHeight ?? 720;
    const scale = Math.min(maxW / mainImg.width, maxH / mainImg.height, 1.0);
    canvas.width = mainImg.width * scale;
    canvas.height = mainImg.height * scale;

    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(mainImg, 0, 0, canvas.width, canvas.height);
    await renderWatermarkStatic(ctx, canvas, scale, watermarkStore, imageStore.exifData);

    imageStore.renderedBase64 =
      canvas.toDataURL("image/jpeg", 0.95).split(",")[1] ?? "";

    isLoading.value = false;
  }

  watch(
    () => imageStore.currentImage,
    () => {
      if (imageStore.hasImage) renderPreview();
    }
  );
  watch(
    () => watermarkStore.$state,
    () => {
      if (imageStore.hasImage) renderPreview();
    },
    { deep: true }
  );
  watch(
    () => imageStore.exifData,
    () => {
      if (imageStore.hasImage) renderPreview();
    }
  );

  return { renderPreview, canvasRef, isLoading };
}
