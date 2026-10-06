export type Column = "backlog" | "todo" | "in_progress" | "in_review" | "done";
export type Priority = "low" | "medium" | "high";
export type ProjectStatus = "planning" | "active" | "on_hold" | "completed";

export const COLUMNS: { id: Column; label: string }[] = [
  { id: "backlog", label: "Backlog" },
  { id: "todo", label: "To do" },
  { id: "in_progress", label: "In progress" },
  { id: "in_review", label: "In review" },
  { id: "done", label: "Done" },
];
export const columnLabel = (id: Column) => COLUMNS.find((c) => c.id === id)?.label ?? id;
export const PROJECT_STATUS: Record<ProjectStatus, string> = { planning: "Planning", active: "Active", on_hold: "On hold", completed: "Completed" };
export const PRIORITY: Record<Priority, string> = { low: "Low", medium: "Medium", high: "High" };

export interface Project {
  id: string; shareToken: string; name: string; client: string; status: ProjectStatus; dueDate: string; recurring: boolean; summary: string;
  archived: boolean; createdAt: string; updatedAt: string; counts: Record<Column, number>; total: number; progress: number;
}
export interface Designer { id: string; name: string; role: string; email?: string; hasLogin?: boolean }
export interface Comment { id: string; authorId: string; authorName: string; text: string; createdAt: string }
export interface Task {
  assigneeId: string; comments: Comment[];
  id: string; projectId: string; title: string; description: string; status: Column; priority: Priority; dueDate: string;
  clientUpdate: string; clientUpdateAt: string; privateNotes: string; createdAt: string; updatedAt: string;
}
export interface ClientProject {
  name: string; client: string; status: ProjectStatus; dueDate: string; recurring: boolean; summary: string; progress: number;
  counts: Record<Column, number>; total: number; updatedAt: string;
}
export interface ClientTask { id: string; title: string; description: string; status: Column; dueDate: string; clientUpdate: string; clientUpdateAt: string }
export type ProjectInput = Pick<Project, "name" | "client" | "status" | "dueDate" | "recurring" | "summary">;
export type TaskInput = Pick<Task, "title" | "description" | "status" | "priority" | "dueDate" | "clientUpdate" | "privateNotes" | "assigneeId">;
