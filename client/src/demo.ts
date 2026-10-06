import type { Column, Comment, Priority, Project, Task, TaskLink } from "./types";

/**
 * Demo mode (/demo): a sample client project for a website design and development engagement.
 * It runs entirely in the browser: requests are answered from the data below and never reach the server, so it
 * needs no account, can't touch real data, and resets on reload. It behaves like a client account: read-only
 * board and tasks, comments allowed.
 */
export const isDemo = () => /^\/demo\/?$/.test(location.pathname);

const day = (offset: number) => {
  const d = new Date(); d.setDate(d.getDate() + offset);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};
const ago = (hours: number) => new Date(Date.now() - hours * 3600e3).toISOString();

const PID = "demo-project";
const DESIGNERS = [
  { id: "d-maya", name: "Maya Chen", role: "Brand & UI designer" },
  { id: "d-leo", name: "Leo Santos", role: "Front-end developer" },
  { id: "d-priya", name: "Priya Nair", role: "Motion & illustration" },
];
const ME = { id: "demo-client", name: "Jordan Reyes" };

type Row = [id: string, title: string, status: Column, priority: Priority, due: number | null, assignee: string, description: string, clientUpdate?: string];
const ROWS: Row[] = [
  ["t1", "Discovery workshop & project goals", "done", "high", -34, "d-maya", "Half-day session with the Northwind team to agree goals, audience, success metrics and scope.", "Workshop complete. The goals and success metrics you approved guide every decision from here."],
  ["t2", "Content & competitor audit", "done", "medium", -28, "d-maya", "Review of the current site, six competitors and the existing content to decide what stays, moves or goes."],
  ["t3", "Sitemap & user flows", "done", "high", -22, "d-maya", "Page structure and the key journeys: enquiry, portfolio browsing and booking a call.", "Sitemap signed off: 14 pages, two main conversion paths."],
  ["t4", "Brand direction & moodboards", "done", "medium", -18, "d-priya", "Typography, colour and imagery direction for the new site, built from the Northwind identity."],
  ["t5", "Homepage design (desktop + mobile)", "in_review", "high", 2, "d-maya", "Full homepage in both breakpoints: hero, services, featured work, testimonials, call to action.", "Homepage designs are ready for your review. Please send comments by Friday so we can start the build on Monday."],
  ["t6", "Design system & UI kit", "in_review", "medium", 4, "d-maya", "Reusable components, spacing and states so every page stays consistent and fast to build."],
  ["t7", "Services & case study templates", "in_progress", "high", 9, "d-maya", "Templates for the services pages and project case studies, including image galleries and results blocks.", "First service page design arrives early next week."],
  ["t8", "Responsive front-end build (Next.js)", "in_progress", "high", 20, "d-leo", "Component library and page build in Next.js with accessible, keyboard-friendly navigation.", "The header, footer and homepage sections are built and running on a staging link."],
  ["t9", "CMS setup & content model", "in_progress", "medium", 14, "d-leo", "Headless CMS with editable pages, projects and testimonials, so the team can update the site without a developer."],
  ["t10", "Motion & micro-interactions", "todo", "low", 24, "d-priya", "Subtle page transitions and hover states that support the brand without slowing the site down."],
  ["t11", "Content migration & copy edit", "todo", "medium", 26, "d-leo", "Move approved copy and images into the CMS and prepare redirects from the old URLs."],
  ["t12", "SEO: metadata, redirects & sitemap", "todo", "medium", 30, "d-leo", "Page titles, descriptions, structured data and a clean redirect map so search rankings carry over."],
  ["t13", "Contact form & analytics", "todo", "medium", 32, "d-leo", "Enquiry form with spam protection and email routing, plus privacy-friendly analytics and goal tracking."],
  ["t14", "Performance & accessibility pass", "backlog", "high", 36, "", "Core Web Vitals tuning and a WCAG 2.2 AA review across templates before launch."],
  ["t15", "Cross-browser & device QA", "backlog", "medium", 38, "", "Testing on current browsers and real phones and tablets, with a bug list reviewed together."],
  ["t16", "Launch plan & go-live checklist", "backlog", "high", 42, "", "DNS, redirects, backups, monitoring and a rollback plan for a calm launch day."],
  ["t17", "Post-launch support (30 days)", "backlog", "low", 72, "", "A month of fixes and small tweaks after the site goes live, with a handover session for the team."],
];

const LINKS: [string, string, TaskLink["type"]][] = [
  ["t5", "t7", "blocks"], ["t6", "t8", "blocks"], ["t9", "t11", "blocks"], ["t12", "t16", "relates"],
];

const comment = (id: string, authorName: string, authorRole: Comment["authorRole"], text: string, hours: number): Comment =>
  ({ id, authorId: authorRole === "client" ? ME.id : authorRole === "owner" ? "owner" : "d-maya", authorName, authorRole, visibility: "client", text, createdAt: ago(hours) });

const COMMENTS: Record<string, Comment[]> = {
  t5: [
    comment("c1", "Maya Chen", "designer", "Homepage v1 is up. I led with your strongest project in the hero, and the services block is now three clear cards.", 30),
    comment("c2", "Jordan Reyes", "client", "Love the direction. Could the headline be a bit more direct about what Northwind does?", 22),
    comment("c3", "Admin", "owner", "Good call. Maya will send two headline options tomorrow.", 20),
  ],
  t8: [comment("c4", "Leo Santos", "designer", "Staging link is live. The page loads in under a second on a typical connection.", 8)],
};

const state = { tasks: [] as Task[], links: LINKS, counter: 100 };

function build() {
  const rows = ROWS.map(([id, title, status, priority, due, assignee, description, clientUpdate]): Task => ({
    id, projectId: PID, title, description, status, priority, dueDate: due === null ? "" : day(due), assigneeId: assignee,
    clientUpdate: clientUpdate ?? "", clientUpdateAt: clientUpdate ? ago(48) : "", privateNotes: "",
    comments: COMMENTS[id] ?? [], links: [], attachments: [], createdAt: ago(24 * 40), updatedAt: ago(26),
  }));
  state.tasks = rows;
}
build();

const linksFor = (id: string): TaskLink[] => {
  const out: TaskLink[] = [];
  state.links.forEach(([from, to, type], i) => {
    const outgoing = from === id; if (!outgoing && to !== id) return;
    const other = state.tasks.find((t) => t.id === (outgoing ? to : from))!;
    const label = { relates: ["relates to", "relates to"], blocks: ["blocks", "is blocked by"], duplicates: ["duplicates", "is duplicated by"] }[type][outgoing ? 0 : 1];
    out.push({ id: `l${i}`, type, label, task: { id: other.id, title: other.title, status: other.status, projectId: PID, projectName: projectView().name } });
  });
  return out;
};

const taskView = (t: Task): Task => ({ ...t, links: linksFor(t.id) });

function projectView(): Project {
  const counts = { backlog: 0, todo: 0, in_progress: 0, in_review: 0, done: 0 } as Record<Column, number>;
  state.tasks.forEach((t) => { counts[t.status] += 1; });
  const total = state.tasks.length;
  return {
    id: PID, shareToken: "", name: "Website redesign & development", client: "Northwind Studio", status: "active", dueDate: day(46), recurring: false,
    summary: "A new brand-led marketing site for Northwind Studio: strategy, design, a responsive build on a headless CMS, SEO and launch.",
    archived: false, createdAt: ago(24 * 40), updatedAt: ago(2), counts, total, progress: total ? Math.round((counts.done / total) * 100) : 0,
  };
}

const fail = (status: number, message: string) => Object.assign(new Error(message), { status });
const clone = <T,>(v: T): T => JSON.parse(JSON.stringify(v));

/** Answers the API calls a client account makes. Anything else is refused, like a real client's 403. */
export async function demoRequest(method: string, url: string, body?: unknown): Promise<unknown> {
  await new Promise((r) => setTimeout(r, 120)); // so loading states are visible, like a real network
  const path = new URL(url, "http://demo").pathname;
  const json = (body ?? {}) as Record<string, unknown>;
  let m: RegExpMatchArray | null;

  if (method === "GET" && path === "/api/session") return { role: "client", client: ME, expiresAt: Date.now() + 864e5, maxUploadBytes: 0 };
  if (method === "POST" && path === "/api/logout") return { ok: true };
  if (method === "GET" && path === "/api/projects") { const { shareToken, ...p } = projectView(); void shareToken; return [p]; }
  if (method === "GET" && (m = path.match(/^\/api\/projects\/([^/]+)$/))) {
    if (m[1] !== PID) throw fail(404, "Project not found");
    const { shareToken, ...project } = projectView(); void shareToken;
    return clone({ project, tasks: state.tasks.map(taskView) });
  }
  if (method === "GET" && path === "/api/designers") return clone(DESIGNERS);
  if (method === "POST" && (m = path.match(/^\/api\/tasks\/([^/]+)\/comments$/))) {
    const t = state.tasks.find((x) => x.id === m![1]); if (!t) throw fail(404, "Task not found");
    const text = typeof json.text === "string" ? json.text.trim() : "";
    if (!text) throw fail(400, "text is required");
    t.comments = [...t.comments, { id: `c${++state.counter}`, authorId: ME.id, authorName: ME.name, authorRole: "client", visibility: "client", text: text.slice(0, 1000), createdAt: new Date().toISOString() }];
    return clone(taskView(t));
  }
  if (method === "DELETE" && (m = path.match(/^\/api\/tasks\/([^/]+)\/comments\/([^/]+)$/))) {
    const t = state.tasks.find((x) => x.id === m![1]); const c = t?.comments.find((x) => x.id === m![2]);
    if (!t || !c) throw fail(404, "Comment not found");
    if (c.authorId !== ME.id) throw fail(403, "You can only delete your own comments");
    t.comments = t.comments.filter((x) => x.id !== c.id);
    return clone(taskView(t));
  }
  throw fail(403, "That isn’t available in the demo. In your own account the team manages this.");
}
