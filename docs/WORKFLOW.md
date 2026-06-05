# 开发与 CI/CD 工作流

## 本地开发

### 环境搭建

1. **安装 Node.js** (推荐 v18+)
   ```bash
   # 使用 nvm (推荐)
   nvm install 22
   nvm use 22
   ```

2. **安装 Rust**
   ```bash
   # Windows (推荐 MSVC 工具链)
   curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh

   # macOS / Linux
   curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh

   # 中国用户可使用镜像加速
   RUSTUP_DIST_SERVER=https://mirrors.tuna.tsinghua.edu.cn/rustup rustup-init
   ```

3. **安装系统依赖**

   **Linux** — Tauri 需要 WebKitGTK 和 GTK 库：
   ```bash
   # Debian / Ubuntu
   sudo apt update
   sudo apt install -y libwebkit2gtk-4.1-dev libgtk-3-dev \
     libayatana-appindicator3-dev librsvg2-dev \
     libjavascriptcoregtk-4.1-dev libsoup-3.0-dev

   # Fedora
   sudo dnf install -y webkit2gtk4.1-devel gtk3-devel \
     libayatana-appindicator-devel librsvg2-devel \
     javascriptcoregtk4.1-devel libsoup3-devel

   # Arch
   sudo pacman -S --needed webkit2gtk-4.1 gtk3 \
     libayatana-appindicator librsvg
   ```

   **macOS** — 无需额外系统依赖。

   **Windows** — 需 WebView2 运行时（Windows 10+ 已自带）。若缺失，[下载安装](https://developer.microsoft.com/microsoft-edge/webview2/)。

4. **安装项目依赖**
   ```bash
   npm install
   ```

### 开发命令

```bash
npm run dev          # 仅启动 Vite 前端开发服务器 (http://localhost:1420)
npm run tauri dev    # 启动 Tauri 应用（含前端 HMR + Rust 后端）
npm run build        # TypeScript 类型检查 + Vite 前端构建
npm run tauri build  # 构建当前平台的发布安装包
```

### 开发注意事项

- `npm run dev` 仅启动前端，无法调用 Tauri 命令；完整功能需 `npm run tauri dev`
- Rust 代码修改后会自动重新编译（Tauri 内置 Cargo watch）
- 前端代码修改支持 HMR（热模块替换），无需手动刷新
- 开发模式下控制台可见，发布版本自动隐藏（`windows_subsystem = "windows"`）

## 项目配置

### Tauri 配置 ([src-tauri/tauri.conf.json](../src-tauri/tauri.conf.json))

| 配置项 | 值 | 说明 |
|--------|-----|------|
| `productName` | Watermarker | 应用显示名称 |
| `version` | 0.1.0 | 应用版本 |
| `identifier` | com.watermarker.app | 应用唯一标识符 |
| `window.width` | 1280 | 默认窗口宽度 |
| `window.height` | 800 | 默认窗口高度 |
| `window.minWidth` | 960 | 最小窗口宽度 |
| `window.minHeight` | 600 | 最小窗口高度 |
| `bundle.icon` | 32x32, 128x128, ICO | 多尺寸应用图标 |
| `security.csp` | null | 内容安全策略（开发模式关闭） |

### Rust 依赖 ([src-tauri/Cargo.toml](../src-tauri/Cargo.toml))

| Crate | 版本 | 用途 |
|-------|------|------|
| `tauri` | 2 | 桌面框架核心 |
| `tauri-plugin-dialog` | 2 | 文件选择对话框 |
| `tauri-plugin-fs` | 2 | 文件系统访问 |
| `image` | 0.25 | 图片解码/编码 |
| `kamadak-exif` | 0.6 | EXIF 元数据解析 |
| `base64` | 0.22 | Base64 编解码 |
| `imageproc` | 0.25 | 图片绘制文字 |
| `ab_glyph` | 0.2 | 字体渲染（imageproc 0.25 依赖） |
| `serde` / `serde_json` | 1 | 序列化/反序列化 |

### Tauri 权限 ([src-tauri/capabilities/default.json](../src-tauri/capabilities/default.json))

- `core:default` — 核心 Tauri 功能
- `dialog:allow-open` / `dialog:allow-save` — 文件打开/保存对话框
- `fs:allow-read-text-file` / `fs:allow-write-text-file` — 文件读写

## Rust 命令接口

所有前后端通信通过 Tauri `invoke()` 调用：

| 命令 | 参数 | 返回 | 说明 |
|------|------|------|------|
| `load_image` | `path: String` | `ImageInfo` | 加载图片 → base64 JPEG 预览（质量 75） |
| `load_image_raw` | `path: String` | `RawImageData` | 读取原始文件字节 → base64（保留 Alpha） |
| `list_system_fonts` | — | `Vec<FontEntry>` | 扫描系统字体目录 |
| `save_image` | `imageData, width, height, path, quality` | `()` | 保存图片（像素数据，备用） |
| `export_file` | `base64: String, outputPath: String` | `()` | 直接写入 base64 数据到文件 |
| `read_exif` | `path: String` | `ExifData` | 读取 EXIF 元数据 |
| `apply_text_watermark` | `imageBase64, config, fontPath` | `WatermarkResult` | Rust 端文字水印（备用） |
| `apply_logo_watermark` | `imageBase64, config` | `WatermarkResult` | Rust 端 Logo 水印（备用） |
| `process_batch` | `files, config, app` | `Vec<String>` | Rust 端批处理（备用） |

> **注意**：`save_image`、`apply_text_watermark`、`apply_logo_watermark`、`process_batch` 在实际使用中已被前端 Canvas 渲染方案替代。`export_file` 是主要的导出通道：前端 Canvas 生成 base64，Rust 负责写入文件。

## 跨平台字体路径

应用根据运行平台自动选择默认字体：

| 平台 | 默认字体路径 |
|------|-------------|
| Windows | `C:/Windows/Fonts/arial.ttf` |
| macOS | `/System/Library/Fonts/Helvetica.ttf` |
| Linux | `/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf` |

- **前端**：`watermarkStore.detectDefaultFont()` 通过 `navigator.platform` 检测
- **后端**：`batch.rs` 通过 `cfg!(target_os)` 编译时检测

## CI/CD 自动构建

配置文件：[`.github/workflows/build.yml`](../.github/workflows/build.yml)

### 触发条件

1. **Tag 推送**：推送 `v*` 格式的 Git 标签（如 `v0.1.0`）
2. **手动触发**：GitHub Actions 页面 `workflow_dispatch`

### 构建矩阵

| Job | Runner | 产物 | 说明 |
|-----|--------|------|------|
| `windows` | `windows-latest` | NSIS 安装包 (.exe) | 使用 WebView2 运行时 |
| `macos` | `macos-latest` | DMG 镜像 (.dmg) | 使用 ad-hoc 代码签名 |
| `linux` | `ubuntu-latest` | AppImage (.AppImage) + .deb | 需安装 WebKitGTK 依赖 |

### 发布流程

1. **确保代码已推送到 GitHub `main` 分支**
   ```bash
   git push origin main
   ```

2. **创建并推送版本标签**
   ```bash
   git tag v0.1.0
   git push origin v0.1.0
   ```

3. **等待 CI 完成** (约 10-15 分钟)
   - GitHub Actions 自动构建 Windows 和 macOS 安装包
   - 构建产物自动上传到对应 Tag 的 Release 页面

4. **下载安装包**
   - 访问 `https://github.com/<user>/watermarker/releases/tag/v0.1.0`
   - 下载对应平台的安装包

### macOS 署名说明

由于应用未经过 Apple 官方公证（需 $99/年 Apple Developer 账号），macOS 使用 **ad-hoc 代码签名** (`signingIdentity: "-"`)。用户首次打开前需在终端执行：

```bash
sudo xattr -rd com.apple.quarantine /Applications/Watermarker.app
```

然后即可正常打开。此说明已包含在 Release 页面中。

### Linux 打包格式

Tauri 支持四种 Linux 打包格式，CI 默认启用 **AppImage** + **.deb**：

| 格式 | 文件 | 适用发行版 | 特点 |
|------|------|-----------|------|
| **AppImage** | `*.AppImage` | 所有 | 单文件便携运行，无需安装，`chmod +x` 后直接执行 |
| **.deb** | `*.deb` | Debian / Ubuntu / Mint | `sudo dpkg -i` 安装，包管理器管理 |
| **.rpm** | `*.rpm` | Fedora / RHEL / CentOS | `sudo rpm -i` 安装，包管理器管理 |
| **tar.gz** | `*.tar.gz` | 所有 | 仅归档压缩，手动解压运行 |

**推荐 AppImage**：一个文件通吃所有发行版，不需要 root 权限，删除即卸载。

**CI 中的 Linux 依赖安装**（`ubuntu-latest` runner 自带大部分，仅需确认）：

```yaml
- name: Install Linux dependencies
  run: |
    sudo apt update
    sudo apt install -y libwebkit2gtk-4.1-dev libgtk-3-dev \
      libayatana-appindicator3-dev librsvg2-dev \
      libjavascriptcoregtk-4.1-dev libsoup-3.0-dev
```

构建参数：`--bundles deb,appimage`（或 `rpm`、`tar.gz`）。

### GitHub Actions 配置要点

- **权限**：`permissions: contents: write` — 允许创建 Release 和上传资产
- **tauri-action@v0**：官方动作，自动调用 `npm run tauri build` 并创建 Release
- **参数说明**：
  - `tagName: ${{ github.ref_name }}` — 使用推送的 Tag 名称
  - `releaseDraft: false` — 直接发布（非草稿）
  - `args: --bundles <type>` — 指定打包格式

## 从源码构建

```bash
# 1. 克隆仓库
git clone https://github.com/<user>/watermarker.git
cd watermarker

# 2. 安装依赖
npm install

# 3. 构建发布包
npm run tauri build

# 4. 产物位置
# Windows: src-tauri/target/release/bundle/nsis/Watermarker_*.exe
# macOS:   src-tauri/target/release/bundle/dmg/Watermarker_*.dmg
# Linux:   src-tauri/target/release/bundle/appimage/Watermarker_*.AppImage
#          src-tauri/target/release/bundle/deb/Watermarker_*.deb
```

### 调试构建体积

发布版本 Rust 二进制约 3-6MB（release 模式 + LTO 优化），各平台安装包大小：

| 平台 | 安装包 | 典型体积 |
|------|--------|---------|
| Windows | NSIS .exe | ~5 MB |
| macOS | DMG | ~4 MB |
| Linux | AppImage | ~5 MB |
| Linux | .deb | ~3 MB |

若调试构建过大，检查：

- 确保使用 **release** 模式（默认 `npm run tauri build`）
- `target/` 目录可安全删除（`npm run tauri build` 会重新编译）
- 调试构建（`target/debug/`）可达数 GB，仅用于开发
