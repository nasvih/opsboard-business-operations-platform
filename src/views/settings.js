/* Settings — workspace identity, currency, plan and seats. */

import { h, toast, confirmDialog, fmtDate, num } from '../../lib/ui.js';
import {
  store, PLANS, CURRENCIES, FISCAL_MONTHS, seatsUsed, logActivity, resetDemo, STORE_KEY,
  planLabel, currencyLabel, monthLabel, industryLabel,
} from '../data.js';
import { t } from '../main.js';
import { pageHead, statCard, wsMoney, defList, iconEl } from '../parts.js';

export function render(ctx) {
  const { ws, rerender } = ctx;
  const root = h('div', { class: 'view view--pad' });
  const used = seatsUsed(ws);
  const plan = PLANS.find((p) => p.id === ws.plan) || PLANS[0];

  root.appendChild(pageHead(t('settings.title'), t('settings.sub')));

  root.appendChild(h('div', { class: 'grid g4' },
    statCard(t('settings.plan'), planLabel(plan.id), t('settings.perMonth', { amount: wsMoney(ws, plan.priceInr) }), true),
    statCard(t('settings.seats'), `${used} / ${ws.seatsIncluded}`, used > ws.seatsIncluded ? t('settings.overAllowance') : t('settings.withinAllowance')),
    statCard(t('settings.currency'), ws.currency, t('settings.currencySub')),
    statCard(t('settings.records'), num(ws.customers.length + ws.deals.length + ws.invoices.length), t('settings.recordsSub'))));

  /* identity */
  const nameInput = h('input', { class: 'input', value: ws.name, 'aria-label': t('settings.fName'), maxlength: '48' });
  const cityInput = h('input', { class: 'input', value: ws.city, 'aria-label': t('settings.fCity'), maxlength: '40' });
  const industryInput = h('input', { class: 'input', value: industryLabel(ws.industry), 'aria-label': t('settings.fIndustry'), maxlength: '48' });
  const fiscalSel = h('select', { class: 'select', 'aria-label': t('settings.fFiscal') },
    FISCAL_MONTHS.map((m) => h('option', { value: m, selected: m === ws.fiscalStart }, monthLabel(m))));

  root.appendChild(h('div', { class: 'card', style: 'margin-top:20px' },
    h('div', { class: 'card__head' }, h('h3', {}, t('settings.workspace'))),
    h('div', { class: 'grid g2' },
      h('label', { class: 'field' }, h('span', { class: 'field__label' }, t('settings.fName')), nameInput),
      h('label', { class: 'field' }, h('span', { class: 'field__label' }, t('settings.fCity')), cityInput),
      h('label', { class: 'field' }, h('span', { class: 'field__label' }, t('settings.fIndustry')), industryInput),
      h('label', { class: 'field' }, h('span', { class: 'field__label' }, t('settings.fFiscal')), fiscalSel)),
    h('div', { class: 'btnrow', style: 'margin-top:16px' },
      h('button', {
        class: 'btn btn--primary',
        onclick: () => {
          const name = nameInput.value.trim();
          if (!name) { toast(t('settings.needName'), 'bad'); return; }
          store.update((s) => {
            const target = s.workspaces[ws.id];
            target.name = name;
            target.city = cityInput.value.trim() || target.city;
            /* left as it was, the field still holds the word this language
               reads the stored key as — so only a real edit is written */
            const trade = industryInput.value.trim();
            target.industry = (!trade || trade === industryLabel(ws.industry)) ? target.industry : trade;
            target.fiscalStart = fiscalSel.value;
          });
          logActivity(ws.id, 'customer', 'wsUpdated', { name });
          toast(t('settings.saved'), 'ok');
          rerender();
        },
      }, iconEl('check'), t('settings.save')),
      h('button', {
        class: 'btn',
        onclick: () => { nameInput.value = ws.name; cityInput.value = ws.city; industryInput.value = industryLabel(ws.industry); fiscalSel.value = ws.fiscalStart; },
      }, t('settings.undo')))));

  /* currency + plan */
  const curSel = h('select', {
    class: 'select', 'aria-label': t('settings.fCurrency'),
    onchange: (e) => {
      store.update((s) => { s.workspaces[ws.id].currency = e.target.value; });
      toast(t('settings.currencyToast', { id: e.target.value }), 'ok');
      rerender();
    },
  }, CURRENCIES.map((c) => h('option', { value: c.id, selected: c.id === ws.currency }, t('settings.currencyOpt', { id: c.id, label: currencyLabel(c.id) }))));

  const seatsInput = h('input', {
    class: 'input mono', type: 'number', min: String(used), max: '200',
    value: String(ws.seatsIncluded), 'aria-label': t('settings.seatsIncluded'),
  });

  root.appendChild(h('div', { class: 'grid g2', style: 'margin-top:20px' },
    h('div', { class: 'card' },
      h('div', { class: 'card__head' }, h('h3', {}, t('settings.billing'))),
      h('div', { class: 'planlist' }, PLANS.map((p) => h('label', { class: `planopt${p.id === ws.plan ? ' is-on' : ''}` },
        h('input', {
          type: 'radio', name: 'plan', value: p.id, checked: p.id === ws.plan,
          onchange: () => {
            store.update((s) => {
              s.workspaces[ws.id].plan = p.id;
              s.workspaces[ws.id].seatsIncluded = Math.max(p.seats, seatsUsed(s.workspaces[ws.id]));
            });
            logActivity(ws.id, 'team', 'planChanged', { plan: p.id });
            toast(t('settings.planSwitched', { plan: planLabel(p.id) }), 'ok');
            rerender();
          },
        }),
        h('span', {},
          h('span', { style: 'font-weight:600' }, planLabel(p.id)),
          h('span', { class: 'faint small mono', style: 'display:block' }, t('settings.planSub', { seats: p.seats, amount: wsMoney(ws, p.priceInr) })))))),
      h('label', { class: 'field', style: 'margin-top:16px' },
        h('span', { class: 'field__label' }, t('settings.seatsIncluded')), seatsInput),
      h('div', { class: 'btnrow', style: 'margin-top:12px' },
        h('button', {
          class: 'btn',
          onclick: () => {
            const n = Math.max(used, Math.min(200, Number(seatsInput.value) || used));
            store.update((s) => { s.workspaces[ws.id].seatsIncluded = n; });
            toast(t('settings.seatsSet', { n }), 'ok');
            rerender();
          },
        }, t('settings.updateSeats'))),
      h('p', { class: 'hint' }, t('settings.seatsHint', { n: used }))),

    h('div', { class: 'card' },
      h('div', { class: 'card__head' }, h('h3', {}, t('settings.regional'))),
      h('label', { class: 'field' }, h('span', { class: 'field__label' }, t('settings.fCurrency')), curSel),
      h('p', { class: 'hint' }, t('settings.currencyHint')),
      h('div', { class: 'hr' }),
      defList([
        [t('settings.dlId'), h('span', { class: 'mono', dir: 'ltr' }, ws.id)],
        [t('settings.dlSeeded'), fmtDate(store.state.seededAt)],
        [t('settings.dlKey'), h('span', { class: 'mono', dir: 'ltr' }, STORE_KEY)],
        [t('settings.dlUser'), store.state.user.name],
      ]))));

  /* demo data */
  root.appendChild(h('div', { class: 'card', style: 'margin-top:20px;border-color:var(--bad-line)' },
    h('div', { class: 'card__head' }, h('h3', {}, t('settings.demo'))),
    h('p', { class: 'muted small' }, t('settings.demoBody')),
    h('div', { class: 'btnrow', style: 'margin-top:14px' },
      h('button', {
        class: 'btn btn--danger',
        onclick: async () => {
          const ok = await confirmDialog(t('settings.resetBody'),
            { title: t('side.reset'), danger: true, okLabel: t('side.resetOk') });
          if (!ok) return;
          resetDemo();
          toast(t('side.resetDone'), 'ok');
          rerender({ full: true });
        },
      }, iconEl('refresh'), t('side.reset')))));

  return root;
}
