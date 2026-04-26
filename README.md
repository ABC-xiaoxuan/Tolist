# 极简待办

极简待办是一款面向 Windows 的轻量桌面待办应用，使用 Electron、React、TypeScript 和 SQLite 构建。应用重点放在每日任务记录、月视图回顾、便签浮窗和本地数据存储上，尽量减少无关功能和资源占用。

## 功能特性

- 今日待办：添加、编辑、删除、勾选完成待办事项。
- 月视图：查看整月任务分布、本月统计和标签分布。
- 已完成：集中查看已完成任务记录。
- 便签浮窗：只显示今日待办，支持快速增删改查。
- 浮窗设置：支持置顶、透明度调节、贴近屏幕上边缘自动收起。
- 每日一言：顶部日期区域展示每日一句。
- 任务顺延：未完成的历史待办会自动移动到今天，并标记为“延迟”。
- 本地存储：任务数据保存到本机 SQLite 数据库。
- 圆角窗口：主程序和浮窗均为无边框圆角窗口。

## 技术栈

- Electron
- React
- TypeScript
- Vite
- SQLite / better-sqlite3
- electron-builder

## 环境要求

- Node.js 18 或更高版本
- Windows 10/11
- npm

如果遇到 `better-sqlite3` 的 Node/Electron 版本不匹配问题，可以执行：

```bash
npm run rebuild:native
```

## 安装依赖

```bash
npm install
```

## 开发运行

```bash
npm run dev
```

该命令会同时启动 Vite 渲染进程和 Electron 主进程。

## 编译

```bash
npm run build
```

编译成功后会生成：

- `dist/`：前端渲染产物
- `dist-electron/`：Electron 主进程和预加载脚本产物

## 打包 Windows EXE

```bash
npm run dist
```

打包成功后产物位于：

- `release/极简待办 Setup 0.1.0.exe`：Windows 安装包
- `release/win-unpacked/极简待办.exe`：解包版可执行程序

如果打包时 GitHub 下载 Electron 或 NSIS 资源失败，可以重试命令。当前项目也可以使用本地 Electron 运行时打包：

```bash
npx electron-builder --win --config.electronDist=node_modules/electron/dist
```

## 常见问题

### better_sqlite3.node 被占用

如果打包时报 `EPERM: operation not permitted, unlink better_sqlite3.node`，通常是旧的 Electron 进程仍在运行。关闭应用或结束相关 Electron/Node 进程后重新打包即可。

### 打包时下载 EOF

这是网络下载 Electron Builder 依赖资源时的临时断流问题。通常重试 `npm run dist` 或使用本地 Electron 运行时打包即可。

### 重复安装会怎样

安装包使用固定的 NSIS `guid` 识别同一个应用。再次运行安装包时会覆盖安装到原应用位置，不需要用户手动卸载旧版本。卸载应用时默认保留本地待办数据。

### 浮窗如何关闭

浮窗没有独立关闭/最小化按钮，只能通过主程序顶部的“打开浮窗/关闭浮窗”按钮控制。

## 数据位置

应用数据保存在 Electron 的 `userData` 目录中，数据库文件名为：

```text
minimal-todo.db
```

## 项目结构

```text
src/
├─ main/          Electron 主进程、数据库、预加载脚本
├─ renderer/      React 页面和样式
└─ shared/        主进程与渲染进程共享类型

build/            应用图标等打包资源
dist/             Vite 编译产物
dist-electron/    Electron TypeScript 编译产物
release/          Windows 打包输出
```

## 联系方式

有问题可以联系：

```text
abc.xiaoxuan123@gmail.com
```
