import { useEffect, useMemo, useRef, useState } from "react";
import type {
  RendererSnapshot,
  TaskLabel,
  TaskRecord,
  ViewName
} from "../shared/types";
import {
  CalendarDays,
  Check,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  ChevronLeft,
  ChevronRight,
  Feather,
  LayoutGrid,
  MonitorUp,
  Minus,
  MoreVertical,
  Pin,
  Plus,
  Settings,
  Square,
  Trash2,
  X
} from "lucide-react";

const labels: TaskLabel[] = ["工作", "设计", "学习", "健康", "生活", "延迟"];
const navItems: { key: ViewName; label: string; icon: typeof CalendarDays }[] = [
  { key: "today", label: "今日", icon: LayoutGrid },
  { key: "calendar", label: "月视图", icon: CalendarDays },
  { key: "completed", label: "已完成", icon: CheckCircle2 },
  { key: "settings", label: "设置", icon: Settings }
];

function getViewMode() {
  const query = new URLSearchParams(window.location.search);
  return query.get("view") === "widget" ? "widget" : "main";
}

function formatMonthTitle(dateKey: string) {
  const [year, month] = dateKey.split("-");
  return `${year}年${Number(month)}月`;
}

function formatWidgetDate(dateKey: string) {
  const date = new Date(`${dateKey}T00:00:00`);
  return new Intl.DateTimeFormat("zh-CN", {
    month: "long",
    day: "numeric",
    weekday: "short"
  }).format(date);
}

function toLocalDateKey(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function toLocalMonthKey(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  return `${year}-${month}`;
}

function buildCalendar(dateKey: string, tasks: TaskRecord[], today: string) {
  const current = new Date(`${dateKey.slice(0, 7)}-01T00:00:00`);
  const month = current.getMonth();
  const start = new Date(current);
  const weekday = (start.getDay() + 6) % 7;
  start.setDate(start.getDate() - weekday);
  const endOfMonth = new Date(current.getFullYear(), current.getMonth() + 1, 0);
  const totalVisibleDays = weekday + endOfMonth.getDate() > 35 ? 42 : 35;
  const tasksByDate = new Map<string, TaskRecord[]>();
  for (const task of tasks) {
    const dayTasks = tasksByDate.get(task.taskDate);
    if (dayTasks) {
      dayTasks.push(task);
    } else {
      tasksByDate.set(task.taskDate, [task]);
    }
  }

  return Array.from({ length: totalVisibleDays }, (_, index) => {
    const day = new Date(start);
    day.setDate(start.getDate() + index);
    const key = toLocalDateKey(day);
    const dayTasks = tasksByDate.get(key) ?? [];
    return {
      key,
      day: day.getDate(),
      inCurrentMonth: day.getMonth() === month,
      isToday: key === today,
      tasks: dayTasks,
      completedCount: dayTasks.filter((task) => task.completed).length
    };
  });
}

function getLabelClass(label: TaskLabel) {
  return `label-badge label-${label}`;
}

function EmptyState({ title, description }: { title: string; description: string }) {
  return (
    <div className="empty-state">
      <div className="empty-state__icon">
        <CheckCircle2 size={22} />
      </div>
      <h3>{title}</h3>
      <p>{description}</p>
    </div>
  );
}

function TaskRow({
  task,
  onToggle,
  onDelete,
  onEdit
}: {
  task: TaskRecord;
  onToggle: (id: number) => void;
  onDelete: (id: number) => void;
  onEdit: (task: TaskRecord) => void;
}) {
  return (
    <div className={`task-row ${task.completed ? "is-complete" : ""}`}>
      <button className={`task-check ${task.completed ? "is-active" : ""}`} onClick={() => onToggle(task.id)}>
        {task.completed ? <Check size={13} strokeWidth={3} /> : null}
      </button>
      <div className="task-main" onDoubleClick={() => onEdit(task)}>
        <div className="task-title-row">
          <span className="task-title">{task.title}</span>
        </div>
        <div className="task-meta">
          <span className={getLabelClass(task.label)}>{task.label}</span>
        </div>
      </div>
      <div className="task-actions">
        <button
          className="icon-button"
          onClick={(event) => {
            event.stopPropagation();
            onEdit(task);
          }}
          title="编辑"
        >
          <MoreVertical size={18} />
        </button>
        <button
          className="icon-button danger"
          onClick={(event) => {
            event.stopPropagation();
            onDelete(task.id);
          }}
          title="删除"
        >
          <Trash2 size={18} />
        </button>
      </div>
    </div>
  );
}

function WindowControls({ widget }: { widget?: boolean }) {
  return (
    <div className="window-controls no-drag">
      {widget ? null : (
        <>
          <button className="window-control" onClick={() => window.desktopAPI.minimizeWindow("main")}>
            <Minus size={18} />
          </button>
          <button className="window-control" onClick={() => window.desktopAPI.toggleMaximize()}>
            <Square size={16} />
          </button>
        </>
      )}
      <button className="window-control" onClick={() => window.desktopAPI.closeWindow(widget ? "widget" : "main")}>
        <X size={18} />
      </button>
    </div>
  );
}

export function App() {
  const mode = getViewMode();
  const rendererReadySent = useRef(false);
  const [snapshot, setSnapshot] = useState<RendererSnapshot | null>(null);
  const [quickTask, setQuickTask] = useState("");
  const [taskLabel, setTaskLabel] = useState<TaskLabel>("工作");
  const [editingTask, setEditingTask] = useState<TaskRecord | null>(null);
  const [editingTitle, setEditingTitle] = useState("");
  const [editingLabel, setEditingLabel] = useState<TaskLabel>("工作");

  useEffect(() => {
    document.body.classList.toggle("widget-body", mode === "widget");
    document.body.classList.toggle("main-body", mode !== "widget");
    return () => {
      document.body.classList.remove("widget-body", "main-body");
    };
  }, [mode]);

  useEffect(() => {
    const unsubscribe = window.desktopAPI.onSnapshot((payload) => {
      const value = payload as { type: string; payload: RendererSnapshot };
      setSnapshot(value.payload);
    });
    void window.desktopAPI.getInitialState();
    return unsubscribe;
  }, []);

  useEffect(() => {
    if (editingTask) {
      setEditingTitle(editingTask.title);
      setEditingLabel(editingTask.label);
    }
  }, [editingTask]);

  useEffect(() => {
    if (!snapshot || rendererReadySent.current) {
      return;
    }

    let secondPaint = 0;
    const firstPaint = window.requestAnimationFrame(() => {
      secondPaint = window.requestAnimationFrame(() => {
        rendererReadySent.current = true;
        void window.desktopAPI.notifyRendererReady(mode);
      });
    });

    return () => {
      window.cancelAnimationFrame(firstPaint);
      if (secondPaint) {
        window.cancelAnimationFrame(secondPaint);
      }
    };
  }, [mode, Boolean(snapshot)]);

  const calendarDays = useMemo(() => {
    if (!snapshot || snapshot.currentView !== "calendar") {
      return [];
    }
    return buildCalendar(snapshot.selectedDate, snapshot.monthTasks, snapshot.today);
  }, [snapshot?.currentView, snapshot?.selectedDate, snapshot?.monthTasks, snapshot?.today]);

  if (!snapshot) {
    return <div className="app-loading">正在加载极简待办...</div>;
  }

  const completedCount = snapshot.tasks.filter((task) => task.completed).length;
  const progress = snapshot.tasks.length ? (completedCount / snapshot.tasks.length) * 100 : 0;
  const widgetCompletedCount = snapshot.todayTasks.filter((task) => task.completed).length;

  async function createTask(taskDate = snapshot.selectedDate) {
    const title = quickTask.trim();
    if (!title) {
      return;
    }
    await window.desktopAPI.createTask({ title, taskDate, label: taskLabel });
    setQuickTask("");
  }

  function shiftMonth(offset: number) {
    const base = new Date(`${snapshot.selectedDate.slice(0, 7)}-01T00:00:00`);
    base.setMonth(base.getMonth() + offset);
    const nextDate = `${toLocalMonthKey(base)}-01`;
    void window.desktopAPI.setDate(nextDate);
  }

  function renderTodayContent() {
    return (
      <div className="content-shell content-shell--today">
        <section className="content-main content-main--today">
          <div className="page-heading">
            <h1>今天的待办</h1>
            <p>已完成 {completedCount} / {snapshot.tasks.length}</p>
          </div>
          <div className="progress-track">
            <div className="progress-fill" style={{ width: `${progress}%` }} />
          </div>
          <div className="quick-add card">
            <input
              value={quickTask}
              onChange={(event) => setQuickTask(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter") {
                  void createTask();
                }
              }}
              placeholder="添加新的待办，按 Enter 创建"
            />
            <select value={taskLabel} onChange={(event) => setTaskLabel(event.target.value as TaskLabel)}>
              {labels.map((label) => (
                <option key={label} value={label}>
                  {label}
                </option>
              ))}
            </select>
            <button className="add-button" onClick={() => void createTask()}>
              <Plus size={22} />
            </button>
          </div>
          <div className="task-list task-list--today">
            {snapshot.tasks.map((task) => (
              <TaskRow
                key={task.id}
                task={task}
                onToggle={(id) => void window.desktopAPI.toggleTask(id)}
                onDelete={(id) => void window.desktopAPI.deleteTask(id)}
                onEdit={setEditingTask}
              />
            ))}
          </div>
          <div className="footer-hint footer-hint--fixed">今天剩余 {snapshot.tasks.length - completedCount} 项待办</div>
        </section>
      </div>
    );
  }

  function renderCalendarContent() {
    return (
      <div className="content-shell">
        <section className="content-main calendar-layout">
          <div className="calendar-header">
            <div className="calendar-nav">
              <button className="secondary-button icon-only" onClick={() => shiftMonth(-1)}>
                <ChevronLeft size={18} />
              </button>
              <button className="secondary-button icon-only" onClick={() => shiftMonth(1)}>
                <ChevronRight size={18} />
              </button>
              <h1>{formatMonthTitle(snapshot.selectedDate)}</h1>
            </div>
            <button className="secondary-button" onClick={() => void window.desktopAPI.setDate(snapshot.today)}>
              今天
            </button>
          </div>
          <div className="calendar-summary">
            <div className="summary-card">
              <span>总任务</span>
              <strong>{snapshot.summary.total}</strong>
            </div>
            <div className="summary-card">
              <span>已完成</span>
              <strong>{snapshot.summary.completed}</strong>
            </div>
            <div className="summary-card">
              <span>完成率</span>
              <strong>{snapshot.summary.completionRate}%</strong>
            </div>
          </div>
          <div className="calendar-weekdays">
            {["周一", "周二", "周三", "周四", "周五", "周六", "周日"].map((item) => (
              <span key={item}>{item}</span>
            ))}
          </div>
          <div className="calendar-grid">
            {calendarDays.map((day) => (
              <button
                key={day.key}
                className={`calendar-cell ${day.inCurrentMonth ? "" : "is-muted"} ${day.key === snapshot.selectedDate ? "is-selected" : ""}`}
                onClick={() => void window.desktopAPI.setDate(day.key)}
              >
                <div className="calendar-cell__head">
                  <span>{day.day}</span>
                  {day.isToday ? <span className="today-chip">今天</span> : null}
                </div>
                <div className="calendar-cell__tasks">
                  {day.tasks.slice(0, 3).map((task) => (
                    <span key={task.id} className="calendar-task-dot">
                      {task.title}
                    </span>
                  ))}
                </div>
              </button>
            ))}
          </div>
        </section>
        <aside className="content-side">
          <section className="card stats-card">
            <h3>本月统计</h3>
            <div className="stat-grid">
              <div>
                <span>总任务</span>
                <strong>{snapshot.summary.total}</strong>
              </div>
              <div>
                <span>已完成</span>
                <strong>{snapshot.summary.completed}</strong>
              </div>
              <div>
                <span>完成率</span>
                <strong>{snapshot.summary.completionRate}%</strong>
              </div>
            </div>
          </section>
          <section className="card stats-card">
            <h3>本月标签分布</h3>
            <div className="distribution-list">
              {Object.entries(snapshot.summary.labelDistribution).map(([label, count]) => (
                <div key={label} className="distribution-row">
                  <span className={`dot dot-${label}`}></span>
                  <span>{label}</span>
                  <div className="distribution-track">
                    <div
                      className={`distribution-fill fill-${label}`}
                      style={{
                        width: `${snapshot.summary.total ? (Number(count) / snapshot.summary.total) * 100 : 0}%`
                      }}
                    />
                  </div>
                  <strong>{count}</strong>
                </div>
              ))}
            </div>
          </section>
        </aside>
      </div>
    );
  }

  function renderCompletedContent() {
    return (
      <div className="completed-page">
        <div className="page-heading">
          <h1>已完成</h1>
          <p>回顾最近完成的任务，保持节奏感。</p>
        </div>
        <div className="task-list">
          {snapshot.completedTasks.length ? (
            snapshot.completedTasks.map((task) => (
              <TaskRow
                key={task.id}
                task={task}
                onToggle={(id) => void window.desktopAPI.toggleTask(id)}
                onDelete={(id) => void window.desktopAPI.deleteTask(id)}
                onEdit={setEditingTask}
              />
            ))
          ) : (
            <EmptyState title="还没有完成项" description="完成任务后会出现在这里，方便你回顾进度。" />
          )}
        </div>
      </div>
    );
  }

  function renderSettingsContent() {
    return (
      <div className="settings-page">
        <div className="page-heading">
          <h1>设置</h1>
          <p>保留必要的配置项，避免把应用做成复杂系统。</p>
        </div>
        <div className="settings-grid">
          <section className="card setting-card">
            <h3>当前功能</h3>
            <p>保留待办、月视图、已完成记录和便签浮窗，保持应用轻量。</p>
          </section>
          <section className="card setting-card">
            <h3>后续规划</h3>
            <p>后续功能会按实际使用需要逐步补充，不打扰当前待办流程。</p>
          </section>
          <section className="card setting-card">
            <h3>浮窗状态</h3>
            <p>{snapshot.settings.widgetPinned ? "已置顶" : "未置顶"}，{snapshot.settings.widgetCollapsed ? "已折叠" : "展开中"}。</p>
            <label className="opacity-setting">
              <span>浮窗透明度 {Math.round(snapshot.settings.widgetOpacity * 100)}%</span>
              <input
                type="range"
                min={35}
                max={100}
                step={5}
                value={Math.round(snapshot.settings.widgetOpacity * 100)}
                onChange={(event) => void window.desktopAPI.setWidgetOpacity(Number(event.target.value) / 100)}
              />
            </label>
          </section>
        </div>
      </div>
    );
  }

  function renderContent() {
    switch (snapshot.currentView) {
      case "calendar":
        return renderCalendarContent();
      case "completed":
        return renderCompletedContent();
      case "settings":
        return renderSettingsContent();
      case "today":
      default:
        return renderTodayContent();
    }
  }

  function renderEditModal() {
    if (!editingTask) {
      return null;
    }

    return (
      <div className="modal-backdrop" onClick={() => setEditingTask(null)}>
        <div className="modal-card" onClick={(event) => event.stopPropagation()}>
          <div className="card-title-row">
            <h3>编辑任务</h3>
            <button className="icon-button" onClick={() => setEditingTask(null)}>
              <X size={18} />
            </button>
          </div>
          <div className="modal-fields">
            <label>
              任务名称
              <input value={editingTitle} onChange={(event) => setEditingTitle(event.target.value)} />
            </label>
            <label>
              标签
              <select value={editingLabel} onChange={(event) => setEditingLabel(event.target.value as TaskLabel)}>
                {labels.map((label) => (
                  <option key={label} value={label}>
                    {label}
                  </option>
                ))}
              </select>
            </label>
          </div>
          <div className="modal-actions">
            <button className="secondary-button" onClick={() => setEditingTask(null)}>
              取消
            </button>
            <button
              className="primary-button"
              onClick={() => {
                void window.desktopAPI.updateTask({
                  id: editingTask.id,
                  title: editingTitle,
                  label: editingLabel
                });
                setEditingTask(null);
              }}
            >
              保存
            </button>
          </div>
        </div>
      </div>
    );
  }

  if (mode === "widget") {
    return (
      <div className={`widget-shell ${snapshot.settings.widgetCollapsed ? "is-collapsed" : ""}`}>
        <div className="widget-note">
          {snapshot.settings.widgetCollapsed ? (
            <button
              className="widget-expand-tab no-drag"
              onClick={() => void window.desktopAPI.collapseWidget()}
              title="展开浮窗"
            >
              <ChevronDown size={22} />
            </button>
          ) : (
            <div className="widget-topbar drag-region">
              <div className="widget-note-meta">
                <span className="widget-note-label">今日待办</span>
                <span className="widget-date">{formatWidgetDate(snapshot.today)}</span>
              </div>
              <div className="widget-controls no-drag">
                <button className="window-control" onClick={() => void window.desktopAPI.collapseWidget()} title="贴边收起">
                  <ChevronUp size={15} />
                </button>
                <button className="window-control" onClick={() => void window.desktopAPI.toggleWidgetPin()}>
                  <Pin size={15} />
                </button>
              </div>
            </div>
          )}
          {snapshot.settings.widgetCollapsed ? null : (
            <>
              <section className="widget-section widget-section--composer">
                <div className="widget-quick-add">
                  <input
                    value={quickTask}
                    onChange={(event) => setQuickTask(event.target.value)}
                    onKeyDown={(event) => {
                      if (event.key === "Enter") {
                        void createTask(snapshot.today);
                      }
                    }}
                    placeholder="快速添加待办"
                  />
                  <button className="add-button" onClick={() => void createTask(snapshot.today)}>
                    <Plus size={18} />
                  </button>
                </div>
              </section>
              <section className="widget-section widget-section--list">
                <div className="widget-task-list">
                  {snapshot.todayTasks.map((task) => (
                    <TaskRow
                      key={task.id}
                      task={task}
                      onToggle={(id) => void window.desktopAPI.toggleTask(id)}
                      onDelete={(id) => void window.desktopAPI.deleteTask(id)}
                      onEdit={setEditingTask}
                    />
                  ))}
                </div>
                <div className="widget-summary">
                  <span>完成 {widgetCompletedCount} / {snapshot.todayTasks.length}</span>
                </div>
              </section>
            </>
          )}
        </div>
        {renderEditModal()}
      </div>
    );
  }

  return (
    <div className={`desktop-shell ${snapshot.mainMaximized ? "is-maximized" : ""}`}>
      <header className="topbar drag-region">
        <div className="brand">
          <div className="brand-mark">
            <Check size={20} />
          </div>
          <h1>极简待办</h1>
        </div>
        <div className="topbar-center">
          <div className="daily-saying" title={snapshot.dailySaying}>
            <Feather size={15} />
            <span>{snapshot.dailySaying}</span>
          </div>
        </div>
        <div className="topbar-actions no-drag">
          <button className="secondary-button topbar-widget-button" onClick={() => void window.desktopAPI.toggleWidgetWindow()}>
            <MonitorUp size={18} />
            {snapshot.widgetVisible ? "关闭浮窗" : "打开浮窗"}
          </button>
          <button className="icon-button" onClick={() => void window.desktopAPI.setView("settings")}>
            <Settings size={18} />
          </button>
          <WindowControls />
        </div>
      </header>
      <div className="layout">
        <aside className="sidebar">
          <nav className="nav-list">
            {navItems.map((item) => {
              const Icon = item.icon;
              return (
                <button
                  key={item.key}
                  className={`nav-item ${snapshot.currentView === item.key ? "is-active" : ""}`}
                  onClick={() => void window.desktopAPI.setView(item.key)}
                >
                  <Icon size={20} />
                  {item.label}
                </button>
              );
            })}
          </nav>
          <div className="sidebar-footer card">
            <div className="brand-mark secondary">
              <Check size={18} />
            </div>
            <div>
              <strong>有问题可以联系我</strong>
              <p>abc.xiaoxuan123@gmail.com</p>
            </div>
          </div>
        </aside>
        <main className="main-content">{renderContent()}</main>
      </div>
      {renderEditModal()}
    </div>
  );
}
