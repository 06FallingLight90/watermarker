<script setup lang="ts">
import { ref, inject } from "vue";
import { useImageStore } from "@/stores/image";
import { useBatchStore } from "@/stores/batch";
import { useWatermarkStore } from "@/stores/watermark";
import { useTauriCommands } from "@/composables/useTauriCommands";

const renderPreview = inject<() => Promise<void>>("renderPreview", async () => {});

const imageStore = useImageStore();
const batchStore = useBatchStore();
const watermarkStore = useWatermarkStore();
const { loadImage, readExif } = useTauriCommands();
const loading = ref(false);
const error = ref("");

async function handleFileSelect() {
  try {
    const { open } = await import("@tauri-apps/plugin-dialog");
    const selected = await open({
      multiple: false,
      filters: [
        {
          name: "Images",
          extensions: ["jpg", "jpeg", "png", "bmp", "webp"],
        },
      ],
    });

    if (selected) {
      loading.value = true;
      error.value = "";

      // Save current watermark config to active batch entry (if any)
      if (batchStore.activeIndex !== null) {
        batchStore.updateEntryConfig(batchStore.activeIndex, watermarkStore.snapshotConfig());
        batchStore.setActive(null);
      }

      const path = selected as string;
      const info = await loadImage(path);
      imageStore.setImage(info, path);

      try {
        const exif = await readExif(path);
        imageStore.setExif(exif);
      } catch {
        // EXIF is optional
      }

      await renderPreview();
    }
  } catch (e) {
    error.value = `Failed to load image: ${e}`;
  } finally {
    loading.value = false;
  }
}

function clearImage() {
  // Save current watermark config to active batch entry before clearing
  if (batchStore.activeIndex !== null) {
    batchStore.updateEntryConfig(batchStore.activeIndex, watermarkStore.snapshotConfig());
    batchStore.setActive(null);
  }
  imageStore.clearImage();
}
</script>

<template>
  <div class="left-panel">
    <h3 class="panel-title">图片</h3>

    <button class="btn btn-primary" @click="handleFileSelect" :disabled="loading">
      {{ loading ? "加载中..." : "打开图片" }}
    </button>

    <div v-if="error" class="error-msg">{{ error }}</div>

    <div v-if="imageStore.hasImage" class="image-info">
      <p><strong>文件:</strong> {{ imageStore.filePath?.split(/[\\/]/).pop() }}</p>
      <p><strong>尺寸:</strong> {{ imageStore.currentImage?.width }} x {{ imageStore.currentImage?.height }}</p>
      <p><strong>格式:</strong> {{ imageStore.currentImage?.format?.toUpperCase() }}</p>
      <button class="btn btn-sm" @click="clearImage">清除</button>
    </div>

    <div v-if="imageStore.exifData" class="exif-section">
      <h4>EXIF 信息</h4>
      <table>
        <tr v-if="imageStore.exifData.camera_model">
          <td>相机</td>
          <td>{{ imageStore.exifData.camera_model }}</td>
        </tr>
        <tr v-if="imageStore.exifData.lens_model">
          <td>镜头</td>
          <td>{{ imageStore.exifData.lens_model }}</td>
        </tr>
        <tr v-if="imageStore.exifData.focal_length">
          <td>焦距</td>
          <td>{{ imageStore.exifData.focal_length }}</td>
        </tr>
        <tr v-if="imageStore.exifData.aperture">
          <td>光圈</td>
          <td>{{ imageStore.exifData.aperture }}</td>
        </tr>
        <tr v-if="imageStore.exifData.shutter_speed">
          <td>快门</td>
          <td>{{ imageStore.exifData.shutter_speed }}</td>
        </tr>
        <tr v-if="imageStore.exifData.iso">
          <td>ISO</td>
          <td>{{ imageStore.exifData.iso }}</td>
        </tr>
        <tr v-if="imageStore.exifData.date_taken">
          <td>拍摄日期</td>
          <td>{{ imageStore.exifData.date_taken }}</td>
        </tr>
        <tr v-if="imageStore.exifData.gps_latitude">
          <td>GPS</td>
          <td>{{ imageStore.exifData.gps_latitude }}, {{ imageStore.exifData.gps_longitude }}</td>
        </tr>
      </table>
    </div>
  </div>
</template>

<style scoped>
.left-panel {
  width: 260px;
  min-width: 220px;
  padding: 12px;
  border-right: 1px solid #333;
  overflow-y: auto;
}

.image-info {
  margin-top: 12px;
  padding: 10px;
  background: #1e1e1e;
  border-radius: 4px;
}

.image-info p {
  margin: 4px 0;
  font-size: 13px;
}

.exif-section {
  margin-top: 12px;
}

.exif-section h4 {
  margin: 0 0 8px 0;
  font-size: 14px;
}

.exif-section table {
  width: 100%;
  font-size: 12px;
}

.exif-section td {
  padding: 3px 4px;
  border-bottom: 1px solid #2a2a2a;
}

.exif-section td:first-child {
  color: #888;
  width: 65px;
}
</style>
