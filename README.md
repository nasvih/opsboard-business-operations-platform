# Opsboard

A multi-tenant business operations platform, built as a self-contained demo. Three sample
businesses share one product: switch workspace in the sidebar and every screen, every stat and
every assistant answer re-scopes to that tenant.

No build step, no dependencies, no network calls. Open it from any static file server.

**Repository:** <https://github.com/nasvih/opsboard-business-operations-platform>

**Author:** Muhammed Nasvih V — [nasvih.in](https://www.nasvih.in) · [github.com/nasvih](https://github.com/nasvih)

The source is published so it can be read, run and evaluated. It is not open source — see
[Licence](#licence).

---

## What this is

Opsboard is the operations core of a business: one workspace holding its customers, its deal
pipeline, its invoices, its team and their roles, and the reports built from all of it. Switch
workspace in the sidebar and every screen, count and total re-scopes to that business.

## Where it helps a business

- The customer list, the pipeline and the invoice ledger stop living in three separate spreadsheets.
- Money that is overdue is visible on the invoices screen without anyone compiling a report first.
- A new joiner gets an account with a role instead of being handed a shared login.
- Several businesses or branches run on one deployment rather than a separate system each.
- Reports read the same records staff work in every day, so the numbers cannot drift apart.

## How it would work for real

The interface and the workflow would stay as they are here. Behind them, the browser storage is
replaced by a real database, sign-in and permissions become accounts rather than a picker, and
hosting, backups and access control are set up properly. This demo is the interface and the
workflow, not the production system.

## How this demo works

**You can actually use it.** Nothing here is read-only. Create customers and deals, move a deal to
another stage, mark an invoice paid, invite someone, change a permission — every flow runs for real
and the numbers on the other screens move with it.

**Your data stays on your machine.** Everything you enter is saved in this browser's local storage.
Nothing is sent to a server, there is no account and no backend. Clear your browser data, or use
"Reset demo data", and it is all gone. It does not sync between browsers or devices.

**The assistant is simulated.** Opsboard Copilot answers by matching your question against this
app's own demo data. It is a demonstration of the interaction, not a connected AI model, and no
request leaves your browser.

The same four blocks are in the app itself, behind the `DEMO` pill in the topbar and the
"About this demo" button in the sidebar footer.

---

## What is in it

Opsboard is the boring, load-bearing part of a business: who your customers are, what is in the
pipeline, what has been billed, who has access, and what the numbers say. It is deliberately built
the way a small operations SaaS actually gets used — a table you can filter, a drawer you can read,
a button that changes a status and shows up in the activity feed a second later.

### Screens

| Screen | What it does |
|---|---|
| **Overview** | Quarter revenue, open pipeline, overdue total and active accounts; a six-month settled-revenue bar chart; workspace health meters (seats, at-risk accounts, receivables); overdue invoices and deals closing inside 21 days; a live activity timeline. |
| **Customers** | All accounts for the workspace with search, segment filter, status filter and three sort orders. Open a row for a drawer with contacts, credit terms, lifetime value, linked deals, recent invoices and notes. Add a note, change the account status, create a new account, export the filtered list to CSV. |
| **Deals** | Five stage columns (Qualify, Proposal, Negotiation, Won, Lost) with a value total per stage, or a flat sortable list. Every card carries a stage select — no drag and drop needed, which also means it works on a phone and from the keyboard. Open, weighted and won totals plus win rate on top. Create a new deal against any account. |
| **Invoices** | Outstanding, overdue, settled and draft totals; a receivables aging breakdown (not due / 1–30 / 31–60 / 60+); a filterable table with status pills and days-late counts. Issue a draft, mark an invoice paid with a confirm step, export to CSV. |
| **Team and roles** | Members with role, status, join date and last-active; seat usage against the plan allowance; invite modal with email validation and duplicate checking; role changes and access removal with a confirm dialog; a permission matrix of six capabilities across owner / admin / member / viewer that saves per workspace. |
| **Reports** | Revenue by month over a 3, 6 or 12 month window; pipeline value by stage; customers by segment; won value by owner; top accounts by settled revenue with share of total. Whole report pack exports to CSV. |
| **Settings** | Workspace name, location, industry, financial year start; plan picker with seat allowance; reporting currency; workspace metadata; and the demo data reset. |

### Things you can actually change

Every one of these writes to `localStorage` and survives a reload:

1. Switch workspace — re-scopes all seven screens, the sidebar counters and the assistant.
2. Move a deal to another stage — totals, win rate, reports and the activity feed all follow.
3. Mark an invoice paid or issue a draft — aging, revenue, the overview and reports follow.
4. Add a note to a customer, or change an account status.
5. Create a customer or a deal.
6. Invite someone, change a role, remove access, or tick a permission in the role matrix.
7. Rename a workspace, change plan, seats or reporting currency.

**Reset demo data** in the sidebar footer (and in Settings) rebuilds all three workspaces from the
seed and throws away every edit.

### The sidebar

Two icon-only controls sit on the brand row at the top of the sidebar, right of the app name.

The navigation is **brand yellow by default**. The right-hand control — a circle half filled —
switches between the yellow sidebar and a plain white one. It names no colour: it is labelled
*Sidebar colour* for screen readers and reports the yellow tone through `aria-pressed`. Whichever
you pick is remembered in `localStorage` and used on every later visit.

Beside it, the panel-and-chevron control shrinks the sidebar to a 64px icon rail (*Collapse
sidebar* / *Expand sidebar*). That is a desktop control: below 900px the sidebar is already a
drawer behind the menu button, so it is hidden there. In the rail the brand row stacks and both
controls stay reachable.

The footer holds **About this demo** across the top, then [nasvih.in](https://www.nasvih.in)
beside a **Source on GitHub** link to this repository — both open in a new tab — and then
**Reset demo data**. When the browser offers an install, an **Install app** button appears next
to Reset on that last row; until then Reset has the row to itself.

### Opsboard Copilot

The in-product assistant. Press `⌘K` / `Ctrl+K`, or use the launcher in the bottom right. It has no
model behind it — each reply is assembled in the browser from the workspace that is currently open,
so the figures always match the screens, and they move when you change something. It answers about
revenue, overdue invoices, deal ownership, at-risk accounts, seat usage, recent changes, pipeline by
stage, top accounts, admin access, workspace comparison and individual account lookups. When it
cannot match a question it says what it *can* answer instead.

---

## Run it

```bash
git clone <this-repo> opsboard
cd opsboard
python3 -m http.server 4101
```

Then open <http://localhost:4101/>.

Any static server works — `npx serve`, `php -S localhost:4101`, nginx, anything. It must be served
over HTTP rather than opened as a `file://` path, because the app is made of ES modules and browsers
block module imports from the filesystem.

Requires a current version of Chrome, Firefox, Safari or Edge. Nothing to install — though you can,
see below.

## Install it

Opsboard is a progressive web app. Served over HTTP or HTTPS it registers a service worker, caches
its own shell, and can be installed to the desktop or home screen where it opens in its own window
with no browser chrome.

- **Chrome, Edge, Brave:** an **Install app** button appears in the sidebar footer, beside
  "Reset demo data", once the browser
  offers the prompt, or use the install icon in the address bar.
- **iPhone and iPad:** Safari has no install prompt, so the same button explains the route —
  Share → *Add to Home Screen*.
- **Offline:** once it has been opened, it keeps working with no connection. The shell is cached and
  the data was always local, so every screen still renders and every flow still runs.

`manifest.webmanifest` describes the app (name, `./` start URL and scope so it works from a project
subpath, standalone display, white background, `#EAC81C` theme colour, three icons). `sw.js` holds
the explicit list of files to cache — **if you add or rename a file, add it to `SHELL` and bump
`CACHE_VERSION`**, otherwise installed copies keep serving the old version.

## Deploy to GitHub Pages

1. Push the repository to GitHub.
2. **Settings → Pages → Build and deployment → Deploy from a branch**, branch `main`, folder `/ (root)`.
3. Wait for the first build; the site appears at `https://<user>.github.io/opsboard/`.

The repository already contains a `.nojekyll` file so Pages serves the `lib/` and `assets/`
directories untouched. All internal paths are relative, so the app works from a project subpath
without any configuration.

## Structure

| Path | Purpose |
|---|---|
| `index.html` | The only page. Hash-routed shell, font links, manifest link, theme colour, `<noscript>` fallback. |
| `manifest.webmanifest` | Web app manifest: name, `./` scope and start URL, standalone display, colours, icons, categories. |
| `sw.js` | Service worker: caches the explicit `SHELL` file list, serves it cache-first, falls back to `index.html` for navigations so an offline reload works. |
| `lib/pwa.js` | Registers the service worker and drives the "Install app" control, including the iOS instructions. Unmodified. |
| `assets/icons/*.png` | App icons: 192, 512 and a maskable 512. |
| `assets/app.css` | Shared design system: tokens, shell, buttons, tables, forms, modal, assistant. Unmodified. |
| `assets/opsboard.css` | App-specific components only: workspace switcher, filter bar, pipeline board, aging rows, role matrix, plan picker. |
| `lib/ui.js` | DOM helpers, formatting, seeded random, `localStorage` store, hash router, toast, modal, CSV export, bar chart, icons. |
| `lib/assistant.js` | The offline assistant engine: intent routing, word-by-word streaming, tables and traces. |
| `src/main.js` | Boot: builds the shell, workspace switcher, navigation, router, keyboard shortcuts, mounts the copilot. |
| `src/data.js` | Seeded demo dataset for all three workspaces, plus selectors and mutations. |
| `src/agent.js` | Opsboard Copilot: twelve intents and four fallbacks, all reading live store state. |
| `src/parts.js` | Small shared view parts: stat cards, status pills, filters, drawer, definition lists. |
| `src/views/*.js` | One module per screen, each exporting `render(ctx)` and returning a DOM node. |

## Demo notes

- Every company, person, phone number and figure is invented. Email domains use the reserved
  `.example` suffix and phone numbers use the reserved `555 01xx` fictional range, so nothing here
  can dial or mail a real person.
- Data is generated from a fixed seed, so two people opening the app see the same numbers until they
  start editing.
- Amounts are shown in the workspace's reporting currency. Changing the currency in Settings only
  changes the symbol — no conversion is applied, and the demo says so on screen.
- There is no server, no account and no analytics. Nothing leaves the browser; clearing site data
  removes everything.

## Keyboard

| Key | Action |
|---|---|
| `⌘K` / `Ctrl+K` | Open or close the Opsboard Copilot |
| `Alt` + `1`–`7` | Jump to Overview, Customers, Deals, Invoices, Reports, Team, Settings |
| `/` | Focus the search box on the current screen |
| `Esc` | Close the assistant, a modal, a drawer or the mobile navigation |
| `Tab` | Move through every control; focus is always visible |

## Licence

All rights reserved. This repository is source-available: you may read it, run it locally and evaluate it, but copying, modifying, redistributing or using it in your own work needs written permission — see [LICENSE](LICENSE).
