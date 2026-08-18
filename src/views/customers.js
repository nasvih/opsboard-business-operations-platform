/* Customers — searchable account table with a detail drawer. */

import { h, fmtDate, ago, modal, toast, downloadCSV, on } from '../../lib/ui.js';
import {
  store, SEGMENTS, CUSTOMER_STATUS, logActivity, stageLabel, invoiceAgeDays,
  segmentLabel, statusLabel, noteText, dealTitle,
} from '../data.js';
import { t } from '../main.js';
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

  root.appendChild(pageHead(t('customers.title'),
    t('customers.sub', { n: ws.customers.length, name: ws.name }),
    [
      h('button', {
        class: 'btn',
        onclick: () => {
          const rows = [t('customers.csvHead')];
          list.forEach((c) => rows.push([c.name, segmentLabel(c.segment), c.owner, statusLabel(c.status), c.contactName, c.contactEmail, c.contactPhone, customerValue(ws, c)]));
          downloadCSV(`opsboard-customers-${ws.id}.csv`, rows);
          toast(t('customers.exported'), 'ok');
        },
      }, iconEl('download'), t('common.exportCsv')),
      h('button', { class: 'btn btn--primary', onclick: () => newCustomer(ctx) }, iconEl('plus'), t('customers.new')),
    ]));

  /* filter bar */
  const bar = h('div', { class: 'filterbar' },
    searchBox(t('customers.search'), ui.q, (v) => { ui.q = v; rerender({ keepFocus: true }); }),
    selectFilter(t('customers.segment'), [{ value: 'all', label: t('customers.allSegments') }].concat(SEGMENTS.map((s) => ({ value: s, label: segmentLabel(s) }))), ui.segment, (v) => { ui.segment = v; rerender(); }),
    selectFilter(t('customers.status'), [{ value: 'all', label: t('customers.allStatuses') }].concat(CUSTOMER_STATUS.map((s) => ({ value: s, label: statusLabel(s) }))), ui.status, (v) => { ui.status = v; rerender(); }),
    selectFilter(t('customers.sort'), [
      { value: 'name', label: t('customers.sortName') },
      { value: 'value', label: t('customers.sortValue') },
      { value: 'recent', label: t('customers.sortRecent') },
    ], ui.sort, (v) => { ui.sort = v; rerender(); }));
  root.appendChild(bar);

  let list = ws.customers.filter((c) => matches(c, ws));
  if (ui.sort === 'name') list.sort((a, b) => a.name.localeCompare(b.name));
  if (ui.sort === 'value') list.sort((a, b) => customerValue(ws, b) - customerValue(ws, a));
  if (ui.sort === 'recent') list.sort((a, b) => new Date(b.lastOrder) - new Date(a.lastOrder));

  root.appendChild(h('p', { class: 'small faint mono', style: 'margin:10px 0' },
    t('customers.shown', { n: list.length, total: ws.customers.length })));

  if (!list.length) {
    root.appendChild(emptyState(t('customers.emptyTitle'), t('customers.emptyBody')));
    return root;
  }

  const table = h('table', { class: 'data' },
    h('thead', {}, h('tr', {},
      h('th', {}, t('customers.thAccount')),
      h('th', {}, t('customers.thSegment')),
      h('th', {}, t('customers.thOwner')),
      h('th', {}, t('customers.thStatus')),
      h('th', {}, t('customers.thLastOrder')),
      h('th', { class: 'right' }, t('customers.thValue')),
      h('th', { class: 'right' }, t('customers.thOpen')))),
    h('tbody', {}, list.map((c) => h('tr', { dataset: { id: c.id } },
      h('td', {},
        h('div', { style: 'font-weight:600' }, c.name),
        h('div', { class: 'faint small' }, `${c.contactName} · ${c.city}`)),
      h('td', {}, h('span', { class: 'chip', style: 'cursor:default' }, segmentLabel(c.segment))),
      h('td', {}, c.owner),
      h('td', {}, statusPill(c.status)),
      h('td', { class: 'mono small' }, ago(c.lastOrder)),
      h('td', { class: 'right num' }, money(customerValue(ws, c))),
      h('td', { class: 'right' }, h('button', {
        class: 'btn btn--sm', dataset: { open: c.id },
        'aria-label': t('customers.openRow', { name: c.name }),
      }, t('common.details')))))));

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
    h('span', { class: 'chip', style: 'cursor:default' }, segmentLabel(c.segment)),
    h('span', { class: 'faint small mono' }, t('customers.since', { date: fmtDate(c.since) }))));

  body.appendChild(defList([
    [t('customers.owner'), c.owner],
    [t('customers.contact'), c.contactName],
    [t('customers.email'), h('a', { class: 'linkish', href: `mailto:${c.contactEmail}`, dir: 'ltr' }, c.contactEmail)],
    [t('customers.phone'), h('span', { class: 'mono', dir: 'ltr' }, c.contactPhone)],
    [t('customers.credit'), t('customers.creditDays', { n: c.creditDays })],
    [t('customers.lastOrder'), t('customers.lastOrderVal', { date: fmtDate(c.lastOrder), ago: ago(c.lastOrder) })],
    [t('customers.value'), h('span', { class: 'num' }, money(customerValue(ws, c)))],
  ]));

  /* status change */
  const statusSel = h('select', {
    class: 'select', 'aria-label': t('customers.accountStatus'),
    onchange: (e) => {
      const next = e.target.value;
      store.update((s) => {
        const target = s.workspaces[ws.id].customers.find((x) => x.id === c.id);
        if (target) target.status = next;
      });
      logActivity(ws.id, 'customer', 'customerMarked', { name: c.name, status: next });
      toast(t('customers.nowStatus', { name: c.name, status: statusLabel(next) }), 'ok');
      rerender();
    },
  }, CUSTOMER_STATUS.map((s) => h('option', { value: s, selected: s === c.status }, statusLabel(s))));
  body.appendChild(h('label', { class: 'field' }, h('span', { class: 'field__label' }, t('customers.accountStatus')), statusSel));

  /* linked deals */
  const deals = ws.deals.filter((d) => d.customerId === c.id);
  body.appendChild(h('h3', { style: 'margin-top:6px' }, t('customers.linked', { n: deals.length })));
  body.appendChild(deals.length
    ? h('ul', { class: 'itemlist' }, deals.map((d) => h('li', {},
      h('div', { style: 'flex:1;min-width:0' },
        h('div', { class: 'truncate' }, dealTitle(ws, d)),
        h('div', { class: 'faint small mono' }, `${stageLabel(d.stage)} · ${d.owner}`)),
      h('span', { class: 'num' }, money(d.value)))))
    : h('p', { class: 'muted small' }, t('customers.noDeals')));

  /* invoices */
  const invs = ws.invoices.filter((i) => i.customerId === c.id);
  const openInv = invs.filter((i) => i.status === 'sent' || i.status === 'overdue');
  body.appendChild(h('h3', { style: 'margin-top:6px' }, t('customers.invoices', { n: invs.length })));
  body.appendChild(h('p', { class: 'small muted' },
    t('customers.invSummary', {
      n: openInv.length,
      amount: money(openInv.reduce((sum, i) => sum + i.amount, 0)),
      late: invs.filter((i) => i.status === 'overdue').length,
    })));
  if (invs.length) {
    body.appendChild(h('ul', { class: 'itemlist' }, invs.slice(0, 5).map((i) => h('li', {},
      h('div', { style: 'flex:1;min-width:0' },
        h('div', { class: 'mono small' }, i.number),
        h('div', { class: 'faint small' }, i.status === 'overdue'
          ? t('customers.daysPastDue', { n: invoiceAgeDays(i) })
          : t('customers.due', { date: fmtDate(i.dueAt) }))),
      statusPill(i.status),
      h('span', { class: 'num' }, money(i.amount))))));
  }

  /* notes */
  body.appendChild(h('h3', { style: 'margin-top:6px' }, t('customers.notes', { n: c.notes.length })));
  const noteList = h('ul', { class: 'notelist' });
  const paintNotes = () => {
    const fresh = store.state.workspaces[ws.id].customers.find((x) => x.id === c.id);
    noteList.innerHTML = '';
    if (!fresh.notes.length) noteList.appendChild(h('li', { class: 'muted small' }, t('customers.noNotes')));
    fresh.notes.forEach((n) => noteList.appendChild(h('li', {},
      h('p', {}, noteText(n)),
      h('div', { class: 'faint small mono' }, `${n.by} · ${ago(n.at)}`))));
  };
  paintNotes();
  body.appendChild(noteList);

  const noteInput = h('textarea', { class: 'textarea', placeholder: t('customers.addNotePh'), 'aria-label': t('customers.newNote') });
  body.appendChild(h('div', { class: 'field' }, h('span', { class: 'field__label' }, t('customers.addNote')), noteInput));

  const drawer = openDrawer({
    title: c.name,
    sub: t('customers.drawerSub', { segment: segmentLabel(c.segment), owner: c.owner }),
    body,
    footer: [
      h('button', { class: 'btn', onclick: () => drawer.close() }, t('common.close')),
      h('button', {
        class: 'btn btn--primary',
        onclick: () => {
          const text = noteInput.value.trim();
          if (!text) { toast(t('customers.writeFirst'), 'bad'); return; }
          store.update((s) => {
            const target = s.workspaces[ws.id].customers.find((x) => x.id === c.id);
            target.notes.unshift({
              id: `n${Date.now().toString(36)}`,
              at: new Date().toISOString(),
              by: s.user.name,
              text,
            });
          });
          logActivity(ws.id, 'note', 'noteAdded', { name: c.name });
          noteInput.value = '';
          paintNotes();
          toast(t('customers.noteSaved'), 'ok');
          rerender();
        },
      }, iconEl('plus'), t('customers.saveNote')),
    ],
  });
}

/* ---------- create ---------- */

function newCustomer(ctx) {
  const { ws, rerender } = ctx;
  const owners = ws.members.filter((m) => m.status === 'active').map((m) => m.name);
  const form = h('div', {},
    h('label', { class: 'field' }, h('span', { class: 'field__label' }, t('customers.fName')),
      h('input', { class: 'input', dataset: { f: 'name' }, placeholder: t('customers.fNamePh') })),
    h('label', { class: 'field' }, h('span', { class: 'field__label' }, t('customers.fContact')),
      h('input', { class: 'input', dataset: { f: 'contact' }, placeholder: t('customers.fContactPh') })),
    h('label', { class: 'field' }, h('span', { class: 'field__label' }, t('customers.segment')),
      h('select', { class: 'select', dataset: { f: 'segment' } }, SEGMENTS.map((s) => h('option', { value: s }, segmentLabel(s))))),
    h('label', { class: 'field' }, h('span', { class: 'field__label' }, t('customers.owner')),
      h('select', { class: 'select', dataset: { f: 'owner' } }, owners.map((o) => h('option', { value: o }, o)))),
    h('label', { class: 'field' }, h('span', { class: 'field__label' }, t('customers.fCredit')),
      h('select', { class: 'select', dataset: { f: 'credit' } }, [15, 30, 45, 60].map((d) => h('option', { value: d, selected: d === 30 }, t('customers.creditDays', { n: d }))))),
    h('p', { class: 'hint' }, t('customers.hint')));

  modal({
    title: t('customers.new'),
    body: form,
    actions: [
      { label: t('common.cancel') },
      {
        label: t('customers.create'),
        class: 'btn--primary',
        onClick: (bodyEl) => {
          const get = (f) => bodyEl.querySelector(`[data-f="${f}"]`).value.trim();
          const name = get('name');
          const contact = get('contact') || t('customers.notRecorded');
          if (!name) { toast(t('customers.needName'), 'bad'); return true; }
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
          logActivity(ws.id, 'customer', 'customerCreated', { name });
          toast(t('customers.added', { name }), 'ok');
          rerender();
        },
      },
    ],
  });
}
