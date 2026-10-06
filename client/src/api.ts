import type { ClientProject, ClientTask, Designer, Project, ProjectInput, Task, TaskInput, TaskLink, TaskSearchResult } from "./types";

export class ApiError extends Error {
  constructor(public status: number, message: string) { super(message); }
}

async function request<T>(method: string, url: string, body?: unknown): Promise<T> {
  let res: Response;
  try {
    res = await fetch(url, {
      method,
      headers: body !== undefined || method === "POST" ? { "Content-Type": "application/json" } : {},
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
  } catch {
    throw new ApiError(0, "Can’t reach the server. Check your connection and try again.");
  }
  const data = await res.json().catch(() => ({}));
  if (res.status === 401 && !url.endsWith("/login") && !url.endsWith("/me/password")) { // those 401s mean a wrong password, not an expired session
    location.replace("/login?expired=1" + location.hash);
    throw new ApiError(401, "Your session ended. Please sign in again.");
  }
  if (!res.ok) throw new ApiError(res.status, (data as { error?: string }).error || "Something went wrong.");
  return data as T;
}

export const api = {
  login: (password: string, opts: { email?: string; as?: "owner" | "client" } = {}) => request<{ role: string }>("POST", "/api/login", opts.email ? { email: opts.email, password } : { password, as: opts.as }),
  session: () => request<{ role: "owner" | "client" | "designer"; designer?: { id: string; name: string }; expiresAt?: number }>("GET", "/api/session"),
  logout: () => request<{ ok: true }>("POST", "/api/logout", {}),
  listProjects: () => request<Project[]>("GET", "/api/projects"),
  getProject: (id: string) => request<{ project: Project; tasks: Task[] }>("GET", `/api/projects/${id}`),
  createProject: (d: ProjectInput) => request<Project>("POST", "/api/projects", d),
  updateProject: (id: string, d: Partial<ProjectInput> & { archived?: boolean; resetShareToken?: boolean }) => request<Project>("PATCH", `/api/projects/${id}`, d),
  deleteProject: (id: string) => request<{ ok: true }>("DELETE", `/api/projects/${id}`),
  createTask: (pid: string, d: TaskInput) => request<Task>("POST", `/api/projects/${pid}/tasks`, d),
  updateTask: (id: string, d: Partial<TaskInput> & { position?: number }) => request<Task>("PATCH", `/api/tasks/${id}`, d),
  deleteTask: (id: string) => request<{ ok: true }>("DELETE", `/api/tasks/${id}`),
  listDesigners: () => request<Designer[]>("GET", "/api/designers"),
  createDesigner: (d: { name: string; role: string; email?: string; password?: string }) => request<Designer>("POST", "/api/designers", d),
  updateDesigner: (id: string, d: { name?: string; role?: string; email?: string; password?: string; removeLogin?: boolean }) => request<Designer>("PATCH", `/api/designers/${id}`, d),
  changePassword: (current: string, next: string) => request<{ ok: true }>("POST", "/api/me/password", { current, next }),
  deleteDesigner: (id: string) => request<{ ok: true }>("DELETE", `/api/designers/${id}`),
  addComment: (taskId: string, d: { text: string }) => request<Task>("POST", `/api/tasks/${taskId}/comments`, d),
  deleteComment: (taskId: string, commentId: string) => request<Task>("DELETE", `/api/tasks/${taskId}/comments/${commentId}`),
  addLink: (taskId: string, d: { targetId: string; type: TaskLink["type"]; inverse?: boolean }) => request<Task>("POST", `/api/tasks/${taskId}/links`, d),
  deleteLink: (taskId: string, linkId: string) => request<Task>("DELETE", `/api/tasks/${taskId}/links/${linkId}`),
  searchTasks: (q: string, exclude: string) => request<TaskSearchResult[]>("GET", `/api/task-search?q=${encodeURIComponent(q)}&exclude=${encodeURIComponent(exclude)}`),
  clientView: (token: string) => request<{ project: ClientProject; tasks: ClientTask[] }>("GET", `/api/client/${encodeURIComponent(token)}`),
};
