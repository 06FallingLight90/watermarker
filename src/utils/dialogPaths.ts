// 每类图片选择/保存操作独立记住上次使用的目录，避免互相干扰
export type DialogKey = "import" | "export" | "logo";

const STORAGE_PREFIX = "dialog_dir:";

/** 提取文件路径所在目录 */
function dirOf(filePath: string): string {
  const i = Math.max(filePath.lastIndexOf("/"), filePath.lastIndexOf("\\"));
  return i >= 0 ? filePath.slice(0, i) : filePath;
}

/** 读取某操作记住的目录 */
export function getDialogDir(key: DialogKey): string | undefined {
  try {
    return localStorage.getItem(STORAGE_PREFIX + key) || undefined;
  } catch {
    return undefined;
  }
}

/** 根据选中的文件路径，记住其所在目录 */
export function rememberFileDir(key: DialogKey, filePath: string): void {
  const dir = dirOf(filePath);
  if (!dir) return;
  try {
    localStorage.setItem(STORAGE_PREFIX + key, dir);
  } catch {
    // 持久化失败不影响使用
  }
}

/** 直接记住一个目录（用于目录选择器） */
export function rememberDir(key: DialogKey, dir: string): void {
  if (!dir) return;
  try {
    localStorage.setItem(STORAGE_PREFIX + key, dir);
  } catch {
    // 持久化失败不影响使用
  }
}
