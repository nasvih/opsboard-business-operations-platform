/* Customers — searchable account table with a detail drawer. */

import { h, fmtDate, ago, modal, toast, downloadCSV, on } from '../../lib/ui.js';
import {
  store, SEGMENTS, CUSTOMER_STATUS, logActivity, stageLabel, invoiceAgeDays,
} from '../data.js';
import {
  pageHead, statusPill, searchBox, selectFilter, openDrawer, defList,
  emptyState, wsMoney, iconEl,
} from '../parts.js';

const ui = { q: '', segment: 'all', status: 'all', sort: 'name' };

function matches(c, ws) {
  const q = ui.q.trim().toLowerCase();
  if (q && !(`${c.name} ${c.contactName} ${c.owner} ${c.segment}`.toLowerCase().includes(q))) return false;
  if (ui.segment !== 'all' && c.segment !== ui.segment) return false;
  if (ui.status !== 'all' && c.status !== ui.status) return false;
  return true;
}

function customerValue(ws, c) {
  return ws.invoices.filter((i) => i.customerId === c.id && i.status === 'paid').reduce((t, i) => t + i.amount, 0);
}

export function render(ctx) {
  const { ws, rerender } = ctx;
  const money = (n) => wsMoney(ws, n);
  const root = h('div', { class: 'view view--pad' });

  root.appendChild(pageHead('Customers',
    `${ws.customers.length} accounts in ${ws.name}. Search, filter, then open a row for contacts, notes and linked deals.`,
    [
      h('button', {
        class: 'btn',
        onclick: () => {
          const rows = [['Account', 'Segment', 'Owner', 'Status', 'Contact', 'Email', 'Phone', 'Lifetime value']];
          list.forEach((c) => rows.push([c.name, c.segment, c.owner, c.status, c.contactName, c.contactEmail, c.contactPhone, customerValue(ws, c)]));
          downloadCSV(`opsboard-customers-${ws.id}.csv`, rows);
          toast('Customer list exported as CSV', 'ok');
        },
      }, iconEl('download'), 'Export CSV'),
      h('button', { class: 'btn btn--primary', onclick: () => newCustomer(ctx) }, iconEl('plus'), 'New customer'),
    ]));

  /* filter bar */
  const bar = h('div', { class: 'filterbar' },
    searchBox('Search accounts, contacts or owners', ui.q, (v) => { ui.q = v; rerender({ keepFocus: true }); }),
    selectFilter('Segment', [{ value: 'all', label: 'All segments' }].concat(SEGMENTS.map((s) => ({ value: s, label: s }))), ui.segment, (v) => { ui.segment = v; rerender(); }),
    selectFilter('Status', [{ value: 'all', label: 'All statuses' }].concat(CUSTOMER_STATUS.map((s) => ({ value: s, label: s }))), ui.status, (v) => { ui.status = v; rerender(); }),
    selectFilter('Sort', [
      { value: 'name', label: 'Name' },
      { value: 'value', label: 'Lifetime value' },
      { value: 'recent', label: 'Last order' },
    ], ui.sort, (v) => { ui.sort = v; rerender(); }));
  root.appendChild(bar);

  let list = ws.customers.filter((c) => matches(c, ws));
  if (ui.sort === 'name') list.sort((a, b) => a.name.localeCompare(b.name));
  if (ui.sort === 'value') list.sort((a, b) => customerValue(ws, b) - customerValue(ws, a));
  if (ui.sort === 'recent') list.sort((a, b) => new Date(b.lastOrder) - new Date(a.lastOrder));

  root.appendChild(h('p', { class: 'small faint mono', style: 'margin:10px 0' },
    `${list.length} of ${ws.customers.length} accounts shown`));

  if (!list.length) {
    root.appendChild(emptyState('No accounts match', 'Clear the search box or pick a different segment.'));
    return root;
  }

  const table = h('table', { class: 'data' },
    h('thead', {}, h('tr', {},
      h('th', {}, 'Account'),
      h('th', {}, 'Segment'),
      h('th', {}, 'Owner'),
      h('th', {}, 'Status'),
      h('th', {}, 'Last order'),
      h('th', { class: 'right' }, 'Lifetime value'),
      h('th', { class: 'right' }, 'Open'))),
    h('tbody', {}, list.map((c) => h('tr', { dataset: { id: c.id } },
      h('td', {},
        h('div', { style: 'font-weight:600' }, c.name),
        h('div', { class: 'faint small' }, `${c.contactName} · ${c.city}`)),
      h('td', {}, h('span', { class: 'chip', style: 'cursor:default' }, c.segment)),
      h('td', {}, c.owner),
      h('td', {}, statusPill(c.status)),
      h('td', { class: 'mono small' }, ago(c.lastOrder)),
      h('td', { class: 'right num' }, money(customerValue(ws, c))),
      h('td', { class: 'right' }, h('button', {
        class: 'btn btn--sm', dataset: { open: c.id },
        'aria-label': `Open ${c.name}`,
      }, 'Details'))))));

  const wrap = h('div', { class: 'tablewrap tablewrap--scroll' }, table);
  on(wrap, 'click', '[data-open]', (e, t) => openCustomer(ctx, t.dataset.open));
  root.appendChild(wrap);
  return root;
}

/* ---------- detail drawer ---------- */

function openCustomer(ctx, id) {
  const { ws, rerender } = ctx;
  const c = ws.customers.find((x) => x.id === id);
  if (!c) return;
  const money = (n) => wsMoney(ws, n);

  const body = h('div', { class: 'stack' });

  body.appendChild(h('div', { class: 'row' },
    statusPill(c.status),
    h('span', { class: 'chip', style: 'cursor:default' }, c.segment),
    h('span', { class: 'faint small mono' }, `Since ${fmtDate(c.since)}`)));

  body.appendChild(defList([
    ['Owner', c.owner],
    ['Contact', c.contactName],
    ['Email', h('a', { class: 'linkish', href: `mailto:${c.contactEmail}` }, c.contactEmail)],
    ['Phone', h('span', { class: 'mono' }, c.contactPhone)],
    ['Credit terms', `${c.creditDays} days`],
    ['Last order', `${fmtDate(c.lastOrder)} (${ago(c.lastOrder)})`],
    ['Lifetime value', h('span', { class: 'num' }, money(customerValue(ws, c)))],
  ]));

  /* status change */
  const statusSel = h('select', {
    class: 'select', 'aria-label': 'Account status',
    onchange: (e) => {
      const next = e.target.value;
      store.update((s) => {
        const target = s.workspaces[ws.id].customers.find((x) => x.id === c.id);
        if (target) target.status = next;
      });
      logActivity(ws.id, 'customer', `${c.name} marked ${next}`);
      toast(`${c.name} is now ${next}`, 'ok');
      rerender();
    },
  }, CUSTOMER_STATUS.map((s) => h('option', { value: s, selected: s === c.status }, s)));
  body.appendChild(h('label', { class: 'field' }, h('span', { class: 'field__label' }, 'Account status'), statusSel));

  /* linked deals */
  const deals = ws.deals.filter((d) => d.customerId === c.id);
  body.appendChild(h('h3', { style: 'margin-top:6px' }, `Linked deals (${deals.length})`));
  body.appendChild(deals.length
    ? h('ul', { class: 'itemlist' }, deals.map((d) => h('li', {},
      h('div', { style: 'flex:1;min-width:0' },
        h('div', { class: 'truncate' }, d.title),
        h('div', { class: 'faint small mono' }, `${stageLabel(d.stage)} · ${d.owner}`)),
      h('span', { class: 'num' }, money(d.value)))))
    : h('p', { class: 'muted small' }, 'No deals recorded against this account.'));

  /* invoices */
  const invs = ws.invoices.filter((i) => i.customerId === c.id);
  const openInv = invs.filter((i) => i.status === 'sent' || i.status === 'overdue');
  body.appendChild(h('h3', { style: 'margin-top:6px' }, `Invoices (${invs.length})`));
  body.appendChild(h('p', { class: 'small muted' },
    `${openInv.length} open worth ${money(openInv.reduce((t, i) => t + i.amount, 0))}. ` +
    `${invs.filter((i) => i.status === 'overdue').length} overdue.`));
  if (invs.length) {
    body.appendChild(h('ul', { class: 'itemlist' }, invs.slice(0, 5).map((i) => h('li', {},
      h('div', { style: 'flex:1;min-width:0' },
        h('div', { class: 'mono small' }, i.number),
        h('div', { class: 'faint small' }, i.status === 'overdue' ? `${invoiceAgeDays(i)} days past due` : `Due ${fmtDate(i.dueAt)}`)),
      statusPill(i.status),
      h('span', { class: 'num' }, money(i.amount))))));
  }

  /* notes */
  body.appendChild(h('h3', { style: 'margin-top:6px' }, `Notes (${c.notes.length})`));
  const noteList = h('ul', { class: 'notelist' });
  const paintNotes = () => {
    const fresh = store.state.workspaces[ws.id].customers.find((x) => x.id === c.id);
    noteList.innerHTML = '';
    if (!fresh.notes.length) noteList.appendChild(h('li', { class: 'muted small' }, 'No notes yet.'));
    fresh.notes.forEach((n) => noteList.appendChild(h('li', {},
      h('p', {}, n.text),
      h('div', { class: 'faint small mono' }, `${n.by} · ${ago(n.at)}`))));
  };
  paintNotes();
  body.appendChild(noteList);

  const noteInput = h('textarea', { class: 'textarea', placeholder: 'Add a note for the team…', 'aria-label': 'New note' });
  body.appendChild(h('div', { class: 'field' }, h('span', { class: 'field__label' }, 'Add note'), noteInput));

  const drawer = openDrawer({
    title: c.name,
    sub: `${c.segment} · owner ${c.owner}`,
    body,
    footer: [
      h('button', { class: 'btn', onclick: () => drawer.close() }, 'Close'),
      h('button', {
        class: 'btn btn--primary',
        onclick: () => {
          const text = noteInput.value.trim();
          if (!text) { toast('Write something first', 'bad'); return; }
          store.update((s) => {
            const target = s.workspaces[ws.id].customers.find((x) => x.id === c.id);
            target.notes.unshift({
              id: `n${Date.now().toString(36)}`,
              at: new Date().toISOString(),
              by: s.user.name,
              text,
            });
          });
          logActivity(ws.id, 'note', `Note added on ${c.name}`);
          noteInput.value = '';
          paintNotes();
          toast('Note saved', 'ok');
          rerender();
        },
      }, iconEl('plus'), 'Save note'),
    ],
  });
}

/* ---------- create ---------- */

function newCustomer(ctx) {
  const { ws, rerender } = ctx;
  const owners = ws.members.filter((m) => m.status === 'active').map((m) => m.name);
  const form = h('div', {},
    h('label', { class: 'field' }, h('span', { class: 'field__label' }, 'Account name'),
      h('input', { class: 'input', dataset: { f: 'name' }, placeholder: 'e.g. Ernakulam Supply Co' })),
    h('label', { class: 'field' }, h('span', { class: 'field__label' }, 'Primary contact'),
      h('input', { class: 'input', dataset: { f: 'contact' }, placeholder: 'Full name' })),
    h('label', { class: 'field' }, h('span', { class: 'field__label' }, 'Segment'),
      h('select', { class: 'select', dataset: { f: 'segment' } }, SEGMENTS.map((s) => h('option', { value: s }, s)))),
    h('label', { class: 'field' }, h('span', { class: 'field__label' }, 'Owner'),
      h('select', { class: 'select', dataset: { f: 'owner' } }, owners.map((o) => h('option', { value: o }, o)))),
    h('label', { class: 'field' }, h('span', { class: 'field__label' }, 'Credit terms (days)'),
      h('select', { class: 'select', dataset: { f: 'credit' } }, [15, 30, 45, 60].map((d) => h('option', { value: d, selected: d === 30 }, `${d} days`)))),
    h('p', { class: 'hint' }, 'Saved to this workspace only, in your browser.'));

  modal({
    title: 'New customer',
    body: form,
    actions: [
      { label: 'Cancel' },
      {
        label: 'Create account',
        class: 'btn--primary',
        onClick: (bodyEl) => {
          const get = (f) => bodyEl.querySelector(`[data-f="${f}"]`).value.trim();
          const name = get('name');
          const contact = get('contact') || 'Not recorded';
          if (!name) { toast('An account needs a name', 'bad'); return true; }
          const slug = name.toLowerCase().replace(/[^a-z0-9]+/g, '').slice(0, 20);
          store.update((s) => {
            s.workspaces[ws.id].customers.unshift({
              id: `${ws.id}-c${Date.now().toString(36)}`,
              ws: ws.id,
              name,
              segment: get('segment'),
              owner: get('owner'),
              status: 'active',
              city: ws.city,
              contactName: contact,
              contactEmail: `${contact.split(' ')[0].toLowerCase()}@${slug || 'account'}.example`,
              contactPhone: '—',
              since: new Date().toISOString(),
              lastOrder: new Date().toISOString(),
              creditDays: Number(get('credit')),
              notes: [],
            });
          });
          logActivity(ws.id, 'customer', `Customer created — ${name}`);
          toast(`${name} added`, 'ok');
          rerender();
        },
      },
    ],
  });
}
