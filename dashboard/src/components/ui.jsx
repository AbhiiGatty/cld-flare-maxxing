import React from 'react'
import { sevColor } from '../lib/data.js'

export function StatCard({ label, value, sub, accent, onClick }) {
  return (
    <div className={`card stat ${onClick ? 'clickable' : ''}`} onClick={onClick} style={accent ? { borderTopColor: accent } : undefined}>
      <div className="stat-value" style={accent ? { color: accent } : undefined}>{value}</div>
      <div className="stat-label">{label}</div>
      {sub != null && <div className="stat-sub">{sub}</div>}
    </div>
  )
}

export function SevBadge({ severity }) {
  return (
    <span className="badge" style={{ background: sevColor(severity) + '22', color: sevColor(severity), borderColor: sevColor(severity) + '55' }}>
      {severity}
    </span>
  )
}

export function Pill({ children, tone = 'default' }) {
  return <span className={`pill pill-${tone}`}>{children}</span>
}

export function UsageBar({ pct, status }) {
  const color = status === 'critical' ? '#ff4d4f' : status === 'warn' ? '#ffc53d' : '#52c41a'
  const w = pct == null ? 0 : Math.min(100, pct)
  return (
    <div className="bar-track" title={pct == null ? 'n/a' : pct + '%'}>
      <div className="bar-fill" style={{ width: w + '%', background: color }} />
    </div>
  )
}

export function Section({ title, children, right }) {
  return (
    <section className="section">
      <div className="section-head">
        <h2>{title}</h2>
        {right}
      </div>
      {children}
    </section>
  )
}

export function Empty({ children }) {
  return <div className="empty">{children}</div>
}
