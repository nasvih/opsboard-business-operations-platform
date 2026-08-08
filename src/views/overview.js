/* Overview — the workspace at a glance. */

import { h, barChart, ago, fmtDate, num, meter } from '../../lib/ui.js';
import {
  quarterRevenue, pipelineValue, openDeals, overdueInvoices, outstandingValue,
  revenueByMonth, customerName, seatsUsed, changesSince, atRiskCustomers, stageLabel,
} from '../data.js';
import { pageHead, statCard, wsMoney, statusPill, sectionTitle, iconEl, plural } from '../parts.js';

export function render(ctx) {
  const { ws, navigate } = ctx;
  const q = quarterRevenue(ws);
  const overdue = overdueInvoices(ws);
  const active = ws.customers.filter((c) => c.status === 'active');
  const risk = atRiskCustomers(ws);
  const week = changesSince(ws, 7);
  const money = (n) => wsMoney(ws, n);

  const soon = openDeals(ws)
    .filter((d) => new Date(d.closeDate).getTime() - Date.now() < 21 * 86400000)
    .sort((a, b) => new Date(a.closeDate) - new Date(b.closeDate))
    .slice(0, 5);

  const root = h('div', { class: 'view view--pad' });

  root.appendChild(pageHead(
    `${ws.name} overview`,
    `${ws.industry} · ${ws.city}. Every figure on this screen is scoped to this workspace only.`,
    [
      h('button', { class: 'btn', onclick: () => navigate('reports') }, iconEl('chart'), 'Reports'),
      h('button', { class: 'btn btn--primary', onclick: () => navigate('deals') }, iconEl('bolt'), 'Open pipeline'),
    ],
  ));

  root.appendChild(h('div', { class: 'grid g4' },
    statCard(`Revenue ${q.label}`, money(q.total), `${plural(q.count, 'invoice')} settled`, true),
    statCard('Open pipeline', money(pipelineValue(ws)), `${plural(openDeals(ws).length, 'deal')} in play`),
    statCard('Overdue', money(overdue.reduce((t, i) => t + i.amount, 0)), `${plural(overdue.length, 'invoice')} past due`),
    statCard('Active customers', num(active.length), `${plural(ws.customers.length, 'account')} on file`)));

  /* revenue chart + seat usage */
  const chartCard = h('div', { class: 'card' },
    h('div', { class: 'card__head' },
      h('h3', {}, 'Settled revenue, last 6 months'),
      h('span', { class: 'label' }, ws.currency)),
    barChart(revenueByMonth(ws, 6), { format: (v) => money(v) }));

  const used = seatsUsed(ws);
  const seatCard = h('div', { class: 'card stack' },
    h('div', { class: 'card__head' }, h('h3', {}, 'Workspace health')),
    h('div', {},
      h('div', { class: 'between small' }, h('span', {}, 'Seats used'), h('span', { class: 'num' }, `${used} / ${ws.seatsIncluded}`)),
      h('div', { style: 'margin-top:6px' }, meter(used, ws.seatsIncluded, used > ws.seatsIncluded ? 'bad' : ''))),
    h('div', {},
      h('div', { class: 'between small' }, h('span', {}, 'Accounts at risk'), h('span', { class: 'num' }, `${risk.length} / ${ws.customers.length}`)),
      h('div', { style: 'margin-top:6px' }, meter(risk.length, ws.customers.length, 'bad'))),
    h('div', {},
      h('div', { class: 'between small' }, h('span', {}, 'Outstanding receivables'), h('span', { class: 'num' }, money(outstandingValue(ws)))),
      h('div', { style: 'margin-top:6px' }, meter(overdue.length, ws.invoices.length, 'bad'))),
    h('p', { class: 'small muted' }, `${plural(week.length, 'recorded change')} in the last 7 days.`));

  root.appendChild(h('div', { class: 'grid g-side', style: 'margin-top:20px' }, chartCard, seatCard));

  /* open items */
  root.appendChild(sectionTitle('Open items',
    h('button', { class: 'btn btn--sm', onclick: () => navigate('invoices') }, 'All invoices')));

  const items = h('div', { class: 'grid g2' });

  const overdueList = h('div', { class: 'card' },
    h('div', { class: 'card__head' }, h('h3', {}, 'Overdue invoices'), statusPill('overdue', `${overdue.length}`)));
  if (!overdue.length) overdueList.appendChild(h('p', { class: 'muted small' }, 'Nothing overdue in this workspace.'));
  else {
    overdueList.appendChild(h('ul', { class: 'itemlist' }, overdue.slice(0, 6).map((i) => h('li', {},
      h('div', { style: 'flex:1;min-width:0' },
        h('div', { class: 'truncate' }, customerName(ws, i.customerId)),
        h('div', { class: 'faint small mono' }, `${i.number} · due ${fmtDate(i.dueAt)}`)),
      h('span', { class: 'num' }, money(i.amount))))));
  }

  const dealList = h('div', { class: 'card' },
    h('div', { class: 'card__head' }, h('h3', {}, 'Deals closing soon'), h('span', { class: 'pill' }, `${soon.length}`)));
  if (!soon.length) dealList.appendChild(h('p', { class: 'muted small' }, 'No open deal has a close date inside 21 days.'));
  else {
    dealList.appendChild(h('ul', { class: 'itemlist' }, soon.map((d) => h('li', {},
      h('div', { style: 'flex:1;min-width:0' },
        h('div', { class: 'truncate' }, d.title),
        h('div', { class: 'faint small mono' }, `${stageLabel(d.stage)} · ${d.owner} · ${fmtDate(d.closeDate)}`)),
      h('span', { class: 'num' }, money(d.value))))));
  }

  items.append(overdueList, dealList);
  root.appendChild(items);

  /* activity */
  root.appendChild(sectionTitle('Activity'));
  const feed = h('div', { class: 'card' },
    h('ol', { class: 'timeline' }, ws.activity.slice(0, 12).map((a) => h('li', { class: 'timeline__item' },
      h('div', { class: 'between' },
        h('strong', { style: 'font-weight:600' }, a.text),
        h('span', { class: 'faint small mono' }, ago(a.at))),
      h('div', { class: 'faint small' }, `${a.actor} · ${a.type}`)))));
  root.appendChild(feed);

  return root;
}
