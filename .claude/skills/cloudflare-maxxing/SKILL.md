---
name: cloudflare-maxxing
description: Educate on and recommend how to use the Cloudflare platform to its maximum. Use when the user asks what they can do with Cloudflare, how to use a Cloudflare feature, which Cloudflare product fits a need ("how do I do X on Cloudflare"), how to get more value from their account, or wants to learn the platform. Pairs with the cf-optimizer and cf-architect agents.
---

# Cloudflare maxxing — teach + recommend

Goal: help the user understand the Cloudflare platform and use it to the maximum for their
actual stack — not a generic feature dump, but grounded, prioritized, do-this-next guidance.

## How to respond

1. **Ground in their real account first.** Read `reports/latest-report.json` and the latest
   snapshot (`snapshots/<latest>/snapshot.json` via `snapshots/index.json`). If stale/missing,
   offer `npm run refresh` (read-only). Know what they already use before recommending.
2. **Map need → primitive.** Use [use-cases.md](use-cases.md): "I want to do X → use these
   Cloudflare products, wired this way, on this plan." Always name the smallest viable starting point.
3. **Know the whole surface.** Use [platform-map.md](platform-map.md) for the full product
   catalog grouped by domain, with maturity + free-tier notes — so you don't miss an option.
4. **Reach for the frontier.** Check `reference/betas.json` (already scored against their stack
   by `npm run betas`) for beta/early-access features worth piloting.
5. **Verify before asserting.** Use the `cloudflare-docs` MCP (`search_cloudflare_documentation`)
   for current syntax, limits, and availability. Cite the docs URL. Prefer current docs over memory.

## Teaching style
- Lead with the "why" and the use case, then the product, then a concrete first step.
- Always state the **free-tier** position and any **limit** that matters (`reference/limits.json`).
- Distinguish **quick wins** (a config toggle / one rule) from **projects** (a new build).
- Give a runnable starting point: a `wrangler` config sketch, a binding, or a docs quickstart link.
- When relevant, hand off: deep account analysis → `cf-optimizer` agent; "design my solution" →
  `cf-architect` agent; "what's my state / who changed X" → `cf-investigator` agent.

## Safety
Read-only by default. Never change the account from this skill. If a recommendation requires a
change, describe the guarded action + break-glass path (`docs/SAFETY.md`) and let the user run it.
