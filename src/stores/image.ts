import { defineStore } from "pinia";
import { ref, computed } from "vue";
import type { ImageInfo, ExifData } from "@/types";

export const useImageStore = defineStore("image", () => {
  const currentImage = ref<ImageInfo | null>(null);
  const exifData = ref<ExifData | null>(null);
  const filePath = ref<string>("");
  /// Canvas-rendered preview result (base64 JPEG), for WYSIWYG export
  const renderedBase64 = ref<string>("");

  const hasImage = computed(() => currentImage.value !== null);

  function setImage(info: ImageInfo, path: string) {
    currentImage.value = info;
    filePath.value = path;
  }

  function setExif(data: ExifData) {
    exifData.value = data;
  }

  function clearImage() {
    currentImage.value = null;
    exifData.value = null;
    filePath.value = "";
    renderedBase64.value = "";
  }

  return { currentImage, exifData, filePath, renderedBase64, hasImage, setImage, setExif, clearImage };
});
