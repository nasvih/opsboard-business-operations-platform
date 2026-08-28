/* ============================================================
   Opsboard Copilot — the in-product assistant.

   It has no model behind it. Every reply is assembled here, in the
   browser, from the workspace the user is currently looking at, so the
   numbers always agree with what is on screen and change the moment the
   user edits something.

   Every sentence it says comes out of the dictionary, so the whole
   conversation — greeting, chips, table headings, buttons and the note
   under the box — reads in whichever language the app is set to.
   ============================================================ */

import { Assistant } from '../lib/assistant.js';
import { money, num, pct, fmtDate, ago, toast } from '../lib/ui.js';
import {
  store, activeWorkspace, WORKSPACE_IDS, STAGES, stageLabel, currencySymbol,
  quarterRevenue, revenueByMonth, pipelineValue, openDeals, overdueInvoices,
  outstandingValue, agingBuckets, invoiceAgeDays, seatsUsed, changesSince,
  atRiskCustomers, customerName, monthKeys, logActivity, dealTitle, activityText,
  statusLabel, segmentLabel, roleLabel, permLabel, planLabel,
  CUSTOMER_STATUS, SEGMENTS, ROLES,
} from './data.js';
import { t, tList } from './main.js';

const cur = (ws, n) => money(n, currencySymbol(ws.currency));

/* a counted noun — English has two forms, Arabic five, the dictionary knows */
const cnt = (n, key) => t(`count.${key}`, { n });

/* the four suggestion chips, and the words the router matches them back to */
const S = (key, vars) => t(`agent.sug.${key}`, vars);
/* table headings, by dictionary key */
const TH = (...keys) => keys.map((k) => t(`agent.th.${k}`));
/* a row label inside a before/after table */
const ROW = (key, vars) => t(`agent.row.${key}`, vars);

/* Words the reading language adds to the always-on English patterns. On the
   English side every one of these lists is empty, so nothing changes. */
function dictWords(path) {
  const list = tList(`agent.words.${path}`);
  return Array.isArray(list) ? list : [];
}
const saysAny = (q, path) => dictWords(path).some((w) => String(q).includes(w));

/* Keywords for the router. A phrase of more than one word becomes a pattern,
   which the engine scores higher than a bare keyword — so a specific chip
   ("top accounts by revenue") beats an intent that shares one word with it. */
function extraMatch(id) {
  const list = tList(`agent.match.${id}`);
  if (!Array.isArray(list)) return [];
  return list.map((w) => (String(w).includes(' ')
    ? new RegExp(String(w).replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))
    : String(w)));
}

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
  const named = ws.deals.find((d) => text.includes(dealTitle(ws, d).toLowerCase().slice(0, 18)));
  if (named) return named;
  /* superlatives — "who owns the biggest deal", "the smallest one" */
  const pool = openDeals(ws).length ? openDeals(ws) : ws.deals;
  if (!pool.length) return null;
  const byValue = pool.slice().sort((a, b) => b.value - a.value);
  if (/\b(biggest|largest|highest|top|most valuable|best)\b/.test(text) || saysAny(q, 'biggest')) return byValue[0];
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
  const issuedValue = issued.reduce((sum, i) => sum + i.amount, 0);
  const settledValue = settled.reduce((sum, i) => sum + i.amount, 0);
  const days = settled.filter((i) => i.paidAt)
    .map((i) => Math.round((new Date(i.paidAt) - new Date(i.issuedAt)) / 86400000));
  return {
    issued,
    settled,
    issuedValue,
    settledValue,
    rate: issuedValue ? (settledValue / issuedValue) * 100 : 0,
    avgDays: days.length ? Math.round(days.reduce((sum, d) => sum + d, 0) / days.length) : 0,
    avgTerms: issued.length ? Math.round(issued.reduce((sum, i) => sum + i.terms, 0) / issued.length) : 0,
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
  for (const [id] of STAGE_WORDS) if (saysAny(q, `stage.${id}`)) return id;
  return null;
}

const STATUS_WORDS = [
  ['at-risk', /\b(at[-\s]?risk|risky|shaky|watch list|watchlist)\b/i],
  ['dormant', /\b(dormant|inactive|asleep|gone quiet)\b/i],
  ['active', /\b(active|healthy|back on track|recovered)\b/i],
];
function parseStatus(q) {
  for (const [id, re] of STATUS_WORDS) if (re.test(q)) return id;
  for (const [id] of STATUS_WORDS) if (saysAny(q, `status.${id}`)) return id;
  return null;
}

function parseSegment(q) {
  const hit = SEGMENTS.find((s) => new RegExp(`\\b${s}\\b`, 'i').test(q));
  if (hit) return hit;
  return SEGMENTS.find((s) => saysAny(q, `segment.${s}`)) || null;
}

function parseRole(q) {
  if (/\b(read[-\s]?only|view only)\b/i.test(q)) return 'viewer';
  const hit = ROLES.find((r) => new RegExp(`\\b${r}s?\\b`, 'i').test(q));
  if (hit) return hit;
  return ROLES.find((r) => saysAny(q, `role.${r}`)) || null;
}

/* "4 lakh", "₹4,00,000", "2.5 crore", "250k", "400000" */
function parseAmount(q) {
  const text = String(q).toLowerCase().replace(/,/g, '');
  let m = text.match(/(\d+(?:\.\d+)?)\s*(?:crores|crore|cr)\b/);
  if (m) return Math.round(parseFloat(m[1]) * 10000000);
  m = text.match(/(\d+(?:\.\d+)?)\s*(?:lakhs|lakh|lacs|lac)\b/);
  if (m) return Math.round(parseFloat(m[1]) * 100000);
  m = text.match(/(\d+(?:\.\d+)?)\s*k\b/);
  if (m) return Math.round(parseFloat(m[1]) * 1000);
  m = text.match(/(?:₹|rs\.?|inr)\s*(\d+(?:\.\d+)?)/);
  if (m) return Math.round(parseFloat(m[1]));
  m = text.match(/\b(\d{4,})\b/);
  if (m) return Number(m[1]);
  return null;
}

const normalise = (s) => String(s).toLowerCase().replace(/[^a-z0-9\s]/g, ' ').replace(/\s+/g, ' ').trim();

/* Account names are two or three words, so a match is scored on how many
   of them the sentence carries. A whole name wins outright; a single shared
   word ("hardware", "traders") is left ambiguous on purpose. */
function customerMatches(ws, q) {
  const text = ` ${normalise(q)} `;
  return ws.customers.map((c) => {
    const full = normalise(c.name);
    const parts = full.split(' ').filter((w) => w.length > 2);
    const hit = parts.filter((w) => text.includes(` ${w} `)).length;
    const score = (text.includes(` ${full} `) ? 100 : 0) + hit * 10 + (hit === parts.length ? 5 : 0);
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
  const text = normalise(q);
  const byTitle = ws.deals.filter((d) => text.includes(normalise(dealTitle(ws, d))));
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
  const number = (String(q).match(/\b[A-Za-z]{2}-?\d{5,}\b/) || [])[0];
  if (number) {
    const key = number.replace(/-/g, '').toLowerCase();
    const hit = ws.invoices.find((i) => i.number.replace(/-/g, '').toLowerCase() === key);
    return hit ? { invoice: hit } : { error: 'no-number', number };
  }
  const cm = resolveCustomer(ws, q);
  const wantsBiggest = /\b(biggest|largest)\b/i.test(q) || saysAny(q, 'biggest');
  const wantsSuperlative = /\b(oldest|most overdue|longest|biggest|largest|latest|newest)\b/i.test(q)
    || /\boverdue\b/i.test(q) || saysAny(q, 'oldest') || saysAny(q, 'biggest') || saysAny(q, 'overdue');
  let pool = null;
  if (cm.customer) {
    pool = ws.invoices.filter((i) => i.customerId === cm.customer.id && i.status !== 'paid');
    if (!pool.length) return { error: 'nothing-open', customer: cm.customer };
  } else if (wantsSuperlative) {
    pool = overdueInvoices(ws).slice();
    if (!pool.length) pool = ws.invoices.filter((i) => i.status === 'sent');
    if (!pool.length) return { error: 'nothing-open' };
    if (wantsBiggest) pool.sort((a, b) => b.amount - a.amount);
    else pool.sort((a, b) => invoiceAgeDays(b) - invoiceAgeDays(a));
    return {
      invoice: pool[0],
      picked: wantsBiggest ? t('agent.invPickedLargest') : t('agent.invPickedOldest'),
    };
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
  /* An Arabic sentence carries the person's name in Latin script — it is a
     name, not language — so the first capitalised run is the one meant. */
  if (!name && /[؀-ۿ]/.test(String(q))) {
    const latin = String(q).match(/([A-Z][\w'’-]+(?:\s+[A-Z][\w'’-]+){0,2})/);
    if (latin) name = latin[1].trim();
  }
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
    table: rows ? { head: TH('field', 'before', 'after'), rows } : null,
    meta: meta || t('agent.meta.applied'),
    suggestions: suggestions || [S('changed'), S('whatCanYouDo')],
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
  const title = dealTitle(liveWs(wsId), after);
  logActivity(wsId, 'deal', 'dealMoved', { stage, wsId, titleOf: dealId });
  toast(t('deals.moved', { stage: stageLabel(stage) }), 'ok');
  return report(wsId, 'deals',
    t('agent.dealMoved', { title, stage: stageLabel(after.stage) }),
    [
      [ROW('stage'), stageLabel(before.stage), bold(stageLabel(after.stage))],
      [ROW('probability'), `${before.probability}%`, bold(`${after.probability}%`)],
      [ROW('openPipeline'), cur(ws, openBefore), bold(cur(ws, pipelineValue(liveWs(wsId))))],
    ],
    t('agent.meta.deals'),
    [S('pipeline'), S('changed')]);
}

function applyNote(wsId, customerId, text) {
  const ws = liveWs(wsId);
  const before = ws.customers.find((c) => c.id === customerId).notes.length;
  store.update((s) => {
    const c = s.workspaces[wsId].customers.find((x) => x.id === customerId);
    c.notes.unshift({ id: `n${Date.now().toString(36)}`, at: new Date().toISOString(), by: s.user.name, text });
  });
  const c = liveWs(wsId).customers.find((x) => x.id === customerId);
  logActivity(wsId, 'note', 'noteAdded', { name: c.name });
  toast(t('customers.noteSaved'), 'ok');
  return report(wsId, 'customers',
    t('agent.noteDone', { name: c.name }),
    [
      [ROW('notes'), String(before), bold(String(c.notes.length))],
      [ROW('newest'), before ? ago(c.notes[1] ? c.notes[1].at : c.notes[0].at) : t('common.none'), bold(ROW('justNow'))],
    ],
    t('agent.meta.customers'),
    [S('atRisk'), S('changed')]);
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
  logActivity(wsId, 'invoice', 'invoicePaid', { number: after.number });
  toast(t('invoices.settledToast', { number: after.number }), 'ok');
  return report(wsId, 'invoices',
    t('agent.invPaidDone', {
      number: after.number, amount: cur(ws, after.amount), name: customerName(ws, after.customerId),
    }),
    [
      [ROW('status'), statusLabel(before.status), bold(statusLabel('paid'))],
      [ROW('paidOn'), before.paidAt ? fmtDate(before.paidAt) : ROW('notPaid'), bold(fmtDate(after.paidAt))],
      [ROW('outstanding'), cur(ws, outBefore), bold(cur(ws, outstandingValue(liveWs(wsId))))],
      [ROW('overdueInvoices'), String(lateBefore), bold(String(overdueInvoices(liveWs(wsId)).length))],
    ],
    t('agent.meta.invoicesRecalc'),
    [S('overdue'), S('rate')]);
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
  const who = customerName(ws, after.customerId);
  logActivity(wsId, 'invoice', 'invoiceIssued', { number: after.number, name: who });
  toast(t('invoices.issuedToast', { number: after.number }), 'ok');
  return report(wsId, 'invoices',
    t('agent.invIssuedDone', { number: after.number, name: who }),
    [
      [ROW('status'), statusLabel(before.status), bold(statusLabel('sent'))],
      [ROW('due'), fmtDate(before.dueAt), bold(fmtDate(after.dueAt))],
    ],
    t('agent.meta.invoiceTerms'));
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
  const did = [];
  if (changes.status) did.push(t('agent.custDidStatus', { status: statusLabel(changes.status) }));
  if (changes.segment) did.push(t('agent.custDidSegment', { segment: segmentLabel(changes.segment) }));
  const words = did.join(t('common.and'));
  logActivity(wsId, 'customer', 'customerChanged', { name: after.name, words });
  toast(t('agent.custToast', { name: after.name }), 'ok');
  const rows = [];
  if (changes.status) rows.push([ROW('status'), statusLabel(before.status), bold(statusLabel(after.status))]);
  if (changes.segment) rows.push([ROW('segment'), segmentLabel(before.segment), bold(segmentLabel(after.segment))]);
  rows.push([ROW('atRisk'), String(riskBefore),
    bold(String(liveWs(wsId).customers.filter((c) => c.status === 'at-risk').length))]);
  return report(wsId, 'customers',
    t('agent.custDone', { name: after.name, words }),
    rows,
    t('agent.meta.customerStatus'),
    [S('atRisk'), S('top')]);
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
  logActivity(wsId, 'team', 'invited', { name: person.name, role: person.role });
  toast(t('agent.invToast', { name: person.name }), 'ok');
  const used = seatsUsed(after);
  return report(wsId, 'team',
    t('agent.invDone', { name: person.name, role: roleLabel(person.role) }),
    [
      [ROW('people'), String(usedBefore), bold(String(used))],
      [ROW('seats'), ROW('seatsOf', { used: usedBefore, total: ws.seatsIncluded }),
        bold(ROW('seatsOf', { used, total: ws.seatsIncluded }))],
      [ROW('pending'), String(pendingBefore),
        bold(String(after.members.filter((m) => m.status === 'invited').length))],
    ],
    t('agent.meta.team'),
    [S('admin'), S('seats')]);
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
      kindKey: spec.title ? undefined : 'new',
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
  const title = dealTitle(after, after.deals.find((d) => d.id === id));
  logActivity(wsId, 'deal', 'dealCreated', { wsId, titleOf: id });
  toast(t('deals.added'), 'ok');
  return report(wsId, 'deals',
    t('agent.newDone', {
      title, stage: stageLabel(spec.stage), amount: cur(ws, spec.value), owner: spec.owner,
    }),
    [
      [ROW('openDeals'), String(before.count), bold(String(openDeals(after).length))],
      [ROW('openPipeline'), cur(ws, before.value), bold(cur(ws, pipelineValue(after)))],
      [ROW('closeDate'), ROW('notSet'), bold(fmtDate(new Date(Date.now() + 30 * 86400000)))],
    ],
    t('agent.meta.newDeal'),
    [S('pipeline'), S('biggest')]);
}

/* ---------- when the reference is not good enough, say so ---------- */

function askForAccount(ws, res, what) {
  if (res.error === 'ambiguous') {
    return {
      text: t('agent.askAmbiguous', {
        options: res.options.map((c) => bold(c.name)).join(t('common.or')), what,
      }),
      suggestions: [S('whatCanYouDo'), S('atRisk')],
    };
  }
  return {
    text: t('agent.askNone', { name: ws.name, what }),
    table: { head: TH('accountsHere'), rows: (res.options || ws.customers.slice(0, 6)).map((c) => [c.name]) },
    suggestions: [S('whatCanYouDo'), S('top')],
  };
}

/* The dictionary is not readable while this module is evaluating — main.js is
   still building the i18n instance at that moment — so the intent pack is
   assembled on the first call instead of at import time. */
function buildIntents() {
const actionIntents = [
  {
    id: 'act-move-deal',
    match: [
      /\b(move|shift|advance|push|progress|promote|bump|drag|set|change|update)\b[^?]{0,60}\b(deal|deals|opportunity)\b/i,
      /\b(deal|opportunity)\b[^?]{0,60}\b(to|into|onto)\b\s*(qualify|qualification|proposal|negotiation|won|lost)/i,
      /\bmark\b[^?]{0,50}\b(deal|opportunity)\b[^?]{0,24}\b(won|lost)\b/i,
      'move the deal', 'move deal',
      ...extraMatch('moveDeal'),
    ],
    trace: t('agent.trace.deal'),
    answer: (q, ctx) => {
      const { ws } = ctx;
      const found = resolveDeal(ws, q);
      if (!found.deal) {
        if (found.error === 'many-deals') {
          return {
            text: t('agent.dealMany', { name: found.customer.name, n: found.deals.length }),
            table: {
              head: TH('deal', 'stage', 'value'),
              rows: found.deals.map((d) => [dealTitle(ws, d), stageLabel(d.stage), cur(ws, d.value)]),
            },
          };
        }
        if (found.error === 'no-deals') {
          return { text: t('agent.dealNone', { name: found.customer.name }) };
        }
        return askForAccount(ws, found, t('agent.whatMoveDeal'));
      }
      const deal = found.deal;
      const head = t('agent.dealHead', {
        title: dealTitle(ws, deal), stage: stageLabel(deal.stage), amount: cur(ws, deal.value), owner: deal.owner,
      });
      const stage = parseStage(q);
      if (!stage) {
        return {
          text: t('agent.dealWhich', { head }),
          actions: STAGES.filter((s) => s.id !== deal.stage).map((s) => ({
            label: stageLabel(s.id), doingLabel: t('agent.dealMoving'), run: () => applyDealMove(ws.id, deal.id, s.id),
          })),
        };
      }
      if (stage === deal.stage) {
        return { text: t('agent.dealSame', { head, stage: stageLabel(stage) }) };
      }
      return {
        text: t('agent.dealOffer', { head, stage: stageLabel(stage) }),
        actions: [{
          label: t('agent.dealMoveTo', { stage: stageLabel(stage) }),
          doingLabel: t('agent.dealMoving'),
          run: () => applyDealMove(ws.id, deal.id, stage),
        }],
        suggestions: [S('pipeline'), S('whatCanYouDo')],
      };
    },
  },
  {
    id: 'act-note',
    match: [
      /\b(log|add|save|record|write|leave|jot|put|note down)\b[^?]{0,40}\bnote\b/i,
      /\bnote\b[^?]{0,24}\b(on|against|for|about)\b/i,
      'log a note', 'add a note',
      ...extraMatch('note'),
    ],
    trace: t('agent.trace.note'),
    answer: (q, ctx) => {
      const { ws } = ctx;
      const text = parseNoteText(q);
      const subject = text ? String(q).slice(0, String(q).length - text.length) : q;
      const res = resolveCustomer(ws, subject);
      if (!res.customer) return askForAccount(ws, res, t('agent.whatNote'));
      const c = res.customer;
      if (!text) {
        return {
          text: t('agent.noteHave', { name: c.name, owner: c.owner, n: c.notes.length }),
          suggestions: [S('whatCanYouDo'), S('atRisk')],
        };
      }
      return {
        text: t('agent.noteReady', { name: c.name, text }),
        actions: [{ label: t('agent.noteSave'), doingLabel: t('agent.noteSaving'), run: () => applyNote(ws.id, c.id, text) }],
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
      ...extraMatch('invoicePaid'),
    ],
    trace: t('agent.trace.invoice'),
    answer: (q, ctx) => {
      const { ws } = ctx;
      const res = resolveInvoice(ws, q);
      const openRows = () => ({
        head: TH('invoice', 'account', 'status', 'amount'),
        rows: ws.invoices.filter((i) => i.status !== 'paid').slice(0, 6)
          .map((i) => [i.number, customerName(ws, i.customerId), statusLabel(i.status), cur(ws, i.amount)]),
      });
      if (!res.invoice) {
        if (res.error === 'no-number') {
          return {
            text: t('agent.invNoNumber', { number: res.number, name: ws.name }),
            table: openRows(),
          };
        }
        if (res.error === 'many-invoices') {
          return {
            text: t('agent.invMany', { name: res.customer.name, n: res.invoices.length }),
            table: {
              head: TH('invoice', 'status', 'daysLate', 'amount'),
              rows: res.invoices.map((i) => [i.number, statusLabel(i.status),
                i.status === 'overdue' ? String(invoiceAgeDays(i)) : t('common.dash'), cur(ws, i.amount)]),
            },
          };
        }
        if (res.error === 'nothing-open') {
          return {
            text: res.customer
              ? t('agent.invNoneCust', { name: res.customer.name })
              : t('agent.invNoneWs', { name: ws.name }),
          };
        }
        return { text: t('agent.invWhich'), table: openRows() };
      }
      const inv = res.invoice;
      const who = customerName(ws, inv.customerId);
      if (inv.status === 'paid') {
        return { text: t('agent.invAlready', { number: inv.number, date: fmtDate(inv.paidAt), amount: cur(ws, inv.amount) }) };
      }
      if (inv.status === 'draft') {
        return {
          text: t('agent.invDraft', { number: inv.number, name: who, n: inv.terms }),
          actions: [{ label: t('agent.invIssueNow'), doingLabel: t('agent.invIssuing'), run: () => applyInvoiceIssue(ws.id, inv.id) }],
        };
      }
      const late = inv.status === 'overdue' ? t('agent.invLate', { n: invoiceAgeDays(inv) }) : '';
      return {
        text: t('agent.invOffer', {
          picked: res.picked ? t('agent.invPickedLead', { picked: res.picked }) : '',
          number: inv.number, name: who, amount: cur(ws, inv.amount), date: fmtDate(inv.dueAt), late,
        }),
        actions: [{ label: t('agent.invMarkPaid'), doingLabel: t('agent.invRecording'), run: () => applyInvoicePaid(ws.id, inv.id) }],
        suggestions: [S('overdue'), S('rate')],
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
      ...extraMatch('customerStatus'),
    ],
    trace: t('agent.trace.customer'),
    answer: (q, ctx) => {
      const { ws } = ctx;
      const res = resolveCustomer(ws, q);
      if (!res.customer) return askForAccount(ws, res, t('agent.whatChange'));
      const c = res.customer;
      const status = parseStatus(q);
      const segment = parseSegment(q);
      if (!status && !segment) {
        return {
          text: t('agent.custWhat', {
            name: c.name,
            segment: segmentLabel(c.segment),
            status: statusLabel(c.status),
            statuses: CUSTOMER_STATUS.map(statusLabel).join(', '),
            segments: SEGMENTS.map(segmentLabel).join(', '),
          }),
          suggestions: [S('whatCanYouDo'), S('atRisk')],
        };
      }
      const changes = {};
      if (status && status !== c.status) changes.status = status;
      if (segment && segment !== c.segment) changes.segment = segment;
      if (!Object.keys(changes).length) {
        const what = [status ? statusLabel(status) : '', segment ? segmentLabel(segment) : '']
          .filter(Boolean).join(t('common.and'));
        return { text: t('agent.custSame', { name: c.name, what }) };
      }
      const words = [];
      if (changes.status) words.push(t('agent.custWordStatus', { from: statusLabel(c.status), to: statusLabel(changes.status) }));
      if (changes.segment) words.push(t('agent.custWordSegment', { from: segmentLabel(c.segment), to: segmentLabel(changes.segment) }));
      return {
        text: t('agent.custOffer', { name: c.name, owner: c.owner, words: words.join(t('common.and')) }),
        actions: [{
          label: changes.status
            ? t('agent.custMark', { status: statusLabel(changes.status) })
            : t('agent.custMove', { segment: segmentLabel(changes.segment) }),
          doingLabel: t('agent.custUpdating'),
          run: () => applyCustomerChange(ws.id, c.id, changes),
        }],
        suggestions: [S('atRisk'), S('whatCanYouDo')],
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
      ...extraMatch('invite'),
    ],
    trace: t('agent.trace.invite'),
    answer: (q, ctx) => {
      const { ws } = ctx;
      const person = parsePerson(q);
      const role = parseRole(q) || 'member';
      if (!person.name) {
        return {
          text: t('agent.invWho', { name: ws.name, roles: ROLES.filter((r) => r !== 'owner').map(roleLabel).join(', ') }),
          suggestions: [S('admin'), S('seats')],
        };
      }
      if (role === 'owner') {
        return { text: t('agent.invNoOwner', { name: ws.name, person: person.name }) };
      }
      const domain = (ws.members[0] && ws.members[0].email.split('@')[1]) || `${ws.id}.example`;
      const email = person.email || `${person.name.split(' ')[0].toLowerCase()}@${domain}`;
      const clash = ws.members.find((m) => m.email.toLowerCase() === email.toLowerCase());
      if (clash) {
        return { text: t('agent.invClash', { name: clash.name, email: clash.email, role: roleLabel(clash.role) }) };
      }
      const used = seatsUsed(ws);
      const over = used + 1 > ws.seatsIncluded;
      return {
        text: t('agent.inviteOffer', {
          person: person.name,
          role: roleLabel(role),
          email,
          guessed: !person.email,
          used,
          next: used + 1,
          total: ws.seatsIncluded,
          over,
        }),
        actions: [{
          label: t('agent.invAs', { role: roleLabel(role) }),
          doingLabel: t('agent.invInviting'),
          run: () => applyInvite(ws.id, { name: person.name, email, role }),
        }],
        suggestions: [S('admin'), S('seats')],
      };
    },
  },
  {
    id: 'act-new-deal',
    match: [
      /\b(new|create|open|start|add|raise|set up|log)\b[^?]{0,30}\b(deal|opportunity)\b/i,
      /\bdeal for\b/i,
      'new deal', 'create a deal',
      ...extraMatch('newDeal'),
    ],
    trace: t('agent.trace.newDeal'),
    answer: (q, ctx) => {
      const { ws } = ctx;
      const res = resolveCustomer(ws, q);
      if (!res.customer) return askForAccount(ws, res, t('agent.whatNewDeal'));
      const c = res.customer;
      const value = parseAmount(q);
      const stage = parseStage(q) || 'qualify';
      if (!value) {
        return {
          text: t('agent.newValue', { name: c.name, stage: stageLabel(stage) }),
          suggestions: [S('whatCanYouDo'), S('pipeline')],
        };
      }
      const what = (String(q).match(/\bfor\b[^,]*,\s*[^,]*,\s*([a-z\s]+?)\s*(?:stage)?\s*$/i) || [])[1];
      /* a description the reader typed is kept as they wrote it; without one the
         deal stores a key, so it still reads in whichever language is on */
      const typed = what && !parseStage(what) ? what.trim() : '';
      const title = typed ? `${c.name} — ${typed}` : undefined;
      return {
        text: t('agent.newOffer', {
          name: c.name,
          segment: segmentLabel(c.segment),
          owner: c.owner,
          amount: cur(ws, value),
          stage: stageLabel(stage),
        }),
        actions: [{
          label: t('agent.newCreate'),
          doingLabel: t('agent.newCreating'),
          run: () => applyNewDeal(ws.id, { customerId: c.id, title, value, stage, owner: c.owner }),
        }],
        suggestions: [S('pipeline'), S('biggest')],
      };
    },
  },
];

/* ---------- intents ---------- */

const intents = [
  ...actionIntents,
  {
    id: 'revenue',
    match: [/revenue|turnover|collect(ed|s)?\b|billed|how much did we (make|bill)|this quarter|q[1-4]\b/i, ...extraMatch('revenue')],
    trace: t('agent.trace.revenue'),
    answer: (q, ctx) => {
      const { ws } = ctx;
      const qr = quarterRevenue(ws);
      const months = revenueByMonth(ws, 6);
      const last = months[months.length - 1];
      const prev = months[months.length - 2] || { value: 0, label: t('common.dash') };
      const delta = prev.value ? ((last.value - prev.value) / prev.value) * 100 : 0;
      return {
        text: t('agent.revenue', {
          name: ws.name,
          total: cur(ws, qr.total),
          q: qr.label,
          invoices: cnt(qr.count, 'invoice'),
          month: last.label,
          amount: cur(ws, last.value),
          dir: delta >= 0 ? t('agent.revenueUp') : t('agent.revenueDown'),
          pct: pct(Math.abs(delta), 1),
          prev: prev.label,
          out: cur(ws, outstandingValue(ws)),
        }),
        table: {
          head: TH('month', 'settled'),
          rows: months.map((m) => [m.label, cur(ws, m.value)]),
        },
        meta: t('agent.meta.readInvoices', { n: ws.invoices.length, name: ws.name }),
        suggestions: [S('overdue'), S('pipeline'), S('top')],
      };
    },
  },
  {
    id: 'overdue',
    match: [/overdue|late|unpaid|past due|receivable|aging|ageing|chase/i, 'overdue', 'unpaid', ...extraMatch('overdue')],
    trace: t('agent.trace.overdue'),
    answer: (q, ctx) => {
      const { ws } = ctx;
      const list = overdueInvoices(ws).sort((a, b) => invoiceAgeDays(b) - invoiceAgeDays(a));
      if (!list.length) {
        return { text: t('agent.overdueNone', { name: ws.name, amount: cur(ws, outstandingValue(ws)) }) };
      }
      const total = list.reduce((sum, i) => sum + i.amount, 0);
      const buckets = agingBuckets(ws);
      return {
        text: t('agent.overdueBody', {
          invoices: cnt(list.length, 'invoice'),
          name: ws.name,
          total: cur(ws, total),
          number: list[0].number,
          account: customerName(ws, list[0].customerId),
          n: invoiceAgeDays(list[0]),
          aging: buckets.slice(1).map((b) => `${b.label} ${cur(ws, b.total)}`).join(' · '),
        }),
        table: {
          head: TH('invoice', 'account', 'daysLate', 'amount'),
          rows: list.slice(0, 6).map((i) => [i.number, customerName(ws, i.customerId), String(invoiceAgeDays(i)), cur(ws, i.amount)]),
        },
        suggestions: [S('atRisk'), S('rate'), S('changed')],
      };
    },
  },
  {
    id: 'collection',
    match: [/collection rate|collections|how much have we collected|settled vs issued|paid vs issued|\bdso\b|days to pay|(quickly|fast|long).{0,24}(pay|paid|settle)|payment behaviour|payment behavior/i,
      'collection rate', 'collection', ...extraMatch('collection')],
    trace: t('agent.trace.collection'),
    answer: (q, ctx) => {
      const { ws } = ctx;
      const c = collection(ws);
      if (!c.issued.length) return { text: t('agent.collectionNone', { name: ws.name }) };
      const late = overdueInvoices(ws);
      const counts = ['paid', 'sent', 'overdue', 'draft'].map((s) => {
        const rows = ws.invoices.filter((i) => i.status === s);
        return [statusLabel(s), String(rows.length), cur(ws, rows.reduce((sum, i) => sum + i.amount, 0))];
      });
      return {
        text: t('agent.collectionBody', {
          name: ws.name,
          rate: pct(c.rate, 1),
          settled: cur(ws, c.settledValue),
          issued: cur(ws, c.issuedValue),
          invoices: cnt(c.issued.length, 'issuedInvoice'),
          days: cnt(c.avgDays, 'day'),
          terms: c.avgTerms,
        }) + (late.length
          ? t('agent.collectionLate', {
            out: cur(ws, outstandingValue(ws)),
            late: cur(ws, late.reduce((sum, i) => sum + i.amount, 0)),
          })
          : t('agent.collectionClean', { out: cur(ws, outstandingValue(ws)) })),
        table: { head: TH('status', 'invoices', 'value'), rows: counts },
        meta: t('agent.meta.readInvoices', { n: ws.invoices.length, name: ws.name }),
        suggestions: [S('overdue'), S('top'), S('revenue')],
      };
    },
  },
  {
    id: 'dealowner',
    match: [/who owns|owner of|whose deal|responsible for|handling|(biggest|largest|top|smallest) deal/i,
      'who owns', 'owner', 'biggest deal', ...extraMatch('dealowner')],
    trace: t('agent.trace.dealowner'),
    answer: (q, ctx) => {
      const { ws } = ctx;
      const deal = findDeal(ws, q);
      if (deal) {
        const cust = customerName(ws, deal.customerId);
        return {
          text: t('agent.dealOwner', {
            owner: deal.owner,
            title: dealTitle(ws, deal),
            stage: stageLabel(deal.stage),
            amount: cur(ws, deal.value),
            p: deal.probability,
            date: fmtDate(deal.closeDate),
            account: cust,
            accountOwner: (ws.customers.find((c) => c.id === deal.customerId) || {}).owner,
          }),
          meta: t('agent.meta.matched', { n: ws.deals.length }),
          suggestions: [S('pipeline'), S('admin'), S('atRisk')],
        };
      }
      const top = openDeals(ws).sort((a, b) => b.value - a.value).slice(0, 5);
      return {
        text: t('agent.dealOwnerNone', { name: ws.name }),
        table: {
          head: TH('deal', 'owner', 'stage', 'value'),
          rows: top.map((d) => [dealTitle(ws, d), d.owner, stageLabel(d.stage), cur(ws, d.value)]),
        },
        suggestions: [S('pipeline'), S('admin')],
      };
    },
  },
  {
    id: 'atrisk',
    match: [/at risk|at-risk|churn|losing|dormant|quiet accounts|unhappy/i, 'at risk', 'churn', ...extraMatch('atrisk')],
    trace: t('agent.trace.atrisk'),
    answer: (q, ctx) => {
      const { ws } = ctx;
      const risk = atRiskCustomers(ws);
      if (!risk.length) return { text: t('agent.atRiskNone', { name: ws.name }) };
      const exposed = risk.reduce((sum, r) => sum + r.overdue, 0);
      return {
        text: t('agent.atRiskBody', {
          n: risk.length,
          total: ws.customers.length,
          name: ws.name,
          amount: cur(ws, exposed),
          account: risk[0].customer.name,
          why: risk[0].reasons.join(', '),
        }),
        table: {
          head: TH('account', 'why', 'overdue'),
          rows: risk.slice(0, 6).map((r) => [r.customer.name, r.reasons.join(', '), r.overdue ? cur(ws, r.overdue) : t('common.dash')]),
        },
        suggestions: [S('overdue'), S('top'), S('changed')],
      };
    },
  },
  {
    id: 'seats',
    match: [/seat|licence|license|plan|billing|how many people|users on/i, 'seats', 'plan', ...extraMatch('seats')],
    trace: t('agent.trace.seats'),
    answer: (q, ctx) => {
      const { ws } = ctx;
      const used = seatsUsed(ws);
      const invited = ws.members.filter((m) => m.status === 'invited').length;
      const free = ws.seatsIncluded - used;
      return {
        text: t('agent.seatsBody', {
          name: ws.name,
          plan: planLabel(ws.plan).toLowerCase(),
          total: ws.seatsIncluded,
          used: cnt(used, 'seat'),
          invited: cnt(invited, 'invite'),
          free: free < 0 ? 0 : free,
        }) + (free < 0 ? t('agent.seatsOver', { n: Math.abs(free) }) : t('agent.seatsInside')),
        table: {
          head: TH('role', 'people'),
          rows: ROLES.map((r) => [roleLabel(r), String(ws.members.filter((m) => m.role === r).length)]),
        },
        suggestions: [S('admin'), S('changed')],
      };
    },
  },
  {
    id: 'changes',
    match: [/what changed|this week|recent|latest|activity|happened|updates/i, 'what changed', 'this week', ...extraMatch('changes')],
    trace: t('agent.trace.changes'),
    answer: (q, ctx) => {
      const { ws } = ctx;
      const week = changesSince(ws, 7);
      if (!week.length) return { text: t('agent.changesNone', { name: ws.name }) };
      const byType = {};
      week.forEach((a) => { byType[a.type] = (byType[a.type] || 0) + 1; });
      return {
        text: t('agent.changesBody', {
          changes: cnt(week.length, 'change'),
          name: ws.name,
          breakdown: Object.entries(byType).map(([k, v]) => `${v} ${t(`activityType.${k}`)}`).join(', '),
          text: activityText(week[0]),
          when: ago(week[0].at),
          actor: week[0].actor,
        }),
        table: {
          head: TH('when', 'change', 'by'),
          rows: week.slice(0, 6).map((a) => [ago(a.at), activityText(a), a.actor]),
        },
        suggestions: [S('pipeline'), S('overdue')],
      };
    },
  },
  {
    id: 'pipeline',
    match: [/pipeline|stage|deals|forecast|weighted|win rate|opportunit/i, 'pipeline', 'stage', ...extraMatch('pipeline')],
    trace: t('agent.trace.pipeline'),
    answer: (q, ctx) => {
      const { ws } = ctx;
      const open = openDeals(ws);
      const weighted = open.reduce((sum, d) => sum + (d.value * d.probability) / 100, 0);
      const closed = ws.deals.filter((d) => d.stage === 'won' || d.stage === 'lost');
      const winRate = closed.length ? (ws.deals.filter((d) => d.stage === 'won').length / closed.length) * 100 : 0;
      return {
        text: t('agent.pipelineBody', {
          name: ws.name,
          n: open.length,
          total: cur(ws, pipelineValue(ws)),
          weighted: cur(ws, Math.round(weighted)),
          rate: pct(winRate),
        }),
        table: {
          head: TH('stage', 'deals', 'value'),
          rows: STAGES.map((s) => {
            const inStage = ws.deals.filter((d) => d.stage === s.id);
            return [stageLabel(s.id), String(inStage.length), cur(ws, inStage.reduce((sum, d) => sum + d.value, 0))];
          }),
        },
        suggestions: [S('biggest'), S('revenue')],
      };
    },
  },
  {
    id: 'topcustomers',
    match: [/top (account|customer|client)|best (account|customer|client)|biggest (account|customer|client)|who spends/i,
      'top accounts', 'best customers', ...extraMatch('topcustomers')],
    trace: t('agent.trace.topcustomers'),
    answer: (q, ctx) => {
      const { ws } = ctx;
      const rows = settledByCustomer(ws);
      if (!rows.length) return { text: t('agent.topNone', { name: ws.name }) };
      const grand = rows.reduce((sum, r) => sum + r[1], 0);
      const top3 = rows.slice(0, 3).reduce((sum, r) => sum + r[1], 0);
      return {
        text: t('agent.topBody', {
          name: ws.name,
          share: pct((top3 / grand) * 100, 1),
          account: customerName(ws, rows[0][0]),
          amount: cur(ws, rows[0][1]),
        }),
        table: {
          head: TH('account', 'settled', 'share'),
          rows: rows.slice(0, 6).map(([id, v]) => [customerName(ws, id), cur(ws, v), pct((v / grand) * 100, 1)]),
        },
        suggestions: [S('atRisk'), S('revenue')],
      };
    },
  },
  {
    id: 'access',
    match: [/admin|access|permission|role|who can|team|staff list/i, 'admin', 'roles', ...extraMatch('access')],
    trace: t('agent.trace.access'),
    answer: (q, ctx) => {
      const { ws } = ctx;
      const privileged = ws.members.filter((m) => m.role === 'owner' || m.role === 'admin');
      const stale = ws.members.filter((m) => m.status === 'active' && (Date.now() - new Date(m.lastActive).getTime()) > 21 * 86400000);
      const can = (role) => Object.entries(ws.matrix[role]).filter(([, v]) => v)
        .map(([k]) => permLabel(k).toLowerCase()).join(', ');
      return {
        text: t('agent.accessBody', {
          n: privileged.length,
          name: ws.name,
          who: privileged.map((m) => m.name).join(', '),
          admin: can('admin'),
          member: can('member'),
        }) + (stale.length ? t('agent.accessStale', { n: stale.length }) : t('agent.accessFresh')),
        table: {
          head: TH('person', 'role', 'status', 'lastActive'),
          rows: ws.members.slice(0, 8).map((m) => [m.name, roleLabel(m.role), statusLabel(m.status),
            m.status === 'invited' ? t('common.never') : ago(m.lastActive)]),
        },
        suggestions: [S('seats'), S('changed')],
      };
    },
  },
  {
    id: 'workspaces',
    match: [/workspace|tenant|other business|compare|switch|all three/i, 'workspace', 'tenant', ...extraMatch('workspaces')],
    trace: t('agent.trace.workspaces'),
    answer: (q, ctx) => {
      const s = ctx.state;
      const rows = WORKSPACE_IDS.map((id) => {
        const w = s.workspaces[id];
        return [w.name + (id === s.activeWs ? t('agent.wsOpen') : ''), String(w.customers.length),
          cur(w, pipelineValue(w)), cur(w, overdueInvoices(w).reduce((sum, i) => sum + i.amount, 0))];
      });
      return {
        text: t('agent.wsBody', { n: WORKSPACE_IDS.length, name: ctx.ws.name }),
        table: { head: TH('workspace', 'accounts', 'pipeline', 'overdue'), rows },
        suggestions: [S('revenue'), S('seats')],
      };
    },
  },
  {
    id: 'account',
    match: [/tell me about|look up|details on|account |customer |contact for/i, 'tell me about', 'look up', ...extraMatch('account')],
    trace: t('agent.trace.account'),
    answer: (q, ctx) => {
      const { ws } = ctx;
      const c = findCustomer(ws, q);
      if (!c) {
        return {
          text: t('agent.accountNone', { name: ws.name }),
          table: { head: TH('accountsAsk'), rows: ws.customers.slice(0, 6).map((x) => [x.name]) },
        };
      }
      const invs = ws.invoices.filter((i) => i.customerId === c.id);
      const settled = invs.filter((i) => i.status === 'paid').reduce((sum, i) => sum + i.amount, 0);
      const open = invs.filter((i) => i.status === 'sent' || i.status === 'overdue');
      const deals = ws.deals.filter((d) => d.customerId === c.id);
      return {
        text: t('agent.accountBody', {
          name: c.name,
          segment: segmentLabel(c.segment),
          owner: c.owner,
          status: statusLabel(c.status),
          contact: c.contactName,
          email: c.contactEmail,
          days: c.creditDays,
          ago: ago(c.lastOrder),
          settled: cur(ws, settled),
          n: invs.length,
          open: open.length,
          openValue: cur(ws, open.reduce((sum, i) => sum + i.amount, 0)),
        }),
        table: deals.length
          ? {
            head: TH('deal', 'stage', 'value'),
            rows: deals.map((d) => [dealTitle(ws, d), stageLabel(d.stage), cur(ws, d.value)]),
          }
          : null,
        suggestions: [S('atRisk'), S('overdue')],
      };
    },
  },
  {
    id: 'help',
    match: [/what can you|what do you do|help|how do i|commands|capabilities|can you actually/i,
      'help', 'what can you do', ...extraMatch('help')],
    trace: t('agent.trace.help'),
    answer: (q, ctx) => {
      const { ws } = ctx;
      const account = ws.customers[0] ? ws.customers[0].name : t('customers.unknown');
      const deal = openDeals(ws)[0];
      const dealAccount = deal ? customerName(ws, deal.customerId) : account;
      const late = overdueInvoices(ws)[0];
      const invNumber = late ? late.number : (ws.invoices[0] || { number: t('common.dash') }).number;
      return {
        text: t('agent.help', {
          name: ws.name,
          dealAccount,
          account,
          number: invNumber,
          amount: cur(ws, 400000),
        }),
        suggestions: [
          deal ? S('moveDeal', { account: dealAccount }) : S('overdue'),
          S('note', { account }),
          S('markOldest'),
          S('revenue'),
        ],
      };
    },
  },
];
return intents;
}

export function createCopilot(opts = {}) {
  showScreen = typeof opts.show === 'function' ? opts.show : () => {};
  const ws = activeWorkspace();
  return new Assistant({
    name: t('brand.copilot'),
    initials: t('brand.initials'),
    tag: t('agent.tag'),
    greeting: t('agent.greeting', { name: ws.name }),
    suggestions: [S('whatCanYouDo'), S('overdue'), S('markOldest'), S('revenue')],
    intents: buildIntents(),
    fallbacks: tList('agent.fallbacks'),
    note: t('agent.note'),
    /* the engine's own chrome — the header buttons, the box, the two words it
       says while it works — comes out of the same dictionary as everything else */
    ui: {
      openAria: (name) => t('assist.open', { name }),
      fabTitle: (name) => t('assist.fabTitle', { name }),
      clear: t('assist.clear'),
      close: t('assist.close'),
      send: t('assist.send'),
      placeholder: t('assist.placeholder'),
      you: t('assist.you'),
      working: t('assist.working'),
      done: t('assist.done'),
      applied: t('assist.applied'),
      edge: t('assist.edge'),
      failed: t('assist.failed'),
      searched: t('assist.searched'),
    },
    context: () => ({ ws: activeWorkspace(), state: store.state, months: monthKeys(6), n: num }),
  });
}

export { buildIntents as copilotIntents };
