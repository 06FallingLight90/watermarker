<script setup lang="ts">
import LeftPanel from "@/components/LeftPanel.vue";
import CenterCanvas from "@/components/CenterCanvas.vue";
import RightPanel from "@/components/RightPanel.vue";
import BatchPanel from "@/components/BatchPanel.vue";
</script>

<template>
  <div class="app-container">
    <header class="app-header">
      <h1>Watermarker</h1>
      <span class="subtitle">图片水印编辑器</span>
    </header>

    <div class="main-area">
      <LeftPanel />
      <CenterCanvas />
      <RightPanel />
    </div>

    <BatchPanel />
  </div>
</template>

<style scoped>
.app-container {
  display: flex;
  flex-direction: column;
  height: 100vh;
  width: 100vw;
  overflow: hidden;
  background: #1a1a1a;
  color: #ddd;
}

.app-header {
  display: flex;
  align-items: baseline;
  gap: 12px;
  padding: 10px 16px;
  border-bottom: 1px solid #333;
  background: #141414;
  flex-shrink: 0;
}

.app-header h1 {
  margin: 0;
  font-size: 20px;
  font-weight: 600;
  color: #4a9;
  letter-spacing: 1px;
}

.subtitle {
  font-size: 13px;
  color: #666;
}

.main-area {
  display: flex;
  flex: 1;
  overflow: hidden;
}
</style>
