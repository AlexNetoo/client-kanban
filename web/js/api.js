export class ApiError extends Error {
  constructor(status, message) { super(message); this.status = status; }
}

async function request(method, url, body) {
  let res;
  try {
    res = await fetch(url, {
      method, headers: body !== undefined || method === 'POST' ? { 'Content-Type': 'application/json' } : {},
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
  } catch {
    throw new ApiError(0, 'Can’t reach the server. Check your connection and try again.');
  }
  const data = await res.json().catch(() => ({}));
  if (res.status === 401 && !url.endsWith('/login')) {
    location.replace('/login?expired=1' + location.hash);
    throw new ApiError(401, 'Your session ended. Please sign in again.');
  }
  if (!res.ok) throw new ApiError(res.status, data.error || 'Something went wrong.');
  return data;
}

export const api = {
  session: () => request('GET', '/api/session'),
  logout: () => request('POST', '/api/logout', {}),
  listProjects: () => request('GET', '/api/projects'),
  getProject: (id) => request('GET', `/api/projects/${id}`),
  createProject: (d) => request('POST', '/api/projects', d),
  updateProject: (id, d) => request('PATCH', `/api/projects/${id}`, d),
  deleteProject: (id) => request('DELETE', `/api/projects/${id}`),
  createTask: (pid, d) => request('POST', `/api/projects/${pid}/tasks`, d),
  updateTask: (id, d) => request('PATCH', `/api/tasks/${id}`, d),
  deleteTask: (id) => request('DELETE', `/api/tasks/${id}`),
  clientView: (token) => request('GET', `/api/client/${encodeURIComponent(token)}`),
};
