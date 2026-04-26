import path from "node:path";
import {
  app,
  BrowserWindow,
  Menu,
  Tray,
  ipcMain,
  nativeImage,
  screen,
  shell,
  type NativeImage,
  type Rectangle
} from "electron";
import log from "electron-log";
import { TodoDatabase } from "./db";
import type {
  TaskLabel,
  ViewName,
  WindowState
} from "../shared/types";

type RendererPayload = {
  type: "snapshot";
  payload: {
    today: string;
    selectedDate: string;
    currentView: ViewName;
    widgetVisible: boolean;
    mainMaximized: boolean;
    dailySaying: string;
    tasks: ReturnType<TodoDatabase["getTasksByDate"]>;
    todayTasks: ReturnType<TodoDatabase["getTasksByDate"]>;
    completedTasks: ReturnType<TodoDatabase["getCompletedTasks"]>;
    monthTasks: ReturnType<TodoDatabase["getMonthTasks"]>;
    summary: ReturnType<TodoDatabase["getSummary"]>;
    settings: WindowState;
  };
};

const db = new TodoDatabase();
const MAIN_WINDOW_RADIUS = 22;
const WIDGET_WINDOW_RADIUS = 24;
const WIDGET_COLLAPSED_RADIUS = 13;
const WIDGET_COLLAPSED_HEIGHT = 28;
const WIDGET_EDGE_THRESHOLD = 10;
const WIDGET_EXPAND_OFFSET = 14;
const SHAPE_RESIZE_DEBOUNCE_MS = 48;

type ShapeCache = {
  width: number;
  height: number;
  radius: number;
  maximized: boolean;
};

let mainWindow: BrowserWindow | null = null;
let widgetWindow: BrowserWindow | null = null;
let tray: Tray | null = null;
let appIcon: NativeImage | null = null;
let isQuitting = false;
let selectedDate = toDateKey(new Date());
let currentView: ViewName = "today";
let dailySaying = "把今天过成一个清晰的小作品。";
let isApplyingWidgetBounds = false;
let widgetMoveTimer: NodeJS.Timeout | null = null;
let mainWindowReadyToShow = false;
let mainRendererReady = false;
let mainRevealTimer: NodeJS.Timeout | null = null;
let mainShapeTimer: NodeJS.Timeout | null = null;
let widgetShapeTimer: NodeJS.Timeout | null = null;
let mainShapeCache: ShapeCache | null = null;
let widgetShapeCache: ShapeCache | null = null;
let lastTrayWidgetVisible: boolean | null = null;
let dailySayingAbortController: AbortController | null = null;
let dailySayingTimeout: NodeJS.Timeout | null = null;
let lastRolloverDate: string | null = null;

function toDateKey(date: Date) {
  return date.toISOString().slice(0, 10);
}

function resolveRendererUrl(view: "main" | "widget") {
  if (process.env.VITE_DEV_SERVER_URL) {
    return `${process.env.VITE_DEV_SERVER_URL}?view=${view}`;
  }
  return `file://${path.join(__dirname, "../../dist/index.html")}?view=${view}`;
}

function getIconDataUrl() {
  const svg = `
    <svg xmlns="http://www.w3.org/2000/svg" width="128" height="128" viewBox="0 0 128 128">
      <rect width="128" height="128" rx="28" fill="#4C8DFF"/>
      <path d="M36 64l16 16 40-40" fill="none" stroke="#fff" stroke-width="12" stroke-linecap="round" stroke-linejoin="round"/>
    </svg>
  `;
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
}

function getAppIcon() {
  if (appIcon) {
    return appIcon;
  }
  const iconPath = path.join(__dirname, "../../build/icon.ico");
  const icon = nativeImage.createFromPath(iconPath);
  appIcon = icon.isEmpty() ? nativeImage.createFromDataURL(getIconDataUrl()) : icon;
  return appIcon;
}

function clampWidgetOpacity(value: number) {
  if (Number.isNaN(value)) {
    return 0.96;
  }
  return Math.min(1, Math.max(0.35, value));
}

function extractSayingText(response: unknown) {
  const text = typeof response === "object" && response && "text" in response
    ? (response as { text?: unknown }).text
    : "";
  return typeof text === "string" && text.trim()
    ? text.trim()
    : "把今天过成一个清晰的小作品。";
}

async function refreshDailySaying() {
  dailySayingAbortController?.abort();
  dailySayingTimeout = clearTimer(dailySayingTimeout);
  const controller = new AbortController();
  dailySayingAbortController = controller;
  try {
    dailySayingTimeout = setTimeout(() => controller.abort(), 8000);
    const response = await fetch("https://uapis.cn/api/v1/saying", {
      signal: controller.signal,
      cache: "no-store"
    });
    dailySaying = extractSayingText(await response.json());
  } catch (error) {
    if (!isQuitting && !(error instanceof Error && error.name === "AbortError")) {
      log.warn("Failed to fetch daily saying", error);
    }
  } finally {
    if (dailySayingAbortController === controller) {
      dailySayingAbortController = null;
    }
    dailySayingTimeout = clearTimer(dailySayingTimeout);
  }
  if (!isQuitting) {
    broadcastState();
  }
}

function buildRoundedWindowShape(width: number, height: number, radius: number): Rectangle[] {
  const safeWidth = Math.max(1, Math.floor(width));
  const safeHeight = Math.max(1, Math.floor(height));
  const safeRadius = Math.max(0, Math.min(Math.floor(radius), Math.floor(safeWidth / 2), Math.floor(safeHeight / 2)));

  if (!safeRadius) {
    return [{ x: 0, y: 0, width: safeWidth, height: safeHeight }];
  }

  const rects: Rectangle[] = [];
  for (let y = 0; y < safeHeight; y += 1) {
    const topDistance = safeRadius - y - 0.5;
    const bottomDistance = y - (safeHeight - safeRadius) + 0.5;
    const distance = Math.max(topDistance, bottomDistance, 0);
    const inset = distance > 0
      ? Math.ceil(safeRadius - Math.sqrt(Math.max(0, safeRadius * safeRadius - distance * distance)))
      : 0;

    rects.push({
      x: inset,
      y,
      width: Math.max(1, safeWidth - inset * 2),
      height: 1
    });
  }

  return rects;
}

function clearTimer(timer: NodeJS.Timeout | null) {
  if (timer) {
    clearTimeout(timer);
  }
  return null;
}

function applyRoundedWindowShape(window: BrowserWindow, radius: number, cache: ShapeCache | null) {
  if (window.isDestroyed()) {
    return cache;
  }
  const bounds = window.getBounds();
  const maximized = window.isMaximized() || window.isFullScreen();
  const nextCache = {
    width: bounds.width,
    height: bounds.height,
    radius,
    maximized
  };
  if (
    cache &&
    cache.width === nextCache.width &&
    cache.height === nextCache.height &&
    cache.radius === nextCache.radius &&
    cache.maximized === nextCache.maximized
  ) {
    return cache;
  }

  if (window.isMaximized() || window.isFullScreen()) {
    window.setShape([]);
    return nextCache;
  }
  window.setShape(buildRoundedWindowShape(bounds.width, bounds.height, radius));
  return nextCache;
}

function applyMainWindowShape() {
  if (mainWindow) {
    mainShapeCache = applyRoundedWindowShape(mainWindow, MAIN_WINDOW_RADIUS, mainShapeCache);
  }
}

function scheduleMainWindowShape() {
  if (mainShapeTimer) {
    return;
  }
  mainShapeTimer = setTimeout(() => {
    mainShapeTimer = null;
    applyMainWindowShape();
  }, SHAPE_RESIZE_DEBOUNCE_MS);
}

function applyWidgetWindowShape() {
  if (!widgetWindow) {
    return;
  }
  const radius = db.getWindowState().widgetCollapsed ? WIDGET_COLLAPSED_RADIUS : WIDGET_WINDOW_RADIUS;
  widgetShapeCache = applyRoundedWindowShape(widgetWindow, radius, widgetShapeCache);
}

function scheduleWidgetWindowShape() {
  if (widgetShapeTimer) {
    return;
  }
  widgetShapeTimer = setTimeout(() => {
    widgetShapeTimer = null;
    applyWidgetWindowShape();
  }, SHAPE_RESIZE_DEBOUNCE_MS);
}

function invalidateRolloverCache() {
  lastRolloverDate = null;
}

function ensureRolloverForToday(today: string) {
  if (lastRolloverDate === today) {
    return;
  }
  db.rolloverIncompleteTasks(today);
  lastRolloverDate = today;
}

function revealMainWindowWhenReady() {
  if (!mainWindow || !mainWindowReadyToShow || !mainRendererReady || mainWindow.isVisible()) {
    return;
  }

  // Transparent frameless windows can briefly show a rectangular compositor frame on first launch.
  // Waiting one paint tick after React renders the rounded shell avoids that first-frame artifact.
  showMainWindowSafely();
}

function showMainWindowSafely() {
  if (!mainWindow || mainWindow.isDestroyed()) {
    createMainWindow();
    return;
  }

  if (!mainWindowReadyToShow || !mainRendererReady) {
    revealMainWindowWhenReady();
    return;
  }

  if (mainRevealTimer) {
    clearTimeout(mainRevealTimer);
    mainRevealTimer = null;
  }

  if (mainWindow.isVisible()) {
    mainWindow.setOpacity(1);
    mainWindow.focus();
    return;
  }

  mainWindow.setOpacity(0);
  mainWindow.showInactive();
  mainRevealTimer = setTimeout(() => {
    mainRevealTimer = null;
    if (!mainWindow || mainWindow.isDestroyed()) {
      return;
    }
    mainWindow.setOpacity(1);
    mainWindow.focus();
  }, 64);
}

function createMainWindow() {
  mainWindowReadyToShow = false;
  mainRendererReady = false;
  mainWindow = new BrowserWindow({
    width: 600,
    height: 560,
    minWidth: 520,
    minHeight: 480,
    title: "极简待办",
    icon: getAppIcon(),
    backgroundColor: "#00000000",
    frame: false,
    show: false,
    transparent: true,
    hasShadow: false,
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false
    }
  });
  mainWindow.setOpacity(0);
  applyMainWindowShape();

  mainWindow.loadURL(resolveRendererUrl("main")).catch((error) => log.error(error));
  mainWindow.once("ready-to-show", () => {
    mainWindowReadyToShow = true;
    applyMainWindowShape();
    revealMainWindowWhenReady();
  });
  mainWindow.on("resize", scheduleMainWindowShape);
  mainWindow.on("resized", applyMainWindowShape);
  mainWindow.on("maximize", () => {
    applyMainWindowShape();
    broadcastState();
  });
  mainWindow.on("unmaximize", () => {
    applyMainWindowShape();
    broadcastState();
  });
  mainWindow.on("closed", () => {
    mainWindow = null;
    mainWindowReadyToShow = false;
    mainRendererReady = false;
    mainRevealTimer = clearTimer(mainRevealTimer);
    mainShapeTimer = clearTimer(mainShapeTimer);
    mainShapeCache = null;
  });
}

function createWidgetWindow() {
  const windowState = db.getWindowState();
  const widgetBounds = {
    width: Math.min(windowState.widgetBounds?.width ?? 280, 300),
    height: Math.min(windowState.widgetBounds?.height ?? 420, 470),
    x: windowState.widgetBounds?.x,
    y: windowState.widgetBounds?.y
  };
  const initialCollapsed = windowState.widgetCollapsed;
  widgetWindow = new BrowserWindow({
    width: widgetBounds.width,
    height: initialCollapsed ? WIDGET_COLLAPSED_HEIGHT : widgetBounds.height,
    x: widgetBounds.x,
    y: widgetBounds.y,
    minWidth: 260,
    minHeight: WIDGET_COLLAPSED_HEIGHT,
    show: false,
    frame: false,
    resizable: false,
    transparent: true,
    hasShadow: false,
    title: "极简待办 - 浮窗",
    icon: getAppIcon(),
    alwaysOnTop: windowState.widgetPinned,
    skipTaskbar: true,
    backgroundColor: "#00000000",
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false
    }
  });
  widgetWindow.setOpacity(clampWidgetOpacity(windowState.widgetOpacity));
  applyWidgetWindowShape();

  widgetWindow.loadURL(resolveRendererUrl("widget")).catch((error) => log.error(error));
  widgetWindow.on("close", (event) => {
    if (!isQuitting) {
      event.preventDefault();
      widgetWindow?.hide();
    }
  });
  widgetWindow.on("move", handleWidgetMove);
  widgetWindow.on("resize", () => {
    scheduleWidgetWindowShape();
    persistWidgetState();
  });
  widgetWindow.on("resized", applyWidgetWindowShape);
  widgetWindow.on("closed", () => {
    widgetWindow = null;
    widgetMoveTimer = clearTimer(widgetMoveTimer);
    widgetShapeTimer = clearTimer(widgetShapeTimer);
    widgetShapeCache = null;
    updateTrayMenuIfNeeded(true);
  });
  return widgetWindow;
}

function handleWidgetMove() {
  persistWidgetState();
  if (widgetMoveTimer) {
    clearTimeout(widgetMoveTimer);
  }
  widgetMoveTimer = setTimeout(() => {
    widgetMoveTimer = null;
    maybeAutoCollapseWidget();
  }, 120);
}

function persistWidgetState() {
  if (!widgetWindow || isApplyingWidgetBounds) {
    return;
  }
  const bounds = widgetWindow.getBounds();
  const current = db.getWindowState();
  const previousBounds = current.widgetBounds ?? bounds;
  const widgetBounds = current.widgetCollapsed
    ? {
        width: bounds.width,
        height: Math.max(previousBounds.height, 320),
        x: bounds.x,
        y: bounds.y
      }
    : {
        width: bounds.width,
        height: bounds.height,
        x: bounds.x,
        y: bounds.y
      };
  db.saveWindowState({
    ...current,
    widgetPinned: widgetWindow.isAlwaysOnTop(),
    widgetOpacity: clampWidgetOpacity(current.widgetOpacity),
    widgetBounds
  });
}

function maybeAutoCollapseWidget() {
  if (!widgetWindow || isApplyingWidgetBounds) {
    return;
  }
  const current = db.getWindowState();
  if (current.widgetCollapsed) {
    persistWidgetState();
    return;
  }
  const bounds = widgetWindow.getBounds();
  const display = screen.getDisplayMatching(bounds);
  const nearTop = bounds.y <= display.workArea.y + WIDGET_EDGE_THRESHOLD;
  if (nearTop) {
    setWidgetCollapsed(true);
    return;
  }
  persistWidgetState();
}

function setWidgetCollapsed(collapsed: boolean) {
  if (!widgetWindow) {
    return false;
  }
  widgetMoveTimer = clearTimer(widgetMoveTimer);
  const current = db.getWindowState();
  const bounds = widgetWindow.getBounds();
  const display = screen.getDisplayMatching(bounds);
  const expandedY = collapsed
    ? bounds.y
    : Math.max(bounds.y, display.workArea.y + WIDGET_EDGE_THRESHOLD + WIDGET_EXPAND_OFFSET);
  const expandedBounds = current.widgetCollapsed
    ? current.widgetBounds ?? bounds
    : {
        width: bounds.width,
        height: Math.max(bounds.height, 320),
        x: bounds.x,
        y: bounds.y
      };
  const nextBounds = collapsed
    ? { x: bounds.x, y: bounds.y, width: bounds.width, height: WIDGET_COLLAPSED_HEIGHT }
    : {
        x: current.widgetBounds?.x ?? bounds.x,
        y: expandedY,
        width: current.widgetBounds?.width ?? bounds.width,
        height: Math.max(current.widgetBounds?.height ?? expandedBounds.height, 320)
      };

  isApplyingWidgetBounds = true;
  widgetWindow.setMinimumSize(220, WIDGET_COLLAPSED_HEIGHT);
  widgetWindow.setBounds(nextBounds, true);
  isApplyingWidgetBounds = false;
  db.saveWindowState({
    ...current,
    widgetCollapsed: collapsed,
    widgetPinned: widgetWindow.isAlwaysOnTop(),
    widgetOpacity: clampWidgetOpacity(current.widgetOpacity),
    widgetBounds: collapsed ? expandedBounds : nextBounds
  });
  applyWidgetWindowShape();
  broadcastState();
  return true;
}

function createTray() {
  const icon = getAppIcon();
  tray = new Tray(icon);
  tray.setToolTip("极简待办");
  tray.on("double-click", () => {
    showMainWindowSafely();
  });
  updateTrayMenuIfNeeded(true);
}

function updateTrayMenuIfNeeded(force = false) {
  if (!tray) {
    return;
  }
  const widgetVisible = widgetWindow?.isVisible() ?? false;
  if (!force && lastTrayWidgetVisible === widgetVisible) {
    return;
  }
  lastTrayWidgetVisible = widgetVisible;
  const contextMenu = Menu.buildFromTemplate([
    {
      label: "打开主界面",
      click: () => {
        showMainWindowSafely();
      }
    },
    {
      label: widgetVisible ? "关闭浮窗" : "显示浮窗",
      click: () => {
        if (widgetVisible) {
          hideWidgetWindow();
        } else {
          showWidgetWindow();
        }
      }
    },
    {
      label: "退出",
      click: () => {
        isQuitting = true;
        app.quit();
      }
    }
  ]);
  tray.setContextMenu(contextMenu);
}

function broadcastState() {
  const today = toDateKey(new Date());
  ensureRolloverForToday(today);
  if (currentView === "today" && selectedDate < today) {
    selectedDate = today;
  }
  const mainIsAlive = Boolean(mainWindow && !mainWindow.isDestroyed());
  const widgetIsAlive = Boolean(widgetWindow && !widgetWindow.isDestroyed());
  if (!mainIsAlive && !widgetIsAlive) {
    updateTrayMenuIfNeeded();
    return;
  }

  const settings = db.getWindowState();
  const tasks = mainIsAlive ? db.getTasksByDate(selectedDate) : [];
  const todayTasks = selectedDate === today && mainIsAlive ? tasks : db.getTasksByDate(today);
  const basePayload = {
    today,
    selectedDate,
    currentView,
    widgetVisible: widgetWindow?.isVisible() ?? false,
    mainMaximized: mainWindow?.isMaximized() ?? false,
    dailySaying,
    settings
  };

  if (mainIsAlive && mainWindow) {
    const payload: RendererPayload = {
      type: "snapshot",
      payload: {
        ...basePayload,
        tasks,
        todayTasks,
        completedTasks: db.getCompletedTasks(),
        monthTasks: db.getMonthTasks(selectedDate.slice(0, 7)),
        summary: db.getSummary(selectedDate.slice(0, 7))
      }
    };
    mainWindow.webContents.send("app:snapshot", payload);
  }

  if (widgetIsAlive && widgetWindow) {
    const widgetPayload: RendererPayload = {
    type: "snapshot",
    payload: {
      ...basePayload,
      tasks: [],
      completedTasks: [],
      monthTasks: [],
      todayTasks,
      summary: {
        total: 0,
        completed: 0,
        completionRate: 0,
        labelDistribution: {
          工作: 0,
          设计: 0,
          学习: 0,
          健康: 0,
          生活: 0,
          延迟: 0
        }
      }
    }
    };
    widgetWindow.webContents.send("app:snapshot", widgetPayload);
  }
  updateTrayMenuIfNeeded();
}

function toggleWidgetVisibility() {
  if (!widgetWindow) {
    const createdWidget = createWidgetWindow();
    createdWidget.show();
    createdWidget.focus();
    broadcastState();
    return;
  }
  if (widgetWindow.isVisible()) {
    widgetWindow.hide();
  } else {
    widgetWindow.show();
    widgetWindow.focus();
  }
  broadcastState();
}

function showWidgetWindow() {
  if (!widgetWindow) {
    const createdWidget = createWidgetWindow();
    createdWidget.show();
    createdWidget.focus();
    broadcastState();
    return;
  }
  if (!widgetWindow.isVisible()) {
    widgetWindow.show();
  }
  widgetWindow.focus();
  broadcastState();
}

function hideWidgetWindow() {
  widgetWindow?.hide();
  broadcastState();
}

function registerIpc() {
  ipcMain.handle("app:get-initial-state", () => {
    broadcastState();
    return true;
  });

  ipcMain.handle("app:renderer-ready", (_, view: "main" | "widget") => {
    if (view === "main") {
      mainRendererReady = true;
      revealMainWindowWhenReady();
    }
    return true;
  });

  ipcMain.handle("tasks:create", (_, payload: { title: string; taskDate: string; timeText?: string; label?: TaskLabel }) => {
    db.createTask(payload);
    invalidateRolloverCache();
    broadcastState();
    return true;
  });

  ipcMain.handle(
    "tasks:update",
    (_, payload: { id: number; title?: string; taskDate?: string; timeText?: string; label?: TaskLabel; completed?: number }) => {
      db.updateTask(payload.id, payload);
      invalidateRolloverCache();
      broadcastState();
      return true;
    }
  );

  ipcMain.handle("tasks:toggle", (_, id: number) => {
    db.toggleTask(id);
    invalidateRolloverCache();
    broadcastState();
    return true;
  });

  ipcMain.handle("tasks:delete", (_, id: number) => {
    db.deleteTask(id);
    broadcastState();
    return true;
  });

  ipcMain.handle("app:set-date", (_, date: string) => {
    selectedDate = date;
    broadcastState();
    return true;
  });

  ipcMain.handle("app:set-view", (_, view: ViewName) => {
    currentView = view;
    broadcastState();
    return true;
  });

  ipcMain.handle("widget:toggle-pin", () => {
    if (!widgetWindow) {
      return false;
    }
    widgetWindow.setAlwaysOnTop(!widgetWindow.isAlwaysOnTop());
    persistWidgetState();
    broadcastState();
    return true;
  });

  ipcMain.handle("widget:collapse", () => {
    if (!widgetWindow) {
      return false;
    }
    const current = db.getWindowState();
    return setWidgetCollapsed(!current.widgetCollapsed);
  });

  ipcMain.handle("widget:set-opacity", (_, opacity: number) => {
    const current = db.getWindowState();
    const widgetOpacity = clampWidgetOpacity(opacity);
    db.saveWindowState({ ...current, widgetOpacity });
    widgetWindow?.setOpacity(widgetOpacity);
    broadcastState();
    return true;
  });

  ipcMain.handle("widget:show-main", () => {
    showMainWindowSafely();
    return true;
  });

  ipcMain.handle("widget:show", () => {
    showWidgetWindow();
    return true;
  });

  ipcMain.handle("widget:toggle-visibility", () => {
    if (widgetWindow?.isVisible()) {
      hideWidgetWindow();
    } else {
      showWidgetWindow();
    }
    return true;
  });

  ipcMain.handle("widget:hide-to-tray", () => {
    hideWidgetWindow();
    return true;
  });

  ipcMain.handle("window:minimize", (_, target: "main" | "widget") => {
    (target === "main" ? mainWindow : widgetWindow)?.minimize();
    return true;
  });

  ipcMain.handle("window:toggle-maximize", () => {
    if (!mainWindow) {
      return false;
    }
    if (mainWindow.isMaximized()) {
      mainWindow.unmaximize();
    } else {
      mainWindow.maximize();
    }
    return true;
  });

  ipcMain.handle("window:close", (_, target: "main" | "widget") => {
    if (target === "main") {
      mainRevealTimer = clearTimer(mainRevealTimer);
      mainWindow?.hide();
      mainWindow?.setOpacity(0);
    } else {
      widgetWindow?.hide();
    }
    updateTrayMenuIfNeeded();
    return true;
  });

  ipcMain.handle("app:open-external", (_, url: string) => {
    shell.openExternal(url);
    return true;
  });
}

declare global {
  namespace NodeJS {
    interface ProcessEnv {
      VITE_DEV_SERVER_URL?: string;
    }
  }
}

app.whenReady().then(() => {
  app.setAppUserModelId("com.codex.minimaltodo");
  createMainWindow();
  createTray();
  registerIpc();
  broadcastState();
  void refreshDailySaying();

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createMainWindow();
    } else {
      showMainWindowSafely();
    }
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    // Keep tray app behavior consistent on Windows.
  }
});

app.on("before-quit", () => {
  isQuitting = true;
  widgetMoveTimer = clearTimer(widgetMoveTimer);
  mainRevealTimer = clearTimer(mainRevealTimer);
  mainShapeTimer = clearTimer(mainShapeTimer);
  widgetShapeTimer = clearTimer(widgetShapeTimer);
  dailySayingAbortController?.abort();
  dailySayingAbortController = null;
  dailySayingTimeout = clearTimer(dailySayingTimeout);
  tray?.destroy();
  tray = null;
  lastTrayWidgetVisible = null;
  db.close();
});
