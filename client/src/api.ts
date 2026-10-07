import { demoRequest, isDemo } from "./demo";
import type { AiAction, ProjectRequest, RequestInput, ClientAccount, ClientProject, ClientTask, Designer, Project, ProjectInput, Task, TaskInput, TaskLink, TaskSearchResult } from "./types";

export interface UploadTarget { url: string; method: string; headers: Record<string, string> }

/** Where this browser last signed in (designers use /designer, everyone else /login), so sign-out and expiry land on the right page. */
export const loginPath = () => { try { return localStorage.getItem("loginPath") === "/designer" ? "/designer" : "/login"; } catch { return "/login"; } };

export class ApiError extends Error {
  constructor(public status: number, message: string) { super(message); }
}

async function request<T>(method: string, url: string, body?: unknown): Promise<T> {
  if (isDemo()) return demoRequest(method, url, body) as Promise<T>; // the demo never touches the server
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
    location.replace(loginPath() + "?expired=1" + location.hash);
    throw new ApiError(401, "Your session ended. Please sign in again.");
  }
  if (!res.ok) throw new ApiError(res.status, (data as { error?: string }).error || "Something went wrong.");
  return data as T;
}

export const api = {
  login: (password: string, opts: { email?: string; as?: "owner" | "designer" | "client" } = {}) => request<{ role: string }>("POST", "/api/login", opts.email ? { email: opts.email, password, as: opts.as } : { password, as: "owner" }),
  session: () => request<{ role: "owner" | "client" | "designer"; designer?: { id: string; name: string }; client?: { id: string; name: string }; expiresAt?: number; maxUploadBytes?: number; ai?: boolean; mail?: boolean; notify?: boolean }>("GET", "/api/session"),
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
  createDesigner: (d: { name: string; role: string; email?: string; password?: string; projectIds?: string[]; sendWelcome?: boolean }) => request<Designer & { emailed?: boolean }>("POST", "/api/designers", d),
  updateDesigner: (id: string, d: { name?: string; role?: string; email?: string; password?: string; removeLogin?: boolean; projectIds?: string[] }) => request<Designer>("PATCH", `/api/designers/${id}`, d),
  changePassword: (current: string, next: string) => request<{ ok: true }>("POST", "/api/me/password", { current, next }),
  deleteDesigner: (id: string) => request<{ ok: true }>("DELETE", `/api/designers/${id}`),
  addComment: (taskId: string, d: { text: string; shared?: boolean }) => request<Task>("POST", `/api/tasks/${taskId}/comments`, d),
  deleteComment: (taskId: string, commentId: string) => request<Task>("DELETE", `/api/tasks/${taskId}/comments/${commentId}`),
  addLink: (taskId: string, d: { targetId: string; type: TaskLink["type"]; inverse?: boolean }) => request<Task>("POST", `/api/tasks/${taskId}/links`, d),
  deleteLink: (taskId: string, linkId: string) => request<Task>("DELETE", `/api/tasks/${taskId}/links/${linkId}`),
  searchTasks: (q: string, exclude: string) => request<TaskSearchResult[]>("GET", `/api/task-search?q=${encodeURIComponent(q)}&exclude=${encodeURIComponent(exclude)}`),
  requestAttachment: (taskId: string, d: { name: string; size: number; type: string; shared?: boolean }) => request<{ attachmentId: string; upload: UploadTarget }>("POST", `/api/tasks/${taskId}/attachments`, d),
  updateAttachment: (taskId: string, attId: string, d: { shared: boolean }) => request<Task>("PATCH", `/api/tasks/${taskId}/attachments/${attId}`, d),
  completeAttachment: (taskId: string, attId: string) => request<Task>("POST", `/api/tasks/${taskId}/attachments/${attId}/complete`, {}),
  deleteAttachment: (taskId: string, attId: string) => request<Task>("DELETE", `/api/tasks/${taskId}/attachments/${attId}`),
  listClients: () => request<ClientAccount[]>("GET", "/api/clients"),
  createClient: (d: { name: string; company?: string; email: string; password?: string; projectIds: string[]; sendWelcome?: boolean }) => request<ClientAccount & { emailed?: boolean }>("POST", "/api/clients", d),
  updateClient: (id: string, d: { name?: string; company?: string; email?: string; password?: string; projectIds?: string[] }) => request<ClientAccount>("PATCH", `/api/clients/${id}`, d),
  deleteClient: (id: string) => request<{ ok: true }>("DELETE", `/api/clients/${id}`),
  listRequests: () => request<ProjectRequest[]>("GET", "/api/requests"),
  createRequest: (d: RequestInput) => request<ProjectRequest>("POST", "/api/requests", d),
  acceptRequest: (id: string) => request<ProjectRequest>("POST", `/api/requests/${id}/accept`, {}),
  declineRequest: (id: string) => request<ProjectRequest>("POST", `/api/requests/${id}/decline`, {}),
  deleteRequest: (id: string) => request<{ ok: true }>("DELETE", `/api/requests/${id}`),
  aiAssist: (projectId: string, message: string, history: { role: "user" | "assistant"; text: string }[]) => request<{ reply: string; actions: AiAction[] }>("POST", "/api/ai/assist", { projectId, message, history }),
  forgotPassword: (email: string) => request<{ ok: true }>("POST", "/api/password/forgot", { email }),
  resetPassword: (token: string, password: string) => request<{ ok: true; signIn: string }>("POST", "/api/password/reset", { token, password }),
  setNotifications: (enabled: boolean) => request<{ notify: boolean }>("PATCH", "/api/me/notifications", { enabled }),
  getTimesheet: (month: string) => request<{ month: string; rate: number; entries: Record<string, { hours: number; note: string }>; hours: number; amount: number }>("GET", `/api/timesheet?month=${month}`),
  saveTimesheetDay: (date: string, d: { hours: number; note: string }) => request<{ date: string; hours: number; note: string }>("PUT", `/api/timesheet/${date}`, d),
  clientView: (token: string) => request<{ project: ClientProject; tasks: ClientTask[] }>("GET", `/api/client/${encodeURIComponent(token)}`),
};

/** PUT a file to its upload target (our server in development, a signed Blob URL in production) with progress. */
export function uploadFile(target: UploadTarget, file: File, onProgress: (fraction: number) => void): Promise<void> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open(target.method, target.url);
    for (const [k, v] of Object.entries(target.headers)) xhr.setRequestHeader(k, v);
    xhr.upload.onprogress = (e) => { if (e.lengthComputable) onProgress(e.loaded / e.total); };
    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) return resolve();
      let msg = "The upload failed.";
      try { msg = JSON.parse(xhr.responseText).error || msg; } catch { /* not JSON (storage error) */ }
      reject(new ApiError(xhr.status, msg));
    };
    xhr.onerror = () => reject(new ApiError(0, "Can’t reach the server. Check your connection and try again."));
    xhr.send(file);
  });
}
