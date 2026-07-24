import React, { useEffect, useMemo, useState } from 'react'
import { loadDashboard, loadActions, sevColor, fmtDate } from './lib/data.js'
import { StatCard, SevBadge, Pill, UsageBar, Section, Empty } from './components/ui.jsx'
import ActionCenter from './components/actions.jsx'

const TABS = ['Action Center', 'Overview', 'Findings', 'Zones', 'Limits', 'Activity', 'Betas', 'Resources']
const SEV_ORDER = ['critical', 'high', 'medium', 'low', 'info']

export default function App() {
  const [data, setData] = useState(null)
  const [actions, setActions] = useState(null)
  const [error, setError] = useState(null)
  const [tab, setTab] = useState('Action Center')
  const [sevFilter, setSevFilter] = useState('all')

  useEffect(() => { loadDashboard().then(setData).catch((e) => setError(e.message)); loadActions().then(setActions) }, [])

  if (error) return <Shell><div className="banner err">⚠ {error}</div></Shell>
  if (!data) return <div className="loading">Loading dashboard…</div>

  const goFindings = (sev) => { setSevFilter(sev); setTab('Findings') }

  return (
    <Shell data={data}>
      <div className="tabs">
        {TABS.map((t) => (
          <button key={t} className={`tab ${tab === t ? 'active' : ''}`} onClick={() => setTab(t)}>
            {t}
            {t === 'Action Center' && <span className="count">{actions?.stats?.total ?? 0}</span>}
            {t === 'Findings' && <span className="count">{data.summary?.total ?? 0}</span>}
            {t === 'Zones' && <span className="count">{data.zones?.length ?? 0}</span>}
            {t === 'Betas' && <span className="count">{data.betas?.length ?? 0}</span>}
          </button>
        ))}
      </div>

      {data.snapshotErrors?.length > 0 && (
        <div className="banner warn">
          ⚠ {data.snapshotErrors.length} collector(s) were skipped during the snapshot (usually a missing token scope).
          See <span className="mono">snapshot.errors</span> / the Resources tab. Reports still reflect everything that was collected.
        </div>
      )}

      {tab === 'Action Center' && (actions ? <ActionCenter data={data} actions={actions} /> : <Empty>No action catalog yet. Run <span className="mono">npm run actions</span>.</Empty>)}
      {tab === 'Overview' && <Overview data={data} goFindings={goFindings} />}
      {tab === 'Findings' && <Findings data={data} sevFilter={sevFilter} setSevFilter={setSevFilter} />}
      {tab === 'Zones' && <Zones data={data} />}
      {tab === 'Limits' && <Limits data={data} />}
      {tab === 'Activity' && <Activity data={data} />}
      {tab === 'Betas' && <Betas data={data} />}
      {tab === 'Resources' && <Resources data={data} />}
    </Shell>
  )
}

function Shell({ data, children }) {
  return (
    <div className="app">
      <div className="header">
        <div className="brand">
          <div className="logo">CF</div>
          <div>
            <h1>Command Center</h1>
            <div className="sub">{data ? data.account : 'Cloudflare account control center'}</div>
          </div>
        </div>
        {data && (
          <div className="meta">
            <div>snapshot <strong>{data.snapshotStamp}</strong></div>
            <div>captured {fmtDate(data.snapshotGeneratedAt)}</div>
          </div>
        )}
      </div>
      {children}
    </div>
  )
}

/* ── Overview ─────────────────────────────────────────────── */
function Overview({ data, goFindings }) {
  const c = data.counts || {}
  const sev = data.summary?.bySeverity || {}
  const topFindings = (data.findings || []).filter((f) => ['critical', 'high'].includes(f.severity)).slice(0, 8)
  const limitWarn = (data.limits || []).filter((l) => l.status === 'warn' || l.status === 'critical').sort((a, b) => (b.pct || 0) - (a.pct || 0))
  const recBetas = (data.betas || []).filter((b) => b.recommended)

  return (
    <>
      <div className="grid cols-5">
        <StatCard label="Critical" value={sev.critical || 0} accent={sevColor('critical')} onClick={() => goFindings('critical')} />
        <StatCard label="High" value={sev.high || 0} accent={sevColor('high')} onClick={() => goFindings('high')} />
        <StatCard label="Medium" value={sev.medium || 0} accent={sevColor('medium')} onClick={() => goFindings('medium')} />
        <StatCard label="Low" value={sev.low || 0} accent={sevColor('low')} onClick={() => goFindings('low')} />
        <StatCard label="Info" value={sev.info || 0} accent={sevColor('info')} onClick={() => goFindings('info')} />
      </div>

      <div className="grid cols-5" style={{ marginTop: 14 }}>
        <StatCard label="Zones" value={c.zones || 0} />
        <StatCard label="DNS records" value={c.dnsRecords || 0} />
        <StatCard label="Workers" value={c.workers || 0} />
        <StatCard label="KV / R2 / D1" value={`${c.kv || 0}/${c.r2 || 0}/${c.d1 || 0}`} />
        <StatCard label="Members / Tokens" value={`${c.members || 0}/${c.tokens || 0}`} />
      </div>

      <Section title="Top priorities (critical + high)">
        {topFindings.length === 0 ? <Empty>No critical or high findings 🎉</Empty> : topFindings.map((f, i) => <FindingRow key={i} f={f} />)}
      </Section>

      <div className="grid cols-2">
        <Section title="Limits to watch">
          {limitWarn.length === 0 ? <Empty>All tracked limits comfortably below 80%.</Empty> : (
            <table>
              <tbody>
                {limitWarn.map((l, i) => (
                  <tr key={i}>
                    <td>{l.metric}<div className="dim mono">{l.used} / {l.limit}</div></td>
                    <td style={{ width: 160 }}><UsageBar pct={l.pct} status={l.status} /></td>
                    <td className="right">{l.pct}%</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </Section>
        <Section title={`Recommended betas (${recBetas.length})`}>
          {recBetas.length === 0 ? <Empty>Run the beta advisor (npm run betas).</Empty> : (
            <table><tbody>
              {recBetas.slice(0, 8).map((b, i) => (
                <tr key={i}><td><a href={b.docsUrl} target="_blank" rel="noreferrer">{b.name}</a><div className="dim">{b.fitReason}</div></td><td className="right"><Pill tone="good">{b.area}</Pill></td></tr>
              ))}
            </tbody></table>
          )}
        </Section>
      </div>
    </>
  )
}

/* ── Findings ─────────────────────────────────────────────── */
function FindingRow({ f }) {
  return (
    <div className="finding">
      <div><SevBadge severity={f.severity} /></div>
      <div>
        <div className="ftitle">{f.title}</div>
        <div className="fmeta"><span className="mono">{f.resource}</span> · {f.category}</div>
        {f.detail && <div className="fmeta">{f.detail}</div>}
        {f.recommendation && <div className="frec">→ {f.recommendation}</div>}
      </div>
    </div>
  )
}

function Findings({ data, sevFilter, setSevFilter }) {
  const [cat, setCat] = useState('all')
  const [q, setQ] = useState('')
  const cats = useMemo(() => ['all', ...new Set((data.findings || []).map((f) => f.category))], [data])
  const list = (data.findings || []).filter((f) =>
    (sevFilter === 'all' || f.severity === sevFilter) &&
    (cat === 'all' || f.category === cat) &&
    (q === '' || `${f.title} ${f.resource} ${f.detail}`.toLowerCase().includes(q.toLowerCase()))
  )
  return (
    <Section title={`Findings (${list.length})`} right={
      <div className="filters">
        <select value={sevFilter} onChange={(e) => setSevFilter(e.target.value)}>
          <option value="all">all severities</option>
          {SEV_ORDER.map((s) => <option key={s} value={s}>{s}</option>)}
        </select>
        <select value={cat} onChange={(e) => setCat(e.target.value)}>
          {cats.map((c) => <option key={c} value={c}>{c}</option>)}
        </select>
        <input type="text" placeholder="search…" value={q} onChange={(e) => setQ(e.target.value)} />
      </div>
    }>
      {list.length === 0 ? <Empty>No findings match.</Empty> : list.map((f, i) => <FindingRow key={i} f={f} />)}
    </Section>
  )
}

/* ── Zones ────────────────────────────────────────────────── */
function Zones({ data }) {
  const zones = data.zones || []
  if (!zones.length) return <Empty>No zones in snapshot.</Empty>
  return (
    <div className="grid cols-2">
      {zones.map((z) => (
        <div className="card" key={z.id}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <h3>{z.name}</h3>
            <div>
              {z.paused && <Pill tone="bad">paused</Pill>}{' '}
              <Pill tone={z.status === 'active' ? 'good' : 'warn'}>{z.status}</Pill>{' '}
              <Pill>{z.plan || 'plan ?'}</Pill>
            </div>
          </div>
          <table style={{ marginTop: 10 }}>
            <tbody>
              <tr><td className="dim">SSL mode</td><td><SslPill mode={z.ssl_mode} /></td><td className="dim">DNSSEC</td><td><Pill tone={z.dnssec === 'active' ? 'good' : 'warn'}>{z.dnssec || 'off'}</Pill></td></tr>
              <tr><td className="dim">DNS records</td><td>{z.records} <span className="dim">({z.proxied} proxied)</span></td><td className="dim">Page rules</td><td>{z.pageRules}</td></tr>
              <tr><td className="dim">WAF custom</td><td>{z.wafCustom}</td><td className="dim">Rate limit</td><td>{z.rateLimit}</td></tr>
              <tr><td className="dim">WAF managed</td><td>{z.wafManaged}</td><td className="dim">Sec events (7d)</td><td>{z.securityEvents}</td></tr>
            </tbody>
          </table>
          {z.findings?.length > 0 && (
            <div style={{ marginTop: 10, display: 'flex', flexWrap: 'wrap', gap: 6 }}>
              {z.findings.map((f, i) => <span key={i} title={f.title}><SevBadge severity={f.severity} /></span>)}
            </div>
          )}
        </div>
      ))}
    </div>
  )
}

function SslPill({ mode }) {
  const tone = mode === 'strict' ? 'good' : mode === 'full' ? 'warn' : mode === 'flexible' || mode === 'off' ? 'bad' : 'default'
  return <Pill tone={tone}>{mode || '?'}</Pill>
}

/* ── Limits ───────────────────────────────────────────────── */
function Limits({ data }) {
  const [showRef, setShowRef] = useState(false)
  const limits = [...(data.limits || [])].sort((a, b) => (b.pct || 0) - (a.pct || 0))
  return (
    <>
      <Section title="Live utilization (from your snapshot)">
        <table>
          <thead><tr><th>Metric</th><th>Used</th><th>Limit</th><th>Plan</th><th style={{ width: 160 }}>Usage</th><th className="right">%</th></tr></thead>
          <tbody>
            {limits.map((l, i) => (
              <tr key={i}>
                <td>{l.metric}</td><td className="mono">{l.used}</td><td className="mono">{l.limit}</td>
                <td className="dim">{l.plan}</td>
                <td><UsageBar pct={l.pct} status={l.status} /></td>
                <td className="right">{l.pct == null ? '—' : l.pct + '%'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </Section>
      <Section title="Plan limits reference" right={<button className="tab" onClick={() => setShowRef((v) => !v)}>{showRef ? 'hide' : 'show'} ({(data.planLimitsReference || []).length})</button>}>
        {showRef && (
          <table>
            <thead><tr><th>Area</th><th>Metric</th><th>Free</th><th>Paid</th><th>Notes</th></tr></thead>
            <tbody>
              {(data.planLimitsReference || []).map((l, i) => (
                <tr key={i}><td><Pill>{l.area}</Pill></td><td>{l.metric}</td><td className="mono">{l.free}</td><td className="mono">{l.paid || '—'}</td><td className="dim">{l.notes}</td></tr>
              ))}
            </tbody>
          </table>
        )}
      </Section>
    </>
  )
}

/* ── Activity (audit attribution) ─────────────────────────── */
function Activity({ data }) {
  const a = data.attribution || {}
  const actors = Object.entries(a.byActor || {}).sort((x, y) => y[1] - x[1])
  const max = actors.length ? actors[0][1] : 1
  return (
    <>
      <Section title={`Recent sensitive changes — who did what (${(a.recentSensitive || []).length})`}>
        {(a.recentSensitive || []).length === 0 ? <Empty>No sensitive audit-log activity in the captured window (or audit-log scope not granted).</Empty> : (
          <table>
            <thead><tr><th>When</th><th>Actor</th><th>Action</th><th>Resource</th><th>Via</th></tr></thead>
            <tbody>
              {a.recentSensitive.map((e, i) => (
                <tr key={i}>
                  <td className="mono dim">{fmtDate(e.when)}</td>
                  <td>{e.actor?.email || e.actor?.id || 'unknown'}</td>
                  <td className="mono">{e.action || '?'}</td>
                  <td className="mono dim">{e.resource || '?'}</td>
                  <td><Pill>{e.interface || '?'}</Pill></td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Section>
      <Section title="Activity by actor (audit window)">
        {actors.length === 0 ? <Empty>No audit entries captured.</Empty> : (
          <table><tbody>
            {actors.map(([who, n], i) => (
              <tr key={i}><td style={{ width: 240 }}>{who}</td><td><div className="bar-track" style={{ maxWidth: 320 }}><div className="bar-fill" style={{ width: (n / max * 100) + '%', background: 'var(--accent)' }} /></div></td><td className="right">{n}</td></tr>
            ))}
          </tbody></table>
        )}
      </Section>
    </>
  )
}

/* ── Betas ────────────────────────────────────────────────── */
function Betas({ data }) {
  const betas = data.betas || []
  if (!betas.length) return <Empty>No beta advisory yet. Run <span className="mono">npm run betas</span>.</Empty>
  return (
    <div className="grid cols-2">
      {betas.map((b, i) => (
        <div className="card beta" key={i}>
          <div className="bhead">
            <div><span className="bname">{b.name}</span> <span className="barea">· {b.area}</span></div>
            <Pill tone={b.fit === 'high' ? 'good' : b.fit === 'low' ? 'warn' : 'default'}>{b.recommended ? '★ fit' : b.fit}</Pill>
          </div>
          <div className="dim" style={{ fontSize: 12 }}>{b.status}</div>
          <div className="bwhy">{b.whyEvaluate}</div>
          <div className="bfit">Fit: {b.fitReason}</div>
          <div><a href={b.docsUrl} target="_blank" rel="noreferrer">docs →</a></div>
        </div>
      ))}
    </div>
  )
}

/* ── Resources ────────────────────────────────────────────── */
function Resources({ data }) {
  const r = data.resources || {}
  return (
    <>
      <div className="grid cols-2">
        <Section title={`Workers (${r.workers?.length || 0})`}>
          <ResTable rows={r.workers} cols={[['name', 'Name'], ['modified_on', 'Modified', fmtDate]]} />
        </Section>
        <Section title={`Pages (${r.pages?.length || 0})`}>
          <ResTable rows={r.pages} cols={[['name', 'Project']]} />
        </Section>
        <Section title={`KV namespaces (${r.kv?.length || 0})`}>
          <ResTable rows={r.kv} cols={[['title', 'Title'], ['id', 'ID']]} />
        </Section>
        <Section title={`R2 buckets (${r.r2?.length || 0})`}>
          <ResTable rows={r.r2} cols={[['name', 'Bucket'], ['creation_date', 'Created', fmtDate]]} />
        </Section>
        <Section title={`D1 databases (${r.d1?.length || 0})`}>
          <ResTable rows={r.d1} cols={[['name', 'Name'], ['uuid', 'UUID']]} />
        </Section>
        <Section title={`Queues (${r.queues?.length || 0})`}>
          <ResTable rows={r.queues} cols={[['name', 'Queue']]} />
        </Section>
      </div>
      <Section title={`Members (${data.members?.length || 0})`}>
        {(data.members || []).length === 0 ? <Empty>No member data (token may lack Membership:Read).</Empty> : (
          <table>
            <thead><tr><th>Email</th><th>Status</th><th>Roles</th><th>2FA</th></tr></thead>
            <tbody>{data.members.map((m, i) => (
              <tr key={i}><td>{m.email}</td><td><Pill tone={m.status === 'accepted' ? 'good' : 'warn'}>{m.status}</Pill></td><td className="dim">{(m.roles || []).join(', ')}</td><td>{m.tfa === false ? <Pill tone="bad">off</Pill> : m.tfa === true ? <Pill tone="good">on</Pill> : '—'}</td></tr>
            ))}</tbody>
          </table>
        )}
      </Section>
      <Section title={`API tokens (${data.tokens?.length || 0})`}>
        {(data.tokens || []).length === 0 ? <Empty>No token metadata (needs a user-scoped token with API Tokens:Read).</Empty> : (
          <table>
            <thead><tr><th>Name</th><th>Status</th><th>Last used</th><th>Expires</th></tr></thead>
            <tbody>{data.tokens.map((t, i) => (
              <tr key={i}><td>{t.name}</td><td><Pill tone={t.status === 'active' ? 'good' : 'warn'}>{t.status}</Pill></td><td className="mono dim">{fmtDate(t.last_used_on)}</td><td className="mono dim">{t.expires_on ? fmtDate(t.expires_on) : <Pill tone="warn">never</Pill>}</td></tr>
            ))}</tbody>
          </table>
        )}
      </Section>
    </>
  )
}

function ResTable({ rows, cols }) {
  if (!rows || rows.length === 0) return <Empty>none</Empty>
  return (
    <table>
      <thead><tr>{cols.map(([k, label]) => <th key={k}>{label}</th>)}</tr></thead>
      <tbody>
        {rows.map((row, i) => (
          <tr key={i}>{cols.map(([k, , fmt]) => <td key={k} className={k === 'id' || k === 'uuid' ? 'mono dim' : ''}>{fmt ? fmt(row[k]) : (row[k] ?? '—')}</td>)}</tr>
        ))}
      </tbody>
    </table>
  )
}
