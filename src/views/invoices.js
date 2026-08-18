/* Invoices — status pills, aging, mark paid, CSV export. */

import { h, fmtDate, toast, downloadCSV, confirmDialog, on, num, meter } from '../../lib/ui.js';
import {
  store, INVOICE_STATUS, customerName, invoiceAgeDays, agingBuckets,
  outstandingValue, overdueInvoices, logActivity, statusLabel,
} from '../data.js';
import { t } from '../main.js';
import { pageHead, statCard, statusPill, selectFilter, searchBox, emptyState, wsMoney, iconEl, plural } from '../parts.js';

const ui = { status: 'all', q: '', sort: 'due' };

export function render(ctx) {
  const { ws, rerender } = ctx;
  const money = (n) => wsMoney(ws, n);
  const root = h('div', { class: 'view view--pad' });

  const overdue = overdueInvoices(ws);
  const paid = ws.invoices.filter((i) => i.status === 'paid');

  root.appendChild(pageHead(t('invoices.title'), t('invoices.sub'),
    [h('button', {
      class: 'btn',
      onclick: () => {
        const rows = [t('invoices.csvHead')];
        rowsFor(ws).forEach((i) => rows.push([i.number, customerName(ws, i.customerId), fmtDate(i.issuedAt), fmtDate(i.dueAt), statusLabel(i.status), i.status === 'overdue' ? invoiceAgeDays(i) : 0, i.amount]));
        downloadCSV(`opsboard-invoices-${ws.id}.csv`, rows);
        toast(t('invoices.exported'), 'ok');
      },
    }, iconEl('download'), t('common.exportCsv'))]));

  root.appendChild(h('div', { class: 'grid g4' },
    statCard(t('invoices.outstanding'), money(outstandingValue(ws)), plural(ws.invoices.filter((i) => i.status === 'sent' || i.status === 'overdue').length, 'openInvoice'), true),
    statCard(t('invoices.overdue'), money(overdue.reduce((sum, i) => sum + i.amount, 0)), t('invoices.overdueSub', { n: overdue.length })),
    statCard(t('invoices.settled'), money(paid.reduce((sum, i) => sum + i.amount, 0)), t('invoices.settledSub', { n: paid.length })),
    statCard(t('invoices.drafts'), num(ws.invoices.filter((i) => i.status === 'draft').length), t('invoices.draftsSub'))));

  /* aging */
  const buckets = agingBuckets(ws);
  const maxBucket = Math.max(...buckets.map((b) => b.total), 1);
  root.appendChild(h('div', { class: 'card', style: 'margin-top:20px' },
    h('div', { class: 'card__head' }, h('h3', {}, t('invoices.aging')),
      h('span', { class: 'label' }, t('invoices.agingNote', { cur: ws.currency }))),
    h('div', { class: 'aging' }, buckets.map((b) => h('div', { class: 'aging__row' },
      h('span', { class: 'aging__label' }, b.label),
      h('div', { class: 'aging__meter' }, meter(b.total, maxBucket, b.id === 'b3' ? 'bad' : b.id === 'current' ? 'ok' : '')),
      h('span', { class: 'num aging__val' }, money(b.total)),
      h('span', { class: 'faint small mono' }, `${b.count}`))))));

  const bar = h('div', { class: 'filterbar', style: 'margin-top:18px' },
    searchBox(t('invoices.search'), ui.q, (v) => { ui.q = v; rerender({ keepFocus: true }); }),
    selectFilter(t('invoices.status'), [{ value: 'all', label: t('invoices.allStatuses') }].concat(INVOICE_STATUS.map((s) => ({ value: s, label: statusLabel(s) }))), ui.status, (v) => { ui.status = v; rerender(); }),
    selectFilter(t('invoices.sort'), [
      { value: 'due', label: t('invoices.sortDue') },
      { value: 'amount', label: t('invoices.sortAmount') },
      { value: 'age', label: t('invoices.sortAge') },
    ], ui.sort, (v) => { ui.sort = v; rerender(); }));
  root.appendChild(bar);

  const list = rowsFor(ws);
  if (!list.length) {
    root.appendChild(emptyState(t('invoices.emptyTitle'), t('invoices.emptyBody')));
    return root;
  }

  const table = h('table', { class: 'data' },
    h('thead', {}, h('tr', {},
      h('th', {}, t('invoices.thNumber')), h('th', {}, t('invoices.thAccount')), h('th', {}, t('invoices.thIssued')),
      h('th', {}, t('invoices.thDue')), h('th', {}, t('invoices.thStatus')), h('th', { class: 'right' }, t('invoices.thAmount')),
      h('th', { class: 'right' }, t('invoices.thAction')))),
    h('tbody', {}, list.map((i) => {
      const late = i.status === 'overdue';
      return h('tr', {},
        h('td', { class: 'mono' }, i.number),
        h('td', {}, customerName(ws, i.customerId)),
        h('td', { class: 'mono small' }, fmtDate(i.issuedAt)),
        h('td', { class: 'mono small' }, fmtDate(i.dueAt), late ? h('div', { class: 'faint small' }, t('invoices.daysLate', { n: invoiceAgeDays(i) })) : null),
        h('td', {}, statusPill(i.status)),
        h('td', { class: 'right num' }, money(i.amount)),
        h('td', { class: 'right' },
          i.status === 'paid'
            ? h('span', { class: 'faint small mono' }, t('invoices.paidOn', { date: fmtDate(i.paidAt) }))
            : i.status === 'draft'
              ? h('button', { class: 'btn btn--sm', dataset: { issue: i.id } }, t('invoices.issue'))
              : h('button', { class: 'btn btn--sm btn--primary', dataset: { pay: i.id } }, t('invoices.markPaid'))));
    })));

  const wrap = h('div', { class: 'tablewrap tablewrap--scroll' }, table);
  on(wrap, 'click', '[data-pay]', async (e, el) => {
    const inv = ws.invoices.find((x) => x.id === el.dataset.pay);
    const ok = await confirmDialog(
      t('invoices.confirmBody', {
        amount: wsMoney(ws, inv.amount), number: inv.number, name: customerName(ws, inv.customerId),
      }),
      { title: t('invoices.confirmTitle'), okLabel: t('invoices.markPaid') });
    if (!ok) return;
    store.update((s) => {
      const target = s.workspaces[ws.id].invoices.find((x) => x.id === inv.id);
      target.status = 'paid';
      target.paidAt = new Date().toISOString();
    });
    logActivity(ws.id, 'invoice', 'invoicePaid', { number: inv.number });
    toast(t('invoices.settledToast', { number: inv.number }), 'ok');
    rerender();
  });
  on(wrap, 'click', '[data-issue]', (e, el) => {
    const inv = ws.invoices.find((x) => x.id === el.dataset.issue);
    store.update((s) => {
      const target = s.workspaces[ws.id].invoices.find((x) => x.id === inv.id);
      target.status = 'sent';
      target.issuedAt = new Date().toISOString();
      target.dueAt = new Date(Date.now() + target.terms * 86400000).toISOString();
    });
    logActivity(ws.id, 'invoice', 'invoiceIssued', { number: inv.number, name: customerName(ws, inv.customerId) });
    toast(t('invoices.issuedToast', { number: inv.number }), 'ok');
    rerender();
  });
  root.appendChild(wrap);
  return root;
}

function rowsFor(ws) {
  const q = ui.q.trim().toLowerCase();
  let list = ws.invoices.filter((i) => {
    if (ui.status !== 'all' && i.status !== ui.status) return false;
    if (q && !`${i.number} ${customerName(ws, i.customerId)}`.toLowerCase().includes(q)) return false;
    return true;
  });
  if (ui.sort === 'due') list = list.sort((a, b) => new Date(a.dueAt) - new Date(b.dueAt));
  if (ui.sort === 'amount') list = list.sort((a, b) => b.amount - a.amount);
  if (ui.sort === 'age') list = list.sort((a, b) => invoiceAgeDays(b) - invoiceAgeDays(a));
  return list;
}
