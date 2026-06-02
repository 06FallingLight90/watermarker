<script setup lang="ts">
import { provide } from "vue";
import { useImageStore } from "@/stores/image";
import { useCanvas } from "@/composables/useCanvas";

const imageStore = useImageStore();
const { renderPreview, canvasRef } = useCanvas();

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
</style>
