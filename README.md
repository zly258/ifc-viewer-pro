# IFC Viewer Pro

[English](#english) | [中文](#中文)

---

## English

### Overview

IFC Viewer Pro is a lightweight React + Vite web application for viewing IFC models in the browser. It uses `three`, `web-ifc`, and optimized rendering techniques to provide an interactive 3D model viewer.

### Features

- Load and inspect IFC models
- 3D model navigation and visualization
- Property and measurement panels
- Sectioning and lighting controls
- Vite-based build and local development

### Run locally

```bash
npm install
npm run dev
```

Then open the local server URL shown by Vite.

### Build

```bash
npm run build
```

### Preview build

```bash
npm run preview
```

### GitHub Pages Publishing

This repository includes a GitHub Actions workflow to build and publish the `dist` directory to the `gh-pages` branch automatically.

The workflow file is located at `.github/workflows/publish.yml`.

### Notes

- The project is configured as a Vite app and uses `react@19`.
- If you want to deploy to GitHub Pages, make sure the repository default branch is `main` or adjust the workflow branch filter.

---

## 中文

### 概要

IFC Viewer Pro 是一个基于 React + Vite 的轻量级浏览器 IFC 模型查看器。它使用 `three`、`web-ifc` 以及优化渲染技术，提供交互式 3D 模型展示能力。

### 功能

- 加载与查看 IFC 模型
- 3D 模型导航与可视化
- 属性面板与测量面板
- 截面分析与灯光控制
- 基于 Vite 的构建与本地开发

### 本地运行

```bash
npm install
npm run dev
```

然后打开 Vite 显示的本地服务地址。

### 构建

```bash
npm run build
```

### 预览构建

```bash
npm run preview
```

### GitHub Pages 发布

该仓库包含 GitHub Actions 工作流，可自动构建并将 `dist` 目录发布到 `gh-pages` 分支。

工作流文件路径：`.github/workflows/publish.yml`

### 说明

- 本项目为 Vite 应用，使用 `react@19`。
- 若要部署到 GitHub Pages，请确保仓库默认分支为 `main`，或根据实际分支修改工作流配置。
