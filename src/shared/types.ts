export type ViewName = "today" | "calendar" | "completed" | "settings";

export type TaskLabel = "工作" | "设计" | "学习" | "健康" | "生活" | "延迟";

export interface TaskRecord {
  id: number;
  title: string;
  notes: string;
  taskDate: string;
  timeText: string;
  label: TaskLabel;
  completed: number;
  completedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface WindowState {
  widgetPinned: boolean;
  widgetCollapsed: boolean;
  widgetOpacity: number;
  widgetBounds: {
    width: number;
    height: number;
    x: number;
    y: number;
  } | null;
  theme: "light";
}

export interface DashboardSummary {
  total: number;
  completed: number;
  completionRate: number;
  labelDistribution: Record<TaskLabel, number>;
}

export interface CalendarDay {
  date: string;
  inCurrentMonth: boolean;
  isToday: boolean;
  tasks: TaskRecord[];
  completedCount: number;
}

export interface RendererSnapshot {
  today: string;
  selectedDate: string;
  currentView: ViewName;
  widgetVisible: boolean;
  mainMaximized: boolean;
  dailySaying: string;
  tasks: TaskRecord[];
  todayTasks: TaskRecord[];
  completedTasks: TaskRecord[];
  monthTasks: TaskRecord[];
  summary: DashboardSummary;
  settings: WindowState;
}
