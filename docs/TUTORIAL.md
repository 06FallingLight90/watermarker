# Watermarker 新手教程

> 面向软件开发新手，由浅入深对照代码学习本项目。

本教程假设你已会基础的 HTML/CSS/JavaScript（变量、函数、对象），但不要求了解 Vue、Tauri、Rust 等框架。

---

## 目录

- [第 0 章：快速热身 —— 先跑起来](#第-0-章快速热身--先跑起来)
- [第 1 章：宏观视角 —— 这个应用是什么结构](#第-1-章宏观视角--这个应用是什么结构)
- [第 2 章：前端基础 —— Vue 是怎么工作的](#第-2-章前端基础--vue-是怎么工作的)
- [第 3 章：数据的大脑 —— Pinia 状态管理](#第-3-章数据的大脑--pinia-状态管理)
- [第 4 章：界的眼睛 —— Canvas 渲染](#第-4-章界的眼睛--canvas-渲染)
- [第 5 章：桥梁 —— 前后端通信](#第-5-章桥梁--前后端通信)
- [第 6 章：后端 —— Rust 在做什么](#第-6-章后端--rust-在做什么)
- [第 7 章：完整的旅程 —— 追踪一次导出](#第-7-章完整的旅程--追踪一次导出)
- [第 8 章：打包与发布](#第-8-章打包与发布)
- [附录 A：技术词汇表](#附录-a技术词汇表)
- [附录 B：文件速查表](#附录-b文件速查表)

---

## 第 0 章：快速热身 —— 先跑起来

在学习代码之前，先把应用跑起来，获得感性认识。

### 前置条件

- 已安装 **Node.js**（版本 ≥ 18）
- 已安装 **Rust**（版本 ≥ 1.70）

```bash
# 验证环境
node --version    # 应输出 v18.x.x 或更高
rustc --version   # 应输出 rustc 1.xx.x
```

### 启动应用

```bash
cd watermarker              # 进入项目目录
npm install                 # 安装前端依赖（仅第一次）
npm run tauri dev           # 启动应用
```

启动后，你会看到一个 1280×800 的窗口，分为四个区域：

```
┌──────────────────────────────────────────────┐
│  Watermarker  图片水印编辑器                   │ ← 标题栏
├────────┬───────────────────┬─────────────────┤
│ 左面板  │    中央画布         │    右面板         │
│ 打开图片 │   (图片预览区)      │  水印设置/导出    │
│ EXIF信息│                   │                 │
├────────┴───────────────────┴─────────────────┤
│             批处理队列 (可折叠)                  │
└──────────────────────────────────────────────┘
```

**动手试试**：上传一张照片 → 开启水印 → 调整参数 → 导出 → 对比原图。

---

## 第 1 章：宏观视角 —— 这个应用是什么结构

### 一句话概括

Watermarker 是一个**桌面应用**（不是网页）。它由一个 **Web 界面**（前端）和一个 **Rust 程序**（后端）组成，两者通过 Tauri 框架连接。

### 类比：餐厅

```
顾客（你）      ←→      服务员（前端）      ←→      厨房（后端）

你点菜                 传菜                    做菜
（点击"打开图片"）      （Vue 处理交互）         （Rust 读取文件）
你看到菜               端上桌                   返回结果
（看到预览）            （Canvas 显示）           （返回图片数据）
```

- **顾客** = 用户操作
- **服务员（前端）** = Vue 界面 —— 负责展示、交互
- **厨房（后端）** = Rust 程序 —— 负责读文件、写文件

### 文件分布

```
watermarker/
├── src/                  ← 前端代码（Vue/TypeScript）
│   ├── components/       ← 界面组件
│   ├── composables/      ← 可复用的逻辑函数
│   ├── stores/           ← 全局数据（Pinia）
│   └── types/            ← 数据类型定义
├── src-tauri/            ← 后端代码（Rust）
│   └── src/
│       ├── commands/     ← Tauri 命令（前端调用的接口）
│       └── engine/       ← 核心引擎（图片/EXIF/水印处理）
├── package.json          ← 前端依赖列表
├── src-tauri/Cargo.toml  ← 后端依赖列表
└── docs/                 ← 文档
```

> **阅读建议**：先看 `src/`（前端），再看 `src-tauri/`（后端）。前端是主要逻辑所在。

---

## 第 2 章：前端基础 —— Vue 是怎么工作的

### 2.1 什么是 Vue

Vue 是一个**构建用户界面的框架**。它帮你做三件事：

1. **组件化** —— 把页面拆成独立的小块，每块一个 `.vue` 文件
2. **响应式数据** —— 数据变了，页面自动更新（不需要手动操作 DOM）
3. **声明式渲染** —— 你描述"页面应该长什么样"，Vue 负责把它变出来

### 2.2 一个 Vue 组件的结构

每个 `.vue` 文件由三部分组成：

```vue
<script setup lang="ts">    <!-- ① 逻辑：TypeScript 代码 -->
// 变量、函数、监听器写在这里
</script>

<template>                   <!-- ② 模板：HTML 结构 -->
<!-- 页面元素写在这里 -->
</template>

<style scoped>               <!-- ③ 样式：CSS -->
/* 只影响当前组件的样式 */
</style>
```

让我们看最简单的组件 —— [`CenterCanvas.vue`](../src/components/CenterCanvas.vue)：

```vue
<script setup lang="ts">
import { useCanvas } from "@/composables/useCanvas";
const { canvasRef } = useCanvas();   // 获取 Canvas 元素的引用
</script>

<template>
  <div class="center-panel">
    <!-- canvasRef 绑定到 <canvas> 元素上 -->
    <canvas ref="canvasRef" />
  </div>
</template>
```

**发生了什么**：
- `useCanvas()` 返回一个 `canvasRef`（这是一个"引用"，指向页面上的 `<canvas>` 元素）
- `ref="canvasRef"` 把引用绑定到 HTML 元素
- 之后 JS 代码通过 `canvasRef.value` 就能操作这个 Canvas

### 2.3 组合式 API（Composition API）

Vue 3 的核心设计是**组合式 API**：把相关逻辑封装成独立函数（叫 `composables`）。

**没有 Composition API 的写法**（选项式）：
```js
// 数据、方法、监听器分别放在不同位置，逻辑分散
data() { return { count: 0 } }
methods: { increment() { this.count++ } }
watch: { count() { ... } }
```

**有 Composition API 的写法**：
```typescript
// 相关的逻辑放在同一个函数里
function useCounter() {
  const count = ref(0);                    // 响应式变量
  function increment() { count.value++; }  // 修改变量
  watch(count, () => { ... });             // 监听变化
  return { count, increment };             // 暴露给组件使用
}
```

**优势**：一个 `composable` 就是一个独立的功能模块，可以在多个组件间复用。

### 2.4 响应式数据 ref() 和 computed()

```typescript
import { ref, computed, watch } from "vue";

// ref() 创建一个响应式变量
const count = ref(0);
console.log(count.value); // 0 — 读取需要 .value
count.value = 5;          // 修改也需要 .value

// computed() 创建一个计算属性（自动跟随依赖变化）
const doubled = computed(() => count.value * 2);
// count 改变时，doubled 自动更新

// watch() 监听数据变化并执行回调
watch(count, (newVal, oldVal) => {
  console.log(`count 从 ${oldVal} 变成 ${newVal}`);
});
```

**关键点**：Vue 的"响应式"意思是数据变了，所有依赖它的地方自动更新。你不用手动写 `document.getElementById('xxx').innerHTML = newValue`。

### 2.5 组件树

Watermarker 的组件树：

```
App.vue                              ← 根组件，定义整体布局
├── LeftPanel.vue                    ← 左侧：文件选择 + EXIF
├── CenterCanvas.vue                 ← 中间：Canvas 预览
├── RightPanel.vue                   ← 右侧：水印设置 + 导出
└── BatchPanel.vue                   ← 底部：批处理
```

数据通过 **Pinia**（第3章）在组件间共享，不需要层层传递。

> **小练习**：打开 [`App.vue`](../src/App.vue)，对照上面的组件树，找出每个组件在模板中的位置。

---

## 第 3 章：数据的大脑 —— Pinia 状态管理

### 3.1 为什么需要 Pinia

不同组件需要共享数据。比如：
- `RightPanel` 修改水印参数
- `CenterCanvas` 需要读取水印参数来重绘预览

如果组件间直接传数据，会非常混乱。Pinia 把共享数据放在一个**全局仓库（Store）**里，任何组件都能读写。

```
┌──────────┐   读取   ┌──────────────┐   读取   ┌──────────┐
│LeftPanel │ ──────→ │ Pinia Store  │ ←────── │RightPanel│
└──────────┘          │  (数据中心)   │          └──────────┘
                      └──────────────┘
                           │    ▲
                           ▼    │
                      ┌──────────────┐
                      │CenterCanvas  │
                      └──────────────┘
```

### 3.2 三个 Store 解析

#### imageStore —— 当前编辑的图片

> 文件：[src/stores/image.ts](../src/stores/image.ts)

```typescript
// 创建 Store
export const useImageStore = defineStore("image", () => {

  // ── 状态（数据） ──
  const currentImage = ref<ImageInfo | null>(null);  // 当前图片信息
  const exifData = ref<ExifData | null>(null);        // EXIF 元数据
  const filePath = ref<string>("");                    // 文件路径
  const renderedBase64 = ref<string>("");              // 渲染后的预览结果

  // ── 计算属性 ──
  const hasImage = computed(() => currentImage.value !== null);
  // hasImage 自动跟踪 currentImage，有图时为 true

  // ── 方法 ──
  function setImage(info: ImageInfo, path: string) {
    currentImage.value = info;
    filePath.value = path;
  }

  function clearImage() {
    currentImage.value = null;
    exifData.value = null;
    filePath.value = "";
    renderedBase64.value = "";
  }

  // 暴露给外部使用
  return { currentImage, exifData, filePath, renderedBase64, hasImage,
           setImage, setExif, clearImage };
});
```

**数据类型解释**—— `ImageInfo` (定义在 [`src/types/index.ts`](../src/types/index.ts))：

```typescript
interface ImageInfo {
  width: number;    // 图片宽度（像素）
  height: number;   // 图片高度（像素）
  format: string;   // 文件格式（"jpeg" / "png"）
  base64: string;   // 图片的 base64 编码（很重要！）
}
```

**什么是 base64？** 把图片的二进制数据转成纯文本字符串。前端 Canvas 不直接读文件，而是通过 base64 字符串获取图片内容。传输路径：

```
磁盘上的 .jpg 文件
    ↓ Rust 读取并编码
base64 字符串（如 "iVBORw0KGgo..."）
    ↓ 传递给前端
<img src="data:image/jpeg;base64,iVBORw0KGgo...">
    ↓ Canvas 绘制
用户看到的预览
```

#### watermarkStore —— 水印配置

> 文件：[src/stores/watermark.ts](../src/stores/watermark.ts)

```typescript
export const useWatermarkStore = defineStore("watermark", () => {

  const watermarkType = ref<WatermarkType>("text");  // "text" 或 "logo"
  const enabled = ref(true);                          // 是否开启水印

  const textConfig = ref<TextWatermarkConfig>({
    text: "Watermark",      // 文字内容
    font_size: 48,          // 字号
    color: [255,255,255,200], // [R, G, B, A] 白色半透明
    pos_x: 0.5, pos_y: 0.5, // 位置 (0.5 = 居中)
    opacity: 0.8,           // 透明度 (0=全透明, 1=不透明)
    tile_spacing: 0,        // 平铺间距 (0=不平铺)
    rotation: 0,            // 旋转角度（预留）
  });

  const logoConfig = ref<LogoWatermarkConfig>({
    logo_base64: "",   // Logo 图片的 base64
    opacity: 0.8,      // 透明度
    scale: 1.0,        // 缩放 (1.0=原始大小)
    pos_x: 0.5, pos_y: 0.5,
    rotation: 0,
  });
});
```

**关键概念**：
- `ref()` 包裹的数据是响应式的 —— 改了数据，用到它的组件自动更新
- `pos_x` 和 `pos_y` 使用**相对坐标**（0~1），0.5 表示图中间，与实际像素无关

#### batchStore —— 批处理队列

> 文件：[src/stores/batch.ts](../src/stores/batch.ts)

```typescript
export const useBatchStore = defineStore("batch", () => {
  const files = ref<string[]>([]);               // 待处理的文件路径列表
  const progressList = ref<BatchProgress[]>([]);  // 每个文件的处理进度
  const isProcessing = ref(false);                // 是否正在处理

  const totalFiles = computed(() => files.value.length);
  const completedFiles = computed(
    () => progressList.value.filter(p => p.status === "done").length
  );
});
```

### 3.3 如何使用 Store

在任何组件或 JS 文件中，一行代码就能获取 Store：

```typescript
import { useImageStore } from "@/stores/image";

const imageStore = useImageStore();    // 获取 Store 实例
console.log(imageStore.currentImage);  // 读取数据
imageStore.setImage(info, path);       // 调用方法
```

> **小练习**：打开 [`src/stores/watermark.ts`](../src/stores/watermark.ts)，找到 `detectDefaultFont()` 函数。它如何判断运行平台？找到了它返回的路径分别是什么？

---

## 第 4 章：界的眼睛 —— Canvas 渲染

### 4.1 什么是 Canvas

HTML5 Canvas 是一块**可编程的画布**。你获取它的"画笔"（2D 渲染上下文），然后用 JS 在上面画画。

```javascript
// 获取 Canvas 元素
const canvas = document.getElementById("myCanvas");

// 获取画笔（2D 渲染上下文）
const ctx = canvas.getContext("2d");

// 设置画笔属性
ctx.fillStyle = "red";
ctx.font = "48px Arial";

// 画文字
ctx.fillText("Hello", 100, 200);
```

Watermarker 的所有**水印绘制逻辑**都通过 Canvas 实现，这是整个项目最核心的文件。

> 核心文件：[src/composables/useCanvas.ts](../src/composables/useCanvas.ts)

### 4.2 文件结构解析

这个文件有三个层次：

```
useCanvas.ts
│
├── 模块级导出函数（可以被任何文件导入）
│   ├── renderFullRes(format)       — 单张全分辨率导出
│   ├── renderOffscreen(base64)     — 批处理离屏渲染
│   └── loadImageFromBase64(base64) — base64 → Image 元素
│
├── 内部绘制函数（只在文件内使用）
│   ├── renderWatermarkStatic()     — 水印分发器
│   ├── drawTextWatermarkStatic()   — 文字水印
│   └── drawLogoWatermarkStatic()   — Logo 水印
│
└── Composable（供组件使用）
    └── useCanvas()                 — 预览渲染 + 响应式监听
```

### 4.3 核心函数详解

#### loadImageFromBase64 —— 加载图片

```typescript
export function loadImageFromBase64(
  base64: string,
  mime = "image/jpeg"
): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();          // 创建 Image 对象
    img.onload = () => resolve(img);  // 加载成功 → 返回 img
    img.onerror = () => reject(new Error("Failed"));
    img.src = `data:${mime};base64,${base64}`;  // 设置数据源
  });
}
```

**逐行解释**：
1. `new Image()` —— 创建一个 `<img>` 元素（不插入页面）
2. 设置 `img.src` 为 base64 数据 URL —— 浏览器开始解码图片
3. `img.onload` —— 图片解码完成后触发
4. `Promise` —— 图片加载是异步的，用 Promise 包装，调用者用 `await` 等待

#### drawTextWatermarkStatic —— 文字水印

```typescript
function drawTextWatermarkStatic(
  ctx: CanvasRenderingContext2D,
  canvas: HTMLCanvasElement,
  config: TextWatermarkConfig,
  scale: number           // ← 关键参数！
): void {
  const { text, font_size, color, pos_x, pos_y, opacity, tile_spacing } = config;

  // 设置画笔属性
  ctx.globalAlpha = opacity;                              // 透明度
  ctx.fillStyle = `rgb(${color[0]},${color[1]},${color[2]})`;  // 颜色
  ctx.font = `${font_size * scale}px Arial`;              // 字号 × 缩放
  ctx.textAlign = "center";                                // 水平居中
  ctx.textBaseline = "middle";                             // 垂直居中

  // 计算实际位置（相对坐标 × Canvas 实际尺寸）
  const x = pos_x * canvas.width;
  const y = pos_y * canvas.height;

  if (tile_spacing > 0) {
    // ── 平铺模式 ──
    // 计算文字宽度和间距
    const spacing = Math.max(tile_spacing * scale, 50);
    const textW = ctx.measureText(text).width;

    // 双层循环：按行和列铺满整个画布
    for (let row = 0; row < canvas.height + scaledSize; row += spacing + scaledSize) {
      for (let col = 0; col < canvas.width + textW; col += spacing + textW) {
        ctx.fillText(text, col, row);  // 画一个文字
      }
    }
  } else {
    // ── 单次模式 ──
    ctx.fillText(text, x, y);  // 只在指定位置画一个
  }
}
```

**`scale` 参数为什么重要**：预览时 Canvas 缩放到容器大小，导出时 Canvas 是原图大小。同样的水印参数，在不同尺寸的 Canvas 上需要按比例缩放。`scale` 就是这条桥梁。

#### drawLogoWatermarkStatic —— Logo 水印

```typescript
async function drawLogoWatermarkStatic(
  ctx: CanvasRenderingContext2D,
  canvas: HTMLCanvasElement,
  config: LogoWatermarkConfig,
  renderScale: number       // ← 缩放参数
): Promise<void> {
  const { logo_base64, opacity, scale, pos_x, pos_y } = config;

  // 1. 把 base64 加载为 Image 对象
  const logoImg = await loadImageFromBase64(logo_base64, "image/png");

  // 2. 计算 Logo 的实际尺寸（原尺寸 × 用户缩放 × 画布缩放）
  const logoW = logoImg.width * scale * renderScale;
  const logoH = logoImg.height * scale * renderScale;

  // 3. 计算位置（居中偏移）
  const x = pos_x * canvas.width - logoW / 2;
  const y = pos_y * canvas.height - logoH / 2;

  // 4. 设置透明度并绘制
  ctx.globalAlpha = opacity;
  ctx.drawImage(logoImg, x, y, logoW, logoH);  // 把 Logo 画到 Canvas 上
}
```

#### useCanvas() —— 预览渲染

```typescript
export function useCanvas() {
  const imageStore = useImageStore();
  const watermarkStore = useWatermarkStore();
  const canvasRef = ref<HTMLCanvasElement | null>(null);

  async function renderPreview(): Promise<void> {
    const canvas = canvasRef.value;  // 获取页面上的 Canvas 元素
    const ctx = canvas.getContext("2d");
    const img = imageStore.currentImage;

    // 1. 加载原图
    const mainImg = await loadImageFromBase64(img.base64);

    // 2. 计算缩放比例（适应容器大小，最大不超过原图）
    const container = canvas.parentElement;
    const maxW = container.clientWidth;
    const maxH = container.clientHeight;
    const scale = Math.min(maxW / mainImg.width, maxH / mainImg.height, 1.0);

    // 3. 设置 Canvas 尺寸
    canvas.width = mainImg.width * scale;
    canvas.height = mainImg.height * scale;

    // 4. 画原图
    ctx.drawImage(mainImg, 0, 0, canvas.width, canvas.height);

    // 5. 画水印（传入 scale 保证尺寸正确）
    await renderWatermarkStatic(ctx, canvas, scale, watermarkStore);

    // 6. 保存渲染结果（供后续导出使用）
    imageStore.renderedBase64 = canvas.toDataURL("image/jpeg", 0.95).split(",")[1];
  }

  // ── 响应式监听 ──
  // 图片变化 → 重新渲染
  watch(() => imageStore.currentImage, () => {
    if (imageStore.hasImage) renderPreview();
  });

  // 水印参数变化 → 重新渲染（深度监听）
  watch(() => watermarkStore.$state, () => {
    if (imageStore.hasImage) renderPreview();
  }, { deep: true });

  return { renderPreview, canvasRef };
}
```

**两个 `watch` 的意义**：只要图片或水印参数发生变化，自动重绘预览。用户无需手动点击"刷新"。

### 4.4 预览 vs 导出 —— 同一个逻辑，不同的 scale

这是 Watermarker 最巧妙的设计：

```
预览：renderPreview()
  scale = 容器宽度 / 原图宽度（如 0.3）
  Canvas 尺寸：缩小后的
  水印也按 scale 缩小

导出：renderFullRes()
  scale = 1.0（原始大小）
  Canvas 尺寸：原图尺寸
  水印也按 1.0 绘制

         ┌──────────────────────────────┐
         │   renderWatermarkStatic()     │  ← 同一个绘制函数
         │   (文字/Logo 水印共享入口)      │
         └──────────────────────────────┘
                ↑              ↑
        scale=0.3        scale=1.0
                ↑              ↑
         renderPreview()  renderFullRes()
          (屏幕预览)        (文件导出)
```

> **小练习**：在 `useCanvas.ts` 中搜索 `renderFullRes`，理解它和 `renderPreview` 的三个区别。

---

## 第 5 章：桥梁 —— 前后端通信

### 5.1 前后端如何对话

Tauri 框架的核心机制：前端通过 `invoke()` 调用后端 Rust 函数，就像调用一个异步 API。

```
前端 TypeScript                    后端 Rust
══════════════                     ══════════

invoke("load_image", { path })     #[tauri::command]
    │                               pub fn load_image(path: String)
    │  ──────── IPC 通信 ────────→      → 读取文件
    │                                   → 解码图片
    │                                   → 返回 base64
    │  ←─────── 返回结果 ─────────  ←
    ▼
const info = await result
```

### 5.2 前端调用封装

文件：[src/composables/useTauriCommands.ts](../src/composables/useTauriCommands.ts)

```typescript
import { invoke } from "@tauri-apps/api/core";

export function useTauriCommands() {

  // invoke<返回类型>("命令名", { 参数对象 })
  async function loadImage(path: string): Promise<ImageInfo> {
    return invoke<ImageInfo>("load_image", { path });
  }

  async function readExif(path: string): Promise<ExifData> {
    return invoke<ExifData>("read_exif", { path });
  }

  async function exportFile(base64: string, outputPath: string): Promise<void> {
    return invoke("export_file", { base64, outputPath });
  }

  return { loadImage, readExif, exportFile };
}
```

**使用示例**（在 LeftPanel.vue 中）：

```typescript
const { loadImage, readExif } = useTauriCommands();

async function handleFileSelect() {
  const path = "/Users/me/photo.jpg";    // 用户选择的文件路径
  const info = await loadImage(path);    // 调用后端 → 获取图片信息
  const exif = await readExif(path);     // 调用后端 → 获取 EXIF
}
```

### 5.3 后端命令注册

文件：[src-tauri/src/lib.rs](../src-tauri/src/lib.rs)

```rust
use commands::{batch, exif, image, watermark};

pub fn run() {
    tauri::Builder::default()
        .invoke_handler(tauri::generate_handler![
            image::load_image,           // 注册命令
            image::save_image,
            image::export_file,
            exif::read_exif,
            watermark::apply_text_watermark,
            watermark::apply_logo_watermark,
            batch::process_batch,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
```

**`generate_handler![]`** 是一个 Rust 宏，把函数注册为 Tauri 命令，让前端可以调用。

### 5.4 实际使用情况

虽然注册了 7 个命令，实际前端主要使用 3 个：

| 命令 | 使用频率 | 用途 |
|------|---------|------|
| `load_image` | 每次打开图片 | 读取文件，返回 base64 预览 |
| `export_file` | 每次导出/批处理 | 把 base64 写入磁盘文件 |
| `read_exif` | 每次打开图片 | 读取 EXIF 元数据 |

其余 4 个（`save_image`、`apply_text_watermark`、`apply_logo_watermark`、`process_batch`）是早期实现，水印渲染已迁移到前端 Canvas，它们保留作为备用。

---

## 第 6 章：后端 —— Rust 在做什么

### 6.1 为什么需要 Rust

浏览器（WebView）有沙箱限制，前端 JS **不能直接读写本地文件**。Rust 后端负责：

1. **读取文件** → 解码图片 → 转 base64 → 传给前端
2. **写入文件** → base64 解码 → 写入磁盘
3. **读取 EXIF** → 解析元数据 → 返回结构化数据

### 6.2 Rust 项目结构

Rust 的模块系统：每个文件夹下的 `mod.rs` 声明该模块的子模块。

```
src-tauri/src/
├── main.rs           ← 程序入口（仅一行代码，调用 lib.rs 的 run()）
├── lib.rs            ← Tauri Builder，注册所有命令
├── commands/         ← 命令层（前端直接调用的函数）
│   ├── mod.rs        ← 声明 pub mod batch/exif/image/watermark
│   ├── image.rs      ← load_image, export_file
│   ├── exif.rs       ← read_exif
│   ├── watermark.rs  ← apply_text_watermark, apply_logo_watermark
│   └── batch.rs      ← process_batch
└── engine/           ← 引擎层（核心逻辑，被 commands 调用）
    ├── mod.rs        ← 声明 pub mod exif/image/overlay/text
    ├── image.rs      ← 图片解码、编码、格式转换
    ├── exif.rs       ← EXIF 数据解析
    ├── text.rs       ← 文字水印渲染
    └── overlay.rs    ← Logo 水印叠加
```

**分层架构**：

```
commands/ (命令层)       — 处理 Tauri 协议，接收/返回数据
    │
    ▼ 调用
engine/ (引擎层)         — 纯逻辑，不依赖 Tauri，可独立测试
```

### 6.3 关键 Rust 文件详解

#### image.rs — 图片 I/O

> 文件：[src-tauri/src/engine/image.rs](../src-tauri/src/engine/image.rs)

```rust
// ImageInfo 结构体（Rust 版本的数据类型）
pub struct ImageInfo {
    pub width: u32,        // u32 = 无符号 32 位整数
    pub height: u32,
    pub format: String,     // String = 字符串
    pub base64: String,
}

impl ImageInfo {
    // 从文件路径加载图片
    pub fn from_file(path: &str) -> Result<Self, String> {
        let img = image::open(path)?;     // image crate 解码图片

        let (width, height) = (img.width(), img.height());

        // 编码为 JPEG base64
        let mut buf = Cursor::new(Vec::new());  // 内存缓冲区
        JpegEncoder::new_with_quality(&mut buf, 90)
            .write_image(img.as_bytes(), width, height, img.color().into())?;

        let base64 = BASE64.encode(buf.get_ref());  // 转 base64

        Ok(ImageInfo { width, height, format: "jpeg".into(), base64 })
    }
}
```

**Rust 语法速览**：
- `&str` = 字符串引用（类似 JS 的 string）
- `u32` = 无符号 32 位整数（0 到 4,294,967,295）
- `Result<T, String>` = 可能成功返回 `T`，也可能失败返回 `String` 错误信息
- `?` 操作符 = 如果出错立刻返回错误，否则继续
- `Vec<u8>` = 字节数组（类似 JS 的 `Uint8Array`）

**`rgba_to_rgb()` 函数**（同文件）解决了 JPEG 编码不支持 RGBA 的问题：

```rust
pub fn rgba_to_rgb(raw: &[u8], w: u32, h: u32) -> Result<Vec<u8>, String> {
    // 安全检查：数据长度是否匹配
    let expected = (w * h * 4) as usize;
    if raw.len() != expected {
        return Err(format!("数据长度不匹配..."));  // 返回错误
    }

    let pixel_count = (w * h) as usize;
    let mut rgb = Vec::with_capacity(pixel_count * 3);  // RGB 只需 3 字节/像素

    for i in 0..pixel_count {
        let base = i * 4;
        rgb.push(raw[base]);      // R
        rgb.push(raw[base + 1]);  // G
        rgb.push(raw[base + 2]);  // B
        // 跳过 raw[base + 3] = Alpha
    }
    Ok(rgb)
}
```

**为什么需要这个函数**：
- PNG 像素 = [R, G, B, A] × 像素数（4 字节/像素）
- JPEG 像素 = [R, G, B] × 像素数（3 字节/像素，无透明通道）
- 直接喂 RGBA 数据给 JPEG 编码器会报错，需要先剥掉 Alpha

#### exif.rs — EXIF 解析

> 文件：[src-tauri/src/engine/exif.rs](../src-tauri/src/engine/exif.rs)

```rust
pub struct ExifReader;

impl ExifReader {
    pub fn read(file_path: &str) -> Result<ExifData, String> {
        let file = std::fs::File::open(file_path)?;     // 打开文件
        let mut reader = std::io::BufReader::new(&file);
        let exif = Reader::new()
            .read_from_container(&mut reader)?;          // 解析 EXIF

        let mut data = ExifData::default();              // 初始化默认值

        for field in exif.fields() {                     // 遍历每个 EXIF 字段
            let value = field.display_value().with_unit(&exif).to_string();
            let tag = field.tag;

            match tag {                                  // 按标签匹配
                Tag::Model => data.camera_model = Some(value),
                Tag::FNumber => data.aperture = Some(format_f_stop(&value)),
                Tag::ExposureTime => data.shutter_speed = Some(format_exposure(&value)),
                // ... 更多标签
                _ => {}  // 其他标签忽略
            }
        }
        Ok(data)
    }
}
```

**Rust 语法速览**：
- `Some(value)` = Rust 的"有值"（类似 JS 的非 null）
- `None` = Rust 的"没有值"（类似 JS 的 null/undefined）
- `Option<String>` = 可能是 `Some(String)` 或 `None`
- `match tag { ... }` = 模式匹配（类似 JS 的 switch，但更强大）
- `_ => {}` = 默认分支（匹配所有未列出的情况）

#### export_file 命令

> 文件：[src-tauri/src/commands/image.rs](../src-tauri/src/commands/image.rs#L21)

```rust
#[tauri::command]
pub fn export_file(base64: String, output_path: String) -> Result<(), String> {
    let data = BASE64.decode(&base64)?;          // base64 → 字节
    std::fs::write(&output_path, &data)?;        // 写入磁盘
    Ok(())
}
```

这是最常用的导出命令：前端 Canvas 已经渲染好了图片（base64 格式），后端只负责把它写入文件。简单的职责分工避免了重复渲染。

---

## 第 7 章：完整的旅程 —— 追踪一次导出

让我们追踪用户点击"导出单张图片"后，代码从头到尾做了什么。

### 时间线

```
时间  │  位置                │  操作
──────┼──────────────────────┼─────────────────────────────────────
  1   │ 用户                 │ 点击 "导出单张图片" 按钮
  2   │ RightPanel.vue:41   │ handleExport() 被调用
  3   │ RightPanel.vue:49   │ 弹出保存对话框，用户选择路径
  4   │ RightPanel.vue:63   │ 调用 renderFullRes(exportFormat)
──────┼──────────────────────┼─────────────────────────────────────
  5   │ useCanvas.ts:15     │ 进入 renderFullRes 函数
  6   │ useCanvas.ts:21     │ 等待 loadImageFromBase64 → HTMLImageElement
  7   │ useCanvas.ts:25-28  │ 创建离屏 Canvas（原图大小）
  8   │ useCanvas.ts:30     │ ctx.drawImage(原图, 0, 0)
  9   │ useCanvas.ts:31     │ renderWatermarkStatic(ctx, canvas, 1.0, store)
 10   │ useCanvas.ts:80-91  │ 判断水印类型，进入对应绘制函数
 11   │ useCanvas.ts:93-127 │ drawTextWatermarkStatic() 或
      │ useCanvas.ts:129-146│ drawLogoWatermarkStatic()
 12   │ useCanvas.ts:34-35  │ canvas.toDataURL("image/png") → base64
 13   │ useCanvas.ts:35     │ 返回 base64 字符串
──────┼──────────────────────┼─────────────────────────────────────
 14   │ RightPanel.vue:64   │ 调用 exportFile(base64, savePath)
──────┼──────────────────────┼─────────────────────────────────────
 15   │ useTauriCommands:57 │ invoke("export_file", ...)
 16   │ (IPC 通信)           │ 序列化参数 → Rust 进程
──────┼──────────────────────┼─────────────────────────────────────
 17   │ commands/image.rs:22│ export_file() 收到参数
 18   │ commands/image.rs:23│ base64 解码为字节
 19   │ commands/image.rs:26│ std::fs::write(path, bytes)
 20   │                     │ 文件写入磁盘 ✓
──────┼──────────────────────┼─────────────────────────────────────
 21   │ RightPanel.vue:66   │ alert("导出成功")
```

### 图解数据流

```
                 用户点击 "导出"
                       │
        ┌──────────────┴──────────────┐
        │   RightPanel.vue             │
        │   handleExport()             │
        │   1. 弹出保存对话框            │
        │   2. 调用 renderFullRes()     │
        └──────────────┬──────────────┘
                       │
        ┌──────────────▼──────────────┐
        │   useCanvas.ts               │
        │   renderFullRes()            │
        │   1. 从 imageStore 取原图     │
        │   2. 创建离屏 Canvas (原图大小)│
        │   3. 画原图 + 画水印           │
        │   4. toDataURL() → base64    │
        └──────────────┬──────────────┘
                       │ base64 字符串
        ┌──────────────▼──────────────┐
        │   useTauriCommands.ts        │
        │   exportFile(base64, path)   │
        │   invoke() → IPC 通信        │
        └──────────────┬──────────────┘
                       │ IPC (进程间通信)
        ┌──────────────▼──────────────┐
        │   commands/image.rs          │
        │   export_file()              │
        │   base64 解码 + 写入磁盘      │
        └──────────────┬──────────────┘
                       │
                  ✅ 文件保存到磁盘
```

### 批处理的差异

批处理在 [BatchPanel.vue](../src/components/BatchPanel.vue#L47) 中循环调用 `renderOffscreen()`，与单张导出相比：

- **相同点**：都创建离屏 Canvas，都调用 `renderWatermarkStatic()`
- **不同点**：批处理跳过对话框（输出目录预先选定），逐文件串行处理并更新进度

---

## 第 8 章：打包与发布

### 8.1 打包一个桌面应用

```bash
npm run tauri build
```

这个命令做了什么：
1. `vue-tsc --noEmit` → 检查 TypeScript 类型错误
2. `vite build` → 把 Vue 代码打包成 HTML/JS/CSS
3. `cargo build --release` → 编译 Rust 代码为原生二进制
4. 把前端文件和 Rust 二进制打包成一个安装包

**产物位置**：
- Windows: `src-tauri/target/release/bundle/nsis/Watermarker_*.exe`
- macOS: `src-tauri/target/release/bundle/dmg/Watermarker_*.dmg`

### 8.2 为什么 Tauri 比 Electron 轻

| | Electron | Tauri |
|---|---|---|
| 运行时 | 打包完整 Chromium（~150MB） | 使用系统自带 WebView（0MB） |
| 后端语言 | Node.js | Rust（编译为原生代码） |
| 安装包大小 | 通常 50-200MB | Watermarker < 10MB |
| 内存占用 | 每个应用 ~200MB+ | Watermarker ~30MB |

Tauri 不打包浏览器引擎，而是使用操作系统自带的 WebView2（Windows）/ WebKit（macOS）。

### 8.3 CI/CD 自动构建

GitHub Actions 配置文件：[.github/workflows/build.yml](../.github/workflows/build.yml)

**触发条件**：
- 推送 `v0.1.0` 这样的 Git 标签
- 在 GitHub 网页上手动触发

**构建流程**：
```
推送 v0.1.0 标签
    │
    ├──→ windows-latest 机器
    │    1. 安装 Node.js 22
    │    2. npm ci (安装依赖)
    │    3. tauri-action (构建 NSIS 安装包)
    │    4. 上传到 Release 页面
    │
    └──→ macos-latest 机器
         1. 安装 Node.js 22
         2. npm ci (安装依赖)
         3. 设置 APPLE_SIGNING_IDENTITY = "-" (ad-hoc 签名)
         4. tauri-action (构建 DMG)
         5. 上传到 Release 页面
```

> **小练习**：打开 [build.yml](../.github/workflows/build.yml)，找到 `APPLE_SIGNING_IDENTITY: "-"`。为什么值是 `"-"`？（提示：回顾第 8 章的 macOS 签名说明）

---

## 附录 A：技术词汇表

| 术语 | 解释 | 在本项目中的位置 |
|------|------|-----------------|
| **Tauri** | 用 Rust + WebView 构建桌面应用的框架 | 整个项目的骨架 |
| **Vue 3** | 前端 UI 框架，使用响应式数据驱动界面 | `src/` 下所有 `.vue` 文件 |
| **Composition API** | Vue 3 的逻辑组织方式，用函数组合功能 | `useCanvas()`, `useTauriCommands()` |
| **Pinia** | Vue 的全局状态管理库 | `src/stores/` 下所有文件 |
| **Canvas** | HTML5 的画布 API，可编程绘图 | `useCanvas.ts` 核心渲染 |
| **base64** | 用文本字符串表示二进制数据 | 图片在前后端间传输的格式 |
| **IPC** | Inter-Process Communication 进程间通信 | 前端 ↔ Rust 之间的数据传输 |
| **invoke()** | Tauri 前端调用后端的函数 | `useTauriCommands.ts` |
| **Cargo** | Rust 的包管理器和构建工具 | `Cargo.toml` 定义依赖 |
| **crate** | Rust 的包（类似 npm 包） | `image`, `exif`, `base64` 等 |
| **Vite** | 前端构建工具（快速 dev server + 打包） | `vite.config.ts` |
| **TypeScript** | 带类型系统的 JavaScript | `.ts` 和 `.vue` 文件中的逻辑 |
| **NSIS** | Windows 安装包制作工具 | CI 构建产物格式 |
| **DMG** | macOS 磁盘镜像格式 | CI 构建产物格式 |
| **EXIF** | 照片的元数据（相机、镜头、参数） | `engine/exif.rs` |
| **RGBA** | 像素格式：红绿蓝 + 透明通道 | 图片渲染的颜色表示 |
| **WebView** | 操作系统内置的浏览器引擎 | 承载前端界面的运行环境 |

## 附录 B：文件速查表

按学习顺序排列，从简单到复杂：

| 文件 | 难度 | 内容 | 学习目标 |
|------|------|------|---------|
| `index.html` | ⭐ | HTML 入口 | 了解 Web 应用入口 |
| `src/main.ts` | ⭐ | 应用初始化 | 了解 Vue + Pinia 启动 |
| `src/types/index.ts` | ⭐ | 类型定义 | 了解项目中的数据结构 |
| `src/App.vue` | ⭐ | 根布局组件 | 了解组件树结构 |
| `src/stores/batch.ts` | ⭐⭐ | 批处理 Store | 最简单的 Store，理解 Pinia 模式 |
| `src/stores/image.ts` | ⭐⭐ | 图片数据 Store | 理解响应式数据和 computed |
| `src/stores/watermark.ts` | ⭐⭐ | 水印配置 Store | 理解复杂配置对象 |
| `src/composables/useTauriCommands.ts` | ⭐⭐ | Tauri 命令封装 | 理解前后端通信 |
| `src/components/LeftPanel.vue` | ⭐⭐ | 左面板组件 | 理解组件如何使用 Store |
| `src/components/CenterCanvas.vue` | ⭐⭐ | Canvas 组件 | 理解 provide/inject 和 ref 绑定 |
| `src/components/RightPanel.vue` | ⭐⭐⭐ | 右面板组件 | 完整的交互流程 |
| `src/components/BatchPanel.vue` | ⭐⭐⭐ | 批处理面板 | 理解循环异步处理 |
| `src/composables/useCanvas.ts` | ⭐⭐⭐⭐ | **核心！** Canvas 渲染 | 理解预览/导出统一逻辑 |
| `src-tauri/src/lib.rs` | ⭐⭐ | 命令注册 | 了解 Rust 端入口 |
| `src-tauri/src/commands/image.rs` | ⭐⭐ | 图片命令 | Rust 命令的基本写法 |
| `src-tauri/src/engine/image.rs` | ⭐⭐⭐ | 图片引擎 | Rust 图片处理、RGBA→RGB |
| `src-tauri/src/engine/exif.rs` | ⭐⭐⭐ | EXIF 引擎 | Rust 模式匹配 |
| `src-tauri/src/engine/text.rs` | ⭐⭐⭐ | 文字水印引擎 | imageproc 库使用 |
| `src-tauri/src/engine/overlay.rs` | ⭐⭐⭐ | Logo 水印引擎 | Alpha 混合算法 |
| `.github/workflows/build.yml` | ⭐⭐ | CI 配置 | 理解 CI/CD 流程 |

### 建议的学习路线

```
第一遍（理解结构）：
  index.html → App.vue → types/index.ts → stores/* → LeftPanel → CenterCanvas

第二遍（理解逻辑）：
  useTauriCommands.ts → lib.rs → commands/image.rs → engine/image.rs

第三遍（理解核心）：
  useCanvas.ts (反复读，对照此教程第 4 章)

第四遍（理解全局）：
  RightPanel → BatchPanel → build.yml（CI/CD）
```

---

> **最后建议**：不要试图一次读完所有代码。挑一个你感兴趣的功能（比如"文字水印是怎么画上去的"），从用户操作开始追踪，遇到不认识的类型就跳转到定义，看到新奇的语法就回到本教程查词汇表。最好的学习方式是动手改代码、看效果变化。
