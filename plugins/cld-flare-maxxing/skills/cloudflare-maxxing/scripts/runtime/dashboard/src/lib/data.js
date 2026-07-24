export async function loadDashboard() {
  const res = await fetch(`${import.meta.env.BASE_URL}data/dashboard.json`, { cache: 'no-store' })
  if (!res.ok) {
    throw new Error(
      'data/dashboard.json not found. From the repo root run:  npm run refresh  (snapshot → report → betas → dashboard data)'
    )
  }
  return res.json()
}

export async function loadActions() {
  try {
    const res = await fetch(`${import.meta.env.BASE_URL}data/actions.json`, { cache: 'no-store' })
    if (!res.ok) return null
    return res.json()
  } catch { return null }
}

export const SEV = {
  critical: { color: '#ff4d4f', label: 'Critical', icon: '●' },
  high: { color: '#ff7a45', label: 'High', icon: '●' },
  medium: { color: '#ffc53d', label: 'Medium', icon: '●' },
  low: { color: '#95de64', label: 'Low', icon: '●' },
  info: { color: '#69c0ff', label: 'Info', icon: '●' },
}

export function sevColor(s) {
  return (SEV[s] || SEV.info).color
}

export function fmtDate(s) {
  if (!s) return '—'
  try {
    return new Date(s).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' })
  } catch {
    return s
  }
}
