export type Column = "backlog" | "todo" | "in_progress" | "in_review" | "done";
export type Priority = "low" | "medium" | "high";
export type ProjectStatus = "active" | "on_hold" | "completed";

export const COLUMNS: { id: Column; label: string }[] = [
  { id: "backlog", label: "Backlog" },
  { id: "todo", label: "To do" },
  { id: "in_progress", label: "In progress" },
  { id: "in_review", label: "In review" },
  { id: "done", label: "Done" },
];
export const columnLabel = (id: Column) => COLUMNS.find((c) => c.id === id)?.label ?? id;
export const PROJECT_STATUS: Record<ProjectStatus, string> = { active: "Active", on_hold: "On hold", completed: "Completed" };
export const PRIORITY: Record<Priority, string> = { low: "Low", medium: "Medium", high: "High" };

export interface Project {
  id: string; shareToken: string; name: string; client: string; status: ProjectStatus; dueDate: string; recurring: boolean; summary: string;
  archived: boolean; createdAt: string; updatedAt: string; counts: Record<Column, number>; total: number; progress: number;
}
export interface Designer { id: string; name: string; role: string; email?: string; hasLogin?: boolean; projectIds?: string[] }
export interface Comment { id: string; authorId: string; authorName: string; authorRole: "owner" | "designer" | "client"; visibility: "internal" | "client"; text: string; createdAt: string }
export interface TaskLink {
  id: string; type: "relates" | "blocks" | "duplicates"; label: string;
  task: { id: string; title: string; status: Column; projectId: string; projectName: string };
}
export interface Attachment { id: string; name: string; size: number; type: string; uploadedById: string; uploadedByName: string; uploadedAt: string; visibility: "internal" | "client" }
export interface TaskSearchResult { id: string; title: string; status: Column; projectId: string; projectName: string }
export interface Task {
  links: TaskLink[]; attachments: Attachment[];
  assigneeId: string; comments: Comment[];
  id: string; projectId: string; title: string; description: string; status: Column; priority: Priority; dueDate: string;
  clientUpdate: string; clientUpdateAt: string; privateNotes: string; createdAt: string; updatedAt: string;
}
export interface ClientProject {
  name: string; client: string; status: ProjectStatus; dueDate: string; recurring: boolean; summary: string; progress: number;
  counts: Record<Column, number>; total: number; updatedAt: string;
}
export interface ClientTask { id: string; title: string; description: string; status: Column; dueDate: string; clientUpdate: string; clientUpdateAt: string }
export type AiAction =
  | { type: "create_task"; fields: Partial<TaskInput> & { title: string } }
  | { type: "update_task"; taskId: string; taskTitle: string; fields: Partial<TaskInput> };
export type ProjectInput = Pick<Project, "name" | "client" | "status" | "dueDate" | "recurring" | "summary">;
export type TaskInput = Pick<Task, "title" | "description" | "status" | "priority" | "dueDate" | "clientUpdate" | "privateNotes" | "assigneeId">;

export interface ClientAccount { id: string; name: string; company: string; email: string; hasLogin: boolean; projectIds: string[] }

export const REQUEST_TYPES = ["Website design & development", "Branding & identity", "Product / app design", "Other"] as const;
export interface RequestInput { name: string; type: string; description: string; goals: string[]; references: string; notes: string; startDate: string; dueDate: string }
export interface ProjectRequest extends RequestInput {
  id: string; clientId: string; clientName: string; company: string; days: number; status: "new" | "accepted" | "declined"; projectId: string; createdAt: string;
  estimate: { days: number; total: number; lines: { unit: "year" | "month" | "week" | "day"; qty: number; rate: number; subtotal: number }[] };
}
