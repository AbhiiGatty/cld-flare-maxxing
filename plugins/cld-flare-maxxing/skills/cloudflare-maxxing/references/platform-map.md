# Cloudflare platform map

The full product surface, grouped. "Free?" = meaningful free tier exists. Verify current
limits/availability with the `cloudflare-docs` MCP before committing to a design.

## Compute
| Product | Use it for | Free? | Maturity |
|---|---|---|---|
| Workers | Serverless functions / APIs / SSR at the edge | ✅ 100k req/day | GA |
| Workers Static Assets | Serve a site/SPA from a Worker | ✅ | GA |
| Pages | Git-driven static/full-stack hosting (converging into Workers) | ✅ | GA |
| Durable Objects | Stateful, single-threaded coordination + WebSockets | ✅ (SQLite DO) | GA |
| Workflows | Durable, multi-step, retryable orchestration | ✅ | GA |
| Containers | Run Linux/non-JS/heavy workloads | 💲 active-CPU | GA (new) |
| Dynamic Workers | Spin up Workers at runtime / run AI-gen code | 💲 paid | Open beta |
| Sandbox SDK | Isolated execution of untrusted code | 💲 | New |

## Storage & data
| Product | Use it for | Free? | Maturity |
|---|---|---|---|
| Workers KV | Global key/value, config, sessions | ✅ | GA |
| D1 | SQLite relational DB (+ read replication) | ✅ 10 DB/5GB | GA; replication beta |
| R2 | S3-compatible object storage, **zero egress** | ✅ 10GB | GA |
| Durable Objects storage | Per-object transactional SQLite | ✅ | GA |
| Vectorize | Vector/embedding search | ✅ | GA |
| Hyperdrive | Pool + cache to external SQL DBs | ✅ | GA |
| R2 Data Catalog + R2 SQL | Iceberg tables + serverless SQL over R2 | ✅ tiers | Open beta |
| Pipelines | Ingest streams → R2 | 💲 | Beta |

## AI
| Product | Use it for | Free? | Maturity |
|---|---|---|---|
| Workers AI | Edge model inference | ✅ tiers | GA |
| AI Gateway | Unified LLM proxy: cache/limits/retries/failover/logs | ✅ | GA (new) |
| AutoRAG (AI Search) | Managed RAG over R2 content | ✅ tiers | Open beta |
| Agents SDK | Build stateful AI agents on Workers+DO | ✅ | GA |

## Networking & DNS
| Product | Use it for | Free? | Maturity |
|---|---|---|---|
| DNS / Zones | Authoritative DNS, records, DNSSEC | ✅ | GA |
| Email Routing | Receive/forward email on your domain | ✅ | GA |
| Rules (Redirect/Transform/Configuration/Cache) | Modern URL/header/cache control | ✅ tiers | GA |
| Tiered Cache / Argo | Cache hit ratio / smart routing | mixed | GA |
| Cloudflare Tunnel | Expose origin without open ports | ✅ | GA |
| Spectrum | Proxy arbitrary TCP/UDP | 💲 | GA |
| Smart Placement | Co-locate compute near backend | ✅ | GA (new) |

## Security
| Product | Use it for | Free? | Maturity |
|---|---|---|---|
| WAF (managed + custom rules) | App-layer firewall, OWASP, CVEs | tiered | GA |
| Rate Limiting | Throttle abuse on auth/API/forms | ✅ 1 rule | GA |
| Bot Fight / Super Bot Fight Mode | Bot mitigation | ✅ / Pro+ | GA |
| Turnstile | Privacy-friendly CAPTCHA | ✅ | GA |
| DDoS protection | Always-on L3-7 mitigation | ✅ | GA |
| SSL/TLS + Origin CA | Edge + origin encryption | ✅ | GA |
| Cloudflare Access (Zero Trust) | Auth-gate apps/tools; SSO; managed OAuth | ✅ up to 50 users | GA |
| Secrets Store | Account-level secret management | ✅ | New |

## Email (sending)
| Product | Use it for | Free? | Maturity |
|---|---|---|---|
| Email Service — Sending | Transactional email from Workers/REST/SMTP | beta tiers | Public beta |

## Dev, delivery & observability
| Product | Use it for | Free? | Maturity |
|---|---|---|---|
| Wrangler / Vite plugin | Build, dev, deploy | ✅ | GA |
| Remote bindings | Local dev against real resources | ✅ | Public beta |
| Workers Builds | Git-driven CI/CD for Workers | ✅ tiers | GA |
| Workers Observability / Logs | Centralized logs + Query Builder | ✅ 7-day | GA (new) |
| Logpush | Export logs to storage/SIEM | 💲 | GA |
| GraphQL Analytics API | Custom metrics/queries | ✅ | GA |
| Flagship | Native feature flags (in-Worker eval) | ✅ | Public beta |
| Billable Usage + Budget alerts | Cost visibility + alerts | ✅ | GA (new) |

## Zero Trust / access (team)
Access, Gateway, WARP, Tunnel, Internal DNS (Enterprise beta). Free tier covers exactly 50
users — useful to gate internal dashboards/admin routes even for solo/small setups. A user is
an authenticated identity (devices don't multiply the count). Crossing 50 has no grace period
or partial charging: the whole org moves to Standard at $7/user/month (51 users = $357/month,
not $7), and Standard meters data transfer at 15 GB/user, then $1/GB. The report tracks seat
count against the cap (warns at 40, critical at 50) — free stale seats by revoking departed
users under Zero Trust > My Team > Users before adding new ones.
