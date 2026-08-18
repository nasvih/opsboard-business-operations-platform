/* ============================================================
   Opsboard — seeded demo dataset.

   Everything below is invented sample data generated in the browser from
   a fixed seed, so the numbers are identical on every reload until the
   user changes something. Nothing is fetched from a network.
   ============================================================ */

import { createStore, seeded, between, pick, daysFromNow, dateLocale } from '../lib/ui.js';
import { t } from './main.js';

export const STORE_KEY = 'opsboard.state.v1';

/* ---------- reference tables ---------- */

/* Reference tables carry ids and numbers only. Every label is looked up when
   it is drawn, so the same stored record reads in whichever language is on. */
export const STAGES = [
  { id: 'qualify', open: true },
  { id: 'proposal', open: true },
  { id: 'negotiation', open: true },
  { id: 'won', open: false },
  { id: 'lost', open: false },
];
export const stageLabel = (id) => t(`stages.${id}`);

export const SEGMENTS = ['Retail', 'Wholesale', 'Institutional', 'Online', 'Government'];
export const CUSTOMER_STATUS = ['active', 'at-risk', 'dormant'];
export const INVOICE_STATUS = ['draft', 'sent', 'overdue', 'paid'];
export const ROLES = ['owner', 'admin', 'member', 'viewer'];

export const PERMISSIONS = [
  { id: 'view' }, { id: 'customers' }, { id: 'deals' },
  { id: 'invoices' }, { id: 'team' }, { id: 'billing' },
];
export const permLabel = (id) => t(`perms.${id}`);

export const PLANS = [
  { id: 'starter', seats: 8, priceInr: 2400 },
  { id: 'growth', seats: 15, priceInr: 5900 },
  { id: 'scale', seats: 25, priceInr: 11500 },
];
export const planLabel = (id) => t(`plans.${id}`);

/* The symbol and the code are data, not language: SAR reads SAR in both. */
export const CURRENCIES = [
  { id: 'INR', symbol: '₹' },
  { id: 'SAR', symbol: 'SAR ' },
  { id: 'AED', symbol: 'AED ' },
];
export const currencySymbol = (id) => (CURRENCIES.find((c) => c.id === id) || CURRENCIES[0]).symbol;
export const currencyLabel = (id) => t(`currencies.${id}`);

export const roleLabel = (id) => t(`roles.${id}`);
export const statusLabel = (id) => t(`statuses.${id}`);
export const segmentLabel = (id) => t(`segments.${id}`);
export const monthLabel = (id) => t(`months.${id}`);

/* The seed stores a key for the trade a workspace is in; a workspace somebody
   renamed on the Settings screen stores the words they typed. Both go through
   here, and anything that is not a key comes back exactly as it was written.
   The three English sentences are read as keys too, so a workspace generated
   before this dictionary existed still reads Arabic. */
const INDUSTRY_KEY = {
  'Industrial distribution': 'industrial',
  'Food processing': 'food',
  'Facilities management': 'facilities',
};
export function industryLabel(value) {
  const key = INDUSTRY_KEY[value] || value;
  const word = t(`data.industries.${key}`);
  return word === `data.industries.${key}` ? value : word;
}
export const FISCAL_MONTHS = ['January', 'April', 'July', 'October'];

const defaultMatrix = () => ({
  owner: { view: true, customers: true, deals: true, invoices: true, team: true, billing: true },
  admin: { view: true, customers: true, deals: true, invoices: true, team: true, billing: false },
  member: { view: true, customers: true, deals: true, invoices: false, team: false, billing: false },
  viewer: { view: true, customers: false, deals: false, invoices: false, team: false, billing: false },
});

/* ---------- invented names ---------- */

const BOOK = {
  northline: {
    name: 'Northline Traders',
    short: 'NT',
    city: 'Kochi',
    industry: 'industrial',
    plan: 'growth',
    seed: 10714,
    domain: 'northlinetraders.example',
    companies: ['Marikkar Hardware', 'Vaduthala Steel Mart', 'Panampilly Stationers', 'Edappally Auto Spares',
      'Chittoor Road Electricals', 'Kalamassery Tools', 'Thrikkakara Packaging', 'Fort Kochi Marine Supply',
      'Aluva Cement Depot', 'Nettoor Paint House', 'Tripunithura Timber', 'Vytilla Cold Chain',
      'Palarivattom Glassworks', 'Kakkanad Office Mart', 'Angamaly Feed Traders', 'Perumbavoor Plyboards',
      'Muvattupuzha Agencies', 'Cheranalloor Fasteners', 'Kadavanthra Bearings', 'Elamakkara Sanitaryware'],
    team: ['Ramesh Nair', 'Divya Menon', 'Sajid Rahman', 'Anitha Pillai', 'Vishnu Prasad', 'Farhan Basheer', 'Neethu George'],
    contacts: ['Suresh Kumar', 'Meera Joseph', 'Arun Chandran', 'Nisha Raj', 'Biju Mathew', 'Fathima Rasheed',
      'Praveen Nair', 'Deepa Shenoy', 'Jomon Jacob', 'Sruthi Balan'],
    dial: '+91 484 555 01',
  },
  coastfoods: {
    name: 'Kerala Coast Foods',
    short: 'KC',
    city: 'Alappuzha',
    industry: 'food',
    plan: 'scale',
    seed: 22447,
    domain: 'keralacoastfoods.example',
    companies: ['Alleppey Spice House', 'Kayamkulam Fish Exports', 'Punnapra Coir Kitchen', 'Haripad Grocers',
      'Kollam Bakers Union', 'Cherthala Coconut Works', 'Mararikulam Resort Kitchens', 'Ambalappuzha Sweets',
      'Thottappally Seafoods', 'Karunagappally Rice Mill', 'Chengannur Catering Co', 'Vaikom Provision Stores',
      'Kuttanad Farm Supply', 'Pathirappally Snacks', 'Mannancherry Dairy', 'Purakkad Canning',
      'Arthunkal Ice Plant', 'Kanjikuzhy Millers', 'Muhamma Backwater Foods', 'Thanneermukkom Traders'],
    team: ['Latha Kurian', 'Anoop Varghese', 'Shabna Ali', 'Jibin Thomas', 'Reshma Nambiar', 'Sudheer Das', 'Tessa Cyriac'],
    contacts: ['Rajan Pillai', 'Sneha Antony', 'Noushad Haneef', 'Geetha Menon', 'Vinod Kurup', 'Asha Mohan',
      'Sabu Alexander', 'Rincy Paul', 'Hameed Kunju', 'Manju Sasi'],
    dial: '+91 477 555 01',
  },
  jeddahfac: {
    name: 'Jeddah Facilities Co',
    short: 'JF',
    city: 'Jeddah',
    industry: 'facilities',
    plan: 'starter',
    seed: 33195,
    domain: 'jeddahfacilities.example',
    companies: ['Al Fanar Property Trust', 'Rawdah Tower Owners', 'Corniche Retail Group', 'Al Salamah Clinics',
      'Obhur Marine Club', 'Al Hamra Offices', 'Jamea Logistics Park', 'Bawadi Hotel Group',
      'Al Nahdah Schools Trust', 'Sari Street Plaza', 'Madinah Road Motors', 'Al Zahra Residences',
      'King Road Business Park', 'Al Rehab Facilities Board', 'Andalus Warehouse Co', 'Tahliyah Court Offices',
      'Al Aziziyah Cold Stores', 'Sultanah Serviced Flats', 'Baghdadiyah Print Works', 'Al Murjan Gym Group'],
    team: ['Yousef Al Harbi', 'Mariam Siddiqui', 'Tariq Al Amoudi', 'Hana Al Zahrani', 'Imran Qureshi', 'Salma Bakr', 'Omar Al Fadl'],
    contacts: ['Khalid Al Otaibi', 'Layla Farouk', 'Abdullah Al Ghamdi', 'Reem Nasser', 'Waleed Hassan',
      'Nada Al Sudairi', 'Faisal Al Juhani', 'Huda Bakhsh', 'Sami Al Turki', 'Amal Rifai'],
    dial: '+966 12 555 01',
  },
};

export const WORKSPACE_IDS = Object.keys(BOOK);

/* The seed stores keys, never sentences: a workspace generated in English
   still reads Arabic after the switch, because nothing in storage is a
   language. Anything the user types is stored as they typed it. */
const DEAL_KINDS = ['annual', 'restock', 'pilot', 'renewal', 'branch',
  'upgrade', 'bulk', 'retainer', 'seasonal', 'fleet'];

const NOTE_KEYS = ['n1', 'n2', 'n3', 'n4', 'n5', 'n6', 'n7', 'n8'];

const ACTIVITY_KINDS = [
  { type: 'deal', key: 'seedDeal' },
  { type: 'invoice', key: 'seedInvoice' },
  { type: 'customer', key: 'seedCustomer' },
  { type: 'team', key: 'seedTeam' },
  { type: 'note', key: 'seedNote' },
];

/* ---------- reading a stored record back out as language ---------- */

/* A note the user wrote is kept verbatim; a seeded one is a key. */
export const noteText = (n) => (n && n.text ? n.text : t(`data.notes.${n.key}`));

/* Activity lines carry a key and the pieces that fill it. Ids inside those
   pieces — a stage, a role, a status, a permission — are resolved here so the
   sentence is whole in the reading language. */
export function activityText(a) {
  if (!a) return '';
  if (a.text) return a.text;                       // written before this version
  const v = { ...(a.vars || {}) };
  if (v.stage) v.stage = stageLabel(v.stage);
  if (v.role) v.role = roleLabel(v.role);
  if (v.status) v.status = statusLabel(v.status);
  if (v.segment) v.segment = segmentLabel(v.segment);
  if (v.perm) v.perm = permLabel(v.perm);
  if (v.plan) v.plan = planLabel(v.plan);
  if (v.titleOf) v.title = dealTitleById(v.wsId, v.titleOf);
  return t(`data.activity.${a.key}`, v);
}

/* A seeded deal is "account — kind of work"; a deal somebody typed keeps the
   title they gave it. */
export function dealTitle(ws, d) {
  if (!d) return '';
  if (d.title) return d.title;
  return `${customerName(ws, d.customerId)} — ${t(`data.dealKinds.${d.kindKey}`)}`;
}
const dealTitleById = (wsId, dealId) => {
  const ws = store.state.workspaces[wsId];
  const d = ws && ws.deals.find((x) => x.id === dealId);
  return d ? dealTitle(ws, d) : '';
};

const slug = (s) => String(s).toLowerCase().replace(/[^a-z0-9]+/g, '');
const emailFor = (person, domain) => `${slug(person.split(' ')[0])}@${domain}`;
const custDomain = (company) => `${slug(company).slice(0, 20)}.example`;

/* ---------- generator ---------- */

function genWorkspace(wsId) {
  const b = BOOK[wsId];
  const rnd = seeded(b.seed);
  const plan = PLANS.find((p) => p.id === b.plan);

  /* team */
  const members = b.team.map((name, i) => ({
    id: `${wsId}-m${i + 1}`,
    ws: wsId,
    name,
    email: emailFor(name, b.domain),
    role: i === 0 ? 'owner' : i === 1 ? 'admin' : i >= b.team.length - 1 ? 'viewer' : 'member',
    status: i === b.team.length - 2 ? 'invited' : 'active',
    joinedAt: daysFromNow(-between(90, 900, rnd)).toISOString(),
    lastActive: daysFromNow(-between(0, 26, rnd)).toISOString(),
  }));
  const activeOwners = members.filter((m) => m.status === 'active').map((m) => m.name);

  /* customers */
  const customers = b.companies.map((company, i) => {
    const contact = b.contacts[i % b.contacts.length];
    const statusRoll = rnd();
    const status = statusRoll > 0.86 ? 'dormant' : statusRoll > 0.7 ? 'at-risk' : 'active';
    const noteCount = between(1, 3, rnd);
    const notes = [];
    for (let n = 0; n < noteCount; n++) {
      notes.push({
        id: `${wsId}-c${i + 1}-n${n + 1}`,
        at: daysFromNow(-between(2, 120, rnd)).toISOString(),
        by: pick(activeOwners, rnd),
        key: pick(NOTE_KEYS, rnd),
      });
    }
    notes.sort((a, c) => new Date(c.at) - new Date(a.at));
    return {
      id: `${wsId}-c${i + 1}`,
      ws: wsId,
      name: company,
      segment: SEGMENTS[Math.floor(rnd() * SEGMENTS.length)],
      owner: pick(activeOwners, rnd),
      status,
      city: b.city,
      contactName: contact,
      contactEmail: `${slug(contact.split(' ')[0])}@${custDomain(company)}`,
      contactPhone: `${b.dial}${String(10 + i).slice(-2)}`,
      since: daysFromNow(-between(120, 1500, rnd)).toISOString(),
      lastOrder: daysFromNow(-between(1, status === 'dormant' ? 220 : 70, rnd)).toISOString(),
      creditDays: pick([15, 30, 45, 60], rnd),
      notes,
    };
  });

  /* deals */
  const deals = [];
  const dealCount = between(15, 19, rnd);
  for (let i = 0; i < dealCount; i++) {
    const cust = customers[Math.floor(rnd() * customers.length)];
    const stage = pick(['qualify', 'qualify', 'proposal', 'proposal', 'negotiation', 'won', 'won', 'lost'], rnd);
    deals.push({
      id: `${wsId}-d${i + 1}`,
      ws: wsId,
      kindKey: pick(DEAL_KINDS, rnd),
      customerId: cust.id,
      stage,
      value: between(6, 120, rnd) * 10000,
      owner: pick(activeOwners, rnd),
      probability: stage === 'won' ? 100 : stage === 'lost' ? 0 : between(15, 80, rnd),
      openedAt: daysFromNow(-between(10, 160, rnd)).toISOString(),
      updatedAt: daysFromNow(-between(0, 21, rnd)).toISOString(),
      closeDate: daysFromNow(between(-30, 75, rnd)).toISOString(),
    });
  }

  /* invoices — spread over ~6 months so the revenue chart has shape */
  const invoices = [];
  const invCount = between(24, 30, rnd);
  for (let i = 0; i < invCount; i++) {
    const cust = customers[Math.floor(rnd() * customers.length)];
    const issuedDays = -between(3, 178, rnd);
    const issuedAt = daysFromNow(issuedDays);
    const terms = cust.creditDays;
    const dueAt = new Date(issuedAt.getTime() + terms * 86400000);
    const amount = between(15, 420, rnd) * 1000;
    let status;
    let paidAt = null;
    const overdue = dueAt.getTime() < Date.now();
    const roll = rnd();
    if (issuedDays > -22 && roll > 0.55) status = 'draft';
    else if (overdue) { if (roll > 0.42) { status = 'paid'; paidAt = new Date(dueAt.getTime() - between(0, 12, rnd) * 86400000).toISOString(); } else status = 'overdue'; }
    else if (roll > 0.6) { status = 'paid'; paidAt = new Date(issuedAt.getTime() + between(2, terms, rnd) * 86400000).toISOString(); }
    else status = 'sent';
    if (paidAt && new Date(paidAt).getTime() > Date.now()) paidAt = new Date().toISOString();
    invoices.push({
      id: `${wsId}-i${i + 1}`,
      ws: wsId,
      number: `${b.short}-${2026}${String(i + 101).padStart(4, '0')}`,
      customerId: cust.id,
      amount,
      issuedAt: issuedAt.toISOString(),
      dueAt: dueAt.toISOString(),
      status,
      paidAt,
      terms,
    });
  }
  invoices.sort((a, c) => new Date(c.issuedAt) - new Date(a.issuedAt));

  /* activity feed */
  const activity = [];
  for (let i = 0; i < 16; i++) {
    const kind = ACTIVITY_KINDS[Math.floor(rnd() * ACTIVITY_KINDS.length)];
    const subject = kind.type === 'team' ? pick(activeOwners, rnd) : customers[Math.floor(rnd() * customers.length)].name;
    activity.push({
      id: `${wsId}-a${i + 1}`,
      ws: wsId,
      at: daysFromNow(-between(0, 20, rnd)).toISOString(),
      type: kind.type,
      actor: pick(activeOwners, rnd),
      key: kind.key,
      vars: { n: subject },
    });
  }
  activity.sort((a, c) => new Date(c.at) - new Date(a.at));

  return {
    id: wsId,
    name: b.name,
    short: b.short,
    city: b.city,
    industry: b.industry,
    plan: b.plan,
    seatsIncluded: plan.seats,
    currency: 'INR',
    fiscalStart: 'April',
    matrix: defaultMatrix(),
    members,
    customers,
    deals,
    invoices,
    activity,
  };
}

export function seedState() {
  const workspaces = {};
  WORKSPACE_IDS.forEach((id) => { workspaces[id] = genWorkspace(id); });
  return {
    version: 1,
    seededAt: new Date().toISOString(),
    activeWs: WORKSPACE_IDS[0],
    user: { name: 'Muhammed Nasvih V', role: 'owner' },
    workspaces,
  };
}

export const store = createStore(STORE_KEY, seedState);

/* ---------- selectors + mutations ---------- */

export const activeWorkspace = (state = store.state) => state.workspaces[state.activeWs] || state.workspaces[WORKSPACE_IDS[0]];

export function setWorkspace(id) {
  store.update((s) => { if (s.workspaces[id]) s.activeWs = id; });
}

export function logActivity(wsId, type, key, vars, actor) {
  store.update((s) => {
    const ws = s.workspaces[wsId];
    if (!ws) return;
    ws.activity.unshift({
      id: `${wsId}-a${Date.now().toString(36)}`,
      ws: wsId,
      at: new Date().toISOString(),
      type,
      actor: actor || s.user.name,
      key,
      vars: vars || {},
    });
    ws.activity = ws.activity.slice(0, 60);
  });
}

export const customerById = (ws, id) => ws.customers.find((c) => c.id === id) || null;
export const customerName = (ws, id) => (customerById(ws, id) || { name: t('customers.unknown') }).name;

export const openDeals = (ws) => ws.deals.filter((d) => d.stage !== 'won' && d.stage !== 'lost');
export const pipelineValue = (ws) => openDeals(ws).reduce((t, d) => t + d.value, 0);
export const wonValue = (ws) => ws.deals.filter((d) => d.stage === 'won').reduce((t, d) => t + d.value, 0);

export const overdueInvoices = (ws) => ws.invoices.filter((i) => i.status === 'overdue');
export const outstandingValue = (ws) => ws.invoices.filter((i) => i.status === 'sent' || i.status === 'overdue').reduce((t, i) => t + i.amount, 0);

export function invoiceAgeDays(inv) {
  return Math.max(0, Math.round((Date.now() - new Date(inv.dueAt).getTime()) / 86400000));
}

export function agingBuckets(ws) {
  const buckets = ['current', 'b1', 'b2', 'b3'].map((id) => ({ id, label: t(`aging.${id}`), total: 0, count: 0 }));
  ws.invoices.filter((i) => i.status === 'sent' || i.status === 'overdue').forEach((i) => {
    const age = invoiceAgeDays(i);
    const b = i.status === 'sent' && age === 0 ? buckets[0] : age <= 30 ? buckets[1] : age <= 60 ? buckets[2] : buckets[3];
    b.total += i.amount; b.count += 1;
  });
  return buckets;
}

export function monthKeys(count = 6) {
  const out = [];
  const now = new Date();
  for (let i = count - 1; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    out.push({
      key: `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`,
      label: d.toLocaleDateString(dateLocale(), { month: 'short' }),
      year: d.getFullYear(),
    });
  }
  return out;
}

export function revenueByMonth(ws, count = 6) {
  const months = monthKeys(count);
  const index = Object.fromEntries(months.map((m) => [m.key, 0]));
  ws.invoices.filter((i) => i.status === 'paid' && i.paidAt).forEach((i) => {
    const d = new Date(i.paidAt);
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
    if (key in index) index[key] += i.amount;
  });
  return months.map((m) => ({ label: m.label, value: index[m.key], key: m.key }));
}

export function quarterBounds(d = new Date()) {
  const q = Math.floor(d.getMonth() / 3);
  const from = new Date(d.getFullYear(), q * 3, 1);
  const to = new Date(d.getFullYear(), q * 3 + 3, 0, 23, 59, 59);
  return { from, to, label: t('quarter', { q: q + 1, y: d.getFullYear() }) };
}

export function quarterRevenue(ws) {
  const { from, to, label } = quarterBounds();
  const rows = ws.invoices.filter((i) => i.status === 'paid' && i.paidAt
    && new Date(i.paidAt) >= from && new Date(i.paidAt) <= to);
  return { label, total: rows.reduce((t, i) => t + i.amount, 0), count: rows.length, rows };
}

export const seatsUsed = (ws) => ws.members.filter((m) => m.status !== 'removed').length;

export function changesSince(ws, days = 7) {
  const cut = Date.now() - days * 86400000;
  return ws.activity.filter((a) => new Date(a.at).getTime() >= cut);
}

export function atRiskCustomers(ws) {
  const overdueBy = {};
  overdueInvoices(ws).forEach((i) => { overdueBy[i.customerId] = (overdueBy[i.customerId] || 0) + i.amount; });
  return ws.customers
    .map((c) => {
      const reasons = [];
      if (c.status === 'at-risk') reasons.push(t('data.risk.flagged'));
      if (c.status === 'dormant') reasons.push(t('data.risk.dormant'));
      if (overdueBy[c.id]) reasons.push(t('data.risk.overdue'));
      const idle = Math.round((Date.now() - new Date(c.lastOrder).getTime()) / 86400000);
      if (idle > 90) reasons.push(t('data.risk.idle', { n: idle }));
      return { customer: c, reasons, overdue: overdueBy[c.id] || 0, idle };
    })
    .filter((r) => r.reasons.length)
    .sort((a, b) => (b.overdue - a.overdue) || (b.idle - a.idle));
}

export function resetDemo() {
  store.reset();
}
