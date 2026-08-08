/* ============================================================
   Opsboard Copilot — the in-product assistant.

   It has no model behind it. Every reply is assembled here, in the
   browser, from the workspace the user is currently looking at, so the
   numbers always agree with what is on screen and change the moment the
   user edits something.
   ============================================================ */

import { Assistant } from '../lib/assistant.js';
import { money, num, pct, fmtDate, ago } from '../lib/ui.js';
import {
  store, activeWorkspace, WORKSPACE_IDS, STAGES, stageLabel, currencySymbol,
  quarterRevenue, revenueByMonth, pipelineValue, openDeals, overdueInvoices,
  outstandingValue, agingBuckets, invoiceAgeDays, seatsUsed, changesSince,
  atRiskCustomers, customerName, monthKeys,
} from './data.js';

const cur = (ws, n) => money(n, currencySymbol(ws.currency));
const plural = (n, one, many) => `${num(n)} ${n === 1 ? one : many || `${one}s`}`;

function settledByCustomer(ws) {
  const totals = {};
  ws.invoices.filter((i) => i.status === 'paid').forEach((i) => { totals[i.customerId] = (totals[i.customerId] || 0) + i.amount; });
  return Object.entries(totals).sort((a, b) => b[1] - a[1]);
}

function findCustomer(ws, q) {
  const text = q.toLowerCase();
  let best = null;
  ws.customers.forEach((c) => {
    const name = c.name.toLowerCase();
    if (text.includes(name)) { if (!best || name.length > best.name.length) best = c; return; }
    const first = name.split(' ')[0];
    if (first.length > 4 && text.includes(first) && !best) best = c;
  });
  return best;
}

function findDeal(ws, q) {
  const text = q.toLowerCase();
  const cust = findCustomer(ws, q);
  if (cust) {
    const mine = ws.deals.filter((d) => d.customerId === cust.id);
    if (mine.length) return mine.sort((a, b) => b.value - a.value)[0];
  }
  const named = ws.deals.find((d) => text.includes(d.title.toLowerCase().slice(0, 18)));
  if (named) return named;
  /* superlatives — "who owns the biggest deal", "the smallest one" */
  const pool = openDeals(ws).length ? openDeals(ws) : ws.deals;
  if (!pool.length) return null;
  const byValue = pool.slice().sort((a, b) => b.value - a.value);
  if (/\b(biggest|largest|highest|top|most valuable|best)\b/.test(text)) return byValue[0];
  if (/\b(smallest|lowest|least)\b/.test(text)) return byValue[byValue.length - 1];
  if (/\b(closest|soonest|next)\b/.test(text)) {
    return pool.slice().sort((a, b) => new Date(a.closeDate) - new Date(b.closeDate))[0];
  }
  return null;
}

/* Same definition the Reports screen uses, so the two never disagree. */
function collection(ws) {
  const issued = ws.invoices.filter((i) => i.status !== 'draft');
  const settled = issued.filter((i) => i.status === 'paid');
  const issuedValue = issued.reduce((t, i) => t + i.amount, 0);
  const settledValue = settled.reduce((t, i) => t + i.amount, 0);
  const days = settled.filter((i) => i.paidAt)
    .map((i) => Math.round((new Date(i.paidAt) - new Date(i.issuedAt)) / 86400000));
  return {
    issued,
    settled,
    issuedValue,
    settledValue,
    rate: issuedValue ? (settledValue / issuedValue) * 100 : 0,
    avgDays: days.length ? Math.round(days.reduce((t, d) => t + d, 0) / days.length) : 0,
    avgTerms: issued.length ? Math.round(issued.reduce((t, i) => t + i.terms, 0) / issued.length) : 0,
  };
}

/* ---------- intents ---------- */

const intents = [
  {
    id: 'revenue',
    match: [/revenue|turnover|collect(ed|s)?\b|billed|how much did we (make|bill)|this quarter|q[1-4]\b/i],
    trace: 'summed settled invoices in this workspace',
    answer: (q, ctx) => {
      const { ws } = ctx;
      const qr = quarterRevenue(ws);
      const months = revenueByMonth(ws, 6);
      const last = months[months.length - 1];
      const prev = months[months.length - 2] || { value: 0, label: '—' };
      const delta = prev.value ? ((last.value - prev.value) / prev.value) * 100 : 0;
      return {
        text: `**${ws.name}** settled **${cur(ws, qr.total)}** in ${qr.label} across ${plural(qr.count, 'invoice')}.\n`
          + `${last.label} to date is at ${cur(ws, last.value)}, ${delta >= 0 ? 'up' : 'down'} ${pct(Math.abs(delta), 1)} on ${prev.label}.\n`
          + `Still outstanding: ${cur(ws, outstandingValue(ws))}.`,
        table: {
          head: ['Month', 'Settled'],
          rows: months.map((m) => [m.label, cur(ws, m.value)]),
        },
        meta: `read ${ws.invoices.length} invoices · ${ws.name}`,
        suggestions: ['Which invoices are overdue?', 'Show the pipeline by stage', 'Top accounts by revenue'],
      };
    },
  },
  {
    id: 'overdue',
    match: [/overdue|late|unpaid|past due|receivable|aging|ageing|chase/i, 'overdue', 'unpaid'],
    trace: 'checked due dates against today',
    answer: (q, ctx) => {
      const { ws } = ctx;
      const list = overdueInvoices(ws).sort((a, b) => invoiceAgeDays(b) - invoiceAgeDays(a));
      if (!list.length) {
        return { text: `Nothing is overdue in **${ws.name}** right now. Open receivables sit at ${cur(ws, outstandingValue(ws))}.` };
      }
      const total = list.reduce((t, i) => t + i.amount, 0);
      const buckets = agingBuckets(ws);
      return {
        text: `**${plural(list.length, 'invoice')}** past due in ${ws.name}, worth **${cur(ws, total)}**.\n`
          + `The oldest is ${list[0].number} for ${customerName(ws, list[0].customerId)}, ${invoiceAgeDays(list[0])} days late.\n`
          + `Aging: ${buckets.slice(1).map((b) => `${b.label} ${cur(ws, b.total)}`).join(' · ')}.`,
        table: {
          head: ['Invoice', 'Account', 'Days late', 'Amount'],
          rows: list.slice(0, 6).map((i) => [i.number, customerName(ws, i.customerId), String(invoiceAgeDays(i)), cur(ws, i.amount)]),
        },
        suggestions: ['Which customers are at risk?', 'What is the collection rate?', 'What changed this week?'],
      };
    },
  },
  {
    id: 'collection',
    match: [/collection rate|collections|how much have we collected|settled vs issued|paid vs issued|\bdso\b|days to pay|(quickly|fast|long).{0,24}(pay|paid|settle)|payment behaviour|payment behavior/i,
      'collection rate', 'collection'],
    trace: 'compared settled invoice value against everything issued',
    answer: (q, ctx) => {
      const { ws } = ctx;
      const c = collection(ws);
      if (!c.issued.length) return { text: `Nothing has been issued in **${ws.name}** yet, so there is no collection rate to report.` };
      const late = overdueInvoices(ws);
      const counts = ['paid', 'sent', 'overdue', 'draft'].map((s) => {
        const rows = ws.invoices.filter((i) => i.status === s);
        return [s, String(rows.length), cur(ws, rows.reduce((t, i) => t + i.amount, 0))];
      });
      return {
        text: `**${ws.name}** has collected **${pct(c.rate, 1)}** of what it has issued — `
          + `${cur(ws, c.settledValue)} settled out of ${cur(ws, c.issuedValue)} across ${plural(c.issued.length, 'issued invoice')}. Drafts are left out.\n`
          + `Settled invoices take **${plural(c.avgDays, 'day')}** to come in on average, against credit terms averaging ${c.avgTerms} days.\n`
          + (late.length
            ? `${cur(ws, outstandingValue(ws))} is still open, and ${cur(ws, late.reduce((t, i) => t + i.amount, 0))} of that is already past due.`
            : `${cur(ws, outstandingValue(ws))} is still open and none of it is past due.`),
        table: { head: ['Status', 'Invoices', 'Value'], rows: counts },
        meta: `read ${ws.invoices.length} invoices · ${ws.name}`,
        suggestions: ['Which invoices are overdue?', 'Top accounts by revenue', 'What is the revenue this quarter?'],
      };
    },
  },
  {
    id: 'dealowner',
    match: [/who owns|owner of|whose deal|responsible for|handling|(biggest|largest|top|smallest) deal/i, 'who owns', 'owner', 'biggest deal'],
    trace: 'matched the question against open deals',
    answer: (q, ctx) => {
      const { ws } = ctx;
      const deal = findDeal(ws, q);
      if (deal) {
        const cust = customerName(ws, deal.customerId);
        return {
          text: `**${deal.owner}** owns *${deal.title}*.\n`
            + `Stage ${stageLabel(deal.stage)}, worth ${cur(ws, deal.value)} at ${deal.probability}% likely, expected to close ${fmtDate(deal.closeDate)}.\n`
            + `The account ${cust} is handled by ${(ws.customers.find((c) => c.id === deal.customerId) || {}).owner}.`,
          meta: `matched 1 of ${ws.deals.length} deals`,
          suggestions: ['Show the pipeline by stage', 'Who has admin access?', 'Which customers are at risk?'],
        };
      }
      const top = openDeals(ws).sort((a, b) => b.value - a.value).slice(0, 5);
      return {
        text: `I could not tell which deal you meant. These are the five biggest open ones in **${ws.name}** with their owners.`,
        table: { head: ['Deal', 'Owner', 'Stage', 'Value'], rows: top.map((d) => [d.title, d.owner, stageLabel(d.stage), cur(ws, d.value)]) },
        suggestions: ['Show the pipeline by stage', 'Who has admin access?'],
      };
    },
  },
  {
    id: 'atrisk',
    match: [/at risk|at-risk|churn|losing|dormant|quiet accounts|unhappy/i, 'at risk', 'churn'],
    trace: 'cross-checked status, overdue invoices and order gaps',
    answer: (q, ctx) => {
      const { ws } = ctx;
      const risk = atRiskCustomers(ws);
      if (!risk.length) return { text: `No account in **${ws.name}** is flagged at risk today.` };
      const exposed = risk.reduce((t, r) => t + r.overdue, 0);
      return {
        text: `**${risk.length} of ${ws.customers.length}** accounts in ${ws.name} need attention.\n`
          + `${cur(ws, exposed)} of overdue money sits with them.\n`
          + `Top of the list: ${risk[0].customer.name} — ${risk[0].reasons.join(', ')}.`,
        table: {
          head: ['Account', 'Why', 'Overdue'],
          rows: risk.slice(0, 6).map((r) => [r.customer.name, r.reasons.join(', '), r.overdue ? cur(ws, r.overdue) : '—']),
        },
        suggestions: ['Which invoices are overdue?', 'Top accounts by revenue', 'What changed this week?'],
      };
    },
  },
  {
    id: 'seats',
    match: [/seat|licence|license|plan|billing|how many people|users on/i, 'seats', 'plan'],
    trace: 'counted members against the plan allowance',
    answer: (q, ctx) => {
      const { ws } = ctx;
      const used = seatsUsed(ws);
      const invited = ws.members.filter((m) => m.status === 'invited').length;
      const free = ws.seatsIncluded - used;
      return {
        text: `**${ws.name}** is on the ${ws.plan} plan with ${ws.seatsIncluded} seats.\n`
          + `${plural(used, 'seat')} taken, including ${plural(invited, 'invite')} not yet accepted, leaving **${free < 0 ? 0 : free}**.\n`
          + (free < 0 ? `You are ${Math.abs(free)} seats over the allowance — change the plan in Settings.` : 'You are inside the allowance.'),
        table: {
          head: ['Role', 'People'],
          rows: ['owner', 'admin', 'member', 'viewer'].map((r) => [r, String(ws.members.filter((m) => m.role === r).length)]),
        },
        suggestions: ['Who has admin access?', 'What changed this week?'],
      };
    },
  },
  {
    id: 'changes',
    match: [/what changed|this week|recent|latest|activity|happened|updates/i, 'what changed', 'this week'],
    trace: 'read the workspace activity log',
    answer: (q, ctx) => {
      const { ws } = ctx;
      const week = changesSince(ws, 7);
      if (!week.length) return { text: `Nothing has been recorded in **${ws.name}** in the last 7 days. Move a deal or settle an invoice and it will show up here.` };
      const byType = {};
      week.forEach((a) => { byType[a.type] = (byType[a.type] || 0) + 1; });
      return {
        text: `**${plural(week.length, 'change')}** in ${ws.name} over the last 7 days: `
          + `${Object.entries(byType).map(([k, v]) => `${v} ${k}`).join(', ')}.\n`
          + `Most recent: ${week[0].text} (${ago(week[0].at)}, by ${week[0].actor}).`,
        table: { head: ['When', 'Change', 'By'], rows: week.slice(0, 6).map((a) => [ago(a.at), a.text, a.actor]) },
        suggestions: ['Show the pipeline by stage', 'Which invoices are overdue?'],
      };
    },
  },
  {
    id: 'pipeline',
    match: [/pipeline|stage|deals|forecast|weighted|win rate|opportunit/i, 'pipeline', 'stage'],
    trace: 'grouped deals by stage',
    answer: (q, ctx) => {
      const { ws } = ctx;
      const open = openDeals(ws);
      const weighted = open.reduce((t, d) => t + (d.value * d.probability) / 100, 0);
      const closed = ws.deals.filter((d) => d.stage === 'won' || d.stage === 'lost');
      const winRate = closed.length ? (ws.deals.filter((d) => d.stage === 'won').length / closed.length) * 100 : 0;
      return {
        text: `**${ws.name}** has ${open.length} open deals worth **${cur(ws, pipelineValue(ws))}**, `
          + `or ${cur(ws, Math.round(weighted))} once you weight them by probability.\n`
          + `Win rate on closed deals is ${pct(winRate)}.`,
        table: {
          head: ['Stage', 'Deals', 'Value'],
          rows: STAGES.map((s) => {
            const inStage = ws.deals.filter((d) => d.stage === s.id);
            return [s.label, String(inStage.length), cur(ws, inStage.reduce((t, d) => t + d.value, 0))];
          }),
        },
        suggestions: ['Who owns the biggest deal?', 'What is the revenue this quarter?'],
      };
    },
  },
  {
    id: 'topcustomers',
    match: [/top (account|customer|client)|best (account|customer|client)|biggest (account|customer|client)|who spends/i, 'top accounts', 'best customers'],
    trace: 'ranked accounts by settled invoices',
    answer: (q, ctx) => {
      const { ws } = ctx;
      const rows = settledByCustomer(ws);
      if (!rows.length) return { text: `No invoice in **${ws.name}** has been settled yet, so there is nothing to rank.` };
      const grand = rows.reduce((t, r) => t + r[1], 0);
      const top3 = rows.slice(0, 3).reduce((t, r) => t + r[1], 0);
      return {
        text: `The top three accounts in **${ws.name}** account for **${pct((top3 / grand) * 100, 1)}** of settled revenue.\n`
          + `${customerName(ws, rows[0][0])} leads with ${cur(ws, rows[0][1])}.`,
        table: {
          head: ['Account', 'Settled', 'Share'],
          rows: rows.slice(0, 6).map(([id, v]) => [customerName(ws, id), cur(ws, v), pct((v / grand) * 100, 1)]),
        },
        suggestions: ['Which customers are at risk?', 'What is the revenue this quarter?'],
      };
    },
  },
  {
    id: 'access',
    match: [/admin|access|permission|role|who can|team|staff list/i, 'admin', 'roles'],
    trace: 'read the member list and role matrix',
    answer: (q, ctx) => {
      const { ws } = ctx;
      const privileged = ws.members.filter((m) => m.role === 'owner' || m.role === 'admin');
      const stale = ws.members.filter((m) => m.status === 'active' && (Date.now() - new Date(m.lastActive).getTime()) > 21 * 86400000);
      const can = (role) => Object.entries(ws.matrix[role]).filter(([, v]) => v).map(([k]) => k).join(', ');
      return {
        text: `**${privileged.length} people** hold owner or admin rights in ${ws.name}: ${privileged.map((m) => m.name).join(', ')}.\n`
          + `Admins currently have: ${can('admin')}. Members have: ${can('member')}.\n`
          + (stale.length ? `${stale.length} active accounts have not signed in for 3 weeks or more.` : 'Everyone has signed in within the last three weeks.'),
        table: {
          head: ['Person', 'Role', 'Status', 'Last active'],
          rows: ws.members.slice(0, 8).map((m) => [m.name, m.role, m.status, m.status === 'invited' ? 'never' : ago(m.lastActive)]),
        },
        suggestions: ['How many seats are left?', 'What changed this week?'],
      };
    },
  },
  {
    id: 'workspaces',
    match: [/workspace|tenant|other business|compare|switch|all three/i, 'workspace', 'tenant'],
    trace: 'compared all workspaces on this device',
    answer: (q, ctx) => {
      const s = ctx.state;
      const rows = WORKSPACE_IDS.map((id) => {
        const w = s.workspaces[id];
        return [w.name + (id === s.activeWs ? ' (open)' : ''), String(w.customers.length),
          cur(w, pipelineValue(w)), cur(w, overdueInvoices(w).reduce((t, i) => t + i.amount, 0))];
      });
      return {
        text: `There are ${WORKSPACE_IDS.length} workspaces in this demo and every screen is scoped to the one selected in the sidebar. `
          + `You are currently in **${ctx.ws.name}**. Switching does not mix data — the figures below are computed separately.`,
        table: { head: ['Workspace', 'Accounts', 'Pipeline', 'Overdue'], rows },
        suggestions: ['What is the revenue this quarter?', 'How many seats are left?'],
      };
    },
  },
  {
    id: 'account',
    match: [/tell me about|look up|details on|account |customer |contact for/i, 'tell me about', 'look up'],
    trace: 'searched the account book',
    answer: (q, ctx) => {
      const { ws } = ctx;
      const c = findCustomer(ws, q);
      if (!c) {
        return {
          text: `I could not find that account in **${ws.name}**. Try one of these names, or ask about the pipeline instead.`,
          table: { head: ['Accounts you can ask about'], rows: ws.customers.slice(0, 6).map((x) => [x.name]) },
        };
      }
      const invs = ws.invoices.filter((i) => i.customerId === c.id);
      const settled = invs.filter((i) => i.status === 'paid').reduce((t, i) => t + i.amount, 0);
      const open = invs.filter((i) => i.status === 'sent' || i.status === 'overdue');
      const deals = ws.deals.filter((d) => d.customerId === c.id);
      return {
        text: `**${c.name}** — ${c.segment}, owned by ${c.owner}, status ${c.status}.\n`
          + `Contact ${c.contactName} on ${c.contactEmail}. Credit terms ${c.creditDays} days, last order ${ago(c.lastOrder)}.\n`
          + `Settled ${cur(ws, settled)} across ${invs.length} invoices, ${open.length} still open worth ${cur(ws, open.reduce((t, i) => t + i.amount, 0))}.`,
        table: deals.length ? { head: ['Deal', 'Stage', 'Value'], rows: deals.map((d) => [d.title, stageLabel(d.stage), cur(ws, d.value)]) } : null,
        suggestions: ['Which customers are at risk?', 'Which invoices are overdue?'],
      };
    },
  },
  {
    id: 'help',
    match: [/what can you|help|how do i|commands|capabilities/i, 'help', 'what can you do'],
    trace: 'listed the intents wired to this workspace',
    answer: (q, ctx) => ({
      text: `I read whatever is in **${ctx.ws.name}** right now. Things I can answer:\n\n`
        + '- revenue this quarter and by month\n'
        + '- overdue invoices and receivables aging\n'
        + '- the collection rate and how long invoices take to settle\n'
        + '- who owns a given deal, including the biggest one\n'
        + '- which accounts are at risk and why\n'
        + '- seat and plan usage\n'
        + '- what changed in the last seven days\n'
        + '- pipeline by stage, weighted forecast and win rate\n'
        + '- top accounts by settled revenue\n'
        + '- who holds admin access\n'
        + '- how the three workspaces compare\n\n'
        + 'Change something on a screen and ask again — the numbers move with it.',
      suggestions: ['What is the revenue this quarter?', 'Which invoices are overdue?', 'How many seats are left?'],
    }),
  },
];

const fallbacks = [
  'I only answer from the data in this workspace. Ask me about revenue, overdue invoices, the pipeline or seat usage.',
  'That one is outside the demo dataset. Try "which invoices are overdue" and I will pull the aging table.',
  'No match for that. I can tell you what changed this week, or which accounts are at risk and why.',
  'I could not map that to anything in the workspace. Ask me who owns a deal, or how the three workspaces compare.',
];

export function createCopilot() {
  const ws = activeWorkspace();
  return new Assistant({
    name: 'Opsboard Copilot',
    initials: 'OC',
    tag: 'Reads this workspace',
    greeting: `I am the Opsboard Copilot. I answer from the workspace open in the sidebar — right now that is **${ws.name}**.\n\nAsk me about revenue, receivables, the pipeline, at-risk accounts or who has access.`,
    suggestions: ['What is the revenue this quarter?', 'Which invoices are overdue?', 'Which customers are at risk?', 'What changed this week?'],
    intents,
    fallbacks,
    note: 'Simulated assistant — answers are matched against this app\'s demo data in your browser. Not a connected model, nothing is sent anywhere.',
    context: () => ({ ws: activeWorkspace(), state: store.state, months: monthKeys(6), n: num }),
  });
}

export { intents as copilotIntents };
