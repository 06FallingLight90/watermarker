# Watermarker — 图片水印编辑器

轻量级跨平台图片水印编辑应用。基于 **Tauri v2 + Vue 3 + TypeScript** 构建。

## 功能特性

- **图片加载** — 支持 JPG / PNG / BMP / WebP 格式
- **EXIF 元数据展示** — 相机型号、镜头、光圈、快门、ISO、焦距、GPS 等信息
- **文字水印** — 可自定义文字、字号、颜色、位置、透明度，支持**平铺模式**
- **Logo 水印** — 支持 PNG/JPG/SVG/WebP 作为水印图层，可调缩放、位置、透明度
- **实时 Canvas 预览** — 所见即所得，预览与导出结果一致
- **单张导出** — 全分辨率渲染，支持 PNG（无损）和 JPEG（最高质量）
- **批量处理** — 多文件队列，前端 Canvas 渲染，确保批处理结果与预览一致
- **跨平台** — Windows NSIS 安装包 + macOS DMG 安装包
- **轻量化** — 安装包 < 10MB

## 快速开始

### 环境要求

- **Node.js** >= 18
- **Rust** >= 1.70 (MSVC 工具链)
- **系统**：Windows 10+ (需 WebView2) / macOS 11+ / Linux

### 开发模式

```bash
# 安装前端依赖
npm install

# 启动 Tauri 开发模式（含热重载）
npm run tauri dev
```

### 构建发布包

```bash
# 构建当前平台的安装包
npm run tauri build
```

构建产物位于 `src-tauri/target/release/bundle/` 目录。

## 项目结构

```
watermarker/
├── src/                        # Vue 3 前端源码
│   ├── components/             # Vue 组件
│   │   ├── LeftPanel.vue       # 文件选择 & EXIF 信息
│   │   ├── CenterCanvas.vue    # Canvas 实时预览
│   │   ├── RightPanel.vue      # 水印设置 & 导出
│   │   └── BatchPanel.vue      # 批量处理面板
│   ├── composables/            # 组合式逻辑
│   │   ├── useCanvas.ts        # Canvas 渲染核心（预览 & 导出）
│   │   └── useTauriCommands.ts # Tauri 命令封装
│   ├── stores/                 # Pinia 状态管理
│   │   ├── image.ts            # 当前图片 & 渲染结果
│   │   ├── watermark.ts        # 水印配置
│   │   └── batch.ts            # 批处理状态
│   ├── types/index.ts          # TypeScript 类型定义
│   ├── App.vue                 # 根组件（三栏布局）
│   ├── main.ts                 # 应用入口
│   └── style.css               # 全局样式
├── src-tauri/                  # Rust 后端
│   ├── src/
│   │   ├── main.rs             # 程序入口
│   │   ├── lib.rs              # Tauri 命令注册
│   │   ├── commands/           # Tauri 命令层
│   │   │   ├── image.rs        # 图片加载/导出命令
│   │   │   ├── exif.rs         # EXIF 读取命令
│   │   │   ├── watermark.rs    # 水印渲染命令
│   │   │   └── batch.rs        # 批量处理命令
│   │   └── engine/             # 渲染引擎
│   │       ├── image.rs        # 图片 I/O & 格式转换
│   │       ├── exif.rs         # EXIF 解析器
│   │       ├── text.rs         # 文字水印渲染 (ab_glyph + imageproc)
│   │       └── overlay.rs      # Logo 水印渲染 (alpha blending)
│   ├── Cargo.toml              # Rust 依赖配置
│   └── tauri.conf.json         # Tauri 窗口与打包配置
├── .github/workflows/build.yml # CI/CD 自动构建
├── package.json                # Node 依赖 & 脚本
├── vite.config.ts              # Vite 构建配置
└── docs/                       # 项目文档
```

## 技术栈

| 层级 | 技术 | 说明 |
|------|------|------|
| 桌面框架 | Tauri v2 | Rust + WebView，轻量化跨平台 |
| 前端框架 | Vue 3 + Composition API | 响应式 UI |
| 状态管理 | Pinia | 类型友好的 Vue 状态管理 |
| 构建工具 | Vite 6 | 快速开发 & 打包 |
| 类型检查 | TypeScript 5.5 | 类型安全 |
| 图像处理 (Rust) | image 0.25, imageproc 0.25, ab_glyph 0.2 | 服务端图片解码/编码/水印 |
| EXIF 解析 | kamadak-exif 0.6 | 读取照片元数据 |
| 图像渲染 (前端) | HTML5 Canvas API | 预览 & 全分辨率导出 |

## 相关文档

- **[新手教程](TUTORIAL.md) ← 如果你是新手，从这里开始！** 由浅入深对照代码学习系统架构、数据流和技术栈
- [架构说明](ARCHITECTURE.md) — 渲染管线、数据流、设计决策
- [开发与 CI/CD 工作流](WORKFLOW.md) — 本地构建、发布流程、自动化构建
- [更新日志](CHANGELOG.md) — 版本历史与变更记录
