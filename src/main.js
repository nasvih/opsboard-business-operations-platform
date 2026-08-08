/* ============================================================
   Opsboard — boot: store, shell, workspace switcher, router, copilot.
   ============================================================ */

import { h, qs, icon, toast, confirmDialog, modal, num, router } from '../lib/ui.js';
import {
  store, activeWorkspace, setWorkspace, WORKSPACE_IDS, openDeals,
  overdueInvoices, seatsUsed, resetDemo,
} from './data.js';
import { createCopilot } from './agent.js';
import { iconEl } from './parts.js';

import * as overview from './views/overview.js';
import * as customers from './views/customers.js';
import * as deals from './views/deals.js';
import * as invoices from './views/invoices.js';
import * as team from './views/team.js';
import * as reports from './views/reports.js';
import * as settings from './views/settings.js';

const NAV = [
  { id: 'overview', label: 'Overview', icon: 'home', group: 'Workspace', view: overview },
  { id: 'customers', label: 'Customers', icon: 'users', group: 'Workspace', view: customers, count: (ws) => ws.customers.length },
  { id: 'deals', label: 'Deals', icon: 'bolt', group: 'Revenue', view: deals, count: (ws) => openDeals(ws).length },
  { id: 'invoices', label: 'Invoices', icon: 'file', group: 'Revenue', view: invoices, count: (ws) => overdueInvoices(ws).length || null },
  { id: 'reports', label: 'Reports', icon: 'chart', group: 'Revenue', view: reports },
  { id: 'team', label: 'Team and roles', icon: 'shield', group: 'Administration', view: team, count: (ws) => seatsUsed(ws) },
  { id: 'settings', label: 'Settings', icon: 'cog', group: 'Administration', view: settings },
];

const TITLES = Object.fromEntries(NAV.map((n) => [n.id, n.label]));
const app = qs('#app');
let current = 'overview';
let nav;

/* ---------- about this demo ---------- */

const ABOUT = [
  ['You can actually use it',
    'Nothing here is read-only. Create customers and deals, move a deal to another stage, mark an '
    + 'invoice paid, invite someone, change a permission. Every flow runs for real and the numbers on '
    + 'the other screens move with it.'],
  ['Your data stays on your machine',
    'Everything you enter is saved in this browser\'s local storage. Nothing is sent to a server, '
    + 'there is no account and no backend. Clear your browser data, or use "Reset demo data", and it '
    + 'is all gone. It does not sync between browsers or devices.'],
  ['The assistant is simulated',
    'Opsboard Copilot answers by matching your question against this app\'s own demo data. It is a '
    + 'demonstration of the interaction, not a connected AI model, and no request leaves your browser.'],
];

function aboutModal() {
  const body = h('div', { class: 'about' },
    ABOUT.map(([title, text]) => h('section', { class: 'about__block' },
      h('h4', {}, title),
      h('p', { class: 'muted' }, text))));
  modal({
    title: 'About this demo',
    body,
    width: '560px',
    actions: [{ label: 'Got it', class: 'btn--primary' }],
  });
}

/* ---------- shell ---------- */

function buildShell() {
  app.innerHTML = '';

  /* sidebar */
  const side = h('aside', { class: 'side', id: 'sidebar' },
    h('div', { class: 'side__brand' },
      h('span', { class: 'mark' }, 'OB'),
      h('div', { style: 'min-width:0' },
        h('div', { class: 'side__name' }, 'Opsboard'),
        h('div', { class: 'side__tag' }, 'Operations platform'))));

  side.appendChild(workspaceSwitcher());

  const navEl = h('nav', { class: 'side__nav', 'aria-label': 'Main' });
  const groups = [];
  NAV.forEach((item) => {
    let g = groups.find((x) => x.name === item.group);
    if (!g) { g = { name: item.group, items: [] }; groups.push(g); }
    g.items.push(item);
  });
  groups.forEach((g) => {
    const box = h('div', { class: 'navgroup' }, h('div', { class: 'navgroup__label' }, g.name));
    g.items.forEach((item) => {
      box.appendChild(h('button', {
        class: 'navlink', type: 'button', dataset: { nav: item.id },
        onclick: () => { location.hash = `#/${item.id}`; closeSidebar(); },
      },
      iconEl(item.icon),
      h('span', { style: 'flex:1' }, item.label),
      h('span', { class: 'navlink__count mono', dataset: { count: item.id } }, '')));
    });
    navEl.appendChild(box);
  });
  side.appendChild(navEl);

  side.appendChild(h('div', { class: 'side__foot stack' },
    h('button', {
      class: 'btn btn--block',
      onclick: async () => {
        const ok = await confirmDialog('All three workspaces will be regenerated from the seed. Every edit you have made in this browser will be lost.',
          { title: 'Reset demo data', danger: true, okLabel: 'Reset everything' });
        if (!ok) return;
        resetDemo();
        toast('Demo data reset', 'ok');
        paint(true);
      },
    }, iconEl('refresh'), 'Reset demo data'),
    h('button', { class: 'btn btn--ghost btn--block', onclick: aboutModal },
      iconEl('eye'), 'About this demo'),
    h('p', { class: 'side__note' },
      'Sample data only. Saved in this browser, never sent anywhere.')));

  /* main */
  const main = h('div', { class: 'main' });
  const topbar = h('header', { class: 'topbar' },
    h('button', {
      class: 'btn btn--ghost btn--icon sidebtn', 'aria-label': 'Open navigation',
      'aria-controls': 'sidebar', 'aria-expanded': 'false',
      onclick: toggleSidebar, html: icon('menu'),
    }),
    h('div', { style: 'min-width:0' },
      h('div', { class: 'topbar__title', dataset: { title: '1' } }, 'Overview'),
      h('div', { class: 'topbar__sub', dataset: { subtitle: '1' } }, '')),
    h('div', { class: 'spacer' }),
    h('button', {
      class: 'pill pill--amber pill--btn',
      title: 'Demo build: all records are generated locally and stored in this browser only. Open for details.',
      'aria-label': 'About this demo',
      onclick: aboutModal,
    }, 'Demo'),
    h('button', {
      class: 'btn btn--sm', 'aria-label': 'Open the Opsboard Copilot',
      onclick: () => window.__opsboardCopilot && window.__opsboardCopilot.toggle(true),
    }, iconEl('spark'), h('span', { class: 'hide-sm' }, 'Copilot'), h('span', { class: 'kbd hide-sm' }, '⌘K')));

  const viewHost = h('main', { class: 'viewhost', id: 'main-view', tabindex: '-1' });
  /* on narrow screens, tapping the content area closes the slide-over nav */
  main.addEventListener('click', (e) => {
    if (e.target.closest && e.target.closest('.sidebtn')) return;
    if (nav && nav.side.classList.contains('is-open')) closeSidebar();
  });
  main.append(topbar, viewHost);
  app.append(side, main);

  nav = { side, viewHost, topbar };
}

function workspaceSwitcher() {
  const box = h('div', { class: 'wsw' });
  const btn = h('button', {
    class: 'wsw__btn', type: 'button', 'aria-haspopup': 'listbox', 'aria-expanded': 'false',
    onclick: () => {
      const open = box.classList.toggle('is-open');
      btn.setAttribute('aria-expanded', String(open));
    },
  });
  const list = h('ul', { class: 'wsw__list', role: 'listbox', 'aria-label': 'Choose workspace' });

  const paintSwitcher = () => {
    const ws = activeWorkspace();
    btn.innerHTML = '';
    btn.append(
      h('span', { class: 'avatar avatar--amber' }, ws.short),
      h('span', { class: 'wsw__meta' },
        h('span', { class: 'wsw__name truncate' }, ws.name),
        h('span', { class: 'wsw__sub' }, `${ws.city} · ${ws.plan} plan`)),
      iconEl('arrowRight', 'wsw__chev'));
    list.innerHTML = '';
    WORKSPACE_IDS.forEach((id) => {
      const w = store.state.workspaces[id];
      const isOn = id === store.state.activeWs;
      list.appendChild(h('li', { role: 'none' }, h('button', {
        class: `wsw__opt${isOn ? ' is-on' : ''}`, type: 'button', role: 'option',
        'aria-selected': String(isOn),
        onclick: () => {
          setWorkspace(id);
          box.classList.remove('is-open');
          btn.setAttribute('aria-expanded', 'false');
          paintSwitcher();
          paint(true);
          toast(`Switched to ${w.name}`, 'ok');
        },
      },
      h('span', { class: 'avatar' }, w.short),
      h('span', { class: 'wsw__meta' },
        h('span', { class: 'wsw__name truncate' }, w.name),
        h('span', { class: 'wsw__sub mono' }, `${w.customers.length} accounts · ${w.members.length} people`)),
      isOn ? iconEl('check', 'wsw__chev') : null)));
    });
  };

  document.addEventListener('click', (e) => {
    if (!box.contains(e.target)) { box.classList.remove('is-open'); btn.setAttribute('aria-expanded', 'false'); }
  });

  box.append(h('div', { class: 'label wsw__label' }, 'Workspace'), btn, list);
  paintSwitcher();
  box.dataset.switcher = '1';
  box._paint = paintSwitcher;
  return box;
}

function toggleSidebar() {
  const open = nav.side.classList.toggle('is-open');
  const btn = qs('.sidebtn');
  if (btn) btn.setAttribute('aria-expanded', String(open));
}
function closeSidebar() {
  nav.side.classList.remove('is-open');
  const btn = qs('.sidebtn');
  if (btn) btn.setAttribute('aria-expanded', 'false');
}

/* ---------- painting ---------- */

function paintChrome() {
  const ws = activeWorkspace();
  NAV.forEach((item) => {
    const link = qs(`[data-nav="${item.id}"]`);
    if (!link) return;
    link.classList.toggle('is-active', item.id === current);
    if (item.id === current) link.setAttribute('aria-current', 'page'); else link.removeAttribute('aria-current');
    const c = qs(`[data-count="${item.id}"]`, link);
    const value = item.count ? item.count(ws) : null;
    if (c) c.textContent = value === null || value === undefined ? '' : num(value);
  });
  const t = qs('[data-title]');
  const s = qs('[data-subtitle]');
  if (t) t.textContent = TITLES[current] || 'Overview';
  if (s) s.textContent = ws.name;
  const sw = qs('[data-switcher]');
  if (sw && sw._paint) sw._paint();
}

function paint(full) {
  const ws = activeWorkspace();
  const item = NAV.find((n) => n.id === current) || NAV[0];
  const ctx = {
    ws,
    state: store.state,
    navigate: (id) => { location.hash = `#/${id}`; },
    rerender: (opts = {}) => {
      const focused = document.activeElement;
      const wasSearch = focused && focused.dataset && focused.dataset.search === '1';
      const caret = wasSearch ? focused.selectionStart : null;
      paint(opts.full);
      if (opts.keepFocus && wasSearch) {
        const next = qs('[data-search="1"]', nav.viewHost);
        if (next) { next.focus(); try { next.setSelectionRange(caret, caret); } catch (_) { /* type has no selection */ } }
      }
    },
  };
  nav.viewHost.innerHTML = '';
  try {
    nav.viewHost.appendChild(item.view.render(ctx));
  } catch (err) {
    nav.viewHost.appendChild(h('div', { class: 'view view--pad' },
      h('div', { class: 'empty' },
        h('h3', {}, 'That screen could not be drawn'),
        h('p', {}, 'Reset the demo data from the sidebar to rebuild the workspace.'))));
  }
  paintChrome();
  if (full) window.scrollTo({ top: 0 });
}

/* ---------- boot ---------- */

buildShell();

const routes = Object.fromEntries(NAV.map((n) => [n.id, n]));
const r = router(routes, (name) => {
  current = name;
  paint(true);
});
r.go();

const copilot = createCopilot().mount(document.body);
window.__opsboardCopilot = copilot;

/* keyboard: / focuses the first search box, Alt+1..7 jumps between screens */
document.addEventListener('keydown', (e) => {
  const typing = /^(INPUT|TEXTAREA|SELECT)$/.test((e.target.tagName || '')) || e.target.isContentEditable;
  if (e.key === '/' && !typing && !e.metaKey && !e.ctrlKey) {
    const box = qs('[data-search="1"]', nav.viewHost);
    if (box) { e.preventDefault(); box.focus(); }
  }
  if (e.altKey && /^[1-7]$/.test(e.key)) {
    const item = NAV[Number(e.key) - 1];
    if (item) { e.preventDefault(); location.hash = `#/${item.id}`; }
  }
  if (e.key === 'Escape') closeSidebar();
});

/* keep the sidebar counters honest when any screen writes to the store */
store.subscribe(() => paintChrome());
