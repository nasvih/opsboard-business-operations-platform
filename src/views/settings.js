/* Settings — workspace identity, currency, plan and seats. */

import { h, toast, confirmDialog, fmtDate, num } from '../../lib/ui.js';
import {
  store, PLANS, CURRENCIES, seatsUsed, logActivity, resetDemo, STORE_KEY,
} from '../data.js';
import { pageHead, statCard, wsMoney, defList, iconEl } from '../parts.js';

export function render(ctx) {
  const { ws, rerender } = ctx;
  const root = h('div', { class: 'view view--pad' });
  const used = seatsUsed(ws);
  const plan = PLANS.find((p) => p.id === ws.plan) || PLANS[0];

  root.appendChild(pageHead('Settings',
    'Workspace level configuration. Each workspace keeps its own name, currency, plan and seat allowance.'));

  root.appendChild(h('div', { class: 'grid g4' },
    statCard('Plan', plan.label, `${wsMoney(ws, plan.priceInr)} per month`, true),
    statCard('Seats', `${used} / ${ws.seatsIncluded}`, used > ws.seatsIncluded ? 'over allowance' : 'within allowance'),
    statCard('Currency', ws.currency, 'used across every screen'),
    statCard('Records', num(ws.customers.length + ws.deals.length + ws.invoices.length), 'customers, deals, invoices')));

  /* identity */
  const nameInput = h('input', { class: 'input', value: ws.name, 'aria-label': 'Workspace name', maxlength: '48' });
  const cityInput = h('input', { class: 'input', value: ws.city, 'aria-label': 'Primary location', maxlength: '40' });
  const industryInput = h('input', { class: 'input', value: ws.industry, 'aria-label': 'Industry', maxlength: '48' });
  const fiscalSel = h('select', { class: 'select', 'aria-label': 'Financial year starts' },
    ['January', 'April', 'July', 'October'].map((m) => h('option', { value: m, selected: m === ws.fiscalStart }, m)));

  root.appendChild(h('div', { class: 'card', style: 'margin-top:20px' },
    h('div', { class: 'card__head' }, h('h3', {}, 'Workspace')),
    h('div', { class: 'grid g2' },
      h('label', { class: 'field' }, h('span', { class: 'field__label' }, 'Workspace name'), nameInput),
      h('label', { class: 'field' }, h('span', { class: 'field__label' }, 'Primary location'), cityInput),
      h('label', { class: 'field' }, h('span', { class: 'field__label' }, 'Industry'), industryInput),
      h('label', { class: 'field' }, h('span', { class: 'field__label' }, 'Financial year starts'), fiscalSel)),
    h('div', { class: 'btnrow', style: 'margin-top:16px' },
      h('button', {
        class: 'btn btn--primary',
        onclick: () => {
          const name = nameInput.value.trim();
          if (!name) { toast('A workspace needs a name', 'bad'); return; }
          store.update((s) => {
            const t = s.workspaces[ws.id];
            t.name = name;
            t.city = cityInput.value.trim() || t.city;
            t.industry = industryInput.value.trim() || t.industry;
            t.fiscalStart = fiscalSel.value;
          });
          logActivity(ws.id, 'customer', `Workspace details updated — ${name}`);
          toast('Workspace saved', 'ok');
          rerender();
        },
      }, iconEl('check'), 'Save workspace'),
      h('button', {
        class: 'btn',
        onclick: () => { nameInput.value = ws.name; cityInput.value = ws.city; industryInput.value = ws.industry; fiscalSel.value = ws.fiscalStart; },
      }, 'Undo edits'))));

  /* currency + plan */
  const curSel = h('select', {
    class: 'select', 'aria-label': 'Reporting currency',
    onchange: (e) => {
      store.update((s) => { s.workspaces[ws.id].currency = e.target.value; });
      toast(`Amounts now shown in ${e.target.value}`, 'ok');
      rerender();
    },
  }, CURRENCIES.map((c) => h('option', { value: c.id, selected: c.id === ws.currency }, `${c.id} — ${c.label}`)));

  const seatsInput = h('input', {
    class: 'input mono', type: 'number', min: String(used), max: '200',
    value: String(ws.seatsIncluded), 'aria-label': 'Seats included',
  });

  root.appendChild(h('div', { class: 'grid g2', style: 'margin-top:20px' },
    h('div', { class: 'card' },
      h('div', { class: 'card__head' }, h('h3', {}, 'Billing')),
      h('div', { class: 'planlist' }, PLANS.map((p) => h('label', { class: `planopt${p.id === ws.plan ? ' is-on' : ''}` },
        h('input', {
          type: 'radio', name: 'plan', value: p.id, checked: p.id === ws.plan,
          onchange: () => {
            store.update((s) => {
              s.workspaces[ws.id].plan = p.id;
              s.workspaces[ws.id].seatsIncluded = Math.max(p.seats, seatsUsed(s.workspaces[ws.id]));
            });
            logActivity(ws.id, 'team', `Plan changed to ${p.label}`);
            toast(`Switched to the ${p.label} plan`, 'ok');
            rerender();
          },
        }),
        h('span', {},
          h('span', { style: 'font-weight:600' }, p.label),
          h('span', { class: 'faint small mono', style: 'display:block' }, `${p.seats} seats · ${wsMoney(ws, p.priceInr)} / month`))))),
      h('label', { class: 'field', style: 'margin-top:16px' },
        h('span', { class: 'field__label' }, 'Seats included'), seatsInput),
      h('div', { class: 'btnrow', style: 'margin-top:12px' },
        h('button', {
          class: 'btn',
          onclick: () => {
            const n = Math.max(used, Math.min(200, Number(seatsInput.value) || used));
            store.update((s) => { s.workspaces[ws.id].seatsIncluded = n; });
            toast(`Seat allowance set to ${n}`, 'ok');
            rerender();
          },
        }, 'Update seats')),
      h('p', { class: 'hint' }, `Seat allowance cannot drop below the ${used} people already in this workspace.`)),

    h('div', { class: 'card' },
      h('div', { class: 'card__head' }, h('h3', {}, 'Regional')),
      h('label', { class: 'field' }, h('span', { class: 'field__label' }, 'Reporting currency'), curSel),
      h('p', { class: 'hint' }, 'Changing this only changes the symbol shown next to demo amounts; no conversion is applied.'),
      h('div', { class: 'hr' }),
      defList([
        ['Workspace id', h('span', { class: 'mono' }, ws.id)],
        ['Seeded', fmtDate(store.state.seededAt)],
        ['Storage key', h('span', { class: 'mono' }, STORE_KEY)],
        ['Signed in as', store.state.user.name],
      ]))));

  /* demo data */
  root.appendChild(h('div', { class: 'card', style: 'margin-top:20px;border-color:var(--bad-line)' },
    h('div', { class: 'card__head' }, h('h3', {}, 'Demo data')),
    h('p', { class: 'muted small' },
      'Everything in Opsboard is generated in your browser from a fixed seed and stored in localStorage. ' +
      'Resetting rebuilds all three workspaces and discards every edit you have made.'),
    h('div', { class: 'btnrow', style: 'margin-top:14px' },
      h('button', {
        class: 'btn btn--danger',
        onclick: async () => {
          const ok = await confirmDialog('All three workspaces will be regenerated from the seed. Edits, notes and invites will be lost.',
            { title: 'Reset demo data', danger: true, okLabel: 'Reset everything' });
          if (!ok) return;
          resetDemo();
          toast('Demo data reset', 'ok');
          rerender({ full: true });
        },
      }, iconEl('refresh'), 'Reset demo data'))));

  return root;
}
