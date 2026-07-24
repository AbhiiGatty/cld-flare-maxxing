# scripts/lib/

The shared library every other script builds on.

| File | What it is |
|---|---|
| `cf.mjs` | REST + GraphQL client; read/edit token modes, pagination, retries |
| `guard.mjs` | break-glass enforcement (`assertBreakGlass()`) and the action audit log (`audit()`) |
| `paths.mjs` | repo paths and `snapshots/index.json` bookkeeping (the "latest" pointer) |
| `util.mjs` | env loader, JSON I/O, secret redaction, logging |
