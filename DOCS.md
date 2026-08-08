# Opsboard — technical notes

How the app is put together, what the data looks like, and how to add to it.

---

## 0. How this demo works

Three claims the app makes to the person using it, stated once here and once in the app itself
(the `DEMO` pill in the topbar and the "About this demo" button in the sidebar footer both open the
same modal, defined as `ABOUT` in `src/main.js`):

- **You can actually use it.** Nothing is read-only. Create customers and deals, move a deal to
  another stage, mark an invoice paid, invite someone, change a permission — every flow runs for
  real and the numbers on the other screens move with it.
- **Your data stays on your machine.** Everything entered is saved in the browser's local storage
  under a single key. Nothing is sent to a server, there is no account and no backend. Clearing
  browser data or pressing "Reset demo data" removes it. It does not sync between browsers or
  devices.
- **The assistant is simulated.** Opsboard Copilot answers by matching the question against this
  app's own demo data. It is a demonstration of the interaction, not a connected AI model, and no
  request leaves the browser. The assistant panel footer repeats this on every screen.

If you change the disclosure text, change it in all three places: `ABOUT` in `src/main.js`, the
`note` passed to `Assistant` in `src/agent.js`, and the "How this demo works" section of
`README.md`.

---

## 1. Architecture

There is no framework and no build step. The whole app is plain ES modules loaded by the browser
from `index.html`:

```
index.html
  └─ src/main.js            (module entry)
       ├─ lib/ui.js         DOM, formatting, store, router, toast, modal, charts, icons
       ├─ lib/assistant.js  offline assistant engine
       ├─ src/data.js       seeded dataset + selectors + mutations
       ├─ src/agent.js      copilot configuration
       ├─ src/parts.js      shared view fragments
       └─ src/views/*.js    one module per screen
```

### The loop

1. `src/data.js` calls `createStore('opsboard.state.v1', seedState)` at import time. If
   `localStorage` already holds state it is parsed; otherwise `seedState()` generates all three
   workspaces from fixed seeds and the result is written back immediately.
2. `src/main.js` builds the shell once (sidebar, workspace switcher, topbar, view host) and starts
   the hash router from `lib/ui.js`.
3. On every route change `paint()` looks up the nav entry, builds a `ctx` object, calls the view's
   `render(ctx)` and replaces the contents of `#main-view`.
4. Views mutate through `store.update(fn)`. That function persists to `localStorage` and notifies
   subscribers. `main.js` subscribes only to repaint the sidebar counters and topbar; a view asks
   for a fresh render itself by calling `ctx.rerender()`. This is deliberate — a blanket
   re-render on every write would tear down open drawers mid-edit.

### The view contract

Each module in `src/views/` exports one function:

```js
export function render(ctx) { /* … */ return node; }
```

`ctx` carries:

| Key | Meaning |
|---|---|
| `ws` | The active workspace object — the only data a view should read. |
| `state` | The whole store state, for the rare cross-workspace case. |
| `navigate(id)` | Change route, e.g. `ctx.navigate('invoices')`. |
| `rerender(opts)` | Re-run the current view. `{ keepFocus: true }` restores the caret in a search box; `{ full: true }` also scrolls to the top. |

A view never touches the DOM outside the node it returns, apart from modals, drawers and toasts,
which are appended to `document.body` by the helpers.

### Rendering style

Everything is built with `h(tag, attrs, ...children)` from `lib/ui.js`, which returns real DOM
nodes. There is no virtual DOM and no template string HTML for anything that contains demo data, so
user-entered text can never be interpreted as markup. Views re-render wholesale; they are small
enough that this is cheaper than diffing.

---

## 2. Data model

State lives under one `localStorage` key: `opsboard.state.v1`.

```
state
├── version        1
├── seededAt       ISO timestamp of the last generation
├── activeWs       'northline' | 'coastfoods' | 'jeddahfac'
├── user           { name, role }
└── workspaces
    └── <id>
        ├── id, name, short, city, industry
        ├── plan            'starter' | 'growth' | 'scale'
        ├── seatsIncluded   number
        ├── currency        'INR' | 'SAR' | 'AED'
        ├── fiscalStart     'January' | 'April' | 'July' | 'October'
        ├── matrix          { role: { permissionId: boolean } }
        ├── members[]
        ├── customers[]
        ├── deals[]
        ├── invoices[]
        └── activity[]
```

### Records

| Collection | Fields |
|---|---|
| `members` | `id, ws, name, email, role, status('active'\|'invited'), joinedAt, lastActive` |
| `customers` | `id, ws, name, segment, owner, status('active'\|'at-risk'\|'dormant'), city, contactName, contactEmail, contactPhone, since, lastOrder, creditDays, notes[]` |
| `notes` | `id, at, by, text` |
| `deals` | `id, ws, title, customerId, stage, value, owner, probability, openedAt, updatedAt, closeDate` |
| `invoices` | `id, ws, number, customerId, amount, issuedAt, dueAt, status('draft'\|'sent'\|'overdue'\|'paid'), paidAt, terms` |
| `activity` | `id, ws, at, type('deal'\|'invoice'\|'customer'\|'team'\|'note'), actor, text` |

Relationships are by id: `deal.customerId` and `invoice.customerId` point at `customers[].id`.
Owners are stored as display names, matching how a small team actually refers to each other; the
member list is the source of truth for who can be picked.

### Determinism

`seeded(n)` in `lib/ui.js` is a linear congruential generator. Each workspace has its own constant
seed (`10714`, `22447`, `33195`), so the generated records are byte-identical on every machine.
Dates are relative to *now* — `daysFromNow(-40)` — which keeps the demo current no matter when it is
opened, at the cost of the exact figures shifting across day boundaries.

### Derived values

Nothing derived is stored. `src/data.js` exports the selectors instead, so a mutation can never
leave a stale total behind:

`activeWorkspace` · `openDeals` · `pipelineValue` · `wonValue` · `overdueInvoices` ·
`outstandingValue` · `invoiceAgeDays` · `agingBuckets` · `monthKeys` · `revenueByMonth` ·
`quarterBounds` · `quarterRevenue` · `seatsUsed` · `changesSince` · `atRiskCustomers` ·
`customerById` · `customerName`

`atRiskCustomers` is the only one with a rule set worth stating: an account is surfaced if it is
flagged at-risk or dormant, has overdue invoices, or has not ordered in more than 90 days. Each
reason is returned as a string so the UI and the assistant can both explain *why*.

---

## 3. Module map

| Module | Exports | Notes |
|---|---|---|
| `lib/ui.js` | `h, qs, qsa, on, esc, money, money2, num, pct, initials, fmtDate, fmtTime, ago, daysFromNow, isoDay, seeded, pick, between, createStore, router, toast, modal, confirmDialog, downloadCSV, barChart, meter, icon, ICONS` | Shared kit, copied in unmodified. |
| `lib/assistant.js` | `Assistant, pick, esc, renderMarkdownLite` | Shared kit, copied in unmodified. |
| `src/data.js` | `store, seedState, resetDemo, STORE_KEY, STAGES, SEGMENTS, CUSTOMER_STATUS, INVOICE_STATUS, ROLES, PERMISSIONS, PLANS, CURRENCIES, WORKSPACE_IDS`, all selectors, `setWorkspace`, `logActivity` | The only module that writes records. |
| `src/parts.js` | `wsMoney, iconEl, statusPill, pageHead, statCard, emptyState, searchBox, selectFilter, openDrawer, defList, sectionTitle` | View fragments shared by two or more screens. |
| `src/agent.js` | `createCopilot, copilotIntents` | Intent pack; imports selectors, never the views. |
| `src/main.js` | — | Entry point. Owns the shell, the nav table, the router and the shortcuts. |
| `src/views/overview.js` | `render` | |
| `src/views/customers.js` | `render` | Owns the customer drawer and the create modal. |
| `src/views/deals.js` | `render` | Board and flat list share one stage-select component. |
| `src/views/invoices.js` | `render` | Aging plus issue / mark-paid flows. |
| `src/views/team.js` | `render` | Members, invite modal, role matrix. |
| `src/views/reports.js` | `render`, `stageSeries`, `segmentSeries`, `ownerSeries` | Series builders are exported so other screens can reuse them. |
| `src/views/settings.js` | `render` | Workspace, billing, regional, demo reset. |

Import direction is one way: `views → parts → data → lib`. Nothing imports `main.js`, so there are
no cycles.

---

## 4. The assistant

`lib/assistant.js` is a small deterministic engine, not a model. `Assistant._route(q)` scores each
intent — 2 points for a matching regular expression, 1 for a substring keyword — and runs the
highest scorer. The answer function receives `(question, context)` and returns
`{ text, table, meta, suggestions }`. The text is streamed word by word purely so the interaction
reads correctly; the numbers were computed before the first word appeared.

`src/agent.js` passes `context: () => ({ ws: activeWorkspace(), state: store.state, … })`, evaluated
per question, which is why answers change the moment you edit something or switch workspace.

### Intents

| id | Answers |
|---|---|
| `revenue` | Quarter total, month-on-month movement, six-month table, outstanding balance |
| `overdue` | Count and value past due, oldest invoice, aging split, top six |
| `dealowner` | Owner, stage, value, probability and close date for a named deal; falls back to the five biggest open deals |
| `atrisk` | Accounts needing attention with a reason per account and the overdue exposure |
| `seats` | Seat usage against the plan, pending invites, headcount by role |
| `changes` | Activity in the last seven days grouped by type |
| `pipeline` | Open and weighted pipeline, win rate, value per stage |
| `topcustomers` | Ranked accounts by settled revenue with concentration share |
| `access` | Who holds owner or admin, what admins and members can do, stale sign-ins |
| `workspaces` | All three tenants side by side — accounts, pipeline, overdue |
| `account` | Full profile for a named account: contact, terms, invoices, deals |
| `help` | What it can be asked |

Four fallbacks rotate when nothing scores, each naming a question it *can* answer.

### Adding an intent

```js
{
  id: 'segments',
  match: [/segment|category/i, 'segment'],
  trace: 'grouped accounts by segment',
  answer: (q, ctx) => ({
    text: `**${ctx.ws.name}** has ${ctx.ws.customers.length} accounts across five segments.`,
    table: { head: ['Segment', 'Accounts'], rows: [...] },
    suggestions: ['Which customers are at risk?'],
  }),
}
```

Push it into the `intents` array in `src/agent.js`. Read `ctx.ws`, never a captured variable, or the
answer will be stale after a workspace switch.

---

## 5. Extending the app

### Add a screen

1. Create `src/views/thing.js` exporting `render(ctx)`.
2. Import it in `src/main.js` and add a row to the `NAV` table:
   ```js
   { id:'thing', label:'Thing', icon:'box', group:'Workspace', view:thing, count:(ws)=>ws.things.length }
   ```
   `icon` is a key of `ICONS`; `count` is optional and drives the sidebar badge; `group` creates or
   joins a sidebar section. Routing, the title bar, the active state and `Alt`+digit come free.

### Add a field to a record

Add it in the generator in `src/data.js` and bump `STORE_KEY` to `opsboard.state.v2`, otherwise
browsers holding v1 state will render the new field as `undefined`. There is no migration layer by
design — this is a demo, and the reset button is the migration.

### Add a workspace

Add an entry to `BOOK` in `src/data.js` with its own `seed`, company list, team list, contact list
and dial prefix. `WORKSPACE_IDS` is derived from that object, so the switcher, the comparison intent
and the reset all pick it up with no other change.

### Add a chart

`barChart(series, { format, muted })` takes `[{ label, value }]` and returns solid-fill bars — no
library, no canvas. `meter(value, max, kind)` gives a single bar with `''`, `'ok'`, `'bad'` or
`'info'` fills. Both are in `lib/ui.js`.

---

## 6. Keyboard and accessibility

| Key | Action |
|---|---|
| `⌘K` / `Ctrl+K` | Toggle the Opsboard Copilot |
| `Alt` + `1`–`7` | Overview, Customers, Deals, Invoices, Reports, Team, Settings |
| `/` | Focus the search field on the current screen (ignored while typing) |
| `Esc` | Close assistant, modal, drawer or mobile navigation |

- Landmarks: `<aside class="side">` with `<nav aria-label="Main">`, `<header class="topbar">`,
  `<main id="main-view">`, and a skip link as the first focusable element.
- The active nav item carries `aria-current="page"`; the sidebar toggle carries `aria-expanded` and
  `aria-controls`; the workspace switcher is a `listbox` with `aria-selected` on each option.
- Icon-only buttons all carry `aria-label` — sidebar toggle, drawer close, modal close, per-row
  actions.
- Status is never signalled by colour alone: every pill contains the word (`OVERDUE`, `PAID`,
  `AT-RISK`), and every meter is paired with a number.
- Focus is visible everywhere via the shared `:focus-visible` ring; nothing sets `outline: none`
  without a replacement.
- The pipeline board uses a `<select>` per card rather than drag and drop, so it is fully operable
  by keyboard and by touch.
- `prefers-reduced-motion: reduce` disables animation and transitions through `app.css`.

### Responsive behaviour

| Width | Layout |
|---|---|
| ≥ 1080px | Sidebar pinned, four stat columns, five pipeline columns, side-by-side cards |
| 900–1080px | Four-up stats collapse to two-up; the side rail drops under the main column |
| < 900px | Sidebar becomes a slide-over behind the menu button; tapping the content or pressing `Esc` closes it; three-up grids become two-up |
| ≤ 640px | Everything becomes a single column, the pipeline board stacks, tables scroll inside their own container, the assistant goes full screen |

Verified down to 390px with no horizontal page scroll.

---

## 7. Design tokens

All colour, radius and type values come from `assets/app.css`. `assets/opsboard.css` adds components
only and introduces no new colours.

| Token | Value | Used for |
|---|---|---|
| `--bg`, `--surface` | `#FFFFFF` | Page and card ground |
| `--surface-2` | `#FAFAF8` | Table headers, column wells, assistant log |
| `--hover` | `#FEFBEA` | Row and control hover |
| `--ink` / `--ink-2` / `--muted` / `--faint` | `#17181A` / `#2E3033` / `#5A5F66` / `#686E75` | Text scale |
| `--line` / `--line-2` | `#E7E7E4` / `#D8D8D3` | Hairlines and control borders |
| `--amber` / `--amber-fill` | `#EAC81C` | Brand fill — buttons, bars, active states, the launcher |
| `--on-amber` | `#17181A` | Text on any amber fill |
| `--amber-deep` | `#8A6D00` | Amber-family text on white, where the fill colour would fail contrast |
| `--amber-soft` / `--amber-line` | `#FEF9DA` / `#F0DE8C` | Active nav, selected plan, demo pill |
| `--ok` / `--warn` / `--bad` / `--info` | `#1E7A4B` / `#9A6400` / `#B3261E` / `#1F5C9E` | Status, each with a `-soft` ground and `-line` border |
| `--r-lg` / `--r` / `--r-sm` / `--r-xs` | `12` / `8` / `6` / `4` px | Radius scale |
| `--sans` | Inter | Interface text |
| `--mono` | JetBrains Mono | Numbers, labels, badges, ids, dates |
| `--sidebar` / `--bar` / `--gutter` | `248` / `60` / `20` px | Shell metrics |

Rules the app holds to: solid fills only — no gradient, no blur, no glow shadow, no emoji as an
icon. Yellow is always a *fill* with ink text on it, never yellow text on white. Icons are inline
stroke SVG using `currentColor`, drawn from `ICONS` in `lib/ui.js`.

---

## 8. Checks

```bash
# syntax check every module
for f in $(find . -name '*.js'); do cp "$f" /tmp/chk.mjs && node --check /tmp/chk.mjs || echo "FAIL $f"; done

# serve and confirm the page and every asset returns 200
python3 -m http.server 4101
curl -sI http://127.0.0.1:4101/ | head -1
```

The page must load with zero console errors and no network requests other than the two Google Fonts
stylesheets referenced from `index.html`.
