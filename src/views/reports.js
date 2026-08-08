/* Reports — solid-fill bar charts built from the live workspace data. */

import { h, barChart, num, downloadCSV, toast, pct } from '../../lib/ui.js';
import {
  STAGES, SEGMENTS, revenueByMonth, stageLabel, quarterRevenue,
  monthKeys, customerName,
} from '../data.js';
import { pageHead, statCard, wsMoney, iconEl, sectionTitle } from '../parts.js';

const ui = { months: 6 };

export function render(ctx) {
  const { ws, rerender } = ctx;
  const money = (n) => wsMoney(ws, n);
  const root = h('div', { class: 'view view--pad' });

  const revenue = revenueByMonth(ws, ui.months);
  const q = quarterRevenue(ws);
  const paid = ws.invoices.filter((i) => i.status === 'paid');
  const avgInvoice = paid.length ? Math.round(paid.reduce((t, i) => t + i.amount, 0) / paid.length) : 0;

  root.appendChild(pageHead('Reports',
    `Figures are recomputed from this workspace every time you open the screen. Currency ${ws.currency}.`,
    [
      h('button', {
        class: 'btn',
        onclick: () => {
          const rows = [['Report', 'Label', 'Value']];
          revenue.forEach((r) => rows.push(['Revenue by month', r.label, r.value]));
          stageSeries(ws).forEach((r) => rows.push(['Pipeline by stage', r.label, r.value]));
          segmentSeries(ws).forEach((r) => rows.push(['Customers by segment', r.label, r.value]));
          ownerSeries(ws).forEach((r) => rows.push(['Won value by owner', r.label, r.value]));
          downloadCSV(`opsboard-reports-${ws.id}.csv`, rows);
          toast('Report pack exported as CSV', 'ok');
        },
      }, iconEl('download'), 'Export CSV'),
    ]));

  root.appendChild(h('div', { class: 'grid g4' },
    statCard(`Revenue ${q.label}`, money(q.total), `${q.count} invoices`, true),
    statCard('Average invoice', money(avgInvoice), `${paid.length} settled`),
    statCard('Collection rate', pct(collectionRate(ws)), 'settled vs issued'),
    statCard('Accounts billed', num(new Set(ws.invoices.map((i) => i.customerId)).size), `${ws.customers.length} on file`)));

  /* revenue by month */
  const rangeBtns = h('div', { class: 'btnrow' }, [3, 6, 12].map((n) => h('button', {
    class: `chip${ui.months === n ? ' is-on' : ''}`,
    onclick: () => { ui.months = n; rerender(); },
  }, `${n} months`)));
  root.appendChild(h('div', { class: 'card', style: 'margin-top:20px' },
    h('div', { class: 'card__head' }, h('h3', {}, 'Revenue by month'), rangeBtns),
    barChart(revenue, { format: (v) => money(v) }),
    h('p', { class: 'small faint', style: 'margin-top:10px' },
      `Best month: ${best(revenue).label} at ${money(best(revenue).value)}. Total over the window ${money(revenue.reduce((t, r) => t + r.value, 0))}.`)));

  /* stage + segment */
  const stages = stageSeries(ws);
  const segments = segmentSeries(ws);
  root.appendChild(h('div', { class: 'grid g2', style: 'margin-top:20px' },
    h('div', { class: 'card' },
      h('div', { class: 'card__head' }, h('h3', {}, 'Pipeline value by stage')),
      barChart(stages, { format: (v) => money(v), muted: (s) => s.key === 'lost' }),
      h('p', { class: 'small faint', style: 'margin-top:10px' },
        `${ws.deals.length} deals in total, ${ws.deals.filter((d) => d.stage === 'won').length} won.`)),
    h('div', { class: 'card' },
      h('div', { class: 'card__head' }, h('h3', {}, 'Customers by segment')),
      barChart(segments, { format: num }),
      h('p', { class: 'small faint', style: 'margin-top:10px' },
        `Largest segment: ${best(segments).label} with ${best(segments).value} accounts.`))));

  /* owner leaderboard */
  root.appendChild(sectionTitle('Won value by owner'));
  const owners = ownerSeries(ws);
  root.appendChild(h('div', { class: 'card' },
    barChart(owners, { format: (v) => money(v) })));

  /* top accounts */
  root.appendChild(sectionTitle('Top accounts by settled revenue'));
  const totals = {};
  ws.invoices.filter((i) => i.status === 'paid').forEach((i) => { totals[i.customerId] = (totals[i.customerId] || 0) + i.amount; });
  const top = Object.entries(totals).sort((a, b) => b[1] - a[1]).slice(0, 8);
  const grand = Object.values(totals).reduce((t, v) => t + v, 0) || 1;
  root.appendChild(h('div', { class: 'tablewrap tablewrap--scroll' },
    h('table', { class: 'data' },
      h('thead', {}, h('tr', {}, h('th', {}, 'Account'), h('th', {}, 'Share'), h('th', { class: 'right' }, 'Settled'))),
      h('tbody', {}, top.map(([id, value]) => h('tr', {},
        h('td', {}, customerName(ws, id)),
        h('td', { class: 'mono small' }, pct((value / grand) * 100, 1)),
        h('td', { class: 'right num' }, money(value))))))));

  root.appendChild(h('p', { class: 'faint small mono', style: 'margin-top:14px' },
    `Window covers ${monthKeys(ui.months)[0].label} ${monthKeys(ui.months)[0].year} onwards.`));

  return root;
}

function best(series) {
  return series.reduce((a, b) => (b.value > a.value ? b : a), series[0] || { label: '—', value: 0 });
}

function collectionRate(ws) {
  const issued = ws.invoices.filter((i) => i.status !== 'draft');
  if (!issued.length) return 0;
  const settled = issued.filter((i) => i.status === 'paid').reduce((t, i) => t + i.amount, 0);
  const total = issued.reduce((t, i) => t + i.amount, 0);
  return (settled / total) * 100;
}

export function stageSeries(ws) {
  return STAGES.map((s) => ({
    key: s.id,
    label: stageLabel(s.id),
    value: ws.deals.filter((d) => d.stage === s.id).reduce((t, d) => t + d.value, 0),
  }));
}

export function segmentSeries(ws) {
  return SEGMENTS.map((s) => ({ key: s, label: s, value: ws.customers.filter((c) => c.segment === s).length }));
}

export function ownerSeries(ws) {
  const names = [...new Set(ws.deals.map((d) => d.owner))].sort();
  return names.map((n) => ({
    key: n,
    label: n.split(' ')[0],
    value: ws.deals.filter((d) => d.owner === n && d.stage === 'won').reduce((t, d) => t + d.value, 0),
  }));
}
