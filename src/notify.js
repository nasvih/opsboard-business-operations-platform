/* ============================================================
   Opsboard — notifications, built from the workspace's own records.

   Nothing is pushed and nothing is stored: the list is recomputed from
   the live store every time the bell is painted, so it always describes
   what is actually in the workspace. Only the read/unread marks persist,
   and they live in the app's chrome key alongside the sidebar settings.

   Every entry carries a stable id so a mark stays put across reloads,
   a word as well as a colour, and the screen it belongs to.
   ============================================================ */

import { money, fmtDate, ago } from '../lib/ui.js';
import {
  currencySymbol, overdueInvoices, invoiceAgeDays, customerName,
  seatsUsed, openDeals, changesSince,
} from './data.js';

const cur = (ws, n) => money(n, currencySymbol(ws.currency));
const days = (iso) => Math.round((new Date(iso).getTime() - Date.now()) / 86400000);

const ACTIVITY_SCREEN = {
  deal: 'deals', invoice: 'invoices', customer: 'customers', team: 'team', note: 'customers',
};

export function buildNotifications(ws) {
  const out = [];

  /* 1. money that is late — the three oldest, worst first */
  const late = overdueInvoices(ws).slice().sort((a, b) => invoiceAgeDays(b) - invoiceAgeDays(a));
  late.slice(0, 3).forEach((i) => {
    const age = invoiceAgeDays(i);
    out.push({
      id: `inv:${i.id}`,
      tag: 'Overdue',
      kind: 'bad',
      title: `${i.number} is ${age} ${age === 1 ? 'day' : 'days'} past due`,
      line: `${customerName(ws, i.customerId)} owes ${cur(ws, i.amount)}. Chase it, or mark it paid when the money lands.`,
      at: i.dueAt,
      nav: 'invoices',
      sort: 1000 + age,
    });
  });
  if (late.length > 3) {
    const rest = late.slice(3);
    out.push({
      id: `inv-more:${ws.id}:${late.length}`,
      tag: 'Overdue',
      kind: 'bad',
      title: `${rest.length} more invoices are past due`,
      line: `A further ${cur(ws, rest.reduce((t, i) => t + i.amount, 0))} sits behind the three above.`,
      at: rest[0].dueAt,
      nav: 'invoices',
      sort: 900,
    });
  }

  /* 2. deals with a close date inside the next seven days, or already past it */
  openDeals(ws)
    .filter((d) => days(d.closeDate) <= 7)
    .sort((a, b) => new Date(a.closeDate) - new Date(b.closeDate))
    .slice(0, 4)
    .forEach((d) => {
      const n = days(d.closeDate);
      out.push({
        id: `deal:${d.id}`,
        tag: n < 0 ? 'Slipping' : 'Closing',
        kind: n < 0 ? 'warn' : 'info',
        title: n < 0
          ? `${d.title} passed its close date ${Math.abs(n)} ${Math.abs(n) === 1 ? 'day' : 'days'} ago`
          : `${d.title} is due to close ${n === 0 ? 'today' : `in ${n} ${n === 1 ? 'day' : 'days'}`}`,
        line: `${cur(ws, d.value)} at ${d.probability}% likely, ${d.owner} owns it. Currently in ${d.stage}.`,
        at: d.closeDate,
        nav: 'deals',
        sort: n < 0 ? 800 : 700 - n,
      });
    });

  /* 3. seats — only worth saying when the plan is nearly full */
  const used = seatsUsed(ws);
  const share = ws.seatsIncluded ? used / ws.seatsIncluded : 0;
  if (share >= 0.8) {
    const over = used > ws.seatsIncluded;
    out.push({
      id: `seats:${ws.id}:${used}/${ws.seatsIncluded}`,
      tag: 'Seats',
      kind: over ? 'bad' : 'warn',
      title: over
        ? `${used - ws.seatsIncluded} seats over the ${ws.plan} plan`
        : `${ws.seatsIncluded - used} of ${ws.seatsIncluded} seats left`,
      line: over
        ? 'Change the plan in Settings, or remove access for someone who has left.'
        : 'Invites count against the allowance as soon as they are sent.',
      at: new Date().toISOString(),
      nav: 'team',
      sort: over ? 950 : 600,
    });
  }

  /* 4. what people did — the four newest entries from the last three days */
  changesSince(ws, 3).slice(0, 4).forEach((a) => {
    out.push({
      id: `act:${a.id}`,
      tag: 'Change',
      kind: 'info',
      title: a.text,
      line: `${a.actor} · ${ago(a.at)}`,
      at: a.at,
      nav: ACTIVITY_SCREEN[a.type] || 'overview',
      sort: 500,
    });
  });

  return out
    .sort((a, b) => b.sort - a.sort || new Date(b.at) - new Date(a.at))
    .slice(0, 14);
}

/* used for the "3 days ago" line under an item */
export const notifWhen = (n) => (new Date(n.at) > new Date() ? `due ${fmtDate(n.at)}` : ago(n.at));
