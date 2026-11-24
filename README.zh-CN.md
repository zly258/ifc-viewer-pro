<h1 align="center">IFC Viewer Pro</h1>

<p align="center">基于 React、Three.js 与 WebAssembly 的浏览器端 3D IFC 模型查看器，支持 BIM 几何浏览、属性检索、测量、剖切与视点批注。</p>

<p align="center">
  <a href="./README.md">English</a> | <a href="./README.zh-CN.md">简体中文</a>
</p>

<p align="center">
  <img src="https://img.shields.io/badge/React-18.2-3776AB?style=flat-square" alt="React 18.2"> <img src="https://img.shields.io/badge/TypeScript-5.8-3776AB?style=flat-square" alt="TypeScript 5.8"> <img src="https://img.shields.io/badge/Three.js-0.182-3776AB?style=flat-square" alt="Three.js 0.182"> <img src="https://img.shields.io/badge/Platform-Web%20Browser-4B5563?style=flat-square" alt="Platform Web Browser"> <a href="https://github.com/zly258/ifc-viewer-pro/actions/workflows/publish.yml"><img src="https://img.shields.io/github/actions/workflow/status/zly258/ifc-viewer-pro/publish.yml?branch=main&amp;style=flat-square&amp;label=Deploy" alt="部署工作流状态"></a>
</p>

IFC Viewer Pro 完全运行于浏览器端，通过独立 Web Worker 中的 `web-ifc` 解析 IFC 文件，并结合 Three.js 与 `three-mesh-bvh` 实现 BVH 加速拾取与渲染。支持通过拖放或文件选择加载本地 `.ifc` 模型，提供空间结构树浏览、构件属性查看、工程量报表、多模式测量、剖切分析以及按模型隔离存储的 BCF 视点批注。

## 核心亮点

| 亮点 | 实际价值 |
|---|---|
| 后台线程解析与合批渲染 | `web-ifc` 在 Web Worker（`services/ifc.worker.ts`）中流式解析几何，通过 `IfcBatcher` 合批并配合 IndexedDB 缓存（`CacheManager`），保持界面交互流畅。 |
| BVH 加速三维交互 | 集成 `three-mesh-bvh` 加速射线检测，提升大模型下的构件点击选中、悬停高亮与拾取响应速度。 |
| 模块化可拖拽工作区 | 按需懒加载多个可拖拽面板，涵盖空间结构树（`ModelTree`）、属性面板（`PropertyPanel`）、工程量报表（`ReportPanel`）与 BCF 批注（`BcfPanel`）。 |
| 测量与剖切工具 | 通过 `MeasurementManager` 支持距离、角度、坐标、面积与体积测量，并结合 `SectionManager` 提供交互式剖切分析。 |
| 中英文界面与主题切换 | 内置英文与简体中文语言包（`locales/en.ts`、`locales/zh.ts`）、明暗主题切换、快捷键面板（按 `?` 打开）及 PNG 截图导出。 |

## 系统架构

```text
┌─────────────────────────────────────────────────────────────────────────┐
│                         React UI Layer (App.tsx)                        │
│  ┌───────────┐  ┌──────────────┐  ┌───────────────┐  ┌───────────────┐  │
│  │ Viewer3D  │  │  ModelTree   │  │ PropertyPanel │  │ Report / BCF  │  │
│  │  Canvas   │  │ (Virtualized)│  │ & Measurement │  │    Panels     │  │
│  └─────┬─────┘  └──────┬───────┘  └───────┬───────┘  └───────┬───────┘  │
└────────┼───────────────┼──────────────────┼──────────────────┼──────────┘
         │               └──────────────────┼──────────────────┘
         ▼                                  ▼
┌─────────────────────────────────────────────────────────────────────────┐
│               IFCManager Facade (services/ifcManager.ts)                │
│                      + EventBus (services/eventBus.ts)                  │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐  ┌─────────────┐  │
│  │ SceneService │  │ ModelService │  │ Interaction  │  │  Feature    │  │
│  │  (Three.js)  │  │  (Visibility │  │   Service    │  │  Managers   │  │
│  │              │  │   & Bounds)  │  │ (BVH Picking)│  │(Measure/Sec)│  │
│  └──────────────┘  └──────────────┘  └──────────────┘  └─────────────┘  │
└───────────────────────────────────┬─────────────────────────────────────┘
                                    │
                                    ▼
                     ┌─────────────────────────────┐
                     │       LoadingService        │
                     │ (IfcBatcher / GLTF / Draco) │
                     └──────┬───────────────┬──────┘
                            │               │
                 postMessage│               │IndexedDB
                            ▼               ▼
             ┌───────────────────────┐  ┌───────────────────────┐
             │     ifc.worker.ts     │  │     CacheManager      │
             │   (web-ifc WASM in    │  │  (IFCViewerCache DB)  │
             │      Web Worker)      │  │                       │
             └───────────────────────┘  └───────────────────────┘
```

## 快速安装

克隆仓库并安装依赖：

```bash
git clone https://github.com/zly258/ifc-viewer-pro.git
cd ifc-viewer-pro
npm install
```

运行环境要求：

- Node.js 20+（与 [`.github/workflows/publish.yml`](./.github/workflows/publish.yml) 中的构建环境一致）
- 支持 WebGL 与 WebAssembly 的现代浏览器

## 快速开始

启动本地 Vite 开发服务器：

```bash
npm run dev
```

在浏览器中打开 `http://localhost:3000`（端口配置见 [`vite.config.ts`](./vite.config.ts)）：

1. 点击界面中的加载按钮，或直接将本地 `.ifc` 文件拖入视口。
2. 如需直接体验，可从仓库自带的 [`public/samples/`](./public/samples) 目录加载示例模型：
   - `public/samples/LED_Screen.ifc`
   - `public/samples/Structure_Model.ifc`
   - `public/samples/Wellness_Center.ifc`
3. 模型加载完成后将自动展开空间结构树。点击构件可查看属性，通过底部工具栏使用测量、剖切、BCF 视点批注与报表功能，按 `?` 可查看快捷键说明。

## 常用命令

| 命令 | 说明 |
|---|---|
| `npm run dev` | 启动 Vite 本地开发服务器，监听 `0.0.0.0:3000`。 |
| `npm run build` | 执行生产构建，输出至 `dist/` 并自动拆分依赖 chunk。 |
| `npm run preview` | 本地预览生产构建产物。 |
| `npm run deploy` | 自动执行 `predeploy`（`npm run build`）并将 `dist/` 发布到 `gh-pages` 分支。 |

## 配置与部署

### 基础路径与渲染参数

- **生产基础路径**：[`vite.config.ts`](./vite.config.ts) 中生产模式默认使用 `/ifc-viewer-pro/` 作为 `base`，开发模式使用 `/`。可通过 `VITE_BASE` 环境变量覆盖生产路径（例如 `VITE_BASE=/ npm run build`）。
- **管线调优常量**：几何增量刷新批次（`FLUSH_EVERY`）、材质缓存上限（`MATERIAL_CACHE_MAX`）、正交相机视锥尺寸（`FRUSTUM_SIZE`）、属性查询超时（`PROPERTY_QUERY_TIMEOUT`）、对数深度缓冲开关（`ENABLE_LOGARITHMIC_DEPTH_BUFFER`）以及本地 WASM/Draco 资源路径（`WASM_PATH`、`DRACO_PATH`）均集中定义在 [`services/config.ts`](./services/config.ts)。
- **浏览器本地存储**：界面设置（`bimvision_settings`、`bimvision_theme`）及按模型关联的 BCF 视点（`bimvision_bcf_viewpoints_v2`）保存在 `localStorage`，解析后的几何批次缓存在 IndexedDB（`IFCViewerCache`）。

### GitHub Pages 自动发布

仓库包含 [`.github/workflows/publish.yml`](./.github/workflows/publish.yml) 工作流，在推送至 `main` 分支或手动触发 `workflow_dispatch` 时运行。工作流使用 Node.js 20 安装依赖并执行 `npm run build`，随后将 `./dist` 发布至 `gh-pages` 分支。若默认分支名称不同，请同步调整工作流中的分支过滤配置。
