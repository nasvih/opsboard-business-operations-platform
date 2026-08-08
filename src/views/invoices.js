/* Invoices — status pills, aging, mark paid, CSV export. */

import { h, fmtDate, toast, downloadCSV, confirmDialog, on, num, meter } from '../../lib/ui.js';
import {
  store, INVOICE_STATUS, customerName, invoiceAgeDays, agingBuckets,
  outstandingValue, overdueInvoices, logActivity,
} from '../data.js';
import { pageHead, statCard, statusPill, selectFilter, searchBox, emptyState, wsMoney, iconEl, plural } from '../parts.js';

const ui = { status: 'all', q: '', sort: 'due' };

export function render(ctx) {
  const { ws, rerender } = ctx;
  const money = (n) => wsMoney(ws, n);
  const root = h('div', { class: 'view view--pad' });

  const overdue = overdueInvoices(ws);
  const paid = ws.invoices.filter((i) => i.status === 'paid');

  root.appendChild(pageHead('Invoices',
    'Receivables for this workspace. Mark an invoice paid and the overview, reports and aging all move with it.',
    [h('button', {
      class: 'btn',
      onclick: () => {
        const rows = [['Number', 'Account', 'Issued', 'Due', 'Status', 'Days past due', 'Amount']];
        rowsFor(ws).forEach((i) => rows.push([i.number, customerName(ws, i.customerId), fmtDate(i.issuedAt), fmtDate(i.dueAt), i.status, i.status === 'overdue' ? invoiceAgeDays(i) : 0, i.amount]));
        downloadCSV(`opsboard-invoices-${ws.id}.csv`, rows);
        toast('Invoice list exported as CSV', 'ok');
      },
    }, iconEl('download'), 'Export CSV')]));

  root.appendChild(h('div', { class: 'grid g4' },
    statCard('Outstanding', money(outstandingValue(ws)), plural(ws.invoices.filter((i) => i.status === 'sent' || i.status === 'overdue').length, 'open invoice'), true),
    statCard('Overdue', money(overdue.reduce((t, i) => t + i.amount, 0)), plural(overdue.length, 'invoice') + ' past the due date'),
    statCard('Settled', money(paid.reduce((t, i) => t + i.amount, 0)), plural(paid.length, 'invoice') + ' paid'),
    statCard('Drafts', num(ws.invoices.filter((i) => i.status === 'draft').length), 'not yet issued')));

  /* aging */
  const buckets = agingBuckets(ws);
  const maxBucket = Math.max(...buckets.map((b) => b.total), 1);
  root.appendChild(h('div', { class: 'card', style: 'margin-top:20px' },
    h('div', { class: 'card__head' }, h('h3', {}, 'Receivables aging'),
      h('span', { class: 'label' }, `${ws.currency} · open invoices only`)),
    h('div', { class: 'aging' }, buckets.map((b) => h('div', { class: 'aging__row' },
      h('span', { class: 'aging__label' }, b.label),
      h('div', { class: 'aging__meter' }, meter(b.total, maxBucket, b.id === 'b3' ? 'bad' : b.id === 'current' ? 'ok' : '')),
      h('span', { class: 'num aging__val' }, money(b.total)),
      h('span', { class: 'faint small mono' }, `${b.count}`))))));

  const bar = h('div', { class: 'filterbar', style: 'margin-top:18px' },
    searchBox('Search by number or account', ui.q, (v) => { ui.q = v; rerender({ keepFocus: true }); }),
    selectFilter('Status', [{ value: 'all', label: 'All statuses' }].concat(INVOICE_STATUS.map((s) => ({ value: s, label: s }))), ui.status, (v) => { ui.status = v; rerender(); }),
    selectFilter('Sort', [
      { value: 'due', label: 'Due date' },
      { value: 'amount', label: 'Amount' },
      { value: 'age', label: 'Days past due' },
    ], ui.sort, (v) => { ui.sort = v; rerender(); }));
  root.appendChild(bar);

  const list = rowsFor(ws);
  if (!list.length) {
    root.appendChild(emptyState('No invoices match', 'Try a different status filter or clear the search.'));
    return root;
  }

  const table = h('table', { class: 'data' },
    h('thead', {}, h('tr', {},
      h('th', {}, 'Number'), h('th', {}, 'Account'), h('th', {}, 'Issued'),
      h('th', {}, 'Due'), h('th', {}, 'Status'), h('th', { class: 'right' }, 'Amount'),
      h('th', { class: 'right' }, 'Action'))),
    h('tbody', {}, list.map((i) => {
      const late = i.status === 'overdue';
      return h('tr', {},
        h('td', { class: 'mono' }, i.number),
        h('td', {}, customerName(ws, i.customerId)),
        h('td', { class: 'mono small' }, fmtDate(i.issuedAt)),
        h('td', { class: 'mono small' }, fmtDate(i.dueAt), late ? h('div', { class: 'faint small' }, `${invoiceAgeDays(i)} days late`) : null),
        h('td', {}, statusPill(i.status)),
        h('td', { class: 'right num' }, money(i.amount)),
        h('td', { class: 'right' },
          i.status === 'paid'
            ? h('span', { class: 'faint small mono' }, `paid ${fmtDate(i.paidAt)}`)
            : i.status === 'draft'
              ? h('button', { class: 'btn btn--sm', dataset: { issue: i.id } }, 'Issue')
              : h('button', { class: 'btn btn--sm btn--primary', dataset: { pay: i.id } }, 'Mark paid')));
    })));

  const wrap = h('div', { class: 'tablewrap tablewrap--scroll' }, table);
  on(wrap, 'click', '[data-pay]', async (e, t) => {
    const inv = ws.invoices.find((x) => x.id === t.dataset.pay);
    const ok = await confirmDialog(
      `Record ${wsMoney(ws, inv.amount)} received against ${inv.number} from ${customerName(ws, inv.customerId)}?`,
      { title: 'Mark invoice paid', okLabel: 'Mark paid' });
    if (!ok) return;
    store.update((s) => {
      const target = s.workspaces[ws.id].invoices.find((x) => x.id === inv.id);
      target.status = 'paid';
      target.paidAt = new Date().toISOString();
    });
    logActivity(ws.id, 'invoice', `Invoice ${inv.number} marked paid`);
    toast(`${inv.number} settled`, 'ok');
    rerender();
  });
  on(wrap, 'click', '[data-issue]', (e, t) => {
    const inv = ws.invoices.find((x) => x.id === t.dataset.issue);
    store.update((s) => {
      const target = s.workspaces[ws.id].invoices.find((x) => x.id === inv.id);
      target.status = 'sent';
      target.issuedAt = new Date().toISOString();
      target.dueAt = new Date(Date.now() + target.terms * 86400000).toISOString();
    });
    logActivity(ws.id, 'invoice', `Invoice ${inv.number} issued to ${customerName(ws, inv.customerId)}`);
    toast(`${inv.number} issued`, 'ok');
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
