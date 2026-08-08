/* ============================================================
   Opsboard Copilot — the in-product assistant.

   It has no model behind it. Every reply is assembled here, in the
   browser, from the workspace the user is currently looking at, so the
   numbers always agree with what is on screen and change the moment the
   user edits something.
   ============================================================ */

import { Assistant } from '../lib/assistant.js';
import { money, num, pct, fmtDate, ago, toast } from '../lib/ui.js';
import {
  store, activeWorkspace, WORKSPACE_IDS, STAGES, stageLabel, currencySymbol,
  quarterRevenue, revenueByMonth, pipelineValue, openDeals, overdueInvoices,
  outstandingValue, agingBuckets, invoiceAgeDays, seatsUsed, changesSince,
  atRiskCustomers, customerName, monthKeys, logActivity,
  CUSTOMER_STATUS, SEGMENTS, ROLES,
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

/* ============================================================
   Actions — the copilot does things, it does not only report them.

   Every action runs in two steps. The answer names the exact record it
   would touch, shows what it understood, and offers a button; the store
   is only written when the reader presses that button. The applied
   result reports before → after and moves the app to the screen where
   the change is now visible.
   ============================================================ */

/* set by createCopilot so an applied action can jump to the right screen */
let showScreen = () => {};

/* ---------- reading a sentence ---------- */

const STAGE_WORDS = [
  ['won', /\b(closed won|close won|won|signed)\b(?!['’]t)/i],
  ['lost', /\b(closed lost|close lost|lost|dropped|dead)\b/i],
  ['negotiation', /\b(negotiation|negotiations|negotiating|negotiate)\b/i],
  ['proposal', /\b(proposal|proposals|proposed|quote|quotation)\b/i],
  ['qualify', /\b(qualify|qualifying|qualification|qualified)\b/i],
];
function parseStage(q) {
  for (const [id, re] of STAGE_WORDS) if (re.test(q)) return id;
  return null;
}

const STATUS_WORDS = [
  ['at-risk', /\b(at[-\s]?risk|risky|shaky|watch list|watchlist)\b/i],
  ['dormant', /\b(dormant|inactive|asleep|gone quiet)\b/i],
  ['active', /\b(active|healthy|back on track|recovered)\b/i],
];
function parseStatus(q) {
  for (const [id, re] of STATUS_WORDS) if (re.test(q)) return id;
  return null;
}

function parseSegment(q) {
  const hit = SEGMENTS.find((s) => new RegExp(`\\b${s}\\b`, 'i').test(q));
  return hit || null;
}

function parseRole(q) {
  if (/\b(read[-\s]?only|view only)\b/i.test(q)) return 'viewer';
  const hit = ROLES.find((r) => new RegExp(`\\b${r}s?\\b`, 'i').test(q));
  return hit || null;
}

/* "4 lakh", "₹4,00,000", "2.5 crore", "250k", "400000" */
function parseAmount(q) {
  const t = String(q).toLowerCase().replace(/,/g, '');
  let m = t.match(/(\d+(?:\.\d+)?)\s*(?:crores|crore|cr)\b/);
  if (m) return Math.round(parseFloat(m[1]) * 10000000);
  m = t.match(/(\d+(?:\.\d+)?)\s*(?:lakhs|lakh|lacs|lac)\b/);
  if (m) return Math.round(parseFloat(m[1]) * 100000);
  m = t.match(/(\d+(?:\.\d+)?)\s*k\b/);
  if (m) return Math.round(parseFloat(m[1]) * 1000);
  m = t.match(/(?:₹|rs\.?|inr)\s*(\d+(?:\.\d+)?)/);
  if (m) return Math.round(parseFloat(m[1]));
  m = t.match(/\b(\d{4,})\b/);
  if (m) return Number(m[1]);
  return null;
}

const normalise = (s) => String(s).toLowerCase().replace(/[^a-z0-9\s]/g, ' ').replace(/\s+/g, ' ').trim();

/* Account names are two or three words, so a match is scored on how many
   of them the sentence carries. A whole name wins outright; a single shared
   word ("hardware", "traders") is left ambiguous on purpose. */
function customerMatches(ws, q) {
  const t = ` ${normalise(q)} `;
  return ws.customers.map((c) => {
    const full = normalise(c.name);
    const words = full.split(' ').filter((w) => w.length > 2);
    const hit = words.filter((w) => t.includes(` ${w} `)).length;
    const score = (t.includes(` ${full} `) ? 100 : 0) + hit * 10 + (hit === words.length ? 5 : 0);
    return { c, hit, score };
  }).filter((x) => x.hit > 0).sort((a, b) => b.score - a.score);
}

function resolveCustomer(ws, q) {
  const list = customerMatches(ws, q);
  if (!list.length) return { error: 'none', options: ws.customers.slice(0, 6) };
  if (list.length > 1 && list[1].score === list[0].score) {
    return { error: 'ambiguous', options: list.slice(0, 4).map((x) => x.c) };
  }
  return { customer: list[0].c };
}

function resolveDeal(ws, q) {
  const t = normalise(q);
  const byTitle = ws.deals.filter((d) => t.includes(normalise(d.title)));
  if (byTitle.length === 1) return { deal: byTitle[0] };
  const cm = resolveCustomer(ws, q);
  if (!cm.customer) return cm;
  const mine = ws.deals.filter((d) => d.customerId === cm.customer.id);
  const open = mine.filter((d) => d.stage !== 'won' && d.stage !== 'lost');
  const pool = open.length ? open : mine;
  if (pool.length === 1) return { deal: pool[0] };
  if (!pool.length) return { error: 'no-deals', customer: cm.customer };
  const staged = parseStage(q);
  const inStage = staged ? pool.filter((d) => d.stage === staged) : [];
  if (inStage.length === 1) return { deal: inStage[0] };
  return { error: 'many-deals', customer: cm.customer, deals: pool };
}

function resolveInvoice(ws, q) {
  const num2 = (String(q).match(/\b[A-Za-z]{2}-?\d{5,}\b/) || [])[0];
  if (num2) {
    const key = num2.replace(/-/g, '').toLowerCase();
    const hit = ws.invoices.find((i) => i.number.replace(/-/g, '').toLowerCase() === key);
    return hit ? { invoice: hit } : { error: 'no-number', number: num2 };
  }
  const cm = resolveCustomer(ws, q);
  let pool = null;
  if (cm.customer) {
    pool = ws.invoices.filter((i) => i.customerId === cm.customer.id && i.status !== 'paid');
    if (!pool.length) return { error: 'nothing-open', customer: cm.customer };
  } else if (/\b(oldest|most overdue|longest|biggest|largest|latest|newest)\b/i.test(q) || /\boverdue\b/i.test(q)) {
    pool = overdueInvoices(ws).slice();
    if (!pool.length) pool = ws.invoices.filter((i) => i.status === 'sent');
    if (!pool.length) return { error: 'nothing-open' };
    if (/\b(biggest|largest)\b/i.test(q)) pool.sort((a, b) => b.amount - a.amount);
    else pool.sort((a, b) => invoiceAgeDays(b) - invoiceAgeDays(a));
    return { invoice: pool[0], picked: /\b(biggest|largest)\b/i.test(q) ? 'the largest one open' : 'the oldest one open' };
  } else {
    return { error: 'none' };
  }
  if (pool.length === 1) return { invoice: pool[0] };
  pool.sort((a, b) => invoiceAgeDays(b) - invoiceAgeDays(a));
  return { error: 'many-invoices', customer: cm.customer, invoices: pool };
}

/* text written after a colon, or after "saying" / "that says" */
function parseNoteText(q) {
  const m = String(q).match(/(?::|—|\bsaying\b|\bthat says\b|\bthat reads\b)\s*(.+)$/i);
  if (!m) return null;
  const text = m[1].trim().replace(/^["'“”]|["'“”]$/g, '').trim();
  return text.length > 1 ? text : null;
}

function parsePerson(q) {
  const email = (String(q).match(/\b[\w.+-]+@[\w-]+\.[\w.-]+\b/) || [])[0] || null;
  let name = null;
  const m = String(q).match(/\b(?:invite|add|onboard|bring in|bring)\s+((?:[A-Z][\w'’-]+)(?:\s+[A-Z][\w'’-]+){0,2})/);
  if (m) name = m[1].trim();
  if (name) name = name.replace(/\s+(As|To|With|And|In)$/i, '').trim();
  if (!name && email) {
    const stem = email.split('@')[0].replace(/[._-]+/g, ' ').trim();
    name = stem.split(' ').map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
  }
  return { name: name || null, email };
}

/* ---------- applying: every one of these is only reached from a button ---------- */

const liveWs = (wsId) => store.state.workspaces[wsId];
const bold = (s) => `**${s}**`;

function report(wsId, screen, text, rows, meta, suggestions) {
  showScreen(screen);
  return {
    text,
    table: rows ? { head: ['Field', 'Before', 'After'], rows } : null,
    meta: meta || `applied · saved in this browser only`,
    suggestions: suggestions || ['What changed this week?', 'What can you do?'],
  };
}

function applyDealMove(wsId, dealId, stage) {
  const ws = liveWs(wsId);
  const before = { ...ws.deals.find((d) => d.id === dealId) };
  const openBefore = pipelineValue(ws);
  store.update((s) => {
    const d = s.workspaces[wsId].deals.find((x) => x.id === dealId);
    d.stage = stage;
    d.updatedAt = new Date().toISOString();
    if (stage === 'won') d.probability = 100;
    if (stage === 'lost') d.probability = 0;
  });
  const after = liveWs(wsId).deals.find((d) => d.id === dealId);
  logActivity(wsId, 'deal', `Deal moved to ${stageLabel(stage)} — ${after.title}`);
  toast(`Moved to ${stageLabel(stage)}`, 'ok');
  return report(wsId, 'deals',
    `Done. **${after.title}** is now in **${stageLabel(after.stage)}**.`,
    [
      ['Stage', stageLabel(before.stage), bold(stageLabel(after.stage))],
      ['Probability', `${before.probability}%`, bold(`${after.probability}%`)],
      ['Open pipeline', cur(ws, openBefore), bold(cur(ws, pipelineValue(liveWs(wsId))))],
    ],
    'deals · written to the activity feed',
    ['Show the pipeline by stage', 'What changed this week?']);
}

function applyNote(wsId, customerId, text) {
  const ws = liveWs(wsId);
  const before = ws.customers.find((c) => c.id === customerId).notes.length;
  store.update((s) => {
    const c = s.workspaces[wsId].customers.find((x) => x.id === customerId);
    c.notes.unshift({ id: `n${Date.now().toString(36)}`, at: new Date().toISOString(), by: s.user.name, text });
  });
  const c = liveWs(wsId).customers.find((x) => x.id === customerId);
  logActivity(wsId, 'note', `Note added on ${c.name}`);
  toast('Note saved', 'ok');
  return report(wsId, 'customers',
    `Saved against **${c.name}**. Open the account from the Customers table and it is at the top of the notes list.`,
    [
      ['Notes on file', String(before), bold(String(c.notes.length))],
      ['Newest note', before ? ago(c.notes[1] ? c.notes[1].at : c.notes[0].at) : 'none', bold('just now')],
    ],
    'customers · note stored with your name',
    ['Which customers are at risk?', 'What changed this week?']);
}

function applyInvoicePaid(wsId, invId) {
  const ws = liveWs(wsId);
  const before = { ...ws.invoices.find((i) => i.id === invId) };
  const outBefore = outstandingValue(ws);
  const lateBefore = overdueInvoices(ws).length;
  store.update((s) => {
    const i = s.workspaces[wsId].invoices.find((x) => x.id === invId);
    i.status = 'paid';
    i.paidAt = new Date().toISOString();
  });
  const after = liveWs(wsId).invoices.find((i) => i.id === invId);
  logActivity(wsId, 'invoice', `Invoice ${after.number} marked paid`);
  toast(`${after.number} settled`, 'ok');
  return report(wsId, 'invoices',
    `**${after.number}** is settled — ${cur(ws, after.amount)} recorded against ${customerName(ws, after.customerId)}.`,
    [
      ['Status', before.status, bold('paid')],
      ['Paid on', before.paidAt ? fmtDate(before.paidAt) : 'not paid', bold(fmtDate(after.paidAt))],
      ['Outstanding', cur(ws, outBefore), bold(cur(ws, outstandingValue(liveWs(wsId))))],
      ['Overdue invoices', String(lateBefore), bold(String(overdueInvoices(liveWs(wsId)).length))],
    ],
    'invoices · aging and reports recalculated',
    ['Which invoices are overdue?', 'What is the collection rate?']);
}

function applyInvoiceIssue(wsId, invId) {
  const ws = liveWs(wsId);
  const before = { ...ws.invoices.find((i) => i.id === invId) };
  store.update((s) => {
    const i = s.workspaces[wsId].invoices.find((x) => x.id === invId);
    i.status = 'sent';
    i.issuedAt = new Date().toISOString();
    i.dueAt = new Date(Date.now() + i.terms * 86400000).toISOString();
  });
  const after = liveWs(wsId).invoices.find((i) => i.id === invId);
  logActivity(wsId, 'invoice', `Invoice ${after.number} issued to ${customerName(ws, after.customerId)}`);
  toast(`${after.number} issued`, 'ok');
  return report(wsId, 'invoices',
    `**${after.number}** has been issued to ${customerName(ws, after.customerId)}. Ask me to mark it paid once the money lands.`,
    [
      ['Status', before.status, bold('sent')],
      ['Due', fmtDate(before.dueAt), bold(fmtDate(after.dueAt))],
    ],
    'invoices · terms taken from the account');
}

function applyCustomerChange(wsId, customerId, changes) {
  const ws = liveWs(wsId);
  const before = { ...ws.customers.find((c) => c.id === customerId) };
  const riskBefore = ws.customers.filter((c) => c.status === 'at-risk').length;
  store.update((s) => {
    const c = s.workspaces[wsId].customers.find((x) => x.id === customerId);
    Object.assign(c, changes);
  });
  const after = liveWs(wsId).customers.find((c) => c.id === customerId);
  const words = [];
  if (changes.status) words.push(`marked ${changes.status}`);
  if (changes.segment) words.push(`moved to ${changes.segment}`);
  logActivity(wsId, 'customer', `${after.name} ${words.join(' and ')}`);
  toast(`${after.name} updated`, 'ok');
  const rows = [];
  if (changes.status) rows.push(['Status', before.status, bold(after.status)]);
  if (changes.segment) rows.push(['Segment', before.segment, bold(after.segment)]);
  rows.push(['Accounts at risk', String(riskBefore),
    bold(String(liveWs(wsId).customers.filter((c) => c.status === 'at-risk').length))]);
  return report(wsId, 'customers',
    `**${after.name}** has been ${words.join(' and ')}. The Customers table and the at-risk list both show it now.`,
    rows,
    'customers · status filter picks it up immediately',
    ['Which customers are at risk?', 'Top accounts by revenue']);
}

function applyInvite(wsId, person) {
  const ws = liveWs(wsId);
  const usedBefore = seatsUsed(ws);
  const pendingBefore = ws.members.filter((m) => m.status === 'invited').length;
  store.update((s) => {
    s.workspaces[wsId].members.push({
      id: `${wsId}-m${Date.now().toString(36)}`,
      ws: wsId,
      name: person.name,
      email: person.email,
      role: person.role,
      status: 'invited',
      joinedAt: new Date().toISOString(),
      lastActive: new Date().toISOString(),
    });
  });
  const after = liveWs(wsId);
  logActivity(wsId, 'team', `${person.name} invited as ${person.role}`);
  toast(`Invite recorded for ${person.name}`, 'ok');
  const used = seatsUsed(after);
  return report(wsId, 'team',
    `**${person.name}** is on the Team screen as a pending ${person.role}. No email leaves the browser — this demo records the invite and nothing else.`,
    [
      ['People', String(usedBefore), bold(String(used))],
      ['Seats', `${usedBefore} of ${ws.seatsIncluded}`, bold(`${used} of ${ws.seatsIncluded}`)],
      ['Pending invites', String(pendingBefore),
        bold(String(after.members.filter((m) => m.status === 'invited').length))],
    ],
    'team and roles · role can be changed on that screen',
    ['Who has admin access?', 'How many seats are left?']);
}

function applyNewDeal(wsId, spec) {
  const ws = liveWs(wsId);
  const before = { count: openDeals(ws).length, value: pipelineValue(ws) };
  const id = `${wsId}-d${Date.now().toString(36)}`;
  store.update((s) => {
    s.workspaces[wsId].deals.unshift({
      id,
      ws: wsId,
      title: spec.title,
      customerId: spec.customerId,
      stage: spec.stage,
      value: spec.value,
      owner: spec.owner,
      probability: spec.stage === 'won' ? 100 : spec.stage === 'lost' ? 0 : 40,
      openedAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      closeDate: new Date(Date.now() + 30 * 86400000).toISOString(),
    });
  });
  const after = liveWs(wsId);
  logActivity(wsId, 'deal', `Deal created — ${spec.title}`);
  toast('Deal added to the pipeline', 'ok');
  return report(wsId, 'deals',
    `**${spec.title}** is on the board in ${stageLabel(spec.stage)}, worth ${cur(ws, spec.value)} and owned by ${spec.owner}.`,
    [
      ['Open deals', String(before.count), bold(String(openDeals(after).length))],
      ['Open pipeline', cur(ws, before.value), bold(cur(ws, pipelineValue(after)))],
      ['Close date', 'not set', bold(fmtDate(new Date(Date.now() + 30 * 86400000)))],
    ],
    'deals · 30 day close date, change it on the board',
    ['Show the pipeline by stage', 'Who owns the biggest deal?']);
}

/* ---------- when the reference is not good enough, say so ---------- */

function askForAccount(ws, res, what) {
  if (res.error === 'ambiguous') {
    return {
      text: `That could be ${res.options.map((c) => bold(c.name)).join(' or ')}. Give me the full account name and I will ${what} the right one. Nothing has changed.`,
      suggestions: ['What can you do?', 'Which customers are at risk?'],
    };
  }
  return {
    text: `I could not find that account in **${ws.name}**, so I have changed nothing. Name one of these and I will ${what} it.`,
    table: { head: ['Accounts in this workspace'], rows: (res.options || ws.customers.slice(0, 6)).map((c) => [c.name]) },
    suggestions: ['What can you do?', 'Top accounts by revenue'],
  };
}

const actionIntents = [
  {
    id: 'act-move-deal',
    match: [
      /\b(move|shift|advance|push|progress|promote|bump|drag|set|change|update)\b[^?]{0,60}\b(deal|deals|opportunity)\b/i,
      /\b(deal|opportunity)\b[^?]{0,60}\b(to|into|onto)\b\s*(qualify|qualification|proposal|negotiation|won|lost)/i,
      /\bmark\b[^?]{0,50}\b(deal|opportunity)\b[^?]{0,24}\b(won|lost)\b/i,
      'move the deal', 'move deal',
    ],
    trace: 'matched the sentence against this workspace’s deals',
    answer: (q, ctx) => {
      const { ws } = ctx;
      const found = resolveDeal(ws, q);
      if (!found.deal) {
        if (found.error === 'many-deals') {
          return {
            text: `**${found.customer.name}** has ${found.deals.length} deals I could move, so I will not guess. Name the one you mean and I will move it.`,
            table: { head: ['Deal', 'Stage', 'Value'], rows: found.deals.map((d) => [d.title, stageLabel(d.stage), cur(ws, d.value)]) },
          };
        }
        if (found.error === 'no-deals') {
          return { text: `**${found.customer.name}** has no deal on the board, so there is nothing to move. I can create one — try "new deal for ${found.customer.name}, 4 lakh, proposal stage".` };
        }
        return askForAccount(ws, found, 'move the deal for');
      }
      const deal = found.deal;
      const head = `That is **${deal.title}** — ${stageLabel(deal.stage)}, ${cur(ws, deal.value)}, owned by ${deal.owner}.`;
      const stage = parseStage(q);
      if (!stage) {
        return {
          text: `${head}\n\nWhich stage should it go to? Nothing moves until you pick one.`,
          actions: STAGES.filter((s) => s.id !== deal.stage).map((s) => ({
            label: s.label, doingLabel: 'Moving…', run: () => applyDealMove(ws.id, deal.id, s.id),
          })),
        };
      }
      if (stage === deal.stage) {
        return { text: `${head}\n\nIt is already in ${stageLabel(stage)}, so there is nothing for me to change.` };
      }
      return {
        text: `${head}\n\nI can move it to **${stageLabel(stage)}**. Nothing has changed yet — press the button and I will apply it.`,
        actions: [{ label: `Move to ${stageLabel(stage)}`, doingLabel: 'Moving…', run: () => applyDealMove(ws.id, deal.id, stage) }],
        suggestions: ['Show the pipeline by stage', 'What can you do?'],
      };
    },
  },
  {
    id: 'act-note',
    match: [
      /\b(log|add|save|record|write|leave|jot|put|note down)\b[^?]{0,40}\bnote\b/i,
      /\bnote\b[^?]{0,24}\b(on|against|for|about)\b/i,
      'log a note', 'add a note',
    ],
    trace: 'matched the account book, then read the note text',
    answer: (q, ctx) => {
      const { ws } = ctx;
      const text = parseNoteText(q);
      const subject = text ? String(q).slice(0, String(q).length - text.length) : q;
      const res = resolveCustomer(ws, subject);
      if (!res.customer) return askForAccount(ws, res, 'write the note against');
      const c = res.customer;
      if (!text) {
        return {
          text: `I have the account: **${c.name}**, owned by ${c.owner}, ${c.notes.length} notes on file.\n\nWhat should the note say? Write it after a colon — "log a note on ${c.name}: they asked for 45 day terms".`,
          suggestions: ['What can you do?', 'Which customers are at risk?'],
        };
      }
      return {
        text: `Note for **${c.name}**, filed under your name:\n\n"${text}"\n\nNothing is saved until you press the button.`,
        actions: [{ label: 'Save the note', doingLabel: 'Saving…', run: () => applyNote(ws.id, c.id, text) }],
      };
    },
  },
  {
    id: 'act-invoice-paid',
    match: [
      /\bmark\b[^?]{0,60}\b(paid|settled|received|cleared)\b/i,
      /\b(settle|clear|record (?:a )?payment|payment (?:came|landed|received))\b[^?]{0,50}\b(invoice|bill|[a-z]{2}-?\d{5,})\b/i,
      /\binvoice\b[^?]{0,40}\b(paid|settled|cleared)\b/i,
      'mark paid', 'mark it paid',
    ],
    trace: 'looked the invoice up in the receivables ledger',
    answer: (q, ctx) => {
      const { ws } = ctx;
      const res = resolveInvoice(ws, q);
      if (!res.invoice) {
        if (res.error === 'no-number') {
          return {
            text: `There is no invoice numbered \`${res.number}\` in **${ws.name}**, so I have changed nothing. These are the open ones.`,
            table: { head: ['Invoice', 'Account', 'Status', 'Amount'], rows: ws.invoices.filter((i) => i.status !== 'paid').slice(0, 6).map((i) => [i.number, customerName(ws, i.customerId), i.status, cur(ws, i.amount)]) },
          };
        }
        if (res.error === 'many-invoices') {
          return {
            text: `**${res.customer.name}** has ${res.invoices.length} unpaid invoices. Give me the number and I will settle that one — I am not going to pick for you.`,
            table: { head: ['Invoice', 'Status', 'Days late', 'Amount'], rows: res.invoices.map((i) => [i.number, i.status, i.status === 'overdue' ? String(invoiceAgeDays(i)) : '—', cur(ws, i.amount)]) },
          };
        }
        if (res.error === 'nothing-open') {
          return { text: res.customer ? `Every invoice for **${res.customer.name}** is already settled, so there is nothing to mark paid.` : `Nothing is open in **${ws.name}** right now, so there is nothing to mark paid.` };
        }
        return {
          text: `Which invoice? Give me a number, or the account name, or say "mark the oldest overdue invoice paid". Nothing has changed.`,
          table: { head: ['Invoice', 'Account', 'Status', 'Amount'], rows: ws.invoices.filter((i) => i.status !== 'paid').slice(0, 6).map((i) => [i.number, customerName(ws, i.customerId), i.status, cur(ws, i.amount)]) },
        };
      }
      const inv = res.invoice;
      const who = customerName(ws, inv.customerId);
      if (inv.status === 'paid') {
        return { text: `**${inv.number}** was already settled on ${fmtDate(inv.paidAt)} for ${cur(ws, inv.amount)}. Nothing to do.` };
      }
      if (inv.status === 'draft') {
        return {
          text: `**${inv.number}** for ${who} is still a draft — it has never been issued, so it cannot be paid. I can issue it first, on today's date with ${inv.terms} day terms.`,
          actions: [{ label: 'Issue it now', doingLabel: 'Issuing…', run: () => applyInvoiceIssue(ws.id, inv.id) }],
        };
      }
      const late = inv.status === 'overdue' ? ` It is ${invoiceAgeDays(inv)} days past due.` : '';
      return {
        text: `${res.picked ? `You did not name one, so I took ${res.picked}: ` : ''}**${inv.number}** — ${who}, ${cur(ws, inv.amount)}, due ${fmtDate(inv.dueAt)}.${late}\n\nI will record it as paid today. Nothing has changed yet.`,
        actions: [{ label: 'Mark it paid', doingLabel: 'Recording…', run: () => applyInvoicePaid(ws.id, inv.id) }],
        suggestions: ['Which invoices are overdue?', 'What is the collection rate?'],
      };
    },
  },
  {
    id: 'act-customer-status',
    match: [
      /\b(flag|mark|set|move|change|switch|put|downgrade|upgrade|reclassify)\b[^?]{0,60}\b(at[-\s]?risk|dormant|active)\b/i,
      /\b(flag|mark|set|put|treat)\b[^?]{0,60}\bas\b[^?]{0,24}\b(at[-\s]?risk|dormant|active)\b/i,
      /\b(segment|reclassify)\b[^?]{0,50}\b(retail|wholesale|institutional|online|government)\b/i,
      /\b(move|change|switch|set|put)\b[^?]{0,50}\b(to|into|as)\b[^?]{0,20}\b(retail|wholesale|institutional|online|government)\b/i,
      'flag', 'as at risk', 'as dormant', 'as active',
    ],
    trace: 'read the account record before proposing the change',
    answer: (q, ctx) => {
      const { ws } = ctx;
      const res = resolveCustomer(ws, q);
      if (!res.customer) return askForAccount(ws, res, 'change');
      const c = res.customer;
      const status = parseStatus(q);
      const segment = parseSegment(q);
      if (!status && !segment) {
        return {
          text: `I have **${c.name}** — ${c.segment}, currently ${c.status}. What should it become? Status can be ${CUSTOMER_STATUS.join(', ')}; segment can be ${SEGMENTS.join(', ')}.`,
          suggestions: ['What can you do?', 'Which customers are at risk?'],
        };
      }
      const changes = {};
      if (status && status !== c.status) changes.status = status;
      if (segment && segment !== c.segment) changes.segment = segment;
      if (!Object.keys(changes).length) {
        return { text: `**${c.name}** is already ${status || ''}${status && segment ? ' and ' : ''}${segment || ''}. Nothing to change.` };
      }
      const words = [];
      if (changes.status) words.push(`status **${c.status} → ${changes.status}**`);
      if (changes.segment) words.push(`segment **${c.segment} → ${changes.segment}**`);
      return {
        text: `**${c.name}** (owned by ${c.owner}) — I would change ${words.join(' and ')}. Nothing has changed yet.`,
        actions: [{
          label: changes.status ? `Mark ${changes.status}` : `Move to ${changes.segment}`,
          doingLabel: 'Updating…',
          run: () => applyCustomerChange(ws.id, c.id, changes),
        }],
        suggestions: ['Which customers are at risk?', 'What can you do?'],
      };
    },
  },
  {
    id: 'act-invite',
    match: [
      /\binvite\b/i,
      /\binvite\b[^?]{0,60}\b(as|to|with|and)\b/i,
      /\b(add|onboard|bring in|give access to)\b[^?]{0,50}\b(to the (team|workspace)|as an? (owner|admin|member|viewer))\b/i,
      'invite', 'add a user',
    ],
    trace: 'checked the member list and the seat allowance',
    answer: (q, ctx) => {
      const { ws } = ctx;
      const person = parsePerson(q);
      const role = parseRole(q) || 'member';
      if (!person.name) {
        return {
          text: `Who am I inviting to **${ws.name}**? Give me a name and a role — "invite Priya Menon as an admin". Roles are ${ROLES.filter((r) => r !== 'owner').join(', ')}.`,
          suggestions: ['Who has admin access?', 'How many seats are left?'],
        };
      }
      if (role === 'owner') {
        return { text: `I will not hand ownership of **${ws.name}** to anyone from a chat box. Invite ${person.name} as an admin instead, or change the owner on the Team screen.` };
      }
      const domain = (ws.members[0] && ws.members[0].email.split('@')[1]) || `${ws.id}.example`;
      const email = person.email || `${person.name.split(' ')[0].toLowerCase()}@${domain}`;
      const clash = ws.members.find((m) => m.email.toLowerCase() === email.toLowerCase());
      if (clash) {
        return { text: `**${clash.name}** already holds \`${clash.email}\` in this workspace as a ${clash.role}. Add a different address and I will send it.` };
      }
      const used = seatsUsed(ws);
      const over = used + 1 > ws.seatsIncluded;
      const article = /^[aeiou]/i.test(role) ? 'an' : 'a';
      return {
        text: `Invite for **${person.name}** as ${article} **${role}**, email \`${email}\`${person.email ? '' : ' (built from the workspace domain — say the address if it is different)'}.\n`
          + `Seats would go from ${used} to ${used + 1} of ${ws.seatsIncluded}.${over ? ' That is over the plan allowance — change the plan in Settings.' : ''}\n\n`
          + 'No email is sent anywhere. Press the button and I will record the invite.',
        actions: [{ label: `Invite as ${role}`, doingLabel: 'Inviting…', run: () => applyInvite(ws.id, { name: person.name, email, role }) }],
        suggestions: ['Who has admin access?', 'How many seats are left?'],
      };
    },
  },
  {
    id: 'act-new-deal',
    match: [
      /\b(new|create|open|start|add|raise|set up|log)\b[^?]{0,30}\b(deal|opportunity)\b/i,
      /\bdeal for\b/i,
      'new deal', 'create a deal',
    ],
    trace: 'read the account, the value and the stage out of the sentence',
    answer: (q, ctx) => {
      const { ws } = ctx;
      const res = resolveCustomer(ws, q);
      if (!res.customer) return askForAccount(ws, res, 'open a deal for');
      const c = res.customer;
      const value = parseAmount(q);
      const stage = parseStage(q) || 'qualify';
      if (!value) {
        return {
          text: `**${c.name}** it is. How much is the deal worth? Say it however you like — "4 lakh", "₹400000", "250k" — and I will put it in ${stageLabel(stage)}.`,
          suggestions: ['What can you do?', 'Show the pipeline by stage'],
        };
      }
      const what = (String(q).match(/\bfor\b[^,]*,\s*[^,]*,\s*([a-z\s]+?)\s*(?:stage)?\s*$/i) || [])[1];
      const title = `${c.name} — ${(what && !parseStage(what) ? what.trim() : 'new opportunity')}`;
      return {
        text: `Here is what I understood:\n\n`
          + `- account **${c.name}** (${c.segment}, owner ${c.owner})\n`
          + `- value **${cur(ws, value)}**\n`
          + `- stage **${stageLabel(stage)}**\n`
          + `- close date 30 days out, probability 40%\n\n`
          + 'Nothing is on the board until you press the button.',
        actions: [{
          label: 'Create the deal',
          doingLabel: 'Creating…',
          run: () => applyNewDeal(ws.id, { customerId: c.id, title, value, stage, owner: c.owner }),
        }],
        suggestions: ['Show the pipeline by stage', 'Who owns the biggest deal?'],
      };
    },
  },
];

/* ---------- intents ---------- */

const intents = [
  ...actionIntents,
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
    match: [/what can you|what do you do|help|how do i|commands|capabilities|can you actually/i, 'help', 'what can you do'],
    trace: 'listed the intents and actions wired to this workspace',
    answer: (q, ctx) => {
      const { ws } = ctx;
      const account = ws.customers[0] ? ws.customers[0].name : 'an account';
      const deal = openDeals(ws)[0];
      const dealAccount = deal ? customerName(ws, deal.customerId) : account;
      const late = overdueInvoices(ws)[0];
      const invNumber = late ? late.number : (ws.invoices[0] || { number: 'the oldest overdue invoice' }).number;
      return {
        text: `Two halves. I **answer** from whatever is in **${ws.name}** right now, and I **do** six things to it — `
          + 'each one shows you the exact record first and waits for you to press the button.\n\n'
          + 'Things I can do, with an example of each:\n\n'
          + `- move a deal — "move the ${dealAccount} deal to negotiation" → the card changes stage on the board and the open pipeline total moves with it\n`
          + `- log a note — "log a note on ${account}: they asked for 45 day terms" → the note appears at the top of that account's drawer, filed under your name\n`
          + `- settle an invoice — "mark ${invNumber} paid" → status goes sent or overdue → paid, and outstanding drops by the invoice amount\n`
          + `- change an account — "flag ${account} as at risk" → the status pill changes and it joins the at-risk list\n`
          + '- invite a person — "invite Priya Menon as an admin" → a pending invite on the Team screen and one more seat used\n'
          + `- open a deal — "new deal for ${account}, 4 lakh, proposal stage" → a new card in Proposal worth ${cur(ws, 400000)}\n\n`
          + 'Things I can answer: revenue this quarter and by month, overdue invoices and aging, the collection rate, '
          + 'who owns a deal, at-risk accounts and why, seat and plan usage, what changed this week, pipeline by stage, '
          + 'top accounts, who holds admin, and how the three workspaces compare.\n\n'
          + 'If a name is ambiguous I stop and ask rather than guess, and I never write anything without the button.',
        suggestions: [
          deal ? `Move the ${dealAccount} deal to negotiation` : 'Which invoices are overdue?',
          `Log a note on ${account}: credit review due`,
          'Mark the oldest overdue invoice paid',
          'What is the revenue this quarter?',
        ],
      };
    },
  },
];

const fallbacks = [
  'I only answer from the data in this workspace. Ask me about revenue, overdue invoices, the pipeline or seat usage — or ask me to change something.',
  'That one is outside the demo dataset. Try "which invoices are overdue" and I will pull the aging table.',
  'No match for that. I can tell you what changed this week, or move a deal a stage if you name it.',
  'I could not map that to anything in the workspace. Ask "what can you do?" and I will list the six things I can change.',
];

export function createCopilot(opts = {}) {
  showScreen = typeof opts.show === 'function' ? opts.show : () => {};
  const ws = activeWorkspace();
  return new Assistant({
    name: 'Opsboard Copilot',
    initials: 'OC',
    tag: 'Reads and changes this workspace',
    greeting: `I am the Opsboard Copilot. I work on the workspace open in the sidebar — right now that is **${ws.name}**.\n\n`
      + 'Ask me about revenue, receivables, the pipeline or access — or tell me to do something: move a deal, log a note, '
      + 'settle an invoice, flag an account, invite someone, open a new deal. I always show you the record first and wait for you to confirm.',
    suggestions: ['What can you do?', 'Which invoices are overdue?', 'Mark the oldest overdue invoice paid', 'What is the revenue this quarter?'],
    intents,
    fallbacks,
    note: 'Simulated assistant — answers are matched against this app\'s demo data in your browser. Not a connected model, nothing is sent anywhere.',
    context: () => ({ ws: activeWorkspace(), state: store.state, months: monthKeys(6), n: num }),
  });
}

export { intents as copilotIntents };
