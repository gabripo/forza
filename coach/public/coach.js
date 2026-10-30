// Forza! Coach UI (vanilla JS). Every value coming from the database is escaped with esc().

// The per-launch token arrives in the URL fragment; keep it for reloads, then hide it.
const fromHash = new URLSearchParams(location.hash.slice(1)).get('token')
if (fromHash) {
  sessionStorage.setItem('forza-coach-token', fromHash)
  history.replaceState(null, '', location.pathname)
}
const TOKEN = sessionStorage.getItem('forza-coach-token')

const app = document.getElementById('app')
const state = {
  status: null,
  setup: { projects: null, organizations: [], choice: null, job: null },
  bws: { devices: null, job: null },
  auto: null,
  autostart: null,
  ai: null,
  aiModels: {},
  aiPhoto: null,
  signin: null,
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
// Body weight: always two decimals, as smart scales measure it.
const fmtKg = (n) => (n == null || Number.isNaN(Number(n)) ? '—' : Number(n).toLocaleString('en-GB', { minimumFractionDigits: 2, maximumFractionDigits: 2 }))
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
    app.innerHTML = '<p class="pad">Missing access token. Start Forza! Coach again with its start file (or <code>npm start</code> in the coach folder).</p>'
    return
  }
  if (!state.status) {
    app.innerHTML = '<p class="pad muted">Loading…</p>'
    return
  }
  if (!state.status.configured || state.view === 'setup') {
    app.innerHTML = setupView()
    return
  }
  app.innerHTML = state.view === 'exercises' ? exercisesView() : state.view === 'knowledge' ? knowledgeView() : peopleView()
}

function peopleView() {
  const list = state.users
    .map((u) => {
      const p = u.profile
      const active = u.workouts_28d >= 8 ? 'good' : u.workouts_28d >= 4 ? 'info' : 'warn'
      return `<li><button data-action="select" data-id="${esc(u.id)}" class="${u.id === state.selected ? 'active' : ''}">
        <div class="name">${esc(p?.display_name || '(no name yet)')}</div>
        <div class="muted small">${u.no_email ? 'signs in with a QR code' : esc(u.email)}</div>
        <div class="small">${p?.onboarded_at ? `<span class="pill ${active}">${u.workouts_28d} workouts / 4 wk</span>` : '<span class="pill info">setup not done</span>'}
        ${u.last_weight ? `<span class="muted"> · ${fmtKg(u.last_weight.weight_kg)} kg</span>` : ''}</div>
      </button></li>`
    })
    .join('')
  return `<div class="layout">
    <aside class="no-print">
      <div class="card"><h2>People</h2><ul class="users">${list || '<li class="muted">No accounts yet.</li>'}</ul></div>
      <div class="card">
        <h2>Add a person</h2>
        <form class="stack" data-form="create-user">
          <label class="field">Name<input name="display_name" required placeholder="e.g. Maria"></label>
          <label class="field">Language<select name="locale"><option value="it">Italiano</option><option value="en">English</option></select></label>
          <label class="field">Email (optional)<input name="email" type="email" placeholder="not needed"></label>
          <button class="btn">Create account</button>
          <p class="muted small">Only you can create accounts. Next, you get a QR code: they scan it with their phone and are signed in, no email or password to remember.</p>
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
  const tabs = ['overview', 'plan', 'workouts', 'food', 'checkins', 'phone', 'profile', 'import', 'account']
  const labels = { overview: 'Overview', plan: 'Workout plan', workouts: 'Workouts', food: 'Food', checkins: 'Check-ins', phone: 'Sign in a phone', profile: 'Profile', import: 'Import', account: 'Account' }
  const age = p.birth_year ? new Date().getFullYear() - p.birth_year : '—'
  const body = { overview, plan: planView, workouts: workoutsView, food: foodView, checkins: checkinsView, phone: phoneView, profile: profileView, import: importView, account: accountView }[state.tab](d)
  return `<div class="card no-print">
      <div class="row"><h2 style="margin:0">${esc(p.display_name || user?.email)}</h2>
      <span class="muted">${user?.no_email ? 'no email' : esc(user?.email)} · ${esc(p.goal?.replace('_', ' ') ?? 'no goal')} · ${age} y · ${fmtNum(p.height_cm)} cm · ${esc(p.activity_level ?? '')} · ${esc(p.locale ?? '')}</span></div>
      <div class="tabs">${tabs.map((t) => `<button data-action="tab" data-tab="${t}" class="${t === state.tab ? 'active' : ''}">${labels[t]}</button>`).join('')}</div>
    </div>${body}`
}

/** The daily targets as their phone shows them, and how they come about. */
function targetsView(d) {
  const e = d.energy
  if (!e) return ''
  const t = e.targets
  const pr = p(d)
  const today = new Date().toDateString()
  const eaten = d.food.filter((f) => new Date(f.eaten_at).toDateString() === today)
  const sum = (k) => eaten.reduce((s, f) => s + Number(f[k] ?? 0), 0)
  const pct = (g, kcalPerG) => (t.kcal ? Math.round(((g * kcalPerG) / t.kcal) * 100) : 0)
  const span = (r, unit) => (r ? `${fmtNum(r[0])}–${fmtNum(r[1])} ${unit}` : '')
  const r = t.ranges ?? {}
  const satfat = sum('satfat_g')
  const rows = [
    ['Protein', t.protein_g, 'g', span(r.protein_g, 'g'), `${pct(t.protein_g, 4)}% of calories`, sum('protein_g')],
    ['Carbohydrates', t.carbs_g, 'g', span(r.carbs_g, 'g'), `${pct(t.carbs_g, 4)}%`, sum('carbs_g')],
    ['Fat', t.fat_g, 'g', span(r.fat_g, 'g'), `${pct(t.fat_g, 9)}%`, sum('fat_g')],
    ['Saturated fat', t.satfat_g, 'g', 'at most', 'under 10% of calories', satfat, satfat > t.satfat_g],
    ['Fibre', t.fiber_g, 'g', 'at least', '', sum('fiber_g')],
    ...(pr.track_salt ? [['Salt', t.salt_g, 'g', 'at most', `sodium ${fmtNum(t.salt_g * 400)} mg`, sum('salt_g'), sum('salt_g') > t.salt_g]] : []),
  ]
  const source =
    pr.kcal_source === 'manual' && pr.kcal_target
      ? 'Set by hand'
      : pr.kcal_source === 'bws' && pr.bws_targets?.kcal
        ? `Build With Science's ranges`
        : `Forza!: ${fmtNum(e.tdee.tdee)} kcal used a day (${e.tdee.method === 'blended' ? 'formula and food log' : e.tdee.method === 'steps_and_workouts' ? 'from steps and workouts' : 'from the activity level'}), ${pr.goal === 'maintain' ? 'kept' : `${pr.goal_pace ?? 'normal'} pace`}${pr.kcal_adjust ? `, check-ins ${pr.kcal_adjust > 0 ? '+' : ''}${pr.kcal_adjust}` : ''}${pr.kcal_manual ? `, adjustment ${pr.kcal_manual > 0 ? '+' : ''}${pr.kcal_manual}` : ''}`
  return `<div class="card"><h2>Daily targets</h2>
    <p class="muted small">${esc(source)}. Each target is a range; their phone shows the middle. Change them in Profile; they can change them too in Food → Adjust.</p>
    <table><thead><tr><th></th><th class="num">Middle</th><th class="num">Range</th><th></th><th class="num">Eaten today</th></tr></thead><tbody>
      <tr><td><b>Calories</b></td><td class="num"><b>${fmtNum(t.kcal)} kcal</b></td><td class="num">${span(r.kcal, 'kcal')}</td><td class="small muted">${pr.kcal_source === 'manual' ? '' : `body uses about ${fmtNum(e.tdee.tdee)}`}</td><td class="num">${fmtNum(sum('kcal'))}</td></tr>
      ${rows.map(([label, v, unit, range, note, today, over]) => `<tr><td>${label}</td><td class="num">${fmtNum(v)} ${unit}</td><td class="num small">${range}</td><td class="small muted">${note}</td><td class="num">${over ? '<span class="pill warn">' : ''}${fmtNum(today, 1)} ${unit}${over ? '</span>' : ''}</td></tr>`).join('')}
    </tbody></table></div>`
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
      <div class="tile"><div class="label">Weight now</div><div class="value">${fmtKg(last)} kg</div><div class="small muted">${first != null ? `${last - first >= 0 ? '+' : ''}${fmtKg(last - first)} kg in 12 months` : ''}</div></div>
      <div class="tile"><div class="label">Target</div><div class="value">${fmtKg(p(d).target_weight_kg)} kg</div></div>
      <div class="tile"><div class="label">Workouts, last 4 weeks</div><div class="value">${recentSessions.length}</div><div class="small muted">goal ${p(d).workouts_per_week * 4}</div></div>
      <div class="tile"><div class="label">Avg steps (14 d)</div><div class="value">${fmtNum(avgSteps)}</div><div class="small muted">goal ${fmtNum(p(d).steps_goal)}</div></div>
      <div class="tile"><div class="label">Strength change</div><div class="value">${avgPct == null ? '—' : `${avgPct >= 0 ? '+' : ''}${fmtNum(avgPct)}%`}</div></div>
      <div class="tile"><div class="label">Walks & activities (30 d)</div><div class="value">${fmtNum(d.activities.reduce((m, a) => m + (new Date(a.ended_at) - new Date(a.started_at)) / 60000, 0) / 60, 1)} h</div><div class="small muted">${d.activities.length} sessions</div></div>
      <div class="tile"><div class="label">Lessons read</div><div class="value">${d.lessons.length}</div><div class="small muted">${d.lessons.filter((l) => l.quiz_passed_at).length} quizzes passed</div></div>
      <div class="tile"><div class="label">Daily points quiz (30 d)</div><div class="value">${(d.quiz ?? []).filter((a) => a.correct).length} right</div><div class="small muted">of ${(d.quiz ?? []).length} answers, on ${quizDays(d)}</div></div>
      <div class="tile"><div class="label">Calorie check-ins</div><div class="value" style="font-size:18px">${p(d).kcal_adjust ? `${p(d).kcal_adjust > 0 ? '+' : ''}${p(d).kcal_adjust} kcal` : 'no change'}</div><div class="small muted">${p(d).kcal_checkin_at ? 'last ' + fmtDate(p(d).kcal_checkin_at) : ''}</div></div>
      <div class="tile"><div class="label">Health sync</div><div class="value" style="font-size:15px">${d.sync?.last_used_at ? fmtDate(d.sync.last_used_at, { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) : 'not connected'}</div></div>
    </div></div>
    ${targetsView(d)}
    ${syncReportView(d)}
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
        ${t.id && others.length ? `<select id="copy-to-${ti}" title="Copy this workout to">${others.map((u) => `<option value="${esc(u.id)}">${esc(u.profile?.display_name || u.email)}</option>`).join('')}</select><button class="btn secondary" data-action="tpl-copy" data-plan="${ti}">Copy to</button>` : ''}
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

const MEALS = ['breakfast', 'lunch', 'dinner', 'snack']
const NUTRIENTS = ['kcal', 'protein_g', 'carbs_g', 'fat_g', 'fiber_g', 'sugar_g']
// Known for some foods only: blank means not known.
const OPTIONAL_NUTRIENTS = ['satfat_g', 'salt_g']
// Meals logged by another app come back from there at the next sync: they are changed in that app.
const syncedMeal = (f) => f.source === 'health_connect' || (f.source === 'import' && Boolean(f.origin))

function foodView(d) {
  const add = `<div class="row no-print" style="margin-bottom:12px"><button class="btn" data-action="meal-new">Add a meal</button></div>`
  const editor = state.mealEdit ? mealEditor(d) : ''
  if (!d.food.length) return `${editor}${state.mealEdit ? '' : add}<div class="card muted">No meals logged in the last 30 days.</div>`
  return `${editor}${state.mealEdit ? '' : add}<div class="card"><table><thead><tr><th></th><th>When</th><th>Meal</th><th class="num">kcal</th><th class="num">P / C / F</th><th class="num">Score (fat loss · muscle)</th><th></th></tr></thead><tbody>
    ${d.food
      .map(
        (f) => `<tr><td>${f.photo_path ? `<img class="thumb" data-photo="${esc(f.photo_path)}" alt="">` : ''}</td>
        <td>${fmtDate(f.eaten_at, { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}<div class="muted small">${esc(f.meal)}</div></td>
        <td>${esc(f.title)}${f.ai_notes ? `<div class="muted small">${esc(f.ai_notes)}</div>` : ''}</td>
        <td class="num">${fmtNum(f.kcal)}</td><td class="num">${fmtNum(f.protein_g)} / ${fmtNum(f.carbs_g)} / ${fmtNum(f.fat_g)}</td>
        <td class="num">${f.score_fat_loss ?? '—'} · ${f.score_muscle_gain ?? '—'}</td>
        <td class="no-print">${
          syncedMeal(f)
            ? `<span class="muted small">From ${esc(f.origin || 'Health Connect')}: change it there</span>`
            : `<div class="row"><button class="btn small secondary" data-action="meal-edit" data-id="${f.id}">Change</button><button class="btn small danger" data-action="meal-del" data-id="${f.id}">Delete</button></div>`
        }</td></tr>`,
      )
      .join('')}
  </tbody></table></div>`
}

/** yyyy-MM-ddTHH:mm in this computer's time zone, for a datetime-local field. */
function localInput(d) {
  const t = new Date(d)
  return new Date(t.getTime() - t.getTimezoneOffset() * 60000).toISOString().slice(0, 16)
}

/** Nutrients per gram, so a new amount scales the food (none for a food without grams; salt only when known). */
function withPer(item) {
  const grams = Number(item.grams) || 0
  const per = grams > 0 ? Object.fromEntries(NUTRIENTS.map((k) => [k, (Number(item[k]) || 0) / grams])) : null
  if (per) for (const k of OPTIONAL_NUTRIENTS) per[k] = item[k] == null || item[k] === '' ? null : Number(item[k]) / grams
  return { ...item, per }
}

const nutrientValue = (k, v) => (k === 'kcal' ? Math.round(v) : Math.round(v * 10) / 10)

function mealTotalsText() {
  const t = Object.fromEntries(NUTRIENTS.map((k) => [k, state.mealEdit.items.reduce((s, i) => s + (Number(i[k]) || 0), 0)]))
  const salted = state.mealEdit.items.filter((i) => i.salt_g != null && i.salt_g !== '')
  const salt = salted.length ? ` · salt ${fmtNum(salted.reduce((s, i) => s + Number(i.salt_g), 0), 2)} g` : ''
  const sat = state.mealEdit.items.filter((i) => i.satfat_g != null && i.satfat_g !== '')
  const satfat = sat.length ? ` · saturated fat ${fmtNum(sat.reduce((s, i) => s + Number(i.satfat_g), 0), 1)} g` : ''
  return `Total: ${fmtNum(t.kcal)} kcal · protein ${fmtNum(t.protein_g, 1)} g · carbs ${fmtNum(t.carbs_g, 1)} g · fat ${fmtNum(t.fat_g, 1)} g · fibre ${fmtNum(t.fiber_g, 1)} g${satfat}${salt}`
}

function mealEditor(d) {
  const m = state.mealEdit
  const lang = d.profile?.locale === 'it' ? 'it' : 'en'
  const cell = (i, k, step) => `<td class="num"><input class="n" type="number" min="0" step="${step}" data-meal-item="${i}" data-field="${k}" value="${m.items[i][k] ?? (OPTIONAL_NUTRIENTS.includes(k) ? '' : 0)}"${OPTIONAL_NUTRIENTS.includes(k) ? ' placeholder="—"' : ''}></td>`
  return `<div class="card" id="meal-editor"><h2>${m.id ? 'Change the meal' : 'Add a meal'}</h2>
    <div class="grid2">
      <label class="field">Meal <select data-meal-field="meal">${MEALS.map((x) => `<option value="${x}"${m.meal === x ? ' selected' : ''}>${x}</option>`).join('')}</select></label>
      <label class="field">When <input type="datetime-local" data-meal-field="at" value="${esc(m.at)}"></label>
      <label class="field">Name <input data-meal-field="title" value="${esc(m.title)}" placeholder="The foods' names if empty"></label>
    </div>
    <table style="margin-top:10px"><thead><tr><th>Food</th><th class="num">Grams</th><th class="num">kcal</th><th class="num">Protein</th><th class="num">Carbs</th><th class="num">Fat</th><th class="num">Fibre</th><th class="num">Sat. fat</th><th class="num">Salt</th><th></th></tr></thead><tbody>
      ${m.items
        .map(
          (it, i) => `<tr><td><input data-meal-item="${i}" data-field="name" value="${esc(it.name)}" style="width:100%;min-width:180px"></td>
          ${cell(i, 'grams', 1)}${cell(i, 'kcal', 1)}${cell(i, 'protein_g', 0.1)}${cell(i, 'carbs_g', 0.1)}${cell(i, 'fat_g', 0.1)}${cell(i, 'fiber_g', 0.1)}${cell(i, 'satfat_g', 0.1)}${cell(i, 'salt_g', 0.01)}
          <td><button class="btn small danger" data-action="meal-item-del" data-i="${i}" aria-label="Remove">✕</button></td></tr>`,
        )
        .join('')}
    </tbody></table>
    <p class="small" id="meal-totals">${mealTotalsText()}</p>
    <p class="small muted">Changing the grams changes the food's calories and nutrients with them.</p>
    <div class="row small">Whole meal: ${[0.5, 0.75, 1.25, 1.5, 2].map((f) => `<button class="btn small secondary" data-action="meal-scale" data-f="${f}">× ${fmtNum(f, 2)}</button>`).join('')}</div>
    <div class="row" style="margin-top:10px">
      <input list="food-table" id="meal-food" placeholder="Add from the food table (English or Italian)" style="flex:1;min-width:220px">
      <input class="n" type="number" min="1" id="meal-food-g" placeholder="g">
      <button class="btn small" data-action="meal-add-food">Add</button>
      <button class="btn small secondary" data-action="meal-add-other">Add another food</button>
    </div>
    <datalist id="food-table">${(state.foods ?? []).map((f) => `<option value="${esc(f.name[lang])}">${esc(f.name[lang === 'it' ? 'en' : 'it'])} · ${f.kcal} kcal/100 g</option>`).join('')}</datalist>
    <p class="small muted">The app works out the meal's score again, from the new amounts and the person's own calorie target.</p>
    <div class="row"><button class="btn" data-action="meal-save">Save</button><button class="btn secondary" data-action="meal-cancel">Cancel</button></div>
  </div>`
}

async function mealAction(action, btn) {
  const m = state.mealEdit
  if (action === 'meal-new' || action === 'meal-edit') {
    state.foods ??= await api('/api/foods')
    const f = action === 'meal-edit' ? state.data.food.find((x) => x.id === btn.dataset.id) : null
    const items = f?.items?.length ? f.items : f ? [{ name: f.title, grams: 0, ...Object.fromEntries(NUTRIENTS.map((k) => [k, Number(f[k]) || 0])) }] : []
    state.mealEdit = { id: f?.id ?? null, meal: f?.meal ?? 'snack', at: localInput(f?.eaten_at ?? new Date()), title: f?.title ?? '', items: items.map(withPer) }
    render()
    return document.getElementById('meal-editor')?.scrollIntoView({ behavior: 'smooth' })
  }
  if (action === 'meal-cancel') state.mealEdit = null
  if (action === 'meal-item-del') m.items.splice(Number(btn.dataset.i), 1)
  if (action === 'meal-add-other') m.items.push(withPer({ name: '', grams: 100, kcal: 0, protein_g: 0, carbs_g: 0, fat_g: 0, fiber_g: 0, sugar_g: 0 }))
  if (action === 'meal-scale') {
    const k = Number(btn.dataset.f)
    for (const it of m.items) {
      it.grams = Math.round((Number(it.grams) || 0) * k)
      for (const n of NUTRIENTS) it[n] = nutrientValue(n, (Number(it[n]) || 0) * k)
      if (it.salt_g != null && it.salt_g !== '') it.salt_g = Math.round(Number(it.salt_g) * k * 100) / 100
      if (it.satfat_g != null && it.satfat_g !== '') it.satfat_g = nutrientValue('satfat_g', Number(it.satfat_g) * k)
    }
  }
  if (action === 'meal-add-food') {
    const name = document.getElementById('meal-food').value.trim().toLowerCase()
    const food = state.foods.find((f) => f.name.en.toLowerCase() === name || f.name.it.toLowerCase() === name)
    if (!food) return toast('Choose a food from the list')
    const grams = Number(document.getElementById('meal-food-g').value) || food.portion
    const lang = state.data.profile?.locale === 'it' ? 'it' : 'en'
    // The table's values are per 100 g.
    const per100 = { kcal: food.kcal, protein_g: food.protein, carbs_g: food.carbs, fat_g: food.fat, fiber_g: food.fiber, sugar_g: food.sugar }
    m.items.push(withPer({ name: food.name[lang], grams, ...Object.fromEntries(NUTRIENTS.map((n) => [n, nutrientValue(n, (per100[n] * grams) / 100)])), salt_g: Math.round((food.salt ?? 0) * grams) / 100, satfat_g: nutrientValue('satfat_g', ((food.satfat ?? 0) * grams) / 100) }))
  }
  if (action === 'meal-save') {
    if (!m.items.length) return toast('Add at least one food')
    const body = { meal: m.meal, eaten_at: new Date(m.at).toISOString(), title: m.title, items: m.items.map(({ per: _per, ...i }) => i) }
    if (m.id) await api(`/api/food/${m.id}`, { method: 'PUT', body })
    else await api(`/api/users/${state.selected}/food`, { method: 'POST', body })
    state.mealEdit = null
    toast(m.id ? 'Meal changed' : 'Meal added')
    return reloadFood()
  }
  if (action === 'meal-del') {
    const f = state.data.food.find((x) => x.id === btn.dataset.id)
    if (!confirm(`Delete “${f?.title ?? 'this meal'}”? It disappears from their phone too.`)) return
    await api(`/api/food/${btn.dataset.id}`, { method: 'DELETE' })
    toast('Meal deleted')
    return reloadFood()
  }
  render()
}

/** Shows the food log again after a change, keeping any unsaved change to the plan. */
async function reloadFood() {
  const d = await api(`/api/users/${state.selected}`)
  state.data.food = d.food
  render()
  loadPhotos()
}

/** A grams change scales that food; a nutrient typed in becomes its new value per gram. */
function mealItemInput(el) {
  const i = Number(el.dataset.mealItem)
  const it = state.mealEdit.items[i]
  const k = el.dataset.field
  if (k === 'name') {
    it.name = el.value
    return
  }
  const v = Math.max(0, Number(el.value) || 0)
  it[k] = OPTIONAL_NUTRIENTS.includes(k) && el.value === '' ? null : v
  if (k === 'grams' && it.per) {
    for (const n of [...NUTRIENTS, ...OPTIONAL_NUTRIENTS]) {
      if (it.per[n] == null) continue
      it[n] = n === 'salt_g' ? Math.round(it.per[n] * v * 100) / 100 : nutrientValue(n, it.per[n] * v)
      const field = app.querySelector(`[data-meal-item="${i}"][data-field="${n}"]`)
      if (field) field.value = it[n]
    }
  } else it.per = withPer(it).per
  document.getElementById('meal-totals').textContent = mealTotalsText()
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
  return `<div class="card"><h2>Password</h2>
      <p class="muted small">Not needed with the QR code. Set one if they also want to sign in with ${user?.no_email ? 'an email and password (add a real email first)' : `<b>${esc(user?.email)}</b> and a password`}.</p>
      <form class="row" data-form="password"><input name="password" type="text" minlength="8" required placeholder="new password" autocomplete="off"><button class="btn">Set password</button></form>
      <p class="muted small">Last sign-in: ${fmtDate(user?.last_sign_in_at, { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })} · created ${fmtDate(user?.created_at)}</p></div>
    <div class="card"><h2>Delete account</h2>
      <p class="muted">Permanently deletes the account and all of its data (weights, workouts, food, photos). This cannot be undone.</p>
      <form class="row" data-form="delete"><input name="confirm" placeholder="type the email to confirm" style="min-width:260px"><button class="btn danger">Delete forever</button></form></div>`
}

// ---------------------------------------------------------------------------
// Lessons & tips: the knowledge base, as the app shows it to everyone
// ---------------------------------------------------------------------------

/** Built-in lessons with the coach's changes on top, per track, in the order the app shows them. */
function kbLessons() {
  const kb = state.kb
  const rows = new Map(kb.lessons.map((r) => [r.id, r]))
  const all = kb.builtIn.lessons.map((l) => ({ ...l, row: rows.get(l.id) ?? null, builtIn: true }))
  for (const r of kb.lessons) if (!all.some((l) => l.id === r.id)) all.push({ id: r.id, track: r.track, position: null, ...r.content, row: r, builtIn: false })
  const view = (l) => ({ ...l, ...(l.row?.content ?? {}), track: l.row?.track ?? l.track, hidden: l.row?.hidden ?? false, order: l.row?.position ?? l.position ?? 999 })
  const lessons = all.map(view)
  return ['course', 'expert'].map((track) => lessons.filter((l) => l.track === track).sort((a, b) => a.order - b.order))
}

const KB_BLOCK_EXAMPLE = `[
  { "type": "intro", "text": { "en": "One or two sentences.", "it": "Una o due frasi." } },
  { "type": "callout", "emoji": "💡", "text": { "en": "The one thing to remember.", "it": "La cosa da ricordare." } },
  { "type": "steps", "title": { "en": "How to", "it": "Come fare" }, "items": [{ "title": { "en": "First", "it": "Primo" } }] },
  { "type": "dodont", "dos": [{ "en": "Do this", "it": "Fai questo" }], "donts": [{ "en": "Not this", "it": "Non questo" }] }
]`

const KB_QUIZ_EXAMPLE = `[
  {
    "q": { "en": "How much of the plate should be vegetables?", "it": "Quanta parte del piatto dovrebbe essere verdura?" },
    "options": [{ "en": "Half", "it": "Metà" }, { "en": "A quarter", "it": "Un quarto" }],
    "answer": 0,
    "why": { "en": "Half a plate of vegetables: volume and fibre for few calories.", "it": "Metà piatto di verdure: volume e fibre con poche calorie." }
  }
]`

function knowledgeView() {
  const kb = state.kb
  if (!kb) return '<p class="pad muted">Loading…</p>'
  if (state.kbEdit) return `<div class="pad">${lessonEditor(state.kbEdit)}</div>`
  const [course, expert] = kbLessons()
  // A lesson only moved keeps the built-in text (and its later updates): it is not "changed".
  const edited = (l) => l.row && (Object.keys(l.row.content ?? {}).length > 0 || l.row.track !== kb.builtIn.lessons.find((b) => b.id === l.id)?.track)
  const status = (l) => (l.hidden ? '<span class="pill warn">hidden</span>' : !l.builtIn ? '<span class="pill good">new</span>' : edited(l) ? '<span class="pill info">changed</span>' : '')
  const moved = kb.lessons.some((r) => r.position != null && kb.builtIn.lessons.some((b) => b.id === r.id))
  const rows = (list) =>
    list
      .map(
        (l, i) => `<tr${l.hidden ? ' class="muted"' : ''}><td>${esc(l.emoji ?? '')}</td><td><b>${esc(l.title?.en ?? l.id)}</b><div class="small muted">${esc(l.title?.it ?? '')}</div></td><td>${status(l)}</td>
        <td class="row" style="flex-wrap:nowrap"><button class="btn secondary small" data-action="kb-move" data-id="${esc(l.id)}" data-dir="-1" ${i ? '' : 'disabled'}>↑</button><button class="btn secondary small" data-action="kb-move" data-id="${esc(l.id)}" data-dir="1" ${i < list.length - 1 ? '' : 'disabled'}>↓</button>
        <button class="btn secondary small" data-action="kb-edit" data-id="${esc(l.id)}">Edit</button><button class="btn secondary small" data-action="kb-hide" data-id="${esc(l.id)}">${l.hidden ? 'Show' : 'Hide'}</button></td></tr>`,
      )
      .join('')
  const lessonsTable = (title, list) => `<h3>${title}</h3><table><tbody>${rows(list)}</tbody></table>`
  const tipRows = new Map(kb.tips.map((r) => [r.id, r]))
  const tips = [...kb.builtIn.tips.map((t) => ({ id: t.id, text_en: t.text.en, text_it: t.text.it, topic: t.topic, builtIn: true })), ...kb.tips.filter((r) => !kb.builtIn.tips.some((t) => t.id === r.id))]
    .map((t) => ({ ...t, ...(tipRows.get(t.id) ?? {}) }))
  const lessonOptions = (selected) => [...course, ...expert].map((l) => `<option value="${esc(l.id)}" ${l.id === selected ? 'selected' : ''}>${esc(l.title?.en ?? l.id)}</option>`).join('')
  return `<div class="pad">
    <div class="card"><h2>Lessons</h2>
      <p class="muted">Change a lesson, hide it, move it, or write a new one: everyone sees it in Forza! the next time they open Learn. ${state.status?.appUrl ? `Preview: <a href="${esc(state.status.appUrl)}#/learn" target="_blank">open Learn ↗</a>` : ''}</p>
      ${lessonsTable("Beginners' course", course)}
      ${lessonsTable('Expert lessons', expert)}
      <div class="row" style="margin-top:10px"><button class="btn" data-action="kb-new">+ New lesson</button>${moved ? '<button class="btn secondary" data-action="kb-order-reset">Original order</button>' : ''}</div>
    </div>
    <div class="card"><h2>Tips of the day</h2>
      <p class="muted">One a day on everyone's Home page, with a link to the lesson that explains it.</p>
      <table><thead><tr><th>English</th><th>Italiano</th><th>Lesson</th><th></th></tr></thead><tbody>
      ${tips
        .map(
          (t) => `<tr data-tip="${esc(t.id)}"${t.hidden ? ' class="muted"' : ''}><td><textarea name="text_en" rows="2">${esc(t.text_en)}</textarea></td><td><textarea name="text_it" rows="2">${esc(t.text_it)}</textarea></td>
          <td><select name="topic"><option value="">—</option>${lessonOptions(t.topic)}</select></td>
          <td class="row" style="flex-wrap:nowrap"><button class="btn small" data-action="tip-save" data-id="${esc(t.id)}">Save</button><button class="btn secondary small" data-action="tip-hide" data-id="${esc(t.id)}">${t.hidden ? 'Show' : 'Hide'}</button>${tipRows.has(t.id) ? `<button class="btn secondary small" data-action="tip-reset" data-id="${esc(t.id)}" title="${t.builtIn ? 'Back to the original' : 'Delete'}">${t.builtIn ? 'Undo' : '✕'}</button>` : ''}</td></tr>`,
        )
        .join('')}
      </tbody></table>
      <div class="row" style="margin-top:10px"><button class="btn secondary" data-action="tip-new">+ New tip</button></div>
    </div></div>`
}

function quizDays(d) {
  const n = new Set((d.quiz ?? []).map((a) => a.day)).size
  return `${n} day${n === 1 ? '' : 's'}`
}

function lessonEditor(l) {
  const sources = (l.sources ?? []).map((s) => (typeof s === 'string' ? s : [s.authors && `${s.authors}${s.year ? ` (${s.year})` : ''}.`, s.title, s.journal, s.url].filter(Boolean).join(' '))).join('\n')
  const field = (name, label, value, extra = '') => `<label class="field">${label}<input name="${name}" value="${esc(value ?? '')}" ${extra}></label>`
  return `<form class="card stack" data-form="kb-lesson">
    <h2>${l.isNew ? 'New lesson' : `Edit: ${esc(l.title?.en ?? l.id)}`}</h2>
    <div class="grid2">
      ${field('id', 'Id (letters, digits, - and _)', l.id, l.isNew ? 'required pattern="[a-z0-9_-]{2,40}"' : 'readonly')}
      ${field('emoji', 'Emoji', l.emoji)}
      <label class="field">Colour<select name="tone">${['orange', 'green', 'blue', 'yellow', 'pink', 'purple'].map((t) => `<option ${t === l.tone ? 'selected' : ''}>${t}</option>`).join('')}</select></label>
      <label class="field">Track<select name="track"><option value="course" ${l.track === 'expert' ? '' : 'selected'}>Beginners' course</option><option value="expert" ${l.track === 'expert' ? 'selected' : ''}>Expert lessons</option></select></label>
      ${field('title_en', 'Title (English)', l.title?.en, 'required')}
      ${field('title_it', 'Titolo (italiano)', l.title?.it, 'required')}
      ${field('subtitle_en', 'Subtitle (English)', l.subtitle?.en)}
      ${field('subtitle_it', 'Sottotitolo (italiano)', l.subtitle?.it)}
    </div>
    <label class="field">Content: blocks, in JSON (each block is shown as a card in the lesson)<textarea name="blocks" rows="18" style="font-family:ui-monospace,monospace;font-size:12px">${esc(JSON.stringify(l.blocks ?? [], null, 2))}</textarea></label>
    <details><summary class="small">Block types and an example</summary><p class="small muted">Types: intro, callout, steps, dodont, cards, swaps, timeline, bars, foods, meals, plate, hands. Every text has "en" and "it".</p><pre class="small">${esc(KB_BLOCK_EXAMPLE)}</pre></details>
    <label class="field">Quiz: questions in JSON, at the end of the lesson and in the daily "Gain Family Points" quiz ("answer" is 0 for the first option)<textarea name="quiz" rows="8" style="font-family:ui-monospace,monospace;font-size:12px">${esc(JSON.stringify(l.quiz ?? [], null, 2))}</textarea></label>
    <details><summary class="small">A quiz question</summary><pre class="small">${esc(KB_QUIZ_EXAMPLE)}</pre></details>
    <label class="field">Sources, one per line: the id of a known source (${esc(state.kb.builtIn.sources.slice(0, 3).map((s) => s.id).join(', '))}…) or a reference with its link<textarea name="sources" rows="4">${esc(sources)}</textarea></label>
    <details><summary class="small">Known sources</summary><ul class="small">${state.kb.builtIn.sources.map((s) => `<li><code>${esc(s.id)}</code> ${esc(s.authors)} (${s.year}). ${esc(s.title)}</li>`).join('')}</ul></details>
    <div class="row"><button class="btn">Save</button><button type="button" class="btn secondary" data-action="kb-cancel">Cancel</button>
      ${l.row ? `<button type="button" class="btn danger" data-action="kb-reset" data-id="${esc(l.id)}">${l.builtIn ? 'Back to the original' : 'Delete lesson'}</button>` : ''}</div>
  </form>`
}

const isVideo = (u) => /\.(mp4|webm|mov)(\?|#|$)/i.test(u)

/** The exercise as the app shows it: photos in turn like a slow animation, a GIF, or a video playing on its own. */
function mediaPreview(urls, cls = '') {
  if (!urls.length) return `<div class="ex-media empty ${cls}" aria-hidden="true">🏋️</div>`
  const video = urls.find(isVideo)
  if (video) return `<div class="ex-media ${cls}"><video src="${esc(video)}" autoplay muted loop playsinline></video></div>`
  return `<div class="ex-media ${cls}" ${urls.length > 1 ? 'data-frames' : ''}>${urls.map((u, i) => `<img src="${esc(u)}" alt="" loading="lazy" class="${i ? '' : 'on'}">`).join('')}</div>`
}

// Photos shown in turn every 1.1 s, as in the app.
setInterval(() => {
  for (const box of document.querySelectorAll('.ex-media[data-frames]')) {
    const imgs = [...box.querySelectorAll('img')]
    const i = imgs.findIndex((x) => x.classList.contains('on'))
    imgs[i]?.classList.remove('on')
    imgs[(i + 1) % imgs.length]?.classList.add('on')
  }
}, 1100)

/** Every exercise with what the app shows for it. */
function exerciseList() {
  const c = state.catalogue
  const ov = new Map(c.overrides.map((o) => [o.exercise_id, o]))
  const builtIn = c.builtIn.map((e) => {
    const own = e.src ? [`/builtin-exercises/${e.id}/0.jpg`, `/builtin-exercises/${e.id}/1.jpg`] : []
    const o = ov.get(e.id) ?? {}
    return { id: e.id, custom: false, name_en: e.name.en, name_it: e.name.it, kind: e.kind, own, media: o.media_urls?.length ? o.media_urls : own, changed: Boolean(o.media_urls?.length), video_url: o.video_url ?? '', note_en: o.note_en ?? '', note_it: o.note_it ?? '' }
  })
  const custom = c.custom.map((x) => ({ ...x, custom: true, own: [], media: x.image_urls ?? [], shared: !x.owner_id }))
  return [...custom, ...builtIn]
}

function exercisesView() {
  const c = state.catalogue
  if (!c) return '<p class="pad muted">Loading…</p>'
  if (state.exEdit) return `<div class="pad">${exerciseEditor(state.exEdit)}</div>`
  const q = (state.exQuery ?? '').trim().toLowerCase()
  const list = exerciseList().filter((e) => !q || `${e.name_en} ${e.name_it}`.toLowerCase().includes(q))
  const kinds = { reps: 'weight × reps', bodyweight: 'bodyweight', time: 'time', cardio: 'cardio' }
  return `<div class="pad">
    <div class="card"><h2>Exercises, photos and videos</h2>
      <p class="muted">What everyone sees in Forza!: change the photos, add a GIF or a short video, a video link and your own tip. The family's own exercises are at the top.</p>
      <div class="row" style="margin-bottom:10px"><input id="ex-search" placeholder="Search" value="${esc(state.exQuery ?? '')}" style="flex:1;min-width:200px"><button class="btn" data-action="exm-new">+ New exercise</button></div>
      <table><tbody>${list
        .map(
          (e) => `<tr${e.archived ? ' class="muted"' : ''}><td style="width:110px">${mediaPreview(e.media, 'small')}</td>
          <td><b>${esc(e.name_en)}</b><div class="small muted">${esc(e.name_it ?? '')} · ${kinds[e.kind] ?? e.kind}</div></td>
          <td>${e.custom ? `<span class="pill ${e.archived ? 'warn' : 'good'}">${e.archived ? 'retired' : e.shared ? 'family' : 'made by a person'}</span>` : e.changed ? '<span class="pill info">your media</span>' : ''}${e.video_url ? ' <span class="pill info">video link</span>' : ''}</td>
          <td><button class="btn small secondary" data-action="exm-edit" data-id="${esc(e.id)}">Edit</button></td></tr>`,
        )
        .join('')}</tbody></table>
    </div></div>`
}

function exerciseEditor(e) {
  const field = (name, label, value, extra = '') => `<label class="field">${label}<input name="${name}" value="${esc(value ?? '')}" ${extra}></label>`
  const area = (name, label, value) => `<label class="field">${label}<textarea name="${name}" rows="3">${esc(Array.isArray(value) ? value.join('\n') : (value ?? ''))}</textarea></label>`
  return `<form class="card stack" data-form="exercise">
    <h2>${e.isNew ? 'New exercise' : esc(e.name_en)}</h2>
    <div class="ex-edit">
      <div class="stack">
        ${mediaPreview(e.media)}
        <p class="small muted">As the app shows it: photos take turns (start and end of the movement), a GIF moves, a video plays on its own without sound.</p>
      </div>
      <div class="stack">
        <b>Photos, GIFs and videos</b>
        ${e.media.length ? `<ul class="media-list">${e.media
          .map(
            (u, i) => `<li>${isVideo(u) ? '🎬' : '🖼️'} <a href="${esc(u)}" target="_blank" rel="noreferrer" class="small">${esc(decodeURIComponent(u.split('/').pop()).slice(0, 40))}</a>
              <span class="row" style="margin-left:auto;flex-wrap:nowrap"><button type="button" class="btn small secondary" data-action="media-move" data-i="${i}" data-dir="-1" ${i ? '' : 'disabled'}>↑</button><button type="button" class="btn small secondary" data-action="media-move" data-i="${i}" data-dir="1" ${i < e.media.length - 1 ? '' : 'disabled'}>↓</button><button type="button" class="btn small danger" data-action="media-del" data-i="${i}">✕</button></span></li>`,
          )
          .join('')}</ul>`
          : '<p class="muted small">None: the app shows a dumbbell.</p>'}
        <label class="btn secondary" style="text-align:center">Add photos, GIFs or a video<input type="file" id="media-file" accept="image/jpeg,image/png,image/webp,image/gif,video/mp4,video/webm,video/quicktime" multiple hidden></label>
        <div class="row"><input id="media-url" placeholder="…or paste the address of a picture or video" style="flex:1"><button type="button" class="btn small secondary" data-action="media-url">Add</button></div>
        ${!e.custom && JSON.stringify(e.media) !== JSON.stringify(e.own) ? `<button type="button" class="btn small secondary" data-action="media-reset">Back to the built-in photos</button>` : ''}
        <p class="small muted">Photos and GIFs: JPEG, PNG, WebP or GIF. Videos: MP4, WebM or MOV, up to 25 MB; a few seconds on a loop is best.</p>
      </div>
    </div>
    ${
      e.custom
        ? `<div class="grid2">${field('name_en', 'Name (English)', e.name_en, 'required')}${field('name_it', 'Nome (italiano)', e.name_it)}
            <label class="field">How it is measured<select name="kind">${[['reps', 'Weight × reps'], ['bodyweight', 'Bodyweight reps'], ['time', 'Time'], ['cardio', 'Cardio (minutes)']].map(([v, l]) => `<option value="${v}" ${e.kind === v ? 'selected' : ''}>${l}</option>`).join('')}</select></label>
            ${field('muscles', 'Main muscles (comma separated)', Array.isArray(e.muscles) ? e.muscles.join(', ') : e.muscles)}</div>
          ${area('steps_en', 'Steps (one per line, English)', e.steps_en)}${area('steps_it', 'Passaggi (uno per riga, italiano)', e.steps_it)}`
        : `<div class="grid2">${field('note_en', 'Your tip (English), instead of the built-in one', e.note_en)}${field('note_it', 'Il tuo consiglio (italiano)', e.note_it)}</div>`
    }
    ${field('video_url', 'Video link (YouTube or any page), instead of the automatic "Find a video" search', e.video_url, 'placeholder="https://…"')}
    <div class="row"><button class="btn">Save</button><button type="button" class="btn secondary" data-action="exm-cancel">Cancel</button>
      ${e.custom && !e.isNew ? `<button type="button" class="btn danger" data-action="exm-delete">${e.archived ? 'Delete for good' : 'Delete'}</button>${e.archived ? '<button type="button" class="btn secondary" data-action="exm-restore">Bring back</button>' : ''}` : ''}</div>
    ${e.archived ? '<p class="small muted">Retired: it is in a plan or in past workouts, so it stays there, but nobody can pick it any more.</p>' : ''}
  </form>`
}

const readAsBase64 = (file) =>
  new Promise((resolve, reject) => {
    const r = new FileReader()
    r.onload = () => resolve(String(r.result).split(',')[1])
    r.onerror = reject
    r.readAsDataURL(file)
  })

async function exerciseAction(action, btn) {
  const e = state.exEdit
  if (action === 'exm-new') state.exEdit = { isNew: true, custom: true, id: `new-${Date.now()}`, name_en: '', name_it: '', kind: 'reps', muscles: [], steps_en: [], steps_it: [], media: [], own: [], video_url: '' }
  if (action === 'exm-edit') {
    const x = exerciseList().find((y) => y.id === btn.dataset.id)
    state.exEdit = { ...x, media: [...x.media] }
  }
  if (action === 'exm-cancel') state.exEdit = null
  if (action === 'media-move') {
    const i = Number(btn.dataset.i)
    const j = i + Number(btn.dataset.dir)
    ;[e.media[i], e.media[j]] = [e.media[j], e.media[i]]
  }
  if (action === 'media-del') e.media.splice(Number(btn.dataset.i), 1)
  if (action === 'media-reset') e.media = [...e.own]
  if (action === 'media-url') {
    const url = document.getElementById('media-url').value.trim()
    if (!/^https?:\/\/\S+$/.test(url)) return toast('Paste a web address (https://…)')
    e.media.push(url)
  }
  if (action === 'exm-delete') {
    if (!confirm(`Delete “${e.name_en}”? If it is in a plan or in past workouts it is retired instead: nobody can pick it, the history keeps it.`)) return
    const r = await api(`/api/custom-exercises/${e.id}`, { method: 'DELETE' })
    toast(r.archived ? `Retired: it is in ${r.plans} plan(s) and ${r.sets} logged set(s)` : 'Deleted')
    state.exEdit = null
    state.catalogue = await api('/api/catalogue')
  }
  if (action === 'exm-restore') {
    await api(`/api/custom-exercises/${e.id}`, { method: 'PUT', body: { ...e, image_urls: e.media, archived: false } })
    state.exEdit = null
    state.catalogue = await api('/api/catalogue')
    toast('Back in the exercise lists')
  }
  render()
}

/** Files chosen in the editor: uploaded one by one, then shown in the preview. */
async function uploadExerciseFiles(files) {
  const e = state.exEdit
  for (const file of files) {
    if (file.size > 25 * 1024 * 1024) {
      toast(`${file.name} is over 25 MB`)
      continue
    }
    toast(`Uploading ${file.name}…`)
    const { url } = await api('/api/exercise-media', { method: 'POST', body: { exercise_id: e.id, mime: file.type, data: await readAsBase64(file) } })
    e.media.push(url)
    render()
  }
}

// ---------------------------------------------------------------------------
// Setup: Supabase project, food AI, app address
// ---------------------------------------------------------------------------

function jobLog(job) {
  if (!job) return ''
  const head = job.status === 'running' ? '<p class="muted">Working… keep this page open.</p>' : job.status === 'done' ? '<p class="ok">Done.</p>' : `<p class="pill warn">${esc(job.error ?? 'Stopped')}</p>`
  return `${head}<div class="log" id="job-log">${esc(job.log.join('\n'))}</div>${job.status === 'running' ? `<button class="btn secondary small no-print" data-action="job-stop" data-job="${esc(job.id)}" style="margin-top:8px">Stop</button>` : ''}`
}

function setupView() {
  const st = state.status
  const su = state.setup
  if (st.configured && state.view === 'setup') return serverView()
  const step = (n, title, status, body) => `<div class="card step ${status}"><div class="num">${status === 'done' ? '✓' : n}</div><div><h2>${title}</h2>${body}</div></div>`
  const tokenDone = st.accessToken && su.projects
  const projectList = (su.projects ?? [])
    .map((p) => `<label class="row"><input type="radio" name="project" value="${esc(p.ref ?? p.id)}" ${su.choice === (p.ref ?? p.id) ? 'checked' : ''}> <b>${esc(p.name)}</b> <span class="muted small">${esc(p.region)} · ${esc(p.status)}</span></label>`)
    .join('')
  const orgs = su.organizations.map((o) => `<option value="${esc(o.slug ?? o.id)}">${esc(o.name)}</option>`).join('')
  return `<div class="wizard">
    <div class="card"><h2>Welcome to Forza! Coach 👋</h2>
      <p>This sets up Forza! for your family in about 10 minutes. You need a computer (this one), an internet connection and, later, the phone of the person you are helping.</p>
      <p class="muted small">Everything stays in a free database that belongs to you (Supabase). The keys are kept in this computer's password store (${esc({ keychain: 'macOS Keychain', 'credential-manager': 'Windows Credential Manager', 'secret-service': 'the system keyring', file: 'a private file' }[st.store] ?? st.store)}).</p>
      <p class="muted small">Step-by-step guide with pictures: <a href="https://github.com/gabripo/forza/blob/main/docs/coach-guide.md" target="_blank" rel="noreferrer">Coach guide</a>.</p>
    </div>
    ${step(1, 'Create a free Supabase account and an access token', tokenDone ? 'done' : 'current', `
      <ol>
        <li>Open <a href="https://supabase.com/dashboard/sign-up" target="_blank" rel="noreferrer">supabase.com</a> and create a free account (you can use "Continue with GitHub" or your email).</li>
        <li>Open <a href="https://supabase.com/dashboard/account/tokens" target="_blank" rel="noreferrer">Account → Access Tokens</a>, click <b>Generate new token</b>, name it "Forza Coach", and copy it.</li>
        <li>Paste it here. It lets Forza! Coach install Forza! in your database; it is stored only on this computer.</li>
      </ol>
      <form class="row" data-form="setup-token"><input name="token" type="password" placeholder="sbp_…" required autocomplete="off" style="min-width:280px"><button class="btn">${st.accessToken ? 'Replace token' : 'Save token'}</button></form>
      ${st.accessToken && !su.projects ? '<p class="small"><button class="btn secondary small" data-action="setup-projects">Use the saved token</button></p>' : ''}`)}
    ${step(2, 'Choose where Forza! lives', su.choice ? 'done' : tokenDone ? 'current' : '', tokenDone ? `
      ${projectList ? `<p>Your projects:</p><div class="stack">${projectList}</div>` : '<p class="muted">You have no projects yet.</p>'}
      <details ${projectList ? '' : 'open'} style="margin-top:10px"><summary>Create a new free project</summary>
        <form class="row" data-form="setup-create" style="margin-top:8px">
          <input name="name" value="forza" required>
          <select name="organization">${orgs}</select>
          <select name="region"><option value="emea" ${st.region === 'emea' ? 'selected' : ''}>Europe</option><option value="americas" ${st.region === 'americas' ? 'selected' : ''}>Americas</option><option value="apac" ${st.region === 'apac' ? 'selected' : ''}>Asia-Pacific</option></select>
          <button class="btn">Create project</button>
        </form>
        <p class="muted small">The free plan allows 2 projects. A new project takes about 2 minutes to start.</p>
      </details>` : '<p class="muted">After step 1.</p>')}
    ${step(3, 'Food photos (optional, free)', '', `
      <p>To estimate calories from a photo, Forza! uses Google Gemini. Its free tier is enough for a family.</p>
      <ol><li>Open <a href="https://aistudio.google.com/apikey" target="_blank" rel="noreferrer">Google AI Studio → API keys</a> (sign in with a Google account).</li><li>Click <b>Create API key</b>, copy it and paste it here. You can also add it later in Setup.</li></ol>
      <input id="gemini-key" type="password" placeholder="AIza…" autocomplete="off" style="min-width:280px">`)}
    ${step(4, 'Install', state.setup.job?.status === 'done' ? 'done' : su.choice ? 'current' : '', `
      <details><summary class="small">Advanced: the app's address</summary>
        <p class="muted small">Everyone can use the shared app at ${esc(st.appUrl)}: your data still goes only to your own database. If you publish your own copy (see docs/advanced-setup.md), put its address here.</p>
        <input id="app-url" value="${esc(st.appUrl)}" style="min-width:320px">
      </details>
      <p>Forza! Coach prepares the database, the server functions and the sign-in settings. It takes about a minute.</p>
      <button class="btn" data-action="setup-install" ${su.choice ? '' : 'disabled'}>Install Forza!</button>
      ${jobLog(state.setup.job)}`)}
  </div>`
}

function serverView() {
  const st = state.status
  return `<div class="wizard">
    <div class="card"><h2>Your Forza! server</h2>
      <p>Database: <b>${esc(st.url)}</b>${st.local ? ' (local development stack)' : ''}<br>App: <a href="${esc(st.appUrl)}" target="_blank" rel="noreferrer">${esc(st.appUrl)}</a><br>
      <span class="muted small">Keys stored in: ${esc(st.store)}${st.store === 'file' ? ' — no system password store found, so they are in a private file in your user folder' : ''}</span></p>
    </div>
    <div class="card"><h2>Update Forza!</h2>
      <p>After downloading a newer version of Forza!, run this once: it brings the database and the server functions up to date. Nothing is deleted.</p>
      ${st.accessToken
        ? `<button class="btn" data-action="setup-update" ${st.ref ? '' : 'disabled'}>Update the server</button>`
        : `<p class="muted small">Needs a Supabase access token: <a href="https://supabase.com/dashboard/account/tokens" target="_blank" rel="noreferrer">Account → Access Tokens</a> → Generate new token, then paste it here.</p>
          <form class="row" data-form="setup-token"><input name="token" type="password" placeholder="sbp_…" required autocomplete="off" style="min-width:280px"><button class="btn">Save token</button></form>`}
      ${jobLog(state.setup.job)}
    </div>
    ${aiCards(st)}
    <div class="card"><h2>Run in the background</h2>
      <label class="row"><input type="checkbox" data-action="autostart" ${state.autostart ? 'checked' : ''}> Start Forza! Coach when I log in to this computer</label>
      <p class="muted small">Needed for automatic Build With Science syncs. Coach then runs without a window; open it as usual (the start file) to see it.</p>
    </div>
    <div class="card"><h2>App address</h2>
      <form class="row" data-form="app-url"><input name="appUrl" value="${esc(st.appUrl)}" style="min-width:320px"><button class="btn secondary">Save</button></form>
      <p class="muted small">Used in sign-in QR codes. Keep the shared address unless you publish your own copy of the app.</p>
    </div>
  </div>`
}

// ---------------------------------------------------------------------------
// One person: phone sign-in, profile, imports
// ---------------------------------------------------------------------------

function phoneView() {
  const sc = state.signin
  const p = state.data?.profile ?? {}
  const it = (p.locale ?? 'it') === 'it'
  return `<div class="card no-print"><h2>Sign in their phone with a QR code</h2>
      <p>On their phone, open the <b>camera</b> and point it at the code (or, in the Forza! app, tap <b>Scan my code</b>). Forza! opens already signed in; they stay signed in.</p>
      <p class="muted small">Each code works once, for 24 hours. Make a new one any time, e.g. for a new phone.</p>
      <button class="btn" data-action="signin-code">${sc ? 'Make a new code' : 'Make a sign-in code'}</button>
      ${sc ? '<button class="btn secondary" data-action="print">Print a welcome card</button>' : ''}
    </div>
    ${sc ? `<div class="card">
      <div class="row" style="align-items:flex-start;gap:24px">
        <div class="qr">${sc.svg}</div>
        <div style="flex:1;min-width:240px">
          <h2 style="font-size:24px">${it ? `Ciao ${esc(sc.name)}! 💪` : `Hi ${esc(sc.name)}! 💪`}</h2>
          <ol style="font-size:17px;line-height:1.5">
            ${it
              ? `<li>Apri la <b>fotocamera</b> del telefono e inquadra il codice, poi tocca il link: si apre <b>Forza!</b>.</li><li><b>Android</b>: tocca <b>Inizia</b>, poi menu ⋮ → <b>Installa app</b>.</li><li><b>iPhone</b>: prima Condividi → <b>Aggiungi alla schermata Home</b>; apri Forza! dalla nuova icona, tocca <b>Inquadra il mio codice</b>, inquadra di nuovo questo codice e tocca <b>Inizia</b>.</li><li>Rispondi a poche domande: fatto!</li>`
              : `<li>Open your phone's <b>camera</b>, point it at the code and tap the link: <b>Forza!</b> opens.</li><li><b>Android</b>: tap <b>Start</b>, then menu ⋮ → <b>Install app</b>.</li><li><b>iPhone</b>: first Share → <b>Add to Home Screen</b>; open Forza! from the new icon, tap <b>Scan my code</b>, scan this code again and tap <b>Start</b>.</li><li>Answer a few questions: done!</li>`}
          </ol>
          <p class="muted small">${it ? 'Codice valido fino a' : 'Code valid until'} ${fmtDate(sc.expires_at, { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}</p>
        </div>
      </div>
      <details class="no-print"><summary class="small">Link (to send in a private message instead)</summary><p class="small" style="word-break:break-all"><code>${esc(sc.url)}</code></p><button class="btn secondary small" data-action="copy-link">Copy link</button></details>
    </div>` : ''}`
}

/**
 * What their phone sent on its last sync, per kind of data: allowed in Health Connect? How many? From
 * which apps? So "no weight" can be told apart from "weight not allowed" without holding the phone.
 */
function syncReportView(d) {
  const r = d.sync?.last_report
  if (!r) return ''
  const NAMES = { steps: 'Steps', weight: 'Weigh-ins', body_fat: 'Body fat', exercise: 'Walks & workouts', meals: 'Meals' }
  const APPS = { 'com.google.android.apps.fitness': 'Google Fit', 'com.oceanwing.smarthome': 'EufyLife', 'com.sec.android.app.shealth': 'Samsung Health', 'com.mi.health': 'Mi Fitness', 'com.xiaomi.wearable': 'Mi Fitness', 'com.bws.appv2': 'Build With Science' }
  const HINTS = {
    steps: 'No app writes steps into Health Connect on this phone: in Health Connect → Data and access → Steps, a fitness app (Google Fit, the phone maker\'s app) must be a source.',
    weight: 'Nothing from the scale yet. EufyLife (Android): Me → Health Connect → turn on Weight, on their own EufyLife account (only its main user is synced); then a new weigh-in. Older weigh-ins are not sent.',
  }
  const rows = r.types
    ? Object.entries(r.types)
        .map(([k, t]) => {
          const state = !t.allowed ? '<span class="warn">not allowed in the helper</span>' : t.found ? `<span class="ok">${t.found}</span>` : '<span class="warn">none in Health Connect</span>'
          const apps = [...new Set((t.sources ?? []).map((s) => (s.startsWith('com.android.healthconnect.phone') ? 'the phone itself' : APPS[s] ?? s)))].join(', ')
          const hint = t.allowed && !t.found && HINTS[k] ? `<div class="small muted">${esc(HINTS[k])}</div>` : !t.allowed && (k === 'steps' || k === 'weight') ? '<div class="small muted">On their phone: Forza! Health → Allow access → turn it on.</div>' : ''
          return `<tr><td>${esc(NAMES[k] ?? k)}</td><td>${state}${hint}</td><td class="small">${esc(apps)}</td></tr>`
        })
        .join('')
    : Object.entries(r.received ?? {}).map(([k, n]) => `<tr><td>${esc(k)}</td><td>${n ? `<span class="ok">${n}</span>` : '<span class="warn">0</span>'}</td><td></td></tr>`).join('')
  const device = r.app === 'android' ? `Android ${esc(r.android ?? '')} · ${esc(r.device ?? '')} · helper ${esc(r.helper ?? '?')}` : r.source === 'apple_health' ? 'iPhone (Shortcut)' : esc(r.source ?? '')
  return `<div class="card"><h2>Last health sync</h2>
    <p class="small muted">${device} · ${fmtDate(d.sync.last_used_at, { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}${r.app === 'android' && r.history === false ? ' · history permission not given (only the last 30 days are readable)' : ''}</p>
    <table><thead><tr><th>Data</th><th>Found</th><th>From</th></tr></thead><tbody>${rows}</tbody></table></div>`
}

function profileView(d) {
  const p = d.profile ?? {}
  const opt = (name, values, labels) => `<select name="${name}">${['', ...values].map((v, i) => `<option value="${esc(v)}" ${String(p[name] ?? '') === String(v) ? 'selected' : ''}>${i ? labels[i - 1] : '—'}</option>`).join('')}</select>`
  return `<div class="card"><h2>Profile</h2>
    <p class="muted">Fill this in for them if you like: the app then skips the first questions${p.onboarded_at ? '' : ' (tick "set-up done" below)'}. They can change everything later in the app's Settings.</p>
    <form class="stack" data-form="profile">
      <div class="grid2">
        <label class="field">Name<input name="display_name" value="${esc(p.display_name ?? '')}"></label>
        <label class="field">Language${opt('locale', ['it', 'en'], ['Italiano', 'English'])}</label>
        <label class="field">Sex (for the energy formula)${opt('sex', ['female', 'male'], ['Female', 'Male'])}</label>
        <label class="field">Year of birth<input name="birth_year" inputmode="numeric" value="${esc(p.birth_year ?? '')}"></label>
        <label class="field">Height (cm)<input name="height_cm" inputmode="decimal" value="${esc(p.height_cm ?? '')}"></label>
        <label class="field">Weight at start (kg)<input name="start_weight_kg" inputmode="decimal" value="${esc(p.start_weight_kg ?? '')}"></label>
        <label class="field">Target weight (kg)<input name="target_weight_kg" inputmode="decimal" value="${esc(p.target_weight_kg ?? '')}"></label>
        <label class="field">Goal${opt('goal', ['fat_loss', 'muscle_gain', 'maintain'], ['Lose fat', 'Build muscle', 'Stay healthy'])}</label>
        <label class="field">Activity${opt('activity_level', ['sedentary', 'light', 'moderate', 'active', 'very_active'], ['Sedentary', 'Light', 'Moderate', 'Active', 'Very active'])}</label>
        <label class="field">Experience${opt('experience', ['beginner', 'intermediate'], ['Beginner', 'Some experience'])}</label>
        <label class="field">Workouts a week<input name="workouts_per_week" inputmode="numeric" value="${esc(p.workouts_per_week ?? 3)}"></label>
        <label class="field">Daily steps goal<input name="steps_goal" inputmode="numeric" value="${esc(p.steps_goal ?? 7000)}"></label>
        <label class="field">Pace towards the goal${opt('goal_pace', ['slow', 'normal', 'fast'], ['Slow (fat loss −250 · muscle +150 kcal/day)', 'Normal (−500 · +250 kcal/day)', 'Fast (−750 · +400 kcal/day)'])}</label>
        <label class="field">Calorie adjustment (kcal/day)<input name="kcal_manual" inputmode="numeric" value="${esc(p.kcal_manual ?? 0)}" title="Added every day to what Forza! works out; negative to lower it"></label>
        <label class="field">Calorie target from<select name="kcal_source"><option value="forza" ${p.kcal_source === 'bws' || p.kcal_source === 'manual' ? '' : 'selected'}>Forza! (worked out from their data)</option><option value="manual" ${p.kcal_source === 'manual' ? 'selected' : ''}>A number set by hand (below)</option><option value="bws" ${p.kcal_source === 'bws' ? 'selected' : ''} ${p.bws_targets ? '' : 'disabled'}>Build With Science${p.bws_targets?.kcal ? ` (${p.bws_targets.kcal[0]}–${p.bws_targets.kcal[1]} kcal, read ${fmtDate(p.bws_targets_at)})` : ' (not read yet: needs a workout sync on their phone)'}</option></select></label>
        <label class="field">Daily calories, set by hand<input name="kcal_target" inputmode="numeric" value="${esc(p.kcal_target ?? '')}" placeholder="e.g. 1800" title="Used with “A number set by hand”: protein, carbs and fat follow it"></label>
        <label class="field">Salt and sodium<select name="track_salt"><option value="false" ${p.track_salt ? '' : 'selected'}>Not shown</option><option value="true" ${p.track_salt ? 'selected' : ''}>Shown in the food log (limit 5 g of salt a day)</option></select></label>
        <label class="field">Training section<select name="hide_training"><option value="false" ${p.hide_training ? '' : 'selected'}>Shown</option><option value="true" ${p.hide_training ? 'selected' : ''}>Hidden (never logs workouts in the app)</option></select></label>
      </div>
      ${p.onboarded_at ? `<p class="muted small">Set-up done on ${fmtDate(p.onboarded_at)}.</p>` : '<label class="row small"><input type="checkbox" name="finish_setup" value="1"> Set-up done: they go straight to the home screen</label>'}
      <div><button class="btn">Save profile</button></div>
    </form></div>
    ${homeOrderView(d)}`
}

/** The order of the sections on their Home page: what they see first when they open Forza!. */
function homeOrderView(d) {
  const p = d.profile ?? {}
  const rows = d.homeOrder
    .map((id, i) => {
      const s = d.homeSections.find((x) => x.id === id)
      const hidden = s.training && p.hide_training
      return `<tr><td>${i + 1}</td><td>${esc(s.en)}${hidden ? ' <span class="muted small">(hidden: training section is off)</span>' : ''}</td>
        <td class="row" style="flex-wrap:nowrap"><button class="btn secondary small" data-action="home-up" data-i="${i}" ${i ? '' : 'disabled'}>↑</button><button class="btn secondary small" data-action="home-down" data-i="${i}" ${i < d.homeOrder.length - 1 ? '' : 'disabled'}>↓</button></td></tr>`
    })
    .join('')
  return `<div class="card"><h2>Home page order</h2>
    <p class="muted">What they see first when they open Forza!. Move a part up or down, then save: their phone shows the new order the next time the app opens. They can also change it in the app (Settings → Arrange the Home page).</p>
    <table><tbody>${rows}</tbody></table>
    <div class="row" style="margin-top:8px"><button class="btn" data-action="home-save">Save order</button>${p.home_order ? '<button class="btn secondary" data-action="home-reset">Back to the usual order</button>' : ''}</div>
  </div>`
}

function importView() {
  const b = state.bws
  const dev = b.devices
  const devices = dev?.devices ?? []
  const ready = devices.filter((x) => x.state === 'device')
  return `<div class="card"><h2>Import from Build With Science</h2>
      <p>Brings over their past workouts (every set, with effort), the weekly plan (days, supersets) and their goal. Weigh-ins come by themselves through Health Connect once the Forza! helper app is set up.</p>
      <ol>
        <li>On their Android phone: Settings → About phone → tap <b>Build number</b> 7 times; then Settings → System → Developer options → turn on <b>USB debugging</b>.</li>
        <li>Connect the phone to this computer with a USB cable and tap <b>Allow</b> on the phone.</li>
        <li>Unlock the phone, keep it unlocked (set the screen timeout to 30 minutes) and don't touch it while it works: Forza! Coach opens Build With Science and reads the screens. About 30 seconds per workout.</li>
      </ol>
      <div class="row">
        <button class="btn secondary" data-action="bws-devices">Check the phone</button>
        ${dev && !dev.adb ? '<button class="btn secondary" data-action="bws-adb">Download Android tools (15 MB, from Google)</button>' : ''}
      </div>
      ${dev ? `<p class="small">${!dev.adb ? 'Android tools (adb) are not installed yet.' : !devices.length ? 'No phone found: check the cable and USB debugging.' : devices.map((x) => `${esc(x.model || x.serial)}: ${x.state === 'device' ? '<span class="ok">ready</span>' : x.state === 'unauthorized' ? 'tap Allow on the phone' : esc(x.state)}`).join('<br>')}</p>` : ''}
      ${ready.length ? `<form class="stack" data-form="bws" style="margin-top:8px">
        ${ready.length > 1 ? `<label class="field">Phone<select name="serial">${ready.map((x) => `<option value="${esc(x.serial)}">${esc(x.model || x.serial)}</option>`).join('')}</select></label>` : `<input type="hidden" name="serial" value="${esc(ready[0].serial)}">`}
        <label class="row small"><input type="radio" name="since" value="new" checked> Only workouts not imported yet</label>
        <label class="row small"><input type="radio" name="since" value="all"> Everything from the last 12 months</label>
        <label class="row small"><input type="checkbox" name="plan" value="1" checked> Plan and weekly schedule</label>
        <label class="row small"><input type="checkbox" name="profile" value="1" checked> Goal and settings</label>
        <div><button class="btn">Start the import</button></div>
      </form>` : ''}
      ${b.job ? jobLog(b.job) : ''}
      ${b.job?.status === 'done' ? '<p class="small"><button class="btn secondary small" data-action="bws-file">Download the file</button> <span class="muted">(to keep, or to import in the app: Settings → Connect Health & scale)</span></p>' : ''}
    </div>
    ${autoSyncCard(ready)}
    <div class="card"><h2>Import a history file</h2>
      <p class="muted">A <code>forza-history-v1</code> JSON file (workouts with every set, a plan, weigh-ins, meals), for example converted from another app. Importing the same file again does not create duplicates.</p>
      <form class="row" data-form="import"><input name="file" type="file" accept="application/json,.json" required><button class="btn">Import</button></form></div>`
}

function autoSyncCard(ready) {
  const a = state.auto?.settings
  const on = Boolean(a?.enabled)
  const when = (t) => fmtDate(t, { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })
  return `<div class="card"><h2>Automatic sync</h2>
    <p>Forza! Coach can import new workouts by itself whenever ${on ? `<b>${esc(a.model || 'this phone')}</b>` : 'this phone'} is connected to this computer, with a cable or with <b>Wi-Fi debugging</b> (Developer options → Wireless debugging; then <code>adb pair</code> once). It waits until the phone has been unlocked and untouched for 3 minutes, shows a notice on it, imports, then goes back to the home screen. Touching the phone stops it; it tries again later.</p>
    <p class="muted small">Meals and weigh-ins need no computer: the Forza! Health app on the phone sends them every hour through Health Connect.</p>
    ${on
      ? `<p><span class="pill good">On</span> every ${esc(a.everyHours)} h · plan ${a.plan === false ? 'not synced' : 'kept in sync'}<br>
         <span class="small muted">Last import: ${a.lastRun ? `${when(a.lastRun)} (${esc(a.lastResult ?? '')})` : 'not yet'}${a.lastError ? ` · last problem: ${esc(a.lastError)}` : ''}</span></p>
         ${state.auto?.background ? '' : '<p class="note small">Forza! Coach must be running for this. To keep it running without opening it, turn on <b>Setup → Run in the background</b>.</p>'}
         <div class="row"><button class="btn" data-action="sync-now">Sync now</button><button class="btn secondary" data-action="auto-off">Turn off</button></div>
         <p class="muted small">Sync now runs within a minute if the phone is connected and unlocked (no need to wait for it to be idle). The person can also press "Sync now" in the app.</p>`
      : ready.length
        ? `<form class="row" data-form="auto-on">
            ${ready.length > 1 ? `<select name="serial">${ready.map((x) => `<option value="${esc(x.serial)}">${esc(x.model || x.serial)}</option>`).join('')}</select>` : `<input type="hidden" name="serial" value="${esc(ready[0].serial)}">`}
            <label class="small">every <select name="everyHours">${[1, 3, 6, 12, 24].map((h) => `<option value="${h}" ${h === 3 ? 'selected' : ''}>${h} h</option>`).join('')}</select></label>
            <label class="row small"><input type="checkbox" name="plan" value="1" checked> keep the plan in sync (Build With Science is the source of the plan)</label>
            <button class="btn">Turn on</button></form>`
        : '<p class="muted small">Check the phone above first.</p>'}
    ${state.auto?.job ? `<details style="margin-top:8px"><summary class="small">Last automatic run</summary>${jobLog(state.auto.job)}</details>` : ''}
  </div>`
}

// ---------------------------------------------------------------------------
// Food photo AI: keys overview and model use order
// ---------------------------------------------------------------------------

function aiCards(st) {
  if (!st.accessToken) return '<div class="card"><h2>Food photo AI</h2><p class="muted">Add your Supabase access token above to manage the AI keys.</p></div>'
  const ai = state.ai
  if (!ai) return '<div class="card"><h2>Food photo AI</h2><p class="muted">Loading…</p></div>'
  const provider = (id) => ai.providers.find((p) => p.id === id)
  const keyRows = ai.providers
    .map(
      (p) => `<tr>
        <td><b>${esc(p.name)}</b><div class="muted small">${esc(p.note)}</div></td>
        <td>${p.set ? '<span class="pill good">key saved</span>' : '<span class="pill info">no key</span>'}</td>
        <td><form class="row" data-form="ai-key" data-provider="${esc(p.id)}" style="flex-wrap:nowrap">
          ${p.base ? '<input name="base" placeholder="https://…/v1" style="width:150px" autocomplete="off">' : ''}
          <input name="key" type="password" placeholder="${p.set ? 'replace key' : 'paste key'}" autocomplete="off" style="width:170px" required>
          <button class="btn secondary small">Save</button></form></td>
        <td class="row" style="flex-wrap:nowrap">${p.keyUrl ? `<a class="small" href="${esc(p.keyUrl)}" target="_blank" rel="noreferrer">Get a key ↗</a>` : ''}
          ${p.set ? `<button class="btn danger small" data-action="ai-key-del" data-provider="${esc(p.id)}">Remove</button>` : ''}</td>
      </tr>`,
    )
    .join('')
  let usable = 0
  const orderRows = ai.order
    .map((step, i) => {
      const has = provider(step.provider)?.set
      const testIndex = has ? usable++ : null
      const models = state.aiModels[step.provider] ?? []
      return `<tr>
        <td class="num"><b>${i + 1}</b></td>
        <td><select data-ai="${i}" data-field="provider">${ai.providers.map((p) => `<option value="${esc(p.id)}" ${p.id === step.provider ? 'selected' : ''}>${esc(p.name)}</option>`).join('')}</select></td>
        <td><input data-ai="${i}" data-field="model" value="${esc(step.model)}" list="models-${esc(step.provider)}" style="width:100%;min-width:220px" placeholder="model name">
          <datalist id="models-${esc(step.provider)}">${models.map((m) => `<option value="${esc(m.id)}">${m.free ? 'free' : ''}</option>`).join('')}</datalist></td>
        <td>${has ? '' : '<span class="pill warn" title="Add this provider\'s key above">no key: skipped</span>'}</td>
        <td class="row" style="flex-wrap:nowrap">
          <button class="btn secondary small" data-action="ai-up" data-i="${i}" ${i ? '' : 'disabled'}>↑</button>
          <button class="btn secondary small" data-action="ai-down" data-i="${i}" ${i < ai.order.length - 1 ? '' : 'disabled'}>↓</button>
          <button class="btn danger small" data-action="ai-del" data-i="${i}" ${ai.order.length > 1 ? '' : 'disabled'}>✕</button>
          ${testIndex !== null ? `<button class="btn secondary small" data-action="ai-test-one" data-only="${testIndex}" title="Test only this model (save the order first)">Test</button>` : ''}
        </td></tr>`
    })
    .join('')
  return `<div class="card"><h2>Food photo AI: keys</h2>
      <p class="muted small">Keys are stored as secrets of your Supabase project, never on this computer, and are never shown again. Add as many as you like: the order below decides which one is used.</p>
      <table><tbody>${keyRows}</tbody></table>
    </div>
    <div class="card"><h2>Food photo AI: model use order</h2>
      <p>Tried from the top. When a model is busy, hits its free limit or fails, the next one answers the photo. Models whose provider has no key are skipped.</p>
      <table><thead><tr><th>#</th><th>Provider</th><th>Model</th><th></th><th></th></tr></thead><tbody>${orderRows}</tbody></table>
      <div class="row" style="margin-top:10px">
        <button class="btn secondary" data-action="ai-add">+ Model</button>
        <span style="flex:1"></span>
        <button class="btn" data-action="ai-order-save">Save order</button>
      </div>
      <p class="muted small" style="margin-top:12px">Test with a photo of a meal or of a nutrition label: the whole order, or one row (its Test button).</p>
      <form class="row" data-form="ai-test"><input name="photo" type="file" accept="image/*" required><select name="mode"><option value="plate">Plate</option><option value="label">Nutrition label</option></select><button class="btn">Test the whole order</button></form>
      <div id="ai-result"></div>
    </div>`
}

async function loadAi() {
  if (!state.status?.accessToken) return
  state.ai = await api('/api/setup/ai').catch((e) => {
    toast(`AI settings: ${e.message}`)
    return null
  })
  for (const p of new Set((state.ai?.order ?? []).map((s) => s.provider))) await loadModels(p)
}

async function loadModels(provider) {
  if (!state.aiModels[provider]) state.aiModels[provider] = await api(`/api/setup/ai-models?provider=${encodeURIComponent(provider)}`).catch(() => [])
}

function showAiResult(r) {
  const out = document.getElementById('ai-result')
  const rows = r.items ?? [{ name: `${r.name} (per 100 g)`, grams: 100, kcal: r.kcal, protein_g: r.protein_g, carbs_g: r.carbs_g, fat_g: r.fat_g }]
  out.innerHTML = `<p class="ok">It works: ${esc(r.model)}, ${fmtNum(r.ms / 1000, 1)} s</p>
    ${r.tried?.length ? `<details><summary class="small">Skipped before it (${r.tried.length})</summary><pre class="log">${esc(r.tried.join('\n'))}</pre></details>` : ''}
    <table><thead><tr><th>Food</th><th class="num">g</th><th class="num">kcal</th><th class="num">P / C / F</th></tr></thead><tbody>${rows.map((i) => `<tr><td>${esc(i.name)}</td><td class="num">${fmtNum(i.grams)}</td><td class="num">${fmtNum(i.kcal)}</td><td class="num">${fmtNum(i.protein_g, 1)} / ${fmtNum(i.carbs_g, 1)} / ${fmtNum(i.fat_g, 1)}</td></tr>`).join('')}</tbody></table>${r.tip ? `<p class="muted small">${esc(r.tip)}</p>` : ''}`
}

async function testAi(only) {
  const out = document.getElementById('ai-result')
  if (!state.aiPhoto) {
    out.innerHTML = '<p class="pill warn">Choose a test photo first (below).</p>'
    return
  }
  out.innerHTML = '<p class="muted">Asking the AI…</p>'
  try {
    showAiResult(await api('/api/setup/test-ai', { method: 'POST', body: { image: state.aiPhoto.image, mode: state.aiPhoto.mode, ...(only !== undefined ? { only } : {}) } }))
  } catch (e) {
    out.innerHTML = `<p class="pill warn">Did not work</p><pre class="log">${esc(e.message)}</pre>`
  }
}

async function loadAuto() {
  if (state.selected) state.auto = await api(`/api/users/${state.selected}/auto-sync`)
}

async function pollJob(id, holder) {
  for (;;) {
    const job = await api(`/api/jobs/${id}`)
    holder.job = job
    render()
    const log = document.getElementById('job-log')
    if (log) log.scrollTop = log.scrollHeight
    if (job.status !== 'running') return job
    await new Promise((r) => setTimeout(r, 1500))
  }
}

async function loadStatus() {
  state.status = await api('/api/status')
}

const fileToBase64 = (file) =>
  new Promise((resolve, reject) => {
    const img = new Image()
    img.onload = () => {
      const scale = Math.min(1, 1600 / Math.max(img.width, img.height))
      const c = document.createElement('canvas')
      c.width = Math.round(img.width * scale)
      c.height = Math.round(img.height * scale)
      c.getContext('2d').drawImage(img, 0, 0, c.width, c.height)
      resolve(c.toDataURL('image/jpeg', 0.85).split(',')[1])
    }
    img.onerror = reject
    img.src = URL.createObjectURL(file)
  })

/** Buttons of the Lessons & tips page. */
async function knowledgeAction(action, btn) {
  const kb = state.kb
  const [course, expert] = kbLessons()
  const lesson = [...course, ...expert].find((l) => l.id === btn.dataset.id)
  const save = (l, patch) => api(`/api/kb/lessons/${encodeURIComponent(l.id)}`, { method: 'PUT', body: { track: l.track, position: l.row?.position ?? null, hidden: l.hidden, content: l.row?.content ?? {}, ...patch } })
  if (action === 'kb-edit') state.kbEdit = { ...lesson, isNew: false }
  if (action === 'kb-new') state.kbEdit = { id: '', isNew: true, track: 'course', emoji: '📘', tone: 'blue', title: { en: '', it: '' }, subtitle: { en: '', it: '' }, blocks: JSON.parse(KB_BLOCK_EXAMPLE).slice(0, 2), sources: [] }
  if (action === 'kb-cancel') state.kbEdit = null
  if (action === 'kb-hide') await save(lesson, { hidden: !lesson.hidden })
  if (action === 'kb-move') {
    // Every lesson of the track gets its place, so the order is the same everywhere.
    const list = lesson.track === 'expert' ? expert : course
    const i = list.indexOf(lesson)
    const j = i + Number(btn.dataset.dir)
    ;[list[i], list[j]] = [list[j], list[i]]
    await Promise.all(list.map((l, k) => save(l, { position: k })))
  }
  if (action === 'kb-order-reset') {
    // Built-in lessons go back to their places; new lessons stay where they are, after them.
    const builtIn = (r) => kb.builtIn.lessons.find((b) => b.id === r.id)
    await Promise.all(
      kb.lessons
        .filter((r) => r.position != null && builtIn(r))
        .map((r) =>
          !r.hidden && !Object.keys(r.content ?? {}).length && r.track === builtIn(r).track
            ? api(`/api/kb/lessons/${encodeURIComponent(r.id)}`, { method: 'DELETE' })
            : api(`/api/kb/lessons/${encodeURIComponent(r.id)}`, { method: 'PUT', body: { ...r, position: null } }),
        ),
    )
  }
  if (action === 'kb-reset') {
    if (!confirm(lesson.builtIn ? 'Go back to the original lesson? Your changes to it are lost.' : 'Delete this lesson for everyone?')) return
    await api(`/api/kb/lessons/${encodeURIComponent(lesson.id)}`, { method: 'DELETE' })
    state.kbEdit = null
  }
  const tipRow = (id) => app.querySelector(`[data-tip="${CSS.escape(id)}"]`)
  const tipBody = (id) => Object.fromEntries([...tipRow(id).querySelectorAll('textarea, select')].map((x) => [x.name, x.value.trim()]))
  if (action === 'tip-save') await api(`/api/kb/tips/${btn.dataset.id}`, { method: 'PUT', body: { ...tipBody(btn.dataset.id), hidden: kb.tips.find((t) => t.id === btn.dataset.id)?.hidden ?? false } })
  if (action === 'tip-hide') {
    const current = kb.tips.find((t) => t.id === btn.dataset.id)
    await api(`/api/kb/tips/${btn.dataset.id}`, { method: 'PUT', body: { ...tipBody(btn.dataset.id), hidden: !current?.hidden } })
  }
  if (action === 'tip-reset') await api(`/api/kb/tips/${btn.dataset.id}`, { method: 'DELETE' })
  if (action === 'tip-new') {
    const n = Math.max(0, ...[...kb.builtIn.tips, ...kb.tips].map((t) => Number(/^tip(\d+)$/.exec(t.id)?.[1] ?? 0))) + 1
    await api(`/api/kb/tips/tip${n}`, { method: 'PUT', body: { text_en: 'New tip', text_it: 'Nuovo consiglio', topic: '', hidden: false } })
  }
  if (!['kb-edit', 'kb-new', 'kb-cancel'].includes(action)) {
    state.kb = await api('/api/kb')
    toast('Saved')
  }
  render()
}

// ---------------------------------------------------------------------------
// Events
// ---------------------------------------------------------------------------

document.querySelector('.top nav').addEventListener('click', async (e) => {
  const view = e.target.closest('button')?.dataset.view
  if (!view) return
  state.view = view
  if (view === 'knowledge') {
    render()
    state.kb = await api('/api/kb')
  }
  if (view === 'setup') {
    state.autostart = (await api('/api/setup/autostart').catch(() => ({ enabled: false }))).enabled
    render()
    await loadAi()
  }
  render()
})

app.addEventListener('change', async (e) => {
  if (e.target.id === 'media-file') {
    await uploadExerciseFiles([...e.target.files]).catch((err) => toast(`Error: ${err.message}`))
    return
  }
  if (e.target.dataset?.ai !== undefined && e.target.dataset.field === 'provider') {
    await loadModels(e.target.value)
    return render()
  }
  if (e.target.name === 'project') {
    state.setup.choice = e.target.value
    render()
  }
})

app.addEventListener('input', (e) => {
  const el = e.target
  if (el.id === 'ex-search') {
    state.exQuery = el.value
    render()
    const box = document.getElementById('ex-search')
    box.focus()
    box.setSelectionRange(box.value.length, box.value.length)
    return
  }
  // What is typed in the exercise editor survives the redraw after an upload.
  if (el.name && el.closest('form[data-form="exercise"]')) {
    state.exEdit[el.name] = el.value
    return
  }
  if (el.dataset.mealField) {
    state.mealEdit[el.dataset.mealField] = el.value
    return
  }
  if (el.dataset.mealItem !== undefined) return mealItemInput(el)
  if (el.dataset.ai !== undefined) {
    state.ai.order[Number(el.dataset.ai)][el.dataset.field] = el.value
    return
  }
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
    if (action === 'select') {
      state.signin = null
      state.mealEdit = null
      return selectUser(btn.dataset.id)
    }
    if (action === 'setup-projects') {
      Object.assign(state.setup, await api('/api/setup/projects'))
      return render()
    }
    if (action === 'setup-install' || action === 'setup-update') {
      const ref = action === 'setup-update' ? state.status.ref : state.setup.choice
      const body = { ref, geminiKey: document.getElementById('gemini-key')?.value.trim() || null, appUrl: document.getElementById('app-url')?.value.trim() || state.status.appUrl }
      const { id } = await api('/api/setup/install', { method: 'POST', body })
      const job = await pollJob(id, state.setup)
      await loadStatus()
      if (job.status === 'done' && action === 'setup-install') {
        toast('Forza! is installed')
        state.view = 'people'
        ;[state.catalogue] = await Promise.all([api('/api/catalogue'), loadUsers()])
      }
      return render()
    }
    if (action === 'setup-wizard') {
      state.status = { ...state.status, configured: false }
      return render()
    }
    if (action === 'job-stop') {
      await api(`/api/jobs/${btn.dataset.job}/stop`, { method: 'POST' })
      return toast('Stopping after the current step…')
    }
    if (action === 'signin-code') {
      state.signin = await api(`/api/users/${state.selected}/signin-code`, { method: 'POST' })
      return render()
    }
    if (action === 'print') return window.print()
    if (action === 'copy-link') {
      await navigator.clipboard.writeText(state.signin.url)
      return toast('Link copied: send it only to them')
    }
    if (action === 'bws-devices') {
      state.bws.devices = await api('/api/bws/devices')
      await loadAuto()
      return render()
    }
    if (action === 'ai-up' || action === 'ai-down' || action === 'ai-del' || action === 'ai-add') {
      const order = state.ai.order
      const i = Number(btn.dataset.i)
      if (action === 'ai-up') [order[i - 1], order[i]] = [order[i], order[i - 1]]
      if (action === 'ai-down') [order[i + 1], order[i]] = [order[i], order[i + 1]]
      if (action === 'ai-del') order.splice(i, 1)
      if (action === 'ai-add') order.push({ provider: 'openrouter', model: '' })
      await loadModels(order.at(-1).provider)
      return render()
    }
    if (action === 'home-up' || action === 'home-down') {
      const order = state.data.homeOrder
      const i = Number(btn.dataset.i)
      const j = action === 'home-up' ? i - 1 : i + 1
      ;[order[i], order[j]] = [order[j], order[i]]
      return render()
    }
    if (action === 'home-save' || action === 'home-reset') {
      const home_order = action === 'home-save' ? state.data.homeOrder : null
      state.data.profile = await api(`/api/users/${state.selected}/profile`, { method: 'PUT', body: { home_order } })
      if (!home_order) state.data.homeOrder = state.data.homeSections.map((s) => s.id)
      toast('Home page order saved')
      return render()
    }
    if (action === 'ai-order-save') {
      state.ai = await api('/api/setup/ai-order', { method: 'POST', body: { order: state.ai.order } })
      toast('Order saved: the next food photo uses it')
      return render()
    }
    if (action === 'ai-key-del') {
      if (!confirm('Remove this key from your Supabase project?')) return
      state.ai = await api(`/api/setup/ai-key/${btn.dataset.provider}`, { method: 'DELETE' })
      return render()
    }
    if (action === 'ai-test-one') return testAi(Number(btn.dataset.only))
    if (action === 'sync-now') {
      await api(`/api/users/${state.selected}/sync-now`, { method: 'POST' })
      return toast('Requested: it starts within a minute if the phone is connected and unlocked')
    }
    if (action === 'auto-off') {
      state.auto = await api(`/api/users/${state.selected}/auto-sync`, { method: 'POST', body: { enabled: false } })
      toast('Automatic sync turned off')
      return render()
    }
    if (action === 'autostart') {
      const { enabled } = await api('/api/setup/autostart', { method: 'POST', body: { enabled: btn.checked } })
      state.autostart = enabled
      toast(enabled ? 'Forza! Coach will start when you log in' : 'Forza! Coach will not start by itself')
      return render()
    }
    if (action === 'bws-adb') {
      const { id } = await api('/api/bws/download-adb', { method: 'POST' })
      await pollJob(id, state.bws)
      state.bws.devices = await api('/api/bws/devices')
      return render()
    }
    if (action === 'bws-file') {
      const file = await api(`/api/users/${state.selected}/bws-file`)
      const a = document.createElement('a')
      a.href = URL.createObjectURL(new Blob([JSON.stringify(file)], { type: 'application/json' }))
      a.download = 'forza-history-build-with-science.json'
      a.click()
      return
    }
    if (action === 'tab') {
      state.tab = btn.dataset.tab
      render()
      if (state.tab === 'food') loadPhotos()
      if (state.tab === 'import') {
        await loadAuto()
        render()
      }
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
        fig.innerHTML = `<img src="${esc(url)}" alt="" style="width:120px;height:160px;object-fit:cover;border-radius:10px"><figcaption class="small muted">${fmtDate(ph.taken_at)}${ph.weight_kg ? ' · ' + fmtKg(ph.weight_kg) + ' kg' : ''}</figcaption>`
        grid.append(fig)
      }
      return
    }
    if (action === 'plan-copy') {
      const from = document.getElementById('copy-from').value
      if (!confirm('Copy that person’s whole plan here? Workouts with the same name are replaced; starting weights are not copied.')) return
      const r = await api(`/api/users/${state.selected}/copy-plan`, { method: 'POST', body: { from } })
      toast(`Copied ${r.copied} workouts (${r.added} new, ${r.replaced} replaced)`)
      return selectUser(state.selected)
    }
    if (action.startsWith('kb-') || action.startsWith('tip-')) return knowledgeAction(action, btn)
    if (action.startsWith('meal-')) return mealAction(action, btn)
    if (action.startsWith('exm-') || action.startsWith('media-')) return exerciseAction(action, btn)
    if (action === 'tpl-copy') {
      const t = state.data.templates[Number(btn.dataset.plan)]
      const select = document.getElementById(`copy-to-${btn.dataset.plan}`)
      const name = select.selectedOptions[0]?.textContent
      if (!confirm(`Copy "${t.name}" to ${name}'s plan? A workout with the same name there is replaced; starting weights are not copied.`)) return
      const r = await api(`/api/users/${state.selected}/copy-workouts`, { method: 'POST', body: { to: select.value, ids: [t.id] } })
      toast(r.replaced ? `Replaced "${t.name}" in ${name}'s plan` : `Added "${t.name}" to ${name}'s plan`)
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
      state.tab = 'phone'
      state.signin = null
      return selectUser(id)
    }
    if (form.dataset.form === 'setup-token') {
      Object.assign(state.setup, await api('/api/setup/token', { method: 'POST', body: data }))
      await loadStatus()
      toast('Token saved')
      if (state.status.configured) await loadAi()
      return render()
    }
    if (form.dataset.form === 'setup-create') {
      const p = await api('/api/setup/create-project', { method: 'POST', body: data })
      toast('Project created: it is starting, this takes about 2 minutes')
      Object.assign(state.setup, await api('/api/setup/projects'))
      state.setup.choice = p.ref ?? p.id
      return render()
    }
    if (form.dataset.form === 'ai-key') {
      state.ai = await api('/api/setup/ai-key', { method: 'POST', body: { ...data, provider: form.dataset.provider } })
      toast('Key saved as a secret of your Supabase project')
      return render()
    }
    if (form.dataset.form === 'ai-test') {
      state.aiPhoto = { image: await fileToBase64(form.querySelector('input[type=file]').files[0]), mode: data.mode }
      return testAi()
    }
    if (form.dataset.form === 'app-url') {
      await api('/api/setup/app-url', { method: 'POST', body: data })
      await loadStatus()
      toast('Saved')
      return render()
    }
    if (form.dataset.form === 'kb-lesson') {
      const l = state.kbEdit
      const lines = String(data.sources ?? '').split('\n').map((x) => x.trim()).filter(Boolean)
      const known = new Set(state.kb.builtIn.sources.map((x) => x.id))
      const sources = lines.map((line) => {
        if (known.has(line)) return line
        const url = line.match(/https?:\/\/\S+/)?.[0]
        return { title: line.replace(url ?? '', '').trim().replace(/[.\s]+$/, ''), ...(url ? { url } : {}) }
      })
      let blocks, quiz
      try {
        blocks = JSON.parse(data.blocks || '[]')
        quiz = JSON.parse(data.quiz || '[]')
      } catch (err) {
        return toast(`The content or the quiz is not valid JSON: ${err.message}`)
      }
      const content = {
        emoji: data.emoji,
        tone: data.tone,
        title: { en: data.title_en, it: data.title_it },
        subtitle: { en: data.subtitle_en ?? '', it: data.subtitle_it ?? '' },
        blocks,
        sources,
        ...(quiz.length ? { quiz } : {}),
      }
      // A built-in lesson keeps only what was changed, so the rest still gets the app's own updates.
      const original = state.kb.builtIn.lessons.find((x) => x.id === data.id)
      if (original) for (const k of Object.keys(content)) if (JSON.stringify(content[k]) === JSON.stringify(original[k])) delete content[k]
      const track = data.track
      // A lesson moved to the other track goes to its end.
      const position = l.track === track ? (l.row?.position ?? null) : null
      await api(`/api/kb/lessons/${encodeURIComponent(data.id)}`, { method: 'PUT', body: { track, position, hidden: l.hidden ?? false, content } })
      state.kbEdit = null
      state.kb = await api('/api/kb')
      toast('Saved: everyone sees it the next time they open Learn')
      return render()
    }
    if (form.dataset.form === 'profile') {
      const body = { ...data, finish_setup: Boolean(data.finish_setup) }
      state.data.profile = await api(`/api/users/${state.selected}/profile`, { method: 'PUT', body })
      await loadUsers()
      toast('Profile saved')
      return render()
    }
    if (form.dataset.form === 'auto-on') {
      state.auto = await api(`/api/users/${state.selected}/auto-sync`, { method: 'POST', body: { enabled: true, serial: data.serial, everyHours: data.everyHours, plan: Boolean(data.plan) } })
      toast('Automatic sync is on')
      return render()
    }
    if (form.dataset.form === 'bws') {
      const body = { serial: data.serial, since: data.since, plan: Boolean(data.plan), profile: Boolean(data.profile) }
      const { id } = await api(`/api/users/${state.selected}/bws`, { method: 'POST', body })
      const job = await pollJob(id, state.bws)
      if (job.status === 'done') {
        toast(`Imported ${job.result.sessions ?? 0} workouts`)
        return selectUser(state.selected)
      }
      return
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
      toast(`Imported ${r.sessions} workouts (${r.sets} sets), ${r.templates} plan workouts, ${r.weights} weigh-ins, ${r.food} meals${r.custom_exercises ? `, ${r.custom_exercises} new exercises` : ''}`)
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
    if (form.dataset.form === 'exercise') {
      const e = state.exEdit
      if (!e.custom) await api(`/api/overrides/${e.id}`, { method: 'PUT', body: { ...data, media_urls: JSON.stringify(e.media) === JSON.stringify(e.own) ? [] : e.media } })
      else if (e.isNew) await api('/api/custom-exercises', { method: 'POST', body: { ...data, image_urls: e.media } })
      else await api(`/api/custom-exercises/${e.id}`, { method: 'PUT', body: { ...data, image_urls: e.media, archived: e.archived ?? false } })
      state.exEdit = null
      state.catalogue = await api('/api/catalogue')
      toast('Saved: everyone sees it the next time they open the exercise')
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
    await loadStatus()
    render()
    if (!state.status.configured) {
      if (state.status.accessToken) Object.assign(state.setup, await api('/api/setup/projects').catch(() => ({})))
      return render()
    }
    ;[state.catalogue] = await Promise.all([api('/api/catalogue'), loadUsers()])
    render()
  } catch (err) {
    app.innerHTML = `<p class="pad">Could not reach the database: ${esc(err.message)}</p>`
  }
})()
