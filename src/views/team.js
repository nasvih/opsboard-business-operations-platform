/* Team & roles — members, invites and the permission matrix. */

import { h, fmtDate, ago, modal, toast, confirmDialog, meter, initials, on } from '../../lib/ui.js';
import {
  store, ROLES, PERMISSIONS, seatsUsed, logActivity, roleLabel, permLabel, planLabel,
} from '../data.js';
import { t } from '../main.js';
import { pageHead, statCard, statusPill, emptyState, iconEl } from '../parts.js';

export function render(ctx) {
  const { ws, rerender } = ctx;
  const root = h('div', { class: 'view view--pad' });
  const used = seatsUsed(ws);
  const plan = planLabel(ws.plan);

  root.appendChild(pageHead(t('team.title'), t('team.sub'),
    [h('button', { class: 'btn btn--primary', onclick: () => invite(ctx) }, iconEl('plus'), t('team.invite'))]));

  root.appendChild(h('div', { class: 'grid g4' },
    statCard(t('team.seatsUsed'), `${used} / ${ws.seatsIncluded}`, t('team.planSub', { plan }), used > ws.seatsIncluded),
    statCard(t('team.active'), String(ws.members.filter((m) => m.status === 'active').length), t('team.activeSub')),
    statCard(t('team.pending'), String(ws.members.filter((m) => m.status === 'invited').length), t('team.pendingSub')),
    statCard(t('team.admins'), String(ws.members.filter((m) => m.role === 'owner' || m.role === 'admin').length), t('team.adminsSub'))));

  root.appendChild(h('div', { class: 'card', style: 'margin-top:20px' },
    h('div', { class: 'between' },
      h('div', {}, h('h3', {}, t('team.usage')),
        h('p', { class: 'small muted' }, used > ws.seatsIncluded
          ? t('team.over', { n: used - ws.seatsIncluded })
          : t('team.left', { n: ws.seatsIncluded - used, plan }))),
      h('span', { class: 'num', style: 'font-size:20px' }, `${Math.round((used / ws.seatsIncluded) * 100)}%`)),
    h('div', { style: 'margin-top:10px' }, meter(used, ws.seatsIncluded, used > ws.seatsIncluded ? 'bad' : 'ok'))));

  /* members */
  root.appendChild(h('h2', { style: 'margin:22px 0 10px' }, t('team.people')));
  if (!ws.members.length) {
    root.appendChild(emptyState(t('team.emptyTitle'), t('team.emptyBody')));
  } else {
    const table = h('table', { class: 'data' },
      h('thead', {}, h('tr', {},
        h('th', {}, t('team.thPerson')), h('th', {}, t('team.thRole')), h('th', {}, t('team.thStatus')),
        h('th', {}, t('team.thJoined')), h('th', {}, t('team.thLastActive')), h('th', { class: 'right' }, t('team.thRemove')))),
      h('tbody', {}, ws.members.map((m) => h('tr', {},
        h('td', {},
          h('div', { class: 'row', style: 'gap:9px;flex-wrap:nowrap' },
            h('span', { class: 'avatar avatar--amber' }, initials(m.name)),
            h('div', { style: 'min-width:0' },
              h('div', { style: 'font-weight:600' }, m.name),
              h('div', { class: 'faint small truncate' }, h('span', { dir: 'ltr' }, m.email))))),
        h('td', {}, m.role === 'owner'
          ? h('span', { class: 'pill pill--amber' }, roleLabel('owner'))
          : h('select', {
            class: 'select select--sm', 'aria-label': t('team.roleOf', { name: m.name }),
            onchange: (e) => setRole(ctx, m.id, e.target.value),
          }, ROLES.filter((r) => r !== 'owner').map((r) => h('option', { value: r, selected: r === m.role }, roleLabel(r))))),
        h('td', {}, statusPill(m.status)),
        h('td', { class: 'mono small' }, fmtDate(m.joinedAt)),
        h('td', { class: 'mono small' }, m.status === 'invited' ? t('common.notYet') : ago(m.lastActive)),
        h('td', { class: 'right' }, m.role === 'owner'
          ? h('span', { class: 'faint small' }, roleLabel('owner'))
          : h('button', {
            class: 'btn btn--sm btn--danger', dataset: { rm: m.id },
            'aria-label': t('team.removeOf', { name: m.name }),
          }, t('common.remove')))))));
    const wrap = h('div', { class: 'tablewrap tablewrap--scroll' }, table);
    on(wrap, 'click', '[data-rm]', async (e, el) => {
      const m = ws.members.find((x) => x.id === el.dataset.rm);
      const ok = await confirmDialog(t('team.removeBody', { name: m.name, ws: ws.name }),
        { title: t('team.removeTitle'), danger: true, okLabel: t('team.removeOk') });
      if (!ok) return;
      store.update((s) => {
        const list = s.workspaces[ws.id].members;
        const idx = list.findIndex((x) => x.id === m.id);
        if (idx > -1) list.splice(idx, 1);
      });
      logActivity(ws.id, 'team', 'accessRemoved', { name: m.name });
      toast(t('team.removed', { name: m.name }), 'ok');
      rerender();
    });
    root.appendChild(wrap);
  }

  /* role matrix */
  root.appendChild(h('h2', { style: 'margin:26px 0 6px' }, t('team.matrix')));
  root.appendChild(h('p', { class: 'muted small', style: 'margin-bottom:12px' }, t('team.matrixNote')));

  const matrix = h('table', { class: 'data matrix' },
    h('thead', {}, h('tr', {},
      h('th', {}, t('team.thCapability')),
      ROLES.map((r) => h('th', { class: 'right' }, roleLabel(r))))),
    h('tbody', {}, PERMISSIONS.map((p) => h('tr', {},
      h('td', {}, h('div', { style: 'font-weight:600' }, permLabel(p.id)),
        h('div', { class: 'faint small mono' }, h('span', { dir: 'ltr' }, p.id))),
      ROLES.map((role) => {
        const locked = role === 'owner';
        const cb = h('input', {
          type: 'checkbox',
          checked: !!ws.matrix[role][p.id],
          disabled: locked,
          'aria-label': t('team.permFor', { perm: permLabel(p.id), role: roleLabel(role) }),
          onchange: (e) => {
            const on2 = e.target.checked;
            store.update((s) => { s.workspaces[ws.id].matrix[role][p.id] = on2; });
            logActivity(ws.id, 'team', on2 ? 'permGranted' : 'permRevoked', { perm: p.id, role });
            toast(t('team.permToast', {
              role: roleLabel(role),
              perm: permLabel(p.id).toLowerCase(),
              state: on2 ? t('team.granted') : t('team.revoked'),
            }));
          },
        });
        return h('td', { class: 'right' }, h('label', { class: 'checkcell' }, cb,
          h('span', { class: 'faint small mono' }, locked ? t('common.always') : '')));
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
  logActivity(ws.id, 'team', 'roleSet', { name: m.name, role });
  toast(t('team.roleSet', { name: m.name, role: roleLabel(role) }), 'ok');
  rerender();
}

function invite(ctx) {
  const { ws, rerender } = ctx;
  const form = h('div', {},
    h('label', { class: 'field' }, h('span', { class: 'field__label' }, t('team.fName')),
      h('input', { class: 'input', dataset: { f: 'name' }, placeholder: t('team.fNamePh') })),
    h('label', { class: 'field' }, h('span', { class: 'field__label' }, t('team.fEmail')),
      h('input', {
        class: 'input', dataset: { f: 'email' }, type: 'email', dir: 'ltr',
        placeholder: `name@${ws.id}.example`,
      })),
    h('label', { class: 'field' }, h('span', { class: 'field__label' }, t('team.fRole')),
      h('select', { class: 'select', dataset: { f: 'role' } },
        ROLES.filter((r) => r !== 'owner').map((r) => h('option', { value: r, selected: r === 'member' }, roleLabel(r))))),
    h('p', { class: 'hint' }, t('team.inviteHint')));

  modal({
    title: t('team.inviteTitle', { name: ws.name }),
    body: form,
    actions: [
      { label: t('common.cancel') },
      {
        label: t('team.send'),
        class: 'btn--primary',
        onClick: (bodyEl) => {
          const get = (f) => bodyEl.querySelector(`[data-f="${f}"]`).value.trim();
          const name = get('name');
          const email = get('email');
          if (!name) { toast(t('team.needName'), 'bad'); return true; }
          if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) { toast(t('team.badEmail'), 'bad'); return true; }
          if (ws.members.some((m) => m.email.toLowerCase() === email.toLowerCase())) {
            toast(t('team.dupEmail'), 'bad'); return true;
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
          logActivity(ws.id, 'team', 'invited', { name, role: get('role') });
          toast(t('team.invited', { name }), 'ok');
          rerender();
        },
      },
    ],
  });
}
