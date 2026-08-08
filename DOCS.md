# Opsboard — technical notes

How the app is put together, what the data looks like, and how to add to it.

---

## 0. What this is and how the demo works

The `ABOUT` constant in `src/main.js` holds four blocks, rendered by `aboutModal()` and opened from
two places: the `DEMO` pill in the topbar and the "About this demo" button in the sidebar footer.
Each block is `{ title, text }` or `{ title, list }` — a paragraph or a bulleted list, styled by
`.about__block` / `.about__list` in `assets/opsboard.css`.

**1. What this is.** Opsboard is the operations core of a business: one workspace holding its
customers, its deal pipeline, its invoices, its team and their roles, and the reports built from all
of it. Switching workspace re-scopes every screen, count and total.

**2. Where it helps a business.** Five concrete lines, no metrics and no marketing:

- The customer list, the pipeline and the invoice ledger stop living in three separate spreadsheets.
- Money that is overdue is visible on the invoices screen without anyone compiling a report first.
- A new joiner gets an account with a role instead of being handed a shared login.
- Several businesses or branches run on one deployment rather than a separate system each.
- Reports read the same records staff work in every day, so the numbers cannot drift apart.

**3. How it would work for real.** The interface and the workflow stay as they are; the browser
storage becomes a real database, the workspace picker becomes accounts and permissions, and hosting,
backups and access control are set up properly. The demo is the interface and the workflow, not the
production system.

**4. How this demo works.** The three disclosures, unchanged:

- **You can actually use it.** Nothing is read-only. Create customers and deals, move a deal to
  another stage, mark an invoice paid, invite someone, change a permission — every flow runs for
  real and the numbers on the other screens move with it.
- **Your data stays in this browser.** Everything entered is saved in local storage under a single
  key. Nothing is sent to a server, there is no account and no backend. Clearing browser data or
  pressing "Reset demo data" removes it. It does not sync between browsers or devices.
- **The assistant is simulated.** Opsboard Copilot answers by matching the question against this
  app's own demo data. It is a demonstration of the interaction, not a connected AI model, and no
  request leaves the browser. The assistant panel footer repeats this on every screen.

If you change the disclosure text, change it in all three places: `ABOUT` in `src/main.js`, the
`note` passed to `Assistant` in `src/agent.js`, and the matching sections of `README.md`.

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
| `lib/pwa.js` | `initPWA({ mount, appName, swPath, onNote })` | Shared kit, copied in unmodified. Registers `sw.js`, captures `beforeinstallprompt`, appends the install control to `mount`, and routes its messages to `onNote`. |
| `sw.js` | — | Service worker at the app root, so its scope covers the whole app. Owns the `SHELL` file list and `CACHE_VERSION`. |
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

## 6. Sidebar chrome

Two independent preferences live under one `localStorage` key, `opsboard.chrome.v1`, holding
`{ rail, tone }`:

```js
const CHROME_DEFAULT = { rail: false, tone: true };   // yellow navigation by default
```

`tone` drives `data-tone="amber"` on `<aside class="side">`; `rail` drives `.is-rail` on the shell
and only applies above 900px, since below that the sidebar is already a drawer. The read is
deliberate about the difference between *unset* and *false*:

- no key stored at all → `CHROME_DEFAULT`, so a first visit gets the yellow sidebar;
- key stored with `tone: false` → white sidebar, because an explicit choice always wins;
- unparseable JSON → `CHROME_DEFAULT`.

`applyChrome()` is the single writer. It sets or removes the attribute and then rewrites both
buttons' `aria-pressed`, `aria-label` and `title` from the same state, so what a screen reader is
told can never drift from what is on screen. `setChrome(key, value)` persists and calls it.

Both controls live in `.side__brandbtns`, on the brand row beside the app name, and carry no
visible text — the kit clips their `<span>` and sizes them to 30×30. The rail control names the
action it performs (*Collapse sidebar* / *Expand sidebar*) and swaps its glyph with the state; the
colour control never names a colour at all, keeping a fixed *Sidebar colour* for `title` and
`aria-label` and reporting the yellow tone only through `aria-pressed`. Their two glyphs —
a panel with a chevron, and a circle half filled — are written inline in `src/main.js` in the
kit's 20×20 stroke style for the same reason the link glyphs are: `ICONS` carries neither and
`lib/ui.js` is a verbatim copy. In rail mode `.shell.is-rail .side__brandbtns` stacks them into a
column under the mark, so both stay reachable inside 64px. Below 900px the rail control is hidden
in `assets/opsboard.css`, because a drawer has nothing to collapse.

### What the yellow default changes

`app.css` already carried the `.side[data-tone="amber"]` block; making it the default exposed a few
things that had only ever been judged against a white sidebar. The shared kit fixes its own two —
secondary labels move from `--amber-darker` `#6B5400` (4.4:1 on `#EAC81C`, short of the 4.5:1 that
10–12px text needs) to `--ink-2` (8:1), and `.side[data-tone="amber"] :focus-visible` takes an ink
outline because the brand-yellow ring is invisible on a yellow ground. The rest are in
`assets/opsboard.css` — same specificity as the kit rules and loaded after them, so no kit file was
edited by hand, and every value is an existing token:

| Problem on yellow | Fix |
|---|---|
| `.wsw__label` and `.side__note` are this app's labels and used `--amber-darker` too | `--ink-2` on the amber sidebar only |
| The skip link is an amber fill and lands on top of the sidebar, so it vanished into it | 2px ink border plus an ink focus ring |
| `.btn--ghost` ("About this demo") inherited the solid footer button style and lost its rank | transparent with an ink hairline on yellow, white on hover |
| `aria-pressed` on the two brand-row controls had no visible counterpart | pressed = `--amber-soft` with an amber edge on white, a solid white chip with an ink edge on yellow |

Ink text on `#EAC81C` is 10.9:1. Nothing renders white text on yellow anywhere. The one inverted
element in the sidebar is the `nasvih.in` link (`.btn--site`, `--night` ground, white text,
`--night-2` on hover). The **Source on GitHub** link next to it is a plain outline control, so the
dark treatment stays unique. Both are built by `outLink(url, label, icon, cls)` in `src/main.js`,
which sets `target="_blank"`, `rel="noopener noreferrer"`, a `title` and an `aria-label` ending in
"opens in a new tab"; in rail mode both collapse to their icon like the other footer controls,
keeping the label in `title` and `aria-label`.

The two glyphs those links use — an arrow leaving a box and code brackets — are written inline in
`src/main.js` in the kit's 20×20 stroke style, because `ICONS` in `lib/ui.js` carries neither and
`lib/ui.js` is a verbatim copy. Both are stroke-only, so they inherit `currentColor` like every
other icon; no icon font and no emoji.

`SOURCE_URL` and `SOURCE_NOTE` also feed the About modal, where `aboutModal()` appends an
`.about__source` block under the fourth block. The note repeats what `LICENSE` says — published to
be read, run and evaluated, not open source, and copying, modifying, redistributing, deploying or
training on it needs written permission. If the licence changes, change `SOURCE_NOTE`, `LICENSE` and
the Licence section of `README.md` together.

---

## 7. Installing (PWA)

Three pieces, all at the app root so the scope covers everything:

| File | Role |
|---|---|
| `manifest.webmanifest` | `name`/`short_name` "Opsboard", one-line description, `start_url` and `scope` both `./` so it installs correctly from a GitHub Pages subpath, `display: standalone`, `background_color: #FFFFFF`, `theme_color: #EAC81C`, `lang: en`, categories, and the three icons — 192 and 512 as `purpose: "any"`, the third as `purpose: "maskable"`. |
| `sw.js` | Caches the explicit `SHELL` array under `${scope}::${CACHE_VERSION}`. Navigations try the network and fall back to the cached `index.html`; same-origin assets are cache-first; the cross-origin font stylesheet is network-first. `activate` deletes every older cache in the same scope. |
| `lib/pwa.js` | Registers the worker on `load`, swallows `beforeinstallprompt` and reveals the control, and hides itself when already running standalone. |

`index.html` links the manifest, sets `<meta name="theme-color" content="#EAC81C">` and an
`apple-touch-icon`. `src/main.js` wires it up:

```js
initPWA({ mount: qs('.side__pwa'), appName: 'Opsboard', onNote: (msg) => toast(msg, 'info') });
```

`.side__pwa` is the last `.side__pair` row in the sidebar footer, the one holding "Reset demo
data". `initPWA` appends, so `main.js` moves the returned control to the head of that row; while it
is hidden `[hidden]{display:none!important}` takes it out of the flex row entirely and Reset spans
the row on its own, so nothing moves on browsers that never offer an install. `onNote` goes through
the app's own `toast`, which is how the iOS "Share → Add to Home Screen" instruction is delivered —
Safari fires no install event.

**When you add, rename or delete a file, add it to `SHELL` in `sw.js` and bump `CACHE_VERSION`.**
A path that 404s fails the whole `addAll`, and the install handler swallows that failure to avoid
breaking the page — so the app keeps working online and silently stops working offline. A stale
`CACHE_VERSION` is worse: cache-first means installed copies keep serving the old bundle.

---

## 8. Keyboard and accessibility

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

## 9. Design tokens

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

| `--night` / `--night-2` | `#17181A` / `#222427` | The single dark control: the `nasvih.in` link ground and its hover |

Rules the app holds to: solid fills only — no gradient, no blur, no glow shadow, no emoji as an
icon. Yellow is always a *fill* with ink text on it, never yellow text on white and never white text
on yellow. Icons are inline stroke SVG using `currentColor`, drawn from `ICONS` in `lib/ui.js`; the
one exception is the arrow-out-of-box glyph on the `nasvih.in` link, written inline in `src/main.js`
in the same 20×20 stroke style because the shared set has no external-link icon.

---

## 10. Checks

```bash
# syntax check every module
for f in $(find . -name '*.js'); do cp "$f" /tmp/chk.mjs && node --check /tmp/chk.mjs || echo "FAIL $f"; done

# serve and confirm the page and every asset returns 200
python3 -m http.server 4101
curl -sI http://127.0.0.1:4101/ | head -1
```

The page must load with zero console errors and no network requests other than the two Google Fonts
stylesheets referenced from `index.html`.

For the installable side, in the browser:

1. **Manifest** — DevTools → Application → Manifest shows the name, the three icons and no errors.
2. **Service worker** — registered and *activated*; after one reload `navigator.serviceWorker.controller`
   is non-null and the cache holds one entry per `SHELL` path.
3. **Offline** — stop the server, reload: the shell, the workspace and every screen still render, and
   the console stays clean.
4. **Sidebar** — a fresh profile shows the yellow sidebar with `aria-pressed="true"` on the
   *Sidebar colour* control in the brand row; switching it off, reloading, switching it back and
   reloading again both persist, as does the rail.
5. **390px** — every screen with no horizontal page scroll.

Last verified: manifest parses with three icons, all 22 `SHELL` paths return 200, the worker
activates and controls the page after one reload, an offline reload with the server stopped renders
all seven screens, and 0 console errors were recorded across the seven screens at 1440px and 390px.
