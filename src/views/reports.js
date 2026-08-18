/* Reports — solid-fill bar charts built from the live workspace data. */

import { h, barChart, num, downloadCSV, toast, pct } from '../../lib/ui.js';
import {
  STAGES, SEGMENTS, revenueByMonth, stageLabel, segmentLabel, quarterRevenue,
  monthKeys, customerName,
} from '../data.js';
import { t } from '../main.js';
import { pageHead, statCard, wsMoney, iconEl, sectionTitle } from '../parts.js';

const ui = { months: 6 };

export function render(ctx) {
  const { ws, rerender } = ctx;
  const money = (n) => wsMoney(ws, n);
  const root = h('div', { class: 'view view--pad' });

  const revenue = revenueByMonth(ws, ui.months);
  const q = quarterRevenue(ws);
  const paid = ws.invoices.filter((i) => i.status === 'paid');
  const avgInvoice = paid.length ? Math.round(paid.reduce((sum, i) => sum + i.amount, 0) / paid.length) : 0;

  root.appendChild(pageHead(t('reports.title'), t('reports.sub', { cur: ws.currency }),
    [
      h('button', {
        class: 'btn',
        onclick: () => {
          const rows = [t('reports.csvHead')];
          revenue.forEach((r) => rows.push([t('reports.csvRevenue'), r.label, r.value]));
          stageSeries(ws).forEach((r) => rows.push([t('reports.csvStage'), r.label, r.value]));
          segmentSeries(ws).forEach((r) => rows.push([t('reports.csvSegment'), r.label, r.value]));
          ownerSeries(ws).forEach((r) => rows.push([t('reports.csvOwner'), r.label, r.value]));
          downloadCSV(`opsboard-reports-${ws.id}.csv`, rows);
          toast(t('reports.exported'), 'ok');
        },
      }, iconEl('download'), t('common.exportCsv')),
    ]));

  root.appendChild(h('div', { class: 'grid g4' },
    statCard(t('reports.revenue', { q: q.label }), money(q.total), t('reports.revenueSub', { n: q.count }), true),
    statCard(t('reports.avg'), money(avgInvoice), t('reports.avgSub', { n: paid.length })),
    statCard(t('reports.rate'), pct(collectionRate(ws)), t('reports.rateSub')),
    statCard(t('reports.billed'), num(new Set(ws.invoices.map((i) => i.customerId)).size), t('reports.billedSub', { n: ws.customers.length }))));

  /* revenue by month */
  const rangeBtns = h('div', { class: 'btnrow' }, [3, 6, 12].map((n) => h('button', {
    class: `chip${ui.months === n ? ' is-on' : ''}`,
    onclick: () => { ui.months = n; rerender(); },
  }, t('reports.range', { n }))));
  root.appendChild(h('div', { class: 'card', style: 'margin-top:20px' },
    h('div', { class: 'card__head' }, h('h3', {}, t('reports.byMonth')), rangeBtns),
    barChart(revenue, { format: (v) => money(v) }),
    h('p', { class: 'small faint', style: 'margin-top:10px' },
      t('reports.best', {
        label: best(revenue).label,
        amount: money(best(revenue).value),
        total: money(revenue.reduce((sum, r) => sum + r.value, 0)),
      }))));

  /* stage + segment */
  const stages = stageSeries(ws);
  const segments = segmentSeries(ws);
  root.appendChild(h('div', { class: 'grid g2', style: 'margin-top:20px' },
    h('div', { class: 'card' },
      h('div', { class: 'card__head' }, h('h3', {}, t('reports.byStage'))),
      barChart(stages, { format: (v) => money(v), muted: (s) => s.key === 'lost' }),
      h('p', { class: 'small faint', style: 'margin-top:10px' },
        t('reports.stageNote', { n: ws.deals.length, won: ws.deals.filter((d) => d.stage === 'won').length }))),
    h('div', { class: 'card' },
      h('div', { class: 'card__head' }, h('h3', {}, t('reports.bySegment'))),
      barChart(segments, { format: num }),
      h('p', { class: 'small faint', style: 'margin-top:10px' },
        t('reports.segmentNote', { label: best(segments).label, n: best(segments).value })))));

  /* owner leaderboard */
  root.appendChild(sectionTitle(t('reports.byOwner')));
  const owners = ownerSeries(ws);
  root.appendChild(h('div', { class: 'card' },
    barChart(owners, { format: (v) => money(v) })));

  /* top accounts */
  root.appendChild(sectionTitle(t('reports.top')));
  const totals = {};
  ws.invoices.filter((i) => i.status === 'paid').forEach((i) => { totals[i.customerId] = (totals[i.customerId] || 0) + i.amount; });
  const top = Object.entries(totals).sort((a, b) => b[1] - a[1]).slice(0, 8);
  const grand = Object.values(totals).reduce((sum, v) => sum + v, 0) || 1;
  root.appendChild(h('div', { class: 'tablewrap tablewrap--scroll' },
    h('table', { class: 'data' },
      h('thead', {}, h('tr', {}, h('th', {}, t('reports.thAccount')), h('th', {}, t('reports.thShare')), h('th', { class: 'right' }, t('reports.thSettled')))),
      h('tbody', {}, top.map(([id, value]) => h('tr', {},
        h('td', {}, customerName(ws, id)),
        h('td', { class: 'mono small' }, pct((value / grand) * 100, 1)),
        h('td', { class: 'right num' }, money(value))))))));

  root.appendChild(h('p', { class: 'faint small mono', style: 'margin-top:14px' },
    t('reports.window', { month: monthKeys(ui.months)[0].label, year: monthKeys(ui.months)[0].year })));

  return root;
}

function best(series) {
  return series.reduce((a, b) => (b.value > a.value ? b : a), series[0] || { label: t('common.dash'), value: 0 });
}

function collectionRate(ws) {
  const issued = ws.invoices.filter((i) => i.status !== 'draft');
  if (!issued.length) return 0;
  const settled = issued.filter((i) => i.status === 'paid').reduce((sum, i) => sum + i.amount, 0);
  const total = issued.reduce((sum, i) => sum + i.amount, 0);
  return (settled / total) * 100;
}

export function stageSeries(ws) {
  return STAGES.map((s) => ({
    key: s.id,
    label: stageLabel(s.id),
    value: ws.deals.filter((d) => d.stage === s.id).reduce((sum, d) => sum + d.value, 0),
  }));
}

export function segmentSeries(ws) {
  return SEGMENTS.map((s) => ({ key: s, label: segmentLabel(s), value: ws.customers.filter((c) => c.segment === s).length }));
}

export function ownerSeries(ws) {
  const names = [...new Set(ws.deals.map((d) => d.owner))].sort();
  return names.map((n) => ({
    key: n,
    label: n.split(' ')[0],
    value: ws.deals.filter((d) => d.owner === n && d.stage === 'won').reduce((sum, d) => sum + d.value, 0),
  }));
}
