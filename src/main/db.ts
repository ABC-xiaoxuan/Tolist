import Database from "better-sqlite3";
import path from "node:path";
import fs from "node:fs";
import { app } from "electron";
import type {
  DashboardSummary,
  TaskLabel,
  TaskRecord,
  WindowState
} from "../shared/types";
import { seedTasks } from "./seed";

const DEFAULT_WINDOW_STATE: WindowState = {
  widgetPinned: true,
  widgetCollapsed: false,
  widgetOpacity: 0.96,
  widgetBounds: {
    width: 300,
    height: 460,
    x: 1300,
    y: 220
  },
  theme: "light"
};

export class TodoDatabase {
  private db: Database.Database;
  private closed = false;

  constructor() {
    const dataDir = app.getPath("userData");
    fs.mkdirSync(dataDir, { recursive: true });
    const filePath = path.join(dataDir, "minimal-todo.db");
    this.db = new Database(filePath);
    this.db.pragma("journal_mode = WAL");
    this.initialize();
  }

  private initialize() {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS tasks (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        title TEXT NOT NULL,
        notes TEXT NOT NULL DEFAULT '',
        task_date TEXT NOT NULL,
        time_text TEXT NOT NULL DEFAULT '',
        label TEXT NOT NULL,
        completed INTEGER NOT NULL DEFAULT 0,
        completed_at TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS preferences (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL
      );
    `);

    const count = this.db.prepare("SELECT COUNT(*) as count FROM tasks").get() as { count: number };
    if (count.count === 0) {
      this.seed();
    }

    this.ensurePreference("window_state", JSON.stringify(DEFAULT_WINDOW_STATE));
  }

  private seed() {
    const insert = this.db.prepare(`
      INSERT INTO tasks (title, notes, task_date, time_text, label, completed, completed_at, created_at, updated_at)
      VALUES (@title, '', @taskDate, @timeText, @label, @completed, @completedAt, @createdAt, @updatedAt)
    `);
    const now = new Date().toISOString();
    const run = this.db.transaction(() => {
      for (const task of seedTasks) {
        insert.run({
          ...task,
          completedAt: task.completed ? now : null,
          createdAt: now,
          updatedAt: now
        });
      }
    });
    run();
  }

  private ensurePreference(key: string, value: string) {
    this.db
      .prepare("INSERT OR IGNORE INTO preferences (key, value) VALUES (?, ?)")
      .run(key, value);
  }

  private mapTask(row: Record<string, unknown>): TaskRecord {
    return {
      id: Number(row.id),
      title: String(row.title),
      notes: String(row.notes ?? ""),
      taskDate: String(row.task_date),
      timeText: String(row.time_text ?? ""),
      label: String(row.label) as TaskLabel,
      completed: Number(row.completed),
      completedAt: row.completed_at ? String(row.completed_at) : null,
      createdAt: String(row.created_at),
      updatedAt: String(row.updated_at)
    };
  }

  getTasksByDate(taskDate: string) {
    const rows = this.db
      .prepare(
        `
        SELECT * FROM tasks
        WHERE task_date = ?
        ORDER BY completed ASC, CASE WHEN time_text = '' THEN 1 ELSE 0 END, time_text ASC, id DESC
      `
      )
      .all(taskDate) as Record<string, unknown>[];
    return rows.map((row) => this.mapTask(row));
  }

  getCompletedTasks() {
    const rows = this.db
      .prepare("SELECT * FROM tasks WHERE completed = 1 ORDER BY completed_at DESC, updated_at DESC")
      .all() as Record<string, unknown>[];
    return rows.map((row) => this.mapTask(row));
  }

  getMonthTasks(month: string) {
    const rows = this.db
      .prepare(
        `
        SELECT * FROM tasks
        WHERE substr(task_date, 1, 7) = ?
        ORDER BY task_date ASC, completed ASC, CASE WHEN time_text = '' THEN 1 ELSE 0 END, time_text ASC
      `
      )
      .all(month) as Record<string, unknown>[];
    return rows.map((row) => this.mapTask(row));
  }

  rolloverIncompleteTasks(today: string) {
    const now = new Date().toISOString();
    const result = this.db
      .prepare(
        `
        UPDATE tasks
        SET task_date = @today,
            label = '延迟',
            updated_at = @updatedAt
        WHERE completed = 0
          AND task_date < @today
      `
      )
      .run({
        today,
        updatedAt: now
      });

    return result.changes;
  }

  createTask(input: {
    title: string;
    taskDate: string;
    timeText?: string;
    label?: TaskLabel;
    notes?: string;
  }) {
    const now = new Date().toISOString();
    const result = this.db
      .prepare(
        `
        INSERT INTO tasks (title, notes, task_date, time_text, label, completed, completed_at, created_at, updated_at)
        VALUES (@title, @notes, @taskDate, @timeText, @label, 0, NULL, @createdAt, @updatedAt)
      `
      )
      .run({
        title: input.title.trim(),
        notes: input.notes?.trim() ?? "",
        taskDate: input.taskDate,
        timeText: input.timeText?.trim() ?? "",
        label: input.label ?? "工作",
        createdAt: now,
        updatedAt: now
      });

    return this.getTaskById(Number(result.lastInsertRowid));
  }

  updateTask(
    id: number,
    input: Partial<{
      title: string;
      notes: string;
      taskDate: string;
      timeText: string;
      label: TaskLabel;
      completed: number;
    }>
  ) {
    const existing = this.getTaskById(id);
    if (!existing) {
      throw new Error("Task not found");
    }
    const completed = input.completed ?? existing.completed;
    const completedAt = completed ? existing.completedAt ?? new Date().toISOString() : null;
    const payload = {
      id,
      title: input.title?.trim() ?? existing.title,
      notes: input.notes?.trim() ?? existing.notes,
      taskDate: input.taskDate ?? existing.taskDate,
      timeText: input.timeText?.trim() ?? existing.timeText,
      label: input.label ?? existing.label,
      completed,
      completedAt,
      updatedAt: new Date().toISOString()
    };
    this.db
      .prepare(
        `
        UPDATE tasks
        SET title = @title,
            notes = @notes,
            task_date = @taskDate,
            time_text = @timeText,
            label = @label,
            completed = @completed,
            completed_at = @completedAt,
            updated_at = @updatedAt
        WHERE id = @id
      `
      )
      .run(payload);
    return this.getTaskById(id);
  }

  deleteTask(id: number) {
    this.db.prepare("DELETE FROM tasks WHERE id = ?").run(id);
  }

  getTaskById(id: number) {
    const row = this.db.prepare("SELECT * FROM tasks WHERE id = ?").get(id) as Record<string, unknown> | undefined;
    return row ? this.mapTask(row) : null;
  }

  toggleTask(id: number) {
    const existing = this.getTaskById(id);
    if (!existing) {
      throw new Error("Task not found");
    }
    return this.updateTask(id, { completed: existing.completed ? 0 : 1 });
  }

  getWindowState() {
    const row = this.db.prepare("SELECT value FROM preferences WHERE key = ?").get("window_state") as
      | { value: string }
      | undefined;
    if (!row) {
      return DEFAULT_WINDOW_STATE;
    }
    try {
      return { ...DEFAULT_WINDOW_STATE, ...JSON.parse(row.value) } as WindowState;
    } catch {
      this.saveWindowState(DEFAULT_WINDOW_STATE);
      return DEFAULT_WINDOW_STATE;
    }
  }

  saveWindowState(settings: WindowState) {
    this.db
      .prepare("INSERT INTO preferences (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value")
      .run("window_state", JSON.stringify(settings));
  }

  getSummary(month: string): DashboardSummary {
    const stats = this.db
      .prepare(
        `
        SELECT COUNT(*) as total,
               SUM(CASE WHEN completed = 1 THEN 1 ELSE 0 END) as completed
        FROM tasks
        WHERE substr(task_date, 1, 7) = ?
      `
      )
      .get(month) as { total: number; completed: number | null };

    const distributionRows = this.db
      .prepare(
        `
        SELECT label, COUNT(*) as count
        FROM tasks
        WHERE substr(task_date, 1, 7) = ?
        GROUP BY label
      `
      )
      .all(month) as { label: TaskLabel; count: number }[];

    const labelDistribution: Record<TaskLabel, number> = {
      工作: 0,
      设计: 0,
      学习: 0,
      健康: 0,
      生活: 0,
      延迟: 0
    };
    for (const row of distributionRows) {
      if (row.label in labelDistribution) {
        labelDistribution[row.label] = row.count;
      }
    }

    const total = stats.total ?? 0;
    const completed = stats.completed ?? 0;
    return {
      total,
      completed,
      completionRate: total ? Math.round((completed / total) * 100) : 0,
      labelDistribution
    };
  }

  close() {
    if (this.closed) {
      return;
    }
    this.db.close();
    this.closed = true;
  }

}
