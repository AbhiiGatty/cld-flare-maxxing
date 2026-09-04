# Access bypass exceptions

The Zero Trust dashboard flags two applications as "Overprovisioned Access
Policies". Both were inspected on 2026-09-04 with the read token before any
change was considered. Neither policy should be tightened blindly.

| Application | Path | Policy | Why the bypass exists |
| --- | --- | --- | --- |
| `gattyworks-metrics event ingest` (`bc2fcbce-…`) | `metrics.gattyworks.com/api/event` | `public ingest` — bypass, include Everyone | The beacon that client sites embed POSTs anonymous interaction events here. There is no identity to check at the edge. The Worker enforces its own gate: CORS restricted to registered project origins, per-IP `EVENT_LIMITER` rate limits, and only explicit-interaction events. The rest of `metrics.gattyworks.com` stays behind the exact-email console application. |
| `Social Desk MCP` (`c0254a9c-…`) | `social.gattyworks.com/mcp*` | `Bypass Access for Social Desk MCP` — bypass, include Everyone | MCP clients cannot complete a browser Access login. The Worker requires a hashed `sdmcp_…` bearer connection token on every `/mcp*` request and returns 401 otherwise. The dashboard at `social.gattyworks.com` stays behind the exact-email application. Created by `social-desk-mcp-access.mjs`. |

Both are path-scoped carve-outs from host-wide Access applications, which is
the only Access construct that lets an anonymous or non-browser client reach a
single public route while the rest of the host stays gated. The warning is
expected.

## Least-privilege options considered

- **Metrics ingest:** replacing the bypass with a service-token policy would
  break every third-party site that embeds the beacon; those sites cannot hold
  a Cloudflare service token. The application-layer gate (origin allowlist +
  rate limit) is the correct control. Optional hardening lives in the metrics
  Worker (Turnstile on submitted-email events), not in Access.
- **Social Desk MCP:** a `non_identity` service-token policy would work only
  for MCP clients that can send `CF-Access-Client-Id/Secret` headers. Claude
  and Codex connectors cannot, so the Worker's bearer token remains the gate.
  If a future MCP client supports custom headers, add a service-token policy
  alongside (not instead of) the Worker check through a new guarded action,
  dry-run first.

No policy change is scheduled. Revisit when either Worker's own gate changes.
