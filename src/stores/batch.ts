import { defineStore } from "pinia";
import { ref, computed } from "vue";
import type { BatchProgress } from "@/types";

export const useBatchStore = defineStore("batch", () => {
  const files = ref<string[]>([]);
  const progressList = ref<BatchProgress[]>([]);
  const isProcessing = ref(false);

  const totalFiles = computed(() => files.value.length);
  const completedFiles = computed(
    () => progressList.value.filter((p) => p.status === "done").length
  );
  const errorFiles = computed(
    () => progressList.value.filter((p) => p.status === "error").length
  );

  function addFiles(newFiles: string[]) {
    for (const f of newFiles) {
      if (!files.value.includes(f)) {
        files.value.push(f);
      }
    }
  }

  function removeFile(index: number) {
    files.value.splice(index, 1);
  }

  function clearFiles() {
    files.value = [];
    progressList.value = [];
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
    files,
    progressList,
    isProcessing,
    totalFiles,
    completedFiles,
    errorFiles,
    addFiles,
    removeFile,
    clearFiles,
    updateProgress,
    setProcessing,
  };
});
