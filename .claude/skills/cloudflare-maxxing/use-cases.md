# Use-case → Cloudflare primitive map

"I want to do X" → the Cloudflare-native way to do it. Verify limits/syntax via `cloudflare-docs`.

## Build & host
| I want to… | Use | Notes |
|---|---|---|
| Host a static site / SPA | **Workers + Static Assets** (or Pages) | Vite plugin; Pages is converging into Workers — prefer Workers Assets for new builds. |
| Build a dynamic API / backend | **Workers** (+ Hono router) | Edge-deployed, ms cold starts; 100k req/day free. |
| Full-stack app (SSR + API) | **Workers** + framework (React Router, TanStack, Remix, Astro) | Cloudflare Vite plugin; auxiliary Workers via service bindings. |
| Connect Worker → existing Postgres/MySQL | **Hyperdrive** | Connection pooling + edge caching of queries. |
| Run heavy / non-JS / a CLI / binary | **Containers** (+ Sandbox SDK for untrusted code) | Active-CPU pricing; Docker images. |
| Run user- or AI-generated code on demand | **Dynamic Workers** / **Sandbox SDK** | Sandboxed, ms-start; underpins LLM "code mode". |

## Data & state
| I want to… | Use | Notes |
|---|---|---|
| Key/value config, sessions, cache | **Workers KV** | Eventually consistent, global reads. 100k reads/day free. |
| Relational data (SQL) | **D1** (SQLite) | 10 DBs / 5GB free; read replication (Sessions API) for low-latency reads. |
| Object/file storage, images, backups, big assets | **R2** | S3-compatible, **zero egress fees**; 10GB free. |
| Strongly-consistent coordination (chat rooms, multiplayer, counters, locks) | **Durable Objects** | Single-threaded per-object; WebSockets; SQLite storage. |
| Vector / semantic search | **Vectorize** | Embeddings index; pairs with Workers AI. |
| Query logs/events cheaply (no warehouse) | **R2 Data Catalog (Iceberg) + R2 SQL** | Land logs in R2, query in place. |
| Connection-pool + cache to a remote DB | **Hyperdrive** | — |

## Async, scheduling, orchestration
| I want to… | Use | Notes |
|---|---|---|
| Background jobs / decouple producers & consumers | **Queues** | Pull or Worker consumers; event subscriptions from R2/KV/Builds. |
| Run something on a schedule (cron) | **Cron Triggers** | Defined in wrangler; per-Worker schedules. |
| Multi-step, durable, retryable workflows | **Workflows** | Survives failures; long-running steps. |
| React to platform events (R2 upload, build done) | **Event Subscriptions → Queues** | e.g. process file on upload, alert on build failure. |
| Build a stateful AI agent | **Agents SDK** (on Workers + Durable Objects) | WebSockets, scheduling, MCP server hosting. |

## AI
| I want to… | Use | Notes |
|---|---|---|
| Run inference at the edge | **Workers AI** (`env.AI.run`) | Open model catalog (e.g. GLM-5.2). |
| Use any LLM with caching, limits, retries, failover | **AI Gateway** | One API for OpenAI/Anthropic/Google/Workers AI; unified logs + billing. |
| "Ask our docs" / RAG over my content | **AutoRAG** (over R2) | Managed embeddings + retrieval + generation. |
| Semantic search | **Vectorize** | — |

## Email
| I want to… | Use | Notes |
|---|---|---|
| Receive / forward email on my domain | **Email Routing** | Free; route addresses → destinations or a Worker. |
| Send transactional email (resets, receipts, form replies) | **Email Service — Sending** | `env.EMAIL.send()`, REST, or SMTP; auto DKIM/ARC. |
| Improve deliverability | **SPF / DKIM / DMARC** records | This tool's report checks all three; see findings. |

## Security
| I want to… | Use | Notes |
|---|---|---|
| Block bots / brute force | **Bot Fight Mode** (free) / Super Bot Fight Mode (Pro+) | — |
| Stop credential stuffing on login/forms | **Rate Limiting** + **WAF custom rules** + **Turnstile** | Turnstile = privacy-friendly CAPTCHA. |
| App-layer firewall (OWASP, CVEs, SQLi/XSS) | **Managed WAF ruleset** + **custom rules** | Some protections on Free/Pro. |
| Encrypt origin properly | **SSL/TLS mode = Full (Strict)** + Origin CA cert | Flexible is insecure — the report flags it. |
| Prevent DNS spoofing | **DNSSEC** | One-click on Cloudflare; add DS at registrar. |
| Protect an internal tool / admin route | **Cloudflare Access** (Zero Trust, free tier) | + Managed OAuth for CLIs/agents. |
| Expose a local/origin service securely (no open ports) | **Cloudflare Tunnel** (`cloudflared`) | — |
| Stop leaked-credential logins | **WAF leaked-credentials detection** | — |

## Networking, DNS, delivery, performance
| I want to… | Use | Notes |
|---|---|---|
| Redirects / header rewrites / per-path config | **Rules** (Redirect / Transform / Configuration) | Prefer over legacy **Page Rules** (limited quota). |
| Cache aggressively / control TTLs | **Cache Rules** + Tiered Cache (free) | Don't set cache_level=bypass globally. |
| Lower latency to a backend | **Smart Placement / placement hints** | Co-locate compute near origin. |
| Optimize/resize images | **Images / Image Resizing** | — |
| Stream / host video | **Stream** | — |
| Faster routing for dynamic traffic | **Argo Smart Routing** | Paid. |

## Dev experience, observability, governance
| I want to… | Use | Notes |
|---|---|---|
| Feature flags / A-B / kill switches | **Flagship** | In-Worker eval (KV+DO), no third-party SaaS. |
| Centralized Worker logs + query | **Workers Observability / Logs** | One config line per Worker; 7-day retention. |
| Export logs to my SIEM/storage | **Logpush** | — |
| Custom analytics queries | **GraphQL Analytics API** | This tool uses it for security events. |
| Watch cost / avoid bill surprises | **Billable Usage dashboard + Budget alerts** | — |
| Least-privilege automation creds | **scoped API tokens** (+ Secrets Store) | Avoid the Global API Key; this tool flags stale/over-scoped tokens. |
| Local dev against real KV/R2/D1 | **Remote bindings** (`experimental_remote`) | Faster, higher-fidelity iteration. |

> Rule of thumb: **stay on-platform**. Most needs (compute, storage, queueing, AI, email,
> auth, security, analytics) have a first-party Cloudflare primitive — composing them avoids
> extra vendors, egress fees, and latency.
