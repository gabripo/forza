// Forza! admin UI (vanilla JS). Every value coming from the database is escaped with esc().

// The per-launch token arrives in the URL fragment; keep it for reloads, then hide it.
const fromHash = new URLSearchParams(location.hash.slice(1)).get('token')
if (fromHash) {
  sessionStorage.setItem('forza-admin-token', fromHash)
  history.replaceState(null, '', location.pathname)
}
const TOKEN = sessionStorage.getItem('forza-admin-token')

const app = document.getElementById('app')
const state = {
  view: 'people',
  users: [],
  selected: null,
  data: null,
  tab: 'overview',
  catalogue: null,
  plan: [],
}

const esc = (v) =>
  String(v ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c])
const fmtDate = (d, opts = { day: 'numeric', month: 'short', year: 'numeric' }) => (d ? new Date(d).toLocaleDateString('en-GB', opts) : '—')
const fmtNum = (n, digits = 0) => (n == null || Number.isNaN(Number(n)) ? '—' : Number(n).toLocaleString('en-GB', { maximumFractionDigits: digits }))
const e1rm = (w, r) => (w > 0 && r > 0 ? (r === 1 ? w : w * (1 + Math.min(r, 15) / 30)) : 0)

async function api(path, { method = 'GET', body } = {}) {
  const res = await fetch(path, {
    method,
    headers: { authorization: `Bearer ${TOKEN}`, 'content-type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
  })
  const data = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error(data.error || res.statusText)
  return data
}

function toast(msg) {
  const el = document.createElement('div')
  el.className = 'toast'
  el.textContent = msg
  document.body.append(el)
  setTimeout(() => el.remove(), 2600)
}

function exerciseName(id) {
  const c = state.catalogue
  if (!c) return id
  const b = c.builtIn.find((e) => e.id === id)
  if (b) return b.name.en
  const x = c.custom.find((e) => e.id === id)
  return x ? x.name_en : id
}

// ---------------------------------------------------------------------------
// Data loading
// ---------------------------------------------------------------------------

async function loadUsers() {
  state.users = await api('/api/users')
  state.users.sort((a, b) => (a.profile?.display_name || a.email).localeCompare(b.profile?.display_name || b.email))
}

async function selectUser(id) {
  state.selected = id
  state.data = null
  render()
  state.data = await api(`/api/users/${id}`)
  state.plan = structuredClone(state.data.templates)
  render()
}

// ---------------------------------------------------------------------------
// Views
// ---------------------------------------------------------------------------

function render() {
  document.querySelectorAll('.top nav button').forEach((b) => b.classList.toggle('active', b.dataset.view === state.view))
  if (!TOKEN) {
    app.innerHTML = '<p class="pad">Missing access token. Start the dashboard with <code>npm start</code> in the admin folder.</p>'
    return
  }
  app.innerHTML = state.view === 'exercises' ? exercisesView() : peopleView()
}

function peopleView() {
  const list = state.users
    .map((u) => {
      const p = u.profile
      const active = u.workouts_28d >= 8 ? 'good' : u.workouts_28d >= 4 ? 'info' : 'warn'
      return `<li><button data-action="select" data-id="${esc(u.id)}" class="${u.id === state.selected ? 'active' : ''}">
        <div class="name">${esc(p?.display_name || '(no name yet)')}</div>
        <div class="muted small">${esc(u.email)}</div>
        <div class="small">${p?.onboarded_at ? `<span class="pill ${active}">${u.workouts_28d} workouts / 4 wk</span>` : '<span class="pill info">setup not done</span>'}
        ${u.last_weight ? `<span class="muted"> · ${fmtNum(u.last_weight.weight_kg, 1)} kg</span>` : ''}</div>
      </button></li>`
    })
    .join('')
  return `<div class="layout">
    <aside>
      <div class="card"><h2>People</h2><ul class="users">${list || '<li class="muted">No accounts yet.</li>'}</ul></div>
      <div class="card">
        <h2>New account</h2>
        <form class="stack" data-form="create-user">
          <label class="field">Name<input name="display_name" required></label>
          <label class="field">Email<input name="email" type="email" required></label>
          <label class="field">Password (min 8)<input name="password" type="text" minlength="8" required autocomplete="off"></label>
          <label class="field">Language<select name="locale"><option value="it">Italiano</option><option value="en">English</option></select></label>
          <button class="btn">Create account</button>
          <p class="muted small">Sign-ups are closed: only you can create accounts. Give the email and password to the person (or set up their phone), they sign in once and stay signed in.</p>
        </form>
      </div>
    </aside>
    <section>${state.selected ? detailView() : '<div class="card muted">Select a person to see their progress and edit their plan.</div>'}</section>
  </div>`
}

function detailView() {
  const d = state.data
  if (!d) return '<div class="card muted">Loading…</div>'
  const p = d.profile ?? {}
  const user = state.users.find((u) => u.id === state.selected)
  const tabs = ['overview', 'plan', 'workouts', 'food', 'checkins', 'account']
  const labels = { overview: 'Overview', plan: 'Workout plan', workouts: 'Workouts', food: 'Food', checkins: 'Check-ins', account: 'Account' }
  const age = p.birth_year ? new Date().getFullYear() - p.birth_year : '—'
  const body = { overview, plan: planView, workouts: workoutsView, food: foodView, checkins: checkinsView, account: accountView }[state.tab](d)
  return `<div class="card">
      <div class="row"><h2 style="margin:0">${esc(p.display_name || user?.email)}</h2>
      <span class="muted">${esc(user?.email)} · ${esc(p.goal?.replace('_', ' ') ?? 'no goal')} · ${age} y · ${fmtNum(p.height_cm)} cm · ${esc(p.activity_level ?? '')} · ${esc(p.locale ?? '')}</span></div>
      <div class="tabs">${tabs.map((t) => `<button data-action="tab" data-tab="${t}" class="${t === state.tab ? 'active' : ''}">${labels[t]}</button>`).join('')}</div>
    </div>${body}`
}

function overview(d) {
  const weights = d.weights.map((w) => ({ t: new Date(w.measured_at).getTime(), v: Number(w.weight_kg) }))
  const first = weights[0]?.v
  const last = weights.at(-1)?.v
  const since28 = Date.now() - 28 * 86_400_000
  const recentSessions = d.sessions.filter((s) => new Date(s.started_at).getTime() > since28)
  const steps14 = d.steps.slice(-14)
  const avgSteps = steps14.length ? steps14.reduce((a, s) => a + s.steps, 0) / steps14.length : null

  // Strength: first vs latest best estimated 1RM per exercise.
  const per = new Map()
  for (const s of d.sets) {
    if (s.is_warmup) continue
    const v = e1rm(Number(s.weight_kg ?? 0), Number(s.reps ?? 0))
    if (!v) continue
    const m = per.get(s.exercise_id) ?? new Map()
    m.set(s.session_id, Math.max(m.get(s.session_id) ?? 0, v))
    per.set(s.exercise_id, m)
  }
  const strengthRows = [...per]
    .map(([id, m]) => {
      const vals = [...m.values()]
      return { id, n: vals.length, first: vals[0], last: vals.at(-1), pct: ((vals.at(-1) - vals[0]) / vals[0]) * 100 }
    })
    .filter((r) => r.n >= 2)
    .sort((a, b) => b.n - a.n)
  const avgPct = strengthRows.length ? strengthRows.reduce((a, r) => a + r.pct, 0) / strengthRows.length : null

  return `<div class="card"><div class="tiles">
      <div class="tile"><div class="label">Weight now</div><div class="value">${fmtNum(last, 1)} kg</div><div class="small muted">${first != null ? `${last - first >= 0 ? '+' : ''}${fmtNum(last - first, 1)} kg in 12 months` : ''}</div></div>
      <div class="tile"><div class="label">Target</div><div class="value">${fmtNum(p(d).target_weight_kg, 1)} kg</div></div>
      <div class="tile"><div class="label">Workouts, last 4 weeks</div><div class="value">${recentSessions.length}</div><div class="small muted">goal ${p(d).workouts_per_week * 4}</div></div>
      <div class="tile"><div class="label">Avg steps (14 d)</div><div class="value">${fmtNum(avgSteps)}</div><div class="small muted">goal ${fmtNum(p(d).steps_goal)}</div></div>
      <div class="tile"><div class="label">Strength change</div><div class="value">${avgPct == null ? '—' : `${avgPct >= 0 ? '+' : ''}${fmtNum(avgPct)}%`}</div></div>
      <div class="tile"><div class="label">Walks & activities (30 d)</div><div class="value">${fmtNum(d.activities.reduce((m, a) => m + (new Date(a.ended_at) - new Date(a.started_at)) / 60000, 0) / 60, 1)} h</div><div class="small muted">${d.activities.length} sessions</div></div>
      <div class="tile"><div class="label">Lessons read</div><div class="value">${d.lessons.length} / 12</div></div>
      <div class="tile"><div class="label">Calorie check-ins</div><div class="value" style="font-size:18px">${p(d).kcal_adjust ? `${p(d).kcal_adjust > 0 ? '+' : ''}${p(d).kcal_adjust} kcal` : 'no change'}</div><div class="small muted">${p(d).kcal_checkin_at ? 'last ' + fmtDate(p(d).kcal_checkin_at) : ''}</div></div>
      <div class="tile"><div class="label">Health sync</div><div class="value" style="font-size:15px">${d.sync?.last_used_at ? fmtDate(d.sync.last_used_at, { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) : 'not connected'}</div></div>
    </div></div>
    <div class="card"><h2>Weight</h2><div class="chart">${lineChart(weights, (v) => `${fmtNum(v, 1)}`)}</div></div>
    <div class="card"><h2>Steps (90 days)</h2><div class="chart">${barChart(d.steps.map((s) => ({ label: s.day.slice(5), v: s.steps })), p(d).steps_goal)}</div></div>
    ${d.photos.length ? `<div class="card"><h2>Progress photos (${d.photos.length})</h2><p class="muted small">Private photos: open them only if the person is happy to share them with you.</p><button class="btn secondary" data-action="show-photos">Show photos</button><div id="photo-grid" class="row" style="margin-top:10px"></div></div>` : ''}
    <div class="card"><h2>Strength by exercise</h2>
      <table><thead><tr><th>Exercise</th><th class="num">Sessions</th><th class="num">First est. max</th><th class="num">Latest</th><th class="num">Change</th></tr></thead>
      <tbody>${strengthRows.map((r) => `<tr><td>${esc(exerciseName(r.id))}</td><td class="num">${r.n}</td><td class="num">${fmtNum(r.first, 1)} kg</td><td class="num">${fmtNum(r.last, 1)} kg</td><td class="num"><span class="pill ${r.pct >= 0 ? 'good' : 'warn'}">${r.pct >= 0 ? '+' : ''}${fmtNum(r.pct)}%</span></td></tr>`).join('') || '<tr><td colspan="5" class="muted">Not enough workouts yet.</td></tr>'}</tbody></table>
    </div>`
}
const p = (d) => d.profile ?? {}

function lineChart(points, fmt) {
  if (points.length < 2) return '<p class="muted">Not enough data yet.</p>'
  const W = 640
  const H = 200
  const pad = { l: 40, r: 10, t: 10, b: 22 }
  const t0 = points[0].t
  const t1 = points.at(-1).t
  const vs = points.map((x) => x.v)
  const lo = Math.floor(Math.min(...vs) - 0.5)
  const hi = Math.ceil(Math.max(...vs) + 0.5)
  const x = (t) => pad.l + ((t - t0) / (t1 - t0 || 1)) * (W - pad.l - pad.r)
  const y = (v) => pad.t + (1 - (v - lo) / (hi - lo || 1)) * (H - pad.t - pad.b)
  // 7-point moving average as the trend line
  const trend = points.map((_, i) => {
    const win = points.slice(Math.max(0, i - 6), i + 1)
    return { t: points[i].t, v: win.reduce((a, q) => a + q.v, 0) / win.length }
  })
  const ticks = [lo, (lo + hi) / 2, hi]
  return `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="Weight over time">
    ${ticks.map((v) => `<line x1="${pad.l}" x2="${W - pad.r}" y1="${y(v)}" y2="${y(v)}" stroke="var(--grid)"/><text x="${pad.l - 6}" y="${y(v) + 4}" text-anchor="end" font-size="11" fill="#898781">${fmt(v)}</text>`).join('')}
    ${points.map((q) => `<circle cx="${x(q.t)}" cy="${y(q.v)}" r="3" fill="var(--muted-series)"/>`).join('')}
    <path d="${trend.map((q, i) => `${i ? 'L' : 'M'}${x(q.t).toFixed(1)},${y(q.v).toFixed(1)}`).join('')}" fill="none" stroke="var(--series)" stroke-width="2"/>
    <text x="${pad.l}" y="${H - 4}" font-size="11" fill="#898781">${fmtDate(t0, { day: 'numeric', month: 'short' })}</text>
    <text x="${W - pad.r}" y="${H - 4}" font-size="11" fill="#898781" text-anchor="end">${fmtDate(t1, { day: 'numeric', month: 'short' })}</text>
  </svg>`
}

function barChart(bars, goal) {
  if (!bars.length) return '<p class="muted">No steps synced yet.</p>'
  const W = 640
  const H = 140
  const max = Math.max(goal ?? 0, ...bars.map((b) => b.v)) * 1.1
  const band = (W - 20) / bars.length
  const bw = Math.min(14, band * 0.7)
  const y = (v) => 10 + (1 - v / max) * (H - 30)
  return `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="Daily steps">
    ${goal ? `<line x1="10" x2="${W - 10}" y1="${y(goal)}" y2="${y(goal)}" stroke="#8a847d" stroke-dasharray="4 4"/>` : ''}
    ${bars.map((b, i) => `<rect x="${10 + band * i + (band - bw) / 2}" y="${y(b.v)}" width="${bw}" height="${H - 20 - y(b.v)}" rx="2" fill="${b.v >= (goal ?? Infinity) ? 'var(--series)' : 'var(--muted-series)'}"><title>${esc(b.label)}: ${fmtNum(b.v)}</title></rect>`).join('')}
  </svg>`
}

function exerciseOptions(selected) {
  const c = state.catalogue
  if (!c) return `<option value="${esc(selected)}">${esc(selected)}</option>`
  const builtIn = [...c.builtIn].sort((a, b) => a.name.en.localeCompare(b.name.en))
  return `<optgroup label="Catalogue">${builtIn.map((e) => `<option value="${esc(e.id)}" ${e.id === selected ? 'selected' : ''}>${esc(e.name.en)} · ${esc(e.name.it)}</option>`).join('')}</optgroup>
    <optgroup label="Custom">${c.custom.map((e) => `<option value="${esc(e.id)}" ${e.id === selected ? 'selected' : ''}>${esc(e.name_en)}</option>`).join('')}</optgroup>`
}

function planView() {
  const others = state.users.filter((u) => u.id !== state.selected)
  const templates = state.plan
    .map(
      (t, ti) => `<div class="card">
      <div class="row"><input data-plan="${ti}" data-field="name" value="${esc(t.name)}" style="font-weight:700;flex:1;min-width:200px">
        <select data-plan="${ti}" data-field="weekday" title="Fixed day (optional)">${['', 0, 1, 2, 3, 4, 5, 6].map((d) => `<option value="${d}" ${String(t.weekday ?? '') === String(d) ? 'selected' : ''}>${d === '' ? 'any day (rotate)' : ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'][d]}</option>`).join('')}</select>
        <span class="pill ${t.managed_by_admin ? 'good' : 'info'}">${t.managed_by_admin ? 'by you' : 'made by them'}</span></div>
      <label class="field" style="margin-top:8px">Notes<input data-plan="${ti}" data-field="notes" value="${esc(t.notes ?? '')}"></label>
      <table style="margin-top:8px"><thead><tr><th>Exercise</th><th class="num">Sets</th><th class="num">Reps min</th><th class="num">Reps max</th><th class="num">Rest s</th><th class="num">Start kg</th><th class="num" title="Same number = superset">SS</th><th title="Warm-up sets">Warm-up</th><th>Note</th><th></th></tr></thead><tbody>
      ${t.exercises
        .map(
          (e, ei) => `<tr>
          <td><select data-plan="${ti}" data-ex="${ei}" data-field="exercise_id" style="max-width:260px">${exerciseOptions(e.exercise_id)}</select></td>
          <td class="num"><input class="n" data-plan="${ti}" data-ex="${ei}" data-field="sets" value="${esc(e.sets)}"></td>
          <td class="num"><input class="n" data-plan="${ti}" data-ex="${ei}" data-field="rep_min" value="${esc(e.rep_min)}"></td>
          <td class="num"><input class="n" data-plan="${ti}" data-ex="${ei}" data-field="rep_max" value="${esc(e.rep_max)}"></td>
          <td class="num"><input class="n" data-plan="${ti}" data-ex="${ei}" data-field="rest_s" value="${esc(e.rest_s)}"></td>
          <td class="num"><input class="n" data-plan="${ti}" data-ex="${ei}" data-field="target_kg" value="${esc(e.target_kg ?? '')}"></td>
          <td class="num"><input class="n" style="width:44px" data-plan="${ti}" data-ex="${ei}" data-field="superset" value="${esc(e.superset ?? '')}"></td>
          <td><select data-plan="${ti}" data-ex="${ei}" data-field="warmup">${[['', 'auto'], ['true', 'yes'], ['false', 'no']].map(([v, l]) => `<option value="${v}" ${String(e.warmup ?? '') === v ? 'selected' : ''}>${l}</option>`).join('')}</select></td>
          <td><input data-plan="${ti}" data-ex="${ei}" data-field="note" value="${esc(e.note ?? '')}" placeholder="cue for them"></td>
          <td class="row" style="flex-wrap:nowrap"><button class="btn secondary small" data-action="ex-up" data-plan="${ti}" data-ex="${ei}">↑</button><button class="btn secondary small" data-action="ex-down" data-plan="${ti}" data-ex="${ei}">↓</button><button class="btn danger small" data-action="ex-del" data-plan="${ti}" data-ex="${ei}">✕</button></td>
        </tr>`,
        )
        .join('')}
      </tbody></table>
      <div class="row" style="margin-top:10px">
        <button class="btn secondary" data-action="ex-add" data-plan="${ti}">+ Exercise</button>
        <span style="flex:1"></span>
        ${t.id ? `<button class="btn secondary" data-action="tpl-versions" data-plan="${ti}">Versions</button><button class="btn danger" data-action="tpl-del" data-plan="${ti}">Remove workout</button>` : ''}
        <button class="btn" data-action="tpl-save" data-plan="${ti}">Save</button>
      </div>
      ${state.versions?.[t.id] ? versionsList(t, ti) : ''}</div>`,
    )
    .join('')
  return `${templates || '<div class="card muted">No workouts in the plan yet.</div>'}
    <div class="card row">
      <button class="btn" data-action="tpl-new">+ New workout</button>
      ${others.length ? `<span class="muted">or copy the whole plan from</span><select id="copy-from">${others.map((u) => `<option value="${esc(u.id)}">${esc(u.profile?.display_name || u.email)}</option>`).join('')}</select><button class="btn secondary" data-action="plan-copy">Copy</button>` : ''}
      <p class="muted small" style="flex-basis:100%;margin:0">Changes appear on their phone the next time they open the app. The app suggests weights automatically from their history; "Start kg" is only used the first time.</p>
    </div>`
}

function versionsList(t, ti) {
  const list = state.versions[t.id]
  if (!list.length) return '<p class="muted small" style="margin-top:10px">No earlier versions yet: every save keeps the previous one here.</p>'
  return `<h3 style="margin-top:14px">Earlier versions</h3><table><tbody>${list
    .map(
      (v) => `<tr><td>${fmtDate(v.saved_at, { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })}</td><td>${esc(v.name)}</td>
      <td class="muted small">${v.exercises.map((e) => esc(exerciseName(e.exercise_id))).join(', ')}</td>
      <td><button class="btn secondary small" data-action="tpl-restore" data-plan="${ti}" data-version="${v.id}">Restore</button></td></tr>`,
    )
    .join('')}</tbody></table>`
}

function workoutsView(d) {
  if (!d.sessions.length) return '<div class="card muted">No workouts yet.</div>'
  return `<div class="card"><table><thead><tr><th>Date</th><th>Workout</th><th class="num">Minutes</th><th class="num">Sets</th><th class="num">Effort</th></tr></thead><tbody>
    ${d.sessions
      .map((s) => {
        const sets = d.sets.filter((x) => x.session_id === s.id)
        const mins = s.finished_at ? Math.round((new Date(s.finished_at) - new Date(s.started_at)) / 60000) : null
        const byEx = new Map()
        for (const x of sets) byEx.set(x.exercise_id, [...(byEx.get(x.exercise_id) ?? []), x])
        const detail = [...byEx]
          .map(([id, xs]) => `<div><b>${esc(exerciseName(id))}</b>: ${xs.map((x) => (x.weight_kg ? `${fmtNum(x.weight_kg, 2)}×` : '') + (x.reps ?? `${x.duration_s ?? 0}s`)).join(', ')}</div>`)
          .join('')
        return `<tr><td>${fmtDate(s.started_at)}</td><td><details><summary>${esc(s.name)}</summary><div class="small" style="margin-top:6px">${detail}${s.notes ? `<p class="muted">“${esc(s.notes)}”</p>` : ''}</div></details></td><td class="num">${mins ?? '—'}</td><td class="num">${sets.length}</td><td class="num">${s.effort ?? '—'}/10</td></tr>`
      })
      .join('')}
  </tbody></table></div>`
}

function foodView(d) {
  if (!d.food.length) return '<div class="card muted">No meals logged in the last 30 days.</div>'
  return `<div class="card"><table><thead><tr><th></th><th>When</th><th>Meal</th><th class="num">kcal</th><th class="num">P / C / F</th><th class="num">Score (fat loss · muscle)</th></tr></thead><tbody>
    ${d.food
      .map(
        (f) => `<tr><td>${f.photo_path ? `<img class="thumb" data-photo="${esc(f.photo_path)}" alt="">` : ''}</td>
        <td>${fmtDate(f.eaten_at, { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}<div class="muted small">${esc(f.meal)}</div></td>
        <td>${esc(f.title)}${f.ai_notes ? `<div class="muted small">${esc(f.ai_notes)}</div>` : ''}</td>
        <td class="num">${fmtNum(f.kcal)}</td><td class="num">${fmtNum(f.protein_g)} / ${fmtNum(f.carbs_g)} / ${fmtNum(f.fat_g)}</td>
        <td class="num">${f.score_fat_loss ?? '—'} · ${f.score_muscle_gain ?? '—'}</td></tr>`,
      )
      .join('')}
  </tbody></table></div>`
}

function checkinsView(d) {
  if (!d.checkins.length) return '<div class="card muted">No check-ins yet.</div>'
  const face = (n) => (n ? ['😫', '😕', '😐', '🙂', '😄'][n - 1] : '—')
  return `<div class="card"><table><thead><tr><th>Date</th><th>Energy</th><th>Sleep</th><th>Mood</th><th class="num">Waist</th><th>Notes</th></tr></thead><tbody>
    ${d.checkins.map((c) => `<tr><td>${fmtDate(c.created_at)}</td><td>${face(c.energy)}</td><td>${face(c.sleep)}</td><td>${face(c.mood)}</td><td class="num">${c.waist_cm ? `${fmtNum(c.waist_cm, 1)} cm` : '—'}</td><td>${esc(c.notes ?? '')}</td></tr>`).join('')}
  </tbody></table></div>`
}

function accountView() {
  const user = state.users.find((u) => u.id === state.selected)
  return `<div class="card"><h2>Reset password</h2>
      <form class="row" data-form="password"><input name="password" type="text" minlength="8" required placeholder="new password" autocomplete="off"><button class="btn">Set password</button></form>
      <p class="muted small">Last sign-in: ${fmtDate(user?.last_sign_in_at, { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })} · created ${fmtDate(user?.created_at)}</p></div>
    <div class="card"><h2>Import history</h2>
      <p class="muted">Upload a <code>forza-history-v1</code> JSON file (workouts with every set, a plan and weigh-ins), for example converted from another app. Importing the same file again does not create duplicates.</p>
      <form class="row" data-form="import"><input name="file" type="file" accept="application/json,.json" required><button class="btn">Import</button></form></div>
    <div class="card"><h2>Delete account</h2>
      <p class="muted">Permanently deletes the account and all of its data (weights, workouts, food, photos). This cannot be undone.</p>
      <form class="row" data-form="delete"><input name="confirm" placeholder="type the email to confirm" style="min-width:260px"><button class="btn danger">Delete forever</button></form></div>`
}

function exercisesView() {
  const c = state.catalogue
  if (!c) return '<p class="pad muted">Loading…</p>'
  const ov = new Map(c.overrides.map((o) => [o.exercise_id, o]))
  return `<div class="pad">
    <div class="card"><h2>Exercise videos and coach notes</h2>
    <p class="muted">Paste a YouTube link to replace the automatic "Find a video" search for everyone. Coach notes replace the built-in tip.</p>
    <table><thead><tr><th>Exercise</th><th>Video link</th><th>Coach note (EN)</th><th>Coach note (IT)</th><th></th></tr></thead><tbody>
    ${c.builtIn
      .map((e) => {
        const o = ov.get(e.id) ?? {}
        return `<tr data-row="${esc(e.id)}"><td><b>${esc(e.name.en)}</b><div class="muted small">${esc(e.name.it)}</div></td>
          <td><input name="video_url" value="${esc(o.video_url ?? '')}" placeholder="https://youtube.com/…" style="width:100%"></td>
          <td><input name="note_en" value="${esc(o.note_en ?? '')}" style="width:100%"></td>
          <td><input name="note_it" value="${esc(o.note_it ?? '')}" style="width:100%"></td>
          <td><button class="btn small" data-action="override-save" data-id="${esc(e.id)}">Save</button></td></tr>`
      })
      .join('')}
    </tbody></table></div>
    <div class="card"><h2>Add a shared exercise</h2>
      <form class="stack" data-form="custom-exercise" style="max-width:520px">
        <label class="field">Name (English)<input name="name_en" required></label>
        <label class="field">Name (Italian)<input name="name_it"></label>
        <label class="field">How it is measured<select name="kind"><option value="reps">Weight × reps</option><option value="bodyweight">Bodyweight reps</option><option value="time">Time</option><option value="cardio">Cardio (minutes)</option></select></label>
        <label class="field">Main muscles (comma separated: quads, glutes, chest, back, lats, shoulders, biceps, triceps, abs, …)<input name="muscles"></label>
        <label class="field">Steps (one per line, English)<textarea name="steps_en" rows="3"></textarea></label>
        <label class="field">Steps (one per line, Italian)<textarea name="steps_it" rows="3"></textarea></label>
        <label class="field">Video link<input name="video_url"></label>
        <button class="btn">Add for everyone</button>
      </form>
      ${c.custom.length ? `<h3 style="margin-top:16px">Custom exercises</h3><ul>${c.custom.map((x) => `<li>${esc(x.name_en)} <span class="muted small">${x.owner_id ? '(made by a user)' : '(shared)'}</span></li>`).join('')}</ul>` : ''}
    </div></div>`
}

// ---------------------------------------------------------------------------
// Events
// ---------------------------------------------------------------------------

document.querySelector('.top nav').addEventListener('click', async (e) => {
  const view = e.target.closest('button')?.dataset.view
  if (!view) return
  state.view = view
  render()
})

app.addEventListener('input', (e) => {
  const el = e.target
  if (el.dataset.plan === undefined || !el.dataset.field) return
  const t = state.plan[Number(el.dataset.plan)]
  if (el.dataset.ex !== undefined) t.exercises[Number(el.dataset.ex)][el.dataset.field] = el.value
  else t[el.dataset.field] = el.value
})

app.addEventListener('click', async (e) => {
  const btn = e.target.closest('[data-action]')
  if (!btn) return
  const { action } = btn.dataset
  const ti = Number(btn.dataset.plan)
  const ei = Number(btn.dataset.ex)
  try {
    if (action === 'select') return selectUser(btn.dataset.id)
    if (action === 'tab') {
      state.tab = btn.dataset.tab
      render()
      if (state.tab === 'food') loadPhotos()
      return
    }
    if (action === 'ex-add') state.plan[ti].exercises.push({ exercise_id: state.catalogue?.builtIn[0]?.id ?? 'goblet_squat', sets: 3, rep_min: 8, rep_max: 12, rest_s: 90 })
    if (action === 'ex-del') state.plan[ti].exercises.splice(ei, 1)
    if (action === 'ex-up' && ei > 0) {
      const xs = state.plan[ti].exercises
      ;[xs[ei - 1], xs[ei]] = [xs[ei], xs[ei - 1]]
    }
    if (action === 'ex-down') {
      const xs = state.plan[ti].exercises
      if (ei < xs.length - 1) [xs[ei + 1], xs[ei]] = [xs[ei], xs[ei + 1]]
    }
    if (action === 'tpl-new') state.plan.push({ name: `Workout ${String.fromCharCode(65 + state.plan.length)}`, notes: '', position: state.plan.length, exercises: [], managed_by_admin: true })
    if (action === 'tpl-save') {
      const t = { ...state.plan[ti], position: ti }
      const saved = t.id ? await api(`/api/templates/${t.id}`, { method: 'PUT', body: t }) : await api(`/api/users/${state.selected}/templates`, { method: 'POST', body: t })
      state.plan[ti] = saved
      toast('Workout saved: it will appear on their phone')
    }
    if (action === 'tpl-del') {
      if (!confirm('Remove this workout from their plan? Their history is kept.')) return
      await api(`/api/templates/${state.plan[ti].id}`, { method: 'DELETE' })
      state.plan.splice(ti, 1)
      toast('Workout removed')
    }
    if (action === 'tpl-versions') {
      const t = state.plan[ti]
      state.versions = state.versions ?? {}
      state.versions[t.id] = state.versions[t.id] ? null : await api(`/api/templates/${t.id}/versions`)
    }
    if (action === 'tpl-restore') {
      const t = state.plan[ti]
      if (!confirm('Restore this version? The current version is kept in the list, so you can undo.')) return
      state.plan[ti] = await api(`/api/templates/${t.id}/restore/${btn.dataset.version}`, { method: 'POST' })
      state.versions[t.id] = await api(`/api/templates/${t.id}/versions`)
      toast('Version restored')
    }
    if (action === 'show-photos') {
      const grid = document.getElementById('photo-grid')
      grid.innerHTML = ''
      for (const ph of state.data.photos.slice(0, 24)) {
        const { url } = await api(`/api/progress-photo?path=${encodeURIComponent(ph.path)}`)
        if (!url) continue
        const fig = document.createElement('figure')
        fig.style.margin = '0'
        fig.innerHTML = `<img src="${esc(url)}" alt="" style="width:120px;height:160px;object-fit:cover;border-radius:10px"><figcaption class="small muted">${fmtDate(ph.taken_at)}${ph.weight_kg ? ' · ' + fmtNum(ph.weight_kg, 1) + ' kg' : ''}</figcaption>`
        grid.append(fig)
      }
      return
    }
    if (action === 'plan-copy') {
      const from = document.getElementById('copy-from').value
      if (!confirm('Add a copy of that person’s whole plan to this person?')) return
      const r = await api(`/api/users/${state.selected}/copy-plan`, { method: 'POST', body: { from } })
      toast(`Copied ${r.copied} workouts`)
      return selectUser(state.selected)
    }
    if (action === 'override-save') {
      const row = app.querySelector(`[data-row="${CSS.escape(btn.dataset.id)}"]`)
      const body = Object.fromEntries([...row.querySelectorAll('input')].map((i) => [i.name, i.value.trim()]))
      await api(`/api/overrides/${btn.dataset.id}`, { method: 'PUT', body })
      toast('Saved')
      state.catalogue = await api('/api/catalogue')
      return
    }
    render()
  } catch (err) {
    toast(`Error: ${err.message}`)
  }
})

app.addEventListener('submit', async (e) => {
  e.preventDefault()
  const form = e.target
  const data = Object.fromEntries(new FormData(form))
  try {
    if (form.dataset.form === 'create-user') {
      const { id } = await api('/api/users', { method: 'POST', body: data })
      toast('Account created')
      await loadUsers()
      return selectUser(id)
    }
    if (form.dataset.form === 'password') {
      await api(`/api/users/${state.selected}/password`, { method: 'POST', body: data })
      toast('Password updated')
      form.reset()
    }
    if (form.dataset.form === 'import') {
      const file = form.querySelector('input[type=file]').files[0]
      const body = JSON.parse(await file.text())
      toast('Importing…')
      const r = await api(`/api/users/${state.selected}/import`, { method: 'POST', body })
      toast(`Imported ${r.sessions} workouts (${r.sets} sets), ${r.templates} plan workouts, ${r.weights} weigh-ins`)
      return selectUser(state.selected)
    }
    if (form.dataset.form === 'delete') {
      const user = state.users.find((u) => u.id === state.selected)
      if (data.confirm !== user?.email) return toast('Type the exact email to confirm')
      await api(`/api/users/${state.selected}`, { method: 'DELETE' })
      toast('Account deleted')
      state.selected = null
      state.data = null
      await loadUsers()
      render()
    }
    if (form.dataset.form === 'custom-exercise') {
      const lines = (s) => String(s ?? '').split('\n').map((x) => x.trim()).filter(Boolean)
      await api('/api/custom-exercises', {
        method: 'POST',
        body: { ...data, muscles: lines(String(data.muscles).replaceAll(',', '\n')), steps_en: lines(data.steps_en), steps_it: lines(data.steps_it) },
      })
      state.catalogue = await api('/api/catalogue')
      toast('Exercise added')
      render()
    }
  } catch (err) {
    toast(`Error: ${err.message}`)
  }
})

async function loadPhotos() {
  for (const img of app.querySelectorAll('img[data-photo]')) {
    const { url } = await api(`/api/photo?path=${encodeURIComponent(img.dataset.photo)}`)
    if (url) img.src = url
  }
}

// ---------------------------------------------------------------------------

;(async () => {
  render()
  if (!TOKEN) return
  try {
    ;[state.catalogue] = await Promise.all([api('/api/catalogue'), loadUsers()])
    render()
  } catch (err) {
    app.innerHTML = `<p class="pad">Could not reach the database: ${esc(err.message)}</p>`
  }
})()
