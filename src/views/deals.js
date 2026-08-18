/* Deals — pipeline board. No drag and drop: every card carries a stage select. */

import { h, fmtDate, modal, toast, num } from '../../lib/ui.js';
import { store, STAGES, stageLabel, logActivity, customerName, dealTitle } from '../data.js';
import { t } from '../main.js';
import { pageHead, statCard, wsMoney, statusPill, selectFilter, emptyState, iconEl, plural } from '../parts.js';

const ui = { owner: 'all', view: 'board' };

export function render(ctx) {
  const { ws, rerender } = ctx;
  const money = (n) => wsMoney(ws, n);
  const owners = [...new Set(ws.deals.map((d) => d.owner))].sort();
  const deals = ws.deals.filter((d) => ui.owner === 'all' || d.owner === ui.owner);

  const open = deals.filter((d) => d.stage !== 'won' && d.stage !== 'lost');
  const won = deals.filter((d) => d.stage === 'won');
  const weighted = open.reduce((sum, d) => sum + (d.value * d.probability) / 100, 0);

  const root = h('div', { class: 'view view--pad' });
  root.appendChild(pageHead(t('deals.title'), t('deals.sub'),
    [
      h('button', { class: 'btn btn--primary', onclick: () => newDeal(ctx) }, iconEl('plus'), t('deals.new')),
    ]));

  root.appendChild(h('div', { class: 'grid g4' },
    statCard(t('deals.openPipeline'), money(open.reduce((sum, d) => sum + d.value, 0)), plural(open.length, 'deal'), true),
    statCard(t('deals.weighted'), money(Math.round(weighted)), t('deals.weightedSub')),
    statCard(t('deals.won'), money(won.reduce((sum, d) => sum + d.value, 0)), t('deals.wonSub', { n: won.length })),
    statCard(t('deals.winRate'), `${winRate(deals)}%`, t('deals.lostSub', { n: deals.filter((d) => d.stage === 'lost').length }))));

  const bar = h('div', { class: 'filterbar', style: 'margin-top:18px' },
    selectFilter(t('deals.owner'), [{ value: 'all', label: t('deals.allOwners') }].concat(owners.map((o) => ({ value: o, label: o }))), ui.owner, (v) => { ui.owner = v; rerender(); }),
    selectFilter(t('deals.layout'), [{ value: 'board', label: t('deals.board') }, { value: 'list', label: t('deals.list') }], ui.view, (v) => { ui.view = v; rerender(); }));
  root.appendChild(bar);

  if (!deals.length) {
    root.appendChild(emptyState(t('deals.emptyTitle'), t('deals.emptyBody')));
    return root;
  }

  root.appendChild(ui.view === 'board' ? board(ctx, deals) : flat(ctx, deals));
  return root;
}

function winRate(deals) {
  const closed = deals.filter((d) => d.stage === 'won' || d.stage === 'lost');
  if (!closed.length) return 0;
  return Math.round((closed.filter((d) => d.stage === 'won').length / closed.length) * 100);
}

function moveDeal(ctx, id, stage) {
  const { ws, rerender } = ctx;
  const deal = ws.deals.find((d) => d.id === id);
  if (!deal || deal.stage === stage) return;
  store.update((s) => {
    const target = s.workspaces[ws.id].deals.find((d) => d.id === id);
    target.stage = stage;
    target.updatedAt = new Date().toISOString();
    if (stage === 'won') target.probability = 100;
    if (stage === 'lost') target.probability = 0;
  });
  logActivity(ws.id, 'deal', 'dealMoved', { stage, wsId: ws.id, titleOf: deal.id });
  toast(t('deals.moved', { stage: stageLabel(stage) }), 'ok');
  rerender();
}

function stageSelect(ctx, deal) {
  return h('select', {
    class: 'select select--sm', 'aria-label': t('deals.stageOf', { title: dealTitle(ctx.ws, deal) }),
    onchange: (e) => moveDeal(ctx, deal.id, e.target.value),
  }, STAGES.map((s) => h('option', { value: s.id, selected: s.id === deal.stage }, stageLabel(s.id))));
}

function board(ctx, deals) {
  const { ws } = ctx;
  const money = (n) => wsMoney(ws, n);
  const cols = STAGES.map((stage) => {
    const inStage = deals.filter((d) => d.stage === stage.id);
    const total = inStage.reduce((sum, d) => sum + d.value, 0);
    const col = h('section', { class: 'kcol', 'aria-label': t('deals.stageCol', { stage: stageLabel(stage.id) }) },
      h('header', { class: 'kcol__head' },
        h('div', { class: 'between' },
          h('h3', {}, stageLabel(stage.id)),
          h('span', { class: 'pill' }, num(inStage.length))),
        h('div', { class: 'num kcol__total' }, money(total))));
    const body = h('div', { class: 'kcol__body' });
    if (!inStage.length) body.appendChild(h('p', { class: 'faint small', style: 'padding:8px' }, t('common.empty')));
    inStage
      .sort((a, b) => b.value - a.value)
      .forEach((d) => body.appendChild(h('article', { class: 'kcard' },
        h('div', { class: 'kcard__title' }, dealTitle(ws, d)),
        h('div', { class: 'between', style: 'margin-top:8px' },
          h('span', { class: 'num' }, money(d.value)),
          h('span', { class: 'faint small mono' }, `${d.probability}%`)),
        h('div', { class: 'faint small', style: 'margin-top:4px' }, t('deals.closes', { owner: d.owner, date: fmtDate(d.closeDate) })),
        h('div', { style: 'margin-top:10px' }, stageSelect(ctx, d)))));
    col.appendChild(body);
    return col;
  });
  return h('div', { class: 'kboard' }, cols);
}

function flat(ctx, deals) {
  const { ws } = ctx;
  const money = (n) => wsMoney(ws, n);
  const rows = [...deals].sort((a, b) => b.value - a.value);
  const table = h('table', { class: 'data' },
    h('thead', {}, h('tr', {},
      h('th', {}, t('deals.thDeal')), h('th', {}, t('deals.thAccount')), h('th', {}, t('deals.thOwner')),
      h('th', {}, t('deals.thStage')), h('th', {}, t('deals.thCloses')),
      h('th', { class: 'right' }, t('deals.thValue')), h('th', { class: 'right' }, t('deals.thMove')))),
    h('tbody', {}, rows.map((d) => h('tr', {},
      h('td', {}, h('div', { style: 'font-weight:600' }, dealTitle(ws, d)), h('div', { class: 'faint small mono' }, t('deals.likely', { p: d.probability }))),
      h('td', {}, customerName(ws, d.customerId)),
      h('td', {}, d.owner),
      h('td', {}, statusPill(d.stage, stageLabel(d.stage))),
      h('td', { class: 'mono small' }, fmtDate(d.closeDate)),
      h('td', { class: 'right num' }, money(d.value)),
      h('td', { class: 'right' }, stageSelect(ctx, d))))));
  return h('div', { class: 'tablewrap tablewrap--scroll' }, table);
}

function newDeal(ctx) {
  const { ws, rerender } = ctx;
  const owners = ws.members.filter((m) => m.status === 'active').map((m) => m.name);
  const form = h('div', {},
    h('label', { class: 'field' }, h('span', { class: 'field__label' }, t('deals.fAccount')),
      h('select', { class: 'select', dataset: { f: 'customer' } },
        [...ws.customers].sort((a, b) => a.name.localeCompare(b.name)).map((c) => h('option', { value: c.id }, c.name)))),
    h('label', { class: 'field' }, h('span', { class: 'field__label' }, t('deals.fWhat')),
      h('input', { class: 'input', dataset: { f: 'title' }, placeholder: t('deals.fWhatPh') })),
    h('label', { class: 'field' }, h('span', { class: 'field__label' }, t('deals.fValue')),
      h('input', { class: 'input mono', dataset: { f: 'value' }, type: 'number', min: '0', step: '1000', value: '250000' })),
    h('label', { class: 'field' }, h('span', { class: 'field__label' }, t('deals.fStage')),
      h('select', { class: 'select', dataset: { f: 'stage' } }, STAGES.map((s) => h('option', { value: s.id }, stageLabel(s.id))))),
    h('label', { class: 'field' }, h('span', { class: 'field__label' }, t('deals.fOwner')),
      h('select', { class: 'select', dataset: { f: 'owner' } }, owners.map((o) => h('option', { value: o }, o)))));

  modal({
    title: t('deals.new'),
    body: form,
    actions: [
      { label: t('common.cancel') },
      {
        label: t('deals.create'),
        class: 'btn--primary',
        onClick: (bodyEl) => {
          const get = (f) => bodyEl.querySelector(`[data-f="${f}"]`).value;
          const cust = ws.customers.find((c) => c.id === get('customer'));
          const what = get('title').trim();
          const value = Math.max(0, Number(get('value')) || 0);
          const stage = get('stage');
          const id = `${ws.id}-d${Date.now().toString(36)}`;
          store.update((s) => {
            s.workspaces[ws.id].deals.unshift({
              id,
              ws: ws.id,
              /* a title the reader typed is kept verbatim; the default is a key,
                 so an untitled deal still reads in whichever language is on */
              title: what ? `${cust.name} — ${what}` : undefined,
              kindKey: what ? undefined : 'new',
              customerId: cust.id,
              stage,
              value,
              owner: get('owner'),
              probability: stage === 'won' ? 100 : stage === 'lost' ? 0 : 40,
              openedAt: new Date().toISOString(),
              updatedAt: new Date().toISOString(),
              closeDate: new Date(Date.now() + 30 * 86400000).toISOString(),
            });
          });
          logActivity(ws.id, 'deal', 'dealCreated', { wsId: ws.id, titleOf: id });
          toast(t('deals.added'), 'ok');
          rerender();
        },
      },
    ],
  });
}
