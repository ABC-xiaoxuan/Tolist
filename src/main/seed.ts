import type { TaskLabel } from "../shared/types";

export interface SeedTask {
  title: string;
  taskDate: string;
  timeText: string;
  label: TaskLabel;
  completed: number;
}

export const seedTasks: SeedTask[] = [
  { title: "完成产品需求文档", taskDate: "2026-04-24", timeText: "09:00", label: "工作", completed: 1 },
  { title: "团队每日站会", taskDate: "2026-04-24", timeText: "10:00", label: "工作", completed: 1 },
  { title: "回复客户邮件", taskDate: "2026-04-24", timeText: "", label: "工作", completed: 0 },
  { title: "设计登录页 Mockup", taskDate: "2026-04-24", timeText: "14:00", label: "设计", completed: 0 },
  { title: "阅读《原子习惯》第 3 章", taskDate: "2026-04-24", timeText: "", label: "学习", completed: 0 },
  { title: "健身 30 分钟", taskDate: "2026-04-24", timeText: "19:00", label: "健康", completed: 0 },
  { title: "采购礼物", taskDate: "2026-04-26", timeText: "", label: "生活", completed: 0 },
  { title: "团队例会", taskDate: "2026-04-21", timeText: "", label: "工作", completed: 1 },
  { title: "功能联调", taskDate: "2026-04-22", timeText: "", label: "工作", completed: 0 },
  { title: "看书学习", taskDate: "2026-04-24", timeText: "", label: "学习", completed: 0 },
  { title: "项目复盘", taskDate: "2026-04-25", timeText: "", label: "工作", completed: 0 },
  { title: "月度总结", taskDate: "2026-04-30", timeText: "", label: "生活", completed: 0 }
];
