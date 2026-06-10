import { defineStore } from "pinia";
import { ref, computed } from "vue";
import type { BatchProgress, BatchFileEntry, BatchWatermarkConfig } from "@/types";

export const useBatchStore = defineStore("batch", () => {
  const entries = ref<BatchFileEntry[]>([]);
  const progressList = ref<BatchProgress[]>([]);
  const isProcessing = ref(false);
  /** Index of the batch file currently displayed in the preview panel, or null */
  const activeIndex = ref<number | null>(null);

  /** File paths only (derived from entries, for backward compatibility) */
  const files = computed(() => entries.value.map((e) => e.path));

  const totalFiles = computed(() => entries.value.length);
  const completedFiles = computed(
    () => progressList.value.filter((p) => p.status === "done").length
  );
  const errorFiles = computed(
    () => progressList.value.filter((p) => p.status === "error").length
  );

  /** Add files to the batch queue, each with a snapshot of the given config */
  function addFiles(newFiles: string[], defaultConfig: BatchWatermarkConfig) {
    for (const f of newFiles) {
      if (!entries.value.some((e) => e.path === f)) {
        entries.value.push({
          path: f,
          config: JSON.parse(JSON.stringify(defaultConfig)),
        });
      }
    }
  }

  function removeFile(index: number) {
    entries.value.splice(index, 1);
    // Adjust activeIndex after removal
    if (activeIndex.value === null) return;
    if (entries.value.length === 0) {
      activeIndex.value = null;
    } else if (index < activeIndex.value) {
      activeIndex.value--;
    } else if (index === activeIndex.value) {
      // The active file was removed — clear active
      activeIndex.value = null;
    } else if (activeIndex.value >= entries.value.length) {
      activeIndex.value = entries.value.length - 1;
    }
  }

  function setActive(index: number | null) {
    activeIndex.value = index;
  }

  /** Overwrite the config for the entry at the given index */
  function updateEntryConfig(index: number, config: BatchWatermarkConfig) {
    if (index >= 0 && index < entries.value.length) {
      entries.value[index].config = JSON.parse(JSON.stringify(config));
    }
  }

  function clearFiles() {
    entries.value = [];
    progressList.value = [];
    activeIndex.value = null;
  }

  function updateProgress(progress: BatchProgress) {
    const idx = progressList.value.findIndex(
      (p) => p.file_name === progress.file_name
    );
    if (idx >= 0) {
      progressList.value[idx] = progress;
    } else {
      progressList.value.push(progress);
    }
  }

  function setProcessing(val: boolean) {
    isProcessing.value = val;
  }

  return {
    entries,
    files,
    progressList,
    isProcessing,
    activeIndex,
    totalFiles,
    completedFiles,
    errorFiles,
    addFiles,
    removeFile,
    setActive,
    updateEntryConfig,
    clearFiles,
    updateProgress,
    setProcessing,
  };
});
