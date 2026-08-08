/* ============================================================
   Opsboard — small shared view parts used by more than one screen.
   Kept out of main.js so views never import from the boot module.
   ============================================================ */

import { h, icon, money } from '../lib/ui.js';
import { currencySymbol } from './data.js';

/* Money in the active workspace currency. */
export const wsMoney = (ws, n) => money(n, currencySymbol(ws.currency));

/* "1 invoice" / "4 invoices" — status lines read badly without it. */
export const plural = (n, one, many) => `${n} ${n === 1 ? one : many || `${one}s`}`;

/* An inline stroke icon as a real DOM node. */
export function iconEl(name, cls = '') {
  return h('span', { html: icon(name, cls) }).firstChild;
}

/* Status pill with a word, never colour alone. */
const PILL_KIND = {
  active: 'ok', paid: 'ok', won: 'ok', 'at-risk': 'warn', sent: 'info',
  overdue: 'bad', lost: 'bad', dormant: '', draft: '', invited: 'amber',
  qualify: '', proposal: 'info', negotiation: 'warn',
};
export function statusPill(value, label) {
  const kind = PILL_KIND[value] || '';
  return h('span', { class: `pill${kind ? ` pill--${kind}` : ''}` }, label || value);
}

export function pageHead(title, sub, actions) {
  return h('div', { class: 'page-head' },
    h('div', { style: 'flex:1;min-width:0' }, h('h1', {}, title), sub ? h('p', {}, sub) : null),
    actions ? h('div', { class: 'btnrow' }, actions) : null);
}

export function statCard(label, value, delta, accent) {
  return h('div', { class: `stat${accent ? ' stat--accent' : ''}` },
    h('div', { class: 'stat__label' }, label),
    h('div', { class: 'stat__value' }, value),
    delta ? h('div', { class: 'stat__delta' }, delta) : null);
}

export function emptyState(title, line) {
  return h('div', { class: 'empty' }, h('h3', {}, title), h('p', {}, line));
}

export function searchBox(placeholder, value, onInput) {
  const input = h('input', {
    class: 'input', type: 'search', value: value || '', placeholder,
    'aria-label': placeholder, dataset: { search: '1' },
    oninput: (e) => onInput(e.target.value),
  });
  return h('div', { class: 'search' }, iconEl('search'), input);
}

export function selectFilter(label, options, value, onChange) {
  return h('label', { class: 'filterbox' },
    h('span', { class: 'label' }, label),
    h('select', {
      class: 'select', 'aria-label': label,
      onchange: (e) => onChange(e.target.value),
    }, options.map((o) => h('option', { value: o.value, selected: o.value === value }, o.label))));
}

/* Right-hand detail drawer. Returns { close }. Escape and scrim both close. */
export function openDrawer({ title, sub, body, footer }) {
  const scrim = h('div', { class: 'scrim scrim--drawer' });
  const panel = h('aside', { class: 'drawer', role: 'dialog', 'aria-modal': 'true', 'aria-label': title });
  const close = () => { scrim.remove(); document.removeEventListener('keydown', onKey); };
  const onKey = (e) => { if (e.key === 'Escape') close(); };

  panel.appendChild(h('header', { class: 'drawer__head' },
    h('div', { style: 'flex:1;min-width:0' },
      h('h2', { class: 'truncate', style: 'font-size:16px' }, title),
      sub ? h('div', { class: 'label' }, sub) : null),
    h('button', {
      class: 'btn btn--ghost btn--icon', 'aria-label': 'Close panel',
      onclick: close, html: icon('x'),
    })));
  const bodyEl = h('div', { class: 'drawer__body' });
  if (body) bodyEl.appendChild(body);
  panel.appendChild(bodyEl);
  if (footer) panel.appendChild(h('div', { class: 'drawer__foot' }, footer));

  scrim.appendChild(panel);
  scrim.addEventListener('click', (e) => { if (e.target === scrim) close(); });
  document.addEventListener('keydown', onKey);
  document.body.appendChild(scrim);
  setTimeout(() => panel.querySelector('button, a, input, select')?.focus(), 20);
  return { close, body: bodyEl };
}

/* Definition rows inside drawers and settings cards. */
export function defList(rows) {
  return h('dl', { class: 'deflist' }, rows.filter(Boolean).map(([k, v]) => [
    h('dt', {}, k),
    h('dd', {}, v instanceof Node ? v : String(v)),
  ]));
}

export function sectionTitle(text, right) {
  return h('div', { class: 'between', style: 'margin:18px 0 10px' },
    h('h3', {}, text), right || null);
}
