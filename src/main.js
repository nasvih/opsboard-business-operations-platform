/* ============================================================
   Opsboard — boot: store, shell, workspace switcher, router, copilot.
   ============================================================ */

import { h, qs, icon, toast, confirmDialog, modal, num, router } from '../lib/ui.js';
import {
  store, activeWorkspace, setWorkspace, WORKSPACE_IDS, openDeals,
  overdueInvoices, seatsUsed, resetDemo,
} from './data.js';
import { createCopilot } from './agent.js';
import { initPWA } from '../lib/pwa.js';
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

/* arrow leaving a box — the shared icon set has no "external link" glyph,
   so it is written here in the same 20x20 stroke style as the rest */
const EXTERNAL_ICON = '<svg viewBox="0 0 20 20" aria-hidden="true">'
  + '<path d="M11.5 3.5h5v5"/><path d="M16.5 3.5L9.5 10.5"/>'
  + '<path d="M14.5 11.5v4a1.5 1.5 0 0 1-1.5 1.5H4.5A1.5 1.5 0 0 1 3 15.5V7a1.5 1.5 0 0 1 1.5-1.5h4"/></svg>';

const TITLES = Object.fromEntries(NAV.map((n) => [n.id, n.label]));
const app = qs('#app');
let current = 'overview';
let nav;

/* ---------- sidebar chrome (rail + tone), remembered per browser ---------- */

const CHROME_KEY = 'opsboard.chrome.v1';
/* the rail is a desktop idea; under 900px the sidebar is a drawer and stays one */
const DESKTOP = window.matchMedia('(min-width:901px)');

/* Brand yellow is the default navigation. A stored preference always wins —
   including an explicit `false`, which is how the plain white sidebar is kept. */
const CHROME_DEFAULT = { rail: false, tone: true };

const chrome = (() => {
  try {
    const raw = localStorage.getItem(CHROME_KEY);
    if (!raw) return { ...CHROME_DEFAULT };
    const saved = JSON.parse(raw) || {};
    return {
      rail: saved.rail === true,
      tone: saved.tone === undefined ? CHROME_DEFAULT.tone : saved.tone === true,
    };
  } catch (_) { return { ...CHROME_DEFAULT }; }
})();

function saveChrome() {
  try { localStorage.setItem(CHROME_KEY, JSON.stringify(chrome)); } catch (_) { /* storage full or blocked */ }
}

function applyChrome() {
  app.classList.toggle('is-rail', chrome.rail && DESKTOP.matches);
  if (nav) {
    if (chrome.tone) nav.side.setAttribute('data-tone', 'amber');
    else nav.side.removeAttribute('data-tone');
  }
  const rail = qs('[data-chrome="rail"]');
  if (rail) {
    const label = chrome.rail ? 'Expand the sidebar' : 'Collapse the sidebar to icons';
    rail.setAttribute('aria-pressed', String(chrome.rail));
    rail.setAttribute('aria-label', label);
    rail.title = label;
    const text = qs('span', rail);
    if (text) text.textContent = chrome.rail ? 'Expand' : 'Collapse';
  }
  const tone = qs('[data-chrome="tone"]');
  if (tone) {
    const label = chrome.tone ? 'Use the default sidebar colour' : 'Switch the sidebar to brand yellow';
    tone.setAttribute('aria-pressed', String(chrome.tone));
    tone.setAttribute('aria-label', label);
    tone.title = label;
  }
}

function setChrome(key, value) {
  chrome[key] = value;
  saveChrome();
  applyChrome();
}

DESKTOP.addEventListener('change', applyChrome);

/* ---------- about this demo ---------- */

const ABOUT = [
  {
    title: 'What this is',
    text: 'Opsboard is the operations core of a business: one workspace holding its customers, its '
      + 'deal pipeline, its invoices, its team and their roles, and the reports built from all of it. '
      + 'Switch workspace in the sidebar and every screen, count and total re-scopes to that business.',
  },
  {
    title: 'Where it helps a business',
    list: [
      'The customer list, the pipeline and the invoice ledger stop living in three separate spreadsheets.',
      'Money that is overdue is visible on the invoices screen without anyone compiling a report first.',
      'A new joiner gets an account with a role instead of being handed a shared login.',
      'Several businesses or branches run on one deployment rather than a separate system each.',
      'Reports read the same records staff work in every day, so the numbers cannot drift apart.',
    ],
  },
  {
    title: 'How it would work for real',
    text: 'The interface and the workflow would stay as they are here. Behind them, the browser storage '
      + 'is replaced by a real database, sign-in and permissions become accounts rather than a picker, '
      + 'and hosting, backups and access control are set up properly. This demo is the interface and the '
      + 'workflow, not the production system.',
  },
  {
    title: 'How this demo works',
    list: [
      'You can actually use it. Add a customer or a deal, move a deal a stage, mark an invoice paid, '
        + 'invite someone — every flow runs and the other screens follow.',
      'Your data stays in this browser. Nothing is sent to a server, and "Reset demo data" clears it. '
        + 'It does not sync between browsers or devices.',
      'The assistant is simulated. Opsboard Copilot reads this app\'s own demo data. It is a '
        + 'demonstration of the interaction, not a connected model.',
    ],
  },
];

function aboutModal() {
  const body = h('div', { class: 'about' },
    ABOUT.map((block) => h('section', { class: 'about__block' },
      h('h4', {}, block.title),
      block.text ? h('p', { class: 'muted' }, block.text) : null,
      block.list
        ? h('ul', { class: 'about__list' }, block.list.map((line) => h('li', { class: 'muted' }, line)))
        : null)));
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
        /* title and aria-label carry the name once the rail hides the text */
        class: 'navlink', type: 'button', dataset: { nav: item.id },
        title: item.label, 'aria-label': item.label,
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
    h('div', { class: 'side__toggles' },
      h('button', {
        class: 'btn btn--sm', type: 'button', dataset: { chrome: 'rail' },
        'aria-pressed': 'false', 'aria-controls': 'sidebar',
        onclick: () => setChrome('rail', !chrome.rail),
      }, iconEl('table'), h('span', {}, 'Collapse')),
      h('button', {
        class: 'btn btn--sm', type: 'button', dataset: { chrome: 'tone' },
        'aria-pressed': 'false', 'aria-controls': 'sidebar',
        onclick: () => setChrome('tone', !chrome.tone),
      }, iconEl('tag'), h('span', {}, 'Yellow'))),
    /* the install control is added here by initPWA, only when installing is
       actually possible; the slot collapses while it is empty */
    h('div', { class: 'side__pwa' }),
    h('button', {
      /* label in a span so the rail can hide it; title keeps it readable there */
      class: 'btn btn--block', title: 'Reset demo data', 'aria-label': 'Reset demo data',
      onclick: async () => {
        const ok = await confirmDialog('All three workspaces will be regenerated from the seed. Every edit you have made in this browser will be lost.',
          { title: 'Reset demo data', danger: true, okLabel: 'Reset everything' });
        if (!ok) return;
        resetDemo();
        toast('Demo data reset', 'ok');
        paint(true);
      },
    }, iconEl('refresh'), h('span', {}, 'Reset demo data')),
    h('button', {
      class: 'btn btn--ghost btn--block', title: 'About this demo', 'aria-label': 'About this demo',
      onclick: aboutModal,
    }, iconEl('eye'), h('span', {}, 'About this demo')),
    h('a', {
      /* the author's site — the one dark control in the sidebar, so it reads
         as an exit from the demo whichever colour the sidebar is wearing */
      class: 'btn btn--block btn--site', href: 'https://www.nasvih.in',
      target: '_blank', rel: 'noopener noreferrer',
      title: 'nasvih.in', 'aria-label': 'nasvih.in — opens in a new tab',
    }, h('span', { html: EXTERNAL_ICON }).firstChild, h('span', {}, 'nasvih.in')),
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
    }, 'Demo'));
  /* The copilot has exactly one entry point: the round launcher the assistant
     mounts bottom-right, plus its own Cmd/Ctrl+K shortcut. No topbar twin. */

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
      /* the list needs room the 64px rail does not have, so picking a
         workspace from the rail expands the sidebar first */
      if (app.classList.contains('is-rail')) { setChrome('rail', false); }
      const open = box.classList.toggle('is-open');
      btn.setAttribute('aria-expanded', String(open));
    },
  });
  const list = h('ul', { class: 'wsw__list', role: 'listbox', 'aria-label': 'Choose workspace' });

  const paintSwitcher = () => {
    const ws = activeWorkspace();
    btn.innerHTML = '';
    btn.title = `Workspace: ${ws.name}. Choose another.`;
    btn.setAttribute('aria-label', `Workspace: ${ws.name}. Choose another.`);
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
applyChrome();

const routes = Object.fromEntries(NAV.map((n) => [n.id, n]));
const r = router(routes, (name) => {
  current = name;
  paint(true);
});
r.go();

/* one launcher, bottom right, plus the Cmd/Ctrl+K the assistant binds itself */
createCopilot().mount(document.body);

/* installable: registers the service worker and, where the browser allows it,
   puts an "Install app" control in the sidebar footer. iOS has no prompt
   event, so the instructions arrive through the app's own toast. */
initPWA({
  mount: qs('.side__pwa'),
  appName: 'Opsboard',
  onNote: (msg) => toast(msg, 'info'),
});

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
