import React from 'react'

/* Donut / ring built from SVG arcs — dark-mode native via CSS vars. */
export function Donut({ segments, size = 150, thickness = 18, centerTop, centerSub }) {
  const total = segments.reduce((s, x) => s + (x.value || 0), 0)
  const r = (size - thickness) / 2
  const c = size / 2
  const circ = 2 * Math.PI * r
  let acc = 0
  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} role="img" aria-label="donut chart">
      <circle cx={c} cy={c} r={r} fill="none" stroke="#1c232c" strokeWidth={thickness} />
      {total > 0 && segments.filter((s) => s.value > 0).map((s, i) => {
        const frac = s.value / total
        const el = (
          <circle key={i} cx={c} cy={c} r={r} fill="none" stroke={s.color} strokeWidth={thickness}
            strokeDasharray={`${frac * circ} ${circ}`} strokeDashoffset={-acc * circ}
            transform={`rotate(-90 ${c} ${c})`} />
        )
        acc += frac
        return el
      })}
      {centerTop != null && <text x={c} y={c - 4} textAnchor="middle" className="donut-center">{centerTop}</text>}
      {centerSub != null && <text x={c} y={c + 16} textAnchor="middle" className="donut-sub">{centerSub}</text>}
    </svg>
  )
}

export function Legend({ segments }) {
  return (
    <div className="legend">
      {segments.map((s, i) => (
        <div className="legend-row" key={i}>
          <span className="legend-dot" style={{ background: s.color }} />
          <span className="legend-label">{s.label}</span>
          <span className="legend-val">{s.value}</span>
        </div>
      ))}
    </div>
  )
}

export function BarRow({ label, value, max, color, sub }) {
  const w = max > 0 ? Math.min(100, Math.round((value / max) * 100)) : 0
  return (
    <div className="barrow">
      <div className="barrow-head"><span>{label}</span><span className="dim">{sub ?? value}</span></div>
      <div className="bar-track"><div className="bar-fill" style={{ width: w + '%', background: color || 'var(--accent)' }} /></div>
    </div>
  )
}
