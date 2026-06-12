# 架构说明

## 设计原则

- 轻量化，小巧方便，专注水印功能
- 注重可移植性，提供跨平台支持
- 重视性能，力求快速
- 易用性高，轻松上手

## 未来方向

- 更多水印模板
- 性能优化
- 操作细节、操作手感优化
- 移动端版本

## 概述

Watermarker 采用 **Tauri v2 混合架构**：Rust 后端处理文件 I/O 和图片编解码，Vue 3 前端负责 UI 展示和 Canvas 渲染。水印的实际绘制逻辑大部分在前端 Canvas 完成，以保证预览和导出的 WYSIWYG 一致性。

```
┌──────────────────────────────────────────────────────┐
│                   Vue 3 Frontend                     │
│  ┌─────────────┐ ┌──────────────┐ ┌──────────────┐  │
│  │ LeftPanel   │ │ CenterCanvas │ │ RightPanel   │  │
│  │ (文件/EXIF)  │ │ (Canvas预览)  │ │ (容器+子面板) │  │
│  └─────────────┘ └──────────────┘ └──────────────┘  │
│                         ┌──────────────────────────┐ │
│                         │ watermark/TextWatermark  │ │
│                         │ watermark/LogoWatermark  │ │
│                         │ watermark/ExifWatermark  │ │
│                         │ export/ExportSection     │ │
│                         └──────────────────────────┘ │
│  ┌──────────────────────────────────────────────────┐│
│  │              BatchPanel (批处理)                   ││
│  └──────────────────────────────────────────────────┘│
│         │ invoke()              ▲                    │
│         ▼                      │                    │
│  ┌──────────────────────────────────────────────────┐│
│  │   useWatermarkDrawing.ts (纯绘制函数)              ││
│  │   · renderFullRes() — 全分辨率导出                  ││
│  │   · renderOffscreen() — 批处理离屏渲染              ││
│  │   · renderWatermarkStatic() — 水印分发              ││
│  │   · drawTextWatermarkStatic() — 文字水印           ││
│  │   · drawExifWatermarkStatic() — EXIF水印           ││
│  │   · drawLogoWatermarkStatic() — Logo水印           ││
│  └──────────────────────────────────────────────────┘│
│  ┌──────────────────────────────────────────────────┐│
│  │   useCanvas.ts (composable, 重新导出上述函数)       ││
│  │   useFontLoader.ts (系统字体+自定义字体加载)        ││
│  │   utils/colorConvert.ts (rgbToHex/hexToRgb)       ││
│  │   utils/tradeMarks.ts (商标Logo预加载+品牌匹配)     ││
│  └──────────────────────────────────────────────────┘│
│  ┌──────────────────────────────────────────────────┐│
│  │   Pinia Stores (状态管理)                          ││
│  │   · imageStore — 图片数据 & renderedBase64         ││
│  │   · watermarkStore — 水印配置                      ││
│  │   · batchStore — 批处理队列                        ││
│  └──────────────────────────────────────────────────┘│
└──────────────────────────────────────────────────────┘
         │                        ▲
    invoke()                 return
         │                        │
         ▼                        │
┌──────────────────────────────────────────────────────┐
│                 Rust Backend (Tauri)                  │
│  ┌──────────────┐ ┌──────────────┐ ┌──────────────┐  │
│  │ commands/    │ │ commands/    │ │ commands/    │  │
│  │ image.rs     │ │ exif.rs      │ │ watermark.rs │  │
│  │ · load_image │ │ · read_exif  │ │ · apply_text  │  │
│  │ · export_file│ │              │ │ · apply_logo  │  │
│  └──────────────┘ └──────────────┘ └──────────────┘  │
│  ┌──────────────────────────────────────────────────┐│
│  │               engine/ (渲染引擎)                    ││
│  │ image.rs — 解码/编码/格式转换                       ││
│  │ exif.rs — EXIF 元数据解析                          ││
│  │ text.rs — ab_glyph + imageproc 文字水印             ││
│  │ overlay.rs — alpha blending Logo 叠加              ││
│  └──────────────────────────────────────────────────┘│
└──────────────────────────────────────────────────────┘
```

## 渲染管线

### 预览流程

```
用户选择图片
    │
    ▼
[Rust] load_image() → 解码图片 → JPEG base64
    │
    ▼
[Vue] imageStore.setImage(info)
    │
    ▼
[Canvas] renderPreview()
    │ 1. loadImageFromBase64() → HTMLImageElement
    │ 2. 计算缩放比例 (适应容器)
    │ 3. ctx.drawImage() → Canvas
    │ 4. renderWatermarkStatic(ctx, canvas, scale, store)  [useWatermarkDrawing.ts]
    │    └─ text: drawTextWatermarkStatic()
    │    └─ logo: drawLogoWatermarkStatic()
    │    └─ exif: drawExifWatermarkStatic()
       └─ camera_model 匹配Canon/Nikon/Sony → 绘制商标Logo替代文字
    │ 5. canvas.toDataURL() → imageStore.renderedBase64
    ▼
实时预览完成 (响应式更新)
```

### 单张导出流程

```
用户点击"导出单张图片"
    │
    ▼
[Canvas] renderFullRes(format)
    │ 1. 调用 load_image_raw(filePath) → 原始文件字节（避免二次 JPEG 压缩）
    │ 2. 创建离屏 Canvas (原始尺寸, scale=1.0)
    │ 3. ctx.drawImage() → 原图
    │ 4. renderWatermarkStatic(ctx, canvas, 1.0, store)
    │    └─ 水印按原始分辨率绘制
    │ 5. canvas.toDataURL(mime, quality) → base64
    ▼
[Rust] export_file(base64, outputPath)
    │ Base64 解码 → 直接写入文件
    ▼
导出完成 (WYSIWYG)
```

### 批处理流程

```
用户添加文件 → 选择输出目录 → 点击"开始批处理"
    │
    ▼
[BarchPanel] for each entry:
    │ 1. [Rust] loadImageRaw(filePath) → 原始文件字节 → base64
    │ 2. [Rust] readExif(filePath) → EXIF数据 (exif模式)
    │ 3. [Canvas] renderOffscreenWithConfig(rawBase64, format, entry.config, mime, exif)
    │    └─ 每张图片使用各自的独立水印配置 (BatchWatermarkConfig)
    │ 4. [Rust] export_file(renderedBase64, outPath)
    ▼
逐文件渲染进度反馈
```

## 关键设计决策

### WYSIWYG 一致性

**问题**：最初使用 Rust 引擎渲染水印导出，前端 Canvas 渲染预览，两者实现不同导致导出结果与预览不一致。

**解决方案**：
- 将水印渲染逻辑统一到前端 Canvas
- `renderFullRes()` 和 `renderOffscreen()` 共享同一个 `renderWatermarkStatic()` 函数
- 导出时使用 `scale=1.0` 在离屏 Canvas 上以原始分辨率绘制
- `imageStore.renderedBase64` 存储预览渲染结果，确保"所见即所得"

### Logo 水印尺寸：百分比制

**问题**：最初 Logo 缩放是相对 Logo 自身的倍数（0.1–5×），预览和导出需额外 `renderScale` 参数校正。

**解决方案 (v2)**：改为**照片宽度百分比**（5–100%）。
- `logoW = canvas.width * (config.scale / 100)`
- `canvas.width` 在预览和导出中自动反映当前渲染比例
- 无需 `renderScale` 参数，天然 WYSIWYG

### 文字水印旋转

文字水印的旋转逻辑在 `drawTextWatermarkStatic` 中实现：
- **单次模式**：`ctx.translate(x, y)` + `ctx.rotate(angle)` → 以指定位置为中心旋转
- **平铺模式**：每个瓦片独立 `save/translate/rotate/fillText/restore`，网格保持正交排列
- 角度范围 0–360°，步进 1°

### 自定义字体加载

字体通过 **FontFace API** 注册到浏览器：
1. `load_image_raw(path)` 读取 TTF/OTF 原始字节 → base64 data URL
2. `new FontFace(familyName, 'url(data:font/ttf;base64,...)')` → `await fontFace.load()`
3. `document.fonts.add(fontFace)` 注册全局可用
4. Canvas 通过 `ctx.font = '...px "familyName", Arial, sans-serif'` 使用

系统字体列表由 Rust `list_system_fonts` 命令扫描平台字体目录获取，在 `useFontLoader.ts` 的 `loadSystemFonts()` 中调用并填充 Pinia store。

### 配置持久化

`watermarkStore` 使用 localStorage：
- 300ms 防抖自动保存（watcher 深度监听 store 变化）
- 初始化时从 localStorage 恢复
- `logo_base64` 排除在持久化之外（可能数 MB）

### provide/inject 局限性

**问题**：`CenterCanvas` 通过 `provide("renderPreview", renderPreview)` 注入函数，`LeftPanel` 通过 `inject` 获取。但 `RightPanel` 和 `CenterCanvas` 是兄弟组件，`provide` 无法跨兄弟传递。

**解决方案**：
- 将 `renderedBase64` 移入 Pinia Store (`imageStore`)
- 将 `renderFullRes()` 和 `renderOffscreen()` 提取为**模块级函数**（位于 `useWatermarkDrawing.ts`，由 `useCanvas.ts` 重新导出）
- 导出组件（`RightPanel`、`BatchPanel`）直接从模块导入，无需依赖注入

### JPEG 编码格式

**问题**：JPEG 编码器不支持 RGBA8 颜色类型（只有 3 通道）。

**解决方案**：
- `rgba_to_rgb()` 函数将 RGBA 字节转换为 RGB（丢弃 Alpha 通道）
- 所有 JPEG 编码前先调用此转换
- 添加了边界检查防止越界 panic

### 轻量化设计

- **技术选型**：Tauri (Rust + WebView) 替代 Electron，避免打包完整 Chromium
- **编译优化**：Rust release 模式启用优化，`windows_subsystem = "windows"` 隐藏控制台
- **目标体积**：安装包 < 10MB（Windows NSIS）、< 5MB（macOS DMG）

## 组件通信

```
App.vue
  ├── LeftPanel ─────────────────────────────┐
  │   · 调用 loadImage/exif 命令              │
  │   · inject("renderPreview") ←── provide  │
  │                                          │
  ├── CenterCanvas ──────────────────────────┤
  │   · 持有 <canvas> ref                    │
  │   · provide("renderPreview", fn) ────────┘
  │   · watch(imageStore.currentImage)       │
  │     watch(watermarkStore.$state)         │
  │     → 自动触发 renderPreview()           │
  │                                          │
  ├── RightPanel (容器) ─────────────────────┘
  │   · 水印类型切换 + 启用/禁用
  │   ├── TextWatermarkPanel  · 修改 textConfig → 触发重绘
  │   ├── LogoWatermarkPanel  · 修改 logoConfig
  │   ├── ExifWatermarkPanel  · 修改 exifConfig
  │   └── ExportSection       · 直接 import renderFullRes (模块级)
  │
  └── BatchPanel
      · 直接 import renderOffscreen (模块级)
      · 遍历文件列表逐文件处理
```

## 数据流

```
                 ┌──────────────┐
                 │ imageStore    │
                 │ currentImage  │ ← loadImage (Rust)
                 │ renderedBase64│ ← renderPreview (Canvas)
                 │ exifData      │ ← readExif (Rust)
                 └──────────────┘
                        │
          ┌─────────────┼─────────────┐
          │             │             │
          ▼             ▼             ▼
    LeftPanel    CenterCanvas   RightPanel
    (EXIF显示)   (预览渲染)     (导出操作)
                                     │
                                     ▼
                              renderFullRes()
                              → exportFile (Rust)
                              → 写入磁盘

                 ┌──────────────┐
                 │watermarkStore │
                 │ watermarkType │
                 │ textConfig    │ ← 用户调整
                 │ logoConfig    │
                 │ enabled       │
                 │ fontPath      │
                 └──────────────┘
                        │
          watch 深度监听 ──→ 自动触发 renderPreview()
```
