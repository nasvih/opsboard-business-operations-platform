/* Team & roles — members, invites and the permission matrix. */

import { h, fmtDate, ago, modal, toast, confirmDialog, meter, initials, on } from '../../lib/ui.js';
import { store, ROLES, PERMISSIONS, PLANS, seatsUsed, logActivity } from '../data.js';
import { pageHead, statCard, statusPill, emptyState, iconEl } from '../parts.js';

export function render(ctx) {
  const { ws, rerender } = ctx;
  const root = h('div', { class: 'view view--pad' });
  const used = seatsUsed(ws);
  const plan = PLANS.find((p) => p.id === ws.plan) || PLANS[0];

  root.appendChild(pageHead('Team and roles',
    'People with access to this workspace, and what each role is allowed to do. Permission changes are saved per workspace.',
    [h('button', { class: 'btn btn--primary', onclick: () => invite(ctx) }, iconEl('plus'), 'Invite people')]));

  root.appendChild(h('div', { class: 'grid g4' },
    statCard('Seats used', `${used} / ${ws.seatsIncluded}`, `${plan.label} plan`, used > ws.seatsIncluded),
    statCard('Active', String(ws.members.filter((m) => m.status === 'active').length), 'signed in at least once'),
    statCard('Pending invites', String(ws.members.filter((m) => m.status === 'invited').length), 'awaiting first sign-in'),
    statCard('Admins', String(ws.members.filter((m) => m.role === 'owner' || m.role === 'admin').length), 'owner plus admins')));

  root.appendChild(h('div', { class: 'card', style: 'margin-top:20px' },
    h('div', { class: 'between' },
      h('div', {}, h('h3', {}, 'Seat usage'),
        h('p', { class: 'small muted' }, used > ws.seatsIncluded
          ? `${used - ws.seatsIncluded} seats over the plan allowance. Upgrade in Settings.`
          : `${ws.seatsIncluded - used} seats still available on the ${plan.label} plan.`)),
      h('span', { class: 'num', style: 'font-size:20px' }, `${Math.round((used / ws.seatsIncluded) * 100)}%`)),
    h('div', { style: 'margin-top:10px' }, meter(used, ws.seatsIncluded, used > ws.seatsIncluded ? 'bad' : 'ok'))));

  /* members */
  root.appendChild(h('h2', { style: 'margin:22px 0 10px' }, 'People'));
  if (!ws.members.length) {
    root.appendChild(emptyState('No one here yet', 'Invite a colleague to get started.'));
  } else {
    const table = h('table', { class: 'data' },
      h('thead', {}, h('tr', {},
        h('th', {}, 'Person'), h('th', {}, 'Role'), h('th', {}, 'Status'),
        h('th', {}, 'Joined'), h('th', {}, 'Last active'), h('th', { class: 'right' }, 'Remove'))),
      h('tbody', {}, ws.members.map((m) => h('tr', {},
        h('td', {},
          h('div', { class: 'row', style: 'gap:9px;flex-wrap:nowrap' },
            h('span', { class: 'avatar avatar--amber' }, initials(m.name)),
            h('div', { style: 'min-width:0' },
              h('div', { style: 'font-weight:600' }, m.name),
              h('div', { class: 'faint small truncate' }, m.email)))),
        h('td', {}, m.role === 'owner'
          ? h('span', { class: 'pill pill--amber' }, 'owner')
          : h('select', {
            class: 'select select--sm', 'aria-label': `Role for ${m.name}`,
            onchange: (e) => setRole(ctx, m.id, e.target.value),
          }, ROLES.filter((r) => r !== 'owner').map((r) => h('option', { value: r, selected: r === m.role }, r)))),
        h('td', {}, statusPill(m.status)),
        h('td', { class: 'mono small' }, fmtDate(m.joinedAt)),
        h('td', { class: 'mono small' }, m.status === 'invited' ? 'not yet' : ago(m.lastActive)),
        h('td', { class: 'right' }, m.role === 'owner'
          ? h('span', { class: 'faint small' }, 'owner')
          : h('button', {
            class: 'btn btn--sm btn--danger', dataset: { rm: m.id },
            'aria-label': `Remove ${m.name}`,
          }, 'Remove'))))));
    const wrap = h('div', { class: 'tablewrap tablewrap--scroll' }, table);
    on(wrap, 'click', '[data-rm]', async (e, t) => {
      const m = ws.members.find((x) => x.id === t.dataset.rm);
      const ok = await confirmDialog(`${m.name} will lose access to ${ws.name}. Their notes and deals stay in place.`,
        { title: 'Remove access', danger: true, okLabel: 'Remove access' });
      if (!ok) return;
      store.update((s) => {
        const list = s.workspaces[ws.id].members;
        const idx = list.findIndex((x) => x.id === m.id);
        if (idx > -1) list.splice(idx, 1);
      });
      logActivity(ws.id, 'team', `Access removed for ${m.name}`);
      toast(`${m.name} removed`, 'ok');
      rerender();
    });
    root.appendChild(wrap);
  }

  /* role matrix */
  root.appendChild(h('h2', { style: 'margin:26px 0 6px' }, 'Role matrix'));
  root.appendChild(h('p', { class: 'muted small', style: 'margin-bottom:12px' },
    'Tick a box to grant a capability to a role. The owner role always keeps every permission.'));

  const matrix = h('table', { class: 'data matrix' },
    h('thead', {}, h('tr', {},
      h('th', {}, 'Capability'),
      ROLES.map((r) => h('th', { class: 'right' }, r)))),
    h('tbody', {}, PERMISSIONS.map((p) => h('tr', {},
      h('td', {}, h('div', { style: 'font-weight:600' }, p.label), h('div', { class: 'faint small mono' }, p.id)),
      ROLES.map((role) => {
        const locked = role === 'owner';
        const cb = h('input', {
          type: 'checkbox',
          checked: !!ws.matrix[role][p.id],
          disabled: locked,
          'aria-label': `${p.label} for ${role}`,
          onchange: (e) => {
            const on2 = e.target.checked;
            store.update((s) => { s.workspaces[ws.id].matrix[role][p.id] = on2; });
            logActivity(ws.id, 'team', `${on2 ? 'Granted' : 'Revoked'} ${p.id} for ${role}`);
            toast(`${role}: ${p.label.toLowerCase()} ${on2 ? 'granted' : 'revoked'}`);
          },
        });
        return h('td', { class: 'right' }, h('label', { class: 'checkcell' }, cb,
          h('span', { class: 'faint small mono' }, locked ? 'always' : '')));
      })))));
  root.appendChild(h('div', { class: 'tablewrap tablewrap--scroll' }, matrix));

  return root;
}

function setRole(ctx, id, role) {
  const { ws, rerender } = ctx;
  const m = ws.members.find((x) => x.id === id);
  store.update((s) => {
    const target = s.workspaces[ws.id].members.find((x) => x.id === id);
    if (target) target.role = role;
  });
  logActivity(ws.id, 'team', `${m.name} set to ${role}`);
  toast(`${m.name} is now ${role}`, 'ok');
  rerender();
}

function invite(ctx) {
  const { ws, rerender } = ctx;
  const form = h('div', {},
    h('label', { class: 'field' }, h('span', { class: 'field__label' }, 'Full name'),
      h('input', { class: 'input', dataset: { f: 'name' }, placeholder: 'Who are you inviting' })),
    h('label', { class: 'field' }, h('span', { class: 'field__label' }, 'Work email'),
      h('input', { class: 'input', dataset: { f: 'email' }, type: 'email', placeholder: `name@${ws.id}.example` })),
    h('label', { class: 'field' }, h('span', { class: 'field__label' }, 'Role'),
      h('select', { class: 'select', dataset: { f: 'role' } },
        ROLES.filter((r) => r !== 'owner').map((r) => h('option', { value: r, selected: r === 'member' }, r)))),
    h('p', { class: 'hint' }, 'No email is sent — this demo adds the person straight to the workspace as a pending invite.'));

  modal({
    title: `Invite to ${ws.name}`,
    body: form,
    actions: [
      { label: 'Cancel' },
      {
        label: 'Send invite',
        class: 'btn--primary',
        onClick: (bodyEl) => {
          const get = (f) => bodyEl.querySelector(`[data-f="${f}"]`).value.trim();
          const name = get('name');
          const email = get('email');
          if (!name) { toast('Give the invite a name', 'bad'); return true; }
          if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) { toast('That email does not look right', 'bad'); return true; }
          if (ws.members.some((m) => m.email.toLowerCase() === email.toLowerCase())) {
            toast('That address already has access', 'bad'); return true;
          }
          store.update((s) => {
            s.workspaces[ws.id].members.push({
              id: `${ws.id}-m${Date.now().toString(36)}`,
              ws: ws.id,
              name,
              email,
              role: get('role'),
              status: 'invited',
              joinedAt: new Date().toISOString(),
              lastActive: new Date().toISOString(),
            });
          });
          logActivity(ws.id, 'team', `${name} invited as ${get('role')}`);
          toast(`Invite recorded for ${name}`, 'ok');
          rerender();
        },
      },
    ],
  });
}
