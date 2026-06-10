# 更新日志

## v0.4.0 (2026-06)

### 新增

- **EXIF 商标 Logo 替换**：若相机为 Canon / Nikon / Sony，可将 EXIF 水印中的相机型号文本替换为厂商商标图片
  - `src/assets/trade_marks/` 内置三家厂商的 PNG 商标（Canon、Nikon、Sony）
  - 新增 `src/utils/tradeMarks.ts`：预加载商标图片，根据 `camera_make` 匹配品牌
  - `ExifWatermarkConfig` 新增 `trade_mark_enabled`（开关）和 `trade_mark_scale`（图片大小，照片宽度百分比）
  - 支持统一布局和独立布局两种模式，商标图片支持旋转、透明度、平铺（平铺模式下商标图片同样可平铺）
  - 当前图片的品牌不在支持列表中时显示提示信息
- **批处理队列独立水印配置**：队列中每张图片可拥有独立的水印设置
  - 队列文件列表支持点击切换预览：点击文件名即可将该图片加载到主预览区域，当前水印配置自动保存到切换前的文件
  - 添加文件到队列时，所有文件默认继承当前水印配置的快照
  - 每张图片的水印配置独立存储（`BatchWatermarkConfig`），可单独修改并在导出时各自应用
  - 通过 LeftPanel 打开的独立图片会解除批处理队列的激活状态
  - 批处理导出时自动保存当前激活文件的配置，每张图片使用各自的独立水印配置渲染
- **新增类型**：`BatchWatermarkConfig`（完整水印配置快照）、`BatchFileEntry`（文件路径 + 独立配置）
- **新增渲染函数**：`renderWatermarkFromConfig()` / `renderOffscreenWithConfig()` — 基于配置快照的渲染，无需依赖 Pinia Store，支持批量导出时各文件使用独立配置
- **watermarkStore 新增方法**：`snapshotConfig()` 导出当前配置快照，`loadSnapshot()` 加载配置快照（加载时跳过 localStorage 持久化）
- **位置滑块数值显示**：所有水印位置滑块（水平/垂直）均显示百分比数值，便于精准控制

### 修复

- **竖构图照片预览旋转**：修复高大于宽的照片在预览窗口中顺时针旋转 90° 的问题。Rust `from_file()` 现在读取 EXIF Orientation 标签并自动应用旋转/翻转变换后再编码为预览图

### 重构

- **RightPanel.vue 拆分**：994 行单体组件拆分为 6 个子组件：
  - `RightPanel.vue`（101 行）— 轻量容器，负责水印类型切换和启停
  - `TextWatermarkPanel.vue`（141 行）— 文字水印设置
  - `LogoWatermarkPanel.vue`（91 行）— Logo 水印设置
  - `ExifWatermarkPanel.vue`（214 行）— EXIF 水印设置
  - `ExifFieldStylePanel.vue`（137 行）— EXIF 独立布局字段样式面板
  - `ExportSection.vue`（102 行）— 导出区域
- **useCanvas.ts 拆分**（398 行 → 65 行）：纯绘制函数提取到 `useWatermarkDrawing.ts`（353 行），原文件仅保留 composable 并重新导出
- **新增工具/组合式函数**：
  - `utils/colorConvert.ts`（14 行）— `rgbToHex` / `hexToRgb` 颜色转换
  - `utils/tradeMarks.ts` — 商标图片预加载与品牌匹配
  - `composables/useFontLoader.ts`（86 行）— 字体加载逻辑（系统字体扫描 + FontFace API 注册）
- **全局样式提取**：`styles/shared.css`（171 行）— 各面板共用的表单/控件样式集中管理

## v0.3.0 (2026-06)

### 变更

- 版本号升级至 0.3.0（package.json、Cargo.toml、tauri.conf.json 同步更新）
- **字体大小改为相对大小**：所有水印字体大小从绝对像素值改为图片宽度百分比，批处理不同尺寸照片时文字等比缩放，实现真正的 WYSIWYG
- **向后兼容**：旧的绝对像素配置（>30）自动迁移为百分比值
- **修改icon**：修改了软件的icon

### 新增（自 v0.2.0）

- **文字水印颜色自定义**：可通过颜色选择器自由设置文字填充色
- **文字水印描边**：支持描边宽度（0–20px）和描边颜色设置
- **EXIF 元数据水印**：新增第三种水印类型，可将照片 EXIF 信息作为水印内容
  - 支持勾选需要显示的元数据字段（相机型号、镜头、焦距、光圈、快门、ISO、拍摄日期、GPS 位置）
  - 两种布局模式：
    - **统一布局**：所有字段组合为多行文本块，整体定位/旋转/平铺
    - **独立布局**：各字段组独立定位和样式，手风琴式面板切换
  - 焦距/光圈/快门/ISO 合并为同一行显示
  - EXIF 水印仅显示数值，不显示字段标签
  - 完整的文字样式控制：字体、颜色、描边、旋转、透明度、平铺
  - 独立布局下 5 个字段组（相机型号、镜头、拍摄日期、GPS、参数行）各有独立样式
  - 批量处理时自动读取每张图片的 EXIF 数据
- **UI 优化**：右侧面板改为 flex 弹性布局，配置区独立滚动，导出区固定底部

### 修复

- 独立布局多面板同时展开导致界面拥挤 → 改为手风琴模式（同一时间只展开一个）

## v0.2.0 (2026-06)

### 变更

- 版本号升级至 0.2.0（package.json、Cargo.toml、tauri.conf.json 同步更新）

### 新增（自 v0.1.0）

- **Linux AppImage 构建**：CI 工作流新增 Linux job，构建 `.AppImage` 格式发布
- **性能优化**：优化批处理和渲染关键路径性能
- **macOS ad-hoc 签名**：解决 macOS "应用已损坏" 问题
- **跨平台图标**：RGBA PNG 和 ICO 图标，确保各平台正常显示

## v0.1.0 (2025-07)

首个功能原型版本，实现核心的图片水印编辑与导出功能。

### 新增

- **图片加载**：支持 JPG / PNG / BMP / WebP 格式，后端通过 Rust `image` crate 解码
- **EXIF 元数据展示**：相机型号、镜头、光圈、快门、ISO、焦距、拍摄日期、GPS 信息
- **文字水印**：
  - 可自定义文字内容、字号 (12–500px)、颜色、透明度
  - 支持位置调整（水平和垂直相对位置）
  - 支持**平铺模式**（可调节间距）
  - 支持**旋转**（0–360°，每个瓦片独立旋转）
  - 支持**字体选择**：自动检测系统已安装字体，下拉选择或手动浏览字体文件
- **Logo 水印**：
  - 支持 PNG/JPG/SVG/WebP 作为水印图层
  - 缩放改为**按照片宽度百分比**（5–100%），预览与导出自动一致
  - 可调节透明度、位置
  - Alpha 混合渲染
- **实时 Canvas 预览**：所见即所得，任何水印参数变化即时反映
- **单张导出**：PNG（无损）和 JPEG（最高质量）两种格式
- **批量处理**：多文件队列，统一水印参数，前端 Canvas 渲染保证一致性
- **配置持久化**：水印参数自动保存到 localStorage，重启后恢复（Logo 图片除外）
- **跨平台构建**：Windows NSIS 安装包 + macOS DMG 安装包
- **CI/CD**：GitHub Actions 自动构建，Tag 推送自动发布
- **性能基准测试**：`src-tauri/tests/bench_batch.rs` — Rust 集成测试测量各环节耗时

### 修复记录

- JPEG 编码器不支持 RGBA8 → 添加 `rgba_to_rgb()` 转换函数
- 预览首次不加载 → 添加 `watch(imageStore.currentImage, ...)` 监听
- 导出文件 0KB → 修复 `provide/inject` 兄弟组件不可达，改为 Pinia Store + 模块级函数
- 导出压缩 → 全分辨率离屏 Canvas 渲染，PNG 默认无损
- 批量预览 ≠ 导出 → 批处理改用前端 Canvas `renderOffscreen()` 代替 Rust 引擎
- Logo 水印预览/导出大小不一致 → Logo 缩放改为百分比制，基于 Canvas 宽计算，天然 WYSIWYG
- CI 不触发 → 添加 `permissions: contents: write` 和 `workflow_dispatch`
- macOS 构建失败 — 图标非 RGBA → 重新生成 RGBA 格式 PNG/ICO 图标
- macOS "应用已损坏" → 添加 ad-hoc 代码签名 (`APPLE_SIGNING_IDENTITY: "-"`)
- RGBA PNG 作 Logo 无反应 → `from_file` 新增 `to_rgb8()` 转换，修复 JPEG 编码 RGBA 报错
- Logo 透明区域变黑色 → 新增 `load_image_raw` 命令，保留原始格式（含 Alpha 通道），Logo 改用此命令加载
- Logo 加载失败无提示 → `RightPanel.vue` 新增 `logoError` 错误显示
- 批处理添加文件无预览刷新 → `BatchPanel.vue` 新增自动加载队首文件到预览窗口
- 预览加载慢 + 导出二次压缩 → `load_image` 预览质量降至 75；导出/批处理改用 `load_image_raw` 读取原始文件，消除二次 JPEG 压缩
- 水印旋转字段从未生效 → `drawTextWatermarkStatic` 新增 `ctx.rotate()` 逻辑，平铺/单次均支持
- 配置重启丢失 → `watermarkStore` 新增 localStorage 持久化，300ms 防抖自动保存
- 字体无法选择 → 新增 `list_system_fonts` Rust 命令 + FontFace API 加载 + 下拉选择 UI
- Logo 缩放上限对大片不够 → 上限从 200% 提高到 500%（后改为百分比制 5–100%）
- 字体大小上限不够 → 上限从 200px 提高到 500px

### 已知限制

- macOS 版本因未经过 Apple 官方公证，需手动解除隔离
- 批量处理仅串行处理（未使用多线程）
- 不支持水印颜色渐变
- Logo 缩放仅按宽度百分比，不支持按高度
- 文字水印平铺 + 大角度旋转时，瓦片之间可能有间隙（旋转中心为瓦片原点）

### 技术债务

- Rust 引擎文字水印 (`engine/text.rs`) 和批处理 (`commands/batch.rs`) 代码保留但实际未使用
- 前端文本水印平铺计算在每次 `fillText` 调用时重新 `measureText`，大图可能性能瓶颈
- 缺少端到端测试
- 缺少 i18n 国际化支持（UI 硬编码中文/英文混合）
