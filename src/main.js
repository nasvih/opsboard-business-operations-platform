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
import { buildNotifications, notifWhen } from './notify.js';

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

/* Two glyphs the shared icon set does not carry, written here in the same
   20x20 stroke style: an arrow leaving a box, and code brackets. Both are
   stroke-only so they inherit currentColor like every other icon. */
const EXTERNAL_ICON = '<svg viewBox="0 0 20 20" aria-hidden="true">'
  + '<path d="M11.5 3.5h5v5"/><path d="M16.5 3.5L9.5 10.5"/>'
  + '<path d="M14.5 11.5v4a1.5 1.5 0 0 1-1.5 1.5H4.5A1.5 1.5 0 0 1 3 15.5V7a1.5 1.5 0 0 1 1.5-1.5h4"/></svg>';

const CODE_ICON = '<svg viewBox="0 0 20 20" aria-hidden="true">'
  + '<path d="M7 6.5L3.5 10 7 13.5"/><path d="M13 6.5L16.5 10 13 13.5"/><path d="M11.2 4.2l-2.4 11.6"/></svg>';

/* The two sidebar chrome controls sit on the brand row and carry no visible
   text, so their glyphs have to say what they do on their own. A panel with a
   chevron for the rail — pointing at the edge it is about to move — and a
   circle half filled for the colour switch. Same 20x20 stroke style as the
   rest of the set, so they inherit currentColor. */
const RAIL_ICON = {
  collapse: '<svg viewBox="0 0 20 20" aria-hidden="true">'
    + '<rect x="2.75" y="3.75" width="14.5" height="12.5" rx="2"/><path d="M8 3.75v12.5"/>'
    + '<path d="M13.6 7.9L11.5 10l2.1 2.1"/></svg>',
  expand: '<svg viewBox="0 0 20 20" aria-hidden="true">'
    + '<rect x="2.75" y="3.75" width="14.5" height="12.5" rx="2"/><path d="M8 3.75v12.5"/>'
    + '<path d="M11.5 7.9L13.6 10l-2.1 2.1"/></svg>',
};
const TONE_ICON = '<svg viewBox="0 0 20 20" aria-hidden="true">'
  + '<circle cx="10" cy="10" r="6.6"/>'
  + '<path d="M10 3.4a6.6 6.6 0 0 1 0 13.2z" fill="currentColor" stroke="none"/></svg>';

/* Topbar controls. Same 20x20 stroke style, all icon-only, all with a
   title and an aria-label: a handset and a monitor for the device preview,
   a moon and a sun for the colour scheme. */
const DEVICE_ICON = {
  phone: '<svg viewBox="0 0 20 20" aria-hidden="true">'
    + '<rect x="5.75" y="2.25" width="8.5" height="15.5" rx="2"/><path d="M8.6 15.4h2.8"/></svg>',
  desktop: '<svg viewBox="0 0 20 20" aria-hidden="true">'
    + '<rect x="2.25" y="3.75" width="15.5" height="10" rx="2"/><path d="M7 17h6M10 13.75V17"/></svg>',
};
const THEME_ICON = {
  moon: '<svg viewBox="0 0 20 20" aria-hidden="true">'
    + '<path d="M16 11.6A6.4 6.4 0 0 1 8.4 4a6.6 6.6 0 1 0 7.6 7.6z"/></svg>',
  sun: '<svg viewBox="0 0 20 20" aria-hidden="true">'
    + '<circle cx="10" cy="10" r="3.6"/>'
    + '<path d="M10 2.4v1.8M10 15.8v1.8M17.6 10h-1.8M4.2 10H2.4M15.4 4.6l-1.3 1.3M5.9 14.1l-1.3 1.3M15.4 15.4l-1.3-1.3M5.9 5.9L4.6 4.6"/></svg>',
};

/* The framed copy of the app, rendered inside the phone preview, is the same
   page with one flag on it: no device toggle of its own, and no second
   service worker registration or install prompt. */
const FRAMED = new URLSearchParams(location.search).get('frame') === 'phone';

/* The colour control never names a colour: the glyph carries it, and the
   accessible name stays neutral while aria-pressed reports the accent tone. */
const TONE_LABEL = 'Sidebar colour';
const railLabel = (railed) => (railed ? 'Expand sidebar' : 'Collapse sidebar');

const SOURCE_URL = 'https://github.com/nasvih/opsboard-business-operations-platform';
const SOURCE_NOTE = 'The source is published so it can be read, run and evaluated, but it is not '
  + 'open source: copying, modifying, redistributing, deploying it or using it as training data '
  + 'needs written permission. See the LICENSE file in the repository.';

/* One "opens in a new tab" link, used in the sidebar footer and the About modal. */
function outLink(url, label, iconHtml, cls = 'btn btn--block') {
  return h('a', {
    class: cls, href: url, target: '_blank', rel: 'noopener noreferrer',
    title: label, 'aria-label': `${label} — opens in a new tab`,
  }, h('span', { html: iconHtml }).firstChild, h('span', {}, label));
}

const TITLES = Object.fromEntries(NAV.map((n) => [n.id, n.label]));
const app = qs('#app');
let current = 'overview';
let nav;

/* ---------- sidebar chrome (rail + tone), remembered per browser ---------- */

const CHROME_KEY = 'opsboard.chrome.v1';
/* the rail is a desktop idea; under 900px the sidebar is a drawer and stays one */
const DESKTOP = window.matchMedia('(min-width:901px)');

/* The brand accent is the default navigation. A stored preference always wins —
   including an explicit `false`, which is how the plain white sidebar is kept.
   `theme` is null until the reader chooses one, and null means "follow the
   operating system". `read` holds the notification ids already seen. */
const CHROME_DEFAULT = { rail: false, tone: true, theme: null, read: [] };

const chrome = (() => {
  try {
    const raw = localStorage.getItem(CHROME_KEY);
    if (!raw) return { ...CHROME_DEFAULT, read: [] };
    const saved = JSON.parse(raw) || {};
    return {
      rail: saved.rail === true,
      tone: saved.tone === undefined ? CHROME_DEFAULT.tone : saved.tone === true,
      theme: saved.theme === 'dark' || saved.theme === 'light' ? saved.theme : null,
      read: Array.isArray(saved.read) ? saved.read.slice(-400) : [],
    };
  } catch (_) { return { ...CHROME_DEFAULT, read: [] }; }
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
    const label = railLabel(chrome.rail);
    rail.setAttribute('aria-pressed', String(chrome.rail));
    rail.setAttribute('aria-label', label);
    rail.title = label;
    /* the span stays for the same reason the nav links keep theirs: the kit
       clips it out of sight in the brand row but it keeps the markup uniform */
    rail.innerHTML = `${chrome.rail ? RAIL_ICON.expand : RAIL_ICON.collapse}<span>${label}</span>`;
  }
  const tone = qs('[data-chrome="tone"]');
  if (tone) {
    tone.setAttribute('aria-pressed', String(chrome.tone));
    tone.setAttribute('aria-label', TONE_LABEL);
    tone.title = TONE_LABEL;
  }
}

function setChrome(key, value) {
  chrome[key] = value;
  saveChrome();
  applyChrome();
}

DESKTOP.addEventListener('change', applyChrome);

/* ---------- colour scheme ---------- */

/* First visit follows the operating system; once the button is pressed the
   choice is stored and the system is ignored. The accent fill keeps white text
   on it in both schemes — that pairing is fixed, not themed. */
const DARKQ = window.matchMedia('(prefers-color-scheme:dark)');
const isDark = () => chrome.theme === 'dark';

function applyTheme() {
  const dark = isDark();
  document.documentElement.setAttribute('data-theme', dark ? 'dark' : 'light');
  const meta = qs('meta[name="theme-color"]');
  if (meta) meta.setAttribute('content', dark ? '#141517' : '#0B7D74');
  const btn = qs('[data-tool="theme"]');
  if (btn) {
    const label = dark ? 'Switch to light mode' : 'Switch to dark mode';
    btn.setAttribute('aria-pressed', String(dark));
    btn.setAttribute('aria-label', label);
    btn.title = label;
    btn.innerHTML = dark ? THEME_ICON.sun : THEME_ICON.moon;
  }
}

DARKQ.addEventListener('change', () => { if (!chrome.theme) applyTheme(); });

/* ---------- notifications ---------- */

const readSet = () => new Set(chrome.read);

function markRead(id) {
  if (chrome.read.includes(id)) return;
  chrome.read.push(id);
  if (chrome.read.length > 400) chrome.read = chrome.read.slice(-400);
  saveChrome();
  paintBell();
  paintNotifPanel();
}

function markAllRead() {
  const ids = buildNotifications(activeWorkspace()).map((n) => n.id);
  let added = 0;
  ids.forEach((id) => { if (!chrome.read.includes(id)) { chrome.read.push(id); added += 1; } });
  if (!added) return;
  if (chrome.read.length > 400) chrome.read = chrome.read.slice(-400);
  saveChrome();
  paintBell();
  paintNotifPanel();
  toast(`${added} ${added === 1 ? 'notification' : 'notifications'} marked read`, 'ok');
}

function paintBell() {
  const btn = qs('[data-tool="notify"]');
  const badge = qs('[data-badge]');
  if (!btn || !badge) return;
  const read = readSet();
  const count = buildNotifications(activeWorkspace()).filter((n) => !read.has(n.id)).length;
  badge.textContent = count > 9 ? '9+' : String(count);
  badge.hidden = count === 0;
  const label = count
    ? `Notifications, ${count} unread`
    : 'Notifications, nothing unread';
  btn.setAttribute('aria-label', label);
  btn.title = label;
}

function paintNotifPanel() {
  const panel = qs('.notifpanel');
  if (!panel || panel.hidden) return;
  const ws = activeWorkspace();
  const items = buildNotifications(ws);
  const read = readSet();
  const unread = items.filter((n) => !read.has(n.id)).length;

  panel.innerHTML = '';
  panel.appendChild(h('header', { class: 'notifpanel__head' },
    h('div', { style: 'min-width:0' },
      h('h3', {}, 'Notifications'),
      h('div', { class: 'label truncate' }, `${ws.name} · ${unread} unread`)),
    unread
      ? h('button', { class: 'btn btn--sm', onclick: markAllRead }, 'Mark all read')
      : null));

  if (!items.length) {
    panel.appendChild(h('div', { class: 'notifempty' },
      h('h4', {}, 'Nothing needs attention'),
      h('p', { class: 'muted small' },
        `No invoice in ${ws.name} is past due, no deal is closing this week and the plan still has seats. `
        + 'Overdue money, deals reaching their close date, a full plan and anything the team changes all arrive here.')));
    return;
  }

  const list = h('ul', { class: 'notiflist' });
  items.forEach((n) => {
    const seen = read.has(n.id);
    list.appendChild(h('li', { class: `notifitem${seen ? '' : ' is-unread'}` },
      h('button', {
        class: 'notifitem__go', type: 'button',
        'aria-label': `${n.title}. Open ${TITLES[n.nav] || n.nav}.`,
        onclick: () => { markRead(n.id); toggleNotif(false); showScreen(n.nav); },
      },
      h('div', { class: 'notifitem__top' },
        h('span', { class: `pill${n.kind ? ` pill--${n.kind}` : ''}` }, n.tag),
        h('span', { class: 'faint small mono' }, notifWhen(n))),
      h('div', { class: 'notifitem__title' }, n.title),
      h('p', { class: 'muted small' }, n.line)),
      seen
        ? h('span', { class: 'notifitem__seen label' }, 'read')
        : h('button', {
          class: 'btn btn--sm btn--ghost notifitem__read', type: 'button',
          title: 'Mark read', 'aria-label': `Mark "${n.title}" read`,
          onclick: () => markRead(n.id),
        }, iconEl('check'))));
  });
  panel.appendChild(list);
  panel.appendChild(h('p', { class: 'notifpanel__foot small faint' },
    'Built from this workspace as it stands. Read marks are kept in this browser.'));
}

function toggleNotif(force) {
  const panel = qs('.notifpanel');
  const btn = qs('[data-tool="notify"]');
  if (!panel || !btn) return;
  const open = force === undefined ? panel.hidden : force;
  panel.hidden = !open;
  btn.setAttribute('aria-expanded', String(open));
  if (open) paintNotifPanel();
}

function notifControl() {
  const badge = h('span', { class: 'bellbadge mono', dataset: { badge: '1' }, hidden: true, 'aria-hidden': 'true' });
  const btn = h('button', {
    class: 'btn btn--ghost btn--icon bellbtn', type: 'button', dataset: { tool: 'notify' },
    'aria-haspopup': 'dialog', 'aria-expanded': 'false',
    'aria-label': 'Notifications', title: 'Notifications',
    onclick: (e) => { e.stopPropagation(); toggleNotif(); },
  }, h('span', { html: icon('bell') }).firstChild, badge);
  const panel = h('div', {
    class: 'notifpanel', role: 'dialog', 'aria-label': 'Notifications', hidden: true,
    onclick: (e) => e.stopPropagation(),
  });
  return h('div', { class: 'notif', dataset: { notif: '1' } }, btn, panel);
}

document.addEventListener('click', (e) => {
  if (!e.target.closest || !e.target.closest('[data-notif]')) toggleNotif(false);
});

/* ---------- device preview ---------- */

/* Phone mode renders the app inside an iframe of itself at 390x844, so the
   real breakpoints apply rather than a scaled-down picture of the desktop. */
function setDeviceButtons(on) {
  const p = qs('[data-device="phone"]');
  const d = qs('[data-device="desktop"]');
  if (p) p.setAttribute('aria-pressed', String(on));
  if (d) d.setAttribute('aria-pressed', String(!on));
}

function fitPhone() {
  const phone = qs('.phone');
  if (!phone) return;
  const room = window.innerHeight - 132;
  const scale = Math.min(1, Math.max(0.42, room / 880));
  phone.style.transform = `scale(${scale.toFixed(3)})`;
  phone.style.marginBottom = `${Math.round(880 * (scale - 1))}px`;
}

function closeStage() {
  const stage = qs('.stage');
  if (!stage) return;
  stage.remove();
  document.body.classList.remove('is-staged');
  document.removeEventListener('keydown', stageKey);
  window.removeEventListener('resize', fitPhone);
  setDeviceButtons(false);
  const btn = qs('[data-device="phone"]');
  if (btn) btn.focus();
}

function stageKey(e) { if (e.key === 'Escape') closeStage(); }

function openStage() {
  if (qs('.stage')) return;
  const back = h('button', {
    class: 'btn btn--dark', type: 'button', onclick: closeStage,
  }, h('span', { html: DEVICE_ICON.desktop }).firstChild, h('span', {}, 'Back to desktop'));

  const frame = h('iframe', {
    class: 'phone__screen',
    title: 'Opsboard at phone size',
    src: `./index.html?frame=phone${location.hash || '#/overview'}`,
    loading: 'eager',
  });

  const stage = h('div', { class: 'stage', role: 'dialog', 'aria-label': 'Phone preview' },
    h('div', { class: 'stage__bar' },
      h('div', { style: 'min-width:0' },
        h('div', { class: 'stage__name' }, 'Opsboard'),
        h('div', { class: 'stage__size label' }, '390 × 844 · the app running inside a frame')),
      back),
    h('div', { class: 'phone' }, h('div', { class: 'phone__notch' }), frame));

  document.body.appendChild(stage);
  document.body.classList.add('is-staged');
  document.addEventListener('keydown', stageKey);
  window.addEventListener('resize', fitPhone);
  fitPhone();
  setDeviceButtons(true);
  back.focus();
}

function deviceControl() {
  return h('div', { class: 'devswitch', role: 'group', 'aria-label': 'Preview size' },
    h('button', {
      class: 'btn btn--ghost btn--icon', type: 'button', dataset: { device: 'phone' },
      'aria-pressed': 'false', 'aria-label': 'Preview at phone size', title: 'Preview at phone size',
      onclick: openStage,
    }, h('span', { html: DEVICE_ICON.phone }).firstChild),
    h('button', {
      class: 'btn btn--ghost btn--icon', type: 'button', dataset: { device: 'desktop' },
      'aria-pressed': 'true', 'aria-label': 'Desktop view', title: 'Desktop view',
      onclick: closeStage,
    }, h('span', { html: DEVICE_ICON.desktop }).firstChild));
}

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
      'The assistant is simulated. Opsboard Copilot reads this app\'s own demo data, and can change it '
        + 'when you ask. It is a demonstration of the interaction, not a connected model.',
      'The topbar carries a bell for notifications built from these same records, a phone preview that '
        + 'runs the app inside a 390-wide frame, and a dark mode. All three remember what you chose.',
    ],
  },
];

/* Worked examples for the About modal: the sentence in, the change out. Names
   are read from the workspace that is actually open, so they can be copied
   into the copilot and will work as written. */
function aboutExamples() {
  const ws = activeWorkspace();
  const account = (ws.customers[0] || { name: 'an account' }).name;
  const deal = openDeals(ws)[0];
  const dealAccount = deal ? (ws.customers.find((c) => c.id === deal.customerId) || { name: account }).name : account;
  const late = overdueInvoices(ws)[0] || ws.invoices[0];
  return [
    [`Move the ${dealAccount} deal to negotiation`, 'the card changes stage on the pipeline board and the open pipeline total moves with it'],
    [`Log a note on ${account}: they asked for 45 day terms`, 'the note appears at the top of that account\'s drawer, filed under your name'],
    [late ? `Mark ${late.number} paid` : 'Mark the oldest overdue invoice paid', 'status becomes paid, outstanding drops by the invoice amount, the aging bars redraw'],
    [`Flag ${account} as at risk`, 'the status pill changes and the account joins the at-risk list'],
    ['Invite Priya Menon as an admin', 'a pending invite on the Team screen and one more seat used'],
    [`New deal for ${account}, 4 lakh, proposal stage`, 'a new card in Proposal worth ₹4,00,000, owned by the account owner'],
  ];
}

function aboutModal() {
  const body = h('div', { class: 'about' },
    ABOUT.map((block) => h('section', { class: 'about__block' },
      h('h4', {}, block.title),
      block.text ? h('p', { class: 'muted' }, block.text) : null,
      block.list
        ? h('ul', { class: 'about__list' }, block.list.map((line) => h('li', { class: 'muted' }, line)))
        : null)));

  /* what to type, and what it does — the copilot's six actions */
  body.appendChild(h('section', { class: 'about__block' },
    h('h4', {}, 'What you can ask the copilot to do'),
    h('p', { class: 'muted' }, 'It shows you the record it matched and waits for you to press the button. '
      + 'Nothing is written until you do. Type any of these into the copilot, bottom right.'),
    h('ul', { class: 'about__ex' }, aboutExamples().map(([say, does]) => h('li', {},
      h('span', { class: 'about__say mono' }, say),
      h('span', { class: 'about__does muted' }, does))))));
  /* sits under the fourth block, saying the same thing the LICENSE file does */
  body.appendChild(h('div', { class: 'about__source' },
    h('p', { class: 'muted' }, SOURCE_NOTE),
    outLink(SOURCE_URL, 'Source on GitHub', CODE_ICON, 'btn btn--sm')));
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
        h('div', { class: 'side__tag' }, 'Operations platform')),
      /* rail and colour live on the brand row: icon-only, right-aligned, and
         stacked by the kit when the sidebar narrows to the rail */
      h('div', { class: 'side__brandbtns' },
        h('button', {
          class: 'btn btn--sm', type: 'button', dataset: { chrome: 'rail' },
          'aria-pressed': 'false', 'aria-controls': 'sidebar',
          title: railLabel(false), 'aria-label': railLabel(false),
          onclick: () => setChrome('rail', !chrome.rail),
        }, h('span', { html: RAIL_ICON.collapse }).firstChild, h('span', {}, railLabel(false))),
        h('button', {
          class: 'btn btn--sm', type: 'button', dataset: { chrome: 'tone' },
          'aria-pressed': 'false', 'aria-controls': 'sidebar',
          title: TONE_LABEL, 'aria-label': TONE_LABEL,
          onclick: () => setChrome('tone', !chrome.tone),
        }, h('span', { html: TONE_ICON }).firstChild, h('span', {}, TONE_LABEL)))));

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

  /* Footer, two rows: the two outward links, then install and reset. About
     this demo lives in the topbar now, not here. The paired rows share their
     width and truncate rather than overflow, and the kit stacks them back
     into a column in the rail. */
  side.appendChild(h('div', { class: 'side__foot stack' },
    /* the author's site — the one inverted control in the sidebar, so it reads
       as an exit from the demo whichever colour the sidebar is wearing. The
       repository link beside it stays an ordinary outline control. */
    /* paired rows run at the small size — it is what initPWA builds its own
       control at, so Install and Reset match, and it keeps nasvih.in whole */
    h('div', { class: 'side__pair' },
      outLink('https://www.nasvih.in', 'nasvih.in', EXTERNAL_ICON, 'btn btn--block btn--sm btn--site'),
      outLink(SOURCE_URL, 'GitHub', CODE_ICON, 'btn btn--block btn--sm')),
    /* initPWA puts its control at the head of this row, and only when the
       browser actually offers an install; while it is absent or hidden the
       row holds one item and Reset takes the full width on its own */
    h('div', { class: 'side__pair side__pwa' },
      h('button', {
        /* label in a span so the rail can hide it; title keeps it readable there */
        class: 'btn btn--block btn--sm', title: 'Reset demo data', 'aria-label': 'Reset demo data',
        onclick: async () => {
          const ok = await confirmDialog('All three workspaces will be regenerated from the seed. Every edit you have made in this browser will be lost.',
            { title: 'Reset demo data', danger: true, okLabel: 'Reset everything' });
          if (!ok) return;
          resetDemo();
          toast('Demo data reset', 'ok');
          paint(true);
        },
      }, iconEl('refresh'), h('span', {}, 'Reset demo data'))),
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
    /* three icon-only controls, then the demo notice as a real button.
       The framed copy inside the phone preview leaves the device switch out
       so the preview cannot open a preview. */
    h('div', { class: 'topbar__tools' },
      FRAMED ? null : deviceControl(),
      notifControl(),
      h('button', {
        class: 'btn btn--ghost btn--icon', type: 'button', dataset: { tool: 'theme' },
        'aria-pressed': 'false', 'aria-label': 'Switch to dark mode', title: 'Switch to dark mode',
        html: THEME_ICON.moon,
        onclick: () => { chrome.theme = isDark() ? 'light' : 'dark'; saveChrome(); applyTheme(); },
      })),
    h('button', {
      class: 'pill pill--amber pill--btn',
      title: 'Demo build: all records are generated locally and stored in this browser only. Open for details.',
      'aria-label': 'About this demo',
      onclick: aboutModal,
    }, 'About this demo'));
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
  paintBell();
  paintNotifPanel();
}

/* Used by the copilot after it applies a change, and by a notification when
   it is opened: put the screen the change landed on in front of the reader. */
function showScreen(id) {
  if (!TITLES[id]) return;
  if (current === id) { paint(false); return; }
  location.hash = `#/${id}`;
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
applyTheme();

const routes = Object.fromEntries(NAV.map((n) => [n.id, n]));
const r = router(routes, (name) => {
  current = name;
  paint(true);
});
r.go();

/* one launcher, bottom right, plus the Cmd/Ctrl+K the assistant binds itself.
   `show` is how an applied action brings its screen to the front. */
createCopilot({ show: showScreen }).mount(document.body);

/* installable: registers the service worker and, where the browser allows it,
   puts an "Install app" control in the sidebar footer. iOS has no prompt
   event, so the instructions arrive through the app's own toast. initPWA
   appends, so the control is moved to the head of the row it shares with
   Reset — hidden it takes no space at all, so the row never gaps.
   The framed copy inside the phone preview skips all of it: one page, one
   service worker registration, one install prompt. */
const installBtn = FRAMED ? null : initPWA({
  mount: qs('.side__pwa'),
  appName: 'Opsboard',
  onNote: (msg) => toast(msg, 'info'),
});
if (installBtn) installBtn.parentNode.insertBefore(installBtn, installBtn.parentNode.firstChild);

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
