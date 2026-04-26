import { contextBridge, ipcRenderer } from "electron";
import type { TaskLabel, ViewName } from "../shared/types";

contextBridge.exposeInMainWorld("desktopAPI", {
  getInitialState: () => ipcRenderer.invoke("app:get-initial-state"),
  notifyRendererReady: (view: "main" | "widget") => ipcRenderer.invoke("app:renderer-ready", view),
  onSnapshot: (callback: (payload: unknown) => void) => {
    const listener = (_event: unknown, payload: unknown) => callback(payload);
    ipcRenderer.on("app:snapshot", listener);
    return () => ipcRenderer.removeListener("app:snapshot", listener);
  },
  createTask: (payload: { title: string; taskDate: string; timeText?: string; label?: TaskLabel }) =>
    ipcRenderer.invoke("tasks:create", payload),
  updateTask: (payload: {
    id: number;
    title?: string;
    taskDate?: string;
    timeText?: string;
    label?: TaskLabel;
    completed?: number;
  }) => ipcRenderer.invoke("tasks:update", payload),
  toggleTask: (id: number) => ipcRenderer.invoke("tasks:toggle", id),
  deleteTask: (id: number) => ipcRenderer.invoke("tasks:delete", id),
  setDate: (date: string) => ipcRenderer.invoke("app:set-date", date),
  setView: (view: ViewName) => ipcRenderer.invoke("app:set-view", view),
  minimizeWindow: (target: "main" | "widget") => ipcRenderer.invoke("window:minimize", target),
  toggleMaximize: () => ipcRenderer.invoke("window:toggle-maximize"),
  closeWindow: (target: "main" | "widget") => ipcRenderer.invoke("window:close", target),
  toggleWidgetPin: () => ipcRenderer.invoke("widget:toggle-pin"),
  setWidgetOpacity: (opacity: number) => ipcRenderer.invoke("widget:set-opacity", opacity),
  collapseWidget: () => ipcRenderer.invoke("widget:collapse"),
  showWidgetWindow: () => ipcRenderer.invoke("widget:show"),
  toggleWidgetWindow: () => ipcRenderer.invoke("widget:toggle-visibility"),
  showMainWindow: () => ipcRenderer.invoke("widget:show-main"),
  hideWidgetToTray: () => ipcRenderer.invoke("widget:hide-to-tray")
});
