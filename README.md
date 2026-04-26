<div align="center">

# 极简待办

一款为 Windows 打造的轻量桌面待办应用。  
专注今日事项、便签浮窗、月视图回顾和本地数据保存。

[![Electron](https://img.shields.io/badge/Electron-35-47848F?logo=electron&logoColor=white)](https://www.electronjs.org/)
[![React](https://img.shields.io/badge/React-18-61DAFB?logo=react&logoColor=111)](https://react.dev/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5-3178C6?logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
[![SQLite](https://img.shields.io/badge/SQLite-local-003B57?logo=sqlite&logoColor=white)](https://www.sqlite.org/)
[![Windows](https://img.shields.io/badge/Windows-10%2F11-0078D4?logo=windows&logoColor=white)](https://www.microsoft.com/windows)

</div>

## 项目简介

极简待办不是复杂的项目管理工具，而是一个更贴近日常使用的小型桌面工具。它把高频操作放在最前面：今天要做什么、哪些已经完成、浮窗里能不能快速改掉一条任务。

应用采用 Electron + React + TypeScript 构建，数据保存在本机 SQLite 数据库中。主窗口和浮窗都做了无边框圆角处理，并针对 Windows 透明窗口的圆角阴影问题做了原生窗口形状裁剪。

## 功能亮点

| 模块 | 说明 |
| --- | --- |
| 今日待办 | 添加、编辑、删除、完成/取消完成待办事项 |
| 月视图 | 查看整月任务分布、本月统计和标签分布 |
| 已完成 | 集中回顾最近完成的任务 |
| 便签浮窗 | 只显示今日待办，支持快速增删改查 |
| 贴边收起 | 浮窗贴近屏幕上边缘后自动收起，仅保留箭头小条 |
| 浮窗透明度 | 支持在设置中调整浮窗透明度 |
| 每日一言 | 顶部区域展示每日一句 |
| 任务顺延 | 历史未完成任务自动移动到今天，并标记为“延迟” |
| 本地存储 | 使用 SQLite 保存任务和窗口状态 |
| 安装覆盖 | NSIS 固定 guid，重复安装会识别并覆盖旧版本 |

## 技术栈

| 类型 | 技术 |
| --- | --- |
| 桌面框架 | Electron |
| 前端框架 | React |
| 开发语言 | TypeScript |
| 构建工具 | Vite |
| 本地数据库 | SQLite / better-sqlite3 |
| 图标组件 | lucide-react |
| 打包工具 | electron-builder |

## 快速开始

### 环境要求

- Windows 10/11
- Node.js 18 或更高版本
- npm

### 安装依赖

```bash
npm install
```

### 开发运行

```bash
npm run dev
```

该命令会同时启动 Vite 渲染进程和 Electron 主进程。

### 生产编译

```bash
npm run build
```

编译成功后会生成：

| 目录 | 说明 |
| --- | --- |
| `dist/` | 前端渲染产物 |
| `dist-electron/` | Electron 主进程和预加载脚本产物 |

## 打包 Windows 安装包

```bash
npm run dist
```

打包成功后产物位于：

| 产物 | 说明 |
| --- | --- |
| `release/极简待办 Setup 0.1.0.exe` | Windows 安装包 |
| `release/win-unpacked/极简待办.exe` | 解包版可执行程序 |

如果打包时 GitHub 下载 Electron 或 NSIS 资源失败，可以使用本地 Electron 运行时打包：

```bash
npx electron-builder --win --config.electronDist=node_modules/electron/dist
```

## 安装行为

当前安装包使用固定的 NSIS `guid`：

```text
e9182856-48c1-55b8-9a40-d13f65c66f2a
```

这意味着再次运行安装包时，Windows 会将它识别为同一个应用并覆盖安装旧版本，不需要用户手动卸载。卸载时默认保留本地待办数据。

## 数据存储

应用数据保存在 Electron 的 `userData` 目录中，数据库文件名为：

```text
minimal-todo.db
```

保存内容包括：

- 待办事项
- 完成状态
- 标签
- 浮窗位置和透明度
- 浮窗折叠状态

## 项目结构

```text
.
├─ build/              应用图标等打包资源
├─ src/
│  ├─ main/            Electron 主进程、数据库、预加载脚本
│  ├─ renderer/        React 页面、交互和样式
│  └─ shared/          主进程与渲染进程共享类型
├─ index.html          Vite 入口页面
├─ package.json        项目脚本和 electron-builder 配置
├─ minimal_todo_prd.md 产品需求文档
└─ README.md           项目说明文档
```

## 常见问题

### better_sqlite3.node 被占用

如果打包时报：

```text
EPERM: operation not permitted, unlink better_sqlite3.node
```

通常是旧的 Electron 进程仍在运行。关闭应用或结束相关 Electron/Node 进程后重新打包即可。

### 打包时下载 EOF

这是网络下载 Electron Builder 依赖资源时的临时断流问题。通常重试命令即可，也可以使用本地 Electron 运行时打包：

```bash
npx electron-builder --win --config.electronDist=node_modules/electron/dist
```

### 浮窗如何关闭

浮窗没有独立关闭/最小化按钮，只能通过主程序顶部的“打开浮窗 / 关闭浮窗”按钮控制。

### 浮窗贴边后如何展开

浮窗贴近屏幕上边缘会自动收起，只保留一个小条和向下箭头。点击箭头即可展开；拖动小条空白区域可以移动浮窗。

## 开发脚本

| 命令 | 说明 |
| --- | --- |
| `npm run dev` | 启动开发环境 |
| `npm run build` | 编译前端和 Electron 主进程 |
| `npm run start` | 启动已编译/当前 Electron 应用 |
| `npm run dist` | 打包 Windows 安装包 |
| `npm run rebuild:native` | 重建原生依赖 |

## 联系方式

如果在使用中遇到问题，可以联系：

```text
abc.xiaoxuan123@gmail.com
```
