# 更新日志

## v0.2.0 (2026-06)

### 变更

- 版本号升级至 0.2.0（package.json、Cargo.toml、tauri.conf.json 同步更新）

### 新增（自 v0.1.0）

- **Linux AppImage 构建**：支持 `.AppImage` 格式发布
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
