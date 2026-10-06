import { h, stateBlock } from './dom.js';
import { api } from './api.js';
import { dashboardView } from './dashboard.js';
import { boardView } from './board.js';
import { clientView } from './client.js';

const root = document.getElementById('root');
let session;
let main;

function shell() {
  main = h('main', { id: 'main', tabindex: '-1' });
  root.replaceChildren(
    h('header', { class: 'site-header' }, h('div', { class: 'inner' },
      h('a', { class: 'brand', href: session.role === 'owner' ? '#/' : '#' }, h('img', { src: '/favicon.svg', alt: '', width: 28, height: 28 }), 'Project Hub'),
      h('button', {
        class: 'btn btn-sm', type: 'button',
        onclick: async () => { try { await api.logout(); } finally { location.replace('/login'); } },
      }, 'Sign out'))),
    main);
}

let renderId = 0;
async function route() {
  const hash = location.hash.replace(/^#/, '') || '/';
  const id = ++renderId; // ignore results of superseded renders
  const [, kind, param] = hash.split('/');
  main.replaceChildren();
  if (kind === 'c' && param) await clientView(main, decodeURIComponent(param), session.role);
  else if (session.role === 'client') {
    document.title = 'Project Hub';
    main.replaceChildren(stateBlock({ title: 'Open your project link', message: 'Use the link your freelancer sent you to see your project’s progress.' }));
  } else if (kind === 'p' && param) await boardView(main, decodeURIComponent(param));
  else await dashboardView(main);
  if (id === renderId) { window.scrollTo(0, 0); }
}

(async function boot() {
  try { session = await api.session(); } catch { return; }
  shell();
  window.addEventListener('hashchange', route);
  route();
})();
