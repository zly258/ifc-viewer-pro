<h1 align="center">IFC Viewer Pro</h1>

<p align="center">A browser-based 3D IFC model viewer built with React, Three.js, and WebAssembly for inspecting BIM geometry, properties, measurements, sections, and viewpoints.</p>

<p align="center">
  <a href="./README.md">English</a> | <a href="./README.zh-CN.md">简体中文</a>
</p>

<p align="center">
  <img src="https://img.shields.io/badge/React-18.2-3776AB?style=flat-square" alt="React 18.2"> <img src="https://img.shields.io/badge/TypeScript-5.8-3776AB?style=flat-square" alt="TypeScript 5.8"> <img src="https://img.shields.io/badge/Three.js-0.182-3776AB?style=flat-square" alt="Three.js 0.182"> <img src="https://img.shields.io/badge/Platform-Web%20Browser-4B5563?style=flat-square" alt="Platform Web Browser"> <a href="https://github.com/zly258/ifc-viewer-pro/actions/workflows/publish.yml"><img src="https://img.shields.io/github/actions/workflow/status/zly258/ifc-viewer-pro/publish.yml?branch=main&amp;style=flat-square&amp;label=Deploy" alt="Deploy workflow status"></a>
</p>

IFC Viewer Pro runs entirely in the browser using `web-ifc` inside a dedicated Web Worker and Three.js with BVH-accelerated raycasting (`three-mesh-bvh`). Open local `.ifc` files via drag-and-drop or file picker to explore spatial hierarchies, inspect element property sets, take measurements, slice models with section planes, and save model-associated BCF viewpoints.

## Highlights

| Highlight | Why it matters |
|---|---|
| Off-thread IFC parsing and batched rendering | `web-ifc` runs in a Web Worker (`services/ifc.worker.ts`) and streams geometry in batches (`IfcBatcher`) with IndexedDB caching (`CacheManager`) to keep the UI responsive. |
| BVH-accelerated 3D interaction | `three-mesh-bvh` accelerates raycasting for element selection, hover highlighting, and picking across large meshes. |
| Modular BIM inspection workspace | Code-split draggable panels provide spatial tree browsing (`ModelTree`), property inspection (`PropertyPanel`), custom quantity reports (`ReportPanel`), and BCF viewpoints (`BcfPanel`). |
| Measurement and sectioning tools | Supports distance, angle, coordinate, area, and volume measurements (`MeasurementManager`) alongside interactive clipping planes (`SectionManager`). |
| Bilingual UI and theme switching | Ships with English and Simplified Chinese locales (`locales/en.ts`, `locales/zh.ts`), light/dark themes, keyboard shortcuts (`?`), and PNG screenshot export. |

## Architecture

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

## Quick Install

Clone the repository and install dependencies:

```bash
git clone https://github.com/zly258/ifc-viewer-pro.git
cd ifc-viewer-pro
npm install
```

Prerequisites:

- Node.js 20+ (verified against the CI workflow in [`.github/workflows/publish.yml`](./.github/workflows/publish.yml))
- A modern browser with WebGL and WebAssembly support

## Quick Start

Start the local Vite development server:

```bash
npm run dev
```

Open `http://localhost:3000` in your browser (configured in [`vite.config.ts`](./vite.config.ts)):

1. Click the load button or drag and drop any local `.ifc` file into the viewport.
2. To test immediately without supplying your own model, load one of the bundled sample files from [`public/samples/`](./public/samples):
   - `public/samples/LED_Screen.ifc`
   - `public/samples/Structure_Model.ifc`
   - `public/samples/Wellness_Center.ifc`
3. Once loaded, the spatial tree opens automatically. Click elements to inspect properties, use the bottom toolbar for measurement, sectioning, BCF viewpoints, and reports, or press `?` to open the keyboard shortcuts reference.

## Commands

| Command | Description |
|---|---|
| `npm run dev` | Start the Vite development server on port `3000` (`0.0.0.0`). |
| `npm run build` | Build the production bundle into `dist/` with vendor chunk splitting. |
| `npm run preview` | Serve the production build locally for verification. |
| `npm run deploy` | Run `npm run build` (`predeploy`) and publish `dist/` to the `gh-pages` branch via `gh-pages`. |

## Configuration and Deployment

### Base path and runtime tuning

- **Production base path**: In [`vite.config.ts`](./vite.config.ts), `base` defaults to `/ifc-viewer-pro/` for production builds and `/` in development. Set `VITE_BASE` to override the production base path (for example, `VITE_BASE=/ npm run build`).
- **Pipeline constants**: Geometry flush batch size (`FLUSH_EVERY`), material cache cap (`MATERIAL_CACHE_MAX`), orthographic frustum size (`FRUSTUM_SIZE`), property query timeout (`PROPERTY_QUERY_TIMEOUT`), logarithmic depth buffer toggle (`ENABLE_LOGARITHMIC_DEPTH_BUFFER`), and local WASM/Draco asset paths (`WASM_PATH`, `DRACO_PATH`) are centralized in [`services/config.ts`](./services/config.ts).
- **Local browser storage**: User view settings (`bimvision_settings`, `bimvision_theme`) and model-associated BCF viewpoints (`bimvision_bcf_viewpoints_v2`) persist in `localStorage`, while parsed geometry batches are cached in IndexedDB (`IFCViewerCache`).

### GitHub Pages publishing

The workflow in [`.github/workflows/publish.yml`](./.github/workflows/publish.yml) runs on pushes to `main` and manual `workflow_dispatch` triggers. It installs dependencies on Node.js 20, executes `npm run build`, and deploys `./dist` to the `gh-pages` branch. If your default branch differs from `main`, update the branch filter in that workflow file.
