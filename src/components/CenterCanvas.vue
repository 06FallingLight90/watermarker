<script setup lang="ts">
import { provide } from "vue";
import { useImageStore } from "@/stores/image";
import { useCanvas } from "@/composables/useCanvas";

const imageStore = useImageStore();
const { renderPreview, canvasRef, isLoading } = useCanvas();

provide("renderPreview", renderPreview);
</script>

<template>
  <div class="center-panel">
    <div class="canvas-wrapper">
      <div v-if="!imageStore.hasImage" class="placeholder">
        <div class="placeholder-icon">&#128247;</div>
        <p>打开一张图片开始编辑水印</p>
      </div>

      <canvas ref="canvasRef" v-show="imageStore.hasImage" />

      <!-- Loading overlay -->
      <div v-if="isLoading" class="loading-overlay">
        <div class="spinner" />
        <p class="loading-text">加载中...</p>
      </div>
    </div>
  </div>
</template>

<style scoped>
.center-panel {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  background: #0d0d0d;
  overflow: hidden;
}

.canvas-wrapper {
  position: relative;
  width: 100%;
  height: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
}

canvas {
  max-width: 100%;
  max-height: 100%;
  object-fit: contain;
}

.placeholder {
  text-align: center;
  color: #555;
  user-select: none;
}

.placeholder-icon {
  font-size: 64px;
  margin-bottom: 12px;
}

.placeholder p {
  font-size: 16px;
}

/* ── Loading overlay ── */

.loading-overlay {
  position: absolute;
  inset: 0;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  background: rgba(13, 13, 13, 0.75);
  z-index: 10;
  gap: 16px;
}

.spinner {
  width: 36px;
  height: 36px;
  border: 3px solid rgba(255, 255, 255, 0.15);
  border-top-color: #4a9;
  border-radius: 50%;
  animation: spin 0.8s linear infinite;
}

@keyframes spin {
  to { transform: rotate(360deg); }
}

.loading-text {
  font-size: 14px;
  color: #999;
  margin: 0;
  user-select: none;
}
</style>
