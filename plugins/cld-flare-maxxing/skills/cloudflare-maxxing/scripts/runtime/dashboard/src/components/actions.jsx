import React, { useMemo, useState, useEffect } from 'react'
import { sevColor, fmtDate } from '../lib/data.js'
import { Donut, Legend, BarRow } from './charts.jsx'
import { StatCard, Section, Empty } from './ui.jsx'

const STATUS = {
  todo:        { label: 'To do',       color: '#8b949e' },
  in_progress: { label: 'In progress', color: '#38bdf8' },
  blocked:     { label: 'Blocked',     color: '#ffc53d' },
  done:        { label: 'Done',        color: '#95de64' },
}
const STATUS_ORDER = ['done', 'in_progress', 'blocked', 'todo']
const CATS = {
  security:        { label: 'Security', icon: '🛡' },
  'customer-value':{ label: 'Customer value', icon: '✦' },
  'dx-reliability':{ label: 'DX & reliability', icon: '⚙' },
  'data-platform': { label: 'Data platform', icon: '▦' },
  performance:     { label: 'Performance', icon: '⚡' },
  cost:            { label: 'Cost & limits', icon: '◷' },
}
const SEL_KEY = 'cf-action-selection'
const IGN_KEY = 'cf-action-ignored'
const loadSet = (key) => { try { return new Set(JSON.parse(localStorage.getItem(key) || '[]')) } catch { return new Set() } }

export default function ActionCenter({ data, actions }) {
  const all = actions?.actions || []
  const [selected, setSelected] = useState(() => loadSet(SEL_KEY))
  const [ignored, setIgnored] = useState(() => loadSet(IGN_KEY))
  const [catFilter, setCatFilter] = useState('all')
  const [statusFilter, setStatusFilter] = useState('open')
  const [copied, setCopied] = useState(false)
  const [showIgnored, setShowIgnored] = useState(false)

  useEffect(() => { localStorage.setItem(SEL_KEY, JSON.stringify([...selected])) }, [selected])
  useEffect(() => { localStorage.setItem(IGN_KEY, JSON.stringify([...ignored])) }, [ignored])

  const toggle = (id) => setSelected((s) => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n })
  const ignore = (id) => { setIgnored((s) => new Set(s).add(id)); setSelected((s) => { const n = new Set(s); n.delete(id); return n }) }
  const restore = (id) => setIgnored((s) => { const n = new Set(s); n.delete(id); return n })

  // Ignored items are excluded from everything actionable (counts, charts, lists).
  const active = all.filter((a) => !ignored.has(a.id))
  const ignoredList = all.filter((a) => ignored.has(a.id))

  const total = active.length
  const cnt = (st) => active.filter((a) => a.status === st).length
  const donePct = total ? Math.round((cnt('done') / total) * 100) : 0
  const readyNow = active.filter((a) => a.canDoNow === true && a.status !== 'done').length
  const statusSegs = STATUS_ORDER.map((k) => ({ label: STATUS[k].label, value: cnt(k), color: STATUS[k].color }))

  const sev = data.summary?.bySeverity || {}
  const sevSegs = ['critical', 'high', 'medium', 'low'].map((k) => ({ label: k, value: sev[k] || 0, color: sevColor(k) }))
  const limits = [...(data.limits || [])].filter((l) => l.pct != null).sort((a, b) => b.pct - a.pct).slice(0, 6)
  const maxLimit = limits[0]?.pct || 1

  const visible = active.filter((a) =>
    (catFilter === 'all' || a.category === catFilter) &&
    (statusFilter === 'all' || (statusFilter === 'open' ? a.status !== 'done' : a.status === statusFilter))
  )
  const groups = useMemo(() => {
    const g = {}
    for (const a of visible) (g[a.category] ??= []).push(a)
    return g
  }, [visible])

  const selList = active.filter((a) => selected.has(a.id))
  const copyForClaude = () => {
    const lines = selList.map((a) => `- ${a.title} (${a.id})`).join('\n')
    const txt = `Please action these items from the dashboard. Create the config-checkpoint backup first, confirm each is within permissions, dry-run, then apply on my confirm:\n${lines}`
    navigator.clipboard?.writeText(txt).then(() => { setCopied(true); setTimeout(() => setCopied(false), 1800) })
  }
  const selectAllReady = () => setSelected(new Set(active.filter((a) => a.canDoNow === true && a.status !== 'done').map((a) => a.id)))

  return (
    <>
      <div className="hero">
        <div className="hero-ring card">
          <Donut size={132} thickness={16} centerTop={`${donePct}%`} centerSub="done"
            segments={[{ value: cnt('done'), color: STATUS.done.color }, { value: total - cnt('done'), color: '#1c232c' }]} />
          <div>
            <div className="hero-title">Action progress</div>
            <div className="dim">{cnt('done')} of {total} done · {readyNow} ready to run now{ignoredList.length ? ` · ${ignoredList.length} ignored` : ''}</div>
          </div>
        </div>
        <div className="grid cols-3 hero-stats">
          <StatCard label="Critical findings" value={sev.critical || 0} accent={sevColor('critical')} />
          <StatCard label="High findings" value={sev.high || 0} accent={sevColor('high')} />
          <StatCard label="Ready to run now" value={readyNow} accent="#95de64" />
        </div>
      </div>

      <div className="grid cols-3" style={{ marginTop: 16 }}>
        <div className="card chart-card">
          <h3>Findings by severity</h3>
          <div className="chart-row">
            <Donut size={132} thickness={16} segments={sevSegs} centerTop={data.summary?.total || 0} centerSub="findings" />
            <Legend segments={sevSegs} />
          </div>
        </div>
        <div className="card chart-card">
          <h3>Actions by status</h3>
          <div className="chart-row">
            <Donut size={132} thickness={16} segments={statusSegs} centerTop={total} centerSub="actions" />
            <Legend segments={statusSegs} />
          </div>
        </div>
        <div className="card chart-card">
          <h3>Limits utilisation</h3>
          {limits.length === 0 ? <Empty>No metered usage.</Empty> :
            limits.map((l, i) => <BarRow key={i} label={l.metric.replace(/ —.*/, '')} value={l.pct} max={maxLimit}
              sub={`${l.used}/${l.limit}`} color={l.pct > 80 ? '#ff4d4f' : l.pct > 50 ? '#ffc53d' : 'var(--accent-2)'} />)}
        </div>
      </div>

      <Section title={`Action center (${visible.length})`} right={
        <div className="filters">
          <select value={catFilter} onChange={(e) => setCatFilter(e.target.value)}>
            <option value="all">all categories</option>
            {Object.entries(CATS).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
          </select>
          <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
            <option value="open">open (not done)</option>
            <option value="all">all statuses</option>
            {Object.entries(STATUS).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
          </select>
          <button className="tab" onClick={selectAllReady}>select all ready</button>
        </div>
      }>
        {visible.length === 0 ? <Empty>No actions match.</Empty> : Object.entries(groups).map(([cat, items]) => (
          <div key={cat} className="act-group">
            <div className="act-group-head">{CATS[cat]?.icon} {CATS[cat]?.label || cat} <span className="dim">· {items.length}</span></div>
            {items.map((a) => <ActionCard key={a.id} a={a} selected={selected.has(a.id)} onToggle={() => toggle(a.id)} onIgnore={() => ignore(a.id)} />)}
          </div>
        ))}
      </Section>

      {selList.length > 0 && (
        <div className="selbar">
          <span><strong>{selList.length}</strong> selected</span>
          <div className="selbar-actions">
            <button className="tab" onClick={() => setSelected(new Set())}>clear</button>
            <button className="btn-primary" onClick={copyForClaude}>{copied ? '✓ copied — paste to Claude' : 'Copy selection for Claude'}</button>
          </div>
        </div>
      )}

      {ignoredList.length > 0 && (
        <div className="ignored-wrap">
          <button className="ignored-head" onClick={() => setShowIgnored((v) => !v)}>
            {showIgnored ? '▾' : '▸'} Ignored ({ignoredList.length}) <span className="dim">— not counted toward actionable items</span>
          </button>
          {showIgnored && ignoredList.map((a) => (
            <div className="ign-row" key={a.id}>
              <span className="badge" style={{ color: sevColor(a.impact), borderColor: sevColor(a.impact) + '55', background: sevColor(a.impact) + '22' }}>{a.impact}</span>
              <span className="ign-title">{a.title}</span>
              <span className="chip dim">{CATS[a.category]?.label || a.category}</span>
              <button className="tab" onClick={() => restore(a.id)}>restore</button>
            </div>
          ))}
        </div>
      )}
    </>
  )
}

function ActionCard({ a, selected, onToggle, onIgnore }) {
  const [open, setOpen] = useState(false)
  const st = STATUS[a.status] || STATUS.todo
  const can = a.type === 'dashboard' ? { t: 'you / dashboard', c: '#8b949e' }
    : a.canDoNow === true ? { t: '✓ I can do this now', c: '#95de64' }
    : a.canDoNow === false ? { t: 'needs you', c: '#ffc53d' }
    : { t: a.type, c: '#8b949e' }
  return (
    <div className={`act ${selected ? 'sel' : ''} ${a.status === 'done' ? 'is-done' : ''}`}>
      <label className="act-check">
        <input type="checkbox" checked={selected} onChange={onToggle} disabled={a.status === 'done'} />
      </label>
      <div className="act-body">
        <div className="act-head">
          <span className="badge" style={{ color: sevColor(a.impact), borderColor: sevColor(a.impact) + '55', background: sevColor(a.impact) + '22' }}>{a.impact}</span>
          <span className="act-title">{a.title}</span>
          <span className="status-badge" style={{ color: st.color, borderColor: st.color + '55', background: st.color + '1e' }}>{st.label}</span>
          {onIgnore && <button className="act-ignore" onClick={onIgnore} title="Ignore — hide and don't count it" aria-label="ignore">✕</button>}
        </div>
        <div className="act-tags">
          <span className="chip">{a.type}</span>
          <span className="chip">effort: {a.effort}</span>
          <span className="chip" style={{ color: can.c, borderColor: can.c + '55' }}>{can.t}</span>
          {(a.affected || []).slice(0, 4).map((r, i) => <span key={i} className="chip dim">{r}</span>)}
        </div>
        {a.note && <div className="act-note">ⓘ {a.note}</div>}
        <button className="act-toggle" onClick={() => setOpen((v) => !v)}>{open ? '▾ hide what I’ll do' : '▸ what I’ll do'}</button>
        {open && (
          <ul className="act-does">
            {(a.does || []).map((d, i) => <li key={i}>{d}</li>)}
            {a.completedAt && <li className="dim">completed {fmtDate(a.completedAt)}</li>}
          </ul>
        )}
      </div>
    </div>
  )
}
