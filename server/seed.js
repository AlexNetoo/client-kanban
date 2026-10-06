'use strict';
const crypto = require('crypto');

const iso = (offset) => {
  const d = new Date();
  d.setDate(d.getDate() + offset);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

const OWNER_ID = 'owner';

function seedDesigners() {
  return [
    { id: crypto.randomUUID(), name: 'Maya Chen', role: 'Brand designer' },
    { id: crypto.randomUUID(), name: 'Leo Santos', role: 'Product designer' },
    { id: crypto.randomUUID(), name: 'Priya Nair', role: 'Motion & illustration' },
  ];
}

function seed() {
  const designers = seedDesigners();
  const [maya, leo, priya] = designers.map((d) => d.id);
  const now = new Date().toISOString();
  const projects = [];
  const tasks = [];

  const project = (name, client, status, dueOffset, summary, archived = false) => {
    const p = {
      id: crypto.randomUUID(), shareToken: crypto.randomBytes(18).toString('base64url'),
      name, client, status, dueDate: iso(dueOffset), summary, archived, createdAt: now, updatedAt: now,
    };
    projects.push(p);
    return p.id;
  };
  // [title, status, priority, dueOffset|null, description, clientUpdate, privateNotes]
  const nameOf = (id) => (id === OWNER_ID ? 'Admin' : designers.find((d) => d.id === id).name);
  const add = (projectId, rows) => rows.forEach(([title, status, priority, due, description = '', clientUpdate = '', privateNotes = '', assigneeId = '', comments = []]) => {
    tasks.push({
      id: crypto.randomUUID(), projectId, title, status, priority, dueDate: due === null ? '' : iso(due),
      description, clientUpdate, clientUpdateAt: clientUpdate ? now : '', privateNotes, assigneeId,
      comments: comments.map(([authorId, text, hoursAgo]) => ({
        id: crypto.randomUUID(), authorId, authorName: nameOf(authorId), text, createdAt: new Date(Date.now() - hoursAgo * 3600e3).toISOString(),
      })),
      createdAt: now, updatedAt: now,
    });
  });

  const lumen = project('Brand refresh & marketing site', 'Lumen Coffee Roasters', 'active', 21,
    'A refreshed identity and a fast, story-led marketing site for Lumen’s wholesale and retail customers.');
  add(lumen, [
    ['Brand discovery workshop', 'done', 'high', -24, 'Half-day session with founders to define voice, audience and goals.', 'Workshop complete — the brand pillars you approved are guiding every design decision.'],
    ['Logo exploration (3 directions)', 'done', 'high', -14, 'Three concept directions with usage examples.', 'You chose direction B. Thank you for the thoughtful feedback.', 'Founder prefers B but keep C’s wordmark idea in reserve.'],
    ['Colour palette and typography', 'done', 'medium', -8, 'Primary and secondary palettes, type scale, accessibility checks.'],
    ['Homepage design', 'in_review', 'high', 3, 'Desktop and mobile layouts for the homepage.', 'Homepage designs are ready for your review — please send comments by Friday.', 'They tend to comment late. Nudge on Thursday.', maya, [[maya, 'Hero v3 is uploaded. I swapped the photography for the roastery shot they liked.', 30], [OWNER_ID, 'Great. Can we try a tighter headline before sending it over?', 22], [maya, 'Done, see the latest frame.', 5]]],
    ['Product pages template', 'in_progress', 'medium', 8, 'Reusable layout for the 14 single-origin products.', 'Building the template now; first product page preview next week.', '', leo, [[leo, 'Using a 12 column grid so the tasting notes can sit beside the photo on desktop.', 48]]],
    ['Wholesale enquiry form', 'in_progress', 'medium', 10, 'Form with validation and email routing to the sales inbox.', '', 'Need SMTP details from their IT contact — chase.'],
    ['Photography shot list', 'todo', 'low', 12, 'Shot list for roastery and product photography.'],
    ['Site copy review', 'todo', 'medium', 14, 'Client to review and approve final copy.', '', 'Scope risk: third rewrite would be out of scope. Quote extra.'],
    ['Launch checklist and redirects', 'backlog', 'high', 20, 'Redirect map, analytics, performance and accessibility pass.'],
    ['Social media templates', 'backlog', 'low', null, 'Optional add-on: post templates in new brand style.'],
  ]);

  const field = project('Onboarding redesign', 'Fieldnote', 'active', 45,
    'Reducing drop-off in Fieldnote’s first-run experience across iOS, Android and web.');
  add(field, [
    ['Analytics review of current funnel', 'done', 'high', -12, 'Identify where new users abandon setup.', 'Biggest drop-off is the permissions step (38%). That is our first focus.'],
    ['User interviews (6 sessions)', 'in_review', 'high', 2, 'Interview recordings summarised into themes.', 'Interview themes are drafted; we will walk through them on Thursday’s call.'],
    ['Onboarding flow wireframes', 'in_progress', 'high', 9, 'Low-fidelity flows for iOS, Android and web.', 'Wireframes are underway; first version arrives early next week.', 'PM wants a 3-step max — engineering says 4 is realistic.', leo, [[OWNER_ID, 'Aim for 3 steps, but keep a fourth as a fallback for the permissions prompt.', 20]]],
    ['Permissions step copy', 'todo', 'medium', 12, 'Rewrite permission prompts to explain value.'],
    ['Interactive prototype', 'todo', 'medium', 24, 'Clickable prototype for usability testing.'],
    ['Usability test round 1', 'backlog', 'medium', 32, 'Test with 8 new users.'],
    ['Developer handoff specs', 'backlog', 'high', 42, 'Annotated specs and component tokens.'],
  ]);

  const harbor = project('Annual report layout', 'Harbor Foundation', 'active', 9,
    'Design and layout of the 2026 annual report for print and PDF.');
  add(harbor, [
    ['Content audit and outline', 'done', 'medium', -30, 'Agree structure and page count.'],
    ['Cover and chapter openers', 'done', 'high', -18, 'Cover concept plus chapter opener system.', 'Cover approved — thank you!'],
    ['Interior layout: chapters 1–3', 'done', 'high', -9, 'Typeset first three chapters with charts.'],
    ['Interior layout: chapters 4–6', 'in_review', 'high', 2, 'Typeset remaining chapters.', 'Chapters 4–6 are with you for review. Changes in the next 3 days keep us on schedule.'],
    ['Chart and data visualisation polish', 'in_progress', 'medium', 5, 'Accessible colours for all 11 charts.', 'Charts are being updated for colour-blind readers.'],
    ['Print-ready PDF export', 'todo', 'high', 8, 'CMYK export with bleeds, plus a web PDF.', '', 'Printer needs files by the 10th — no slack.', priya],
  ]);

  const green = project('Newsletter template system', 'Greenline Studio', 'completed', -40,
    'A modular email template system delivered and handed off.', true);
  add(green, [
    ['Template modules (12)', 'done', 'high', -60, 'Modular blocks tested across major clients.', 'All 12 modules delivered and tested.'],
    ['Handover documentation', 'done', 'medium', -42, 'Usage guide and recorded walkthrough.', 'Documentation and walkthrough video delivered.'],
  ]);

  // A few sample links so the feature is visible on first launch (by task title, across projects).
  const byTitle = (t) => tasks.find((x) => x.title === t).id;
  const links = [
    ['Product pages template', 'Wholesale enquiry form', 'relates'],
    ['Homepage design', 'Product pages template', 'blocks'],
    ['Print-ready PDF export', 'Chart and data visualisation polish', 'blocks'],
  ].map(([from, to, type]) => ({ id: crypto.randomUUID(), fromId: byTitle(from), toId: byTitle(to), type, createdAt: now }));
  return { projects, tasks, designers, links };
}

module.exports = { seed, seedDesigners, OWNER_ID };
