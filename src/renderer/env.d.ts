import type { TaskLabel, ViewName } from "../shared/types";

declare global {
  interface Window {
    desktopAPI: {
      getInitialState: () => Promise<boolean>;
      notifyRendererReady: (view: "main" | "widget") => Promise<boolean>;
      onSnapshot: (callback: (payload: unknown) => void) => () => void;
      createTask: (payload: {
        title: string;
        taskDate: string;
        timeText?: string;
        label?: TaskLabel;
      }) => Promise<boolean>;
      updateTask: (payload: {
        id: number;
        title?: string;
        taskDate?: string;
        timeText?: string;
        label?: TaskLabel;
        completed?: number;
      }) => Promise<boolean>;
      toggleTask: (id: number) => Promise<boolean>;
      deleteTask: (id: number) => Promise<boolean>;
      setDate: (date: string) => Promise<boolean>;
      setView: (view: ViewName) => Promise<boolean>;
      minimizeWindow: (target: "main" | "widget") => Promise<boolean>;
      toggleMaximize: () => Promise<boolean>;
      closeWindow: (target: "main" | "widget") => Promise<boolean>;
      toggleWidgetPin: () => Promise<boolean>;
      setWidgetOpacity: (opacity: number) => Promise<boolean>;
      collapseWidget: () => Promise<boolean>;
      showWidgetWindow: () => Promise<boolean>;
      toggleWidgetWindow: () => Promise<boolean>;
      showMainWindow: () => Promise<boolean>;
      hideWidgetToTray: () => Promise<boolean>;
    };
  }
}

export {};
